# Order Module — Pass 1 Fix Design

## Scope recap

Three isolated fixes. Each is self-contained; they do not depend on one another and can be
implemented in any order. The design avoids touching anything outside the affected files.

---

## Fix 1 — `addItemToOrder` signature alignment

### Decision: refactor the service, not the controller

The controller call-site is already correct in style (`orderId, items, merchantId, userId`) and
matches every other handler in the file. Changing it to build a fake `req` object just to satisfy
the service would be backwards. The service should be updated to match.

### Current vs target signature

| | Before | After |
|---|---|---|
| Service | `addItemToOrder(req)` | `addItemToOrder(orderId, items, merchantId, userId)` |
| Controller | `addItemToOrder(orderId, items, merchantId, req.user?._id)` | unchanged |

### Service method — what changes

```
src/modules/order/service/OrderService.js  →  addItemToOrder method
```

Replace internal reads of `req.params`, `req.body`, and `req.merchant._id` with the four
explicit parameters. The business logic (repository lookup, `buildOrderItems`, push, save,
notification) stays exactly the same.

Before:
```js
static async addItemToOrder(req) {
  const { orderId } = req.params;
  const { items }   = req.body;
  const order = await OrderRepository.findOne(
    merchantScopedQuery({ _id: orderId, ... }, req)
  );
  const { orderItems, subtotal } = await OrderService.buildOrderItems(items, req.merchant._id);
  ...
}
```

After:
```js
static async addItemToOrder(orderId, items, merchantId, userId) {
  const order = await OrderRepository.findOne({
    _id: orderId,
    merchant: merchantId,
    status: { $in: ['pending', 'accepted', 'preparing'] },
  });
  const { orderItems, subtotal } = await OrderService.buildOrderItems(items, merchantId);
  ...
}
```

`merchantScopedQuery` used `req` to attach `merchant`. We inline the equivalent filter directly,
which is simpler and removes the `req` dependency from this method entirely.

### Impact surface

Only `mutation.handler.js` calls `addItemToOrder`. No other file is affected.

---

## Fix 2 — Order model enum expansion

### Decision: add values to both the model enum and the validator enum

Two files need updating — they must stay in sync.

### File 1 — `models/orderModel.js`

```
status.enum  →  add 'out_for_delivery', 'delivered'
```

```js
// Before
enum: ['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'canceled']

// After
enum: [
  'pending', 'accepted', 'preparing', 'ready',
  'out_for_delivery', 'delivered',
  'served', 'completed', 'canceled'
]
```

Order reflects the logical workflow (delivery statuses sit between `ready` and `completed`).

### File 2 — `src/modules/order/validators/order.validators.js`

The `orderFiltersSchema` has a `status` field validated against a Zod enum. Add the two new
values there too so list-orders queries work for delivery statuses.

### No migration required

Mongoose enums are validated on write, not on existing documents. Adding new enum values is a
purely additive change; existing documents are unaffected.

---

## Fix 3 — Staff order price validation + inventory deduction

### Decision: route `staffPlaceOrder` through `buildOrderItems` + `InventoryService`, wrapped in a transaction

This mirrors the customer order path (`OrderTransactionService.executePlaceOrder`) exactly. The
goal is parity — not a new abstraction.

### Execution plan

#### Phase 0 — pre-transaction (read-only)

```
buildOrderItems(items, merchantId)
  → resolves MenuItem prices from DB
  → returns { orderItems, subtotal }

InventoryService.resolveDeductionPlan(orderItems, merchantId)
  → walks ingredient recipes
  → returns deductionPlan (array of { ingredientId, totalQuantity })
  → pure read, no writes
```

Both calls happen before the session opens (matching the customer path), so if either fails
(item not found, item not orderable, ingredient recipe missing) we fail fast without holding a
transaction open.

#### Phase 1 — inside `session.withTransaction`

```
1. Validate table (dine_in) inside session
2. Order.create([{ ...server-computed fields }], { session })
   - uses orderItems and subtotal from buildOrderItems
   - never uses client-supplied unitPrice or subtotal
3. InventoryService.deductForOrder({ merchantId, orderId, orderNumber, plan, performedBy }, session)
4. NotificationService.notifyStaffOrderPlaced({ ... }, session)   (already exists)
```

#### Error handling

| Error type | Behaviour |
|---|---|
| Item not found / not orderable | 404 / 400 thrown in Phase 0, before session |
| Insufficient inventory | `AppError(400)` from `isInventoryError` check in catch |
| Unexpected DB error | `AppError(500)` |
| Session failure | session.endSession() in finally |

### What is removed from `staffPlaceOrder`

- `const totalAmount = subtotal;` — replaced by server-computed value
- `items.map(item => ({ unitPrice: item.unitPrice || 0, ... }))` — replaced by `buildOrderItems`
- Direct `await order.save()` outside any transaction — replaced by `Order.create([...], { session })`

### What is preserved

- All existing parameter extraction (`tableId`, `orderType`, `customerName`, etc.)
- Table lookup and `tableNumber` derivation
- `Table.findByIdAndUpdate(tableId, { status: 'occupied' })` for dine-in
- `NotificationService.notifyStaffOrderPlaced` call
- `assertValidStaffOrderType` and `assertDineInTableId` guard calls

### Client-supplied price fields

The Zod validator currently accepts `subtotal` and per-item `unitPrice` from the request. These
can stay in the schema (useful for POS UI prefill / display), but the service must discard them
for any financial computation. No validator change is required for this fix — we only change what
the service does with those values.

---

## Files changed — complete list

| File | Change |
|---|---|
| `models/orderModel.js` | Add `out_for_delivery`, `delivered` to `status.enum` |
| `src/modules/order/validators/order.validators.js` | Add same two values to `orderFiltersSchema` status enum |
| `src/modules/order/service/OrderService.js` | Refactor `addItemToOrder` signature; refactor `staffPlaceOrder` to use `buildOrderItems` + transaction + inventory deduction |

No other files are touched.
