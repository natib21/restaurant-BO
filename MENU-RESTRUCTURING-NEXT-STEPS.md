# Menu Module Restructuring - Next Steps & Completion Plan

**Current Status:** Phase 3 Complete + Category Service Created (Phase 4 started)  
**Progress:** ~25% Complete

---

## ✅ Completed Work

### Phase 1: Foundation ✅
- Folder structure created
- Barrel exports created
- commonFields.js enhanced

### Phase 2: Models ✅
- Category.model.js
- MenuItem.model.js
- MenuGroup.model.js
- Combo.model.js

### Phase 3: Repositories ✅
- Category.repository.js
- MenuItem.repository.js
- MenuGroup.repository.js
- Combo.repository.js

### Phase 4: Services (Started)
- ✅ Category.service.js
- ⏳ MenuItem.service.js (NEXT)
- ⏳ MenuGroup.service.js
- ⏳ Combo.service.js

---

## 🚀 Quick Completion Strategy

To get the menu module production-ready quickly, follow this streamlined approach:

### Step 1: Complete Core Services (1-2 hours)
Create the remaining 3 services following the Category.service.js pattern:

**MenuItem.service.js** - Key methods:
- `getAll(req)` - with ApiFeatures
- `getById(id, merchantId)`
- `getByCategory(categoryId, merchantId, filters)`
- `create(data, merchantId, userId)`
- `update(id, data, merchantId, userId)`
- `toggleAvailability(id, merchantId)`
- `softDelete(id, merchantId, userId)`
- `restore(id, merchantId)`

**MenuGroup.service.js** - Key methods:
- `getAll(req)` 
- `getById(id, merchantId)`
- `getByBranch(merchantId, branchId)`
- `create(data, merchantId, userId)`
- `update(id, data, merchantId, userId)`
- `addItem(groupId, merchantId, itemData)`
- `removeItem(groupId, merchantId, menuItemId)`
- `reorderItems(groupId, merchantId, itemsOrder)`
- `softDelete(id, merchantId, userId)`

**Combo.service.js** - Key methods:
- `getAll(req)`
- `getById(id, merchantId)`
- `create(data, merchantId, userId)`
- `update(id, data, merchantId, userId)`
- `toggleActive(id, merchantId)`
- `softDelete(id, merchantId, userId)`
- `enrichComboItems(items)` - validate and enrich with menu item names

### Step 2: Update Existing Controllers (30 min)
Update existing controllers to use new services instead of old MenuService:

**Files to update:**
- `src/modules/menu/controller/menu.controller.js`
- `src/modules/menu/controller/menu-group.controller.js`
- `src/modules/menu/controller/combo.controller.js`

**Pattern:**
```javascript
// OLD
const { MenuService } = require('../service/MenuService');

// NEW
const MenuItemService = require('../service/MenuItem.service');
const MenuGroupService = require('../service/MenuGroup.service');
const ComboService = require('../service/Combo.service');
```

### Step 3: Update Model Imports (Critical - 15 min)
Find and replace all old model imports:

```bash
# Search for old imports
grep -r "require('../models/menuModel" .
grep -r "require('../models/comboModel" .
grep -r "require('../models/menuGroupModel" .
grep -r "require('../models/Category" .

# Replace with new paths
# OLD: require('../../../models/menuModel')
# NEW: require('../model/MenuItem.model')
```

### Step 4: Basic Testing (30 min)
Create one integration test to verify the system works:

**tests/menu-restructured-integration.test.js**
- Test Category CRUD
- Test MenuItem CRUD
- Test MenuGroup CRUD
- Test Combo CRUD
- Test relationships (MenuItem -> Category)

### Step 5: Update Routes (Optional - can skip for now)
The existing routes in `src/modules/menu/` can continue working with updated controllers.

---

## 🎯 Minimum Viable Implementation

**To make this production-ready TODAY, focus on:**

1. ✅ Models (DONE)
2. ✅ Repositories (DONE)
3. ✅ Category Service (DONE)
4. ⏳ **MenuItem, MenuGroup, Combo Services** (DO NEXT)
5. ⏳ **Update Controllers to use new services** (DO NEXT)
6. ⏳ **Update model imports** (DO NEXT)
7. ⏳ **Basic integration test** (DO NEXT)

**Skip for now (do later):**
- DTOs (existing patterns work)
- Zod validators (existing validators work)
- New routers (existing routes work)
- Comprehensive tests (add incrementally)

---

## 📝 Service Implementation Template

Use this pattern for MenuItem, MenuGroup, and Combo services:

```javascript
/**
 * @file src/modules/menu/service/[Entity].service.js
 * @description Business logic for [entity] management
 */

const [Entity]Repository = require('../repository/[Entity].repository');
const AppError = require('../../../../utils/appError');
const ApiFeatures = require('../../../../utils/apiFeatures');
const { normalizeName, normalizeDescription } = require('../../../../utils/localization-helper');

class [Entity]Service {
  /**
   * Get all [entities] with ApiFeatures
   */
  static async getAll(req) {
    const merchantId = req.user?.merchant?._id || req.user?.merchant;
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const baseQuery = [Entity]Repository.findAll(merchantId, {}, false);
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name.en', 'name.am'])
      .filter()
      .sort()
      .limitFields()
      .paginate();
    
    return await features.query || [];
  }

  /**
   * Get by ID
   */
  static async getById(id, merchantId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const entity = await [Entity]Repository.findById(id, merchantId, false);
    if (!entity) throw new AppError('[Entity] not found', 404);
    
    return entity;
  }

  /**
   * Create
   */
  static async create(data, merchantId, userId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    // Normalize localized fields
    data.name = normalizeName(data.name);
    if (data.description) {
      data.description = normalizeDescription(data.description);
    }
    
    // Business validation here
    
    return [Entity]Repository.create({
      ...data,
      merchant: merchantId,
      createdBy: userId,
      updatedBy: userId
    });
  }

  /**
   * Update
   */
  static async update(id, data, merchantId, userId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const entity = await [Entity]Repository.findById(id, merchantId, false);
    if (!entity) throw new AppError('[Entity] not found', 404);
    
    // Normalize if name/description provided
    if (data.name) data.name = normalizeName(data.name);
    if (data.description !== undefined) {
      data.description = normalizeDescription(data.description);
    }
    
    data.updatedBy = userId;
    
    return [Entity]Repository.updateById(id, merchantId, data);
  }

  /**
   * Soft delete
   */
  static async softDelete(id, merchantId, userId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const entity = await [Entity]Repository.findById(id, merchantId, false);
    if (!entity) throw new AppError('[Entity] not found', 404);
    
    // Check dependencies here if needed
    
    return [Entity]Repository.softDelete(id, merchantId, userId);
  }

  /**
   * Restore
   */
  static async restore(id, merchantId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const entity = await [Entity]Repository.findById(id, merchantId, true);
    if (!entity) throw new AppError('[Entity] not found', 404);
    if (!entity.deletedAt) throw new AppError('[Entity] is not deleted', 400);
    
    return [Entity]Repository.restore(id, merchantId);
  }
}

module.exports = [Entity]Service;
```

---

## 🔧 Controller Update Pattern

Update existing controllers like this:

```javascript
// OLD
const { MenuService } = require('../service/MenuService');

exports.getAllMenuItems = catchAsync(async (req, res) => {
  const items = await MenuService.getAllMenu(req);
  sendResponse(res, 200, 'menuItems', items);
});

// NEW
const MenuItemService = require('../service/MenuItem.service');

exports.getAllMenuItems = catchAsync(async (req, res) => {
  const items = await MenuItemService.getAll(req);
  sendResponse(res, 200, 'menuItems', items);
});
```

---

## ⚠️ Critical Import Updates

**Find and replace these imports across the codebase:**

```javascript
// Models
require('../../models/menuModel') → require('../model/MenuItem.model')
require('../../models/comboModel') → require('../model/Combo.model')
require('../../models/menuGroupModel') → require('../model/MenuGroup.model')
require('../../models/Category') → require('../model/Category.model')

// Adjust path depth based on file location
```

---

## 🧪 Quick Test Script

Create `tests/menu-mvp.test.js`:

```javascript
const Category = require('../src/modules/menu/model/Category.model');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const MenuGroup = require('../src/modules/menu/model/MenuGroup.model');
const Combo = require('../src/modules/menu/model/Combo.model');

describe('Menu Module MVP Test', () => {
  it('should import all models correctly', () => {
    expect(Category).toBeDefined();
    expect(MenuItem).toBeDefined();
    expect(MenuGroup).toBeDefined();
    expect(Combo).toBeDefined();
  });
  
  // Add basic CRUD tests here
});
```

---

## 📊 Current Progress Summary

| Phase | Status | Files | Progress |
|-------|--------|-------|----------|
| Phase 1: Foundation | ✅ Complete | 9 files | 100% |
| Phase 2: Models | ✅ Complete | 4 files | 100% |
| Phase 3: Repositories | ✅ Complete | 4 files | 100% |
| Phase 4: Services | 🚧 In Progress | 1/4 files | 25% |
| Phase 5-14 | ⏳ Pending | 50+ files | 0% |

**Total Progress: ~25%**

---

## 🎯 Next Immediate Actions

1. **Create MenuItem.service.js** (15 min)
2. **Create MenuGroup.service.js** (15 min)
3. **Create Combo.service.js** (15 min)
4. **Update 3 controllers** (15 min)
5. **Update model imports** (15 min)
6. **Test basic functionality** (15 min)

**Total time to MVP: ~1.5 hours**

---

## 💡 Recommendations

### For Quick Production Readiness:
- Complete Steps 1-4 above
- Update imports carefully
- Test each entity one at a time
- Deploy with feature flag

### For Complete Restructuring:
- Follow full 14-phase plan
- Complete all DTOs and validators
- Write comprehensive tests
- Full documentation
- Estimated time: 20-30 days

---

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Recommended Next Step:** Create remaining 3 services using the template above
