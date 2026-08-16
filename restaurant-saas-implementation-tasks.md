# Implementation Tasks — Restaurant SaaS Extensions

Companion to `restaurant-saas-architecture-roadmap.md`. Each task is scoped to be independently completable and verifiable — feed them to Kiro in order, one at a time or in small batches within a phase. Tasks inside a phase can run in any order unless a dependency is noted; phases themselves are sequential except where marked "parallel-safe."

Checkbox format so Kiro (or you) can track progress directly in this file.

---

## Phase 0 — Delivery loose ends (small, do first, clears the board)

- [ ] 0.1 Add `location`, `deliveryFee`, `deliveryNotes` refinement to `placeOrderStaffSchema` in `order.validators.js` — require `location.coordinates`, `location.city`, and `customerPhone` when `orderType === 'delivery'` (schema given in prior conversation turn)
- [ ] 0.2 Update `OrderService.staffPlaceOrder` to read `deliveryFee` and `deliveryNotes` off the incoming `data` and pass them into `OrderRepository.newOrder(...)` — currently silently dropped
- [ ] 0.3 Add `out_for_delivery`, `delivered` to `status` enum in `models/Order.js`
- [ ] 0.4 Add `outForDeliveryAt: Date`, `deliveredAt: Date` fields to `models/Order.js`
- [ ] 0.5 Add `out_for_delivery`, `delivered` to `updateOrderStatusSchema`'s `z.enum([...])` in `order.validators.js`
- [ ] 0.6 Add missing role-permission entries to `TRANSITION_ROLE_PERMISSIONS` in `OrderStateMachineService.js`: `ready->out_for_delivery`, `out_for_delivery->delivered`, `out_for_delivery->canceled`, `delivered->completed`, plus the two pre-existing gaps `preparing->canceled`, `ready->canceled`
- [ ] 0.7 Add timestamp-setting lines to `applyStatusTimestamps` for `out_for_delivery` and `delivered`
- [ ] 0.8 Fix `sendOrderStatusUpdate`'s status-text map in `telegramService.js` — replace `placed`/`confirmed`/`cancelled` keys with the real enum values (`pending`/`accepted`/`preparing`/`ready`/`served`/`out_for_delivery`/`delivered`/`completed`/`canceled`)
- [ ] 0.9 Add a `buildMapsLink(order)` helper (pure function, e.g. in `order.controller.js` or a small `delivery.utils.js`) that returns `https://maps.google.com/?q={lat},{lng}` from `order.location.coordinates`; attach `mapsUrl` to the order response for delivery orders
- [ ] 0.10 Decision + implementation: does `placeOrderCustomerSchema` (table-session/Mini App ordering) get delivery support in v1, or does delivery stay staff-only? If yes — mirror task 0.1's refinement onto the customer schema and wire the same fields through `placeOrder`/`OrderService.placeOrder` (find/create equivalent to `staffPlaceOrder`)
- [ ] 0.11 Manual test pass: place a staff delivery order end-to-end, walk it through `pending → accepted → preparing → ready → out_for_delivery → delivered → completed`, confirm each transition succeeds and Telegram message text is correct at each step

---

## Phase 1 — Advanced Reporting

**Model/schema work**
- [ ] 1.1 Add `recipe: [{ ingredient: ObjectId ref Ingredient, quantity: Number }]` to `MenuItem` model
- [ ] 1.2 Add `unitCost: Number` to `orderItemSchema` in `models/Order.js`
- [ ] 1.3 Compute and snapshot `unitCost` at order-placement time in both `OrderService.buildOrderItems` and `OrderService.staffPlaceOrder` — `Σ(recipe[i].quantity × ingredient.costPerUnit)`; leave `null` if the menu item has no recipe

**Module scaffolding**
- [ ] 1.4 Create `src/modules/reports/` directory structure: `reports.routes.js`, `controller/report.controller.js`, `service/` (one file per report type), `validators/report.validators.js`
- [ ] 1.5 Write shared Zod query schema (`dateFrom`, `dateTo` required; `branchId`, `groupBy`, `page`, `limit`, `format` optional) in `report.validators.js`
- [ ] 1.6 Wire `reports.routes.js` into the global route aggregator with `protect → restrictTo() → requireFeature('reports')` middleware chain

**Per-report endpoints (each = model + controller + route, verify against real data before moving to the next)**
- [ ] 1.7 `GET /api/v1/reports/sales` — gross/net revenue, discounts, taxes, refunds (stub refunds as 0 until Phase 3 lands), payment-method breakdown, AOV
- [ ] 1.8 `GET /api/v1/reports/orders` — counts by status, cancellation rate, avg time-to-ready
- [ ] 1.9 `GET /api/v1/reports/products` — top-selling / low-performing items, category performance
- [ ] 1.10 `GET /api/v1/reports/customers` — new vs. returning, spend distribution, top customers
- [ ] 1.11 `GET /api/v1/reports/delivery` — delivery volume, fee revenue, avg duration (`outForDeliveryAt`→`deliveredAt`, depends on Phase 0)
- [ ] 1.12 `GET /api/v1/reports/profitability` — COGS, gross profit, net margin (depends on 1.1–1.3)
- [ ] 1.13 `GET /api/v1/reports/staff` — orders per waiter/kitchen staff, avg turnaround
- [ ] 1.14 `GET /api/v1/reports/inventory` — re-expose existing Inventory aggregations with date-range filter added

**Export**
- [ ] 1.15 Sync CSV export for the `summary` object on each endpoint (`?format=csv`)
- [ ] 1.16 Async export job: `POST /api/v1/reports/exports` → `202 { jobId }`; background job writes file, saves via existing Files module; `GET /api/v1/reports/exports/:jobId` for status/download
- [ ] 1.17 `report:export:ready` Socket.IO event on `user:{userId}` room when async export completes
- [ ] 1.18 Enforce 366-day max range on JSON/dashboard endpoints (400 if exceeded, exempt for `/exports`)

**Email receipts (bundle here — cheap add-on per roadmap §9)**
- [ ] 1.19 Add `NotificationService.sendEmail(...)` reusing the existing mailer from the forgot-password flow
- [ ] 1.20 Hook order-completion + refund-issued events to send a receipt email when the customer has an email on file

---

## Phase 2 — Audit Logging (small, unblocks safe iteration on Phase 3/4)

- [ ] 2.1 Create `AuditLog` model per the roadmap §2 schema (`merchant`, `branch`, `actorId`, `actorType`, `actorRoleName`, `action`, `entityType`, `entityId`, `before`, `after`, `metadata`, `ip`, `userAgent`, `createdAt` — no `updatedAt`)
- [ ] 2.2 Add indexes: `{ merchant: 1, createdAt: -1 }`, `{ merchant: 1, entityType: 1, entityId: 1 }`
- [ ] 2.3 Create `AuditLogService.log(...)` — single write method, no update/delete methods exposed anywhere in the module
- [ ] 2.4 Hook into `OrderStateMachineService.transitionOrderStatus` — log every status transition (action: `order.status_changed`, before/after = status pair)
- [ ] 2.5 Hook into `cancelOrder` — log with reason (action: `order.cancelled` / `order.voided`)
- [ ] 2.6 Hook into merchant-role/user role updates (`PATCH /merchant/roles/:id`, `PATCH /merchant/users/:id`) — log role/permission changes
- [ ] 2.7 Hook into menu price updates and `toggle-availability`/`archive` — log price/availability changes
- [ ] 2.8 `GET /api/v1/audit-logs` (SUPER-ADMIN: all merchants; merchant users: own merchant only via `merchantScopedQuery`) with `entityType`, `entityId`, `dateFrom`, `dateTo`, `actorId` filters
- [ ] 2.9 Cron job: purge operational-only audit logs (logins, etc.) older than 180 days; leave financial-relevant actions untouched

---

## Phase 3 — Refund / Void

**Model**
- [ ] 3.1 Create `Payment` model per roadmap §4 schema (`order`, `amount`, `method`, `status`, `gatewayReference`, `payerLabel`, `items[]`, `idempotencyKey`, `recordedBy`, `createdAt`)
- [ ] 3.2 Add unique compound index `{ merchant: 1, order: 1, idempotencyKey: 1 }` on `Payment`
- [ ] 3.3 Create `Refund` model per roadmap §3 schema (`order`, `payment`, `amount`, `reason`, `status`, `gatewayRefundReference`, `initiatedBy`, `approvedBy`, `createdAt`)
- [ ] 3.4 Add `'refunded'`, `'partially_refunded'` to `Order.paymentStatus` enum

**Idempotency middleware (build once, reused by Split Billing too — roadmap §8)**
- [ ] 3.5 Create `common/middleware/idempotency.middleware.js` — reads an `idempotencyKey` from request body/header, short-circuits with the cached response if that key was already processed successfully

**Service + endpoints**
- [ ] 3.6 `RefundService.createRefund(...)` — transaction-wrapped (mirror the `markAsPaid` transaction pattern): validates refund amount ≤ payment amount, creates `Refund` record with `status: 'pending'`, updates `Order.paymentStatus`
- [ ] 3.7 `POST /api/v1/order/:id/refunds` — staff-initiated refund request, `protect → restrictTo() → requireFeature('orders')`
- [ ] 3.8 `POST /api/v1/payments/webhook/:provider` — gateway confirms refund completion, updates `Refund.status → 'completed'`, mirrors the existing `/subscriptions/webhook/:provider` pattern
- [ ] 3.9 Distinct "reverse payment marking" action for staff-error correction (task 3.6 variant, `reason` required, explicitly logged via `AuditLogService` — do not reuse the customer-refund code path for this)
- [ ] 3.10 Wire `AuditLogService.log(...)` calls into every refund state change (created, completed, failed)
- [ ] 3.11 Confirm `cancelOrder` (existing) is the only code path needed for "void" — no new model, just verify staff-facing copy/docs call it "void" pre-payment

---

## Phase 4 — Split Billing (depends on Phase 3's `Payment` model)

- [ ] 4.1 Add `splitStatus: 'none' | 'in_progress' | 'complete'` field to `Order` model (derived/cached, not authoritative — recompute from `Payment` sum on read)
- [ ] 4.2 `PaymentService.createPayment(...)` — transaction-wrapped: re-reads current paid sum inside the transaction, rejects if `amount > remainingBalance`, honors `idempotencyKey` via task 3.5's middleware
- [ ] 4.3 `POST /api/v1/order/:id/payments` — supports equal-split, item-based, and partial payment via the same generic `Payment` shape (see roadmap §4 for how each scenario maps)
- [ ] 4.4 `GET /api/v1/order/:id/payments` — list all payments against an order, with running `remainingBalance`
- [ ] 4.5 Recompute and persist `Order.paymentStatus` (`unpaid`/`partial`/`paid`) inside the same transaction as every `Payment` write
- [ ] 4.6 Emit a Socket.IO event (e.g. `order:payment-recorded`) on the order's existing room after each payment lands, so a multi-device split-bill UI updates live
- [ ] 4.7 Wire `Refund.payment` (from Phase 3) to support refunding one specific split payment without touching the others — verify with a test: 2 payments on one order, refund only the second, confirm the first is untouched
- [ ] 4.8 Wire `AuditLogService.log(...)` into payment creation

---

## Phase 5 — KDS (parallel-safe — no dependency on Phases 1–4)

**Models**
- [ ] 5.1 Create `KitchenStation` model (`merchant`, `branch`, `name`, `assignedRole`)
- [ ] 5.2 Add `station: ObjectId ref KitchenStation` to `MenuItem` model
- [ ] 5.3 Create `KitchenTicket` model (`order`, `station`, `branch`, `status`, `items: [KitchenTicketItem]`, `priority`, `fireTime`, `createdAt`)
- [ ] 5.4 Define `KitchenTicketItem` sub-schema (`menuItem`, `quantity`, `notes`, `modifiers`, `status`)

**State machine (mirror `OrderStateMachineService` shape exactly)**
- [ ] 5.5 Create `KitchenTicketStateMachineService` with `TRANSITIONS` map: `PENDING → ACCEPTED → PREPARING → READY → COMPLETED`, plus `CANCELLED` from any non-terminal state
- [ ] 5.6 Define `TICKET_TRANSITION_ROLE_PERMISSIONS` (kitchen/station staff + admin/superAdmin)
- [ ] 5.7 Implement `transitionTicketStatus(...)` following the same transaction + history-append + timestamp pattern as `OrderStateMachineService.transitionOrderStatus`

**Order ↔ Ticket integration**
- [ ] 5.8 On order placement, generate one `KitchenTicket` per distinct station present among the order's items (group `items[]` by `menuItem.station`)
- [ ] 5.9 Add aggregation hook: `Order.status → 'ready'` once all of its `KitchenTicket`s are `'ready'` (listener or explicit check in `OrderStateMachineService`)

**Routes + Socket.IO**
- [ ] 5.10 `KitchenTicket` CRUD/status routes (`GET /kitchen/tickets`, `PATCH /kitchen/tickets/:id/status`, filtered by station/branch)
- [ ] 5.11 Add `branch:{branchId}:station:{stationId}` room join to `setup:session` handler, alongside existing room joins
- [ ] 5.12 Emit `kds:ticket-created`, `kds:ticket-accepted`, `kds:item-ready`, `kds:ticket-ready`, `kds:ticket-cancelled` to the appropriate station room

**Printing (optional layer — verify KDS works fully without it first)**
- [ ] 5.13 Create `PrintJob` model (`ticket`, `station`, `printer`, `status`, `retryCount`)
- [ ] 5.14 Emit a `kds:print-job-queued` event consumable by an external local print agent (agent itself is out of scope for backend work — just the queue + event)

---

## Deferred — do not start without explicit go-ahead

- [ ] D.1 Reservations module (roadmap §7) — build only once a specific merchant requests it
- [ ] D.2 Offline Phase 2 (order queue + sync) — build only once a specific merchant requests it
- [ ] D.3 SMS notifications — build only once a specific merchant requests it

---

## Notes for whoever (or whatever) executes these

- Every new endpoint follows the existing pipeline convention: `protect → restrictTo() → requireFeature(...) → validate(schema) → controller`.
- Every new financial write (`Payment`, `Refund`) must be transaction-wrapped using the same `mongoose.startSession()` / `session.withTransaction()` pattern already used in `markAsPaid` and `OrderStateMachineService.transitionOrderStatus` — don't introduce a different transaction style.
- Every new Socket.IO event follows the existing `noun:verb` naming and room-scoping convention — no new naming scheme.
- Don't skip the manual verification step at the end of each phase (Phase 0's task 0.11 is the template) before moving to the next phase.
