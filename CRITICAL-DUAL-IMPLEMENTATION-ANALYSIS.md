# CRITICAL: Dual Service Implementation Found

## Executive Summary

**SEVERITY**: 🔴 **CRITICAL**  
**STATUS**: Architecture Conflict Detected  
**IMPACT**: Contradictory business logic on same endpoints

---

## The Problem

Two separate service implementations exist for menu management with **contradictory business rules**:

### 1. New Modular Services (src/modules/menu/service/)
- `MenuItem.service.js` - Clean architecture, new implementation
- `MenuGroup.service.js` - Repository pattern
- `Combo.service.js` - Modular design

### 2. Legacy Service (src/modules/menu/service/MenuService.js)
- `MenuService.js` - Monolithic, scheduling/publishing focused
- Different data model (Menu vs MenuItem collections)
- Different validation rules

---

## Current Route Mapping

### Routes Using **NEW Services** (MenuItem.service.js)
```javascript
// src/modules/menu/router/menus.routes.js
POST   /api/v1/menu              → menuController.createNewMenu → MenuItemService.create()
GET    /api/v1/menu              → menuController.getAllMenu → MenuItemService.getAll()
GET    /api/v1/menu/:id          → menuController.getMenu → MenuItemService.getById()
PATCH  /api/v1/menu/:id          → menuController.updateMenu → MenuItemService.update()
DELETE /api/v1/menu/:id          → menuController.deleteMenu → MenuItemService.softDelete()
PATCH  /api/v1/menu/:id/toggle   → menuController.toggleMenuItemAvailability → MenuItemService.toggleAvailability()
```

### Routes Using **LEGACY Service** (MenuService.js)
```javascript
// src/modules/menu/router/menus.routes.js
GET    /api/v1/menu/public       → menuController.getPublicMenu → MenuService.getPublicMenu()
GET    /api/v1/menu/staff        → menuController.getStaffMenu → MenuService.getStaffMenu()
POST   /api/v1/menu/publish      → menuController.publishMenuGroup → MenuService.publishMenuGroup()
PATCH  /api/v1/menu/:id/archive  → menuController.archiveMenuItem → MenuService.archiveMenuItem()
GET    /api/v1/menu/publications/branch/:id → MenuService.getLatestPublicationForBranch()

// Menu Groups
GET    /api/v1/menu-group/light  → MenuService.getAllMenuGroupsLight()

// Combos
PATCH  /api/v1/combo/:id/branch-override → MenuService.updateBranchOverride()
POST   /api/v1/combo/increment   → MenuService.incrementComboSold()
PATCH  /api/v1/combo/:id/toggle-branch → MenuService.toggleBranchActive()

// Branch Menu Groups (ALL routes)
ALL    /api/v1/branch-menu-groups/* → MenuService.* (createBranchMenuGroup, etc.)
```

---

## Contradictory Business Rules

### Delete Behavior

#### NEW Service (MenuItem.service.js) - Line 239
```javascript
static async softDelete(id, merchantId, userId) {
  // Check if item is used in menu groups or combos
  const groupsCount = await MenuGroupRepository.findGroupsContainingItem(id, merchantId);
  const combosCount = await ComboRepository.findCombosContainingItem(id, merchantId);

  if (groupsCount.length > 0 || combosCount.length > 0) {
    throw new AppError(
      `Cannot delete menu item. It is used in ${groupsCount.length} menu group(s) and ${combosCount.length} combo(s). Please remove it from those first.`,
      409
    );
  }

  return MenuItemRepository.softDelete(id, merchantId, userId);
}
```
**Rule**: **BLOCKS** deletion if item is referenced (409 Conflict)

#### LEGACY Service (MenuService.js) - Line ~800
```javascript
// Menu model has pre('findOneAndUpdate') hook that auto-removes deleted items from groups
menuSchema.pre('findOneAndUpdate', async function(next) {
  if (this._update.deletedAt) {
    // Auto-remove from all menu groups using $pull
    await mongoose.model('MenuGroup').updateMany(
      { 'items.menu': this._conditions._id },
      { $pull: { items: { menu: this._conditions._id } } }
    );
  }
  next();
});
```
**Rule**: **ALLOWS** deletion and auto-removes item from all groups

### Data Model Differences

#### NEW Services
- Collection: `menuitems` (MenuItem model)
- Fields: `variants` array, `categoryId` ObjectId
- Structure: Clean separation of concerns

#### LEGACY Service  
- Collection: `menus` (Menu model - possibly different)
- Fields: `category` string + `categoryId`, different schema
- Structure: Monolithic with scheduling logic

---

## Which Implementation is "Live"?

### Test Suite Status
The 54 passing tests **ONLY tested NEW services**:
- ✅ MenuItem.service.js
- ✅ MenuGroup.service.js
- ✅ Combo.service.js

The tests **DID NOT test LEGACY MenuService** routes:
- ❌ `/public` endpoints
- ❌ `/staff` endpoints
- ❌ `/publish` endpoints
- ❌ `/branch-menu-groups` endpoints

### Current Production Routes
**BOTH implementations are live** on different routes:
- CRUD operations (POST/GET/PATCH/DELETE /menu) → NEW services ✅ Tested
- Public/scheduling/publishing → LEGACY service ❌ Untested

---

## Critical Risks

### 1. Delete Behavior Inconsistency 🔴
**Scenario**: 
1. User creates MenuItem via POST /api/v1/menu (NEW service)
2. Item gets added to a MenuGroup
3. User tries DELETE /api/v1/menu/:id (NEW service)
4. **Gets 409** - "Cannot delete, item is in use"
5. Admin uses archive endpoint PATCH /api/v1/menu/:id/archive (LEGACY service)
6. **Item gets deleted** and auto-removed from all groups

**Result**: Same item, different delete behavior depending on endpoint used.

### 2. Data Model Confusion 🟡
- NEW services expect `MenuItem` model with `variants`
- LEGACY service may use `Menu` model with different schema
- Risk of data corruption if both write to same collection with different schemas

### 3. Untested Legacy Code 🟠
- All "production ready" tests validated NEW services only
- LEGACY scheduling/publishing logic has **ZERO test coverage**
- Day-of-week combo logic may be broken (toLocaleString bug)

### 4. Business Logic Drift 🟡
- Two teams could modify either service independently
- No single source of truth for menu business rules
- Future bugs will be hard to trace

---

## Impact Assessment

### HIGH RISK Areas
1. **Delete operations** - Contradictory 409 vs auto-cascade
2. **Public menu rendering** - Uses untested LEGACY service
3. **Scheduling logic** - No tests, possible bugs
4. **Branch menu groups** - Entirely on LEGACY service

### MEDIUM RISK Areas
1. **Combo availability by day** - Likely broken (lowercase bug)
2. **Menu publishing** - Complex logic, no tests
3. **Cross-service data consistency**

### Tested & Safe
1. ✅ Basic CRUD (NEW services)
2. ✅ Multi-tenant isolation (NEW services)
3. ✅ Auth/authz (tested on NEW routes)

---

## Recommended Actions

### IMMEDIATE (Critical)

1. **Identify Primary Implementation**
   - Decide: Keep NEW services or LEGACY service
   - Document which is authoritative

2. **Audit Route Mapping**
   - List every route and which service it uses
   - Identify overlaps and conflicts

3. **Fix Delete Inconsistency**
   - Choose one behavior (block or cascade)
   - Implement consistently across both services
   - Add tests for both paths

### SHORT TERM (High Priority)

4. **Test Legacy Routes**
   - Add tests for `/public`, `/staff`, `/publish`
   - Test scheduling logic (overnight slots, recurring dates)
   - Test combo day-of-week filtering
   - Test branch menu group operations

5. **Fix Known Bugs**
   - Combo `isAvailableNow()` lowercase weekday bug
   - Any other issues found in legacy code

6. **Document Architecture**
   - Why two services exist
   - Migration plan if applicable
   - Clear ownership boundaries

### MEDIUM TERM (Refactoring)

7. **Consolidate Services**
   - Option A: Migrate legacy routes to NEW services
   - Option B: Deprecate NEW services, enhance legacy
   - Option C: Clear separation (CRUD vs scheduling)

8. **Data Model Alignment**
   - Ensure both use same Mongoose model
   - Standardize field names and structure
   - Migration script if needed

9. **Comprehensive Testing**
   - Test all routes (currently only 20/~40 tested)
   - Test scheduling edge cases
   - Test all delete scenarios

---

## Questions for Product/Architecture Team

1. **Which service is the "source of truth"?**
   - NEW modular services (MenuItem.service.js)?
   - LEGACY monolithic service (MenuService.js)?

2. **Is there a migration plan?**
   - Are we phasing out the legacy service?
   - Are we backfilling features into new services?

3. **What should delete behavior be?**
   - Block with 409 if item is used?
   - Auto-cascade remove from groups?
   - Require explicit confirmation?

4. **Are Menu and MenuItem different collections?**
   - If yes, how do they relate?
   - If no, why two models?

5. **Who uses the scheduling features?**
   - Are they critical for production?
   - Can they be migrated to new architecture?

---

## Test Coverage Gap

### Currently Tested (54 tests)
- ✅ MenuItem CRUD
- ✅ MenuGroup CRUD  
- ✅ Combo CRUD
- ✅ Multi-tenant isolation
- ✅ Auth/authz
- ✅ Input validation

### NOT Tested (Est. 30+ missing tests)
- ❌ Public menu rendering (`/public`)
- ❌ Staff menu filtering (`/staff`)
- ❌ Menu publishing lifecycle (`/publish`)
- ❌ Archive functionality (`/archive`)
- ❌ Branch menu groups (all operations)
- ❌ Scheduling logic (time slots, dates)
- ❌ Combo day-of-week filtering
- ❌ Branch overrides
- ❌ Delete cascade vs block behavior
- ❌ Cross-service consistency

**Actual Test Coverage**: ~50% of routes (not 100% as claimed)

---

## Conclusion

The menu management system has **two parallel implementations** with contradictory business rules. While the NEW modular services are well-tested and production-ready for basic CRUD, the LEGACY service handles critical features (public menu, scheduling, publishing) that are **completely untested**.

This is **not a blocking issue** for basic menu CRUD deployment, but it is a **critical architectural concern** that must be addressed before claiming "fully production ready."

### Deployment Recommendation
- ✅ **SAFE**: Basic CRUD operations (POST/GET/PATCH/DELETE /menu)
- ⚠️ **RISKY**: Public menu browsing, scheduling, publishing
- 🔴 **UNSAFE**: Delete operations (inconsistent behavior)

### Next Steps
1. Product/architecture decision on which service to keep
2. Fix delete behavior inconsistency
3. Add tests for legacy routes
4. Create migration plan or clear boundaries
5. Document architecture decisions

---

## ✅ PHASE 0 UPDATE (August 21, 2026)

**Investigation Complete**: The "dual implementation" is actually a **test-vs-production mismatch**.

### Key Findings
- `menus` collection: ✅ EXISTS (2 documents) - **PRODUCTION**
- `menuitems` collection: ❌ DOES NOT EXIST - **NEVER DEPLOYED**

### Revised Understanding
1. The NEW modular services (MenuItem.service.js) were **NEVER deployed to production**
2. All 54 passing tests validate **code that isn't running in production**
3. The LEGACY MenuService.js is the **ONLY implementation** currently live
4. There is **NO actual conflict** - just test code vs production code mismatch

### Simplified Path Forward
- **No data migration needed** (menuitems doesn't exist)
- **No conflicting data** (only one collection)
- **Simple consolidation**: Enhance MenuItem.model.js with legacy fields, migrate logic route-by-route

See `PHASE-0-INVESTIGATION-RESULTS.md` for complete findings and Phase 1 plan.

---

**Status**: Phase 0 complete. Architecture is simpler than expected. Ready for Phase 1 (Model Alignment).

**Date**: 2026-08-21  
**Severity**: MEDIUM (downgraded from CRITICAL)  
**Priority**: MEDIUM
