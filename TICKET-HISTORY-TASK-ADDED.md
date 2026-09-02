# Ticket History Task Added to RBAC Seeder

**Date:** 2026-08-22  
**Affected File:** `scripts/seed-roles-and-tasks.js`

## Summary

Added the missing **ticket history** endpoint to the RBAC seed script. This endpoint was implemented but not included in the task list, preventing role-based access control for the completed tickets history view.

## Changes Made

### 1. Added New Task

```javascript
{
  name: 'kitchen.tickets.history',
  endpoint: '/api/v1/kitchen/tickets/history',
  method: 'GET',
  description: 'Get completed tickets (history view)',
  isMerchant: true,
  hidden: false
}
```

**Position:** Added after `kitchen.tickets.list` in the KDS Phase 1 section

### 2. Updated Task Counts

- **Total tasks:** 217 → **218**
- **Merchant-scoped tasks:** 192 → **193**
- **KDS Phase 1 tasks:** 15 → **16**
- System-wide tasks: **25** (unchanged)

### 3. Updated Comments

Header documentation updated to reflect:
```
 * Total: 218 fine-grained tasks
 * - 193 merchant-scoped (isMerchant: true) - assigned to SUPER-MERCHANT-ADMIN
 * - 25 system-wide (isMerchant: false) - SUPER-ADMIN only (accessed via bypass)
 * 
 * Phase 1 KDS: Added 16 kitchen display system tasks (all merchant-scoped)
 *   - 5 station management (CRUD)
 *   - 1 menu-station assignment
 *   - 10 ticket operations (including item status update + ticket history)
```

## Endpoint Details

**Route Definition:** `src/modules/kitchen/kitchen.routes.js`

```javascript
/**
 * GET /api/v1/kitchen/tickets/history
 * Get completed tickets (history view)
 * Query: ?branchId, ?stationId, ?startDate, ?endDate, ?page, ?limit
 * Access: kitchen, waiter, admin, superAdmin
 */
router.get(
  '/tickets/history',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.getTicketHistory
);
```

**Controller:** `src/modules/kitchen/controllers/kitchen.controller.js`

**Service:** `src/modules/kitchen/service/KitchenTicketService.js::getTicketHistory()`

## Task Properties

| Property | Value |
|----------|-------|
| **Name** | `kitchen.tickets.history` |
| **Endpoint** | `/api/v1/kitchen/tickets/history` |
| **Method** | `GET` |
| **Description** | Get completed tickets (history view) |
| **isMerchant** | `true` (merchant-scoped) |
| **hidden** | `false` (visible in UI) |
| **Phase** | KDS Phase 1 |

## Roles Affected

### SUPER-MERCHANT-ADMIN
- ✅ **Will receive this task** (merchant-scoped, isMerchant: true)
- Total tasks: 192 → **193**

### SUPER-ADMIN
- ✅ **Has access via bypass** (isSystemRole: true)
- Task list remains empty (relies on bypass logic)

## Usage

After re-running the seeder:

```bash
node scripts/seed-roles-and-tasks.js
```

The following users will have access to ticket history:
- Users with `SUPER-ADMIN` role (via bypass)
- Users with `SUPER-MERCHANT-ADMIN` role (via task assignment)
- Users with custom roles that include `kitchen.tickets.history` task

## Query Parameters

The endpoint supports filtering:
- `branchId` - Filter by branch
- `stationId` - Filter by kitchen station
- `startDate` - Filter from date
- `endDate` - Filter to date
- `page` - Pagination page number
- `limit` - Results per page

## Verification

To verify the task was added:

1. **Run the seeder:**
   ```bash
   node scripts/seed-roles-and-tasks.js
   ```

2. **Check task created:**
   ```javascript
   const task = await Task.findOne({ name: 'kitchen.tickets.history' });
   console.log(task);
   // Should show: endpoint, method, isMerchant: true, hidden: false
   ```

3. **Check role assignment:**
   ```javascript
   const role = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' }).populate('tasks');
   const hasTask = role.tasks.some(t => t.name === 'kitchen.tickets.history');
   console.log('Has ticket history task:', hasTask); // Should be true
   ```

4. **Test endpoint access:**
   ```bash
   # As SUPER-MERCHANT-ADMIN user
   curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/v1/kitchen/tickets/history
   ```

## Related Files

- **Seeder:** `scripts/seed-roles-and-tasks.js`
- **Route:** `src/modules/kitchen/kitchen.routes.js`
- **Controller:** `src/modules/kitchen/controllers/kitchen.controller.js`
- **Service:** `src/modules/kitchen/service/KitchenTicketService.js`
- **Model:** `models/KitchenTicket.js`

## Notes

- This task was **already implemented** in the codebase but missing from the RBAC seeder
- The endpoint requires authentication and role-based authorization
- Access is currently restricted to: `kitchen`, `waiter`, `admin`, `superAdmin` roles
- The task is **merchant-scoped** (each merchant sees only their own ticket history)

## Next Steps

1. ✅ Run the updated seeder to create the task
2. ✅ Verify SUPER-MERCHANT-ADMIN role has the new task
3. ✅ Test endpoint access with different roles
4. Document in frontend integration guide (if needed)

---

**Status:** ✅ Complete  
**Ready for:** Production deployment after testing
