# Restaurant SaaS — Architecture Extension Roadmap

Grounded in your existing backend: modular `src/modules/*`, task-based RBAC (`protect` → `restrictTo()`), `requireFeature()` subscription gating, `merchantScopedQuery`/`getMerchantId`/`getBranchId` tenant scoping, the `Order` state machine (`OrderStateMachineService` with `TRANSITIONS` + `TRANSITION_ROLE_PERMISSIONS`), Socket.IO room structure (`branch:{id}`, `branch:{id}:perm:{PERMISSION}`, `user:{id}`, `merchant:{id}`), and the Telegram module's send/webhook plumbing.

**Rule applied throughout:** no new module unless the data it owns genuinely doesn't belong to an existing one. Where a new collection is proposed, I say explicitly what it owns vs. what it only references.

---

## 0. Priority Verdict (challenging your ranking where the architecture disagrees)

| # | Feature | Your rank | My verdict | Why it moves (or doesn't) |
|---|---|---|---|---|
| 1 | Advanced Reporting | CRITICAL | **IMPLEMENT NOW** | Agreed — it's read-only, additive, zero risk to existing modules. Build first. |
| 2 | Audit Logging | HIGH | **IMPLEMENT NOW — moved up** | You ranked this below Split Billing/Refund/KDS. I'd build it *before or alongside* those three, not after. Retrofitting an audit trail onto financial mutations that already shipped is far more expensive than adding one hook now. It's also small and fully decoupled — no reason to sequence it last. |
| 3 | Refund/Void | CRITICAL | **IMPLEMENT NOW** | "Void" is basically free — it's your existing `cancelOrder` flow, just renamed conceptually (see §3). The real work is the `Refund` model, and Split Billing's refund story depends on that model existing first. |
| 4 | Split Billing | CRITICAL | **IMPLEMENT NOW, after Refund** | Needs the `Payment` collection (§3) as its foundation. Sequence it second, not in parallel, or you'll design the Payment shape twice. |
| 5 | Delivery | CRITICAL | **IMPLEMENT NOW — nearly done** | Model changes (`location`, `deliveryFee`, `deliveryNotes`) already merged. Remaining work is small: wire `staffPlaceOrder` to actually persist `deliveryFee`/`deliveryNotes`, add the `placeOrderStaffSchema` delivery refinement, fix the status-enum/permission gaps we found. This is mop-up, not a new build. |
| 6 | KDS | CRITICAL | **IMPLEMENT NOW, can run in parallel** | Largest single scope item here, but it's the *most* decoupled — it doesn't touch Payment, Refund, or Order's financial fields at all. If you have a second engineer/agent thread, this is the one to parallelize while the payment work above happens sequentially. |
| 7 | Reservations | HIGH | **OPTIONAL — downgraded** | See §7. Not mandatory for a QR-ordering-first platform; strongly recommend gating it as a paid add-on feature rather than core, and only build it once a merchant actually asks. |
| 8 | Notifications (Email/SMS) | HIGH | **SPLIT — Email is a cheap win now, SMS deferred** | You already have a working mailer (password-reset flow proves it). Extending it to order receipts/status is a small lift, not a new integration — I'd do that alongside Reporting. SMS is a genuinely new vendor integration; defer until a merchant asks for it specifically. Telegram already covers real-time status for opted-in customers. |
| 9 | Offline Resilience | MEDIUM | **DEFER, mostly** | Agreed on defer. One exception: build the **idempotency-key middleware** now (§8) — Split Billing needs it anyway for concurrent-payment safety, so you'd be building it twice if you wait. |

---

## 1. Advanced Reporting — full design

### 1.1 Architecture answers to your 12 questions

1. **Aggregation pipelines?** Yes, MongoDB aggregation directly on `Order` for real-time queries. Your `Order` schema already snapshots everything a report needs (`subtotal`, `taxAmount`, `discountAmount`, `totalAmount`, `deliveryFee`, `paymentStatus`, `items[].unitPrice`) — no need to reconstruct financial truth from elsewhere.
2. **Dedicated module?** Yes — new `src/modules/reports/`. It's **read-only**: it queries `Order`, `Inventory` (movements/valuation), `Customer`, `User`, `MenuItem` via aggregation, but owns *no* data of its own except optional export-job metadata (§1.4). This is a legitimate new module because no existing module's job is cross-cutting financial synthesis.
3. **Query directly vs. pre-aggregate?** Direct aggregation for date ranges ≤ ~90 days (the overwhelming majority of real usage — "this week," "this month," "last 30 days"). No pre-aggregation needed at launch.
4. **Pre-aggregated collections?** Not for v1. Add later *only if* live aggregation gets slow (tens of thousands of orders/day per merchant). If/when needed: a nightly job writes a `DailyBranchStats` rollup (one doc per branch per day — revenue, order count, COGS, etc.), and year-over-year / multi-month dashboards read from that instead of scanning raw `Order`. Don't build this speculatively — it's a Phase 2 optimization, not a correctness requirement.
5. **COGS from inventory/recipes?** Requires one small addition: `MenuItem` needs a `recipe: [{ ingredient: ObjectId, quantity: Number }]` reference into your Inventory module's `Ingredient` model (which already tracks `costPerUnit` via stock adjustments). At order-placement time, snapshot the computed cost onto the order item — add `unitCost: Number` to `orderItemSchema`, computed as `Σ(recipe[i].quantity × ingredient.costPerUnit)` at the moment of sale. **This must be snapshotted, not looked up live at report time** — otherwise a later ingredient price change silently rewrites the profitability of past orders. If a `MenuItem` has no recipe (not inventory-tracked), COGS for that item is `null`/"N/A" in reports rather than guessed.
6. **Refunds vs. revenue?** Present three tiers in every sales report: **Gross Sales** (all paid orders, pre-adjustment) → minus **Discounts** → minus **Refunds** → minus **Voided/Canceled contribution (always $0, see #7)** → **Net Sales**. Refunds reduce Net Sales but Gross Sales stays historically accurate (you did sell it; you gave money back separately).
7. **Cancelled orders?** Excluded from all revenue figures entirely — only `paymentStatus: 'paid'` orders count toward sales. Canceled orders get their own **operational** report (count, cancellation rate, reasons, which staff/stage canceled most) — useful signal, not a revenue line.
8. **Discounts/taxes representation?** Already correctly separated on your schema (`discountAmount`, `taxAmount`) — reports surface them as their own aggregation fields, never buried inside `totalAmount`.
9. **Delivery revenue?** `deliveryFee` is reported as its own line, separate from item-sales revenue — critical for a dedicated Delivery report and for not double-counting it as "food revenue."
10. **Multi-branch?** Every endpoint accepts optional `branchId`. Omit it → aggregate across all of the merchant's branches. Provide it → scoped to one. Every pipeline's `$match` stage always starts with `merchant: merchantId` (mandatory), then `branch: branchId` (optional).
11. **Tenant isolation?** Identical pattern to what you already do everywhere else — `getMerchantId(req)` from JWT context, never trust a `merchantId` in query params. No new isolation mechanism needed.
12. **Large date ranges?** Reject ranges >366 days for the JSON/dashboard endpoints (400 error, "narrow your date range or use export"). Exports have no such cap but run asynchronously (§1.4) rather than holding the full result set in memory.

### 1.2 Module structure

```
src/modules/reports/
├── reports.routes.js
├── controller/report.controller.js
├── service/
│   ├── sales-report.service.js
│   ├── orders-report.service.js
│   ├── products-report.service.js
│   ├── customers-report.service.js
│   ├── delivery-report.service.js
│   ├── profitability-report.service.js
│   ├── staff-report.service.js
│   └── export.service.js
├── validators/report.validators.js   // shared Zod query schema
```

### 1.3 API design

All endpoints: `protect → restrictTo() → requireFeature('reports')`. Shared query shape:

```ts
{
  dateFrom: string (ISO date, required),
  dateTo: string (ISO date, required),
  branchId?: string,
  groupBy?: 'day' | 'week' | 'month',   // default 'day'
  page?: number, limit?: number,         // for breakdown rows
  format?: 'json' | 'csv' | 'xlsx' | 'pdf'  // default 'json'
}
```

| Endpoint | Purpose | Key aggregation fields |
|---|---|---|
| `GET /api/v1/reports/sales` | Gross/net revenue, discounts, taxes, refunds, payment-method breakdown, AOV | `$group` by `groupBy` bucket; `$sum` totalAmount/discountAmount/taxAmount/deliveryFee filtered `paymentStatus: 'paid'` |
| `GET /api/v1/reports/orders` | Order counts by status, cancellation rate, avg time-to-ready | `$group` by status; time deltas from `placedAt`→`readyAt` |
| `GET /api/v1/reports/products` | Top-selling / low-performing items, category performance | `$unwind` items, `$group` by `menuItem`, `$sum` quantity/totalPrice |
| `GET /api/v1/reports/customers` | New vs. returning, spend distribution, top customers | `$group` by `customer`, first-order-date vs. range start |
| `GET /api/v1/reports/delivery` | Delivery volume, fee revenue, avg delivery duration | filter `orderType: 'delivery'`; use `outForDeliveryAt`→`deliveredAt` |
| `GET /api/v1/reports/profitability` | COGS, gross profit, net margin | `$sum(items[].unitCost × quantity)` vs. revenue |
| `GET /api/v1/reports/staff` | Orders per waiter/kitchen staff, avg turnaround | `$group` by `assignedWaiter`/`assignedKitchenStaff` |
| `GET /api/v1/reports/inventory` | Stock valuation + movement summary for the range | re-exposes existing Inventory module aggregations with date filter |

Every response follows the same envelope:
```json
{
  "status": "success",
  "data": {
    "summary": { /* single-row totals */ },
    "breakdown": [ /* per-groupBy-bucket rows, paginated */ ]
  },
  "meta": { "dateFrom": "...", "dateTo": "...", "branchId": "...", "page": 1, "pages": 4 }
}
```

### 1.4 Export: sync vs. async

- **Summary reports as CSV** (the `summary` object above, small): synchronous. Generate in-request, stream the response with `Content-Disposition: attachment`.
- **Row-level exports** (e.g., "every transaction this quarter," full order-level detail): **asynchronous**. Same principle you already flagged for campaign broadcasts — don't do heavy work synchronously in an HTTP handler.
  - `POST /api/v1/reports/exports` → `{ reportType, dateFrom, dateTo, branchId, format }` → `202 { jobId }`
  - Background job builds the file, saves it via your **existing Files module** (nice reuse — no new storage concept needed)
  - `GET /api/v1/reports/exports/:jobId` → `{ status: 'pending'|'ready'|'failed', fileId? }`
  - Frontend polls or listens on a `report:export:ready` Socket.IO event on the `user:{userId}` room you already have.

---

## 2. Audit Logging — build this before/alongside §3–4

### Model
```js
{
  merchant: ObjectId,       // required, tenant scope
  branch: ObjectId,         // optional — some actions aren't branch-scoped (role changes)
  actorId: ObjectId,        // User or Customer id
  actorType: 'user' | 'customer' | 'system',
  actorRoleName: String,    // snapshot, not a ref — role names/permissions change over time
  action: String,           // controlled vocabulary at app layer, not a DB enum (avoids migrations as actions grow)
  entityType: String,       // 'Order', 'Refund', 'MenuItem', 'User', ...
  entityId: ObjectId,
  before: Mixed,            // optional, only for updates
  after: Mixed,             // optional
  metadata: Mixed,          // free-form context (e.g. refund reason, transition reason)
  ip: String,
  userAgent: String,
  createdAt: Date           // immutable — no updatedAt
}
```

**Must-audit:** refunds, voids/cancellations, price changes, role/permission changes, order status overrides, payment recording, customer PII edits, staff account activation/deactivation.
**Don't bother auditing:** routine GETs, menu browsing, session heartbeats, Socket.IO connect/disconnect.

**Immutability:** enforce at the application layer — the `AuditLog` model exposes no update/delete controller methods at all (not even for SUPER-ADMIN). Don't rely on DB-level permissions for this; just don't write the code path.

**Retention:** financial-relevant logs (refunds, payments, price changes) — indefinite. Operational logs (logins) — 90–180 days, purge via cron.

**Visibility:** SUPER-ADMIN sees everything; merchant users see only their own merchant's logs (reuse `merchantScopedQuery` — zero new isolation logic).

**Integration point:** a single `AuditLogService.log(...)` call, invoked from inside `OrderStateMachineService.transitionOrderStatus`, the future `RefundService`, and anywhere else a financial/privileged mutation happens — same shape as how `NotificationService` is already called from that same transaction.

---

## 3. Refund / Void — the foundation Split Billing sits on

### Void vs. Refund vs. Cancellation — the actual distinction for your system
- **Void** = order canceled **before** money was captured. You already have this — it's your existing `cancelOrder` → `status: 'canceled'` flow. No new model needed; just document it as "void" in staff-facing UI language.
- **Cancellation** = same as void, generalized (kitchen ran out of an item mid-prep, etc.) — again, your existing flow.
- **Refund** = money **was** captured (order reached `paymentStatus: 'paid'`), and needs to be reversed, in full or in part.
- **Payment failure** = gateway-side, never reached your DB as `paid` — nothing to reverse, just retry or abandon.

### New model: `Refund`
```js
{
  merchant: ObjectId, branch: ObjectId,
  order: ObjectId,
  payment: ObjectId,          // which specific Payment is being reversed (see §4) — supports partial refund of one split payment
  amount: Number,
  reason: String,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  gatewayRefundReference: String,
  initiatedBy: ObjectId,      // User
  approvedBy: ObjectId,       // optional — only if you want an approval threshold above some amount
  createdAt: Date
}
```

`Order.paymentStatus` gains derived states: `'refunded'` (full), `'partially_refunded'`. Sync with gateway the same way you already do for Chapa subscriptions — a `/payments/webhook/:provider` endpoint updates `Refund.status` on gateway confirmation rather than trusting the initiating request alone (mirrors `subscriptions/webhook/:provider`, same pattern, different purpose — no new integration concept).

**Your three example scenarios, resolved:**
- *Item unavailable after payment* → partial `Refund` for that item's `totalPrice`, `reason: "item_unavailable"`, order stays `partially_refunded`.
- *Customer paid twice* → full `Refund` on the duplicate `Payment` record specifically (this is exactly why `Refund.payment` references a specific payment, not just the order).
- *Staff mis-marked as paid* → this isn't a refund at all — it's a correction. Needs a distinct, audited "reverse payment marking" action (logged via §2, reason required) that's different from a customer-facing refund. Don't overload `Refund` for staff error-correction; keep them conceptually and logically separate even if the DB write looks similar.

---

## 4. Split Billing — minimum correct domain model

Your instinct to not auto-create `Order + OrderItem + Bill + Payment + PaymentAllocation + SplitBill + SplitBillParticipant` was right. Here's the minimum that's actually correct:

**Keep:** `Order` stays the single source of truth for `subtotal`/`taxAmount`/`discountAmount`/`totalAmount`. It already **is** "the bill" — don't introduce a separate `Bill` collection.

**Don't create:** `OrderItem` as its own collection (already correctly embedded). `Bill` (redundant with Order). `SplitBill` as a top-level entity for v1 — model split *state*, not a split *session object*.

**Do create:** one new collection — `Payment`.
```js
{
  merchant: ObjectId, branch: ObjectId,
  order: ObjectId,
  amount: Number,
  method: 'cash' | 'card' | 'mobile_money' | 'bank_transfer',
  status: 'pending' | 'completed' | 'failed',
  gatewayReference: String,
  payerLabel: String,          // "Customer A" — free text, no customer-account requirement
  items: [{ menuItem: ObjectId, quantity: Number, portionAmount: Number }], // only populated for item-based splits
  idempotencyKey: String,      // unique per (merchant, order, idempotencyKey)
  recordedBy: ObjectId,
  createdAt: Date
}
```
This **replaces** the single embedded `order.paymentDetails` object for the split case — one Order can now have many Payments. Keep `paymentDetails` for the simple single-payment case (backward compatible, no migration required for existing paid orders).

### Answering your specific questions
- **Who owns financial truth?** `Order.totalAmount` is the target; `Σ(Payment.amount where status:'completed')` is the actual. Both live in the `orders`/`payments` collections — no separate ledger needed at this scale.
- **Payment status derivation:** `unpaid` (0 paid) → `partial` (0 < paid < total) → `paid` (paid ≥ total). Computed, not stored redundantly — or stored and recalculated inside the same transaction that writes a new Payment, your choice, but never trust a client-sent status.
- **Remaining balance:** `order.totalAmount - Σ(completed payments)`.
- **Overpayment prevention + concurrent-payment safety:** wrap Payment creation in a Mongoose transaction (you already do exactly this in `markAsPaid`) — re-read the order's current paid sum *inside* the transaction, reject if `amount > remainingBalance`.
- **Idempotency:** unique index `(merchant, order, idempotencyKey)` — client (POS/frontend) generates a key per payment attempt, safe to retry on network failure without double-charging. This is the same idempotency-key infrastructure your offline-resilience plan will eventually need (§8) — build it once, here, now.
- **Refunds after splitting:** `Refund.payment` points at the specific `Payment` being reversed — this is *why* Payment is a separate collection rather than an array field on Order; you need addressable individual payments to refund one without touching the others.
- **Equal / item-based / partial / multi-method** — all four of your examples are just different `Payment` records against the same `order`: equal split = N payments of `total/N` each with different `payerLabel`; item-based = payments with populated `items[]`; partial = one payment less than total, order stays `'partial'`; multi-method = two payments, different `method` values. No new model needed per scenario — this is the payoff of keeping `Payment` generic.

### Frontend flow (for reference, not backend work)
Staff opens "Split Bill" on an order → choose equal / by-item / custom → UI computes each participant's amount client-side for display only → each participant's payment is submitted as its own `POST /api/v1/order/:id/payments` call → order's paid/remaining updates live via the existing order Socket.IO room after each one lands.

---

## 5. Delivery — remaining loose ends only

Already covered in depth in this conversation. Recap of what's outstanding, nothing new:
1. `placeOrderStaffSchema` delivery refinement (sent earlier — requires `location.coordinates`+`city`+`customerPhone` when `orderType: 'delivery'`).
2. `OrderService.staffPlaceOrder` currently drops `deliveryFee`/`deliveryNotes` silently — needs to read them off `data` and pass through to `OrderRepository.newOrder(...)`.
3. Status enum / role-permission / Zod gaps for `out_for_delivery`/`delivered` (three-file fix, given in full earlier).
4. Maps-link builder (`https://maps.google.com/?q={lat},{lng}` from `order.location.coordinates`) — pure presentation, belongs in the controller response, not the model.
5. Customer-facing (Mini App) delivery ordering isn't wired yet — `placeOrderCustomerSchema` still has no `orderType`/location fields; today only staff can place delivery orders. Worth deciding if that's intentional for v1 or a gap.

---

## 6. KDS — architecture (fully decoupled, safe to build in parallel)

**New models** (your instinct to ask "which structure" first was right — here's the answer):
- `KitchenStation` — merchant/branch-scoped: `{ merchant, branch, name, assignedRole }`. Owns: station identity only.
- `KitchenTicket` — one per *station* per order (an order with items across 3 stations generates 3 tickets): `{ order, station, branch, status, items: [KitchenTicketItem], priority, fireTime, createdAt }`. Owns: routing + prep-progress state, nothing financial.
- `KitchenTicketItem` (sub-doc): `{ menuItem, quantity, notes, modifiers, status }` — item-level granularity within a ticket.

**MenuItem gets one new field:** `station: ObjectId ref KitchenStation`. The Menu module still owns the item definition; KDS only reads that reference — doesn't duplicate menu data.

**State machine — reuse your exact pattern.** Build `KitchenTicketStateMachineService` shaped identically to `OrderStateMachineService` (`TRANSITIONS` map, `TRANSITION_ROLE_PERMISSIONS` map, `transitionOrderStatus`-style transaction wrapper). Consistency here means anyone maintaining one understands the other immediately.

```
PENDING → ACCEPTED → PREPARING → READY → COMPLETED
   ↳ CANCELLED (from PENDING/ACCEPTED/PREPARING)
```

Order-level status stays driven by ticket aggregation: `Order.status → 'ready'` once **all** of its tickets are `'ready'` — this is the one integration point back into your existing `Order` state machine; it doesn't replace it.

**Socket.IO — extend your existing room convention, don't invent a new one:**
- New room type: `branch:{branchId}:station:{stationId}` — sits alongside your existing `branch:{branchId}:perm:{PERMISSION}` pattern.
- Events (verb-noun, matching your `order:new`/`table:updated` style): `kds:ticket-created`, `kds:ticket-accepted`, `kds:item-ready`, `kds:ticket-ready`, `kds:ticket-cancelled`.
- A kitchen staffer joins only their station's room (plus their branch room) — they never receive Bar tickets unless explicitly assigned to that station too. This is enforced the same way your permission-rooms already are, at `setup:session` join time.

**Printing — local print agent, not backend-direct, not browser-direct.** Your instinct that browser printing is insufficient is correct — it requires a human to be looking at the screen and can't reliably auto-fire on ticket creation. Recommended shape:
```
Backend → PrintJob (queued) → Socket.IO push to a lightweight local agent
  running inside the restaurant (small Node/Python service on a LAN machine
  or the POS terminal) → agent talks ESC/POS to the thermal printer
```
`PrintJob: { ticket, station, printer, status: 'queued'|'sent'|'failed', retryCount }`. Printing must be **optional** — KDS works fully digitally with zero printers connected; the print agent is an additive consumer of the same ticket-created event, not a dependency of the KDS flow itself.

---

## 7. Reservations — direct answer to "mandatory or not"

**Not mandatory.** Your QR table-session system already fully covers walk-in-driven, fast-casual-style dining. Reservations earn their keep specifically for full-service/fine-dining merchants where advance booking is the norm — it's vertical-dependent, not universally needed.

**Recommendation:** ship it as a feature-gated add-on (`requireFeature('reservations')`), not core, and build it only once a specific merchant asks — same treatment as Inventory/Analytics/Telegram already get.

**Terminology, since you asked for the distinction:**
- **Reservation** — future intent to occupy a table at a specific time; no session or order exists yet.
- **Table Session** — active physical presence (post-QR-scan or post-staff-checkin); this is where ordering happens. You already have this.
- **Walk-in** — a Table Session created with no prior Reservation.
- **Waitlist** — queued intent when no table is free *right now*; resolves into either a Table Session (when one frees) or is abandoned.

**Lifecycle, if built:** `Reservation { customer, branch, table, guestCount, reservedAt, durationMinutes, status: 'confirmed'|'seated'|'no_show'|'cancelled', depositPayment, notes }`. On customer arrival, staff taps "check in" → `Reservation.status → 'seated'` **and** that single action triggers `Table.status → 'occupied'` **and** programmatically starts a `CustomerSession` the same way a QR scan does today — reuse `session/start`'s internal logic, just staff-triggered instead of QR-triggered. **Deposits route through your existing Chapa integration** — same gateway, same `subscriptions`-style initiate/verify pattern, different purpose. Don't build a second payment integration for this.

---

## 8. Offline Resilience — phased, mostly deferred

**Phase 1 (cheap, do opportunistically alongside frontend work — not really backend work):** connection-status detection, cached menu/table data (your public `GET /menu/public` and `GET /branch/:id` endpoints already support this — frontend just needs a service worker), retry queue for non-financial actions.

**Phase 2 (defer until there's real demand):** offline order queue + sync. The one piece worth building **now, not later**: the **idempotency-key middleware** — because Split Billing (§4) already needs it for concurrent-payment safety. Build it once as a shared `common/middleware/idempotency.middleware.js` and both features reuse it — building it twice (once for payments, once for offline sync) is wasted effort.

**Offline payment: agreed, don't attempt it** unless your gateway (Chapa) explicitly documents support for it. Cash payments recorded offline and synced later are lower-risk than card/mobile-money — if you ever do Phase 2, scope offline *order creation* first, offline *payment recording* much later and only for cash.

**Socket.IO reconnection + REST retry:** on reconnect, client re-emits `setup:session` (already your pattern) and separately replays any queued non-financial REST calls tagged with an idempotency key — two independent mechanisms that don't need to know about each other.

---

## 9. Notifications (Email/SMS) — smaller than it looks

You already have a working mailer — `auth.service.js`'s forgot-password flow proves the SMTP/email infra exists. **Extending it to order receipts and status updates is reusing existing infrastructure, not building a new integration.** I'd bundle this into the Reporting/Audit sprint as a cheap add-on: a `NotificationService.sendEmail(...)` method alongside the `sendMessage`-style Telegram call you already make from the order state machine.

**SMS is genuinely new** — a new vendor (Twilio/Africa's Talking/etc.), new cost line, new failure modes. Defer until a specific merchant asks for it. Telegram already serves the same "real-time status ping" purpose for opted-in customers, and email covers the rest.

---

## Suggested build sequence

```
1. Reporting              (standalone, zero risk)
2. Audit Logging          (small, decouples everything after it)
3. Refund/Void model      (Payment + Refund collections)
4. Split Billing          (built on top of #3's Payment model)
5. Delivery loose ends    (small, mop-up)
6. KDS                    (can run in parallel with 2–5, fully decoupled)
7. Email receipts         (cheap add-on, bundle with #1)
—— defer below this line ——
8. Reservations           (build only if a merchant asks)
9. Offline Phase 2        (build only if a merchant asks)
10. SMS                   (build only if a merchant asks)
```

Want any single section (Reporting endpoints, the `Payment`/`Refund` schemas, or the KDS ticket-routing service) expanded into full copy-paste-ready code the way I did for the delivery status-enum fixes earlier? Tell me which one and I'll do that next, rather than trying to write all nine at full implementation depth in one pass.
