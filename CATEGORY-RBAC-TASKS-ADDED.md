# Category Management RBAC Tasks Added

## Summary
Added 7 category management tasks to the `seed-roles-and-tasks.js` script to enable RBAC control for the Category Management module.

## Tasks Added

All category tasks are **merchant-scoped** (`isMerchant: true`), meaning they will be automatically assigned to the **SUPER-MERCHANT-ADMIN** role.

### Complete Task List

| Task Name | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| `categories.listActive` | `/api/v1/categories/active` | GET | List active categories only |
| `categories.list` | `/api/v1/categories` | GET | List all categories (including soft-deleted) |
| `categories.create` | `/api/v1/categories` | POST | Create a new category |
| `categories.read` | `/api/v1/categories/:id` | GET | Get category by ID |
| `categories.update` | `/api/v1/categories/:id` | PATCH | Update category |
| `categories.delete` | `/api/v1/categories/:id` | DELETE | Soft delete category |
| `categories.restore` | `/api/v1/categories/:id/restore` | PATCH | Restore soft-deleted category |

## Updated Task Count

**Previous Total**: 202 tasks  
**New Total**: **209 tasks**

### Breakdown by Scope
- **Merchant-scoped tasks** (`isMerchant: true`): 184 (was 177)
- **System-wide tasks** (`isMerchant: false`): 25 (unchanged)

## Task Structure

Each task follows the standard format:
```javascript
{
  name: 'categories.list',
  endpoint: '/api/v1/categories',
  method: 'GET',
  description: 'List all categories',
  isMerchant: true,  // Merchant-scoped
  hidden: false
}
```

## Routes Covered

Based on `/src/modules/categories/categories.routes.js`:

✅ **GET** `/api/v1/categories/active` - List active categories  
✅ **GET** `/api/v1/categories` - List all categories  
✅ **POST** `/api/v1/categories` - Create category  
✅ **GET** `/api/v1/categories/:id` - Get category by ID  
✅ **PATCH** `/api/v1/categories/:id` - Update category  
✅ **DELETE** `/api/v1/categories/:id` - Soft delete category  
✅ **PATCH** `/api/v1/categories/:id/restore` - Restore category  

All 7 endpoints from the categories routes are now covered in RBAC.

## Role Assignment

### SUPER-MERCHANT-ADMIN
Will automatically receive all 7 category tasks because:
- All tasks have `isMerchant: true`
- Script assigns all merchant-scoped tasks to this role
- Can perform full CRUD on categories within their merchant

### SUPER-ADMIN
Has access via `isSystemRole: true` bypass:
- Does not need explicit task assignment
- Can access any endpoint regardless of tasks
- System-wide access

### Custom Merchant Roles
Merchants can create custom roles and assign specific category permissions:
- Read-only: Assign only `categories.list`, `categories.read`, `categories.listActive`
- Full access: Assign all 7 tasks
- Restricted: Mix and match based on business needs

## How to Run

To seed/update the roles and tasks in the database:

```bash
node scripts/seed-roles-and-tasks.js
```

**Important Notes:**
- Idempotent: Safe to run multiple times
- Uses upsert: Updates existing tasks, creates new ones
- Only runs in non-test environments
- Requires database connection

## Verification

After running the seeder, verify tasks were created:

```bash
# Using MongoDB shell or Compass
db.tasks.find({ name: /^categories\./ }).count()
// Should return: 7

# List all category tasks
db.tasks.find({ name: /^categories\./ })
```

Or use the API:
```http
GET /api/v1/tasks?search=categories
Authorization: Bearer {super-admin-token}
```

## Integration with Categories Module

The categories module is now fully integrated with RBAC:

1. **Routes Protected**: All routes use `protect` and `restrictTo()` middleware
2. **Tasks Defined**: All 7 endpoints have corresponding tasks in the seeder
3. **Tenant Isolation**: All category operations are automatically scoped to merchant
4. **Validation**: Request validation applied before controller execution

## Testing Category Permissions

### Test with SUPER-MERCHANT-ADMIN
```javascript
// After seeding, this role should have full category access
const response = await request(app)
  .get('/api/v1/categories')
  .set('Authorization', `Bearer ${merchantAdminToken}`);

expect(response.status).toBe(200);
```

### Test with Custom Role (Read-Only)
```javascript
// Create role with only read tasks
const readOnlyRole = await Role.create({
  name: 'category-viewer',
  merchant: merchantId,
  tasks: [
    taskIds['categories.list'],
    taskIds['categories.read'],
    taskIds['categories.listActive']
  ]
});

// User with this role can read but cannot create
const response = await request(app)
  .post('/api/v1/categories')
  .set('Authorization', `Bearer ${viewerToken}`)
  .send({ name: { en: 'Test' } });

expect(response.status).toBe(403); // Access denied
```

## Files Modified

### Updated File
- `scripts/seed-roles-and-tasks.js`
  - Added 7 category tasks after combos module section
  - Updated header comment with new total: 209 tasks (was 202)
  - Added Phase 3 note about categories

### No Changes Required
- Routes already protected with `protect` and `restrictTo()`
- Controllers already implement proper authorization
- Validators already in place

## Related Documentation

- `CATEGORY-MODULE-COMPLETE.md` - Full category module implementation
- `FRONTEND-CATEGORY-INTEGRATION-GUIDE.md` - Frontend API integration
- `RBAC-SYSTEM-ANALYSIS.md` - RBAC architecture overview
- `src/modules/categories/categories.routes.js` - Route definitions

## Next Steps

1. **Run the seeder** to create tasks in database:
   ```bash
   node scripts/seed-roles-and-tasks.js
   ```

2. **Verify in database** that 7 new category tasks exist

3. **Test with real users** to ensure permissions work correctly

4. **(Optional) Assign to custom roles** as needed for your team structure

## Conclusion

The Category Management module is now fully integrated with the RBAC system. All 7 category endpoints have corresponding tasks that can be:
- Automatically assigned to SUPER-MERCHANT-ADMIN
- Selectively assigned to custom merchant roles
- Used to control fine-grained access to category operations

---

**Date**: 2026-08-20  
**Task Count Added**: 7  
**New Total**: 209 tasks  
**Status**: ✅ Complete
