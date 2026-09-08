# Order Module — Pass 2 Fix Design

## Scope

Five confirmed bugs, in priority order. Each section covers the problem, the proposed fix,
exact files and lines touched, and edge cases to watch for. Same minimal-surface-area
principle as Pass 1: change only what the bug requires, leave everything else untouched.

---

## Fix 1 — mergeOrders revenue inflation

### Problem

`OrderService.mergeOrders()` sets `sourceOrder.paymentStatus = 'paid'` on every source
order it cancels (line 753). Source orders were never paid — this is just an internal
bookkeeping hack to prevent double-collection. Every report service that filters on
`paymentStatus: 'paid'` then counts these canceled, never-actually-paid orders as paid
revenue:

- `SalesReportService` — hard `$match: { paymentStatus: 'paid' }` → inflates gross/net revenue
- `ProfitabilityReportService` — same hard match → inflates revenue and COGS
- `CustomersReportService` — conditional `$sum` on `paymentStatus: 'paid'` → inflates per-customer spend
- `DeliveryReportService` — conditional `$sum` on `paymentStatus: 'paid'` → inflates delivery fees
- `ProductsReportService` — hard match → inflates items-sold counts
- `OrderService.getAllOrders` / `getMerchantAllOrders` / `getBranchOrders` aggregate stats
  — `$cond` on `paymentStatus: 'paid'` → inflates `paidOrders` counter

### Decision: keep `paymentStatus: 'unpaid'`, add a dedicated `canceledReason` marker

**Not** a new enum value. The `paymentStatus` enum is `['unpaid', 'paid', 'refunded']`.
Adding a `'merged'` value would require touching every report filter and every validator.
Instead: leave `paymentStatus` at `'unpaid'` (its correct value — the order was never paid)
and store the merge relationship in `canceledReason`.

The original intent of setting `'paid'` was to prevent re-payment of a merged source order.
That protection is achieved more correctly by the `status: 'canceled'` check —
`markAsPaid` can add a guard: "if order is canceled, reject payment." No such guard exists
today, so it also needs to be added (see edge cases below).

### Proposed change

**`src/modules/order/service/OrderService.js`** — `mergeOrders` method (~line 752):

```js
// Before
sourceOrder.status = 'canceled';
sourceOrder.paymentStatus = 'paid';
sourceOrder.canceledReason = 'Merged into another order';

// After
sourceOrder.status = 'canceled';
// paymentStatus intentionally left as 'unpaid' — the order was never paid.
// status:'canceled' prevents any future payment attempt.
sourceOrder.canceledReason = `Merged into order #${targetOrder.orderNumber}`;
```

That is the only change to `mergeOrders`. One line removed, one line updated (richer reason).

**`src/modules/order/service/OrderService.js`** — `markAsPaid` method:
Add a guard immediately after the existing `paymentStatus === 'paid'` check:

```js
// After existing "already paid" guard
if (order.status === 'canceled') {
  throw new AppError('Cannot mark a canceled order as paid', 400);
}
```

This closes the re-payment window that the now-removed `paymentStatus: 'paid'` hack was
guarding against.

### Files touched

| File | What changes |
|---|---|
| `src/modules/order/service/OrderService.js` | Remove `paymentStatus = 'paid'` line in `mergeOrders`; enrich `canceledReason`; add canceled-order guard in `markAsPaid` |

No report service changes needed. The fix makes them correct automatically — they stop
counting merged source orders because those orders now have `paymentStatus: 'unpaid'`.

### Edge cases

- **Existing merged orders in the DB already have `paymentStatus: 'paid'`.**
  This is a data-correctness issue for historical data. The code fix stops new inflation
  going forward; a one-time migration script to patch existing records is a separate
  decision (out of scope for this pass, but worth noting for operations).
- **Double-cancel guard.** If `mergeOrders` is called twice with the same source order ID,
  the second call's `find` query filters `status: { $ne: 'completed' }` — it will still
  match the already-canceled source order and merge it again. This is a pre-existing bug
  independent of the paymentStatus change; not in scope here.
- **The `markAsPaid` canceled guard** must come before the payment processing logic but
  after the `order not found` check, so the session is still open and can be aborted cleanly.
  In the `withTransaction` version (Fix 4), this is straightforward — just throw inside the
  transaction callback.

---

## Fix 2 — Debug log leaks

### Problem

Three separate files contain live `console.log` / `console.error` calls that leak PII or
financial data to stdout in production on every relevant request.

### Proposed changes — one per file

#### 2a. `src/modules/order/controller/handlers/placement.handler.js` line 83

```js
// Remove entirely — no replacement needed.
// The logger already records structured order placement events in the service.
console.log('staffPlaceOrder req', req.body, req.user, req.validatedBody);
```

This is the highest-severity leak: dumps `req.body` (customer name, phone, items) and
`req.user` (authenticated user object including role, email, `_id`) on every staff order.
Delete the line. No replacement — the service layer already emits a structured
`logger.info('staff.order.place.success', { orderId, merchantId, orderNumber })` after
the transaction completes.

#### 2b. `src/modules/kitchen/service/KitchenTicketService.js` lines 69–71

```js
// Remove all three — no replacement needed.
console.log('DEBUG order.items[0]:', JSON.stringify(order.items[0]));
console.log('DEBUG order.items[0]._id:', order.items[0]?._id);
console.log('DEBUG order.items[0]._id type:', typeof order.items[0]?._id);
```

These were debug lines added to investigate a `_id` availability question during KDS
development. The issue is resolved (Phase 0 added `{ _id: true }` to `orderItemSchema`).
Delete all three. No replacement needed — the ticket creation flow already has
`logger.info('kds.ticket.created', { ticketId, orderId, ... })` per ticket.

#### 2c. `src/modules/order/service/OrderService.js` line 78

```js
// Before — raw console.error bypassing structured logger
console.error('Error calculating menu item cost:', error);

// After — structured logger, consistent with the rest of the service
logger.error('order.cogs.calculation_failed', { message: error.message });
```

`logger` is already imported in `OrderService.js` (added in Pass 1). The `error` object
itself should not be logged in full (could contain stack traces with internal paths);
logging `error.message` is sufficient for diagnosis. The `return null` that follows is
preserved — the COGS failure is non-fatal.

### Files touched

| File | Line(s) | Change |
|---|---|---|
| `src/modules/order/controller/handlers/placement.handler.js` | 83 | Delete line |
| `src/modules/kitchen/service/KitchenTicketService.js` | 69–71 | Delete 3 lines |
| `src/modules/order/service/OrderService.js` | 78 | Replace `console.error` with `logger.error` |

### Edge cases

- No logic is removed — only the logging calls. The handlers and services continue to
  function identically.
- The `logger` import in `OrderService.js` was added in Pass 1. Confirm it is present at
  the top of the file before running.
- `KitchenTicketService.js` uses `logger` throughout (e.g., `logger.info`, `logger.warn`,
  `logger.debug` already present). No new import needed.

---

## Fix 3 — `name` field missing from order items

### Problem

`orderItemSchema` in `models/orderModel.js` has no `name` field. `OrderService.buildOrderItems`
correctly sets `name: menuItem.name` on the in-memory item object, but Mongoose silently
strips any field not declared in the schema on save. The name is never persisted.

Downstream breakage:
- `formatOrderByNumberPayload` (DTO) returns `name: undefined` for every item in the
  "get order by number" response — clients see blank item names.
- The analytics top-foods aggregation reads `$items.name` and gets `null`, partially
  recovering via `$ifNull` to a live `$lookup`, but failing silently for deleted items.

### Proposed change

**`models/orderModel.js`** — `orderItemSchema` definition (~lines 9–19):

```js
// Before
const orderItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'Menu', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0, default: null },
    totalPrice: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: true }
);

// After — add name field as a snapshot of the menu item name at order time
const orderItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'Menu', required: true },
    name: { type: String, trim: true },   // ← snapshot of menu item name at order time
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0, default: null },
    totalPrice: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: true }
);
```

`name` is **not** `required` — old orders will simply have `name: undefined`, which is
correct and unavoidable. No migration needed. New orders placed through either the customer
or staff path (both go through `buildOrderItems`) will have `name` populated from
`menuItem.name`.

`buildOrderItems` already sets `name: menuItem.name` in the array it returns. No change
needed in `OrderService.js`.

### Files touched

| File | What changes |
|---|---|
| `models/orderModel.js` | Add `name: { type: String, trim: true }` to `orderItemSchema` |

### Edge cases

- `menuItem.name` in `buildOrderItems` is a localized object `{ en: '...', am: '...' }` —
  not a plain string — because `MenuItem.name` uses `localizedTextSchema`. The stored
  `name` field will be a Mongoose subdocument `{ en, am }`, not a plain string.
  The `orderItemSchema` field should therefore be typed as `Schema.Types.Mixed` (or a
  matching inline subdocument) rather than `String`, or the code in `buildOrderItems` should
  snapshot just the primary locale: e.g., `name: menuItem.name?.en || menuItem.name`.

  **Recommended resolution:** Store the primary locale snapshot as a plain string:
  ```js
  name: { type: String, trim: true }
  ```
  And in `buildOrderItems`, change:
  ```js
  name: menuItem.name,                     // was: localized object
  // to:
  name: menuItem.name?.en || menuItem.name, // plain string, primary locale
  ```
  This keeps the schema simple (a String is easier to render and index than a subdocument)
  and is consistent with how `KitchenTicketService` stores `menuItemName` as a plain String.
  If multilingual item names on stored orders are needed later, that is a separate schema
  evolution.

  This means `buildOrderItems` in `OrderService.js` **does** need a one-line change to
  flatten the name, despite the initial assessment that it didn't. Both files are touched.

- **Existing orders** will have `name: undefined`. `formatOrderByNumberPayload` already
  reads `item.name` directly. After this fix, new orders will show names; old orders will
  still show `undefined` / `null`. This is the correct and acceptable behavior — no migration.

- The `name` field is intentionally `not required` so existing orders with no name pass
  Mongoose validation if they are modified after this change.

### Files touched (revised)

| File | What changes |
|---|---|
| `models/orderModel.js` | Add `name: { type: String, trim: true }` to `orderItemSchema` |
| `src/modules/order/service/OrderService.js` | Change `name: menuItem.name` to `name: menuItem.name?.en \|\| String(menuItem.name)` in `buildOrderItems` |

---

## Fix 4 — markAsPaid transaction safety

### Problem

`OrderService.markAsPaid()` is the only transactional method in the order module using the
hand-rolled `session.startTransaction() / commitTransaction() / abortTransaction()` pattern.
Every other method (`staffPlaceOrder`, `OrderStateMachineService.transitionOrderStatus`,
`OrderTransactionService.executePlaceOrder`, etc.) uses `session.withTransaction()`, which:
- Auto-retries on `TransientTransactionError` (write conflicts, replica-set elections)
- Auto-retries the commit on `UnknownTransactionCommitResult`

`markAsPaid` has no retry logic. Under concurrent load or during a replica-set failover, a
write conflict throws a raw error directly to the client instead of being silently retried.

### Proposed change — mechanical wrapper swap

Replace the outer manual transaction scaffold with `session.withTransaction()`. All business
logic inside stays exactly the same. The early-abort calls (`await session.abortTransaction()`
before explicit throws) are removed because `withTransaction` handles abort automatically
when the callback throws.

```js
// Before — structure only
static async markAsPaid(req) {
  const { id } = req.params;
  const { paymentMethod, bankName, image } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();                         // ← manual start

  try {
    // ... business logic ...
    // with two early session.abortTransaction() calls for 404/400 guards

    await session.commitTransaction();                // ← manual commit
    return order;
  } catch (error) {
    await session.abortTransaction();                 // ← manual abort
    throw error;
  } finally {
    session.endSession();
  }
}

// After — structure only
static async markAsPaid(req) {
  const { id } = req.params;
  const { paymentMethod, bankName, image } = req.body;

  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {       // ← auto-retry wrapper
      // ... same business logic, minus the two early abortTransaction() calls ...
      // Throwing AppError inside the callback auto-aborts the transaction.
      order = foundOrder;
    });

    return order;
  } finally {
    await session.endSession();
  }
}
```

The two early `await session.abortTransaction()` calls (before the 404 and 400 throws) are
removed. `withTransaction` aborts automatically when the callback throws any error. The
business logic — payment fields, status promotion, loyalty points, table release,
notification — is preserved line-for-line inside the callback.

Note: `order` must be declared outside the `withTransaction` callback so it can be returned
after the transaction completes (same pattern used in `staffPlaceOrder` with `createdOrder`).

### Files touched

| File | What changes |
|---|---|
| `src/modules/order/service/OrderService.js` | Wrap `markAsPaid` body in `session.withTransaction()`; remove two manual `abortTransaction()` calls; hoist `order` variable declaration above `withTransaction` |

### Edge cases

- **`withTransaction` retry behavior**: if a `TransientTransactionError` occurs,
  `withTransaction` re-runs the entire callback. The callback reads `order` from the DB at
  the start of each attempt, so re-reads are safe. The loyalty point increment
  (`req.customer.loyalty.points += points`) is computed from the in-memory `req.customer`
  object, not re-fetched — a retry would apply the increment twice. To be safe, the loyalty
  block should re-fetch `req.customer` inside the callback (or use an atomic `$inc` update
  instead of the in-memory pattern). This is a pre-existing correctness concern exposed by
  adding retry; flag it as a known limitation in the implementation.
- **`session.endSession()` in `finally`**: match the pattern used in `staffPlaceOrder` —
  `await session.endSession()` (awaited) rather than the current `session.endSession()`
  (not awaited).
- The canceled-order guard from Fix 1 must be placed **inside** the `withTransaction`
  callback, not outside it, so it participates in the atomic read.

---

## Fix 5 — Order cancellation route + guard fix

### Problem

Two separate issues in one bug:

1. **Missing route**: `PATCH /:id/cancel` is never registered in `orders.routes.js`. The
   `cancelOrder` handler exists and is exported from the handlers index, but there is no
   route for it. Cancellation only reaches `cancelOrder` if... it can't — the route doesn't
   exist. Staff can currently cancel orders only via `PATCH /:id/status` with
   `status: 'canceled'`, which bypasses the customer-vs-staff distinction entirely.

2. **Overly restrictive guard**: `cancelOrder()` blocks staff from canceling `preparing`,
   `ready`, or `out_for_delivery` orders — but the state machine explicitly permits those
   transitions for the appropriate roles (`preparing->canceled` for kitchen/waiter/admin,
   `ready->canceled` for waiter/admin, `out_for_delivery->canceled` for waiter/admin).
   The guard in `cancelOrder` is stricter than the state machine without reason.

### Design decision: keep PATCH /:id/status as an alternate path

**Recommendation: leave `PATCH /:id/status` working for `status: 'canceled'`**, and add
the dedicated `PATCH /:id/cancel` route alongside it. Rationale:

- Removing cancellation from `PATCH /:id/status` would be a breaking API change for any
  client already using it.
- Having both paths is not inconsistent — the status endpoint covers all transitions
  generically; the cancel endpoint adds a richer customer-vs-staff distinction and a
  dedicated `reason` field.
- The state machine is the single source of truth for what is allowed. Both paths go through
  it; the `cancelOrder` pre-flight simply adds role-specific UX messaging on top.

### Proposed changes

#### 5a. Register the route — `src/modules/order/orders.routes.js`

Import `cancelOrder` and add the route. The route must be placed before `/:id` (the
catch-all GET) to avoid being shadowed:

```js
// Add to the destructured import from ./controller/order.controller:
const {
  ...
  cancelOrder,   // ← add
} = require('./controller/order.controller');

// Add after the existing PATCH /:id/add-items line:
router.patch('/:id/cancel', cancelOrder);
```

No validator is needed for `cancelOrder` — the body is `{ reason?: string }` which the
service already handles with a default value. Adding an optional-string Zod schema is
a minor hardening if desired but not required for correctness.

#### 5b. Fix the status guard — `src/modules/order/service/OrderService.js`

The current staff guard in `cancelOrder`:

```js
// Before — overly restrictive: only pending/accepted
if (!['pending', 'accepted'].includes(existing.status) && req.user) {
  throw new AppError(`Order cannot be canceled once it is ${existing.status}`, 400);
}
```

Replace with a guard that matches the state machine's actual permissions. The state machine
allows cancellation from `pending`, `accepted`, `preparing`, `ready`, and
`out_for_delivery`. The only restriction is role-based (kitchen can cancel `preparing`,
waiter/admin can cancel `ready` and `out_for_delivery`). That role check is already handled
by the state machine's `assertRolePermission` call inside `transitionOrderStatus`.

The pre-flight guard in `cancelOrder` should only enforce the **outer boundary** —
i.e., completed and already-canceled orders cannot be canceled — and leave the per-status
role enforcement to the machine:

```js
// After — guard only against terminal statuses; roles enforced by state machine
if (existing.status === 'canceled') {
  return { order: existing, alreadyCanceled: true };
}

if (existing.status === 'completed') {
  throw new AppError('Order is already completed and cannot be canceled', 400);
}

// Customer-specific restriction: customers can only cancel while pending
if (!req.user && existing.status !== 'pending') {
  throw new AppError('Customers can only cancel orders while they are still pending', 400);
}

// For staff: the state machine enforces per-status role permissions.
// No additional status gate here — if the machine allows it for this role, it's allowed.
```

The `if (existing.status === 'completed')` check becomes redundant once the early
`alreadyCanceled` guard returns first (completed is not canceled), but it provides a
clearer error message than the state machine's generic transition error, so it is kept.

Note: the two existing checks are currently in the wrong order (customer check before
`alreadyCanceled` check). The revised order above fixes this too.

### Files touched

| File | What changes |
|---|---|
| `src/modules/order/orders.routes.js` | Import `cancelOrder`; add `router.patch('/:id/cancel', cancelOrder)` |
| `src/modules/order/service/OrderService.js` | Replace the staff status pre-flight guard in `cancelOrder` with the terminal-status-only guard shown above |

### Edge cases

- **Route ordering**: `/:id/cancel` must appear before `/:id` in the router file. The
  current file already has all parametric routes before `router.get('/:id', getOrderById)`.
  The new `PATCH /:id/cancel` sits alongside `PATCH /:id/status` and `PATCH /:id/add-items`,
  which is correct.
- **`cancelOrder` is not currently imported** in `orders.routes.js` — it is exported from
  the handlers index via `...mutationHandlers`, which means it flows through
  `order.controller.js` re-export. Confirm `cancelOrder` is in the destructured import list
  in the routes file before adding the route registration. It is not currently listed, so
  it must be added to the destructure.
- **State machine role enforcement for staff**: after removing the status gate from
  `cancelOrder`, a kitchen staff member (role `kitchen`) hitting `PATCH /:id/cancel` on a
  `ready` order will be blocked by the state machine's `ready->canceled` permission
  (`['waiter', 'admin', 'superAdmin']` — kitchen is not in this list). This is correct
  business behavior and is enforced automatically.
- **`PATCH /:id/status` with `status: canceled` still works**: leaving this path open
  means a client can cancel without providing a `reason`. This is an existing behavior,
  not introduced by this fix. The cancel route adds the option of a `reason`; it doesn't
  mandate it.

---

## Files changed — complete list

| File | Fix(es) | Changes |
|---|---|---|
| `src/modules/order/service/OrderService.js` | 1, 2c, 3, 4, 5b | Remove `paymentStatus='paid'` in `mergeOrders`; enrich `canceledReason`; add canceled guard in `markAsPaid`; replace `console.error` with `logger.error` in `calculateMenuItemCost`; fix `name` snapshot in `buildOrderItems`; wrap `markAsPaid` in `withTransaction`; fix `cancelOrder` guard |
| `models/orderModel.js` | 3 | Add `name` field to `orderItemSchema` |
| `src/modules/order/orders.routes.js` | 5a | Import `cancelOrder`; register `PATCH /:id/cancel` route |
| `src/modules/order/controller/handlers/placement.handler.js` | 2a | Delete `console.log` line 83 |
| `src/modules/kitchen/service/KitchenTicketService.js` | 2b | Delete 3 `console.log` DEBUG lines (69–71) |

No report services are touched. No validators are touched (the existing
`updateOrderStatusSchema` already accepts `'canceled'` as a valid status, and
`cancelOrder`'s body `{ reason?: string }` needs no dedicated schema for correctness).
