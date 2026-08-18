# RBAC System Analysis

## How Protection Works

### 1. `protect()` Middleware (JWT Authentication)

**Source**: `src/common/guards/auth.guard.js` (lines 38-95)

**Flow**:
1. Extract JWT from `Authorization: Bearer <token>` header or `req.cookies.jwt`
2. Verify JWT signature with `JWT_SECRET`
3. Load user by `decoded.id` from database
4. Validate:
   - User exists
   - User is active (`isActive === true`)
   - Password hasn't changed since token was issued
   - Merchant hasn't changed since token was issued
   - Branch hasn't changed since token was issued
5. Populate `req.user` with:
   - `role` (with `name`, `tasks[]`, `isSystemRole`)
   - `role.tasks[]` (each has `name`, `endpoint`, `method`, `description`, `isMerchant`)
   - `merchant` (with subscription/feature data)
   - `branch`

**Result**: Authenticated user available as `req.user`, or 401 error.

---

### 2. `restrictTo()` Middleware (Task-Based Authorization)

**Source**: `src/common/guards/auth.guard.js` (lines 210-269)

**CRITICAL FINDING**: The function signature accepts role name arguments like `restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN')`, but **the implementation completely ignores them**. This is cosmetic documentation only.

**Actual Logic**:

1. **Public route check**: If URL matches `PUBLIC_ROUTES` (login, signup, health, etc.), bypass authorization → `next()`

2. **SUPER-ADMIN bypass**: If either condition is true, skip task checking entirely → `next()`
   ```javascript
   role.name === 'SUPER-ADMIN' || role.isSystemRole === true
   ```

3. **Task-based authorization**: For all other users:
   - Extract `req.originalUrl` (strip query string)
   - Extract `req.method` (HTTP verb)
   - Convert URL to pattern (e.g., `/api/v1/branches/507f191e810c19729de860ea` → `/api/v1/branches/:id`)
   - Match against `req.user.role.tasks[]`:
     - Each task has `endpoint` (URL pattern, may contain `:param` or `*` wildcards) and `method` (HTTP verb or `*`)
     - Compile task.endpoint into regex (lines 133-178 for safety against ReDoS)
     - Check if pattern matches request URL AND method matches HTTP verb
   - If any task matches → `next()`
   - If no tasks match → 403 "Access denied: GET /api/v1/branches"

4. **No tasks assigned**: If role exists but has empty `tasks[]` → 403 "This role has no permissions configured yet"

---

### 3. SUPER-ADMIN Bypass Mechanism

**Two ways to grant universal access** (OR logic, line 246):

1. **Role name match**: `role.name === 'SUPER-ADMIN'`
   - Exact string comparison (case-sensitive)
   - Must be literally `'SUPER-ADMIN'`

2. **System role flag**: `role.isSystemRole === true`
   - Boolean field on Role model
   - Any role with `isSystemRole: true` bypasses task checking

**Behavior when bypassed**:
- No task array required (`tasks: []` is fine)
- No endpoint/method matching performed
- Instant `next()` after bypass check

**Usage in codebase**:
- `scripts/createSuperAdmin.js` creates role with `name: 'SUPER-ADMIN'`, `isSystemRole: true`, `tasks: []`
- `src/modules/roles/roles.routes.js` (lines 20-24) has hard-coded check for SUPER-ADMIN for role management endpoints

---

## Protected Route Inventory

### Pattern A: Task-Based Protection (Most Routes)

**Pattern**:
```javascript
router.use(protect);
router.use(restrictTo());
```

**Meaning**: All routes below require valid JWT + at least one matching task in `req.user.role.tasks[]`.

**Affected Routes** (source: grep results):

| Route Pattern | Module | Operations |
|---------------|--------|------------|
| `/api/v1/branches/*` | branches.routes.js | GET all, POST create, PATCH update, DELETE, suspend, activate, features, assign menu groups, list staff |
| `/api/v1/menu/*` | menu.routes.js, menus.routes.js | CRUD menu items, get staff menu |
| `/api/v1/menu-groups/*` | menu-groups.routes.js | CRUD menu groups, light list |
| `/api/v1/branch-menu-groups/*` | branch-menu-groups.routes.js | Assign menu groups to branches |
| `/api/v1/combos/*` | combos.routes.js | CRUD combos (excluding `/active` which is public) |
| `/api/v1/tables/*` | table.routes.js, tables.routes.js | CRUD tables |
| `/api/v1/sessions/*` | sessions.routes.js | PATCH free table |
| `/api/v1/merchants/*` | merchants.routes.js | POST KYC, CRUD merchant roles, CRUD merchant users, GET me, PATCH me |
| `/api/v1/users/*` | users.routes.js | GET all, POST create, PATCH update, DELETE |
| `/api/v1/orders/staff` | orders.routes.js | POST staff place order |
| `/api/v1/orders/active` | orders.routes.js | GET active orders (with filters) |
| `/api/v1/orders/completed` | orders.routes.js | GET completed orders |
| `/api/v1/orders/pending` | orders.routes.js | GET pending orders |
| `/api/v1/orders/accepted` | orders.routes.js | GET accepted orders |
| `/api/v1/orders/preparing` | orders.routes.js | GET preparing orders |
| `/api/v1/orders/ready` | orders.routes.js | GET ready orders |
| `/api/v1/orders/served` | orders.routes.js | GET served orders |
| `/api/v1/orders/canceled` | orders.routes.js | GET canceled orders |
| `/api/v1/orders/number/:orderNumber` | orders.routes.js | GET order by number |
| `/api/v1/orders/:id/pay` | orders.routes.js | POST mark as paid (with image upload) |
| `/api/v1/orders/:id/status` | orders.routes.js | PATCH update order status |
| `/api/v1/orders/:id/add-items` | orders.routes.js | PATCH add items to order |
| `/api/v1/orders/:id` | orders.routes.js | GET order by ID |
| `/api/v1/ingredients/*` | ingredients.routes.js | CRUD ingredients |
| `/api/v1/inventory/*` | inventory.routes.js | Inventory operations |
| `/api/v1/suppliers/*` | suppliers.routes.js | CRUD suppliers |
| `/api/v1/recipes/*` | recipes.routes.js | CRUD recipes |
| `/api/v1/purchase-orders/*` | purchase-orders.routes.js | CRUD purchase orders |
| `/api/v1/files/*` | file.routes.js | File operations |
| `/api/v1/analytics/*` | analytics.routes.js | Analytics endpoints |
| `/api/v1/feedback/*` | feedback.routes.js | Feedback endpoints |

### Pattern B: Reports (Cosmetic Role Names, Actually Task-Based)

**Pattern**:
```javascript
router.get('/sales',
  validate(...),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),  // ← IGNORED
  getSalesReport
);
```

**Meaning**: Despite the role name arguments, authorization is still task-based. The `'MERCHANT_ADMIN'` string is never checked. Only matching task in `role.tasks[]` or SUPER-ADMIN bypass grants access.

**Report Endpoints** (source: reports.routes.js):

| Endpoint | Method | Line |
|----------|--------|------|
| `/api/v1/reports/sales` | GET | 51-55 |
| `/api/v1/reports/orders` | GET | 65-69 |
| `/api/v1/reports/products` | GET | 79-83 |
| `/api/v1/reports/customers` | GET | 93-97 |
| `/api/v1/reports/delivery` | GET | 107-111 |
| `/api/v1/reports/profitability` | GET | 121-125 |
| `/api/v1/reports/staff` | GET | 135-139 |
| `/api/v1/reports/inventory` | GET | 149-153 |
| `/api/v1/reports/exports` | POST | 176-180 |
| `/api/v1/reports/exports/:jobId` | GET | 195-198 |

### Pattern C: Hard SUPER-ADMIN Check (Not Task-Based)

**Pattern**:
```javascript
router.use(protect);
router.use((req, res, next) => {
  if (req.user?.role?.name !== 'SUPER-ADMIN' && !req.user?.role?.isSystemRole) {
    return next(new AppError('Access denied. Super Admin only.', 403));
  }
  next();
});
```

**Meaning**: Hard-coded role name check (not using `restrictTo()`). Only `SUPER-ADMIN` or `isSystemRole: true` can access.

**Affected Routes**:
- `/api/v1/roles/*` - System role management (roles.routes.js, lines 20-24)

### Pattern D: Public Routes (No Protection)

**No `protect()` or `restrictTo()`**:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/v1/auth/signup` | POST | Staff registration |
| `/api/v1/auth/login` | POST | Staff login |
| `/api/v1/auth/forgot-password` | POST | Password reset request |
| `/api/v1/auth/reset-password/:token` | PATCH | Password reset execution |
| `/api/v1/user/signup` | POST | Customer registration |
| `/api/v1/user/login` | POST | Customer login |
| `/api/v1/user/social-login` | POST | OAuth customer login |
| `/api/v1/user/forgotPassword` | POST | Customer password reset |
| `/api/v1/user/resetPassword/:token` | PATCH | Customer password reset execution |
| `/health` | GET | Health check |
| `/health/ready` | GET | Readiness probe |
| `/api/v1/branches/nearby` | GET | Public branch lookup |
| `/api/v1/branches/:id` | GET | Public branch details |
| `/api/v1/menu/customer` | GET | QR menu (customer-facing) |
| `/api/v1/combos/active` | GET | Active combos (customer-facing) |
| `/api/v1/orders` (customer) | POST | Customer place order via `protectTableSession` |

---

## Database State

**Inspected on**: 2026-08-16

**Production Database** (`MesobDb`):
- Roles: 0
- Tasks: 0

**Test Database** (`restaurant-test`):
- Exists separately
- Not shared with production

**Conclusion**: No roles or tasks exist in production. All protected routes are currently inaccessible except to users with no role check (impossible since `protect()` requires role population).

---

## Required Tasks for MERCHANT_ADMIN

Based on the protected route inventory above, a `MERCHANT_ADMIN` role needs tasks covering:

1. **Branch Management**: `/api/v1/branches/*`
2. **Menu Management**: `/api/v1/menu/*`, `/api/v1/menu-groups/*`, `/api/v1/branch-menu-groups/*`, `/api/v1/combos/*`
3. **Table Management**: `/api/v1/tables/*`
4. **Session Management**: `/api/v1/sessions/*`
5. **Order Management**: `/api/v1/orders/*` (all staff routes)
6. **Inventory Management**: `/api/v1/ingredients/*`, `/api/v1/inventory/*`, `/api/v1/suppliers/*`, `/api/v1/recipes/*`, `/api/v1/purchase-orders/*`
7. **Merchant Self-Management**: `/api/v1/merchants/me`, `/api/v1/merchants/users/*`, `/api/v1/merchants/roles/*`
8. **User Management**: `/api/v1/users/*`
9. **Reports**: `/api/v1/reports/*`
10. **Files**: `/api/v1/files/*`
11. **Analytics**: `/api/v1/analytics/*`
12. **Feedback**: `/api/v1/feedback/*`

**Task Granularity**: Since `restrictTo()` matches on `endpoint` + `method`, tasks can be:
- **Coarse-grained**: `/api/v1/branches/*` with `method: '*'` (matches all operations)
- **Fine-grained**: `/api/v1/branches` with `method: 'POST'` (only create)

For `MERCHANT_ADMIN`, coarse-grained tasks are appropriate (full module access).

---

## Seeder Strategy

**Goal**: Create exactly 2 roles:

1. **SUPER-ADMIN**:
   - `name: 'SUPER-ADMIN'`
   - `isSystemRole: true`
   - `tasks: []` (empty - relies on bypass)
   - Matches `createSuperAdmin.js` pattern

2. **MERCHANT_ADMIN**:
   - `name: 'MERCHANT_ADMIN'`
   - `isSystemRole: false`
   - `tasks: [...]` (all task IDs for protected merchant operations)
   - Should be able to access all merchant-scoped operations

**Task Creation**:
- One task per major module (coarse-grained)
- `endpoint` uses `*` wildcard for sub-paths
- `method: '*'` to match all HTTP verbs
- `isMerchant: true` for merchant-scoped tasks

**Idempotency**:
- Use `findOneAndUpdate(..., { upsert: true })`
- Safe to re-run without duplicates

**Safety**:
- Only targets production DB (MesobDb)
- Does not run automatically
- User must manually execute
