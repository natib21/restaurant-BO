# Menu Management Workflow Guide

**System:** Multi-Tenant Restaurant Management Platform  
**Last Updated:** 2026-08-19

---

## 🎯 Overview

The Menu Management system controls the lifecycle of menu items from creation through publication to customer ordering. It consists of three key components:

1. **MenuService** — CRUD operations for menu items, groups, and combos
2. **MenuManagementService** — Publish lifecycle, versioning, and orderability validation
3. **OrderService** — Order placement with menu item validation

---

## 📋 Key Concepts

### 1. Menu Item States

Menu items have two independent state fields:

```javascript
{
  available: Boolean,      // Can customers see/order this item?
  publishStatus: String,   // Lifecycle state: 'draft' | 'published' | 'archived'
}
```

**State Matrix:**

| available | publishStatus | Visible in Display? | Orderable? | Use Case |
|-----------|---------------|---------------------|------------|----------|
| `true` | `'published'` | ✅ Yes | ✅ Yes | **Normal active item** |
| `true` | `'draft'` | ✅ Yes | ❌ No | Coming soon (visible but can't order) |
| `false` | `'published'` | ❌ No | ❌ No | Temporarily unavailable |
| `false` | `'archived'` | ❌ No | ❌ No | **Archived/deleted** |
| `true` | `'archived'` | ✅ Yes | ❌ No | Should not happen (inconsistent) |

**Current System Behavior:**
- Display views (`getPublicMenu`, `getStaffMenu`, `getActiveMenu`) filter by `available: true` ONLY
- Order placement filters by BOTH `available: true` AND `publishStatus: 'published'`

---

### 2. Menu Groups

Menu items are organized into menu groups for display/scheduling:

```javascript
MenuGroup {
  name: String,
  visibility: 'always' | 'scheduled' | 'hidden',
  activeDays: [String],     // ['monday', 'tuesday', ...]
  blockedDays: [String],
  timeSlots: [{ start, end }],
  priority: Number,         // Display order
  items: [{
    menu: ObjectId,         // Reference to Menu item
    sortOrder: Number,
    overridePrice: Number,  // Optional price override
    customName: String,     // Optional name override
    isHidden: Boolean       // Hide in this group
  }]
}
```

---

### 3. Menu Publications (Versioning)

When a menu group is published to a branch, a versioned snapshot is created:

```javascript
MenuPublication {
  merchant: ObjectId,
  branch: ObjectId,
  menuGroup: ObjectId,
  version: Number,          // Auto-increments per branch+menuGroup
  publishedBy: ObjectId,
  publishedAt: Date,
  snapshot: {
    menuGroup: {...},       // Menu group config at publish time
    items: [...],           // Menu items at publish time
    menus: [...]            // Full menu item data
  },
  recipeValidation: {
    passed: Boolean,
    missingRecipes: []
  }
}
```

---

## 🔄 Complete Workflows

### Workflow 1: Create New Menu Item

**File:** `MenuService.createNewMenu()`

```javascript
POST /api/v1/menu
Content-Type: multipart/form-data

{
  name: "Margherita Pizza",
  type: "food",
  category: "Pizza",
  price: 12.99,
  variants: [{ name: "Small", price: 9.99 }, { name: "Large", price: 14.99 }],
  image: <file>,
  available: true,
  recipe: {
    ingredients: [
      { ingredient: "ingredient-id", quantity: 0.3, unit: "kg" }
    ]
  }
}
```

**Steps:**
1. Image uploaded → processed by `resizeAndProcessImages` → saved as `FileAsset`
2. Validate required fields (name, type, category)
3. Parse JSON fields (variants, ingredients, tags)
4. Validate variant prices (each must have valid price ≥ 0)
5. Create menu item with `publishStatus: 'published'` (default from schema)
6. Add to default menu group automatically
7. Return menu item with populated image references

**Result:**
```javascript
{
  _id: "menu-id",
  name: "Margherita Pizza",
  available: true,
  publishStatus: "published",
  image: "fileasset-id",
  variants: [...]
}
```

---

### Workflow 2: Update Menu Item

**File:** `MenuService.updateMenu()`

```javascript
PATCH /api/v1/menu/:id
Content-Type: multipart/form-data

{
  name: "Margherita Pizza (Updated)",
  price: 13.99,
  image: <file>
}
```

**Steps:**
1. If image uploaded → process via `resizeMenuPhoto` (⚠️ **BUG: Uses legacy handler**)
2. Parse JSON fields
3. Update menu item via `findOneAndUpdateMenu`
4. Return updated menu item

**Issues:**
- Uses `resizeMenuPhoto` (local disk) instead of `resizeAndProcessImages` (FileAsset) ❌
- Does NOT re-validate variant prices ❌
- Allows setting inconsistent states ❌

---

### Workflow 3: Publish Menu Group to Branch

**File:** `MenuManagementService.publishMenuGroup()`

```javascript
POST /api/v1/menu/publish

{
  menuGroupId: "group-id",
  branchId: "branch-id"
}
```

**Steps:**

1. **Validate Recipe Coverage** (`validateRecipesForGroup`)
   - Find menu group
   - Get all visible items (where `isHidden: false`)
   - For each item, verify active recipe exists
   - If any missing → throw error (cannot publish)

2. **Validate Branch Assignment**
   - Verify menu group is assigned to target branch
   - If not → throw error

3. **Calculate Version**
   - Find latest publication for this branch+menuGroup
   - Increment version number

4. **Update Menu Items**
   ```javascript
   await Menu.updateMany(
     { _id: { $in: menuIds } },
     { $set: { publishStatus: 'published' } }
   );
   ```

5. **Create Publication Snapshot**
   - Capture menu group config
   - Capture all menu items data
   - Store validation results
   - Set `publishedBy` and timestamp

6. **Log Event**
   ```javascript
   logger.info('menu.published', {
     menuGroupId, branchId, version, merchantId
   });
   ```

**Result:**
```javascript
{
  _id: "publication-id",
  version: 3,
  publishedAt: "2026-08-19T10:00:00Z",
  snapshot: {
    menuGroup: {...},
    items: [...],
    menus: [...]
  }
}
```

**Why Versioning Matters:**
- Audit trail (who published what when)
- Rollback capability (revert to previous version)
- Branch-specific menus (different branches can have different menu versions)
- Recipe validation enforcement (ensures all items have recipes before going live)

---

### Workflow 4: Archive Menu Item

**File:** `MenuManagementService.archiveMenuItem()`

```javascript
PATCH /api/v1/menu/:id/archive
```

**Steps:**
1. Find menu item by ID
2. Update both flags:
   ```javascript
   {
     publishStatus: 'archived',
     available: false
   }
   ```
3. Item disappears from all display views
4. Item cannot be ordered

**Result:**
```javascript
{
  _id: "menu-id",
  publishStatus: "archived",
  available: false
}
```

---

### Workflow 5: Customer Orders Menu Item

**File:** `OrderService.buildOrderItems()`

**Flow:**

```javascript
POST /api/v1/order

{
  items: [
    { menuItemId: "menu-id", quantity: 2 }
  ]
}
```

**Steps:**

1. **Fetch Menu Item with Orderability Filter**
   ```javascript
   const menuItem = await MenuItem.findOne({
     _id: item.menuItemId,
     ...MenuService.buildOrderableMenuFilter(merchantId)
   });
   ```

   **Filter Applied (MenuManagementService.buildOrderableMenuFilter):**
   ```javascript
   {
     merchant: merchantId,
     available: true,
     $or: [
       { publishStatus: 'published' },
       { publishStatus: { $exists: false } }  // Legacy support
     ]
   }
   ```

2. **Assert Item is Orderable**
   ```javascript
   MenuService.assertMenuItemOrderable(menuItem);
   ```

   **Validation Logic:**
   ```javascript
   if (!menuItem) throw new AppError('Menu item not found or unavailable', 400);
   if (!isOrderablePublishStatus(menuItem.publishStatus)) {
     throw new AppError('Menu item is not published for ordering', 400);
   }
   ```

   **isOrderablePublishStatus:**
   ```javascript
   function isOrderablePublishStatus(status) {
     if (!status || status === 'published') return true;
     return false;
   }
   ```

3. **Calculate Pricing**
4. **Calculate COGS (Cost of Goods Sold)**
5. **Build Order Item**

**Protection:**
- Draft items → Blocked by `publishStatus` filter
- Archived items → Blocked by both `available` and `publishStatus`
- Missing recipes → Prevented at publish time (can't reach archived state without recipe)

---

## 🔍 Current System Analysis

### ✅ What Works Well

1. **Order Protection is Solid**
   - Double validation (`buildOrderableMenuFilter` + `assertMenuItemOrderable`)
   - Cannot order draft or archived items
   - Legacy support for items without `publishStatus` field

2. **Versioned Publications**
   - Full audit trail of menu changes
   - Branch-specific menu configurations
   - Rollback capability

3. **Recipe Validation**
   - Cannot publish menu group without recipes for all items
   - Ensures cost calculation is possible
   - Prevents incomplete menu items from going live

---

### ⚠️ Current Issues

1. **Display Views Don't Check publishStatus**
   
   **Current Behavior:**
   ```javascript
   // getPublicMenu, getStaffMenu, getActiveMenu
   .populate({
     path: 'items.menu',
     match: { available: true, inStock: true }  // ❌ Missing publishStatus
   })
   ```

   **Impact:** Customers see draft items in menu (but can't order them) → Confusing UX

2. **Image Handling Inconsistency**
   - CREATE uses `resizeAndProcessImages` (FileAsset/ObjectId) ✅
   - UPDATE uses `resizeMenuPhoto` (local disk/string) ❌
   - Results in broken images after update

3. **Variant Price Not Validated on Update**
   - CREATE validates all variant prices
   - UPDATE allows setting variants without prices → Orders fail

4. **Recipe Field Mismatch**
   - Schema expects `recipe.ingredients`
   - Code writes to top-level `ingredients`
   - Data is silently ignored by Mongoose strict mode

---

## 🎨 Recommended Fixes

### Fix 1: Enforce publishStatus in Display Views

**Change:**
```javascript
// In getPublicMenu, getStaffMenu, getActiveMenu
.populate({
  path: 'items.menu',
  match: {
    available: true,
    inStock: true,
    publishStatus: 'published'  // ✅ Add this
  }
})
```

**Rationale:**
- Customers only see items they can actually order
- Consistent with orderability rules
- Staff can still use `getAllMenu()` to see all items including drafts

---

### Fix 2: Unify Image Handling

**Change in menus.routes.js:**
```javascript
router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(
    menuController.uploadMenuPhoto,
    menuController.resizeAndProcessImages,  // ✅ Use same handler as CREATE
    menuController.updateMenu
  )
  .delete(menuController.deleteMenu);
```

**Delete:** `menuController.resizeMenuPhoto` (legacy handler)

---

### Fix 3: Validate Variants on Update

**Add to MenuService.updateMenu():**
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

---

### Fix 4: Fix Recipe Field Structure

**In MenuService.createNewMenu():**
```javascript
const menuDataToCreate = {
  // ...
  recipe: {
    ingredients: parseJSON(menuData.ingredients, [])  // ✅ Nested
  },
  allergens,
  tags,
  // ...
};
```

---

## 📊 Menu Item Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    MENU ITEM LIFECYCLE                        │
└─────────────────────────────────────────────────────────────┘

  [CREATE]
     │
     ├─→ available: true
     ├─→ publishStatus: 'published' (default)
     └─→ Added to default menu group
           │
           ▼
    ┌──────────────┐
    │    DRAFT     │  ← Can set publishStatus: 'draft' manually
    │ (optional)   │
    └──────────────┘
           │
           │ [Staff decides to publish]
           │
           ▼
    ┌──────────────┐
    │   VALIDATE   │
    │   RECIPES    │  ← MenuManagementService.validateRecipesForGroup()
    └──────────────┘
           │
           ├─→ ✅ All recipes exist
           │
           ▼
    ┌──────────────┐
    │   PUBLISH    │  ← MenuManagementService.publishMenuGroup()
    │  TO BRANCH   │
    └──────────────┘
           │
           ├─→ Sets publishStatus: 'published'
           ├─→ Creates MenuPublication (versioned snapshot)
           └─→ Logs event
           │
           ▼
    ┌──────────────┐
    │  PUBLISHED   │  ← available: true, publishStatus: 'published'
    │   & LIVE     │  ← Visible in all displays
    └──────────────┘  ← Orderable by customers
           │
           │
           ├─────→ [Toggle availability] ─────→ available: false
           │                                    (temporarily unavailable)
           │
           │
           └─────→ [Archive] ──────────────→ ┌──────────────┐
                                              │   ARCHIVED   │
                                              │              │
                                              │ publishStatus│
                                              │  'archived'  │
                                              │ available:   │
                                              │   false      │
                                              └──────────────┘
                                                     │
                                                     └─→ Not visible
                                                     └─→ Not orderable
```

---

## 🔒 Security & Multi-Tenancy

### Merchant Isolation

**All queries include merchant filter:**
```javascript
{
  merchant: merchantId,
  // ... other filters
}
```

**Enforced at:**
- MenuService (CRUD operations)
- MenuManagementService (publish operations)
- OrderService (order validation)

### RBAC Protection

**Endpoints require capabilities:**
```javascript
router.post('/publish',
  requireCapability(CAPABILITIES.MENU_MANAGE),  // ✅ Only authorized users
  menuController.publishMenuGroup
);
```

---

## 📚 File Reference Map

```
src/modules/menu/
├── service/
│   └── MenuService.js                    # CRUD, display views
├── menu-management.service.js            # Publish lifecycle, orderability
├── controller/
│   └── menu.controller.js                # HTTP handlers, image processing
├── repository/
│   └── MenuRepository.js                 # MongoDB access layer
├── menus.routes.js                       # Main routes (LIVE)
├── menu.routes.js                        # ❌ DUPLICATE (dead code)
├── menu-groups.routes.js                 # Menu group routes
├── combos.routes.js                      # Combo routes
└── validators/
    └── menu.validators.js                # Input validation

models/
├── menuModel.js                          # Menu item schema
├── menuGroupModel.js                     # Menu group schema
├── MenuPublication.js                    # Publication versioning
└── Recipe.js                             # Recipe-ingredient link

src/modules/order/service/
└── OrderService.js                       # Uses MenuService.buildOrderableMenuFilter()
```

---

## 🎯 Summary

The Menu Management system has three layers:

1. **Data Layer** (MenuService) — CRUD operations
2. **Business Logic** (MenuManagementService) — Publish workflow, validation
3. **Order Integration** (OrderService) — Orderability enforcement

**Current State:**
- ✅ Order protection is robust
- ✅ Versioning works correctly
- ⚠️ Display views need `publishStatus` filter
- ⚠️ Image handling needs unification
- ⚠️ Update validation needs improvement

**Phase 2 will address all ⚠️ items.**
