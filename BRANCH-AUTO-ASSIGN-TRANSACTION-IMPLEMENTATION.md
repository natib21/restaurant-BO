# Branch Auto-Assign with Transaction Support — Implementation Summary

## Overview
Refactored `BranchService.createBranch()` to use MongoDB transactions, ensuring atomic multi-document writes for branch creation, merchant counter increment, and user branch array auto-assignment.

## MongoDB Transaction Support

### Verification
The codebase already uses MongoDB transactions extensively:
- ✅ `deleteBranch()` uses transactions (lines 621-681)
- ✅ `freeTable()` uses transactions (lines 243-280)
- ✅ `deleteTable()` uses transactions (lines 997-1039)
- ✅ `getReplicaSetStatus()` helper exists in `connection.js`
- ✅ Tests verify replica set before running transaction tests

### Infrastructure
- **Pattern:** `mongoose.startSession()` → `startTransaction()` → `commitTransaction()` / `abortTransaction()`
- **Requirement:** MongoDB replica set (standalone MongoDB does NOT support transactions)
- **Detection:** `src/common/database/connection.js` provides `getReplicaSetStatus()` function
- **Tests:** Multiple test files check replica set status before running (e.g., `PHASE-4-TRANSACTION-ATOMICITY.test.js`, `session-concurrency.test.js`)

## Implementation Changes

### 1. BranchService.createBranch() (src/modules/branch/service/BranchService.js)

**Before:**
- Created branch
- Incremented merchant.branchCounter
- Attempted user auto-assign in try/catch, logged warning on failure
- Returned branch with warning if user update failed

**After:**
```javascript
static async createBranch(req) {
  // ... (validation runs BEFORE transaction) ...

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Create branch
    const branchDocs = await BranchRepository.createBranch(
      [{ /* branch data */ }],
      { session }
    );
    const branch = branchDocs[0];

    // 2. Increment merchant counter
    merchant.branchCounter = existingBranchCount + 1;
    await merchant.save({ session, validateBeforeSave: false });

    // 3. Auto-assign to MANAGER user
    if (req.user.role?.name === 'MANAGER') {
      const User = mongoose.model('User');
      await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { branch: branch._id } },
        { session, new: false }
      );
      logger.info('branch.create.auto_assign_success', { ... });
    }

    // Commit — all 3 writes succeed atomically
    await session.commitTransaction();

    return { branch, refreshHint };
  } catch (error) {
    // Rollback — no partial state
    await session.abortTransaction();
    logger.error('branch.create.transaction_failed', { ... });
    throw error;
  } finally {
    session.endSession();
  }
}
```

**Key Changes:**
- ✅ Wrapped all 3 writes in single transaction
- ✅ Removed try/catch around user update (now part of transaction)
- ✅ Removed `autoAssignWarning` field from response (no longer needed)
- ✅ All writes succeed or all fail (no partial success)
- ✅ Follows same pattern as `deleteBranch()` and `freeTable()`

### 2. Branch Controller (src/modules/branch/controller/branch.controller.js)

**Before:**
```javascript
const response = { status: 'success', data: { branch: result.branch } };
if (result.autoAssignWarning) {
  response.warning = result.autoAssignWarning;
}
if (result.refreshHint) {
  response.refreshHint = result.refreshHint;
}
```

**After:**
```javascript
const response = { status: 'success', data: { branch: result.branch } };
// No longer check for autoAssignWarning (transactions eliminate partial success)
if (result.refreshHint) {
  response.refreshHint = result.refreshHint;
}
```

## Response Format

### Success Response
```json
{
  "status": "success",
  "data": {
    "branch": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Downtown Branch",
      "merchant": "507f1f77bcf86cd799439012",
      ...
    }
  },
  "refreshHint": {
    "code": "BRANCH_ARRAY_UPDATED",
    "message": "Your branch access list has been updated. Your current JWT is stale. Please call /me to refresh your user context or re-login to get a fresh token."
  }
}
```

### Error Response (Transaction Rollback)
If **any** of the three writes fail (branch creation, merchant update, user update):
- Transaction is aborted
- No changes are persisted
- Error is logged and thrown
- HTTP 500 or appropriate error code returned

**Example:**
```json
{
  "status": "error",
  "message": "User update failed",
  "statusCode": 500
}
```

**No branch is created** — user can safely retry.

## Behavioral Changes

| Aspect | Before (Warning) | After (Transaction) |
|--------|-----------------|-------------------|
| **Branch creation** | Succeeds even if user update fails | Fails if user update fails |
| **Merchant counter** | Could increment without branch | Atomically tied to branch creation |
| **User branch array** | Best-effort; warning if fails | Guaranteed to succeed or entire operation fails |
| **Response** | Contains `autoAssignWarning` on partial success | Only `refreshHint` on full success |
| **Orphaned branches** | Possible if user update failed after branch creation | Impossible (transaction rollback) |
| **Retryability** | Ambiguous (branch exists but user can't see it) | Clear (no branch created, safe to retry) |

## Advantages of Transaction Approach

### 1. **Atomicity**
- All three writes succeed together or fail together
- No orphaned branches
- No inconsistent state (e.g., merchant.branchCounter incremented but no branch)

### 2. **Consistency**
- Matches existing codebase patterns (`deleteBranch`, `freeTable`, `deleteTable`)
- Aligns with MongoDB best practices for multi-document writes
- Eliminates "partial success" edge case

### 3. **Clear Error Handling**
- Single failure mode: entire operation fails
- User knows to retry (no ambiguity about whether branch exists)
- No silent warnings that frontend might ignore

### 4. **Simplified Response**
- No need for `autoAssignWarning` field
- Frontend only handles success (with JWT refresh hint) or error
- Cleaner API contract

## Trade-offs

### Advantages Over Warning Approach
- ✅ No partial state
- ✅ No orphaned branches
- ✅ Easier to reason about
- ✅ Consistent with rest of codebase

### Disadvantages
- ❌ If user update fails, branch is not created (user must retry)
- ❌ Slightly higher latency (transaction overhead)
- ❌ Requires replica set (not supported on standalone MongoDB)

### When Warning Approach Was Better
- If user update failure is **more likely** than branch/merchant failures
- If losing a created branch is **worse** than orphaning it
- If replica set is **not available** (dev environment)

### Why Transaction Approach Is Better Here
- User update uses `$addToSet` (idempotent, unlikely to fail)
- Branch creation is the critical path; if it succeeds, user update should too
- Replica set is **already required** by existing codebase (multiple transactions in use)
- Consistency > availability for branch management operations

## JWT Refresh Behavior

### Problem
After auto-assign, `req.user.branch` array is updated but the JWT in the response still has the OLD `decoded.branches` array. On the next request, `auth.guard.js` `branchIdsInclude()` check will fail:

```javascript
// auth.guard.js line 120
if (decoded.branch && !branchIdsInclude(currentUser.branch, decoded.branch, decoded.branches)) {
  return next(
    new AppError('You have been reassigned to a different branch. Please log in again.', 401)
  );
}
```

### Solution
Include `refreshHint` in response so frontend knows to:
1. Call `/api/v1/auth/me` to get updated user with new branch array
2. Or re-login to get fresh JWT with updated `decoded.branches`

### Why Not Include Fresh JWT in Response?
- ❌ Inconsistent (other endpoints don't refresh JWT)
- ❌ Adds latency to branch creation
- ❌ Auth guard is designed to catch stale tokens and force refresh
- ✅ Frontend already has retry logic for 401 errors
- ✅ Explicit > implicit (user knows their access changed)

## Testing Recommendations

### Unit Tests
1. ✅ Verify branch is created with correct data
2. ✅ Verify merchant.branchCounter is incremented
3. ✅ Verify MANAGER user gets branch added to their array
4. ✅ Verify non-MANAGER users do NOT get auto-assign
5. ✅ Verify `$addToSet` prevents duplicates (idempotent)

### Transaction Tests
1. ✅ Verify all 3 writes succeed together
2. ✅ Verify transaction aborts if branch creation fails
3. ✅ Verify transaction aborts if merchant.save() fails
4. ✅ Verify transaction aborts if user update fails
5. ✅ Verify no partial state after rollback

### JWT Staleness Tests
1. ✅ Verify `refreshHint` is included for MANAGER users
2. ✅ Verify next request with stale JWT returns 401
3. ✅ Verify `/me` endpoint returns updated branch array
4. ✅ Verify re-login returns fresh JWT with updated `decoded.branches`

### Edge Cases
1. ✅ User creates branch, then is deleted before next request
2. ✅ User creates branch, then is reassigned to different branches
3. ✅ Concurrent branch creation by same user
4. ✅ Branch creation with `isMain: true` when main already exists

## Replica Set Requirement

### Development
```bash
# Convert standalone MongoDB to replica set
mongod --shutdown
mongod --replSet rs0 --port 27017
mongo --eval "rs.initiate()"
```

### Production
- Use MongoDB Atlas (automatic replica set)
- Or deploy multi-node replica set

### Detection
```javascript
const { getReplicaSetStatus } = require('./src/common/database/connection');
const status = await getReplicaSetStatus();
console.log(status); // { status: 'replicated', replica_set: 'rs0', ... }
```

## Files Modified

1. **src/modules/branch/service/BranchService.js**
   - Wrapped `createBranch()` in transaction
   - Removed try/catch around user update
   - Removed `autoAssignWarning` from return value

2. **src/modules/branch/controller/branch.controller.js**
   - Removed `autoAssignWarning` handling from response
   - Updated comments

3. **BRANCH-AUTO-ASSIGN-DESIGN.md** (previous design doc)
   - Decision 2 changed from "Warning + Partial Success" to "Transaction Rollback"
   - Rationale updated to reflect codebase patterns

## Rollback Plan

If transactions cause issues (e.g., replica set unavailable in dev):

1. Revert to warning approach (previous commit)
2. Or: Add feature flag `USE_TRANSACTIONS_FOR_BRANCH_CREATE` (env var)
3. Or: Wrap transaction logic in try/catch, fall back to warning if `NotWritablePrimary` error

## Conclusion

✅ **Transaction support confirmed** — codebase already uses transactions extensively  
✅ **Implementation complete** — `createBranch()` now atomic with all 3 writes  
✅ **Response format consistent** — no more partial success cases  
✅ **JWT staleness handled** — `refreshHint` included for frontend to retry  
✅ **Error handling clear** — all writes succeed or all fail  

Next: Write comprehensive tests covering transaction atomicity and JWT refresh behavior.
