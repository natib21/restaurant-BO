# Dining Session Refactor - Quick Summary

## 📋 What We're Building

Transform the current **customer-session-per-order** model into a **table-dining-session** model that supports:
- ✅ Multiple customers at one table
- ✅ Multiple orders per session
- ✅ QR + staff orders in same session
- ✅ Individual payment doesn't close table
- ✅ Staff manually closes table when visit ends

---

## 🔍 Current State Analysis

### What Exists ✅
- `CustomerSession` model (needs renaming)
- Partial unique index for one active session per table
- QR token system working
- Separate QR and staff order flows
- Payment status separate from order status ✅

### What's Broken ❌
1. QR blocked when table "occupied" 
2. Individual customer session, not table session
3. Payment closes table automatically
4. No `sessionId` on orders
5. No centralized session service
6. Staff orders don't create sessions

---

## 🎯 10 Main Tasks

### Task 1: Rename `CustomerSession` → `DiningSession`
- **Time:** 3-4 hours
- **Risk:** MEDIUM
- Create new model with `status`, `startedAt`, `endedAt`, `createdBy`
- Remove `customer` and `deviceInfo` fields
- Migration script to transform existing data

### Task 2: Add `session` field to Orders
- **Time:** 2 hours  
- **Risk:** HIGH (data migration)
- Add `session: ObjectId` reference
- Update `source` enum to include `'qr'` and `'staff'`
- Create sessions for existing active orders

### Task 3: Create `SessionService` (CORE)
- **Time:** 6-8 hours
- **Risk:** HIGH
- `getOrCreateActiveSession()` - used by both QR and staff
- `endSession()` - close table with validation
- `getSessionOrders()` - query orders by session
- Race condition handling with retry logic

### Task 4: Refactor QR Flow
- **Time:** 3-4 hours
- **Risk:** MEDIUM
- Remove "table occupied" blocking ❌
- Use `SessionService.getOrCreateActiveSession()`
- Return existing session if already active

### Task 5: Refactor Customer Orders
- **Time:** 3 hours
- **Risk:** MEDIUM
- Update `OrderTransactionService.executePlaceOrder()`
- Link orders to `session._id`
- Mark source as `'qr'`

### Task 6: Refactor Staff Orders  
- **Time:** 4 hours
- **Risk:** MEDIUM
- Update `OrderService.staffPlaceOrder()`
- Use `SessionService.getOrCreateActiveSession()`
- Mark source as `'staff'`
- Track `createdBy` user

### Task 7: Create Close Table Endpoint
- **Time:** 3 hours
- **Risk:** LOW
- `POST /api/v1/tables/:tableId/close`
- Validate no unpaid orders
- Support `force` flag for override
- Set table to `needs-cleaning`

### Task 8: Update Socket.IO Events
- **Time:** 2 hours
- **Risk:** LOW
- `session:created` event
- `session:ended` event
- Emit to staff dashboards

### Task 9: Write Tests
- **Time:** 6-8 hours
- **Risk:** MEDIUM
- Unit tests for SessionService
- Integration tests for multi-customer QR
- E2E tests for close table workflow
- Race condition tests

### Task 10: Documentation
- **Time:** 2-3 hours
- **Risk:** NONE
- API docs
- Architecture diagrams
- Migration guide

---

## 📊 Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Analysis & Planning | 2 days | Review, approve architecture |
| Implementation | 10-12 days | Tasks 1-8 |
| Testing | 5 days | Task 9 + QA |
| Deployment | 3 days | Staging → Production |
| **TOTAL** | **20-22 days** | **4-5 weeks** |

---

## 🚨 High-Risk Areas

### 1. Database Migration (Task 2)
**Risk:** Existing orders need `sessionId`  
**Mitigation:**
- Create sessions for tables with active orders
- Backfill `sessionId` where possible
- Test extensively in staging first

### 2. Race Conditions (Task 3)
**Risk:** Two QR scans at same time create duplicate sessions  
**Mitigation:**
- Partial unique index on `DiningSession.table`
- Retry logic on duplicate key error
- Integration tests for concurrent requests

### 3. Breaking Changes (Tasks 4-6)
**Risk:** API response formats may change  
**Mitigation:**
- Maintain backward compatibility during transition
- Version sensitive endpoints
- Phased rollout with feature flags

---

## ✅ Success Criteria

### Functional
- [x] Multiple customers can scan same table QR
- [x] QR and staff orders share same session
- [x] Payment doesn't auto-close session
- [x] Staff can close table manually
- [x] All orders link to session
- [x] Source tracking works (`qr` vs `staff`)

### Technical
- [x] Session creation < 200ms (p95)
- [x] 95% test coverage on new code
- [x] Zero data loss during migration
- [x] Zero downtime deployment
- [x] Clear rollback capability

---

## 🔧 Key Code Changes

### Before (Current)
```javascript
// QR Scan
if (table.status === 'occupied') {
  throw new AppError('Table occupied', 400); // ❌ BLOCKS
}
const session = await CustomerSession.create({
  table: tableId,
  customer: customerId // ❌ Individual customer
});

// Staff Order
const order = await Order.create({
  table: tableId,
  // ❌ No session link
  // ❌ No source tracking
});
```

### After (Target)
```javascript
// QR Scan
const { session, isNew } = await SessionService.getOrCreateActiveSession({
  tableId: tableId,
  createdBy: null // ✅ QR-initiated
});
// ✅ Returns existing session if occupied

// Staff Order
const { session } = await SessionService.getOrCreateActiveSession({
  tableId: tableId,
  createdBy: staffUserId // ✅ Staff-initiated
});

const order = await Order.create({
  table: tableId,
  session: session._id, // ✅ Linked to session
  source: 'staff'       // ✅ Tracked
});
```

---

## 📁 Files to Modify

### Models (4 files)
- `models/DiningSession.js` ← NEW (renamed from CustomerSession)
- `models/orderModel.js` ← UPDATE (add session field)
- `models/tabelModel.js` ← UPDATE (virtual reference)
- `models/customerSessionModule.js` ← ALIAS (backward compat)

### Services (3 files)
- `src/modules/sessions/service/SessionService.js` ← NEW
- `src/modules/order/service/OrderTransactionService.js` ← UPDATE
- `src/modules/order/service/OrderService.js` ← UPDATE

### Controllers (3 files)
- `src/modules/branch/service/BranchService.js` ← UPDATE
- `src/modules/order/controller/handlers/placement.handler.js` ← UPDATE
- `src/modules/tables/table.controller.js` ← UPDATE (close endpoint)

### Routes (1 file)
- `src/modules/tables/tables.routes.js` ← UPDATE (add close route)

### Events (1 file)
- `src/modules/notifications/events/session-events.js` ← NEW

### Tests (5+ files)
- `tests/session-service.test.js` ← NEW
- `tests/qr-multi-customer-ordering.test.js` ← NEW
- `tests/staff-order-session.test.js` ← NEW
- `tests/close-table.test.js` ← NEW
- Update existing order tests

---

## 🔄 Migration Steps

### 1. Backup
```bash
mongodump --uri="mongodb://..." --out=backup-$(date +%Y%m%d)
```

### 2. Run Migrations
```bash
npm run migrate:up
```

### 3. Verify
```bash
npm run verify:sessions
npm run verify:orders
```

### 4. Rollback (if needed)
```bash
npm run migrate:down
```

---

## 📞 Support & Questions

For questions during implementation:
1. Refer to `DINING-SESSION-IMPLEMENTATION-GUIDE.md` (full details)
2. Check architecture diagrams in `/docs/architecture/`
3. Review test examples in `/tests/`
4. Contact: Backend Team Lead

---

**Status:** 🟡 READY FOR APPROVAL  
**Next Step:** Team review meeting  
**Assigned To:** Backend Team  
**Priority:** HIGH
