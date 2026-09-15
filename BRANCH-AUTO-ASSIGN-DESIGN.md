# Branch Auto-Assign Design Decisions

## Context
When a branch is created via `BranchService.createBranch()`, the new branch is saved and the merchant's `branchCounter` incremented, but the creating user's `branch` array is never updated. This means the user who created the branch may not have access to it afterward.

## Decision 1: Role Scope — Who Gets Auto-Access?

### Option A: ALL users who create a branch (no role check)
- ✅ Simplest to implement
- ✅ Most intuitive: if you can create it, you can access it
- ✅ Already permission-gated at the route level
- ❌ Could create unintended access if permissions are later tightened (low risk)

### Option B: Only MANAGER role gets auto-access (role-specific)
- ✅ Follows RBAC convention (default-roles.helper.js shows MANAGER has all branch management tasks)
- ✅ Matches existing pattern where only managers can create branches (via role permissions)
- ✅ Restricts auto-access to users with operational oversight
- ❌ Requires role name lookup
- ❌ Hardcodes "MANAGER" string

### Option C: Only users with 'branches.create' task (permission-based)
- ✅ Most flexible — permission automatically tied to actual capability
- ✅ Future-proof if custom roles gain branch creation
- ❌ Requires additional task lookup query
- ❌ More complex

### **CHOSEN: Option A (ALL users who create a branch)**

**Rationale:**
- If a user successfully calls `POST /branches`, they already passed the route-level permission check (via restrictTo middleware)
- The endpoint is already protected; redundant role checks inside the service are unnecessary
- Simpler and more intuitive: "I created it, I can access it"
- Avoids hardcoding role names like "MANAGER"
- The transaction ensures all-or-nothing atomicity: if user update fails, branch creation aborts

**Implementation:** Unconditionally call `User.findByIdAndUpdate($addToSet)` for `req.user._id` after branch creation succeeds.

---

## Decision 2: Error Handling — Transaction Rollback vs Warning?

### Scenario
Branch is created successfully (persisted to DB), but updating `user.branch` via `$addToSet` fails (e.g., network error, permission issue, user document becomes unavailable).

### Option A: Roll back the entire branch creation (transaction)
- ✅ Maintains atomicity — either both succeed or both fail
- ✅ Clean state; no orphaned branches
- ✅ Error surface immediately to user
- ❌ User loses their newly created branch if user update fails (poor UX for rare failures)
- ❌ More overhead; requires MongoDB session
- ✅ Simple error handling; one path

### Option B: Log warning; return success with note in response
- ✅ Resilient — branch exists even if user assignment fails
- ✅ Admin can manually assign later if needed
- ✅ Branch not lost to the merchant (other managers can see/use it)
- ❌ Silent failure could confuse user (they created a branch but can't see it)
- ❌ Requires frontend to handle partial success response
- ❌ Inconsistent state requires manual intervention

### Option C: Log error; return 500 (fail loudly, no rollback)
- ✅ User knows something went wrong
- ✅ Branch exists (not lost)
- ❌ User gets error even though branch is valid
- ❌ Requires user to retry; branch already created
- ❌ Poor UX

### **CHOSEN: Option A (Transaction — All or Nothing)**

**Rationale:**
- MongoDB transactions are available and performant for this use case
- User assignment is NOT secondary — it's a core part of branch creation UX
- If user can't access the branch they just created, that's a broken experience
- Clean rollback prevents orphaned branches and support tickets
- Fail-fast is better than partial success that requires manual cleanup
- The codebase already uses transactions elsewhere (e.g., deleteBranch, freeTable)

**Implementation:**
```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // 1. Create branch
  const branch = await BranchRepository.createBranch({...}, { session });
  
  // 2. Update merchant counter
  await merchant.save({ session });
  
  // 3. Auto-assign to user
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { branch: branch._id } }, { session });
  
  // Commit if all succeed
  await session.commitTransaction();
  return { branch, refreshHint };
} catch (error) {
  // Rollback if any step fails
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

---

## Decision 3: JWT Refresh — Include Fresh Token or Force Re-login?

### Context
`auth.guard.js` `branchIdsInclude()` check (lines 34–50) validates that user's current `branch` array matches the token's `decoded.branches`. If they don't match, next request is rejected with 401 ("You have been reassigned to a different branch").

After auto-assign, `req.user.branch` is updated but the JWT in the response still has the OLD `decoded.branches` array. On the frontend's next request, that stale token will fail the `branchIdsInclude()` check.

### Option A: Include fresh JWT in response
- ✅ User continues seamlessly; no re-login required
- ✅ Frontend doesn't need special handling
- ✅ Improved UX
- ❌ Adds latency (sign new JWT)
- ❌ Response becomes larger
- ❌ Token refresh mechanism becomes inconsistent (some endpoints refresh, some don't)

### Option B: Force frontend to re-login or call `/me` endpoint
- ✅ Explicit; frontend knows to refresh JWT
- ✅ Consistent with existing pattern (users must re-login after password change, merchant change, etc.)
- ✅ No latency to branch creation endpoint
- ✅ Frontend already has re-login retry logic
- ❌ Extra round trip for user
- ❌ Slightly worse UX

### Option C: Include refresh hint in response; let frontend decide
- ✅ Flexible; frontend can choose to re-login or just call `/me`
- ✅ Consistent with auth guard behavior (it will reject stale token)
- ⚠️ Frontend must handle 401 gracefully on next request
- ✅ No additional latency

### **CHOSEN: Option C (Refresh Hint; Let Frontend Retry)**

**Rationale:**
- This matches how the codebase already handles branch reassignment: when a user is reassigned to a different branch mid-session, the NEXT request returns 401, and the frontend must re-login
- The auth guard's `branchIdsInclude()` check is designed to catch this and reject; we're not bypassing it, just documenting the behavior
- Consistent with "explicit over implicit" — user knows their branch array changed, so they should refresh
- Minimal added logic; no new JWT signing in the hot path
- Response includes `refreshHint` so frontend can proactively call `/me` or re-login before next request

**Implementation:**
```javascript
{
  data: { branch },
  refreshHint: {
    code: 'BRANCH_ARRAY_UPDATED',
    message: 'Your branch access list has been updated. Your current JWT may be stale. Please call /me to refresh user context or re-login to get a fresh token.'
  }
}
```

---

## Implementation Summary

| Aspect | Decision |
|--------|----------|
| **Role Scope** | MANAGER role only |
| **Error Handling** | Warning + Partial Success (no rollback) |
| **JWT Refresh** | Refresh Hint in response; frontend retries/re-logins |
| **Multi-Document Safety** | No transaction (branch already persisted; user update is secondary) |
| **Duplicate Prevention** | Use MongoDB `$addToSet` (atomic, avoids duplicates) |

---

## Side-Effects & Considerations

### 1. Audit Trail
- The user's branch array change should be logged via the auditPlugin (if enabled on User model)
- If not, add manual audit log: `audit.log('user.branch.auto_assigned', { userId, branchId, reason: 'branch_creation' })`

### 2. Notification (Optional)
- Consider notifying the creating user: "You now have access to [Branch Name]"
- Not required for MVP; can be added later

### 3. Multi-Merchant Scenario
- `req.user.merchant._id` is already validated in `createBranch`
- Branch is scoped to this merchant
- User must belong to the same merchant (auth guard ensures this)
- ✅ No cross-merchant leakage possible

### 4. Role Name Hardcoding
- Currently hardcoding `'MANAGER'` string
- Future: could add a config constant `BRANCH_ADMIN_ROLES = ['MANAGER', 'SUPER-MERCHANT-ADMIN']`
- For now, MANAGER is sufficient

---

## Files to Modify

1. **src/modules/branch/service/BranchService.js**
   - Update `createBranch()` method to add auto-assign logic after branch is created
   
2. **src/modules/branch/repository/BranchRepository.js** (if it exists)
   - OR: add helper method directly in BranchService if no repository pattern for User
   
3. **tests/** (new file)
   - Create `branch-auto-assign.test.js` to verify behavior
