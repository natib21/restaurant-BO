# Menu Module Phase A: Bug Fixes - COMPLETE

**Date:** 2026-08-19  
**Phase:** A (Bug Fixes - Correctness, Security, Data Integrity)  
**Status:** ✅ ALL 10 FIXES IMPLEMENTED

---

## Summary

All 10 Phase A bug fixes have been successfully implemented. These fixes address critical security issues, data integrity problems, and correctness bugs in the Menu module.

---

## Fixes Applied

### ✅ Fix 1: Empty Combo Filter (CRITICAL - Multi-tenant Data Leak)
**File:** `src/modules/menu/service/MenuService.js:470`  
**Issue:** Combo query in `getActiveMenu()` had empty filter, returning combos from all merchants  
**Fix:** Added `merchant: merchantId` to combo filter  
**Impact:** Prevents cross-tenant data leakage

```javascript
// BEFORE
const combos = await MenuRepository.findCombos({
  /* same logic as before */
})

// AFTER
const combos = await MenuRepository.findCombos({
  merchant: merchantId,
})
```

---

### ✅ Fix 2: Duplicate $or Key (CRITICAL - Silent Filter Failure)
**File:** `src/modules/menu/service/MenuService.js:434`  
**Issue:** Duplicate `$or` key in `getActiveMenu()` query - second key silently overwrites first  
**Fix:** Wrapped both `$or` conditions under single `$and`  
**Impact:** `activeDays` filter now works correctly

```javascript
// BEFORE
{
  merchant: merchantId,
  visibility: { $in: ['always', 'scheduled'] },
  $or: [{ activeDays: currentDay }, { activeDays: { $size: 0 } }],
  $or: [{ blockedDays: { $ne: currentDay } }, { blockedDays: { $size: 0 } }], // Overwrites first!
}

// AFTER
{
  merchant: merchantId,
  visibility: { $in: ['always', 'scheduled'] },
  $and: [
    { $or: [{ activeDays: currentDay }, { activeDays: { $size: 0 } }] },
    { $or: [{ blockedDays: { $ne: currentDay } }, { blockedDays: { $size: 0 } }] }
  ],
}
```

---

### ✅ Fix 3: Field Mismatch i.menuItem vs i.menu (CRITICAL - Returns Empty Items)
**File:** `src/modules/menu/service/MenuService.js:449-488`  
**Issue:** `getActiveMenu()` reads `i.menuItem` but populate path is `items.menu`  
**Fix:** Replaced all `i.menuItem` references with `i.menu` (15 occurrences)  
**Impact:** Active menu now returns actual menu items instead of empty array

```javascript
// BEFORE
const visibleItems = group.items.filter(i => i.menuItem && !i.isHidden);
// ... later
_id: i.menuItem._id,
name: i.customName || i.menuItem.name,

// AFTER
const visibleItems = group.items.filter(i => i.menu && !i.isHidden);
// ... later
_id: i.menu._id,
name: i.customName || i.menu.name,
```

---

### ✅ Fix 4: Legacy Image Handler on PATCH Route (MEDIUM)
**Files:**  
- `src/modules/menu/menus.routes.js:82`  
- `src/modules/menu/controller/menu.controller.js:99-126`

**Issue:** PATCH route used `resizeMenuPhoto` (local disk, string filename) instead of `resizeAndProcessImages` (FileAsset/ObjectId)  
**Fix:** Changed route to use `resizeAndProcessImages`, deleted `resizeMenuPhoto` function  
**Impact:** Image updates now use consistent FileAsset system

```javascript
// BEFORE (menus.routes.js)
.patch(menuController.uploadMenuPhoto, menuController.resizeMenuPhoto, menuController.updateMenu)

// AFTER
.patch(menuController.uploadMenuPhoto, menuController.resizeAndProcessImages, menuController.updateMenu)

// Deleted entire resizeMenuPhoto function (27 lines)
```

---

### ✅ Fix 5: Recipe Ingredients Field Structure (MEDIUM)
**File:** `src/modules/menu/service/MenuService.js`  
**Lines:** 354 (createNewMenu), 397-411 (updateMenu)  
**Issue:** Writes to top-level `ingredients` instead of `recipe.ingredients` per schema  
**Fix:** Changed both methods to write `recipe: { ingredients }`  
**Impact:** Recipe ingredients now save to correct schema path

```javascript
// BEFORE (createNewMenu)
const menuDataToCreate = {
  // ...
  ingredients,
  allergens,
  tags,
}

// AFTER
const menuDataToCreate = {
  // ...
  recipe: { ingredients },
  allergens,
  tags,
}

// ADDED to updateMenu
if (req.body.ingredients) {
  req.body.recipe = { ingredients: req.body.ingredients };
  delete req.body.ingredients;
}
```

---

### ✅ Fix 6: Dead Query-Filter Middlewares (LOW)
**Files:**  
- `src/modules/menu/menus.routes.js:45-66` (3 routes deleted)  
- `src/modules/menu/controller/menu.controller.js:107-128` (3 functions deleted)

**Issue:** 3 unused middleware functions and their routes (`getAppetizers`, `getSpecials`, `searchMenu`)  
**Fix:** Deleted all 3 middlewares and their routes  
**Impact:** Reduced code clutter, removed dead code paths

**Deleted Routes:**
- `/public/appetizers`
- `/public/specials`
- `/public/search`

**Deleted Functions:**
- `exports.getAppetizers`
- `exports.getSpecials`
- `exports.searchMenu`

---

### ✅ Fix 7: Missing publishStatus Filter (LOW)
**File:** `src/modules/menu/service/MenuService.js`  
**Lines:** 141, 441, 612 (3 populate statements)  
**Issue:** Display methods don't filter by `publishStatus: 'published'`  
**Fix:** Added `publishStatus: 'published'` to match filters in `getPublicMenu`, `getStaffMenu`, `getActiveMenu`  
**Impact:** Only published menu items appear in all display views

```javascript
// BEFORE
populate({
  path: 'items.menu',
  match: { available: true, inStock: true },
})

// AFTER
populate({
  path: 'items.menu',
  match: { available: true, inStock: true, publishStatus: 'published' },
})
```

---

### ✅ Fix 8: Duplicate Route File (LOW)
**File:** `src/modules/menu/menu.routes.js` (DELETED)  
**Issue:** Dead duplicate route file defining `/publish`, `/archive`, `/publications/branch/:branchId`  
**Fix:** Deleted entire file - these routes exist in `menus.routes.js` and are mounted there  
**Impact:** Removed dead code, clarified routing structure

---

### ✅ Fix 9: Debug Logging of Sensitive Data (MEDIUM)
**Files:**  
- `src/modules/menu/service/MenuService.js` (1 occurrence)  
- `src/modules/menu/controller/menu.controller.js` (5 occurrences)  
- `src/modules/menu/controller/combo.controller.js` (5 occurrences)

**Issue:** 13 console.log statements logging request/user/body payloads  
**Fix:** Removed all console.log calls (kept NODE_ENV conditional logs in combo.controller.js)  
**Impact:** Reduced log noise, removed sensitive data from logs

**Removed:**
- `console.log('req user => :{', req.user)`
- `console.log('📸 req.file →', req.file)`
- `console.log('📦 req.body=>', req.body)`
- And 8 more similar statements

---

### ✅ Fix 10: Variant Price Not Required (MEDIUM)
**Files:**  
- `models/menuModel.js:23` (schema)  
- `src/modules/menu/service/MenuService.js:399-407` (updateMenu validation)

**Issue:** `variantSchema.price` not required, `updateMenu()` doesn't validate variant prices  
**Fix:** Added `required: true` to schema, added validation loop in `updateMenu()`  
**Impact:** Prevents creation of menu items with invalid variant prices

```javascript
// BEFORE (menuModel.js)
price: {
  type: Number,
  min: [0, 'Price cannot be negative'],
},

// AFTER
price: {
  type: Number,
  min: [0, 'Price cannot be negative'],
  required: [true, 'Variant price is required'],
},

// ADDED to updateMenu
if (req.body.variants && Array.isArray(req.body.variants)) {
  req.body.variants.forEach((v, index) => {
    if (v.price == null || v.price < 0) {
      throw new AppError(`Variant ${index + 1} must have a valid price`, 400);
    }
  });
}
```

---

## Files Modified

1. ✅ `models/menuModel.js` - Variant price schema
2. ✅ `src/modules/menu/service/MenuService.js` - 7 fixes (combo filter, duplicate $or, field mismatch, ingredients structure, publishStatus filter × 3, console.log, variant validation)
3. ✅ `src/modules/menu/menus.routes.js` - Image handler fix, dead routes deletion
4. ✅ `src/modules/menu/controller/menu.controller.js` - Dead middlewares deletion, console.log removal, legacy function deletion
5. ✅ `src/modules/menu/controller/combo.controller.js` - Console.log removal
6. ✅ `src/modules/menu/menu.routes.js` - **DELETED**

---

## Impact Analysis

### Security Improvements
- ✅ Fixed multi-tenant data leak (Fix 1)
- ✅ Removed sensitive data logging (Fix 9)

### Data Integrity
- ✅ Fixed query that returned empty items (Fix 3)
- ✅ Fixed recipe ingredients field structure (Fix 5)
- ✅ Enforced variant price validation (Fix 10)

### Correctness
- ✅ Fixed duplicate $or query bug (Fix 2)
- ✅ Added publishStatus filter (Fix 7)
- ✅ Unified image handling (Fix 4)

### Code Quality
- ✅ Removed dead code (Fixes 6, 8, 9)

---

## Next Steps

1. **Run Tests** - Verify no regressions
2. **User Review** - Wait for approval to commit
3. **Commit & Push** - Once approved
4. **Phase B Planning** - File/image handling audit (not started)
5. **Phase C Planning** - Query handling + response standardization (not started)

---

## Testing Recommendations

1. Test multi-tenant isolation (Fix 1)
2. Test active menu day/time filtering (Fix 2)
3. Test menu item display in active menu view (Fix 3)
4. Test menu item image updates (Fix 4)
5. Test recipe ingredients save/retrieve (Fix 5)
6. Test variant price validation on create/update (Fix 10)
7. Test publishStatus filtering in all views (Fix 7)

---

**Implementation Complete:** 2026-08-19  
**Ready for:** User review & commit approval
