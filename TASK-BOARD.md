# Dining Session Refactor - Task Board

## 📊 Project Overview

**Goal:** Enable multiple customers to order at one table via QR while sharing the same dining session  
**Timeline:** 4-5 weeks (22-25 working days)  
**Team:** Backend Team (2-3 developers)  
**Status:** 🟡 Planning Phase

---

## 🎯 Sprint 1: Foundation (Week 1)

### 🔴 P0 - BLOCKING

#### Task 1.1: Create DiningSession Model
**Story Points:** 5  
**Assigned To:** `__________`  
**Status:** 🟡 TODO

**User Story:**  
> As a developer, I need a DiningSession model to represent complete table visits (not individual customer sessions)

**Checklist:**
- [ ] Create `models/DiningSession.js` with schema
- [ ] Add fields: `status`, `startedAt`, `endedAt`, `createdBy`
- [ ] Remove `customer` and `deviceInfo` fields
- [ ] Add partial unique index on `table` where `status = 'active'`
- [ ] Create migration script `001-customer-session-to-dining-session.js`
- [ ] Test migration in local DB
- [ ] Update `models/tabelModel.js` virtual reference
- [ ] Create backward compatibility alias

**Definition of Done:**
- Migration runs successfully on test data
- Only one active session per table enforced
- All existing sessions transformed correctly
- Unit tests pass

**Files:**
- `models/DiningSession.js` (NEW)
- `models/customerSessionModule.js` (ALIAS)
- `models/tabelModel.js` (UPDATE)
- `migrations/001-customer-session-to-dining-session.js` (NEW)

**Estimated:** 4h | **Actual:** ___

---

#### Task 1.2: Add session Field to Orders
**Story Points:** 3  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Task 1.1

**User Story:**  
> As a developer, I need orders to link to dining sessions to track which orders belong to the same table visit

**Checklist:**
- [ ] Add `session: ObjectId` field to Order schema
- [ ] Update `source` enum: add `'qr'` and `'staff'`
- [ ] Add indexes: `{ session: 1, status: 1 }`, `{ session: 1, paymentStatus: 1 }`
- [ ] Create migration `002-add-session-to-orders.js`
- [ ] Backfill sessions for active orders
- [ ] Test on sample data
- [ ] Verify all active orders have sessionId

**Definition of Done:**
- All orders have session field
- Enum includes 'qr' and 'staff'
- Indexes created successfully
- No orphaned orders (active orders without session)

**Files:**
- `models/orderModel.js` (UPDATE)
- `migrations/002-add-session-to-orders.js` (NEW)

**Estimated:** 2h | **Actual:** ___

---

#### Task 1.3: Create SessionService (Part 1)
**Story Points:** 8  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Tasks 1.1, 1.2

**User Story:**  
> As a developer, I need centralized session management logic used by both QR and staff order flows

**Checklist:**
- [ ] Create `SessionService.js` class
- [ ] Implement `getOrCreateActiveSession()` with race condition handling
- [ ] Implement `getActiveSession()`
- [ ] Implement `validateTableForOrders()`
- [ ] Add retry logic for duplicate key errors
- [ ] Handle MongoDB transactions
- [ ] Write unit tests (target: 90% coverage)
- [ ] Test concurrent session creation

**Definition of Done:**
- Service methods work correctly
- Race conditions handled gracefully
- Transactions rollback on error
- Unit tests pass
- Code reviewed

**Files:**
- `src/modules/sessions/service/SessionService.js` (NEW)
- `tests/session-service.test.js` (NEW)

**Estimated:** 6h | **Actual:** ___

---

## 🎯 Sprint 2: Integration (Week 2)

### 🔴 P0 - BLOCKING

#### Task 2.1: SessionService (Part 2)
**Story Points:** 5  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Task 1.3

**User Story:**  
> As a developer, I need session lifecycle methods (end session, get orders) to complete session management

**Checklist:**
- [ ] Implement `endSession()` with validation
- [ ] Implement `getSessionOrders()`
- [ ] Add unpaid order validation
- [ ] Support `force` flag for override
- [ ] Handle table status updates
- [ ] Write integration tests
- [ ] Test with real scenarios

**Definition of Done:**
- `endSession()` prevents closing with unpaid orders
- Force flag works correctly
- Table status updated appropriately
- Integration tests pass

**Files:**
- `src/modules/sessions/service/SessionService.js` (UPDATE)
- `tests/session-service-integration.test.js` (NEW)

**Estimated:** 5h | **Actual:** ___

---

### 🟡 P1 - HIGH PRIORITY

#### Task 2.2: Refactor QR Flow
**Story Points:** 5  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Task 2.1

**User Story:**  
> As a customer, I want to scan a table QR even if the table is occupied, so I can join the existing dining session

**Checklist:**
- [ ] Update `BranchService.startTableSessionFromQr()`
- [ ] Remove `if (table.status === 'occupied')` check ❌
- [ ] Use `SessionService.getOrCreateActiveSession()`
- [ ] Return `isNew` flag in response
- [ ] Update response format if needed
- [ ] Test with occupied table
- [ ] Test with available table

**Definition of Done:**
- QR scan works on occupied tables
- Existing session returned correctly
- New session created for available tables
- Response format matches API spec

**Files:**
- `src/modules/branch/service/BranchService.js` (UPDATE)
- `src/modules/sessions/session.controller.js` (UPDATE)

**Estimated:** 4h | **Actual:** ___

---

#### Task 2.3: Refactor Customer Orders
**Story Points:** 5  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Task 2.1

**User Story:**  
> As a customer placing an order, I want my order to link to the table's dining session automatically

**Checklist:**
- [ ] Update `OrderTransactionService.executePlaceOrder()`
- [ ] Use `SessionService.getOrCreateActiveSession()`
- [ ] Set `order.session = session._id`
- [ ] Set `order.source = 'qr'`
- [ ] Update notification events with session context
- [ ] Preserve idempotency logic
- [ ] Test order creation flow

**Definition of Done:**
- Customer orders link to session
- Source marked as 'qr'
- Idempotency still works
- Notifications include session data
- Integration tests pass

**Files:**
- `src/modules/order/service/OrderTransactionService.js` (UPDATE)
- `src/modules/order/controller/handlers/placement.handler.js` (UPDATE)

**Estimated:** 3h | **Actual:** ___

---

#### Task 2.4: Refactor Staff Orders
**Story Points:** 5  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Task 2.1

**User Story:**  
> As a waiter creating an order, I want it to link to the table's dining session and track me as the creator

**Checklist:**
- [ ] Update `OrderService.staffPlaceOrder()`
- [ ] Use `SessionService.getOrCreateActiveSession()`
- [ ] Pass `createdBy: staffUserId`
- [ ] Set `order.session = session._id`
- [ ] Set `order.source = 'staff'`
- [ ] Update notification events
- [ ] Test staff order creation

**Definition of Done:**
- Staff orders link to session
- Source marked as 'staff'
- createdBy tracked correctly
- Session created if none exists
- Session reused if already active

**Files:**
- `src/modules/order/service/OrderService.js` (UPDATE)
- `src/modules/order/controller/handlers/placement.handler.js` (UPDATE)

**Estimated:** 4h | **Actual:** ___

---

## 🎯 Sprint 3: Completion & Polish (Week 3)

### 🟢 P2 - MEDIUM PRIORITY

#### Task 3.1: Create Close Table Endpoint
**Story Points:** 3  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Task 2.1

**User Story:**  
> As a waiter, I want to manually close a table when all customers have left, so the table becomes available again

**Checklist:**
- [ ] Create `closeTable()` controller method
- [ ] Add `POST /api/v1/tables/:tableId/close` route
- [ ] Add RBAC: `restrictTo('waiter', 'admin')`
- [ ] Validate no unpaid orders
- [ ] Support `force: true` query param
- [ ] Return session summary (duration, orders, amount)
- [ ] Update table status to 'needs-cleaning'
- [ ] Test endpoint with Postman

**Definition of Done:**
- Endpoint works correctly
- RBAC enforced
- Unpaid order validation works
- Force flag bypasses validation
- Session marked as ended
- Table status updated

**Files:**
- `src/modules/tables/table.controller.js` (UPDATE)
- `src/modules/tables/tables.routes.js` (UPDATE)

**Estimated:** 3h | **Actual:** ___

---

#### Task 3.2: Add Socket.IO Events
**Story Points:** 2  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Task 2.1

**User Story:**  
> As a restaurant manager viewing the dashboard, I want real-time notifications when sessions start and end

**Checklist:**
- [ ] Create `session-events.js` event builders
- [ ] Implement `buildSessionCreatedEvent()`
- [ ] Implement `buildSessionEndedEvent()`
- [ ] Queue events in `SessionService`
- [ ] Emit to `branch:${branchId}` room
- [ ] Set audience to 'staff' only
- [ ] Test event emission

**Definition of Done:**
- Events emitted when session created
- Events emitted when session ended
- Staff dashboards receive events
- Customers don't receive session events
- Event format matches spec

**Files:**
- `src/modules/notifications/events/session-events.js` (NEW)
- `src/modules/sessions/service/SessionService.js` (UPDATE)

**Estimated:** 2h | **Actual:** ___

---

### 🔴 P1 - HIGH PRIORITY

#### Task 3.3: Write Integration Tests
**Story Points:** 8  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Tasks 2.2, 2.3, 2.4

**User Story:**  
> As a developer, I need comprehensive tests to ensure the new session system works correctly

**Checklist:**
- [ ] Write multi-customer QR ordering test
- [ ] Write staff order session sharing test
- [ ] Write close table workflow test
- [ ] Write race condition test (concurrent scans)
- [ ] Write payment doesn't close session test
- [ ] Write mixed QR + staff orders test
- [ ] Run all tests in CI/CD
- [ ] Fix any failing tests

**Definition of Done:**
- All integration tests pass
- Test coverage ≥ 90%
- Race conditions handled correctly
- CI/CD pipeline green

**Files:**
- `tests/qr-multi-customer-ordering.test.js` (NEW)
- `tests/staff-order-session.test.js` (NEW)
- `tests/close-table.test.js` (NEW)
- `tests/concurrent-session-creation.test.js` (NEW)

**Estimated:** 8h | **Actual:** ___

---

## 🎯 Sprint 4: Testing & Deployment (Week 4)

### 🟢 P3 - LOW PRIORITY

#### Task 4.1: Documentation
**Story Points:** 3  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** All previous tasks

**User Story:**  
> As a developer joining the team, I need clear documentation to understand the new session system

**Checklist:**
- [ ] Write API docs for session endpoints
- [ ] Update order API docs
- [ ] Create session lifecycle diagram
- [ ] Create multi-customer sequence diagram
- [ ] Write migration guide
- [ ] Update README
- [ ] Create troubleshooting guide

**Definition of Done:**
- All docs complete and reviewed
- Diagrams clear and accurate
- Migration guide tested
- README updated

**Files:**
- `docs/api/sessions.md` (NEW)
- `docs/api/orders.md` (UPDATE)
- `docs/architecture/*.png` (NEW)
- `docs/migration/dining-session-migration.md` (NEW)
- `README.md` (UPDATE)

**Estimated:** 3h | **Actual:** ___

---

### 🔴 P0 - BLOCKING

#### Task 4.2: Staging Deployment
**Story Points:** 5  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** All development tasks

**User Story:**  
> As DevOps, I need to deploy to staging and verify everything works before production

**Checklist:**
- [ ] Backup staging database
- [ ] Run migrations on staging
- [ ] Deploy new code to staging
- [ ] Smoke test critical flows
- [ ] Test QR ordering with multiple customers
- [ ] Test staff orders
- [ ] Test close table
- [ ] Monitor logs for errors
- [ ] Performance test session creation
- [ ] Get stakeholder approval

**Definition of Done:**
- Staging deployment successful
- All smoke tests pass
- No critical errors in logs
- Performance acceptable
- Stakeholders approve

**Estimated:** 4h | **Actual:** ___

---

#### Task 4.3: Production Deployment
**Story Points:** 5  
**Assigned To:** `__________`  
**Status:** 🟡 TODO  
**Depends On:** Task 4.2

**User Story:**  
> As DevOps, I need to deploy to production with zero downtime and minimal risk

**Checklist:**
- [ ] Backup production database
- [ ] Create rollback plan
- [ ] Deploy to 50% of servers
- [ ] Run migrations
- [ ] Monitor metrics for 1 hour
- [ ] Deploy to remaining 50%
- [ ] Monitor for 24 hours
- [ ] Verify all features working
- [ ] Update status page
- [ ] Close deployment ticket

**Definition of Done:**
- Production deployment successful
- Zero downtime achieved
- No critical errors
- All metrics normal
- Users report no issues

**Estimated:** 4h | **Actual:** ___

---

## 📈 Progress Tracker

```
Sprint 1 (Week 1): ▱▱▱▱▱▱▱▱▱▱ 0/10 tasks
Sprint 2 (Week 2): ▱▱▱▱▱▱▱▱▱▱ 0/10 tasks
Sprint 3 (Week 3): ▱▱▱▱▱▱▱▱▱▱ 0/10 tasks
Sprint 4 (Week 4): ▱▱▱▱▱▱▱▱▱▱ 0/10 tasks

Overall Progress: ▱▱▱▱▱▱▱▱▱▱ 0%

Story Points Completed: 0 / 56
```

---

## 🎯 Key Milestones

- [ ] **M1:** Foundation Complete (Tasks 1.1-1.3) - End of Week 1
- [ ] **M2:** Integration Complete (Tasks 2.1-2.4) - End of Week 2
- [ ] **M3:** Testing Complete (Tasks 3.1-3.3) - End of Week 3
- [ ] **M4:** Production Deployed (Task 4.3) - End of Week 4

---

## 🚨 Blockers & Risks

| ID | Issue | Owner | Status | Resolution |
|----|-------|-------|--------|------------|
| - | - | - | - | - |

---

## 📝 Daily Standup Template

**Date:** ___________

**Yesterday:**
- [ ] Task X.Y completed
- [ ] Made progress on Task X.Z

**Today:**
- [ ] Will work on Task X.Z
- [ ] Will start Task X.W

**Blockers:**
- None / [Describe blocker]

---

## ✅ Definition of Done (Project-Level)

- [x] All 10 tasks completed
- [x] All tests pass (unit, integration, E2E)
- [x] Code reviewed and approved
- [x] Documentation complete
- [x] Staging tested and approved
- [x] Production deployed successfully
- [x] Zero critical bugs in first 48 hours
- [x] Success metrics achieved

---

**Last Updated:** 2026-09-03  
**Board Owner:** Backend Team Lead  
**Sprint:** Pre-Sprint (Planning)
