# Backend Production Remediation - Implementation Plan

**Date**: September 3, 2026  
**Status**: Phase 1 - Inspection Complete  
**Next**: Phase 2 - P0 Remediation  

---

## PHASE 1 INSPECTION FINDINGS

### Current Architecture Summary

#### Key Components Identified

| Component | Location | Status |
|-----------|----------|--------|
| **BranchService** | `src/modules/branch/service/BranchService.js` | 1000+ lines, 27 methods |
| **BranchRepository** | `src/modules/branch/repository/BranchRepository.js` | Thin wrapper, 40+ methods |
| **Branch Model** | `models/branchModel.js` | Has isActive field, indexes on (merchant, branchCode) |
| **Table Model** | `models/tabelModel.js` | Has isActive field, note: filename typo "tabel" not "table" |
| **AuditLog Model** | `models/auditLogModel.js` | Comprehensive, tenant-aware, already supports correlation IDs |
| **Audit Plugin** | `utils/auditPlugin.js` | Auto-logs create/update/delete to AuditLog, supports specified fields |
| **Auth Guard** | `src/common/guards/auth.guard.js` | Validates JWT, populates req.user with full context |
| **Capability Guard** | `src/common/guards/capability.guard.js` | **ISSUE: Optional enforcement via `CAPABILITY_ENFORCEMENT` env var** |
| **RBAC System** | `src/common/guards/auth.guard.js:restrictTo()` | Task-based, endpoint pattern matching with regex compilation |

#### Database Configuration

- **MongoDB** with Mongoose
- **Transactions supported**: ✅ Schema uses Mongoose sessions
- **Indexes**: Present on branch + merchant, table + branch + merchant
- **Missing indexes**: (branch, isActive), (merchant, isActive) for soft-delete queries

#### Existing Infrastructure Strengths

✅ **Comprehensive Audit Plugin**
- Already logs all creates/updates to AuditLog collection
- Tracks old/new values, changes array, merchant isolation
- Non-blocking async logging (setImmediate)
- Support for correlation IDs and request context

✅ **Tenant Isolation Pattern**
- All queries explicitly filter by `merchant: req.user.merchant._id`
- JWT validation fresh on every request
- Merchant populates from DB, not client-supplied

✅ **RBAC System Exists**
- Task-based authorization via role.tasks array
- Endpoint pattern matching with method validation
- Regex compilation with caching

✅ **Authentication**
- JWT-based with refresh/expiry
- Password change detection
- Tenant membership validation

### Issues Identified

#### P0-001: Soft-Delete Not Universally Enforced

**Status**: ✅ Identified, ready to remediate

**Affected Methods** (found via code inspection):
1. `BranchService.getBranch()` - line 445 (missing isActive filter)
2. `BranchService.getTable()` - line 714 (missing isActive filter)
3. `BranchService.updateTable()` - line 727 (missing isActive filter)
4. `BranchService.getAllTables()` - line 697 (missing isActive filter)
5. `BranchService.getTablesByBranch()` - line 847 (missing isActive filter)
6. `BranchService.startTableSessionFromQr()` - line 148 (should not allow inactive tables)
7. `BranchService.validateTableForSession()` - line 270 (missing isActive filter)
8. `BranchService.transitionTableStatus()` - line 294 (missing isActive filter on read)
9. `BranchService.freeTable()` - line 234 (fetches table without isActive check)
10. Table model virtuals (activeSession, currentOrder) - may need filtering
11. `BranchService.getAllBranches()` - line 419 (no isActive filter - line 429 has it in query)
12. `BranchService.getMerchantUsersByBranch()` - line 595 (checks branch.isActive = good)
13. `BranchService.createTable()` - line 636 (pre-check has isActive - good)
14. `BranchService.regenerateTableQr()` - line 816 (has isActive check - good)
15. `BranchService.regenerateBranchQrCodes()` - line 522 (no isActive check)
16. `BranchService.getNearbyBranches()` - line 536 (has isActive check in aggregation - good)
17. Table.moveTo() method - line in tabelModel.js (multi-document, no transaction)
18. `BranchRepository.findBranches()` - thin wrapper, no forced filter
19. `BranchRepository.findTableOne()` - thin wrapper, no forced filter
20. Any QR validation operations

**Scope**: 15-20 queries need isActive filtering or enhancement

**Remediation Strategy**:
1. Add `isActive: true` to BranchRepository methods where appropriate
2. Create centralized helper methods: `findActiveBranch()`, `findActiveTable()`, etc.
3. Update all read/update operations to use helpers
4. Add validation tests for soft-delete enforcement

---

#### P0-002: Optional Capability Enforcement Bypass

**Status**: ✅ Identified, requires immediate fix

**Location**: `src/common/guards/capability.guard.js` line 9

**Current Code**:
```javascript
if (process.env.CAPABILITY_ENFORCEMENT !== 'true') {
  return next();  // ❌ SILENTLY BYPASSES ALL CAPABILITY CHECKS
}
```

**Risk**: 
- If `CAPABILITY_ENFORCEMENT` is missing or false, ALL capability guards become no-ops
- Sensitive endpoints (branch suspend, table status changes) lose authorization layer
- Task-based RBAC is secondary defense, but capability was intended as additional layer

**Remediation Strategy**:
1. **Option A (Recommended)**: Remove optional enforcement
   - Make capabilities always-on
   - If not enabled in production, throw startup error
2. **Option B**: Force enable in production
   - Add startup check: `NODE_ENV=production && CAPABILITY_ENFORCEMENT !== 'true' → throw error`
   - Keep for dev/testing but prevent accidental production bypass

**Files to Audit**:
- All routes using `requireCapability()` in:
  - `src/modules/branch/branch.routes.js`
  - `src/modules/tables/table.routes.js` (if exists)
  - Any admin endpoints

---

#### P0-003: Multi-Document Operations Without Transactions

**Status**: ✅ Identified, requires wrapping

**Affected Methods**:
1. `BranchService.changeTable()` - line 794
   - Moves order from currentTable to newTable
   - Calls `currentTable.changeTable(newTableId)`
   - Updates 2+ tables + sessions without transaction

2. Table.moveTo() - `models/tabelModel.js`
   - Updates session
   - Updates orders
   - Updates table statuses
   - No transaction wrapper

3. `BranchService.deleteBranch()` - line 509
   - Soft-deletes branch
   - Doesn't cascade to tables/sessions (should cascade or prevent)

4. `BranchService.deleteTable()` - line 777
   - Soft-deletes table
   - Deactivates staff assignments atomically? Check implementation

5. `BranchService.freeTable()` - line 234
   - Updates session (sets isActive: false)
   - Transitions table status to 'available'
   - No transaction

**Remediation Strategy**:
1. Use MongoDB session + transaction
2. Pass session to all repository/model calls
3. Commit on success, abort on error
4. Add test cases for transaction rollback

---

#### P1-001: Duplicate Table Race Condition

**Status**: ✅ Identified

**Location**: `BranchService.createTable()` line 654-659

**Pattern**:
```javascript
const existingTable = await BranchRepository.findTableOne({ tableNumber, branch, isActive: true });
if (existingTable) throw error;
// Both concurrent requests pass → both create
```

**Database Protection**: Unique index on (merchant, branch, tableNumber) prevents duplicates
**Error Handling**: E11000 errors likely returned as generic 500

**Remediation Strategy**:
1. Catch E11000 errors in try/catch
2. Return 409 Conflict with appropriate message
3. Option: Implement optimistic retry (not necessary, 409 is sufficient)

---

#### P1-002: Concurrent Table Status Updates

**Status**: ✅ Identified

**Location**: `BranchService.transitionTableStatus()` line 294

**Pattern**: Last-write-wins without version checking

**Remediation Strategy**:
1. Add `__v` field to tableSchema (MongoDB versionKey)
2. Fetch table with version
3. Pass version in update queries
4. MongoDB throws VersionError on mismatch → return 409 Conflict

---

#### P1-003: Audit Logging Already Implemented

**Status**: ✅ Already exists!

**Infrastructure**: 
- AuditLog model with tenant isolation
- auditPlugin auto-logs model changes
- Branch and Table models already use auditPlugin
- Correlation ID support via request-context

**What's Missing**:
- Verify branch.isActive changes are logged
- Verify table status transitions are logged
- Ensure DELETE operations are logged

**Remediation Strategy**:
1. Verify auditPlugin is applied to both models ✅ (already present)
2. Verify all critical status transitions call auditPlugin
3. Add specific audit logging for branch deactivation/activation
4. Test that audit logs capture all state changes

---

#### P2 Issues

**P2-001: No Pagination Limits**
- `getAllTables()` - line 697 uses `ApiFeatures.paginate()` - CHECK if has limits
- `getAllBranches()` - line 419 uses `ApiFeatures.paginate()` - CHECK if has limits

**P2-002: Input Validation**
- Table capacity already has min: 1, max: 50 ✅
- Branch coordinates in schema - need validation
- Phone validation already present ✅

**P2-003: Cascading Deletes**
- `deleteBranch()` doesn't handle dependent tables
- `deleteTable()` deactivates assignments but may not handle orders/sessions

---

## REMEDIATION IMPLEMENTATION PLAN

### Phase 2 - P0 Fixes (Week 1)

#### Task 2-1: Soft-Delete Enforcement

**Files to Modify**:
1. `src/modules/branch/repository/BranchRepository.js`
   - Add helper methods: `findActiveBranch()`, `findActiveBranches()`, `findActiveTable()`, `findActiveTables()`, etc.

2. `src/modules/branch/service/BranchService.js`
   - Update 15-20 methods to use active-only queries

3. `models/tabelModel.js`
   - Add indexes: (branch, isActive), (merchant, isActive)

4. `models/branchModel.js`
   - Add indexes: (merchant, isActive)

**Estimated Effort**: 4-5 hours

---

#### Task 2-2: Mandatory Capability Enforcement

**Files to Modify**:
1. `src/common/guards/capability.guard.js`
   - Remove `if (!CAPABILITY_ENFORCEMENT) return next()`
   - Option: Add startup check in `src/server.js` or `src/app.js`

2. `src/modules/branch/branch.routes.js`
   - Verify all sensitive endpoints have `requireCapability()` guards

**Estimated Effort**: 1 hour

---

#### Task 2-3: Transactional Integrity

**Files to Modify**:
1. `models/tabelModel.js` - `Table.moveTo()` method
   - Wrap in session

2. `src/modules/branch/service/BranchService.js`
   - `changeTable()` - wrap in transaction
   - `freeTable()` - wrap in transaction (if multi-step)
   - `deleteBranch()` - wrap in transaction with cascading logic
   - `deleteTable()` - wrap in transaction

3. Create or use existing `SessionService` for session management

**Estimated Effort**: 6-8 hours

---

### Phase 3 - P1 Fixes (Week 1-2)

#### Task 3-1: Duplicate Table E11000 Handling
- 30 minutes

#### Task 3-2: Optimistic Locking
- Add `__v` field to tableSchema
- 1 hour

#### Task 3-3: Verify Audit Logging
- Already implemented, verify coverage
- 1 hour

---

### Phase 4 - P2 Fixes (Week 2)

#### Task 4-1: Pagination Verification
- Check ApiFeatures for hard limits
- 30 minutes

#### Task 4-2: Input Validation Review
- Verify all fields have constraints
- 1 hour

#### Task 4-3: Branch Dependency Handling
- 2-3 hours

---

### Phase 5 - Testing (Week 2)

#### Test Suite to Create
1. Soft-delete enforcement tests
2. Cross-tenant IDOR tests
3. Concurrent operation tests
4. Transaction rollback tests
5. Authorization tests

**Estimated Effort**: 5-7 hours

---

## CRITICAL FINDINGS

### What's Already Good ✅

1. **Audit Plugin** - Comprehensive, non-blocking, tenant-aware
2. **Auth Pattern** - JWT with fresh DB fetch every request
3. **Multi-Tenancy** - Explicit merchant filtering throughout
4. **RBAC Infrastructure** - Task-based, endpoint-pattern matching
5. **Error Handling** - AppError wrapper with HTTP status codes

### What Needs Immediate Attention ⚠️

1. **Soft-Delete Filters** - ~20 queries need isActive filter
2. **Capability Enforcement** - Optional bypass must be removed
3. **Transactions** - ~4-5 multi-document operations need wrapping
4. **Race Conditions** - Duplicate key error handling needed

### What's Already Handled ✅

1. **Audit Logging** - auditPlugin already logs all changes
2. **Input Validation** - Basic constraints already present
3. **Authentication** - Fresh JWT validation on every request
4. **Pagination** - ApiFeatures already in use (verify limits)

---

## TESTING STRATEGY

### Test Files to Create

1. **`tests/production-readiness-soft-delete.test.js`**
   - Test active vs inactive branch access
   - Test active vs inactive table access
   - Test IDOR: cross-tenant cannot access inactive resources

2. **`tests/production-readiness-capability.test.js`**
   - Test capability enforcement enabled
   - Test capability enforcement cannot be disabled in production

3. **`tests/production-readiness-transactions.test.js`**
   - Test changeTable atomicity
   - Test transaction rollback on failure
   - Test no partial state on crash

4. **`tests/production-readiness-concurrency.test.js`**
   - Test concurrent table creation
   - Test concurrent status updates
   - Test duplicate key handling

5. **`tests/production-readiness-authorization.test.js`**
   - Test branch authorization
   - Test table authorization
   - Test cross-tenant denials

---

## DEPLOYMENT REQUIREMENTS

### Environment Variables
- Add `CAPABILITY_ENFORCEMENT=true` (required in production)
- Verify `NODE_ENV=production` check

### Database Migrations
- Add indexes: (merchant, isActive), (branch, isActive)
- Add `__v` field to tableSchema (Mongoose auto-manages)

### Configuration Changes
None required if all changes are backward-compatible

---

## ROLLOUT STRATEGY

### Phase Sequence
1. **Week 1**: P0 fixes (soft-delete, capability, transactions)
2. **Week 1-2**: P1 fixes (concurrency, locking, audit verification)
3. **Week 2**: P2 fixes (pagination, validation, cascades)
4. **Week 2**: Comprehensive testing
5. **Week 3**: Staging deployment
6. **Week 4**: Production deployment

### Rollback Plan
- All changes are additive (no breaking changes)
- isActive filters only restrict access (safe)
- Transactions only add safety (safe)
- Capability enforcement tighter (safe)

---

## NEXT STEPS

1. ✅ **Inspection Complete**
2. → **Start Phase 2-1: Soft-Delete Enforcement**
3. Implement BranchRepository helpers
4. Update all affected service methods
5. Add tests
6. Verify no regressions

---

**END OF IMPLEMENTATION PLAN**
