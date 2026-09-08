# Menu Module Phase B Investigation Report
**Date:** 2026-08-19  
**Phase:** B - File/Image Handling Audit  
**Status:** Investigation Complete

---

## Executive Summary

Found **4 CONFIRMED issues** with file/image handling:

| # | Severity | Issue | File:Line |
|---|----------|-------|-----------|
| 1 | **HIGH** | Orphaned FileAssets on image replacement | menu.controller.js:242, combo.controller.js:203 |
| 2 | **MEDIUM** | Legacy field pollution in resizeAndProcessImages | menu.controller.js:62-63, combo.controller.js:61-62 |
| 3 | **LOW** | Combo model has orphaned imageUrl virtual | comboModel.js:131 |
| 4 | **LOW** | MenuGroup bannerImage is string, not FileAsset | menuGroupModel.js:56 |

---

## Current File Handling Architecture

### FileAsset System (Correct Pattern)
- **FileAsset Model:** Tenant-scoped metadata with storageKey, merchant, entityType, entityId
- **FileManagementService:** registerUpload(), softDelete(), getContent()
- **Storage:** Local filesystem with async-safe soft deletion
- **Schema Fields:** Menu.image (ObjectId ref FileAsset), Menu.images (array)

### Legacy Fields (Backward Compatibility)
- **Menu Model:** imageUrl (String), imageFilename (String)  
- **Combo Model:** imageUrl virtual (references undefined field)
- **MenuGroup Model:** bannerImage (String)

### Current Status
- ✅ Menu/Combo CREATE: Uses FileAsset correctly
- ✅ Menu/Combo DELETE: Cleans up FileAssets properly
- ❌ Menu/Combo UPDATE: Does NOT clean up old FileAssets when replacing
- ❌ resizeAndProcessImages: Sets legacy fields unnecessarily

---

## Issue 1: Orphaned FileAssets on Image Replacement ⚠️ HIGH

**Problem:** When updating a menu item or combo with a new image, the old FileAsset remains in the database (soft-deleted: false) and storage. Over time, this creates orphaned files consuming storage.

**Evidence:**

**menu.controller.js updateMenu (line 242):**
```javascript
exports.updateMenu = catchAsync(async (req, res, next) => {
  const updatedMenu = await MenuService.updateMenu(req);  // ❌ No cleanup

  // Populate image references
  await updatedMenu.populate([
    { path: 'image', match: { isDeleted: false} },
    { path: 'images', match: { isDeleted: false } },
  ]);

  res.status(200).json({
    status: 'success',
    data: { menu: formatMenuResponse(updatedMenu) },
  });
});
```

**combo.controller.js updateCombo (line 203):**
```javascript
exports.updateCombo = catchAsync(async (req, res) => {
  // If new image was uploaded, update combo data
  if (req.processedImageId) {
    req.body.image = req.processedImageId;  // ❌ Old image not cleaned up
  }

  const combo = await MenuService.updateCombo(req);
  
  // Updates new FileAsset but doesn't delete old one
  if (combo.image && typeof combo.image !== 'string') {
    await FileAsset.findByIdAndUpdate(combo.image, {
      entityId: combo._id,
    });
  }

  res.status(201).json({
    status: 'success',
    data: { combo: formatComboResponse(combo) },
  });
});
```

**Comparison with deleteMenu (CORRECT pattern - lines 260-282):**
```javascript
exports.deleteMenu = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  // ✅ Get menu before deletion to clean up images
  const menu = await MenuService.getMenu(req);

  // ✅ Soft delete all FileAsset images
  if (menu.image && typeof menu.image !== 'string') {
    await FileManagementService.softDelete(menu.image, merchantId);
  }

  if (menu.images && menu.images.length > 0) {
    for (const imageId of menu.images) {
      if (typeof imageId !== 'string') {
        await FileManagementService.softDelete(imageId, merchantId);
      }
    }
  }

  await MenuService.deleteMenu(req);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
```

**Impact:**
- Storage bloat from orphaned files
- Database clutter with unused FileAsset records
- No automatic cleanup mechanism

**Fix Required:**
1. In `updateMenu()` controller: Before updating, check if `req.processedImageId` exists. If yes, get old menu, soft-delete old image FileAsset
2. In `updateCombo()` controller: Same pattern - get old combo, soft-delete old image before updating
3. Handle both single image and images array

---

## Issue 2: Legacy Field Pollution ⚠️ MEDIUM

**Problem:** `resizeAndProcessImages` middleware sets legacy string fields (`imageUrl`, `imageFilename`) even though the system now uses FileAsset ObjectIds. These fields pollute the database and create confusion about which field is the source of truth.

**Evidence:**

**menu.controller.js resizeAndProcessImages (lines 62-63):**
```javascript
    req.processedImageId = fileAsset._id;
    req.body.image = fileAsset._id;           // ✅ Correct FileAsset ObjectId
    req.body.imageUrl = fileAsset.getPublicUrl();     // ❌ Legacy field
    req.body.imageFilename = `menu-${merchantId}-${Date.now()}.jpeg`;  // ❌ Legacy field
```

**combo.controller.js resizeAndProcessImages (lines 61-62):**
```javascript
    req.processedImageId = fileAsset._id;
    req.body.image = fileAsset._id;           // ✅ Correct
    req.body.imageUrl = fileAsset.getPublicUrl();     // ❌ Legacy
    req.body.imageFilename = `combo-${merchantId}-${Date.now()}.jpeg`;  // ❌ Legacy
```

**Schema allows these fields:**

**menuModel.js (lines 129-136):**
```javascript
    imageUrl: {
      type: String,
      default: null,
    },
    imageFilename: {
      type: String,
      default: 'default-menu-item.jpg',
    },
```

**Why it's a problem:**
1. **Redundancy:** imageUrl is derivable from FileAsset._id via getPublicUrl()
2. **Inconsistency:** Two sources of truth (FileAsset vs string fields)
3. **Migration confusion:** Makes it unclear which system is active
4. **Schema bloat:** Unused fields consuming storage

**Current dependencies on legacy fields:**

**image-response.js resolveSingleImageData (lines 51-60):**
```javascript
  if (imageUrl) {
    return { url: imageUrl };
  }

  if (imageFilename) {
    return {
      filename: imageFilename,
      url: buildStaticAssetUrl(legacyBasePath, imageFilename, origin),
    };
  }
```

This function checks FileAsset first, then falls back to legacy fields for backward compatibility.

**Impact:**
- Database writes unnecessary data on every image upload
- Confusion about which field to use
- Makes complete FileAsset migration harder

**Fix Options:**

**Option A (Conservative):** Keep schema fields for backward compat, stop writing them
- Remove lines 62-63 from menu.controller.js
- Remove lines 61-62 from combo.controller.js
- Keep resolveSingleImageData fallback for old records

**Option B (Aggressive):** Remove legacy fields entirely
- Requires data migration to ensure all existing records use FileAsset
- Remove imageUrl/imageFilename from schema
- Simplify resolveSingleImageData

**Recommendation:** Option A - stop writing legacy fields but keep them for old data

---

## Issue 3: Combo Model imageUrl Virtual References Undefined Field ⚠️ LOW

**Problem:** Combo model has an `imageData` virtual that references `this.imageUrl`, but Combo schema has no `imageUrl` field defined.

**Evidence:**

**comboModel.js lines 127-133:**
```javascript
comboSchema.virtual('imageData').get(function () {
  if (this.image) {
    return `/api/v1/files/${this.image}/content`;
  }
  return this.imageUrl || null;  // ❌ this.imageUrl is undefined
});
```

**Combo schema search result:**
- No `imageUrl` field in schema
- No `imageFilename` field in schema
- Only `image` field (ObjectId ref FileAsset) at line 79-82

**Impact:**
- Virtual always returns null on fallback path
- Dead code that serves no purpose
- Misleading for developers

**Fix Required:**
Remove line 131 (`return this.imageUrl || null;`), just return null:

```javascript
comboSchema.virtual('imageData').get(function () {
  if (this.image) {
    return `/api/v1/files/${this.image}/content`;
  }
  return null;
});
```

---

## Issue 4: MenuGroup bannerImage is String, Not FileAsset ⚠️ LOW

**Problem:** MenuGroup.bannerImage is defined as a string field, not using the FileAsset system. Inconsistent with Menu/Combo image handling.

**Evidence:**

**menuGroupModel.js line 56:**
```javascript
    description: { type: String, trim: true },
    bannerImage: { type: String },  // ❌ String instead of FileAsset ObjectId
```

**Current Usage Search:**
No code currently uploads or processes bannerImage. Field appears unused.

**Impact:**
- Inconsistent file handling across models
- If banner images are added later, will need manual FileAsset integration
- Missing tenant-scoped file management

**Fix Options:**

**Option A:** Convert to FileAsset now (proactive)
```javascript
bannerImage: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'FileAsset',
  default: null,
},
```

**Option B:** Leave as-is until actually used (lazy)
- Wait until banner upload feature is implemented
- Fix at that time with proper FileAsset integration

**Recommendation:** Option A if MenuGroup images are planned, Option B otherwise

---

## Code References

### Files with Image Handling:
1. `models/FileAsset.js` - FileAsset schema
2. `src/modules/files/file-management.service.js` - File operations
3. `src/modules/menu/controller/menu.controller.js` - Menu image handlers
4. `src/modules/menu/controller/combo.controller.js` - Combo image handlers
5. `src/modules/menu/utils/image-response.js` - Image URL resolution
6. `models/menuModel.js` - Menu schema with image fields
7. `models/comboModel.js` - Combo schema with image field
8. `models/menuGroupModel.js` - MenuGroup schema with banner

### Correctly Implemented:
- ✅ Menu/Combo CREATE - Uses FileAsset, sets entityId
- ✅ Menu/Combo DELETE - Soft-deletes FileAssets properly
- ✅ FileAsset soft delete - Sets isDeleted, attempts storage cleanup

### Needs Fixing:
- ❌ Menu UPDATE - Missing old FileAsset cleanup
- ❌ Combo UPDATE - Missing old FileAsset cleanup
- ❌ resizeAndProcessImages - Writing legacy fields
- ❌ Combo imageUrl virtual - References undefined field
- ⚠️ MenuGroup bannerImage - Not using FileAsset system

---

## Recommended Fix Priority

### High Priority (Issue 1):
Fix orphaned FileAssets on update - causes storage bloat

### Medium Priority (Issue 2):
Stop writing legacy fields - prevents future confusion

### Low Priority (Issues 3 & 4):
Clean up dead code and inconsistent schema - doesn't affect functionality

---

**Investigation Complete:** 2026-08-19  
**Ready for:** Fix implementation approval
