# Branch User Assignment Tasks - Added to RBAC

## Summary
Added 3 new tasks to the RBAC system for managing branch-user assignments (assign/unassign users to/from branches).

## Tasks Added

### 1. branches.users.assign
- **Endpoint:** `POST /api/v1/branch/:branchId/users/:userId/assign`
- **Method:** POST
- **Description:** Assign user to branch
- **Scope:** Merchant-scoped (isMerchant: true)
- **Purpose:** Manually assign a user to a branch's access list

### 2. branches.users.unassign
- **Endpoint:** `DELETE /api/v1/branch/:branchId/users/:userId/unassign`
- **Method:** DELETE
- **Description:** Unassign user from branch
- **Scope:** Merchant-scoped (isMerchant: true)
- **Purpose:** Remove a user from a branch's access list

### 3. branches.users.list
- **Endpoint:** `GET /api/v1/branch/:branchId/users`
- **Method:** GET
- **Description:** List users assigned to branch
- **Scope:** Merchant-scoped (isMerchant: true)
- **Purpose:** View all users who have access to a specific branch

## Files Modified

### 1. scripts/seed-roles-and-tasks.js
- Added 3 new task definitions in BRANCHES MODULE section
- Updated total count: 224 → 227 tasks
- Updated merchant-scoped count: 199 → 202 tasks
- Updated BRANCHES MODULE count: 11 → 14 tasks
- Added Phase 7 comment documenting branch user assignment tasks

### 2. src/modules/auth/default-roles.helper.js
- Added 3 tasks to MANAGER role's task list (after merchants section):
  - 'branches.users.assign'
  - 'branches.users.unassign'
  - 'branches.users.list'

## Integration with Auto-Assign Feature

These tasks work together with the auto-assign feature:

1. **Auto-Assign (P5-001):** When a MANAGER creates a branch, they're automatically assigned access
2. **Manual Assignment (these tasks):** MANAGERs can manually assign/unassign other users to branches
3. **View Assignment (these tasks):** MANAGERs can list which users have access to which branches

## Permission Logic

- **Who can use these tasks?** MANAGER role (and SUPER-MERCHANT-ADMIN by default)
- **Scope:** Only within the same merchant — cannot assign users across merchants
- **Frontend:** Routes will check for these task names before showing UI

## Database Status

✅ Tasks seeded successfully via `node scripts/seed-roles-and-tasks.js`
- 224 tasks total (previously 221)
- 203 merchant-scoped tasks (previously 200)
- All 3 new tasks assigned to SUPER-MERCHANT-ADMIN role
- MANAGER role will receive these tasks on merchant creation (via default-roles.helper.js)

## Next Steps

1. ✅ Tasks defined and seeded
2. ✅ Added to MANAGER role in default-roles.helper.js
3. ⏳ Implement endpoints in branch.controller.js and BranchUserAssignmentService
4. ⏳ Wire endpoints to branch.routes.js with restrictTo() guard
5. ⏳ Test manual assignment E2E

## Notes

- The endpoint pattern uses `:userId` in the seed file (not `:id`) for clarity
- These tasks are separate from the auto-assign feature (which doesn't require a task check — it's automatic for MANAGER role)
- The auto-assign happens silently in BranchService.createBranch()
- The manual assignment tasks are for explicit user management by administrators
