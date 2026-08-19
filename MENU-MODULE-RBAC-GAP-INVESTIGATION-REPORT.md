# Menu Module RBAC Gap Investigation Report

**Date:** Context Transfer (Session Continuation)  
**Scope:** Menu Module RBAC/Permission Gaps (Pre-Production Security Audit)  
**Status:** Investigation Complete — Awaiting Fix Approval

---

## Executive Summary

Investigated 4 RBAC/permission gap items flagged in original code review. Found **3 CONFIRMED security issues** and **1 NOT CONFIRMED** (already handled correctly).

**Critical Findings:**
- ✅ **CONFIRMED HIGH:** Missing capability checks on menu item CRUD (POST /, PATCH /:id, DELETE /:id use `restrictTo()` with no roles while publish/archive require `requireCapability(CAPABILITIES.MENU_MANAGE)`)
- ✅ **CONFIRMED MEDIUM:** Hardcoded role string `'SUPER-MERCHANT-ADMIN'` repeated 5 times in MenuService.js (no use of constants)
- ✅ **CONFIRMED HIGH:** No branch ownership validation in `createCombo()` and `toggleBranchActive()` — SUPER-MERCHANT-ADMIN can submit branch IDs from different merchants
- ❌ **NOT CONFIRMED:** `updateCombo()` branch array validation exists (only SUPER-MERCHANT-ADMIN can change branches)
- ❌ **NOT CONFIRMED:** `updateBranchOverride()` uses user's own branch ID from token, not request body (secure)

---

## Investigation Item 1: Missing Capability Checks on Menu Item CRUD

### Finding: **CONFIRMED — HIGH SEVERITY**

### Evidence

#### Menu Item Routes (`src/modules/menu/menus.routes.js`)

**CRUD Routes (Lines 42-77):**
```javascript
// ── 2. Staff (JWT + RBAC) ─────────────────────────────────────────────────────
router.use(protect);
router.use(restrictTo());

router.get('/staff', menuController.getStaffMenu);

router.route('/').get(menuController.getAllMenu).post(
  menuController.uploadMenuPhoto,
  menuController.resizeAndProcessImages,
  menuController.createNewMenu
);

router.patch('/:id/toggle-availability', menuController.toggleMenuItemAvailability);

// ... (other routes)

router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(menuController.uploadMenuPhoto, menuController.resizeAndProcessImages, menuController.updateMenu)
  .delete(menuController.deleteMenu);
```

**Publish Lifecycle Routes (Lines 60-76):**
```javascript
// ── 3. Publish lifecycle (capability-gated) ───────────────────────────────────
router.post(
  '/publish',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  menuMgmtController.publishMenuGroup
);

router.patch(
  '/:id/archive',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  menuMgmtController.archiveMenuItem
);

router.get(
  '/publications/branch/:branchId',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  menuMgmtController.getBranchPublications
);
```

#### How `restrictTo()` Works (`src/common/guards/auth.guard.js`)

**Lines 174-231:**
```javascript
const restrictTo = () =>
  catchAsync(async (req, res, next) => {
    const fullUrl = req.originalUrl.split('?')[0].replace(/\/$/, '');
    const httpMethod = req.method.toUpperCase();
    const user = req.user;

    if (!user) return next(new AppError('Authentication required', 401));

    const isPublic = PUBLIC_ROUTES.some(
      r => (!r.method || r.method === httpMethod) && r.path.test(fullUrl)
    );
    if (isPublic) return next();

    const { role } = user;

    // SUPER-ADMIN and isSystemRole bypass all checks
    if (role && (role.name === 'SUPER-ADMIN' || role.isSystemRole === true)) {
      return next();
    }

    // Role has no tasks configured
    if (!Array.isArray(role?.tasks) || role.tasks.length === 0) {
      return next(
        new AppError(
          'This role has no permissions configured yet. Contact your administrator.',
          403
        )
      );
    }

    // Check if role's tasks include this endpoint+method
    const requestPattern = convertUrlToPattern(fullUrl);
    const matchers = getCompiledMatchers(role);

    const hasAccess = matchers.some(m => {
      const methodMatch = !m.method || m.method === '*' || m.method.toUpperCase() === httpMethod;
      if (!methodMatch) return false;

      if (!m.test) return requestPattern === m.endpoint;
      return m.test.test(requestPattern);
    });

    if (!hasAccess) {
      return next(new AppError(`Access denied: ${httpMethod} ${fullUrl}`, 403));
    }

    next();
  });
```

**Behavior:**
- `restrictTo()` called with **no roles argument** means it relies ONLY on task-based RBAC
- Any role with a matching task (endpoint+method) in their `role.tasks` array gets access
- SUPER-ADMIN and roles with `isSystemRole: true` bypass all checks

#### How `requireCapability()` Works (`src/common/guards/capability.guard.js`)

**Lines 7-22:**
```javascript
function requireCapability(...requiredCapabilities) {
  return catchAsync(async (req, res, next) => {
    // Feature flag: capability enforcement disabled by default
    if (process.env.CAPABILITY_ENFORCEMENT !== 'true') {
      return next();
    }

    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const allowed = requiredCapabilities.some(cap => userHasCapability(req.user, cap));
    if (!allowed) {
      return next(new AppError('Insufficient capabilities for this action', 403));
    }

    next();
  });
}
```

**Behavior:**
- **Only enforced when `CAPABILITY_ENFORCEMENT='true'` in environment**
- Otherwise always passes (relies on `restrictTo()` task-based RBAC only)
- Additional layer of security for high-risk operations

### Gap Analysis

| Route | Method | Current Auth | Gap |
|-------|--------|--------------|-----|
| **Menu Items** |
| `/api/v1/menus` | POST | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menus/:id` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menus/:id` | DELETE | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menus/:id` | GET | `protect` + `restrictTo()` | ✅ Read-only, OK |
| `/api/v1/menus` | GET | `protect` + `restrictTo()` | ✅ Read-only, OK |
| `/api/v1/menus/:id/toggle-availability` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menus/publish` | POST | `protect` + `restrictTo()` + `requireCapability(MENU_MANAGE)` | ✅ Has capability check |
| `/api/v1/menus/:id/archive` | PATCH | `protect` + `restrictTo()` + `requireCapability(MENU_MANAGE)` | ✅ Has capability check |
| **Menu Groups** |
| `/api/v1/menu-groups` | POST | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menu-groups/:id` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menu-groups/:id` | DELETE | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menu-groups/:id/add-item` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menu-groups/:id/remove-item` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/menu-groups/:id/reorder` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| **Branch Menu Groups** |
| `/api/v1/branch-menu-groups` | POST | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/branch-menu-groups/:id` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/branch-menu-groups/:id` | DELETE | `protect` + `restrictTo()` | ❌ No capability check |
| **Combos** |
| `/api/v1/combos` | POST | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/combos/:id` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/combos/:id` | DELETE | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/combos/:id/toggle-active` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/combos/:comboId/branch-toggle` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |
| `/api/v1/combos/:comboId/branch-override` | PATCH | `protect` + `restrictTo()` | ❌ No capability check |

### Impact

**Current State:**
- Any role with matching task permission can create/update/delete menu items, groups, and combos
- No additional capability check beyond task-based RBAC
- If `CAPABILITY_ENFORCEMENT='true'`, only publish/archive operations require `MENU_MANAGE` capability

**Risk:**
- Inconsistent permission model: read-only staff roles with task permissions could accidentally be granted write access
- Capability system exists but not leveraged for most menu write operations
- Publish/archive operations have stricter capability checks than basic CRUD (design inconsistency)

### Recommendation

**Option A (Strict - Align with Publish/Archive):**
Add `requireCapability(CAPABILITIES.MENU_MANAGE)` to all menu write operations:
- Menu item: POST, PATCH, DELETE, PATCH toggle-availability
- Menu group: POST, PATCH, DELETE, all item management routes
- Branch menu group: POST, PATCH, DELETE
- Combo: POST, PATCH, DELETE, all toggle/override routes

**Option B (Moderate - Separate Read/Write Capabilities):**
Introduce granular capabilities:
- `MENU_MANAGE_ITEMS` - menu item CRUD
- `MENU_MANAGE_GROUPS` - menu group CRUD
- `MENU_MANAGE_COMBOS` - combo CRUD
- `MENU_PUBLISH` - publish/archive lifecycle (existing `MENU_MANAGE`)

**Option C (Minimal - Keep Task RBAC Only):**
- Remove `requireCapability()` from publish/archive routes for consistency
- Rely solely on task-based RBAC (current behavior for most routes)
- Document that capability system is not enforced by default

**Recommended:** **Option A** — Most secure, consistent with existing publish/archive pattern, clear separation between read and write operations.

---

## Investigation Item 2: Hardcoded Role String Checks

### Finding: **CONFIRMED — MEDIUM SEVERITY**

### Evidence

Found **5 occurrences** of hardcoded `'SUPER-MERCHANT-ADMIN'` string literal in `MenuService.js`:

#### Occurrence 1: `createCombo()` (Line 885)
**File:** `src/modules/menu/service/MenuService.js:885`
```javascript
static async createCombo(comboData, req) {
  MenuService.parseComboFormFields(comboData);

  if (req.user.role.name !== 'SUPER-MERCHANT-ADMIN') {
    if (!req.user.branch) throw new AppError('No branch assigned', 403);
    comboData.branches = [req.user.branch._id];
  } else if (!comboData.branches?.length) {
    throw new AppError('Super admin must select at least one branch', 400);
  }
```

#### Occurrence 2: `getAllCombos()` (Line 938)
**File:** `src/modules/menu/service/MenuService.js:938`
```javascript
static async getAllCombos(req) {
  const userRole = req.user.role?.name;
  const userBranchId = req.user.branch?._id?.toString();
  let query = { merchant: req.user.merchant._id };

  if (userRole !== 'SUPER-MERCHANT-ADMIN') {
    if (!userBranchId) throw new AppError('No branch assigned', 403);
    query.$or = [{ branches: { $size: 0 } }, { branches: userBranchId }];
  }
```

#### Occurrence 3: `updateCombo()` (Line 975)
**File:** `src/modules/menu/service/MenuService.js:975`
```javascript
if (req.body.branches !== undefined && req.user.role.name !== 'SUPER-MERCHANT-ADMIN') {
  throw new AppError('Not allowed to change branches', 403);
}
```

#### Occurrence 4: `updateBranchOverride()` (Line 1009)
**File:** `src/modules/menu/service/MenuService.js:1009-1011`
```javascript
if (
  req.user.role.name !== 'SUPER-MERCHANT-ADMIN' &&
  req.user.branch?._id.toString() !== branchId
) {
  throw new AppError('You can only override your own branch', 403);
}
```

#### Occurrence 5: `toggleBranchActive()` (Line 1093)
**File:** `src/modules/menu/service/MenuService.js:1093-1095`
```javascript
let targetBranchId = branchId;
if (req.user.role.name === 'SUPER-MERCHANT-ADMIN' && req.body.branchId) {
  targetBranchId = req.body.branchId;
}
```

### Additional Context: Role Constants Already Exist

**File:** `src/common/constants/roles.js`
**Created:** Task 1 (Merchant Admin Role Name Typo Fix)

```javascript
/**
 * @file src/common/constants/roles.js
 * @description Centralized role name constants
 * 
 * IMPORTANT: Always import and use these constants instead of hardcoding role names.
 * This prevents bugs like the MERCHANT_ADMIN vs SUPER-MERCHANT-ADMIN typo that broke signup.
 * 
 * Usage:
 *   const { ROLE_NAMES } = require('../common/constants/roles');
 *   if (req.user.role.name === ROLE_NAMES.SUPER_MERCHANT_ADMIN) { ... }
 */

const ROLE_NAMES = {
  /**
   * System-level superuser
   * - Bypasses all RBAC checks (isSystemRole: true)
   * - Not tied to any merchant
   * - For platform administration only
   */
  SUPER_ADMIN: 'SUPER-ADMIN',

  /**
   * Merchant-level administrator
   * - Full access to merchant-scoped operations
   * - Has all merchant tasks (isMerchant: true)
   * - Assigned during signup
   */
  SUPER_MERCHANT_ADMIN: 'SUPER-MERCHANT-ADMIN',
};

module.exports = { ROLE_NAMES };
```

### Impact

**Current State:**
- Role name `'SUPER-MERCHANT-ADMIN'` hardcoded as string literal 5 times in MenuService.js
- Role constants file exists but not imported/used in MenuService.js
- Risk of typo-related bugs (e.g., `'MERCHANT_ADMIN'` vs `'SUPER-MERCHANT-ADMIN'` bug from Task 1)

**Risk:**
- Future role name changes require manual find-replace across multiple files
- Typos can break authentication logic silently (no compile-time error)
- Inconsistent with the role constants pattern established in Task 1

### Recommendation

**Fix:**
1. Import role constants at top of `MenuService.js`:
   ```javascript
   const { ROLE_NAMES } = require('../../../common/constants/roles');
   ```

2. Replace all 5 hardcoded string literals:
   - Line 885: `req.user.role.name !== 'SUPER-MERCHANT-ADMIN'` → `req.user.role.name !== ROLE_NAMES.SUPER_MERCHANT_ADMIN`
   - Line 938: `userRole !== 'SUPER-MERCHANT-ADMIN'` → `userRole !== ROLE_NAMES.SUPER_MERCHANT_ADMIN`
   - Line 975: `req.user.role.name !== 'SUPER-MERCHANT-ADMIN'` → `req.user.role.name !== ROLE_NAMES.SUPER_MERCHANT_ADMIN`
   - Line 1009: `req.user.role.name !== 'SUPER-MERCHANT-ADMIN'` → `req.user.role.name !== ROLE_NAMES.SUPER_MERCHANT_ADMIN`
   - Line 1093: `req.user.role.name === 'SUPER-MERCHANT-ADMIN'` → `req.user.role.name === ROLE_NAMES.SUPER_MERCHANT_ADMIN`

**Additional Sweep:** Search entire codebase for other hardcoded role strings (see "Other Hardcoded Role Strings Found" below).

---

## Investigation Item 3: No Branch Ownership Validation in Combo Operations

### Finding: **CONFIRMED — HIGH SEVERITY (Partial)**

Confirmed that **2 methods have missing branch ownership validation**. Other methods already validate correctly.

### Evidence

#### ❌ **VULNERABLE: `createCombo()` — Line 885-896**

**File:** `src/modules/menu/service/MenuService.js:882-896`
```javascript
static async createCombo(comboData, req) {
  MenuService.parseComboFormFields(comboData);

  // ISSUE: If SUPER-MERCHANT-ADMIN submits branches array, no validation
  // that those branch IDs belong to req.user.merchant
  if (req.user.role.name !== 'SUPER-MERCHANT-ADMIN') {
    if (!req.user.branch) throw new AppError('No branch assigned', 403);
    comboData.branches = [req.user.branch._id];
  } else if (!comboData.branches?.length) {
    throw new AppError('Super admin must select at least one branch', 400);
  }

  comboData.items = await MenuService.enrichComboItems(comboData.items);
  comboData.merchant = req.user.merchant._id;

  return MenuRepository.createCombo(comboData);
}
```

**Vulnerable Flow:**
1. SUPER-MERCHANT-ADMIN (Merchant A) submits `POST /api/v1/combos` with:
   ```json
   {
     "name": "Stolen Combo",
     "branches": ["<branch-id-from-merchant-B>"]
   }
   ```
2. Code checks `req.user.role.name === 'SUPER-MERCHANT-ADMIN'` → true
3. Code checks `comboData.branches?.length` → true (has 1 branch)
4. **NO VALIDATION** that branch ID belongs to `req.user.merchant`
5. Combo created with `merchant: merchantA._id` but `branches: [merchantB.branchId]`
6. Result: Combo tied to Merchant A but targeting Merchant B's branch (data corruption)

**Branch Model Schema:**
**File:** `models/branchModel.js:5-10`
```javascript
const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
```

**Impact:**
- SUPER-MERCHANT-ADMIN can assign combo to branches belonging to other merchants
- Multi-tenant data isolation breach
- Combo appears in wrong merchant's branch menus

#### ❌ **VULNERABLE: `toggleBranchActive()` — Line 1085-1095**

**File:** `src/modules/menu/service/MenuService.js:1085-1105`
```javascript
static async toggleBranchActive(req) {
  const { comboId } = req.params;
  const branchId = req.user.branch?._id?.toString();

  if (!branchId) throw new AppError('No branch assigned', 403);

  let targetBranchId = branchId;
  // ISSUE: If SUPER-MERCHANT-ADMIN submits req.body.branchId, no validation
  // that it belongs to req.user.merchant
  if (req.user.role.name === 'SUPER-MERCHANT-ADMIN' && req.body.branchId) {
    targetBranchId = req.body.branchId;
  }

  const combo = await MenuRepository.findComboOne({
    _id: comboId,
    merchant: req.user.merchant._id,
  });
  if (!combo) throw new AppError('Combo not found', 404);

  const isApplicable =
    combo.branches.length === 0 || combo.branches.some(b => b.toString() === targetBranchId);
  if (!isApplicable) throw new AppError('Combo not available in this branch', 400);
  // ... rest of method
}
```

**Vulnerable Flow:**
1. SUPER-MERCHANT-ADMIN (Merchant A) owns Combo X
2. Submits `PATCH /api/v1/combos/:comboId/branch-toggle` with:
   ```json
   {
     "branchId": "<branch-id-from-merchant-B>"
   }
   ```
3. Code checks `req.user.role.name === 'SUPER-MERCHANT-ADMIN'` → true
4. Code accepts `targetBranchId = req.body.branchId`
5. **NO VALIDATION** that `req.body.branchId` belongs to `req.user.merchant`
6. Combo query validates `merchant: req.user.merchant._id` (Combo must belong to Merchant A)
7. But `isApplicable` check passes if Merchant B's branch ID was somehow added to `combo.branches` array
8. Result: Toggle branch-specific active status for wrong merchant's branch (if combo.branches was already corrupted)

**Impact:**
- SUPER-MERCHANT-ADMIN can target branches from other merchants
- Combined with `createCombo()` vulnerability, can manipulate combo availability across merchant boundaries

#### ✅ **SECURE: `updateCombo()` — Line 975-978**

**File:** `src/modules/menu/service/MenuService.js:966-983`
```javascript
static async updateCombo(req) {
  MenuService.parseComboFormFields(req.body);

  const combo = await MenuRepository.findComboOne({
    _id: req.params.id,
    merchant: req.user.merchant._id,
  });
  if (!combo) throw new AppError('Combo not found', 404);

  // SECURE: Only SUPER-MERCHANT-ADMIN can change branches, but no validation
  // of branch ownership (relies on frontend/admin to only submit valid IDs)
  if (req.body.branches !== undefined && req.user.role.name !== 'SUPER-MERCHANT-ADMIN') {
    throw new AppError('Not allowed to change branches', 403);
  }
  // ... rest of method
}
```

**Analysis:**
- Only SUPER-MERCHANT-ADMIN can update `branches` array
- Non-admin users blocked from changing branches
- **Still vulnerable:** If SUPER-MERCHANT-ADMIN submits `req.body.branches` with foreign branch IDs, no validation occurs
- **Mitigation:** Same fix as `createCombo()` needed

#### ✅ **SECURE: `updateBranchOverride()` — Line 988-1037**

**File:** `src/modules/menu/service/MenuService.js:988-1037`
```javascript
static async updateBranchOverride(req) {
  const { comboId } = req.params;
  const branchId = req.user.branch?._id?.toString();
  // ... field parsing ...

  const combo = await MenuRepository.findComboOne({
    _id: comboId,
    merchant: req.user.merchant._id,
  });
  if (!combo) throw new AppError('Combo not found', 404);

  // SECURE: branchId comes from req.user.branch (JWT token), not request body
  if (
    req.user.role.name !== 'SUPER-MERCHANT-ADMIN' &&
    req.user.branch?._id.toString() !== branchId
  ) {
    throw new AppError('You can only override your own branch', 403);
  }
  // ... rest of method uses branchId from token ...
}
```

**Analysis:**
- `branchId` sourced from `req.user.branch?._id` (JWT token claim, populated via `protect` middleware)
- **NOT from request body** — secure by design
- SUPER-MERCHANT-ADMIN check exists but is redundant (always uses token's branch ID)
- **No vulnerability:** User can only override their assigned branch

### Summary Table

| Method | Branch ID Source | Validated? | Severity |
|--------|------------------|------------|----------|
| `createCombo()` | `req.body.branches` (SUPER-MERCHANT-ADMIN only) | ❌ No | **HIGH** |
| `updateCombo()` | `req.body.branches` (SUPER-MERCHANT-ADMIN only) | ❌ No | **HIGH** |
| `toggleBranchActive()` | `req.body.branchId` (SUPER-MERCHANT-ADMIN only) | ❌ No | **HIGH** |
| `updateBranchOverride()` | `req.user.branch._id` (JWT token) | ✅ Yes | N/A (secure) |

### Recommendation

**Add branch ownership validation for all three vulnerable methods:**

#### Fix for `createCombo()`
**File:** `src/modules/menu/service/MenuService.js:882-896`

Add validation after line 889:
```javascript
static async createCombo(comboData, req) {
  MenuService.parseComboFormFields(comboData);

  if (req.user.role.name !== ROLE_NAMES.SUPER_MERCHANT_ADMIN) {
    if (!req.user.branch) throw new AppError('No branch assigned', 403);
    comboData.branches = [req.user.branch._id];
  } else if (!comboData.branches?.length) {
    throw new AppError('Super admin must select at least one branch', 400);
  } else {
    // NEW: Validate branch ownership
    const Branch = require('../../../../models/branchModel');
    const branchIds = comboData.branches.map(b => b.toString());
    const validBranches = await Branch.find({
      _id: { $in: branchIds },
      merchant: req.user.merchant._id,
    }).select('_id');
    
    if (validBranches.length !== branchIds.length) {
      throw new AppError('One or more branches do not belong to your merchant', 403);
    }
  }

  comboData.items = await MenuService.enrichComboItems(comboData.items);
  comboData.merchant = req.user.merchant._id;

  return MenuRepository.createCombo(comboData);
}
```

#### Fix for `updateCombo()`
**File:** `src/modules/menu/service/MenuService.js:966-983`

Add validation after line 975:
```javascript
if (req.body.branches !== undefined && req.user.role.name !== ROLE_NAMES.SUPER_MERCHANT_ADMIN) {
  throw new AppError('Not allowed to change branches', 403);
}

// NEW: Validate branch ownership if branches array is being updated
if (req.body.branches !== undefined && req.user.role.name === ROLE_NAMES.SUPER_MERCHANT_ADMIN) {
  const Branch = require('../../../../models/branchModel');
  const branchIds = req.body.branches.map(b => b.toString());
  const validBranches = await Branch.find({
    _id: { $in: branchIds },
    merchant: req.user.merchant._id,
  }).select('_id');
  
  if (validBranches.length !== branchIds.length) {
    throw new AppError('One or more branches do not belong to your merchant', 403);
  }
}
```

#### Fix for `toggleBranchActive()`
**File:** `src/modules/menu/service/MenuService.js:1085-1105`

Add validation after line 1095:
```javascript
let targetBranchId = branchId;
if (req.user.role.name === ROLE_NAMES.SUPER_MERCHANT_ADMIN && req.body.branchId) {
  // NEW: Validate branch ownership
  const Branch = require('../../../../models/branchModel');
  const branch = await Branch.findOne({
    _id: req.body.branchId,
    merchant: req.user.merchant._id,
  }).select('_id');
  
  if (!branch) {
    throw new AppError('Branch does not belong to your merchant', 403);
  }
  
  targetBranchId = req.body.branchId;
}
```

---

## Investigation Item 4: General Sweep for Same Patterns

### Finding: **NO ADDITIONAL ISSUES FOUND**

Reviewed all menu module write endpoints:
- ✅ Menu Groups: No branch ID parameters in create/update operations
- ✅ Branch Menu Groups: Branch ID comes from `req.user.branch` (JWT token), not request body
- ✅ Menu Items: No branch-specific operations (branch filtering at query level only)

**Confirmed secure:**
- Menu group CRUD does not accept branch IDs
- Branch menu group CRUD uses token's branch ID (`req.user.branch._id`)
- No other endpoints found with user-submitted branch ID parameters

---

## Other Hardcoded Role Strings Found (Outside Menu Module)

Found additional hardcoded `'SUPER-MERCHANT-ADMIN'` strings in other modules (not in scope for this investigation, but flagged for awareness):

### 1. `src/modules/roles/task.controller.js`
**Lines 31, 86:** Auto-assign merchant tasks to SUPER-MERCHANT-ADMIN role
- Used for seeding/admin operations
- Lower risk (admin-only code paths)
- Should still use constants for consistency

### 2. `src/modules/order/service/OrderStateMachineService.js`
**Line 309:** Role name check for state transition permissions
- Same pattern as MenuService.js
- Should use constants

### 3. `src/modules/kitchen/service/KitchenTicketService.js`
**Line 420:** Role name check for ticket assignment logic
- Same pattern as MenuService.js
- Should use constants

### 4. `src/modules/auth/auth.service.js`
**Line 279:** Query for SUPER-MERCHANT-ADMIN role during signup
- **CRITICAL:** This was the bug fixed in Task 1 (`'MERCHANT_ADMIN'` typo)
- Already uses string literal (not constants)
- **HIGH PRIORITY:** Should use constants to prevent future typos

### 5. `src/modules/branch/service/BranchService.js`
**Line 519:** Role name check for branch override operations
- Same pattern as MenuService.js
- Should use constants

### Recommendation
**Phase RBAC-C (Future):** Sweep entire codebase and replace all hardcoded role strings with constants from `src/common/constants/roles.js`.

---

## Complete Route Permission Table

### Menu Items (`/api/v1/menus`)

| Route | Method | Auth Middleware | Capability Check | Notes |
|-------|--------|-----------------|------------------|-------|
| `/public` | GET | `protectTableSession` | None | Public (table QR session) |
| `/public/beverages` | GET | `protectTableSession` | None | Public (table QR session) |
| `/public/drinks` | GET | `protectTableSession` | None | Public (table QR session) |
| `/public/food` | GET | `protectTableSession` | None | Public (table QR session) |
| `/staff` | GET | `protect` + `restrictTo()` | None | Staff view (JWT + task RBAC) |
| `/` | GET | `protect` + `restrictTo()` | None | List all menu items |
| `/` | POST | `protect` + `restrictTo()` | ❌ **Missing** | Create menu item |
| `/:id` | GET | `protect` + `restrictTo()` | None | Get single menu item |
| `/:id` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Update menu item |
| `/:id` | DELETE | `protect` + `restrictTo()` | ❌ **Missing** | Delete menu item |
| `/:id/toggle-availability` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Toggle availability |
| `/publish` | POST | `protect` + `restrictTo()` | ✅ `requireCapability(MENU_MANAGE)` | Publish menu group |
| `/:id/archive` | PATCH | `protect` + `restrictTo()` | ✅ `requireCapability(MENU_MANAGE)` | Archive menu item |
| `/publications/branch/:branchId` | GET | `protect` + `restrictTo()` | ✅ `requireCapability(MENU_MANAGE)` | Get branch publications |

### Menu Groups (`/api/v1/menu-groups`)

| Route | Method | Auth Middleware | Capability Check | Notes |
|-------|--------|-----------------|------------------|-------|
| `/light` | GET | `protect` + `restrictTo()` | None | List menu groups (light) |
| `/` | GET | `protect` + `restrictTo()` | None | List all menu groups |
| `/` | POST | `protect` + `restrictTo()` | ❌ **Missing** | Create menu group |
| `/:id` | GET | `protect` + `restrictTo()` | None | Get single menu group |
| `/:id` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Update menu group |
| `/:id` | DELETE | `protect` + `restrictTo()` | ❌ **Missing** | Delete menu group |
| `/:id/add-item` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Add item to group |
| `/:id/remove-item` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Remove item from group |
| `/:id/reorder` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Reorder group items |

### Branch Menu Groups (`/api/v1/branch-menu-groups`)

| Route | Method | Auth Middleware | Capability Check | Notes |
|-------|--------|-----------------|------------------|-------|
| `/` | GET | `protect` + `restrictTo()` | None | List branch menu groups |
| `/` | POST | `protect` + `restrictTo()` | ❌ **Missing** | Create branch menu group |
| `/:id` | GET | `protect` + `restrictTo()` | None | Get single branch menu group |
| `/:id` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Update branch menu group |
| `/:id` | DELETE | `protect` + `restrictTo()` | ❌ **Missing** | Delete branch menu group |
| `/:id/add-item` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Add item to branch group |
| `/:id/remove-item` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Remove item from branch group |
| `/:id/reorder` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Reorder branch group items |

### Combos (`/api/v1/combos`)

| Route | Method | Auth Middleware | Capability Check | Notes |
|-------|--------|-----------------|------------------|-------|
| `/active` | GET | None | None | Public (customer-facing) |
| `/` | GET | `protect` + `restrictTo()` | None | List all combos |
| `/` | POST | `protect` + `restrictTo()` | ❌ **Missing** | Create combo (+ **branch ownership gap**) |
| `/:id` | GET | `protect` + `restrictTo()` | None | Get single combo |
| `/:id` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Update combo (+ **branch ownership gap**) |
| `/:id` | DELETE | `protect` + `restrictTo()` | ❌ **Missing** | Delete combo |
| `/:id/toggle-active` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Toggle combo active status |
| `/:comboId/branch-toggle` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Toggle branch-specific active (+ **branch ownership gap**) |
| `/:comboId/branch-override` | PATCH | `protect` + `restrictTo()` | ❌ **Missing** | Update branch override |
| `/increment-sold` | POST | `protect` + `restrictTo()` | None | Internal service-to-service |

**Total Routes Reviewed:** 41  
**Routes Missing Capability Checks:** 25 write operations  
**Routes With Branch Ownership Gaps:** 3 (createCombo, updateCombo, toggleBranchActive)

---

## Summary of Findings

| # | Issue | Status | Severity | File:Lines | Fix Recommendation |
|---|-------|--------|----------|------------|--------------------|
| 1 | Missing capability checks on menu item CRUD | ✅ CONFIRMED | HIGH | `menus.routes.js`, `menu-groups.routes.js`, `branch-menu-groups.routes.js`, `combos.routes.js` | Add `requireCapability(CAPABILITIES.MENU_MANAGE)` to all write operations (POST, PATCH, DELETE) |
| 2 | Hardcoded `'SUPER-MERCHANT-ADMIN'` string (5×) | ✅ CONFIRMED | MEDIUM | `MenuService.js:885, 938, 975, 1009, 1093` | Replace with `ROLE_NAMES.SUPER_MERCHANT_ADMIN` constant |
| 3a | No branch ownership validation in `createCombo()` | ✅ CONFIRMED | HIGH | `MenuService.js:882-896` | Validate `branches` array against `req.user.merchant._id` |
| 3b | No branch ownership validation in `updateCombo()` | ✅ CONFIRMED | HIGH | `MenuService.js:966-983` | Validate `branches` array against `req.user.merchant._id` |
| 3c | No branch ownership validation in `toggleBranchActive()` | ✅ CONFIRMED | HIGH | `MenuService.js:1085-1105` | Validate `req.body.branchId` against `req.user.merchant._id` |
| 3d | `updateBranchOverride()` branch ID source | ❌ NOT CONFIRMED | N/A | `MenuService.js:988-1037` | Already secure (uses JWT token branch ID) |
| 4 | Other menu module endpoints | ❌ NOT CONFIRMED | N/A | All menu module routes | No additional issues found |

**CONFIRMED: 3 issues (7 total fixes needed)**  
**NOT CONFIRMED: 2 items (already secure or not applicable)**

---

## Proposed Fix Implementation Order

1. **Fix Item 2 (Hardcoded Role Strings) — MEDIUM, Low Risk**
   - Import `ROLE_NAMES` constant
   - Replace 5 string literals
   - Low code change risk, high readability gain

2. **Fix Item 3 (Branch Ownership Validation) — HIGH, Medium Risk**
   - Add branch ownership checks to 3 methods
   - Requires database queries (performance consideration)
   - Medium code change risk, critical security fix

3. **Fix Item 1 (Missing Capability Checks) — HIGH, High Risk**
   - Add `requireCapability()` to 25 write endpoints
   - Requires product decision (Option A/B/C)
   - High code change risk, requires regression testing
   - **NOTE:** Requires `CAPABILITY_ENFORCEMENT='true'` in environment to activate

---

## Next Steps

1. **User Approval:** Review findings and fix recommendations
2. **Product Decision:** Choose Option A/B/C for capability check enforcement (Item 1)
3. **Implementation:** Apply fixes in order 2 → 3 → 1
4. **Testing:** Run HTTP-level integration tests (separate prompt — Prompt 2)
5. **Phase C Planning:** Decide if additional security features needed (e.g., audit logging for branch override operations)

---

**Investigation Complete — Awaiting Fix Approval**
