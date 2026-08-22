# Route 3: POST /api/v1/menu/publish - Phase B Migration Plan

**Generated:** 2026-08-21  
**Status:** Ready for Review  
**Phase A Investigation:** Approved with feedback addressed

---

## Executive Summary

This plan sequences the Route 3 migration into **three independent, testable steps** to ensure each change can be isolated, verified, and rolled back if needed. The sequence prioritizes data integrity first, then architectural consistency, then compliance.

**Critical Constraint:** All work remains in a feature branch until PRODUCT-DECISION-TIE-BREAKING-BEHAVIOR.md is resolved (even though Route 3 does not sort MenuGroups, the broader menu module is under deployment hold).

---

## Migration Sequence Overview

| Step | Change | Priority | Risk | Tests Pass Before Next Step? |
|------|--------|----------|------|------------------------------|
| **Step 1** | Add transaction safety + race condition fix | **CRITICAL** | HIGH | ✅ Required |
| **Step 2** | Relocate to MenuGroupService | Medium | Low | ✅ Required |
| **Step 3** | Add audit logging | Low | Low | ✅ Required |

**Rationale for Sequence:**
1. **Transaction safety first** - Fixes the actual data-integrity risk (MenuItem + MenuPublication inconsistency)
2. **Service relocation second** - Clean architecture, but no functional change (pure refactor)
3. **Audit logging third** - Compliance enhancement, no behavior change

**Why Not Combined?**
- If Step 1 (transaction) causes a regression, we know it's the transaction logic, not the service move or audit code
- If Step 2 (service move) breaks, we can revert without losing the transaction safety already gained
- If Step 3 (audit) has issues, core publish functionality is already safe and consistent

---

## Step 1: Add Transaction Safety + Race Condition Fix

### Objective
Ensure atomic commit of MenuItem.publishStatus updates and MenuPublication record creation, and eliminate version-number race condition.

### Current Risk
**Scenario:** Two concurrent requests to publish the same (merchant, branch, menuGroup):
1. Request A reads last version (e.g., version 2)
2. Request B reads last version (also version 2, race window)
3. Request A creates MenuPublication with version 3
4. Request B attempts to create MenuPublication with version 3 → **Unique constraint violation** on `(merchant, branch, menuGroup, version)`

**Current Behavior:** Request B fails with MongoDB duplicate key error (E11000), but Request A's MenuItems are already marked `publishStatus: 'published'`. If Request B retries without handling the race, it will read version 3 and create version 4, but Request B's MenuItem updates may have already partially succeeded (depending on failure timing).

**Additional Risk:** If MenuPublication.create() fails for any reason (validation, disk space, etc.), MenuItem.publishStatus is already updated (no rollback).

### Solution Approach

**Mechanism:** MongoDB transaction with retry logic on unique constraint violation.

**Why This Works:**
- MongoDB transactions provide **snapshot isolation** (read committed)
- The unique index `(merchant, branch, menuGroup, version)` acts as a serialization point
- If two transactions attempt to insert the same version, one succeeds and the other aborts
- The losing transaction retries inside the same transaction boundary, reads the incremented version, and succeeds with version+1

### Implementation

**File:** `src/modules/menu/menu-management.service.js`

**Change:** Wrap lines 73-113 (version calculation through MenuPublication.create) in a transaction with retry logic.

```javascript
static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
  // Validation outside transaction (no DB writes, can fail fast)
  const { group, menus, missing } = await MenuManagementService.validateRecipesForGroup(
    menuGroupId,
    merchantId
  );

  if (missing.length > 0) {
    throw new AppError(`Cannot publish: ${missing.length} item(s) missing active recipes`, 400);
  }

  if (!group.branches.map(b => b.toString()).includes(String(branchId))) {
    throw new AppError('Menu group is not assigned to this branch', 400);
  }

  // ✅ NEW: Transaction with retry logic
  const MAX_RETRIES = 3;
  let attempt = 0;
  let publication = null;

  while (attempt < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Read latest version inside transaction
      const last = await MenuPublication.findOne({
        merchant: merchantId,
        branch: branchId,
        menuGroup: menuGroupId,
      })
        .sort('-version')
        .select('version')
        .session(session)  // ✅ Read within transaction
        .lean();

      const version = (last?.version || 0) + 1;

      // Update MenuItem.publishStatus (transactional)
      await Menu.updateMany(
        { _id: { $in: menus.map(m => m._id) }, merchant: merchantId },
        { $set: { publishStatus: 'published' } },
        { session }  // ✅ Write within transaction
      );

      // Build snapshot
      const snapshot = {
        menuGroup: {
          _id: group._id,
          name: getMenuGroupName(group, 'en'),
          visibility: group.visibility,
          priority: group.priority,
        },
        items: group.items.map(item => ({
          menu: item.menu,
          sortOrder: item.sortOrder,
          overridePrice: item.overridePrice,
          isHidden: item.isHidden,
        })),
        menus: menus.map(m => ({
          _id: m._id,
          name: getMenuName(m, 'en'),
          publishStatus: 'published',
        })),
      };

      // Create MenuPublication (transactional)
      const [newPublication] = await MenuPublication.create(
        [{
          merchant: merchantId,
          branch: branchId,
          menuGroup: menuGroupId,
          version,
          publishedBy,
          snapshot,
          recipeValidation: { passed: true, missingRecipes: [] },
        }],
        { session }  // ✅ Write within transaction
      );

      // Commit transaction
      await session.commitTransaction();
      publication = newPublication;

      logger.info('menu.published', {
        menuGroupId: String(menuGroupId),
        branchId: String(branchId),
        version,
        merchantId: String(merchantId),
        attempt: attempt + 1,  // Log retry count for monitoring
      });

      break;  // Success, exit retry loop

    } catch (error) {
      await session.abortTransaction();

      // ✅ Determine if error is retryable
      const isTransientError = error.errorLabels?.includes('TransientTransactionError');
      const isDuplicateVersion = error.code === 11000 && error.keyPattern?.version;
      const isRetryable = isTransientError || isDuplicateVersion;

      if (isRetryable) {
        attempt++;
        if (attempt < MAX_RETRIES) {
          const errorType = isTransientError ? 'transient_transaction_error' : 'version_conflict';
          logger.warn('menu.publish.retryable_error', {
            menuGroupId: String(menuGroupId),
            branchId: String(branchId),
            merchantId: String(merchantId),
            errorType,
            errorCode: error.code,
            errorLabels: error.errorLabels,
            attempt,
            retrying: true,
          });
          continue;  // Retry with updated version
        } else {
          // Max retries exhausted
          logger.error('menu.publish.max_retries_exhausted', {
            menuGroupId: String(menuGroupId),
            branchId: String(branchId),
            merchantId: String(merchantId),
            attempts: MAX_RETRIES,
            lastErrorCode: error.code,
            lastErrorLabels: error.errorLabels,
          });
          throw new AppError(
            'Publish failed due to concurrent modification. Please try again.',
            409
          );
        }
      }

      // Non-retryable errors (validation, disk space, permission, etc.)
      logger.error('menu.publish.transaction_failed', {
        error: error.message,
        stack: error.stack,
        errorCode: error.code,
        errorLabels: error.errorLabels,
        menuGroupId: String(menuGroupId),
        branchId: String(branchId),
        merchantId: String(merchantId),
      });
      throw error;

    } finally {
      session.endSession();
    }
  }

  return publication;
}
```

### Race Condition Fix: Explicit Mechanism

**How Concurrent Publishes and Transient Errors Are Handled:**

**Two Retry Triggers:**

1. **TransientTransactionError** (MongoDB's standard retry label)
   - Occurs during normal concurrent transaction conflicts
   - Error code 112 (WriteConflict) or other transient failures
   - MongoDB documentation mandates retry for any error with this label
   - Checked via: `error.errorLabels?.includes('TransientTransactionError')`

2. **Duplicate Version Key** (application-level conflict)
   - Unique constraint violation on `(merchant, branch, menuGroup, version)`
   - Error code 11000 (duplicate key)
   - Checked structurally via: `error.keyPattern?.version` (not string matching)
   - Avoids brittleness from error message format changes

**Concurrent Publish Scenario:**

1. **Transaction A** starts, reads version 2, increments to 3
2. **Transaction B** starts (concurrent), reads version 2, increments to 3
3. **Transaction A** creates MenuPublication(version=3), commits successfully
4. **Transaction B** attempts to create MenuPublication(version=3) → **Unique index violation** (E11000, keyPattern.version)
5. **Transaction B** aborts, retry logic detects `error.code === 11000 && error.keyPattern?.version`
6. **Transaction B** retries, reads version 3 (A's commit is now visible), increments to 4
7. **Transaction B** creates MenuPublication(version=4), commits successfully

**Transient Write Conflict Scenario:**

1. **Transaction A** starts, reads MenuItem records, updates publishStatus
2. **Transaction B** starts (concurrent), reads same MenuItem records
3. **Transaction A** commits
4. **Transaction B** attempts to write → **WriteConflict** (error code 112, errorLabels: ['TransientTransactionError'])
5. **Transaction B** aborts, retry logic detects `error.errorLabels.includes('TransientTransactionError')`
6. **Transaction B** retries with fresh snapshot, reads A's committed state, completes successfully

**Key Properties:**
- ✅ No lost updates (both concurrent transactions succeed)
- ✅ No partial state (transaction abort rolls back all writes atomically)
- ✅ Bounded retries (max 3 attempts, then 409 Conflict error)
- ✅ Handles both version conflicts AND transient write conflicts
- ✅ Robust against MongoDB driver upgrades (uses structural checks, not string matching)
- ✅ Monotonic versions (version always increments, no gaps except on permanent failure)

### Changes to Existing Code

**Lines Changed:**
- `menu-management.service.js` lines 56-113 (entire `publishMenuGroup` method)

**Backward Compatibility:**
- ✅ Request/response contract unchanged
- ✅ Error messages preserved (except new 409 for max retries)
- ✅ MenuPublication schema unchanged
- ✅ MenuItem schema unchanged

### Testing Requirements for Step 1

**Test File:** `tests/menu-publish-transaction.test.js` (new file)

**Test Cases:**
1. ✅ **Happy path:** Publish succeeds, both MenuItem and MenuPublication committed
2. ✅ **Rollback on MenuPublication failure:** Simulate validation error, verify MenuItem.publishStatus NOT updated
3. ✅ **Concurrent publish (same menuGroup, same branch):** Two parallel requests, verify versions 3 and 4 created (no duplicate version)
4. ✅ **Concurrent publish (different branches):** Two parallel requests to different branches, both succeed with version 1 each
5. ✅ **Max retries exhausted:** Simulate persistent version conflict, verify 409 error after 3 attempts
6. ✅ **Transaction abort on network error:** Simulate connection drop mid-transaction, verify no partial writes
7. ✅ **TransientTransactionError retry:** Mock a transient write conflict (error with 'TransientTransactionError' label), verify retry succeeds

**Assertion Strategy:**
```javascript
// Verify atomicity
const publication = await publishMenuGroup({ ... });
const menuItems = await Menu.find({ _id: { $in: itemIds } });
expect(menuItems.every(m => m.publishStatus === 'published')).toBe(true);
expect(publication.version).toBe(expectedVersion);

// Verify rollback
await expect(publishWithInvalidData()).rejects.toThrow();
const menuItems = await Menu.find({ _id: { $in: itemIds } });
expect(menuItems.every(m => m.publishStatus === 'draft')).toBe(true);  // ✅ Not updated

// Verify TransientTransactionError retry
const originalCreate = MenuPublication.create;
let attemptCount = 0;
MenuPublication.create = jest.fn().mockImplementation(function(...args) {
  attemptCount++;
  if (attemptCount === 1) {
    // First attempt: throw TransientTransactionError
    const error = new Error('WriteConflict');
    error.code = 112;
    error.errorLabels = ['TransientTransactionError'];
    throw error;
  }
  // Second attempt: succeed
  return originalCreate.apply(this, args);
});

const publication = await publishMenuGroup({ ... });
expect(attemptCount).toBe(2);  // ✅ Retry occurred
expect(publication).toBeDefined();  // ✅ Eventually succeeded
MenuPublication.create = originalCreate;  // Restore

// Verify structural duplicate key check (not string matching)
const error = new Error('E11000 duplicate key error');
error.code = 11000;
error.keyPattern = { merchant: 1, branch: 1, menuGroup: 1, version: 1 };
// Retry logic should trigger based on keyPattern.version, not message content
```

### Step 1 Success Criteria

- ✅ All 7 test cases pass (including TransientTransactionError test)
- ✅ No regressions in existing menu-related tests
- ✅ Manual test: Publish same menu twice in rapid succession (< 100ms apart), verify both succeed with different versions
- ✅ Code review: Transaction boundaries correct, retry logic handles both error types (TransientTransactionError and duplicate version)

**Do not proceed to Step 2 until all Step 1 tests pass.**

---

## Step 2: Relocate to MenuGroupService

### Objective
Move `publishMenuGroup` logic from `MenuManagementService` to `MenuGroupService` for architectural consistency with Routes 1 and 2.

### Rationale
- Routes 1 (getPublicMenu) and 2 (getStaffMenu) use `MenuGroupService`
- Publishing is a MenuGroup operation (publishes a MenuGroup for a branch)
- Reduces confusion about which service owns menu group lifecycle

### Implementation

**Pure Refactor:** No logic changes, just code relocation.

**Step 2a: Add method to MenuGroupService**

**File:** `src/modules/menu/service/MenuGroup.service.js`

```javascript
const { MenuManagementService } = require('../menu-management.service');

class MenuGroupService {
  // ... existing methods (getPublicMenu, getStaffMenu) ...

  /**
   * Publish menu group for a branch — creates versioned snapshot.
   * 
   * @param {Object} params
   * @param {ObjectId} params.menuGroupId - Menu group to publish
   * @param {ObjectId} params.merchantId - Merchant context
   * @param {ObjectId} params.branchId - Target branch
   * @param {ObjectId} params.publishedBy - User performing publish
   * @returns {Promise<MenuPublication>}
   */
  static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
    // Delegate to MenuManagementService (Step 1's transactional implementation)
    return MenuManagementService.publishMenuGroup({
      menuGroupId,
      merchantId,
      branchId,
      publishedBy,
    });
  }
}
```

**Step 2b: Update MenuService to delegate to MenuGroupService**

**File:** `src/modules/menu/service/MenuService.js`

**Before:**
```javascript
static publishMenuGroup(params) {
  return MenuManagementService.publishMenuGroup(params);
}
```

**After:**
```javascript
static publishMenuGroup(params) {
  return MenuGroupService.publishMenuGroup(params);  // ✅ Now routes through MenuGroupService
}
```

**Step 2c: Update controller (optional, for direct access)**

**File:** `src/modules/menu/controller/menu.controller.js`

**Before:**
```javascript
const { MenuService } = require('../service/MenuService');

exports.publishMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { menuGroupId, branchId } = req.body;

  const publication = await MenuService.publishMenuGroup({  // ✅ Goes through MenuService wrapper
    menuGroupId,
    merchantId,
    branchId,
    publishedBy: req.user._id,
  });

  sendResponse(res, 201, 'publication', publication);
});
```

**After (optional improvement):**
```javascript
const MenuGroupService = require('../service/MenuGroup.service');

exports.publishMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { menuGroupId, branchId } = req.body;

  const publication = await MenuGroupService.publishMenuGroup({  // ✅ Direct call (skips MenuService wrapper)
    menuGroupId,
    merchantId,
    branchId,
    publishedBy: req.user._id,
  });

  sendResponse(res, 201, 'publication', publication);
});
```

**Recommendation:** Apply the controller change (direct call) for cleaner dependency graph. The MenuService wrapper can remain for backward compatibility if other code uses it.

### Changes to Existing Code

**Files Changed:**
- `src/modules/menu/service/MenuGroup.service.js` (add `publishMenuGroup` method)
- `src/modules/menu/service/MenuService.js` (update delegation target)
- `src/modules/menu/controller/menu.controller.js` (optional: direct call to MenuGroupService)

**Backward Compatibility:**
- ✅ Request/response unchanged
- ✅ Error messages unchanged
- ✅ MenuManagementService.publishMenuGroup still exists (not removed, just delegates)
- ✅ Existing code calling MenuService.publishMenuGroup still works (delegation chain preserved)

### Testing Requirements for Step 2

**Test File:** Reuse existing tests from Step 1 (no new tests needed, just verify no regressions)

**Test Strategy:**
1. ✅ Run all Step 1 tests → Verify still passing
2. ✅ Run existing menu integration tests → Verify no breakage
3. ✅ Manual smoke test: Publish via API endpoint → Verify 201 response

**Assertion:** No functional change, so existing tests should pass without modification.

### Step 2 Success Criteria

- ✅ All Step 1 tests still pass
- ✅ No regressions in menu test suite
- ✅ Code review: Import paths correct, delegation chain clear

**Do not proceed to Step 3 until Step 2 verification complete.**

---

## Step 3: Add Audit Logging

### Objective
Capture publish events in the audit log for compliance and forensics.

### Audit Mechanism Choice

**Two Existing Mechanisms:**

1. **MenuItem.audit-plugin** (automatic)
   - Already logs `publishStatus` field changes (draft → published)
   - Logs each MenuItem individually
   - Captures: `user`, `merchant`, `action: 'UPDATE'`, `resource: 'MenuItem'`, `oldValues`, `newValues`

2. **Manual auditLogger** (explicit)
   - Must be called manually in service code
   - Logs the publish action as a single event
   - Captures: `user`, `merchant`, `branch`, `action: 'MENU_PUBLISH'`, `resource: 'MenuPublication'`, `resourceId: publication._id`

### Decision: Which Is Authoritative?

**Recommendation:** **Manual auditLogger is the authoritative source** for "who published this menu group and when."

**Rationale:**

| Aspect | audit-plugin (MenuItem) | Manual auditLogger (MenuPublication) |
|--------|------------------------|-------------------------------------|
| Granularity | Per-item (N entries for N items) | Single entry per publish action |
| Context | Individual MenuItem updates | MenuGroup publish operation |
| Branch info | ❌ Not captured | ✅ Captured |
| Version info | ❌ Not captured | ✅ Captured (via resourceId) |
| Correlation | ❌ Hard to correlate N items to 1 publish | ✅ Single event ID |
| Action label | `UPDATE` (generic) | `MENU_PUBLISH` (specific) |

**Conclusion:**
- **Use audit-plugin for item-level forensics** (e.g., "Was item X modified during publish Y?")
- **Use manual auditLogger for publish-level forensics** (e.g., "Who published menu group Z to branch A at time T?")
- Both audit trails exist and are complementary, not redundant.

**Source of Truth Designation:**
- **When answering "Who published and when?"** → Query `AuditLog` where `action: 'MENU_PUBLISH'` and `resource: 'MenuPublication'`
- **When answering "What items changed?"** → Query `AuditLog` where `action: 'UPDATE'` and `resource: 'MenuItem'` within the same time window

### Implementation

**File:** `src/modules/menu/menu-management.service.js`

**Change:** Add manual audit log entry after successful publish (inside Step 1's transaction commit).

```javascript
static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
  // ... Step 1's transaction logic ...

  // ✅ Commit transaction
  await session.commitTransaction();
  publication = newPublication;

  logger.info('menu.published', {
    menuGroupId: String(menuGroupId),
    branchId: String(branchId),
    version,
    merchantId: String(merchantId),
    attempt: attempt + 1,
  });

  // ✅ NEW: Manual audit log entry (after commit, not inside transaction)
  try {
    await auditLogger({
      user: publishedBy,
      merchant: merchantId,
      branch: branchId,
      action: 'MENU_PUBLISH',
      resource: 'MenuPublication',
      resourceId: publication._id,
      severity: 'medium',  // Publishing is a significant operational change
      outcome: 'success',
      metadata: {
        menuGroupId: String(menuGroupId),
        menuGroupName: getMenuGroupName(group, 'en'),
        version: publication.version,
        itemCount: menus.length,
        timestamp: publication.publishedAt.toISOString(),
      },
    });
  } catch (auditError) {
    // Audit failure should not block publish success
    logger.error('menu.publish.audit_failed', {
      error: auditError.message,
      publicationId: String(publication._id),
      menuGroupId: String(menuGroupId),
      branchId: String(branchId),
    });
    // Don't throw — publish already succeeded
  }

  break;  // Success, exit retry loop
}
```

**Why After Commit?**
- Audit log is a secondary concern (compliance), not a primary operation
- If audit fails, publish should still succeed (graceful degradation)
- Audit write failure should not cause transaction rollback

**Import Addition:**
```javascript
const auditLogger = require('../../../utils/auditLogger');
```

### Changes to Existing Code

**Files Changed:**
- `src/modules/menu/menu-management.service.js` (add auditLogger call)

**Backward Compatibility:**
- ✅ Request/response unchanged
- ✅ Publish behavior unchanged (audit is post-commit, doesn't affect outcome)

### Testing Requirements for Step 3

**Test File:** `tests/menu-publish-audit.test.js` (new file)

**Test Cases:**
1. ✅ **Audit entry created:** Publish succeeds, verify AuditLog record exists with correct fields
2. ✅ **Audit failure doesn't block publish:** Mock auditLogger to throw error, verify publish still succeeds (201 response)
3. ✅ **Correlation with MenuItem audit:** Publish, query AuditLog for both `MENU_PUBLISH` and `UPDATE` actions, verify both exist and have same timestamp (within 1 second)
4. ✅ **Metadata completeness:** Verify audit entry includes menuGroupId, version, itemCount, branch

**Assertion Strategy:**
```javascript
const publication = await publishMenuGroup({ ... });

// Verify audit entry
const auditEntry = await AuditLog.findOne({
  action: 'MENU_PUBLISH',
  resource: 'MenuPublication',
  resourceId: publication._id,
});

expect(auditEntry).toBeDefined();
expect(auditEntry.user.toString()).toBe(userId.toString());
expect(auditEntry.merchant.toString()).toBe(merchantId.toString());
expect(auditEntry.branch.toString()).toBe(branchId.toString());
expect(auditEntry.metadata.version).toBe(publication.version);
expect(auditEntry.severity).toBe('medium');
expect(auditEntry.outcome).toBe('success');
```

### Step 3 Success Criteria

- ✅ All 4 audit test cases pass
- ✅ No regressions in Step 1 or Step 2 tests
- ✅ Manual test: Publish, check database for AuditLog entry
- ✅ Code review: Audit call placement correct (after commit, with error handling)

---

## Additional Enhancements (Optional, Post-Migration)

These are NOT part of the sequenced migration (Steps 1-3) but can be added later:

### Enhancement A: Exclude Soft-Deleted Items

**File:** `menu-management.service.js::validateRecipesForGroup`

**Change:**
```javascript
const menus = await Menu.find({
  _id: { $in: menuIds },
  merchant: merchantId,
  available: true,
  deletedAt: null,  // ✅ Add this line
}).select('_id name publishStatus');
```

**Test:** Create soft-deleted MenuItem, add to MenuGroup, attempt publish → Verify item excluded from validation and snapshot.

### Enhancement B: Empty Menu Group Validation (Product Decision Needed)

**File:** `menu-management.service.js::publishMenuGroup`

**Change:**
```javascript
if (group.items.length === 0) {
  throw new AppError('Cannot publish empty menu group', 400);
}
```

**Decision Required:** Should empty menu groups be publishable? (See Phase A, Section 14, Question 1)

---

## Rollback Plan

### If Step 1 Fails

**Symptoms:** Transaction errors, version conflicts not resolving, MenuItem/MenuPublication inconsistency

**Action:**
1. Revert `menu-management.service.js` to pre-Step-1 state
2. Verify existing tests pass
3. Investigate transaction isolation level or retry logic
4. Re-attempt Step 1 with fixes

**Data Impact:** None (feature branch, not deployed)

### If Step 2 Fails

**Symptoms:** Import errors, "method not found" errors, delegation chain broken

**Action:**
1. Revert service files to Step 1 state (keep transaction changes, undo service move)
2. Verify Step 1 tests still pass
3. Fix import paths or delegation logic
4. Re-attempt Step 2

**Data Impact:** None (pure refactor, no DB changes)

### If Step 3 Fails

**Symptoms:** Audit log writes fail, publish requests hang, unexpected errors

**Action:**
1. Revert `menu-management.service.js` to Step 2 state (remove auditLogger call)
2. Verify Steps 1 and 2 tests still pass
3. Fix audit logging mechanism
4. Re-attempt Step 3

**Data Impact:** None (audit is post-commit, doesn't affect publish outcome)

---

## Documentation Updates (Phase E)

After all three steps complete:

1. **Update FRONTEND-MENU-API-MIGRATION-GUIDE.md:**
   - Add Route 3 (POST /api/v1/menu/publish) section
   - Document request body, response format, error codes (including new 409 for version conflict)

2. **Update MENU-MANAGEMENT-WORKFLOW-GUIDE.md:**
   - Add publish workflow diagram (draft → validation → transaction → published)
   - Document version conflict retry behavior

3. **Create MENU-PUBLISH-AUDIT-REFERENCE.md:**
   - Document audit trail structure
   - Explain difference between `MENU_PUBLISH` (MenuPublication) and `UPDATE` (MenuItem) audit entries
   - Provide query examples for forensics

4. **Update API specification (if exists):**
   - POST /api/v1/menu/publish endpoint
   - New 409 error code for max retry exhaustion

---

## Timeline Estimate

| Step | Implementation | Testing | Code Review | Total |
|------|---------------|---------|-------------|-------|
| Step 1 | 3 hours | 2 hours | 1 hour | **6 hours** |
| Step 2 | 1 hour | 0.5 hours | 0.5 hours | **2 hours** |
| Step 3 | 1 hour | 1 hour | 0.5 hours | **2.5 hours** |
| Phase E Docs | - | - | - | **1.5 hours** |
| **Total** | | | | **12 hours** |

**Assumptions:**
- No blocking issues discovered during implementation
- Test environment available (local MongoDB with replica set for transactions)
- Code reviews completed within 1 business day

---

## Dependencies and Prerequisites

### Technical Prerequisites

1. **MongoDB Replica Set Required:**
   - Transactions require MongoDB replica set (not standalone)
   - Development environment must have `mongod --replSet rs0` configured
   - Verify with: `db.adminCommand({ replSetGetStatus: 1 })`

2. **Mongoose Version:**
   - Mongoose >= 5.2.0 (for transaction support)
   - Verify with: `npm list mongoose`

3. **Test Database:**
   - Separate test DB with replica set enabled
   - Seed data for merchants, branches, menu groups, menu items

### No External Blockers

- ✅ No schema migrations needed
- ✅ No API contract changes (except new 409 error code, backward compatible)
- ✅ No frontend changes required
- ✅ No product decisions blocking (tie-breaking decision doesn't affect Route 3)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Transaction performance degradation | Low | Medium | Monitor transaction duration, add timeout (10s max) |
| Retry logic infinite loop | Low | High | Max 3 retries enforced, 409 error after exhaustion |
| Audit log write failure blocks publish | Low | High | Audit call outside transaction, error caught and logged |
| Version conflict under high load | Medium | Low | Retry logic handles this, but monitor retry rate |
| Rollback failure mid-transaction | Low | Critical | MongoDB handles atomically, test with network drop simulation |

**Highest Risk:** Transaction performance under high concurrency (e.g., 10+ simultaneous publishes to same menuGroup).

**Mitigation:** Add transaction timeout, monitor P95 latency, consider optimistic locking if retry rate > 5%.

---

## Success Metrics

### Functional Metrics

- ✅ Zero MenuItem/MenuPublication inconsistencies in production
- ✅ Zero duplicate version numbers in MenuPublication table
- ✅ 100% of publish events captured in audit log

### Performance Metrics

- P50 latency: < 200ms (current baseline ~150ms)
- P95 latency: < 500ms (transaction overhead expected)
- P99 latency: < 1s (includes 1-2 retries)
- Retry rate: < 5% of publish requests

### Code Quality Metrics

- Test coverage: > 90% for new transaction code
- No new ESLint warnings
- All tests passing (existing + new)

---

## Approval Checklist

Before proceeding to Phase C implementation, confirm:

- ✅ This migration plan addresses all three feedback points:
  1. Changes sequenced into 3 independent steps
  2. Race condition fix explicitly states retry mechanism (catch E11000, retry with incremented version)
  3. Audit mechanism authority clarified (manual auditLogger is source of truth for "who/when", audit-plugin is for "what changed")

- ✅ Each step has clear success criteria (tests must pass before next step)
- ✅ Rollback plan exists for each step
- ✅ No product decisions required (empty menu group validation deferred)
- ✅ Technical prerequisites documented (MongoDB replica set required)

---

**End of Phase B Migration Plan**

**Next Step:** Proceed to Phase C (Implementation) ONLY after this plan is reviewed and approved. Do not combine steps. Do not begin Phase C until all three feedback points are confirmed addressed.
