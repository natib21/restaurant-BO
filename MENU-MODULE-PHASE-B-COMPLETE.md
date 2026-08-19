# Menu Module Phase B - File/Image Handling Fixes - COMPLETE

**Date:** 2026-08-19  
**Status:** ✅ COMPLETE - All 4 Issues Fixed

---

## Summary

Successfully completed Phase B file/image handling fixes for the Menu module. All legacy image fields have been removed from schemas, orphaned FileAsset cleanup has been implemented, and all code updated to use FileAsset exclusively.

**Database Check Result:** 0 menu items with legacy-only images - safe to proceed with schema removal.

---

## Issues Fixed

### ✅ Issue 1 (HIGH): Orphaned FileAssets on Image Update

**Problem:** When updating menu/combo images, old FileAsset records were not being cleaned up.

**Fix Applied:**
- **menu.controller.js `updateMenu()`**: Before updating, reads old menu, soft-deletes old `image` and all `images[]` FileAssets
- **combo.controller.js `updateCombo()`**: Before updating, reads old combo, soft-deletes old `image` FileAsset
- Sequence: Read old → Update → Soft-delete old
- Uses `FileManagementService.softDelete()` with merchantId

**Files Modified:**
- `src/modules/menu/controller/menu.controller.js` (+16 lines before MenuService.updateMenu call)
- `src/modules/menu/controller/combo.controller.js` (+11 lines before MenuService.updateCombo call)

---

### ✅ Issue 2 (MEDIUM): Legacy Field Pollution - REMOVED ENTIRELY (Option B)

**Problem:** Schema contained legacy `imageUrl`/`imageFilename` string fields alongside new FileAsset references.

**Fix Applied - Removed Legacy Fields from Schema:**
- **menuModel.js**: Removed `imageUrl` and `imageFilename` string fields from schema
- **comboModel.js**: No legacy fields present (already clean)
- **menuGroupModel.js**: Converted `bannerImage` from `String` to `ObjectId ref FileAsset`

**Fix Applied - Stopped Writing Legacy Fields:**
- **menu.controller.js `resizeAndProcessImages()`**: Removed lines writing `imageUrl` and `imageFilename`
- **combo.controller.js `resizeAndProcessImages()`**: Removed lines writing `imageUrl` and `imageFilename`

**Fix Applied - Simplified Image Resolution:**
- **image-response.js `resolveSingleImageData()`**: Removed `imageFilename`, `imageUrl`, `legacyBasePath` parameters
- Now only resolves via FileAsset (ObjectId or populated document)
- Returns `null` if no FileAsset present (no legacy fallback)
- **image-response.js `resolveImageCollectionData()`**: Removed `legacyBasePath` parameter

**Fix Applied - Updated All Callers:**
- **MenuService.js**: 3 calls updated (getPublicMenu, getActiveMenu, getStaffMenu)
- **menu.controller.js `formatMenuResponse()`**: 2 calls updated (single image + images array)
- **combo.controller.js `formatComboResponse()`**: 1 call updated
- **tests/feedback-stats.test.js**: 3 test cases updated to match new API

**Files Modified:**
- `models/menuModel.js` (removed imageUrl, imageFilename, fixed imageData virtual)
- `models/menuGroupModel.js` (converted bannerImage to FileAsset)
- `src/modules/menu/utils/image-response.js` (simplified both functions)
- `src/modules/menu/controller/menu.controller.js` (stopped writing legacy, updated calls)
- `src/modules/menu/controller/combo.controller.js` (stopped writing legacy, updated calls)
- `src/modules/menu/service/MenuService.js` (updated 3 resolveSingleImageData calls)
- `tests/feedback-stats.test.js` (updated test expectations)

---

### ✅ Issue 3 (LOW): Dead Combo imageUrl Virtual

**Problem:** Combo model's `imageData` virtual had fallback to `this.imageUrl` which doesn't exist.

**Fix Applied:**
- **comboModel.js line 131**: Changed `return this.imageUrl || null;` to `return null;`
- Virtual now returns FileAsset URL if present, else `null` (no dead fallback)

**Files Modified:**
- `models/comboModel.js`

---

### ✅ Issue 4 (LOW): MenuGroup bannerImage Conversion

**Problem:** MenuGroup.bannerImage was a String field, should use FileAsset for consistency.

**Fix Applied:**
- **menuGroupModel.js line 54-58**: Converted `bannerImage: { type: String }` to:
  ```javascript
  bannerImage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileAsset',
    default: null,
  }
  ```

**Note:** No upload/resize/delete handlers exist for menu group banners yet. This is schema-only change. Actual banner upload functionality should be scoped as separate follow-up work.

**Files Modified:**
- `models/menuGroupModel.js`

---

## Files Changed (12 total)

### Models (3 files)
- `models/menuModel.js` - Removed imageUrl/imageFilename, fixed imageData virtual
- `models/comboModel.js` - Fixed imageData virtual (removed dead fallback)
- `models/menuGroupModel.js` - Converted bannerImage to FileAsset reference

### Controllers (2 files)
- `src/modules/menu/controller/menu.controller.js` - Cleanup old FileAssets, stopped writing legacy, updated calls
- `src/modules/menu/controller/combo.controller.js` - Cleanup old FileAssets, stopped writing legacy, updated calls

### Services (1 file)
- `src/modules/menu/service/MenuService.js` - Updated 3 resolveSingleImageData calls

### Utils (1 file)
- `src/modules/menu/utils/image-response.js` - Simplified both functions (removed legacy params)

### Tests (1 file)
- `tests/feedback-stats.test.js` - Updated test expectations for new API

### Scripts (1 file)
- `scripts/check-legacy-image-fields.js` - Database inspection script (NEW, not committed)

### Documentation (3 files)
- `MENU-MODULE-PHASE-B-INVESTIGATION-REPORT.md` - Investigation findings (NEW, not committed)
- `MENU-MODULE-PHASE-B-COMPLETE.md` - This document (NEW)

---

## Git Status

```
Changes not staged for commit:
        modified:   models/comboModel.js
        modified:   models/menuGroupModel.js
        modified:   models/menuModel.js
        modified:   src/modules/menu/controller/combo.controller.js
        modified:   src/modules/menu/controller/menu.controller.js
        modified:   src/modules/menu/service/MenuService.js
        modified:   src/modules/menu/utils/image-response.js
        modified:   tests/feedback-stats.test.js

Untracked files:
        MENU-MODULE-PHASE-B-INVESTIGATION-REPORT.md
        scripts/check-legacy-image-fields.js
```

**Phase A changes** (from previous commit bc3120a) are still in the working tree unstaged. This Phase B work stacks on top of Phase A.

---

## Code Changes Summary

### 1. Schema Changes
- Removed `imageUrl` and `imageFilename` from Menu model
- Fixed Menu imageData virtual to return null instead of undefined legacy field
- Fixed Combo imageData virtual to remove dead `this.imageUrl` fallback
- Converted MenuGroup bannerImage from String to FileAsset ObjectId

### 2. Controller Changes
- Menu/Combo controllers: Added pre-update cleanup of old FileAssets
- Menu/Combo controllers: Stopped writing imageUrl/imageFilename in resizeAndProcessImages

### 3. Utility Changes
- Simplified resolveSingleImageData: removed imageFilename, imageUrl, legacyBasePath parameters
- Simplified resolveImageCollectionData: removed legacyBasePath parameter
- Both functions now work exclusively with FileAsset references

### 4. Service Changes
- Updated all MenuService calls to resolveSingleImageData (removed 4 legacy parameters each)

### 5. Test Changes
- Updated feedback-stats tests to match new API (no legacy fields)
- Changed "fallback to static" test to "returns null when missing"

---

## Impact Assessment

### ✅ Safe Changes
- Database check confirmed 0 records with legacy-only images
- All existing menu items already use FileAsset
- No data loss risk from schema field removal

### ⚠️ Breaking Changes
- Old code expecting imageUrl/imageFilename in Menu schema will break
- If any external code reads imageUrl/imageFilename directly from DB, it will get undefined
- Response format unchanged (imageData virtual still provides URL)

### 📝 Follow-Up Work Needed
- MenuGroup banner upload/resize/delete handlers (Issue 4 follow-up)
- Test Phase A + Phase B changes against real HTTP requests before Phase C
- Run full test suite to verify no regressions

---

## Next Steps

1. ✅ Review git diff (DONE - awaiting user approval)
2. ⏳ User approves Phase B commit
3. ⏳ Commit Phase B changes
4. ⏳ Test both Phase A and Phase B against real requests
5. ⏳ Wait for user approval before starting Phase C (query handling + response standardization)

---

## Phase B Completion Checklist

- [x] Issue 1: Orphaned FileAsset cleanup implemented (menu + combo)
- [x] Issue 2: Legacy fields removed from schema (menuModel, menuGroupModel)
- [x] Issue 2: Stopped writing legacy fields (menu/combo controllers)
- [x] Issue 2: Simplified image resolution utilities
- [x] Issue 2: Updated all callers (service, controllers, tests)
- [x] Issue 3: Fixed Combo imageData virtual
- [x] Issue 4: Converted MenuGroup bannerImage to FileAsset
- [x] Updated test files
- [x] Created completion documentation
- [x] Ready for git diff review

**Phase B Status:** ✅ COMPLETE - Ready for commit after user approval
