# Menu System - Production Readiness Check

**Date:** August 22, 2026  
**Auditor:** Kiro AI  
**Status:** ⚠️ **NOT PRODUCTION READY** - Critical Issues Found

---

## Executive Summary

### Overall Status: 🔴 **BLOCKED FOR PRODUCTION**

| Component | Status | Severity | Blocking |
|-----------|--------|----------|----------|
| Category Controller | 🔴 **BROKEN** | CRITICAL | ✅ YES |
| Route 3 Tests | 🔴 **MISSING** | CRITICAL | ✅ YES |
| Image Handling | 🟡 **INCONSISTENT** | HIGH | ❌ NO |
| AuditLogger Bug | 🔴 **BROKEN** | HIGH | ❌ NO |
| Display Views | 🟡 **INCOMPLETE** | MEDIUM | ❌ NO |
| Documentation | 🟢 **COMPLETE** | LOW | ❌ NO |

**Verdict:** **DO NOT DEPLOY** - 2 critical blockers must be fixed first

---

## 🔴 CRITICAL BLOCKERS (Must Fix Before Deploy)

### Blocker 1: Category API Completely Broken

**Severity:** **CRITICAL** - All category endpoints return 500 errors

**Problem:**
- Routes import controller from wrong location
- Service import uses wrong syntax
- Node.js caching prevents fixes from taking effect without restart
- **NO category endpoints work** - breaks menu item creation

**Affected Endpoints:**
```
GET  /api/v1/categories         → 500 Error
GET  /api/v1/categories/active  → 500 Error
POST /api/v1/categories         → 500 Error
PATCH /api/v1/categories/:id    → 500 Error
```

**Impact:**
- Cannot create menu items (requires valid category)
- Cannot list categories for dropdown
- Cannot filter menu items by category
- **BREAKS ENTIRE MENU MANAGEMENT**

**Evidence:**
```
TypeError: Cannot read properties of undefined (reading 'getAllCategories')
    at category.controller.js:35:44
```

**Root Cause:**
1. Controller moved to `src/modules/categories/controller/` ✅
2. Routes still importing from `src/modules/menu/controller/` ❌
3. Import path updated but **server not restarted** ❌
4. Node.js serving cached broken version ❌

**Fix Required:**
```bash
# 1. Verify correct import paths (DONE)
# 2. RESTART SERVER (USER MUST DO)
# 3. Test all category endpoints
# 4. Verify 200 responses before deploying
```

**Status:** ⚠️ **PARTIALLY FIXED** - Code correct, server restart needed

**Must Do Before Deploy:**
- [ ] Restart Node.js server
- [ ] Test: `GET /api/v1/categories/active`
- [ ] Verify: Returns 200 with category list
- [ ] Test: Create/Update/Delete categories
- [ ] Confirm: No 500 errors

---

### Blocker 2: Route 3 Tests Don't Exist

**Severity:** **CRITICAL** - Cannot verify production behavior

**Problem:**
- File `tests/menu-publish-transactional.test.js` is **markdown documentation**
- Not actual JavaScript test code
- Claims "14/14 tests passing" cannot be verified
- **Zero test coverage** for menu publishing (most complex feature)

**Impact:**
- Cannot verify menu publishing works correctly
- Cannot verify transaction rollback works
- Cannot verify version conflict handling
- Cannot verify concurrent publishing
- **Deploying untested critical feature** = HIGH RISK

**What's Missing:**
```javascript
// NO ACTUAL TESTS EXIST FOR:
- publishMenuGroup() success path
- publishMenuGroup() with version conflicts
- publishMenuGroup() transaction rollback
- publishMenuGroup() concurrent publishing
- publishMenuGroup() validation failures
- Recipe validation enforcement
- Publication snapshot creation
```

**Fix Required:**
1. Rename markdown: `tests/menu-publish-transactional.test.js` → `docs/ROUTE-3-TEST-DESIGN.md`
2. Create REAL test file: `tests/menu-publish-transactional.test.js` (JavaScript)
3. Implement all test cases from markdown documentation
4. Run tests: `npm test -- tests/menu-publish-transactional.test.js`
5. Verify all tests pass
6. Only then mark Route 3 complete

**Estimated Time:** 2-3 hours

**Status:** 🔴 **NOT STARTED**

**Must Do Before Deploy:**
- [ ] Create actual JavaScript test file
- [ ] Implement happy path test
- [ ] Implement version conflict retry test
- [ ] Implement transaction rollback test
- [ ] Implement concurrent publishing test
- [ ] Run full test suite
- [ ] Verify all tests pass (green)
- [ ] Update documentation with real test results

---

## 🟡 HIGH PRIORITY ISSUES (Should Fix Before Deploy)

### Issue 1: Image Handling Inconsistency

**Severity:** HIGH - Causes broken images after updates

**Problem:**
- CREATE uses `resizeAndProcessImages` → Saves as FileAsset (ObjectId) ✅
- UPDATE uses `resizeMenuPhoto` → Saves to local disk (string path) ❌
- Results in inconsistent image references
- Images break after menu item updates

**Affected Endpoints:**
```
POST  /api/v1/menus     → Works correctly (FileAsset)
PATCH /api/v1/menus/:id → Breaks images (local path)
```

**Fix:**
Update `src/modules/menu/router/menus.routes.js`:

```javascript
// BEFORE (WRONG):
router
  .route('/:id')
  .patch(
    menuController.uploadMenuPhoto,
    menuController.resizeMenuPhoto,     // ❌ Legacy handler
    menuController.updateMenu
  );

// AFTER (CORRECT):
router
  .route('/:id')
  .patch(
    menuController.uploadMenuPhoto,
    menuController.resizeAndProcessImages,  // ✅ Same as CREATE
    menuController.updateMenu
  );
```

Then delete legacy handler from controller.

**Status:** 🟡 **IDENTIFIED** - Fix available, not applied

---

### Issue 2: AuditLogger Bug (Affects All Modules)

**Severity:** HIGH - Breaks audit logging system-wide

**Problem:**
- Wrong require paths in `utils/auditLogger.js`
- Affects all modules using audit logging
- Not specific to menu system but discovered during menu work

**File:** `utils/auditLogger.js`

**Errors:**
```javascript
// Line 1:
const auditLogger = require('./logger');  // ❌ Should be: logger
// Line 2:
const auditLog = require('../utils/auditLog');  // ❌ Wrong path & name
```

**Fix:**
```javascript
const logger = require('./logger');  // ✅ Correct variable name
const { auditLog } = require('./auditLog');  // ✅ Correct path & destructure
```

**Recommendation:** Create separate hotfix PR (not menu-specific)

**Status:** 🟡 **IDENTIFIED** - Should be separate PR

---

## 🟢 MEDIUM PRIORITY ISSUES (Can Deploy, Fix Later)

### Issue 3: Display Views Don't Filter by publishStatus

**Severity:** MEDIUM - Customers see draft items (but can't order)

**Problem:**
- `getPublicMenu`, `getStaffMenu`, `getActiveMenu` filter by `available: true`
- Do NOT filter by `publishStatus: 'published'`
- Result: Customers see draft items in menu display
- However: Order validation prevents ordering draft items ✅

**Impact:**
- Confusing UX (show item but can't order)
- Inconsistent with order validation rules
- **NOT a security issue** (orders blocked correctly)

**Current Behavior:**
```javascript
// Display views:
.populate({
  path: 'items.menu',
  match: {
    available: true,
    inStock: true
    // ❌ Missing: publishStatus: 'published'
  }
})
```

**Recommended Fix:**
```javascript
.populate({
  path: 'items.menu',
  match: {
    available: true,
    inStock: true,
    publishStatus: 'published'  // ✅ Add this
  }
})
```

**Status:** 🟢 **DOCUMENTED** - Can be fixed post-deploy

---

### Issue 4: Variant Price Not Validated on Update

**Severity:** MEDIUM - Can create invalid variants

**Problem:**
- CREATE validates all variant prices ≥ 0 ✅
- UPDATE does NOT validate variant prices ❌
- Can create variants without prices via update

**Impact:**
- Order processing may fail for items with invalid variants
- Price calculation errors

**Fix:**
Add to `MenuService.updateMenu()`:

```javascript
if (req.body.variants && req.body.variants.length > 0) {
  req.body.variants = req.body.variants.map((v, index) => {
    if (v.price == null || v.price < 0) {
      throw new AppError(`Variant ${index + 1} must have a valid price`, 400);
    }
    return {
      ...v,
      price: Number(v.price)
    };
  });
}
```

**Status:** 🟢 **DOCUMENTED** - Can be fixed post-deploy

---

### Issue 5: Recipe Field Structure Mismatch

**Severity:** MEDIUM - Recipe data may be ignored

**Problem:**
- Schema expects `recipe.ingredients` (nested)
- Code writes to top-level `ingredients`
- Mongoose strict mode may ignore data

**Impact:**
- Recipes not saved correctly
- Cost calculation may fail
- Inventory deduction may fail

**Fix:**
In `MenuService.createNewMenu()`:

```javascript
// BEFORE:
const menuDataToCreate = {
  ingredients: parseJSON(menuData.ingredients, [])  // ❌ Top-level
};

// AFTER:
const menuDataToCreate = {
  recipe: {
    ingredients: parseJSON(menuData.ingredients, [])  // ✅ Nested
  }
};
```

**Status:** 🟢 **DOCUMENTED** - Investigate actual behavior first

---

## ✅ PRODUCTION READY COMPONENTS

### ✅ Core CRUD Operations
- Menu items: Create, Read, Update, Delete ✅
- Menu groups: Full CRUD with scheduling ✅
- Combos: Full CRUD with branch overrides ✅
- Toggle availability ✅
- Archive/restore ✅

### ✅ Query Features (Phase C)
- Search (case-insensitive, multi-field) ✅
- Filter (exact match + range operators) ✅
- Sort (ascending/descending, multi-field) ✅
- Field selection ✅
- Pagination ✅
- **All working correctly**

### ✅ Security & Multi-Tenancy
- JWT authentication required ✅
- RBAC capability checks ✅
- Merchant isolation (all queries) ✅
- Branch scoping (where applicable) ✅
- **All properly implemented**

### ✅ Publication System (Service Layer)
- Transaction-based publishing ✅
- Version management ✅
- Version conflict retry logic ✅
- Snapshot creation ✅
- Recipe validation ✅
- **Code looks correct** (needs tests)

### ✅ Documentation
- Frontend integration guide ✅
- API migration guide ✅
- Query reference ✅
- Workflow documentation ✅
- **Comprehensive and complete**

---

## 📊 Test Coverage Analysis

### Existing Tests (Good Coverage)

| Test File | Status | Coverage |
|-----------|--------|----------|
| `menu-localization.test.js` | ✅ PASS | Localization |
| `menu-endpoints-complete.test.js` | ✅ PASS | CRUD endpoints |
| `menu-staff-service.test.js` | ✅ PASS | Staff operations |
| `menu-public-service.test.js` | ✅ PASS | Public views |
| `menu-phase-a-b-integration.test.js` | ✅ PASS | Integration |
| `audit-plugin-menu.test.js` | ✅ PASS | Audit logging |

### Missing Tests (Critical Gaps)

| Feature | Status | Impact |
|---------|--------|--------|
| Menu Publishing | ❌ **NO TESTS** | CRITICAL |
| Transaction Rollback | ❌ **NO TESTS** | CRITICAL |
| Version Conflicts | ❌ **NO TESTS** | CRITICAL |
| Concurrent Publishing | ❌ **NO TESTS** | HIGH |
| Category CRUD | ⚠️ **UNKNOWN** | MEDIUM |

**Recommendation:** Do not deploy Route 3 (publishing) until tests exist

---

## 🚀 Deployment Checklist

### Pre-Deployment (Must Complete)

**Critical Fixes:**
- [ ] **BLOCKER 1:** Restart server, verify category API works
  - Test: `GET /api/v1/categories/active` returns 200
  - Test: Create category succeeds
  - Test: All CRUD operations work

- [ ] **BLOCKER 2:** Create Route 3 tests, verify they pass
  - Create `tests/menu-publish-transactional.test.js` (JavaScript)
  - Implement all test cases
  - Run tests, verify green
  - Update documentation with real results

**High Priority:**
- [ ] Fix image handling inconsistency (UPDATE endpoint)
- [ ] Create separate PR for AuditLogger fix
- [ ] Test image upload → update → verify image still displays

**Medium Priority (Optional):**
- [ ] Add `publishStatus` filter to display views
- [ ] Add variant price validation to UPDATE
- [ ] Investigate recipe field structure

### Production Environment Verification

**MongoDB Configuration:**
- [ ] Verify production MongoDB has replica set configured
  ```bash
  mongo production/admin --eval "db.adminCommand({ replSetGetStatus: 1 })"
  ```
- [ ] If NO replica set: **DO NOT DEPLOY** transaction-based publishing
- [ ] If replica set exists: Proceed with deployment

**Environment Variables:**
- [ ] JWT_SECRET configured
- [ ] Database connection string correct
- [ ] File storage configuration correct
- [ ] All required environment variables set

### Post-Deployment Smoke Tests

**Immediate Tests (After Deploy):**
1. **Categories:**
   ```bash
   curl GET /api/v1/categories/active
   # Expected: 200 OK with category list
   ```

2. **Menu Items:**
   ```bash
   curl GET /api/v1/menus?limit=5
   # Expected: 200 OK with menu items
   ```

3. **Create Menu Item:**
   ```bash
   curl POST /api/v1/menus -d '{ name: "Test Item", ... }'
   # Expected: 201 Created
   ```

4. **Upload Image:**
   ```bash
   curl POST /api/v1/menus -F image=@test.jpg -F name="Test"
   # Expected: 201 Created with image field populated
   ```

5. **Publish Menu Group:**
   ```bash
   curl POST /api/v1/menus/publish -d '{ menuGroupId: "...", branchId: "..." }'
   # Expected: 200 OK with publication
   ```

**Monitor for 24 Hours:**
- Watch for 500 errors in logs
- Check database for orphaned records
- Verify transactions complete successfully
- Monitor image storage

---

## 📋 Known Technical Debt

### Legacy Code to Clean Up

1. **Duplicate Category Controllers:**
   - `src/modules/menu/controller/category.controller.js` (legacy)
   - `src/modules/categories/controller/category.controller.js` (active)
   - **Recommendation:** Delete legacy file after verifying routes work

2. **Duplicate Category Services:**
   - `src/modules/menu/service/Category.service.js` (legacy)
   - `src/modules/categories/service/category.service.js` (active)
   - **Recommendation:** Delete legacy file, ensure no imports reference it

3. **Duplicate Routes Files:**
   - `src/modules/menu/router/categories.routes.js` (active - registered in index)
   - `src/modules/categories/categories.routes.js` (duplicate - not registered)
   - **Recommendation:** Consolidate to single route file

4. **Legacy Image Handler:**
   - `menuController.resizeMenuPhoto` (local disk, deprecated)
   - Still used by UPDATE endpoint
   - **Recommendation:** Delete after fixing UPDATE to use `resizeAndProcessImages`

### Documentation to Update

1. Update `ROUTE-3-TRANSACTION-BASED-COMPLETE.md`:
   - Change "14/14 tests passing" to actual results
   - Add note about tests being created later

2. Create `ROUTE-3-ACTUAL-TEST-RESULTS.md`:
   - Document real test implementation
   - Show actual test output
   - Confirm rollback tests use real MongoDB

3. Update `MENU-PRODUCTION-READY-SUMMARY.md`:
   - Mark as production-ready after fixes
   - Document known issues
   - Add deployment notes

---

## 🎯 Recommended Action Plan

### Immediate (Before Any Deploy)

**1. Fix Category API (30 minutes):**
```bash
# User must restart server
# Test all category endpoints
# Verify 200 responses
```

**2. Create Route 3 Tests (2-3 hours):**
```bash
# Rename markdown file
mv tests/menu-publish-transactional.test.js docs/ROUTE-3-TEST-DESIGN.md

# Create real test file
# Implement tests from design doc
# Run and verify all pass
```

### Short Term (This Week)

**3. Fix Image Handling (1 hour):**
- Update UPDATE endpoint to use correct handler
- Test image upload and update flow
- Delete legacy `resizeMenuPhoto` handler

**4. AuditLogger Hotfix (30 minutes):**
- Create separate PR for `utils/auditLogger.js`
- Fix require paths
- Deploy as hotfix

### Medium Term (Next Sprint)

**5. Add Display View Filters:**
- Add `publishStatus: 'published'` to populate match
- Test that draft items don't appear in customer views

**6. Add Update Validations:**
- Variant price validation
- Recipe field structure
- Consistent validation across CREATE and UPDATE

**7. Clean Up Legacy Code:**
- Delete duplicate controllers/services
- Consolidate route files
- Remove deprecated handlers

---

## 🏁 Final Verdict

### Current Status: 🔴 **NOT PRODUCTION READY**

**Can Deploy:** ❌ **NO**

**Blocking Issues:** **2 Critical**
1. Category API completely broken (500 errors)
2. Route 3 has zero test coverage (markdown file instead of tests)

**Timeline to Production Ready:**
- **Category fix:** 30 minutes (restart server + verify)
- **Route 3 tests:** 2-3 hours (create and run tests)
- **Total:** ~3-4 hours of work

### Recommendation

**DO NOT DEPLOY** until:
1. ✅ Category API working (all endpoints return 200)
2. ✅ Route 3 tests created and passing (green test suite)
3. ✅ Smoke tests pass in staging environment
4. ✅ Production MongoDB replica set verified

**Safe to Deploy After:**
- All critical blockers fixed
- Tests created and passing
- Staging environment validated
- Production database confirmed ready

---

## 📞 Support

**For Questions:**
- Review this document first
- Check individual issue documentation
- Refer to frontend integration guides

**Before Deploying:**
- Complete all items in "Deployment Checklist"
- Run full test suite: `npm test`
- Verify staging environment
- Get sign-off from team lead

---

**Status:** ⚠️ **ANALYSIS COMPLETE** - Action required before deployment

**Next Steps:** Fix 2 critical blockers, then re-evaluate

**Estimated Time to Production Ready:** 3-4 hours
