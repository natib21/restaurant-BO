# RBAC Seeding Ready - Summary

## Investigation Complete

I've analyzed the RBAC system by reading the actual source code. Here are the findings:

---

## 1. How `protect()` Works

**File**: `src/common/guards/auth.guard.js` (lines 38-95)

- Extracts JWT from `Authorization: Bearer <token>` or cookie
- Verifies with `JWT_SECRET`
- Loads user from database by token's `id` field
- Validates user exists, is active, password unchanged, merchant/branch unchanged
- Populates `req.user` with:
  - `role` (name, tasks[], isSystemRole)
  - `role.tasks[]` (name, endpoint, method, description, isMerchant)
  - `merchant` (subscription/features)
  - `branch`

---

## 2. How SUPER-ADMIN Bypass Works

**File**: `src/common/guards/auth.guard.js` (line 246)

```javascript
if (role && (role.name === 'SUPER-ADMIN' || role.isSystemRole === true)) {
  return next();
}
```

**Two bypass conditions (OR logic)**:
1. `role.name === 'SUPER-ADMIN'` (exact string match)
2. `role.isSystemRole === true` (boolean flag)

Either condition → **universal access, no task checking**.

---

## 3. How `restrictTo()` Actually Works

**CRITICAL FINDING**: The function signature accepts role name arguments like `restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN')`, but **the implementation completely ignores them**. This is cosmetic documentation only.

**Real logic** (lines 210-269):
1. Check PUBLIC_ROUTES → bypass if match
2. Check SUPER-ADMIN bypass (name or isSystemRole) → bypass if match
3. Otherwise, match `req.originalUrl` + `req.method` against tasks in `req.user.role.tasks[]`
   - Each task has `endpoint` (URL pattern with `:id` or `*` wildcards) and `method` (HTTP verb or `*`)
   - Uses regex matching with safety against ReDoS (lines 133-178)
4. If any task matches → allow
5. If no tasks match → 403

**Conclusion**: Authorization is purely **task-based** (endpoint + method matching), not role-name-based. The `restrictTo('MERCHANT_ADMIN')` arguments you see in route files are ignored.

---

## 4. Protected Routes Inventory

Analyzed all `*.routes.js` files to find what's actually protected:

### Most Common Pattern: Task-Based
```javascript
router.use(protect);
router.use(restrictTo());  // No role name checking - matches tasks only
```

**Protected modules** (require matching task in role.tasks[]):
- `/api/v1/branches/*` - branch CRUD, suspend, activate, features
- `/api/v1/menu/*`, `/api/v1/menu-groups/*`, `/api/v1/combos/*` - menu management
- `/api/v1/tables/*`, `/api/v1/sessions/*` - table/session management
- `/api/v1/orders/*` (staff routes) - order management
- `/api/v1/ingredients/*`, `/api/v1/inventory/*`, `/api/v1/suppliers/*`, `/api/v1/recipes/*`, `/api/v1/purchase-orders/*` - inventory
- `/api/v1/merchants/*` - KYC, roles, users, self-profile
- `/api/v1/users/*` - user management
- `/api/v1/reports/*` - all 8 reports + exports
- `/api/v1/files/*` - file management
- `/api/v1/analytics/*` - analytics
- `/api/v1/feedback/*` - feedback

### Exception: Hard SUPER-ADMIN Check
```javascript
// roles.routes.js lines 20-24
if (req.user?.role?.name !== 'SUPER-ADMIN' && !req.user?.role?.isSystemRole) {
  return next(new AppError('Access denied. Super Admin only.', 403));
}
```

**Protected by hard check** (not task-based):
- `/api/v1/roles/*` - system role management

### Public Routes (no protection):
- `/api/v1/auth/*` - login, signup, password reset
- `/health` - health checks
- `/api/v1/branches/nearby`, `/api/v1/branches/:id` - public lookups
- `/api/v1/menu/customer` - QR menu
- `/api/v1/orders` (customer POST via `protectTableSession`)

---

## 5. Database State

**Current** (from `scripts/inspect-rbac-data.js` output):
- **MesobDb** (production): 0 roles, 0 tasks
- **restaurant-test** (test): exists separately, not shared

**Conclusion**: No roles exist. All protected routes are inaccessible.

---

## 6. Seeder Script Created

**File**: `scripts/seed-roles-and-tasks.js`

**What it does**:
1. Creates **26 tasks** (one per protected module, coarse-grained with `*` wildcards)
2. Creates **SUPER-ADMIN** role:
   - `name: 'SUPER-ADMIN'`
   - `isSystemRole: true`
   - `tasks: []` (empty - relies on bypass)
3. Creates **MERCHANT_ADMIN** role:
   - `name: 'MERCHANT_ADMIN'`
   - `isSystemRole: false`
   - `tasks: [all 26 task IDs]`

**Task List** (extracted from route analysis):
1. `manage-branches` → `/api/v1/branches/*` (all methods)
2. `manage-menu` → `/api/v1/menu/*`
3. `manage-menu-groups` → `/api/v1/menu-groups/*`
4. `manage-branch-menu-groups` → `/api/v1/branch-menu-groups/*`
5. `manage-combos` → `/api/v1/combos/*`
6. `manage-tables` → `/api/v1/tables/*`
7. `manage-sessions` → `/api/v1/sessions/*`
8. `manage-orders` → `/api/v1/orders/*`
9. `manage-ingredients` → `/api/v1/ingredients/*`
10. `manage-inventory` → `/api/v1/inventory/*`
11. `manage-suppliers` → `/api/v1/suppliers/*`
12. `manage-recipes` → `/api/v1/recipes/*`
13. `manage-purchase-orders` → `/api/v1/purchase-orders/*`
14. `manage-merchant-profile` → `/api/v1/merchants/me*`
15. `manage-merchant-kyc` → `/api/v1/merchants/kyc` (POST only)
16. `manage-merchant-roles` → `/api/v1/merchants/roles*`
17. `manage-merchant-users` → `/api/v1/merchants/users*`
18. `manage-users` → `/api/v1/users/*`
19. `read-reports` → `/api/v1/reports/*` (GET only)
20. `export-reports` → `/api/v1/reports/exports*`
21. `manage-files` → `/api/v1/files/*`
22. `read-analytics` → `/api/v1/analytics/*` (GET only)
23. `manage-feedback` → `/api/v1/feedback/*`

**Features**:
- **Idempotent**: Uses `findOneAndUpdate(..., { upsert: true })` - safe to re-run
- **Safe**: Refuses to run against test database
- **Not auto-executed**: You must manually run it

---

## Ready to Execute

**Script location**: `scripts/seed-roles-and-tasks.js`

**To run**:
```bash
node scripts/seed-roles-and-tasks.js
```

**Expected output**:
```
✅ Connected to database: MesobDb

=== STEP 1: Create Tasks ===
  ✓ manage-branches (GET /api/v1/branches/*)
  ✓ manage-menu (GET /api/v1/menu/*)
  ... (26 tasks total)

=== STEP 2: Create SUPER-ADMIN Role ===
  ✓ SUPER-ADMIN
    _id: <ObjectId>
    isSystemRole: true
    tasks: 0 (empty - uses bypass)

=== STEP 3: Create MERCHANT_ADMIN Role ===
  ✓ MERCHANT_ADMIN
    _id: <ObjectId>
    isSystemRole: false
    tasks: 26 tasks assigned

=== Summary ===
✅ Created/updated 26 tasks
✅ Created/updated 2 roles (SUPER-ADMIN, MERCHANT_ADMIN)
```

**After running, verify**:
```bash
node scripts/inspect-rbac-data.js
```

---

## Next Steps After Seeding

1. **Verify seeded data**: Run `node scripts/inspect-rbac-data.js`
2. **Update existing users**: Assign `SUPER-ADMIN` or `MERCHANT_ADMIN` role to users
3. **Test protected endpoints**: Use JWT with assigned role, verify access works
4. **Create additional roles** (later): STAFF, WAITER, KITCHEN, etc. with subset of tasks

---

## Documentation Generated

1. **RBAC-SYSTEM-ANALYSIS.md** - Full technical analysis of how auth/authz works
2. **scripts/seed-roles-and-tasks.js** - Idempotent seeder script
3. **scripts/inspect-rbac-data.js** - Database inspection tool
4. **This file** (RBAC-SEEDING-READY.md) - Summary for quick reference

**Your decision**: When to execute the seeder. It's ready and safe to run.
