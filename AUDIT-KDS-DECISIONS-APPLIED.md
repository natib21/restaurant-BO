# Audit & KDS Decisions Applied

## ✅ Confirmed Decisions

### 1. Order.items _id
**Decision:** Option A - Enable `{ _id: true }`  
**Status:** ✅ Implemented in Phase 0  
**Rationale:** Kiro verified 28 usages are safe, provides better referential integrity

### 2. Audit Failure Tracking
**Decision:** Option A - Structured logger only (no new metrics model)  
**Status:** ✅ Implemented in Phase 0  
**Rationale:** Unblocks v1 without adding scope, can add MongoDB/Redis metrics later

### 3. Request Context Propagation
**Decision:** Use native AsyncLocalStorage (not cls-hooked)  
**Status:** ✅ Implemented in Phase 0  
**Rationale:** Built into Node.js, no dependency, better async boundary handling

### 4. Correlation ID Strategy
**Decision:** UUID per request (no distributed tracing yet)  
**Status:** ✅ Implemented in Phase 0  
**Implementation:** Generated in request-context middleware, added to response headers

### 5. Severity Auto-Classification
**Decision:** Accept proposed rules as-is  
**Status:** 🟡 Pending Phase 1  
**Rules:**
- CREATE/UPDATE/DELETE → info
- LOGIN/LOGOUT → info
- PASSWORD_CHANGE → warn
- ROLE_ASSIGN → warn
- REPORT_ACCESS → info (unless sensitive report type)
- REPORT_EXPORT → warn
- Failed operations → error

### 6. Read/GET Auditing
**Decision:** Keep current exclusion (only audit reports, not routine GETs)  
**Status:** ✅ Current behavior maintained  
**Rationale:** Reduces noise, reports already have auditLogger calls

### 7. Station Assignment
**Decision:** Single station per menu item  
**Status:** ✅ Implemented in Phase 0 (Menu.kitchenStation field)  
**Rationale:** Simpler, can revisit later if multi-station needed

### 8. Ticket Numbering
**Decision:** Per-station-per-day auto-increment  
**Status:** ✅ Uses existing Counter model  
**Format:** `{STATION_CODE}-{SEQ}` (e.g., GRILL-42, SALAD-15)

### 9. Item-Level Status Tracking
**Decision:** Yes, include in v1  
**Status:** ✅ Implemented in Phase 0 (KitchenTicketItem.status)  
**Rationale:** Already designed in, enables partial completion visibility

### 10. Priority Calculation
**Decision:** Manual field for now, auto-calc later  
**Status:** ✅ Implemented in Phase 0 (KitchenTicket.priority enum)  
**Future:** Can add rules like "delivery orders = high" in Phase 2

### 11. Kitchen Staff Assignment
**Decision:** Include optional `assignedTo` field, no claiming workflow yet  
**Status:** ✅ Implemented in Phase 0 (KitchenTicket.assignedTo)  
**Rationale:** Field ready for future assignment features

### 12. Printing Support
**Decision:** Out of scope for v1  
**Status:** ✅ Confirmed - not implementing  
**Future:** Can add printer integration in Phase 2+

---

## ⚠️ ONE PENDING DECISION

### Ticket Acceptance Workflow

**Your default:** "Skip explicit 'Accept' step, auto-start pending→in_progress"

**Technical concern:** Your OrderStateMachineService has role-based transition permissions. Auto-starting bypasses:
- Actor attribution (who gets credited in audit trail?)
- Permission checks for pending→in_progress transition

**Options:**

#### Option 1: Keep Explicit Acceptance (RECOMMENDED)
- Ticket created → status: 'pending'
- Kitchen staff clicks "Accept" → status: 'in_progress'
- Matches existing RBAC pattern
- Clean audit trail with real user attribution
- Single-click action in UI (not burdensome)

**Implementation:**
```javascript
// KitchenTicketService.acceptTicket(ticketId, userId)
// - Check user has permission
// - Transition pending → in_progress
// - Set acceptedAt timestamp
// - Emit WebSocket event
```

#### Option 2: Auto-Start (BYPASS PERMISSIONS)
- Ticket created → status: 'in_progress' immediately
- Actor: `system` (not a real user)
- Skip permission checks for ticket creation only
- Faster workflow but loses attribution

**Implementation:**
```javascript
// When creating ticket from order:
ticket.status = 'in_progress';
ticket.acceptedAt = new Date();
ticket.startedAt = new Date();
// No acceptTicket() method needed
```

**My recommendation:** Option 1 (explicit acceptance) for architectural consistency with your existing RBAC/audit patterns.

**If you choose auto-start (Option 2)**, I'll implement it but document the permission bypass and actor attribution gap.

**Which do you choose?**

---

## 📋 Remaining Open Decisions (Defaulted for Speed)

These were defaulted to fastest implementation. Flag if you disagree:

### Audit Logging
- ✅ Mongoose post hooks for auto-audit (vs express middleware) - **DEFAULTED TO HOOKS**
- ✅ Merchant-scoping enforced via AuditLog.merchant field - **YES**
- ✅ Retention policy - **NOT IMPLEMENTED YET** (can add TTL index later)
- ✅ IP/User-Agent capture - **ALREADY IMPLEMENTED** (existing auditLogger)

### KDS
- ✅ Ticket cancellation behavior - **MARK CANCELED** (don't delete)
- ✅ Ticket completion → order ready roll-up - **YES VIA OUTBOX**
- ✅ WebSocket room naming - **FOLLOW EXISTING PATTERN** (merchant-{id}-station-{id})
- ✅ Station dashboard real-time updates - **YES VIA WEBSOCKET**
- ✅ Ticket display order - **CREATED_AT ASC** (FIFO)
- ✅ Multiple tickets per order - **YES** (one per station)

---

## 🚀 Phase 0 Complete, Ready for Phase 1

**Completed:**
- ✅ Order.items _id enabled
- ✅ Audit logger improved (structured errors)
- ✅ Request context utility (AsyncLocalStorage)
- ✅ KitchenStation model
- ✅ KitchenTicket model  
- ✅ Menu.kitchenStation field

**Next Phase 1 (after acceptance decision):**
1. Middleware integration (request-context, auto-audit)
2. KitchenTicketService (CRUD + transitions)
3. Order → Ticket creation via outbox
4. Ticket → Order ready roll-up via outbox
5. WebSocket events

**Blocked by:** Ticket acceptance workflow decision

---

**Status:** 🟡 Awaiting final decision on ticket acceptance (Option 1 vs 2)  
**Timeline:** Phase 1 implementation can start immediately once decided  
**Risk:** None - Phase 0 changes are all backward compatible

---

**Generated:** 2026-08-17  
**Decisions Applied:** 12 of 13 (1 pending)
