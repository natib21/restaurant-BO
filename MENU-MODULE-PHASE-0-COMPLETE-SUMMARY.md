# Menu Module: Phase 0 Investigation Complete

**Date**: August 21, 2026  
**Status**: ✅ PHASE 0 COMPLETE - Ready for Phase 1  
**Finding**: Simplified scenario - No data migration needed

---

## What We Did

### Task 1: Menu Security Testing ✅ COMPLETE
- Created comprehensive security test suite with 54 tests
- Verified multi-tenant isolation, authentication, authorization
- Fixed token expiration issue (90s → 8s execution)
- All tests passing (100%)
- **Limitation Found**: Tests only cover NEW services (MenuItem.service.js), not production legacy code

### Task 2: Dual Implementation Investigation ✅ COMPLETE  
- Identified two separate service implementations
- Ran Phase 0 investigation script to gather database facts
- **Critical Discovery**: "Dual implementation" is test code vs production code mismatch

---

## Phase 0 Investigation Results

### The Question We Asked
**Are Menu and MenuItem separate MongoDB collections with conflicting data?**

### The Answer
```
menus collection:      ✅ EXISTS (2 documents) - PRODUCTION LIVE
menuitems collection:  ❌ DOES NOT EXIST - NEVER DEPLOYED
```

### What This Means

#### Good News 🎉
1. **No data migration needed** - menuitems collection was never created
2. **No conflicting data** - only one source of truth (menus)
3. **Simple consolidation path** - enhance model, migrate logic, write tests
4. **Small dataset** - only 2 menu items across 2 merchants (likely dev/staging)

#### Reality Check 🔍
1. The 54 "production ready" tests validate **code that never ran in production**
2. The LEGACY MenuService.js (actually in production) has **ZERO test coverage**
3. All scheduling, publishing, and public menu features are **untested**
4. Delete behavior in production is auto-cascade (should be 409-block)

---

## Architecture Reality

### What We Thought
```
PRODUCTION CONFLICT:
  NEW MenuItem.service.js ⚔️ LEGACY MenuService.js
  Both writing to same collection with different rules
  Delete behavior: 409-block vs auto-cascade
  Risk: Data corruption
```

### What Actually Exists
```
PRODUCTION:
  ONLY MenuService.js → menus collection (2 docs)
  
TEST CODE (Never Deployed):
  MenuItem.service.js → menuitems collection (doesn't exist)
  54 passing tests → validate non-production code
```

---

## Test Coverage Gap

### What Was Tested (54 Tests)
```javascript
// These services were NEVER deployed
✅ MenuItem.service.js - 20 tests
✅ MenuGroup.service.js - 18 tests  
✅ Combo.service.js - 16 tests
✅ Multi-tenant isolation - PROVEN
✅ Auth/authz - PROVEN
✅ Input validation - PROVEN
```

### What Is Running in Production (0 Tests)
```javascript
// These routes are LIVE but UNTESTED
❌ MenuService.getPublicMenu() - 0 tests
❌ MenuService.getStaffMenu() - 0 tests
❌ MenuService.publishMenuGroup() - 0 tests
❌ MenuService.archiveMenuItem() - 0 tests
❌ Branch menu group operations - 0 tests
❌ Scheduling logic (time slots, dates) - 0 tests
❌ Combo day-of-week filtering - 0 tests (likely broken)
```

**Actual Production Test Coverage**: **0%** 🔴

---

## Model Comparison

### Legacy Model (menuModel.js.old) - IN PRODUCTION ✅
```javascript
Collection: 'menus'
Fields:
  - merchant (ObjectId)
  - name (localized object: en, am)
  - description (localized object)
  - categoryId (ObjectId ref Category)
  - variants (array of pricing variants)
  - type ('food' | 'drink')
  - available, inStock, publishStatus
  
  // Legacy-specific fields:
  - kitchenStation (ObjectId ref KitchenStation)
  - isFasting (boolean)
  - cuisineOrigin ('local' | 'international')
  - cuisineTags (array)
  - drinkType (enum)
  - isAlcoholic, alcoholPercentage
  - isVeg, isSpicy
  - recipe.ingredients (array)
  - allergens, tags
  - ratingAverage, ratingQuantity
```

### NEW Model (MenuItem.model.js) - NOT DEPLOYED ❌
```javascript
Collection: 'menuitems' (doesn't exist)
Fields:
  - merchant (ObjectId)
  - name (localized object: en, am)
  - description (localized object)
  - categoryId (ObjectId ref Category)
  - variants (array of pricing variants)
  - type ('food' | 'drink')
  - available, inStock, publishStatus
  
  // MISSING legacy fields:
  - ❌ kitchenStation
  - ❌ isFasting
  - ❌ cuisineOrigin, cuisineTags
  - ❌ drinkType
  - ❌ isAlcoholic, alcoholPercentage
  - ❌ recipe.ingredients
  - ❌ ratingAverage, ratingQuantity
```

**Gap**: NEW model is missing ~12 fields that exist in production

---

## Known Issues to Fix

### 1. Combo Day-of-Week Bug 🔴
```javascript
// BROKEN CODE (MenuService.js line ~850)
const currentDay = now.toLocaleString('en-us', { weekday: 'lowercase' });
// ❌ 'lowercase' is NOT a valid weekday option
// ✅ Should be: { weekday: 'long' } then .toLowerCase()
```
**Impact**: Day-based combo availability may be completely broken

### 2. Delete Behavior Inconsistency 🟡
```javascript
// PRODUCTION (MenuService.js)
// Auto-removes item from all groups (risky)
await MenuRepository.updateManyMenuGroups(
  { merchant: merchantId },
  { $pull: { items: { menu: req.params.id } } }
);

// TEST CODE (MenuItem.service.js)  
// Blocks delete with 409 if item is used (safer)
if (groupsCount.length > 0 || combosCount.length > 0) {
  throw new AppError('Cannot delete. Item is in use.', 409);
}
```
**Recommendation**: Switch to 409-block behavior (safer)

### 3. Untested Scheduling Logic 🟠
- Overnight time slots (22:00–02:00 wraparound)
- Recurring yearly dates (match by month-day)
- activeDays + blockedDays combined logic
- specialDates filtering

**Impact**: Complex logic with zero test coverage

---

## Phase 1 Strategy (Recommended)

### HIGH-LEVEL APPROACH
**Keep Legacy Collection, Enhance Services**

1. **Model Alignment** (Phase 1A)
   - Add missing legacy fields to MenuItem.model.js
   - Keep collection name as 'Menu' (points to `menus` collection)
   - No database changes needed

2. **Service Migration** (Phase 1B)
   - Migrate MenuService.js logic into MenuItem.service.js route by route
   - Start with getPublicMenu, then getStaffMenu, then publish, etc.
   - Write tests for EACH route before cutover
   - Update route handlers one at a time

3. **Bug Fixes** (Phase 1C)
   - Fix combo day-of-week bug (toLocaleString)
   - Implement 409-block delete behavior
   - Add validation for overnight time slots
   - Test recurring dates logic

4. **Comprehensive Testing** (Phase 1D)
   - Add ~30 tests for legacy routes
   - Test scheduling edge cases
   - Test all delete scenarios
   - Verify production parity

5. **Cutover** (Phase 1E)
   - Update routes to use MenuItem.service.js
   - Run full test suite (80+ tests)
   - Delete legacy MenuService.js
   - Deploy with confidence

---

## Decisions Needed Before Phase 1

### DECISION 1: Collection Name
**Options**:
- A) Keep `menus` collection (no changes, less risk)
- B) Rename `menus` → `menuitems` (requires downtime)

**Recommendation**: **Option A** (keep `menus`)

### DECISION 2: Delete Behavior
**Options**:
- A) Keep auto-cascade delete (current production)
- B) Switch to 409-block delete (safer, aligns with tests)

**Recommendation**: **Option B** (409-block is safer)

### DECISION 3: Service Consolidation
**Options**:
- A) Enhance MenuService.js with NEW logic (keep legacy)
- B) Migrate MenuService.js into MenuItem.service.js (replace)

**Recommendation**: **Option B** (cleaner, aligns with tests)

### DECISION 4: Timeline
**Options**:
- A) Full consolidation before next deployment (10-15 hours)
- B) Incremental route-by-route over multiple sprints
- C) Deploy current tests as-is, defer consolidation

**Recommendation**: **Option A or B** (don't defer, address now)

---

## Risk Assessment (Updated)

### ELIMINATED RISKS ✅
- ❌ Data migration complexity (no migration needed)
- ❌ Conflicting writes (only one collection)
- ❌ Duplicate data (no overlap)

### REMAINING RISKS ⚠️
- 🟡 Zero test coverage on production code
- 🟡 Combo day-of-week bug likely broken
- 🟡 Delete auto-cascade could cause data loss
- 🟡 Complex scheduling logic untested

### RISK LEVEL: MEDIUM ⚠️
**Why Medium**: Production code works (has been running), but lacks tests. Small dataset means low blast radius if issues occur.

---

## Timeline Estimate

### Phase 1A: Model Alignment
- Add legacy fields to MenuItem.model.js
- Verify schema matches production
- **Time**: 1-2 hours

### Phase 1B: Service Migration  
- Migrate getPublicMenu + tests (2 hours)
- Migrate getStaffMenu + tests (1.5 hours)
- Migrate publishing logic + tests (2 hours)
- Migrate branch operations + tests (2 hours)
- **Time**: 7-8 hours

### Phase 1C: Bug Fixes
- Fix combo day-of-week bug (0.5 hours)
- Implement 409-block delete (1 hour)
- Test edge cases (1 hour)
- **Time**: 2-3 hours

### Phase 1D: Testing & Cutover
- Write comprehensive test suite (2 hours)
- Integration testing (1 hour)
- Route cutover (0.5 hours)
- **Time**: 3-4 hours

### Phase 1E: Deployment
- Code review (1 hour)
- Staging deployment + verification (1 hour)
- Production deployment (0.5 hours)
- **Time**: 2-3 hours

**TOTAL ESTIMATE**: 15-20 hours of focused work

---

## Success Criteria

### Phase 1 Complete When:
- ✅ MenuItem.model.js has all legacy fields
- ✅ All MenuService.js routes migrated to MenuItem.service.js
- ✅ 80+ tests passing (54 existing + 30 new legacy route tests)
- ✅ Combo day-of-week bug fixed
- ✅ 409-block delete implemented and tested
- ✅ Legacy MenuService.js deleted
- ✅ All routes pointing to MenuItem.service.js
- ✅ Production deployment verified

---

## Files to Track

### Investigation Files
- ✅ `scripts/investigate-menu-models.js` - Phase 0 script (executed)
- ✅ `PHASE-0-INVESTIGATION-RESULTS.md` - Complete findings
- ✅ `CRITICAL-DUAL-IMPLEMENTATION-ANALYSIS.md` - Updated with Phase 0 results

### Models
- `models/menuModel.js.old` - Legacy model (IN PRODUCTION)
- `src/modules/menu/model/MenuItem.model.js` - NEW model (NOT DEPLOYED)

### Services  
- `src/modules/menu/service/MenuService.js` - Legacy service (IN PRODUCTION)
- `src/modules/menu/service/MenuItem.service.js` - NEW service (NOT DEPLOYED)

### Tests
- `tests/menu-endpoints-complete.test.js` - 54 tests (NEW services only)
- `tests/menu-legacy-routes.test.js` - TO CREATE in Phase 1D

---

## Next Steps

### IMMEDIATE (Phase 1A - Model Alignment)
1. Read MenuItem.model.js and menuModel.js.old side by side
2. Add missing fields to MenuItem.model.js:
   - kitchenStation
   - isFasting
   - cuisineOrigin, cuisineTags
   - drinkType
   - isAlcoholic, alcoholPercentage
   - recipe.ingredients (already has variants)
   - ratingAverage, ratingQuantity
3. Keep collection name as 'Menu' (no database changes)
4. Verify schema matches production

### THEN (Phase 1B - Start Migration)
1. Pick first route: `getPublicMenu`
2. Copy logic from MenuService.js to MenuItem.service.js
3. Write tests for getPublicMenu (scheduling, time slots)
4. Verify tests pass
5. Update route to call MenuItem.service.getPublicMenu
6. Deploy to staging, verify
7. Repeat for next route

---

## Summary

**Phase 0 Complete**: ✅  
**Key Finding**: No data migration needed - simplified consolidation path  
**Test Coverage Reality**: 0% of production code is tested  
**Risk Level**: MEDIUM (production works, but untested)  
**Timeline**: 15-20 hours for full consolidation  
**Recommendation**: Proceed with Phase 1A (Model Alignment)

**Status**: Ready for stakeholder decisions and Phase 1 execution

---

**Prepared by**: Kiro AI  
**Date**: August 21, 2026  
**Next Action**: Get decisions on collection name, delete behavior, and timeline
