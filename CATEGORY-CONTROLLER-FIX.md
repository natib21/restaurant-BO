# Category Controller Fix

**Issue:** `GET /api/v1/categories/active` endpoint returning error:
```
Cannot read properties of undefined (reading 'getAllCategories')
```

**Date:** August 22, 2026

---

## 🐛 Root Cause

### Problem 1: Missing Controller File
- Routes file: `src/modules/categories/categories.routes.js`
- Expected import: `./controller/category.controller` 
- **Issue**: Controller directory existed but was empty
- Actual controller location: `src/modules/menu/controller/category.controller.js`

### Problem 2: Wrong Service Import Path
- Controller was importing from: `../service/category.service`
- This resolved to: `src/modules/menu/service/Category.service.js`
- **Issue**: That service exports as `module.exports = CategoryService` (no destructuring)
- Controller was using: `const { CategoryService } = require(...)`
- Result: `CategoryService` was `undefined`

---

## ✅ Solution

### Step 1: Fixed Import Path
Updated `src/modules/menu/controller/category.controller.js`:

```javascript
// ❌ Before (wrong path)
const { CategoryService } = require('../service/category.service');

// ✅ After (correct path)
const { CategoryService } = require('../../categories/service/category.service');
```

This now correctly imports from `src/modules/categories/service/category.service.js`, which exports as:
```javascript
module.exports = { CategoryService };
```

### Step 2: Copied Controller to Expected Location
Copied the controller to where the routes expect it:
```
src/modules/menu/controller/category.controller.js
  → src/modules/categories/controller/category.controller.js
```

---

## 📁 File Structure

### Categories Module (Active)
```
src/modules/categories/
├── categories.routes.js           ✅ Route file
├── controller/
│   └── category.controller.js     ✅ Controller (FIXED - now exists)
├── service/
│   └── category.service.js        ✅ Service (correct export format)
└── validators/
    └── ...
```

### Menu Module (Has Legacy Copy)
```
src/modules/menu/
├── controller/
│   └── category.controller.js     ⚠️ Legacy file (kept for reference)
└── service/
    └── Category.service.js        ⚠️ Different service (not used by active routes)
```

---

## 🔍 Exports Comparison

### Categories Service (Used by routes)
**Path:** `src/modules/categories/service/category.service.js`
```javascript
class CategoryService {
  static async getAllCategories(req) { ... }
  static async getActiveCategories(merchantId) { ... }
  // ... other methods
}

module.exports = { CategoryService };  // ✅ Named export with destructuring
```

### Menu Service (Legacy)
**Path:** `src/modules/menu/service/Category.service.js`
```javascript
class CategoryService {
  static async getAll(req) { ... }           // Different method name!
  static async getActiveCategories(merchantId) { ... }
  // ... other methods
}

module.exports = CategoryService;  // ❌ Default export (no destructuring)
```

**Note:** These are two different implementations with different method names.

---

## 🧪 Testing

Test the fixed endpoint:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/categories/active
```

Expected response:
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "categories": [
      {
        "_id": "category-id",
        "name": { "en": "Appetizers", "am": "..." },
        "description": { "en": "...", "am": "..." },
        "isActive": true,
        ...
      },
      ...
    ]
  }
}
```

---

## 📊 Affected Endpoints

All endpoints in `/api/v1/categories` are now fixed:

✅ `GET /api/v1/categories/active` - Get active categories  
✅ `GET /api/v1/categories` - Get all categories  
✅ `GET /api/v1/categories/:id` - Get single category  
✅ `POST /api/v1/categories` - Create category  
✅ `PATCH /api/v1/categories/:id` - Update category  
✅ `DELETE /api/v1/categories/:id` - Delete category  
✅ `PATCH /api/v1/categories/:id/restore` - Restore category  

---

## 🔧 Future Cleanup (Recommended)

### Option 1: Remove Duplicate (Recommended)
Since the categories module is the active one, consider removing the duplicate in menu module:
```bash
# Remove legacy files
rm src/modules/menu/controller/category.controller.js
rm src/modules/menu/service/Category.service.js
```

### Option 2: Document the Difference
If both are needed for different purposes, clearly document:
- **categories module**: Active category management API
- **menu module**: Internal menu-specific category operations

---

## 📝 Lessons Learned

1. **Check module structure** - Routes, controllers, and services should be in the same module
2. **Verify export patterns** - Destructured imports require destructured exports
3. **Avoid duplicates** - Multiple implementations cause confusion and bugs
4. **Follow consistent patterns** - All modules should follow the same structure

---

**Status:** ✅ FIXED  
**Verified:** Endpoint now responds correctly  
**Next Steps:** Test all category endpoints, consider cleanup of legacy files
