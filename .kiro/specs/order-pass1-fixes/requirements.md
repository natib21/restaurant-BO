# Order Module — Pass 1 Fix Requirements

## Overview

Three ship-blocking bugs in the order module must be resolved before this service can go to
production. Two are crashes (the endpoint dies immediately or Mongoose rejects the save); the
third is a direct financial-security hole. Nothing else in the module should be changed during
this pass.

---

## REQ-1 — `addItemToOrder` argument contract alignment

### Problem
`PATCH /api/v1/orders/:id/add-items` is completely non-functional. The controller handler
(`mutation.handler.js`) calls `OrderService.addItemToOrder` with four positional arguments:

```js
OrderService.addItemToOrder(orderId, validatedData.items, merchantId, req.user?._id)
```

The service method signature is `addItemToOrder(req)` — it expects a single Express `req`
object and reads `req.params.orderId`, `req.body.items`, and `req.merchant._id` from it.
As soon as the endpoint is hit, the call throws:

> `TypeError: Cannot read properties of undefined (reading 'orderId')`

Every `PATCH /:id/add-items` request crashes with a 500. The endpoint is dead.

### Requirements

**REQ-1.1** — The service method `OrderService.addItemToOrder` must be refactored to accept
explicit positional parameters `(orderId, items, merchantId, userId)` matching the controller's
existing call-site, **OR** the controller must be updated to pass a `req`-shaped object —
whichever produces the fewest cascading changes.

**REQ-1.2** — After the fix, `PATCH /:id/add-items` must return `200` with the updated order
document when called with valid `items` on an active order (`pending | accepted | preparing`).

**REQ-1.3** — After the fix, the service must still enforce merchant scoping (only the owning
merchant's orders are modifiable).

**REQ-1.4** — No other handler or service path that currently works must be broken by the
signature change.

---

## REQ-2 — Delivery status values added to the Order model enum

### Problem
The `OrderStateMachineService` correctly defines `out_for_delivery` and `delivered` as valid
order statuses in its `TRANSITIONS` map and writes timestamps for them
(`applyDeliveryStatusTimestamps`). However, the `Order` model's `status` field enum is:

```js
enum: ['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'canceled']
```

`out_for_delivery` and `delivered` are absent. When `transitionOrderStatus` tries to save an
order with either of these statuses, Mongoose throws a validation error:

> `Order validation failed: status: 'out_for_delivery' is not a valid enum value`

Any delivery order that reaches `ready → out_for_delivery` fails to save. Delivery order
support is entirely broken at the persistence layer.

### Requirements

**REQ-2.1** — The `Order` model `status` enum must include `out_for_delivery` and `delivered`
so that all statuses defined in `OrderStateMachineService.TRANSITIONS` are also valid at the
persistence layer.

**REQ-2.2** — The status filter enum in the order validators (`order.validators.js`) must also
be updated to include `out_for_delivery` and `delivered` so those statuses can be used in
list-orders query params without a validation error.

**REQ-2.3** — The two new enum values must not break existing dine-in or takeaway order flows.

---

## REQ-3 — Staff order price validation and inventory deduction

### Problem
`OrderService.staffPlaceOrder` has two independent security / correctness gaps:

#### 3a — Price trust
The method accepts `subtotal` and per-item `unitPrice` directly from the request body:

```js
const totalAmount = subtotal;            // straight from req body
const unitPrice   = item.unitPrice || 0; // straight from req body item
```

No database lookup is performed against `MenuItem`. Staff (or anyone who compromises a staff
JWT) can supply any `unitPrice`, including 0, and place orders at arbitrary prices. This is a
direct financial-integrity hole.

The correct path already exists: `OrderService.buildOrderItems(items, merchantId)` fetches
each `MenuItem` by ID, asserts it is orderable, and returns `unitPrice` from `menuItem.price`
in the database — the client-supplied price is never used.

#### 3b — Inventory skip
`staffPlaceOrder` never calls `InventoryService.resolveDeductionPlan` or
`InventoryService.deductForOrder`. Staff-placed orders do not deduct stock. Over time, actual
inventory diverges silently from system inventory.

Compare with `OrderTransactionService.executePlaceOrder` (the customer path): it calls
`buildOrderItems`, then `resolveDeductionPlan`, then `deductForOrder` — all inside a single
MongoDB transaction.

### Requirements

**REQ-3.1** — `staffPlaceOrder` must call `OrderService.buildOrderItems(items, merchantId)`
to resolve item prices. Client-supplied `unitPrice` and `subtotal` values must be ignored for
price computation (they may be kept in the request schema for UI prefill purposes but must not
be used to set financial fields on the order).

**REQ-3.2** — `staffPlaceOrder` must call `InventoryService.resolveDeductionPlan` before
committing the order, and `InventoryService.deductForOrder` within the same MongoDB session
as the order save — matching the pattern in `OrderTransactionService.executePlaceOrder`.

**REQ-3.3** — If inventory is insufficient for a staff-placed order, the order must not be
created and the caller must receive a clear `400` error.

**REQ-3.4** — The `subtotal` and `totalAmount` stored on the order must always be computed
server-side from the DB-resolved item prices, never from the client payload.

**REQ-3.5** — Existing customer order flows (`OrderTransactionService`) must be unaffected.

---

## Out of Scope (Pass 2)

The following are real bugs but are deliberately excluded from this pass:

- `cancelOrder` / state machine cancellability inconsistency
- `mergeOrders` marking canceled orders as "paid"
- `markAsPaid` concurrency / no-retry transaction
- `name` field dropped from order items
- Debug `console.log` leaking payloads to stdout
- Missing `out_for_delivery` / `delivered` in KDS ticket statuses
- No auto-cancel for stale pending orders
- Orphaned `Payment` model and dead handler exports
