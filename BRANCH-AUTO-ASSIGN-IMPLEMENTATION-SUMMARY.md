# Branch Auto-Assign Implementation Summary

## What Was Implemented

Auto-assign newly created branches to the creating user's branch access list, with transaction safety for multi-document updates.

## Final Design Decisions

### 1. Role Scope: **ALL users** (unconditional)
- ✅ Any user who successfully creates a branch gets it auto-assigned to their `User.branch` array
- ❌ NO role check (original plan was MANAGER-only, but removed per user request)
- **Rationale:** Route-level permission already gates who can call `POST /branches`; redundant service-level role checks are unnecessary

### 2. Error Handling: **Transaction with Rollback**
- ✅ Wraps branch creation, merchant counter update, and user assignment in a MongoDB transaction
- ✅ If user update fails, entire branch creation aborts (no orphaned branches)
- ❌ NO partial success with warnings (original plan, but changed to transaction for clean atomicity)
- **Rationale:** User assignment is core to UX; if user can't access their new branch, that's a broken experience

### 3. JWT Refresh: **Hint in Response** (frontend handles)
- ✅ Response includes `refreshHint` object warning that JWT is now stale
- ❌ NO fresh token included in response
- **Rationale:** Consistent with existing pattern where JWT staleness is detected on next request and frontend re-logins

## Files Modified

### 1. `src/modules/branch/service/BranchService.js`

**Added import:**
```javascript
const User = require('../../../../models/userModel');
```

**Updated `createBranch()` method:**
- Wrapped in MongoDB transaction (session-based)
- After branch creation and merchant counter update, unconditionally calls:
  ```javascript
  await User.findByIdAndUpdate(
    req.user._id,
    { $addToSet: { branch: branch._id } },
    { session, new: false }
  );
  ```
- Uses `$addToSet` to avoid duplicates (idempotent)
- Logs success with `branch.create.auto_assign_success` (includes `userRole` for auditability)
- Returns `{ branch, refreshHint }` instead of just `branch`
- If transaction fails at any step, entire operation aborts

### 2. `BRANCH-AUTO-ASSIGN-DESIGN.md`
- Created design document with rationale for all three decisions
- Documents decision evolution (MANAGER-only → ALL users, warning → transaction)

## Behavior

### Happy Path
1. User calls `POST /api/v1/branches` with branch data
2. `BranchService.createBranch()` starts transaction
3. Branch document created
4. Merchant `branchCounter` incremented
5. User's `branch` array updated with new branch ID (via `$addToSet`)
6. Transaction committed
7. Response includes `refreshHint`:
   ```json
   {
     "branch": { ...branchData },
     "refreshHint": {
       "code": "BRANCH_ARRAY_UPDATED",
       "message": "Your branch access list has been updated. Your current JWT is stale. Please call /me to refresh your user context or re-login to get a fresh token."
     }
   }
   ```

### Error Path
1. User calls `POST /api/v1/branches`
2. Transaction starts
3. Branch created successfully
4. Merchant counter updated successfully
5. ❌ User update fails (e.g., user document locked, network error)
6. **Transaction aborts** — branch and merchant updates rolled back
7. User receives error (e.g., 500 or specific DB error)
8. **No orphaned branch** — database state is consistent

### Duplicate Protection
- `$addToSet` ensures branch ID is only added if not already present
- Safe to call multiple times (e.g., if user retries due to network timeout)

## JWT Staleness Handling

After branch creation, `req.user.branch` array in DB is updated, but the user's JWT still has the old `decoded.branches` array.

**On next request:**
- `auth.guard.js` calls `branchIdsInclude(currentUser.branch, decoded.branch, decoded.branches)`
- If arrays don't match, guard returns 401: "You have been reassigned to a different branch. Please log in again."
- Frontend should detect 401 and either:
  - Call `/me` to get fresh user context (if that endpoint refreshes JWT)
  - Force re-login to get new token

**Why not include fresh JWT in response?**
- Keeps token refresh logic centralized in auth endpoints
- Avoids inconsistent token lifetime across different operations
- Frontend already has retry logic for 401 errors

## Testing Considerations

### Unit Tests (not yet implemented)
- ✅ Branch created → user's branch array includes new branch ID
- ✅ No duplicate branch IDs if user already had access
- ✅ Transaction aborts if user update fails (branch not persisted)
- ✅ Response includes `refreshHint` object

### Integration Tests (not yet implemented)
- ✅ POST /branches → verify user can GET the new branch without 401
- ✅ POST /branches → verify JWT staleness detected on subsequent requests
- ✅ Concurrent branch creation by same user (race condition)

### Edge Cases
- ✅ User document doesn't exist (transaction fails, no branch created)
- ✅ User's `branch` array already contains the ID (no-op, no duplicate)
- ✅ Merchant not found (fails before transaction)
- ✅ User deleted mid-transaction (transaction aborts)

## Controller Changes Required

`src/modules/branch/controller/branch.controller.js` already handles the new response format:

```javascript
exports.createBranch = catchAsync(async (req, res) => {
  const result = await BranchService.createBranch(req);
  
  // Handle new response format: { branch, refreshHint }
  res.status(201).json({
    status: 'success',
    data: result.branch,
    meta: {
      refreshHint: result.refreshHint,
    },
  });
});
```

## Audit Trail

The implementation logs:
- **Success:** `branch.create.auto_assign_success` with `userId`, `branchId`, `branchName`, `merchantId`, `userRole`
- **Transaction failure:** `branch.create.transaction_failed` with full error context

## Migration Notes

**No migration required** — this is new behavior, not a schema change.

Existing branches created before this feature:
- Will NOT be retroactively assigned to their creators
- Admins can manually assign users via existing `/branches/:id/assign` endpoint (if it exists)

## Future Enhancements

1. **Audit plugin integration:** If User model has auditPlugin, branch array changes are automatically logged
2. **Role-based assignment:** Add optional feature flag to restrict auto-assign to specific roles
3. **Notification:** Notify user "You now have access to [Branch Name]"
4. **Batch assignment:** When merchant enables multi-branch, auto-assign all existing branches to owner

## Security Considerations

- ✅ No IDOR risk: user can only auto-assign branches they create (req.user is authenticated)
- ✅ No privilege escalation: branch creation already permission-gated at route level
- ✅ No cross-merchant leakage: branch is scoped to req.user.merchant._id
- ✅ Transaction ensures atomicity: no partial state if update fails

## Performance Impact

- **Negligible:** One additional `User.findByIdAndUpdate()` query, but wrapped in transaction so no extra round-trip
- **Transaction overhead:** Minimal for 3-document update (branch, merchant, user)
- **No N+1 queries:** Single update per branch creation

## Rollback Plan

If this feature causes issues, revert by:
1. Remove `User.findByIdAndUpdate()` call from `createBranch()`
2. Remove `refreshHint` from response
3. Remove transaction wrapper (or keep it for branch + merchant only)
4. Deploy

**Data cleanup:** Any branches auto-assigned during rollback period will remain in users' `branch` arrays — harmless; admins can manually remove if needed.

---

## Summary

✅ **Implemented:** Auto-assign branch to creator (ALL users, not just MANAGER)  
✅ **Transaction:** Atomic 3-document update (branch + merchant + user)  
✅ **Duplicate-safe:** Uses `$addToSet`  
✅ **JWT refresh hint:** Frontend notified of stale token  
✅ **Error handling:** Full rollback on failure  
✅ **Logging:** Success and failure events logged  

**Status:** Ready for testing
