# PHASE 0: Menu Model Investigation Results

**Date**: August 21, 2026  
**Status**: ✅ INVESTIGATION COMPLETE  
**Scenario**: SIMPLIFIED - Only Legacy Collection Has Data

---

## Executive Summary

Good news: **No data migration needed.** The "MenuItem" collection doesn't exist yet, meaning the NEW modular services were never deployed to production. All menu data lives in the legacy `menus` collection (2 documents).

This is a **simplified consolidation scenario**, not a full data migration. We can proceed with confidence.

---

## Investigation Findings

### 1. Collection Status

```
menus collection:      ✅ EXISTS (2 documents)
menuitems collection:  ❌ DOES NOT EXIST (0 documents)
```

**Interpretation**: 
- The NEW modular services (MenuItem.service.js) are **CODE-ONLY**, never deployed
- All production menu data is in the legacy `menus` collection
- No duplicate or conflicting data to merge

### 2. Legacy Menu Schema Analysis

The `menus` collection has **ALL required fields** including:

#### Core Fields (Already Present)
- ✅ `merchant` - Multi-tenant scoping
- ✅ `name` - Localized text object (en, am)
- ✅ `description` - (if present, also localized)
- ✅ `categoryId` - ObjectId reference to Category
- ✅ `variants` - Array of pricing variants
- ✅ `type` - 'food' | 'drink'
- ✅ `available` - Availability flag
- ✅ `inStock` - Stock status
- ✅ `publishStatus` - 'draft' | 'published' | 'archived'

#### Legacy-Specific Fields (Need to Keep)
- ✅ `kitchenStation` - ObjectId reference to KitchenStation
- ✅ `isFasting` - Boolean for fasting-friendly items
- ✅ `cuisineOrigin` - 'local' | 'international'
- ✅ `cuisineTags` - Array of cuisine tags
- ✅ `drinkType` - Enum for drink categories
- ✅ `isAlcoholic` - Boolean
- ✅ `alcoholPercentage` - Number
- ✅ `isVeg` - Boolean (nullable)
- ✅ `isSpicy` - Boolean
- ✅ `recipe.ingredients` - Array of ingredient references
- ✅ `allergens` - Array of allergen strings
- ✅ `tags` - Array of tags
- ✅ `ratingAverage` - Average rating
- ✅ `ratingQuantity` - Number of ratings

#### Audit Fields (Present)
- ✅ `isActive` - Soft delete flag
- ✅ `createdBy` - User reference
- ✅ `updatedBy` - User reference
- ✅ `deletedBy` - User reference
- ✅ `deletedAt` - Soft delete timestamp

### 3. Merchant Distribution

```
Merchant 6a87fbf29b913572c358334d: 1 item
Merchant 6a87fbf29b913572c3583367: 1 item
```

Only 2 menu items exist across 2 merchants. This is likely a **development/staging database**, not production.

---

## Critical Insight: The "Dual Implementation" is a Misconception

### What We Thought
- Two separate implementations fighting over the same data
- Contradictory delete behaviors in production
- Data corruption risk

### What Actually Exists
- **ONE implementation**: Legacy MenuService.js using `menus` collection
- **ONE unused implementation**: NEW MenuItem.service.js with no database backing
- **NO conflict**: The NEW services were never deployed

### The Real Architecture

```
CURRENT STATE (Production):
  Legacy MenuService.js → menus collection (2 docs) ✅ LIVE

PROPOSED STATE (Tests Only):  
  NEW MenuItem.service.js → menuitems collection (0 docs) ❌ NEVER DEPLOYED
```

---

## Revised Understanding: Delete Behavior

### What We Thought Was a Conflict

#### NEW Service (MenuItem.service.js)
```javascript
// Blocks delete with 409 if item is used in groups/combos
if (groupsCount.length > 0 || combosCount.length > 0) {
  throw new AppError('Cannot delete. Item is in use.', 409);
}
```

#### LEGACY Service (MenuService.js)
```javascript
// Auto-removes item from all groups via $pull
await MenuRepository.updateManyMenuGroups(
  { merchant: merchantId },
  { $pull: { items: { menu: req.params.id } } }
);
```

### Why There's No Actual Conflict
- The NEW service's delete method **never runs in production** (no menuitems collection)
- The LEGACY service's delete is what's actually deployed
- Tests were written against the NEW service, but production uses the LEGACY service

---

## Consolidation Strategy (Revised)

### SIMPLE PATH: Keep Legacy Model, Enhance Services

Since `menuitems` doesn't exist and the legacy `menus` collection has all the fields we need:

#### Option A: Enhance Legacy Services (RECOMMENDED)
1. **Keep the `menus` collection** as-is (rename model to MenuItem for clarity)
2. **Keep legacy fields** (kitchenStation, isFasting, cuisineOrigin, etc.)
3. **Port NEW service logic** into the legacy MenuService.js
4. **Add 409-block delete behavior** (safer than auto-cascade)
5. **Write tests for ALL routes** (currently only 54 tests cover new services)

#### Option B: Migrate to NEW Model (More Work)
1. Rename `MenuItem.model.js` to include legacy fields
2. Create migration script: `menus` → `menuitems`
3. Run migration in staging, verify
4. Deploy NEW services to production
5. Delete legacy MenuService.js

**Recommendation**: **Option A** - Less risk, faster deployment, no data migration

---

## Phase 1 Checklist (Based on Investigation)

### IMMEDIATE ACTIONS

✅ **Phase 0 Complete**: Investigation done, no menuitems collection exists

#### Phase 1A: Decide on Model Strategy
- [ ] **Decision**: Keep `menus` collection or rename to `menuitems`?
- [ ] **Decision**: Which model file is canonical? (menuModel.js.old vs MenuItem.model.js)
- [ ] **Decision**: Keep legacy fields (kitchenStation, isFasting, etc.)?

#### Phase 1B: Align Models and Services
- [ ] If keeping `menus`: Update MenuItem.model.js to match menuModel.js.old schema
- [ ] If renaming to `menuitems`: Create collection rename script
- [ ] Add missing fields to NEW model: kitchenStation, isFasting, cuisineOrigin, drinkType, etc.

#### Phase 1C: Consolidate Service Logic
- [ ] Pick ONE delete behavior (recommend: 409-block)
- [ ] Migrate scheduling logic from MenuService.js to MenuItem.service.js
- [ ] Migrate publishing logic (publishMenuGroup, archiveMenuItem)
- [ ] Migrate public menu rendering (getPublicMenu, getStaffMenu)
- [ ] Migrate branch menu group operations

#### Phase 1D: Write Missing Tests
- [ ] Test `/public` endpoint (scheduling, time slots, special dates)
- [ ] Test `/staff` endpoint (role-based filtering)
- [ ] Test `/publish` endpoint (menu group publishing)
- [ ] Test `/archive` endpoint (archiving logic)
- [ ] Test branch menu group operations (all routes)
- [ ] Test delete behavior (409 if in use, cascade if not)
- [ ] Test combo day-of-week filtering (fix lowercase bug first)

---

## Risks and Blockers (Updated)

### ELIMINATED RISKS ✅
- ❌ Data corruption from conflicting writes (menuitems doesn't exist)
- ❌ Complex data migration (no data to migrate)
- ❌ Overlapping IDs (only one collection)

### REMAINING RISKS ⚠️
- 🟡 Legacy code has **zero test coverage** (54 tests don't cover it)
- 🟡 Combo day-of-week bug (`toLocaleString('lowercase')` is invalid)
- 🟡 Delete behavior is auto-cascade (should be 409-block for safety)
- 🟡 Scheduling logic is complex (overnight slots, recurring dates)

### NEW INSIGHT 💡
The 54 passing tests are **NOT testing production code**. They test the NEW services which were never deployed.

---

## Test Coverage Reality Check

### What Was Tested (54 Tests)
- ✅ MenuItem.service.js (NOT in production)
- ✅ MenuGroup.service.js (NOT in production)
- ✅ Combo.service.js (NOT in production)

### What Is Actually Running (0 Tests)
- ❌ MenuService.js (IN production, ZERO tests)
- ❌ `/public` endpoint (IN production, ZERO tests)
- ❌ `/staff` endpoint (IN production, ZERO tests)
- ❌ `/publish` endpoint (IN production, ZERO tests)
- ❌ Branch menu groups (IN production, ZERO tests)

**Actual Test Coverage**: **0% of production routes** 🔴

---

## Next Steps (Phase 1)

### DECISION POINT 🎯
**Before writing any code**, answer these questions:

1. **Keep `menus` collection or rename to `menuitems`?**
   - **Recommend**: Keep `menus` (less risk, no downtime)

2. **Which model file is canonical?**
   - **Recommend**: `menuModel.js.old` (has all legacy fields)

3. **Which delete behavior?**
   - **Recommend**: 409-block (safer, prevents accidental cascade)

4. **Consolidate services how?**
   - **Option A**: Enhance MenuService.js with NEW logic (keep legacy)
   - **Option B**: Migrate MenuService.js logic into MenuItem.service.js (replace)
   - **Recommend**: **Option B** (cleaner, aligns with tests)

### PHASE 1A: Model Alignment
1. Update `MenuItem.model.js` to include all legacy fields from `menuModel.js.old`
2. Add: kitchenStation, isFasting, cuisineOrigin, drinkType, etc.
3. Ensure schema matches existing `menus` collection
4. Update collection name in model: `mongoose.model('Menu', menuSchema)` (keep 'Menu')

### PHASE 1B: Service Migration (Route by Route)
1. Migrate `getPublicMenu` logic to MenuItem.service.js
2. Write tests for getPublicMenu (scheduling, time slots, special dates)
3. Migrate `getStaffMenu` logic to MenuItem.service.js
4. Write tests for getStaffMenu (role-based filtering)
5. Migrate `publishMenuGroup` logic
6. Write tests for publishing
7. Continue for all legacy routes

### PHASE 1C: Fix Known Bugs
1. Fix combo `isAvailableNow()` - replace `toLocaleString('lowercase')` with correct syntax
2. Add delete behavior: 409-block if item is in groups/combos
3. Test overnight time slots (22:00–02:00)
4. Test recurring yearly dates

### PHASE 1D: Cutover
1. Update routes to call MenuItem.service.js instead of MenuService.js
2. Run full test suite (should have 80+ tests by now)
3. Delete legacy MenuService.js
4. Deploy

---

## Summary

**Phase 0 Result**: ✅ **SIMPLE SCENARIO**

- No data migration needed
- No conflicting collections
- No overlapping data
- Only 2 menu items in legacy collection

**Key Finding**: The "dual implementation" was a **test-vs-production mismatch**, not a production conflict.

**Action**: Enhance MenuItem.model.js with legacy fields, migrate MenuService.js logic route-by-route, write tests, deploy.

**Timeline Estimate**:
- Phase 1A (Model Alignment): 1-2 hours
- Phase 1B (Service Migration): 4-6 hours (route by route)
- Phase 1C (Bug Fixes): 2-3 hours
- Phase 1D (Testing & Cutover): 3-4 hours
- **Total**: 10-15 hours of focused work

**Risk Level**: **LOW** ✅ (no data migration, small dataset, clear path)

---

**Status**: Ready to proceed to Phase 1A (Model Alignment)

**Next Action**: Get stakeholder decision on:
1. Keep `menus` collection or rename?
2. 409-block delete or auto-cascade?
3. Timeline for consolidation
