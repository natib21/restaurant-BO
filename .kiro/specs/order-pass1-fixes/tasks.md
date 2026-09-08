# Order Module — Pass 1 Fix Tasks

Implementation order matters: Task 1 is purely additive (no logic change), Task 2 is a pure
rename with no logic change, Task 3 is the only task with real logic. Do them in this sequence
so that by the time Task 3 lands the model already accepts delivery statuses and the service
already has a clean `addItemToOrder` to verify against.

---

## Task 1 — Expand Order model and validator status enums

**Files:** `models/orderModel.js`, `src/modules/order/validators/order.validators.js`

**What to do:**

1. In `models/orderModel.js`, locate the `status` field definition:
   ```js
   enum: ['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'canceled'],
   ```
   Replace with:
   ```js
   enum: [
     'pending', 'accepted', 'preparing', 'ready',
     'out_for_delivery', 'delivered',
     'served', 'completed', 'canceled',
   ],
   ```

2. In `src/modules/order/validators/order.validators.js`, find the `orderFiltersSchema` (or
   equivalent list-filters schema) that validates the `status` query parameter. Add
   `'out_for_delivery'` and `'delivered'` to the same enum/array.

**Acceptance:**
- `order.status = 'out_for_delivery'; await order.save()` no longer throws a Mongoose
  validation error.
- A GET list-orders request with `?status=out_for_delivery` is not rejected by the Zod
  validator.
- All existing tests that rely on `pending`, `accepted`, `preparing`, `ready`, `served`,
  `completed`, `canceled` continue to pass.

---

## Task 2 — Fix `addItemToOrder` service signature

**File:** `src/modules/order/service/OrderService.js`

**What to do:**

Locate the `addItemToOrder` static method. Change its signature from:
```js
static async addItemToOrder(req) {
  const { orderId } = req.params;
  const { items }   = req.body;
  ...
  merchantScopedQuery({ _id: orderId, ... }, req)
  ...
  await OrderService.buildOrderItems(items, req.merchant._id)
```

To:
```js
static async addItemToOrder(orderId, items, merchantId, userId) {
  const order = await OrderRepository.findOne({
    _id: orderId,
    merchant: merchantId,
    status: { $in: ['pending', 'accepted', 'preparing'] },
  });
  ...
  await OrderService.buildOrderItems(items, merchantId)
```

Preserve all existing business logic:
- 404 if active order not found
- `buildOrderItems` call (prices always resolved from DB)
- `order.items.push(...newItems)`, `order.subtotal +=`, `order.totalAmount = order.subtotal`
- Reset to `accepted` if not already `pending`
- `await order.save()`
- `NotificationService.notifyOrderUpdated({ order })`

Do NOT change `mutation.handler.js` — the controller call-site already uses the target
four-argument signature.

**Acceptance:**
- `PATCH /api/v1/orders/:id/add-items` with a valid body and an active order returns `200`
  and the updated order.
- Calling with an order that belongs to a different merchant returns `404`.
- Calling with an order in `completed` or `canceled` status returns `404`.

---

## Task 3 — Fix `staffPlaceOrder` pricing and inventory

**File:** `src/modules/order/service/OrderService.js`

This is the largest change. Follow the customer path in `OrderTransactionService.executePlaceOrder`
as the reference implementation.

**What to do:**

Replace the body of `staffPlaceOrder` with the following structure:

### Phase 0 — pre-transaction validation (outside session)

```js
// 1. Guard calls (already exist — keep them)
assertValidStaffOrderType(orderType);
assertDineInTableId(orderType, tableId);

// 2. Resolve prices from DB — replaces the items.map(item => unitPrice = item.unitPrice) block
const { orderItems, subtotal } = await OrderService.buildOrderItems(items, merchantId);

// 3. Pre-flight inventory check
const deductionPlan = await InventoryService.resolveDeductionPlan(orderItems, merchantId);
```

At this point `subtotal` is server-computed. The client-supplied `subtotal` is discarded.

### Phase 1 — inside `session.withTransaction`

```js
const session = await mongoose.startSession();
let createdOrder;

try {
  await session.withTransaction(async () => {
    // Table validation (dine_in) — must be merchant-scoped to prevent cross-tenant table use
    let tableNumber = null;
    if (orderType === 'dine_in') {
      const table = await Table.findOne({ _id: tableId, merchant: merchantId, branch: branchId }).session(session);
      if (!table) throw new AppError('Table not found', 404);
      tableNumber = table.tableNumber;
    }

    // Generate orderNumber explicitly inside the transaction so the Counter.findOneAndUpdate
    // call is session-aware. This causes the pre-validate hook's early-exit guard
    // (`if (!this.isNew || this.orderNumber) return next()`) to skip its own un-sessioned
    // Counter call, matching the pattern in OrderTransactionService.executePlaceOrder.
    const orderNumber = await OrderTransactionService.generateOrderNumber(
      { merchant: merchantId, branch: branchId, orderType, tableNumber },
      session
    );

    // Create order with server-computed values
    const [order] = await Order.create(
      [{
        merchant: merchantId,
        branch: branchId,
        customerName: customerName || 'Walk-in Customer',
        customerPhone: customerPhone || null,
        table: orderType === 'dine_in' ? tableId : null,
        tableNumber,
        orderType,
        orderNumber,             // generated inside transaction — bypasses un-sessioned hook
        items: orderItems,       // from buildOrderItems — never from client
        subtotal,                // from buildOrderItems — never from client
        totalAmount: subtotal,   // same
        paymentStatus: 'unpaid',
        status: 'pending',
        notes: notes || '',
        location,
        placedBy: performedBy,
      }],
      { session }
    );
    createdOrder = order;

    // Update table status
    if (orderType === 'dine_in') {
      await Table.findByIdAndUpdate(tableId, { status: 'occupied' }, { session });
    }

    // Deduct inventory
    await InventoryService.deductForOrder(
      { merchantId, orderId: createdOrder._id, orderNumber: createdOrder.orderNumber, plan: deductionPlan, performedBy },
      session
    );

    // Notify
    await NotificationService.notifyStaffOrderPlaced({
      order: createdOrder,
      branchId,
      merchantId: createdOrder.merchant,
      tableNumber,
      placedByName: performedByName,
    }, session);
  });

  return createdOrder;
} catch (error) {
  if (error instanceof AppError) throw error;
  if (OrderTransactionService.isInventoryError(error)) {
    throw new AppError('Insufficient inventory for this order', 400);
  }
  logger.error('staff.order.place.failed', { merchantId, error: error.message });
  throw new AppError('Failed to create staff order', 500);
} finally {
  await session.endSession();
}
```

**What is removed:**
- `const totalAmount = subtotal;` (subtotal was from client)
- `const enrichedItems = items.map(item => ({ unitPrice: item.unitPrice || 0, ... }))` (price from client)
- `await order.save()` outside transaction

**Acceptance:**
- `POST /api/v1/orders/staff` with valid items stores the order with prices fetched from `MenuItem` — the
  client-supplied `unitPrice` is not stored.
- Sending `unitPrice: 0` for a menu item that has `price: 50` results in the stored order
  having `unitPrice: 50`.
- After a staff order is placed, ingredient stock is reduced (same as customer path).
- If inventory is insufficient, the endpoint returns `400` and no order document is created.
- Existing customer order creation (`OrderTransactionService.executePlaceOrder`) is unaffected.

---

## Verification checklist (run after all three tasks)

- [ ] `node -e "require('./models/orderModel')"` — no syntax errors
- [ ] `node -e "require('./src/modules/order/service/OrderService')"` — no syntax errors
- [ ] Existing passing tests still pass (`npm test -- --testPathPattern order`)
- [ ] Manual smoke: `PATCH /:id/add-items` on an active order → 200
- [ ] Manual smoke: POST staff order with tampered price → stored price matches DB price
- [ ] Manual smoke: POST staff order → ingredient stock decremented
- [ ] Manual smoke: delivery order status transition `ready → out_for_delivery` → no Mongoose error
