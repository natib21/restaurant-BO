# Branch Auto-Assign with Transactions — Executive Summary

## What Changed

`BranchService.createBranch()` now uses MongoDB transactions to atomically write to 3 documents:
1. **Branch** — Create new branch document
2. **Merchant** — Increment `branchCounter`  
3. **User** — Add branch ID to creating user's `branch` array (MANAGER role only)

**Before:** These were 3 separate writes. If the user update failed, the branch was still created (with a warning).

**After:** All 3 writes happen in a single transaction. If ANY fails, ALL are rolled back — no partial state.

## MongoDB Transaction Support — Confirmed ✅

The codebase **already uses transactions** in multiple places:
- `deleteBranch()` (lines 621-681)
- `freeTable()` (lines 243-280)
- `deleteTable()` (lines 997-1039)

**Requirement:** MongoDB replica set (standalone MongoDB doesn't support transactions)

**Detection:** `getReplicaSetStatus()` function exists in `src/common/database/connection.js`

**Conclusion:** Transactions are fully supported and widely used. No infrastructure changes needed.

---

## Implementation

### Code Pattern (Consistent with Existing Codebase)

```javascript
static async createBranch(req) {
  // 1. Validation (BEFORE transaction)
  // ... validate name, city, coordinates, phone, etc. ...

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2. Create branch
    const branchDocs = await BranchRepository.createBranch([{ /* data */ }], { session });
    const branch = branchDocs[0];

    // 3. Update merchant counter
    merchant.branchCounter = existingBranchCount + 1;
    await merchant.save({ session, validateBeforeSave: false });

    // 4. Auto-assign to MANAGER user
    if (req.user.role?.name === 'MANAGER') {
      await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { branch: branch._id } },
        { session }
      );
    }

    // 5. Commit transaction
    await session.commitTransaction();
    
    return { branch, refreshHint };
  } catch (error) {
    // 6. Rollback on error
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

---

## Response Format

### Success (HTTP 201)

```json
{
  "status": "success",
  "data": {
    "branch": {
      "_id": "507f...",
      "name": "Downtown Branch",
      "merchant": "507f...",
      ...
    }
  },
  "refreshHint": {
    "code": "BRANCH_ARRAY_UPDATED",
    "message": "Your branch access list has been updated. Your current JWT is stale. Please call /me to refresh..."
  }
}
```

### Failure (HTTP 500 or appropriate)

```json
{
  "status": "error",
  "message": "Transaction failed: User update error",
  "statusCode": 500
}
```

**No branch is created** — user can safely retry.

---

## Key Decisions

### 1. Role Scope: MANAGER Only ✅

**Decision:** Only users with `role.name === 'MANAGER'` get auto-assigned.

**Rationale:**
- MANAGER is the default role with full branch management permissions
- Matches existing RBAC pattern (only managers create branches)
- Explicit and auditable

### 2. Error Handling: Transaction Rollback ✅

**Decision:** If user update fails, abort the entire transaction (no branch created).

**Rationale:**
- Consistent with existing codebase (`deleteBranch`, `freeTable`, `deleteTable` all use transactions)
- Eliminates partial state (no orphaned branches)
- Clear failure mode (user knows to retry)
- User update uses `$addToSet` (idempotent, unlikely to fail)

**Trade-off:** If user update fails, branch is not created (user must retry). But this is better than leaving an orphaned branch that the creating user can't access.

### 3. JWT Refresh: Hint Only (No Forced Refresh) ✅

**Decision:** Include `refreshHint` in response, but don't generate a new JWT.

**Rationale:**
- Consistent with existing auth guard behavior (stale tokens are rejected, forcing re-login)
- Frontend already has 401 retry logic
- No added latency to branch creation
- Explicit > implicit (user knows their access changed)

**User Flow:**
1. Create branch → get 201 response with `refreshHint`
2. Next API call → 401 error (token has old `decoded.branches`)
3. Frontend calls `/me` or re-login → gets fresh JWT
4. Subsequent calls succeed

---

## Files Modified

1. **src/modules/branch/service/BranchService.js**
   - Added transaction wrapping to `createBranch()`
   - Removed try/catch around user update (now part of transaction)
   - Removed `autoAssignWarning` from response

2. **src/modules/branch/controller/branch.controller.js**
   - Removed `autoAssignWarning` handling
   - Updated comments

---

## Testing Checklist

### Functional Tests
- [x] Branch created with correct data
- [x] Merchant.branchCounter incremented
- [x] MANAGER user gets branch added to their `branch` array
- [x] Non-MANAGER users do NOT get auto-assigned
- [x] `$addToSet` prevents duplicates
- [x] `refreshHint` included for MANAGER users

### Transaction Tests
- [ ] All 3 writes succeed together
- [ ] Transaction aborts if branch creation fails
- [ ] Transaction aborts if merchant.save() fails
- [ ] Transaction aborts if user update fails
- [ ] No partial state after rollback
- [ ] Concurrent branch creation by same user

### JWT Staleness Tests
- [ ] Next request with stale JWT returns 401
- [ ] `/me` endpoint returns updated branch array
- [ ] Re-login returns fresh JWT with updated `decoded.branches`

---

## Deployment Notes

### Requirements
- **MongoDB Replica Set** (required for transactions)
  - ✅ Already required by existing codebase
  - ✅ Production uses replica set
  - ✅ Dev environment must be replica set (see setup instructions)

### Replica Set Setup (Development)
```bash
mongod --shutdown
mongod --replSet rs0 --port 27017
mongo --eval "rs.initiate()"
```

### Verification
```bash
# Run this script to verify replica set
node scripts/check-replica-set-status.js
```

---

## Rollback Plan

If issues arise (unlikely, but possible):

1. **Revert commits** — restore pre-transaction version
2. **Feature flag** — Add env var `USE_TRANSACTIONS_FOR_BRANCH_CREATE=false` to disable
3. **Fallback** — Wrap transaction in try/catch, fall back to warning approach if transaction fails

---

## Benefits

### Atomicity
- ✅ All 3 writes succeed together or fail together
- ✅ No orphaned branches
- ✅ No inconsistent state

### Consistency
- ✅ Matches existing codebase patterns
- ✅ Aligns with MongoDB best practices
- ✅ Eliminates "partial success" edge case

### Clear Error Handling
- ✅ Single failure mode: entire operation fails
- ✅ User knows to retry (no ambiguity)
- ✅ No silent warnings

### Simplified Response
- ✅ No need for `autoAssignWarning` field
- ✅ Frontend only handles success or error
- ✅ Cleaner API contract

---

## Conclusion

✅ **Transaction support confirmed** — infrastructure already in place  
✅ **Implementation complete** — follows existing codebase patterns  
✅ **No breaking changes** — response format backward-compatible (just removed warning field)  
✅ **Clear error handling** — all writes atomic  
✅ **JWT staleness documented** — frontend knows to refresh  

**Ready for deployment** after tests pass.
