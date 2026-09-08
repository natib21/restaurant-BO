# Dining Session Refactor - Spec

## Overview
Refactor the restaurant backend to support table-based dining sessions that allow multiple customers (QR + staff orders) to share the same session until staff manually closes the table.

## Problem Statement
Currently:
- ❌ QR scanning blocked when table is "occupied"
- ❌ Individual customer sessions, not table sessions
- ❌ Payment auto-closes table (incorrect)
- ❌ No link between orders and sessions
- ❌ Staff and QR orders use separate flows

## Solution
Create a **DiningSession** model representing a complete table visit that:
- ✅ Supports multiple customers at one table
- ✅ Contains multiple orders (QR + staff)
- ✅ Remains active until staff closes table
- ✅ Tracks source (`qr` vs `staff`)

---

## Tasks

### ✅ Task 1: Create DiningSession Model
**Status:** 🟡 Not Started  
**Priority:** P0 - Blocking  
**Effort:** 4 hours  
**Assignee:** Backend Team

**Description:**
Rename `CustomerSession` to `DiningSession` and refactor to represent table visits instead of individual customer sessions.

**Acceptance Criteria:**
- [ ] New `DiningSession` model created with fields: `status`, `startedAt`, `endedAt`, `createdBy`
- [ ] Removed `customer` and `deviceInfo` fields
- [ ] Migration script renames collection and updates fields
- [ ] Partial unique index ensures one active session per table
- [ ] Backward compatibility alias maintained

**Technical Details:**
```javascript
// New schema structure
{
  table: ObjectId (ref: Table, required),
  merchant: ObjectId (required),
  branch: ObjectId (required),
  token: String (unique),
  status: enum ['active', 'ended', 'cancelled'],
  startedAt: Date,
  endedAt: Date,
  createdBy: ObjectId (ref: User, optional)
}

// Unique index
{ table: 1 }, { unique: true, partialFilterExpression: { status: 'active' } }
```

**Files Changed:**
- `models/DiningSession.js` (NEW)
- `models/customerSessionModule.js` (ALIAS)
- `models/tabelModel.js` (UPDATE virtual)
- `migrations/001-customer-session-to-dining-session.js` (NEW)

**Dependencies:** None

**Risks:**
- MEDIUM: Data migration of existing sessions
- Mitigation: Test in staging, rollback plan ready

---

### ✅ Task 2: Add session Field to Orders
**Status:** 🟡 Not Started  
**Priority:** P0 - Blocking  
**Effort:** 2 hours  
**Assignee:** Backend Team

**Description:**
Add `session` reference field to Order model and update `source` enum to include `'qr'` and `'staff'`.

**Acceptance Criteria:**
- [ ] `session: ObjectId` field added to Order schema
- [ ] `source` enum updated: `['qr', 'staff', 'web', 'telegram', 'admin', 'waiter']`
- [ ] Migration creates sessions for tables with active orders
- [ ] Indexes added: `{ session: 1, status: 1 }`, `{ session: 1, paymentStatus: 1 }`
- [ ] All active orders linked to appropriate sessions

**Technical Details:**
```javascript
// Order schema update
{
  session: {
    type: ObjectId,
    ref: 'DiningSession',
    required: true,
    index: true
  },
  source: {
    type: String,
    enum: ['qr', 'staff', 'web', 'telegram', 'admin', 'waiter'],
    required: true
  }
}
```

**Files Changed:**
- `models/orderModel.js` (UPDATE)
- `migrations/002-add-session-to-orders.js` (NEW)

**Dependencies:** Task 1 (DiningSession model must exist)

**Risks:**
- HIGH: Backfilling sessionId for existing orders
- Mitigation: Create sessions for tables with active orders, test thoroughly

---

### ✅ Task 3: Create SessionService
**Status:** 🟡 Not Started  
**Priority:** P0 - Blocking  
**Effort:** 8 hours  
**Assignee:** Backend Team

**Description:**
Create centralized `SessionService` with core methods for session lifecycle management, used by both QR and staff flows.

**Acceptance Criteria:**
- [ ] `getOrCreateActiveSession()` method implemented with race condition handling
- [ ] `getActiveSession()` method for querying active sessions
- [ ] `endSession()` method with unpaid order validation
- [ ] `getSessionOrders()` method for querying session orders
- [ ] `validateTableForOrders()` method replaces occupancy check
- [ ] Retry logic handles concurrent session creation
- [ ] Unit tests achieve 90%+ coverage

**Technical Details:**
```javascript
class SessionService {
  // Core method - returns { session, isNew }
  static async getOrCreateActiveSession({ tableId, createdBy, session })
  
  // Query methods
  static async getActiveSession(tableId, session)
  static async getSessionOrders(sessionId, filters)
  
  // Lifecycle methods
  static async endSession({ sessionId, closedBy, force, session })
  
  // Validation
  static async validateTableForOrders(tableId)
}
```

**Files Changed:**
- `src/modules/sessions/service/SessionService.js` (NEW)
- `tests/session-service.test.js` (NEW)

**Dependencies:** Tasks 1, 2

**Risks:**
- HIGH: Race conditions during concurrent session creation
- Mitigation: Partial unique index, retry logic, integration tests

---

### ✅ Task 4: Refactor QR Flow
**Status:** 🟡 Not Started  
**Priority:** P1 - High  
**Effort:** 4 hours  
**Assignee:** Backend Team

**Description:**
Update QR scanning flow to use `SessionService` and remove "table occupied" blocking.

**Acceptance Criteria:**
- [ ] `BranchService.startTableSessionFromQr()` uses `SessionService.getOrCreateActiveSession()`
- [ ] Removed check for `table.status === 'occupied'`
- [ ] Returns existing session if table already has active session
- [ ] Response includes `isNew` flag
- [ ] Socket events emitted for new sessions

**Technical Details:**
```javascript
// OLD (REMOVE):
if (table.status === 'occupied') {
  throw new AppError('Table occupied', 400);
}

// NEW:
const { session, isNew } = await SessionService.getOrCreateActiveSession({
  tableId: table._id,
  createdBy: null // QR-initiated
});
```

**Files Changed:**
- `src/modules/branch/service/BranchService.js` (UPDATE)
- `src/modules/sessions/session.controller.js` (UPDATE)

**Dependencies:** Task 3 (SessionService)

**Risks:**
- MEDIUM: Changed QR behavior may confuse users
- Mitigation: Clear documentation, frontend updates

---

### ✅ Task 5: Refactor Customer Order Flow
**Status:** 🟡 Not Started  
**Priority:** P1 - High  
**Effort:** 3 hours  
**Assignee:** Backend Team

**Description:**
Update customer order placement to link orders to dining sessions and mark source as `'qr'`.

**Acceptance Criteria:**
- [ ] `OrderTransactionService.executePlaceOrder()` uses `SessionService.getOrCreateActiveSession()`
- [ ] Orders created with `session: session._id`
- [ ] Orders created with `source: 'qr'`
- [ ] Notification events include session context
- [ ] Idempotency logic preserved

**Technical Details:**
```javascript
// In OrderTransactionService.executePlaceOrder()
const { session: diningSession } = await SessionService.getOrCreateActiveSession({
  tableId,
  createdBy: null,
  session
});

const order = await Order.create([{
  session: diningSession._id,
  source: 'qr',
  // ... other fields
}], { session });
```

**Files Changed:**
- `src/modules/order/service/OrderTransactionService.js` (UPDATE)
- `src/modules/order/controller/handlers/placement.handler.js` (UPDATE)

**Dependencies:** Task 3 (SessionService)

**Risks:**
- MEDIUM: Transaction complexity increased
- Mitigation: Extensive testing, monitor transaction durations

---

### ✅ Task 6: Refactor Staff Order Flow
**Status:** 🟡 Not Started  
**Priority:** P1 - High  
**Effort:** 4 hours  
**Assignee:** Backend Team

**Description:**
Update staff order creation to use `SessionService` and mark source as `'staff'`.

**Acceptance Criteria:**
- [ ] `OrderService.staffPlaceOrder()` uses `SessionService.getOrCreateActiveSession()`
- [ ] Orders created with `session: session._id`
- [ ] Orders created with `source: 'staff'`
- [ ] Session tracks `createdBy: staffUserId`
- [ ] Notification events include staff context

**Technical Details:**
```javascript
// In OrderService.staffPlaceOrder()
const { session: diningSession } = await SessionService.getOrCreateActiveSession({
  tableId: table._id,
  createdBy: performedBy, // Staff user ID
  session
});

const order = await Order.create([{
  session: diningSession._id,
  source: 'staff',
  createdBy: performedBy,
  // ... other fields
}], { session });
```

**Files Changed:**
- `src/modules/order/service/OrderService.js` (UPDATE)
- `src/modules/order/controller/handlers/placement.handler.js` (UPDATE)

**Dependencies:** Task 3 (SessionService)

**Risks:**
- LOW: Staff workflow unchanged from user perspective
- Mitigation: Internal testing with staff

---

### ✅ Task 7: Create Close Table Endpoint
**Status:** 🟡 Not Started  
**Priority:** P2 - Medium  
**Effort:** 3 hours  
**Assignee:** Backend Team

**Description:**
Create new endpoint for staff to manually close dining sessions with validation.

**Acceptance Criteria:**
- [ ] `POST /api/v1/tables/:tableId/close` endpoint created
- [ ] RBAC: Only `waiter` and `admin` can close tables
- [ ] Validates no unpaid orders exist
- [ ] Supports `force: true` flag to override validation
- [ ] Sets session `status: 'ended'` and `endedAt`
- [ ] Updates table `status: 'needs-cleaning'`
- [ ] Returns session summary (duration, order count, total amount)

**Technical Details:**
```javascript
exports.closeTable = catchAsync(async (req, res, next) => {
  const { tableId } = req.params;
  const { force = false } = req.body;
  
  const activeSession = await SessionService.getActiveSession(tableId);
  if (!activeSession) {
    return next(new AppError('No active session', 404));
  }
  
  const closedSession = await SessionService.endSession({
    sessionId: activeSession._id,
    closedBy: req.user._id,
    force
  });
  
  // Return summary...
});
```

**Files Changed:**
- `src/modules/tables/table.controller.js` (UPDATE)
- `src/modules/tables/tables.routes.js` (UPDATE)

**Dependencies:** Task 3 (SessionService)

**Risks:**
- LOW: New endpoint, no existing dependencies
- Mitigation: Standard RBAC patterns

---

### ✅ Task 8: Update Socket.IO Events
**Status:** 🟡 Not Started  
**Priority:** P2 - Medium  
**Effort:** 2 hours  
**Assignee:** Backend Team

**Description:**
Add Socket.IO events for session lifecycle (created, ended) to notify staff dashboards.

**Acceptance Criteria:**
- [ ] `session:created` event builder created
- [ ] `session:ended` event builder created
- [ ] Events queued in `SessionService.getOrCreateActiveSession()`
- [ ] Events queued in `SessionService.endSession()`
- [ ] Events emit to `branch:${branchId}` room
- [ ] Only staff receive session events (not customers)

**Technical Details:**
```javascript
// Event structure
{
  eventType: 'session:created',
  target: {
    room: `branch:${branchId}`,
    audience: 'staff'
  },
  payload: {
    sessionId,
    tableId,
    tableNumber,
    startedAt,
    createdBy: { userId, name },
    source: 'qr' | 'staff'
  }
}
```

**Files Changed:**
- `src/modules/notifications/events/session-events.js` (NEW)
- `src/modules/sessions/service/SessionService.js` (UPDATE)

**Dependencies:** Task 3 (SessionService)

**Risks:**
- LOW: Additional events, no breaking changes
- Mitigation: Frontend can ignore unknown event types

---

### ✅ Task 9: Write Comprehensive Tests
**Status:** 🟡 Not Started  
**Priority:** P1 - High  
**Effort:** 8 hours  
**Assignee:** QA + Backend Team

**Description:**
Create comprehensive test suite covering all new functionality and edge cases.

**Acceptance Criteria:**
- [ ] Unit tests for `SessionService` methods (90%+ coverage)
- [ ] Integration tests for QR multi-customer scenario
- [ ] Integration tests for staff order session sharing
- [ ] Integration tests for close table workflow
- [ ] E2E tests for complete dining session lifecycle
- [ ] Race condition tests (concurrent session creation)
- [ ] Performance tests (session creation under load)
- [ ] All tests pass in CI/CD pipeline

**Test Scenarios:**
```
✓ First QR scan creates session
✓ Second QR scan returns existing session
✓ Multiple customers create separate orders in same session
✓ Staff order creates session if none exists
✓ Staff order reuses existing session
✓ Mixed QR + staff orders share same session
✓ Payment doesn't close session
✓ Close table validates unpaid orders
✓ Close table with force flag works
✓ Concurrent QR scans create only one session
```

**Files Changed:**
- `tests/session-service.test.js` (NEW)
- `tests/qr-multi-customer-ordering.test.js` (NEW)
- `tests/staff-order-session.test.js` (NEW)
- `tests/close-table.test.js` (NEW)
- Update existing order tests

**Dependencies:** Tasks 1-8

**Risks:**
- MEDIUM: Time-consuming, may discover issues
- Mitigation: Run tests incrementally during development

---

### ✅ Task 10: Documentation & Training
**Status:** 🟡 Not Started  
**Priority:** P3 - Low  
**Effort:** 3 hours  
**Assignee:** Backend Team + Tech Writer

**Description:**
Create documentation for new session management features and migration guide.

**Acceptance Criteria:**
- [ ] API documentation updated for new endpoints
- [ ] Architecture diagrams created (session lifecycle, multi-customer flow)
- [ ] Migration guide for existing deployments
- [ ] README updated with new features
- [ ] Internal wiki updated with troubleshooting guide
- [ ] Staff training materials prepared

**Deliverables:**
- `docs/api/sessions.md` - Session API reference
- `docs/api/orders.md` - Updated order endpoints
- `docs/api/tables.md` - Close table endpoint
- `docs/architecture/session-lifecycle.png` - Flowchart
- `docs/architecture/multi-customer-sequence.png` - Sequence diagram
- `docs/migration/dining-session-migration.md` - Migration guide

**Files Changed:**
- `docs/**/*.md` (NEW/UPDATE)
- `README.md` (UPDATE)

**Dependencies:** Tasks 1-9

**Risks:**
- NONE

---

## Timeline

```
Week 1:
├─ Day 1-2: Task 1 (DiningSession Model)
├─ Day 3: Task 2 (Add session to Orders)
└─ Day 4-5: Task 3 (SessionService - Part 1)

Week 2:
├─ Day 1-2: Task 3 (SessionService - Part 2)
├─ Day 3: Task 4 (Refactor QR Flow)
├─ Day 4: Task 5 (Refactor Customer Orders)
└─ Day 5: Task 6 (Refactor Staff Orders)

Week 3:
├─ Day 1: Task 7 (Close Table Endpoint)
├─ Day 2: Task 8 (Socket.IO Events)
├─ Day 3-4: Task 9 (Tests - Part 1)
└─ Day 5: Task 9 (Tests - Part 2)

Week 4:
├─ Day 1-2: Task 9 (Tests - Part 3, E2E)
├─ Day 3: Task 10 (Documentation)
├─ Day 4: Staging Deployment
└─ Day 5: Production Deployment

Week 5:
└─ Monitoring, Bug Fixes, Optimization
```

**Total Estimated Time:** 22-25 working days (5 weeks)

---

## Success Metrics

### Functional Metrics
- ✅ 100% of QR scans on occupied tables succeed
- ✅ 0 sessions created per occupied table (reuse existing)
- ✅ 0 tables auto-closed after payment
- ✅ 100% of staff orders link to sessions
- ✅ 100% of orders have `source` field populated

### Technical Metrics
- ✅ Session creation p95 latency < 200ms
- ✅ 95%+ test coverage on new code
- ✅ 0 data loss during migration
- ✅ 0 downtime during deployment

### Business Metrics
- ✅ Average orders per session ≥ 2
- ✅ Average session duration tracked accurately
- ✅ Table turnover time measured correctly
- ✅ Revenue per session reported

---

## Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data migration failure | Medium | Critical | Staging tests, rollback plan |
| Race condition bugs | Medium | High | Unique index, retry logic, tests |
| Breaking API changes | Low | Medium | Backward compatibility, versioning |
| Performance degradation | Low | Medium | Indexes, query optimization |
| Staff workflow disruption | Low | Low | Training, clear docs |

---

## Rollback Plan

If critical issues arise post-deployment:

### Immediate (< 5 minutes)
1. Revert to previous deployment
2. Restore database from backup
3. Notify team and users

### Data Recovery (< 30 minutes)
1. Run rollback migration script
2. Verify data integrity
3. Restart services

### Communication
1. Update status page
2. Notify affected users
3. Post-mortem within 48 hours

---

## Approval Sign-off

- [ ] Product Owner: _____________________ Date: _____
- [ ] Tech Lead: _____________________ Date: _____
- [ ] QA Lead: _____________________ Date: _____
- [ ] DevOps: _____________________ Date: _____

---

**Spec Version:** 1.0  
**Last Updated:** 2026-09-03  
**Status:** 🟡 AWAITING APPROVAL
