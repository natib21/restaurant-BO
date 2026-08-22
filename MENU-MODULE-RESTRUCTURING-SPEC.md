# Menu Module Restructuring - Production-Ready Specification

**Project:** Restaurant Management System - Menu Module Refactoring  
**Date:** December 2024  
**Status:** 📋 **SPECIFICATION PHASE** - Awaiting Approval  
**Objective:** Restructure the menu module following clean architecture principles with proper layer separation

---

## Executive Summary

This specification outlines a comprehensive restructuring of the menu module to achieve:
- **Clean Architecture:** Proper separation of concerns (Model → Repository → Service → Controller)
- **Maintainability:** Clear folder structure with single responsibility
- **Testability:** Comprehensive test coverage for production readiness
- **Scalability:** Modular design supporting future enhancements
- **Consistency:** Unified patterns across all menu entities (Category, MenuItem, MenuGroup, Combo)

---

## Current State Analysis

### Existing Structure
```
src/modules/menu/
├── controller/
│   ├── branch-menu-group.controller.js
│   ├── combo.controller.js
│   ├── menu-group.controller.js
│   └── menu.controller.js
├── dto/
│   └── menu-response.dto.js
├── repository/
│   └── MenuRepository.js
├── service/
│   └── MenuService.js
├── utils/
│   └── image-response.js
├── validators/
│   └── menu.validators.js
├── branch-menu-groups.routes.js
├── combos.routes.js
├── index.js
├── menu-groups.routes.js
├── menu-management.service.js
├── menu.controller.js (duplicate)
└── menus.routes.js

models/ (root level)
├── Category.js
├── menuModel.js
├── menuGroupModel.js
└── comboModel.js
```

### Issues Identified
1. ❌ Models scattered in root `/models` directory (not in menu module)
2. ❌ Mixed router organization (some files, should be in router/ folder)
3. ❌ Single monolithic MenuService handling all entities
4. ❌ Single monolithic MenuRepository handling all entities
5. ❌ Insufficient DTO organization (missing req/ and res/ subfolders)
6. ❌ Validators need expansion and Zod integration
7. ❌ Missing comprehensive test suite
8. ❌ Duplicate controller files (menu.controller.js in two locations)

---

## Target Architecture

### Proposed Folder Structure
```
src/modules/menu/
├── model/                          ← NEW: Models moved here
│   ├── Category.model.js
│   ├── MenuItem.model.js
│   ├── MenuGroup.model.js
│   └── Combo.model.js
├── repository/                     ← REFACTORED: Split by entity
│   ├── Category.repository.js
│   ├── MenuItem.repository.js
│   ├── MenuGroup.repository.js
│   ├── Combo.repository.js
│   └── index.js                   ← Barrel export
├── service/                        ← REFACTORED: Split by entity
│   ├── Category.service.js
│   ├── MenuItem.service.js
│   ├── MenuGroup.service.js
│   ├── Combo.service.js
│   ├── MenuManagement.service.js  ← Publication/ordering logic
│   └── index.js                   ← Barrel export
├── controller/                     ← CLEANED: Organized
│   ├── Category.controller.js
│   ├── MenuItem.controller.js
│   ├── MenuGroup.controller.js
│   ├── Combo.controller.js
│   ├── BranchMenuGroup.controller.js
│   └── index.js                   ← Barrel export
├── dto/                            ← EXPANDED: Request/Response
│   ├── req/
│   │   ├── CreateCategoryReq.dto.js
│   │   ├── UpdateCategoryReq.dto.js
│   │   ├── CreateMenuItemReq.dto.js
│   │   ├── UpdateMenuItemReq.dto.js
│   │   ├── CreateMenuGroupReq.dto.js
│   │   ├── UpdateMenuGroupReq.dto.js
│   │   ├── CreateComboReq.dto.js
│   │   └── UpdateComboReq.dto.js
│   └── res/
│       ├── CategoryRes.dto.js
│       ├── MenuItemRes.dto.js
│       ├── MenuGroupRes.dto.js
│       ├── ComboRes.dto.js
│       └── PublicMenuRes.dto.js
├── validator/                      ← EXPANDED: Zod schemas
│   ├── Category.validator.js
│   ├── MenuItem.validator.js
│   ├── MenuGroup.validator.js
│   ├── Combo.validator.js
│   ├── common.validator.js        ← Shared validation rules
│   └── index.js                   ← Barrel export
├── router/                         ← REORGANIZED: Folder structure
│   ├── category.routes.js
│   ├── menuItem.routes.js
│   ├── menuGroup.routes.js
│   ├── combo.routes.js
│   ├── branchMenuGroup.routes.js
│   ├── public.routes.js           ← Public menu APIs
│   └── index.js                   ← Main router aggregator
├── utils/                          ← UTILITIES
│   ├── image-response.js
│   ├── menu-helpers.js
│   └── index.js
└── index.js                        ← Module entry point
```

### Shared Utilities (Root Level)
```
utils/schemas/                      ← NEW/UPDATED
├── localizedText.js               ← Existing (verified ✅)
└── commonFields.js                ← NEW: Shared field definitions
```

---

## Schema Design

### 1. Localized Text Schema (Already Exists ✅)
**Location:** `utils/schemas/localizedText.js`

```javascript
// Supports: { en: "Text", am: "ጽሑፍ" }
const localizedTextSchema = new mongoose.Schema({
  en: { type: String, required: true, trim: true },
  am: { type: String, trim: true }
}, { _id: false });
```

### 2. Common Fields Schema (NEW)
**Location:** `utils/schemas/commonFields.js`

```javascript
// Shared fields for soft-delete and audit tracking
const commonFieldsSchema = {
  isActive: { type: Boolean, default: true, index: true },
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null, index: true }
};
```

### 3. Category Model
**Location:** `src/modules/menu/model/Category.model.js`

```javascript
const categorySchema = new mongoose.Schema({
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  name: { type: localizedTextSchema, required: true },
  description: { type: localizedTextSchema },
  displayOrder: { type: Number, default: 0 },
  icon: { type: String }, // Icon name or URL
  ...commonFieldsSchema
}, { timestamps: true });

// Indexes
categorySchema.index({ merchant: 1, isActive: 1 });
categorySchema.index({ merchant: 1, deletedAt: 1 });
```

### 4. MenuItem Model
**Location:** `src/modules/menu/model/MenuItem.model.js`

```javascript
const menuItemSchema = new mongoose.Schema({
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  categoryId: { type: ObjectId, ref: 'Category', required: true, index: true },
  name: { type: localizedTextSchema, required: true },
  description: { type: localizedTextSchema },
  type: { type: String, enum: ['food', 'drink'], required: true },
  
  // Pricing
  price: { type: Number, default: 0 },
  variants: [{
    name: String,
    price: Number,
    size: String,
    volume: String,
    calories: Number,
    available: { type: Boolean, default: true },
    isDefault: Boolean
  }],
  
  // Properties
  isVeg: Boolean,
  isSpicy: Boolean,
  isAlcoholic: Boolean,
  alcoholPercentage: Number,
  prepTime: String,
  
  // Content
  image: { type: ObjectId, ref: 'FileAsset' },
  imageFilename: String,
  tags: [String],
  ingredients: [String],
  allergens: [String],
  
  // Stock & Availability
  available: { type: Boolean, default: true },
  inStock: { type: Boolean, default: true },
  publishStatus: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  
  // Ratings
  ratingAverage: { type: Number, default: 4.5 },
  ratingCount: { type: Number, default: 0 },
  
  ...commonFieldsSchema
}, { timestamps: true });

// Indexes
menuItemSchema.index({ merchant: 1, categoryId: 1, isActive: 1 });
menuItemSchema.index({ merchant: 1, publishStatus: 1, available: 1 });
menuItemSchema.index({ merchant: 1, type: 1 });
```

### 5. MenuGroup Model
**Location:** `src/modules/menu/model/MenuGroup.model.js`

```javascript
const menuGroupSchema = new mongoose.Schema({
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  branches: [{ type: ObjectId, ref: 'Branch', required: true }],
  
  name: { type: localizedTextSchema, required: true },
  description: { type: localizedTextSchema },
  slug: String,
  bannerImage: { type: ObjectId, ref: 'FileAsset' },
  
  // Visibility & Scheduling
  visibility: { type: String, enum: ['always', 'scheduled', 'hidden'], default: 'always' },
  activeDays: [{ type: String, enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] }],
  blockedDays: [{ type: String, enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] }],
  timeSlots: [{
    start: String, // "09:00"
    end: String    // "23:00"
  }],
  specialDates: [{
    date: Date,
    recurringYearly: Boolean
  }],
  
  // Properties
  isAlcoholMenu: { type: Boolean, default: false },
  isSystemDefault: Boolean,
  priority: { type: Number, default: 0 },
  
  // Items
  items: [{
    menu: { type: ObjectId, ref: 'Menu', required: true },
    sortOrder: { type: Number, default: 0 },
    overridePrice: Number,
    customName: String,
    customDescription: String,
    isHidden: { type: Boolean, default: false }
  }],
  
  ...commonFieldsSchema
}, { timestamps: true });

// Indexes
menuGroupSchema.index({ merchant: 1, branches: 1 });
menuGroupSchema.index({ merchant: 1, visibility: 1, isActive: 1 });
```

### 6. Combo Model
**Location:** `src/modules/menu/model/Combo.model.js`

```javascript
const comboSchema = new mongoose.Schema({
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  branches: [{ type: ObjectId, ref: 'Branch' }],
  
  name: { type: localizedTextSchema, required: true },
  description: { type: localizedTextSchema },
  slug: String,
  image: { type: ObjectId, ref: 'FileAsset' },
  
  // Items
  items: [{
    menuItem: { type: ObjectId, ref: 'Menu', required: true },
    nameFallback: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 }
  }],
  
  // Pricing
  originalPrice: { type: Number, default: 0 },
  comboPrice: { type: Number, required: true, min: 0.01 },
  
  // Availability
  validFrom: Date,
  validUntil: Date,
  availableOnDays: [{ type: String, enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] }],
  timeSlots: [{
    start: String,
    end: String
  }],
  
  // Properties
  priority: { type: Number, default: 0 },
  tags: [String],
  
  // Branch Overrides
  branchOverrides: [{
    branch: { type: ObjectId, ref: 'Branch', required: true },
    isActive: Boolean,
    comboPrice: Number,
    items: [/* same as above */],
    availableOnDays: [String],
    timeSlots: [{ start: String, end: String }],
    validFrom: Date,
    validUntil: Date
  }],
  
  ...commonFieldsSchema
}, { timestamps: true });

// Indexes
comboSchema.index({ merchant: 1, branches: 1, isActive: 1 });
comboSchema.index({ validUntil: 1 });
```

---

## API Endpoints Design

### Category APIs
```
POST   /api/v1/menu/categories                  - Create category
GET    /api/v1/menu/categories                  - List categories (with filters)
GET    /api/v1/menu/categories/:id              - Get category by ID
PUT    /api/v1/menu/categories/:id              - Update category
DELETE /api/v1/menu/categories/:id              - Soft delete category
POST   /api/v1/menu/categories/:id/restore      - Restore soft-deleted category
```

### MenuItem APIs
```
POST   /api/v1/menu/items                       - Create menu item
GET    /api/v1/menu/items                       - List menu items (with filters)
GET    /api/v1/menu/items/:id                   - Get menu item by ID
PUT    /api/v1/menu/items/:id                   - Update menu item
DELETE /api/v1/menu/items/:id                   - Soft delete menu item
POST   /api/v1/menu/items/:id/restore           - Restore soft-deleted item
PATCH  /api/v1/menu/items/:id/availability      - Toggle availability
GET    /api/v1/menu/items/category/:categoryId  - Get items by category
```

### MenuGroup APIs
```
POST   /api/v1/menu/groups                      - Create menu group
GET    /api/v1/menu/groups                      - List menu groups
GET    /api/v1/menu/groups/:id                  - Get menu group by ID
PUT    /api/v1/menu/groups/:id                  - Update menu group
DELETE /api/v1/menu/groups/:id                  - Soft delete menu group
POST   /api/v1/menu/groups/:id/restore          - Restore soft-deleted group
POST   /api/v1/menu/groups/:id/items            - Add item to group
DELETE /api/v1/menu/groups/:id/items/:itemId    - Remove item from group
PUT    /api/v1/menu/groups/:id/items/reorder    - Reorder items in group
POST   /api/v1/menu/groups/:id/publish          - Publish menu group
```

### Combo APIs
```
POST   /api/v1/menu/combos                      - Create combo
GET    /api/v1/menu/combos                      - List combos
GET    /api/v1/menu/combos/:id                  - Get combo by ID
PUT    /api/v1/menu/combos/:id                  - Update combo
DELETE /api/v1/menu/combos/:id                  - Soft delete combo
POST   /api/v1/menu/combos/:id/restore          - Restore soft-deleted combo
PATCH  /api/v1/menu/combos/:id/toggle           - Toggle combo active status
```

### Public APIs (No Auth Required)
```
GET    /api/v1/menu/public/:merchantId          - Get public menu
GET    /api/v1/menu/staff                       - Get staff menu (Auth required)
GET    /api/v1/menu/active/:merchantId          - Get active menu groups
```

---

## Implementation Tasks

### Phase 1: Foundation & Infrastructure (Days 1-2)

#### Task 1.1: Create Shared Utilities ✅ (Status: Verified)
- [x] Verify `utils/schemas/localizedText.js` exists and works
- [ ] Create `utils/schemas/commonFields.js` with shared field definitions
- [ ] Add comprehensive JSDoc documentation
- [ ] Create unit tests for schema utilities

**Files:**
- `utils/schemas/commonFields.js` (NEW)
- `utils/schemas/localizedText.js` (VERIFY)

#### Task 1.2: Setup New Folder Structure
- [ ] Create `src/modules/menu/model/` directory
- [ ] Create `src/modules/menu/router/` directory
- [ ] Create `src/modules/menu/dto/req/` directory
- [ ] Create `src/modules/menu/dto/res/` directory
- [ ] Create barrel `index.js` files for each directory

**Deliverable:** Clean folder structure ready for migration

---

### Phase 2: Model Layer Migration (Days 3-4)

#### Task 2.1: Migrate Category Model
- [ ] Move `/models/Category.js` → `src/modules/menu/model/Category.model.js`
- [ ] Integrate `localizedTextSchema` for name/description
- [ ] Integrate `commonFieldsSchema` for soft-delete
- [ ] Add proper indexes (merchant, isActive, deletedAt)
- [ ] Add slug generation pre-save middleware
- [ ] Update all imports across codebase

**Files:**
- `src/modules/menu/model/Category.model.js` (MIGRATED)

#### Task 2.2: Migrate MenuItem Model
- [ ] Move `/models/menuModel.js` → `src/modules/menu/model/MenuItem.model.js`
- [ ] Add `categoryId` field (required, indexed)
- [ ] Integrate `localizedTextSchema` (already done ✅)
- [ ] Integrate `commonFieldsSchema`
- [ ] Add relationship indexes
- [ ] Update all imports

**Files:**
- `src/modules/menu/model/MenuItem.model.js` (MIGRATED)

#### Task 2.3: Migrate MenuGroup Model
- [ ] Move `/models/menuGroupModel.js` → `src/modules/menu/model/MenuGroup.model.js`
- [ ] Integrate `localizedTextSchema` (already done ✅)
- [ ] Integrate `commonFieldsSchema`
- [ ] Add proper indexes
- [ ] Update all imports

**Files:**
- `src/modules/menu/model/MenuGroup.model.js` (MIGRATED)

#### Task 2.4: Migrate Combo Model
- [ ] Move `/models/comboModel.js` → `src/modules/menu/model/Combo.model.js`
- [ ] Integrate `localizedTextSchema` (already done ✅)
- [ ] Integrate `commonFieldsSchema`
- [ ] Add proper indexes
- [ ] Update all imports

**Files:**
- `src/modules/menu/model/Combo.model.js` (MIGRATED)

---

### Phase 3: Repository Layer Refactoring (Days 5-6)

#### Task 3.1: Create Category Repository
- [ ] Extract Category operations from `MenuRepository.js`
- [ ] Create `src/modules/menu/repository/Category.repository.js`
- [ ] Implement CRUD operations
- [ ] Implement soft-delete methods
- [ ] Add multi-tenant filtering
- [ ] Add comprehensive JSDoc

**Methods:**
```javascript
- findAll(merchantId, filters)
- findById(id, merchantId)
- findByIdWithDeleted(id, merchantId)
- create(data)
- updateById(id, merchantId, data)
- softDelete(id, merchantId, deletedById)
- restore(id, merchantId)
- count(merchantId, filters)
```

#### Task 3.2: Create MenuItem Repository
- [ ] Extract MenuItem operations from `MenuRepository.js`
- [ ] Create `src/modules/menu/repository/MenuItem.repository.js`
- [ ] Implement all CRUD operations
- [ ] Add category-based queries
- [ ] Add publish status queries
- [ ] Add availability queries

**Methods:**
```javascript
- findAll(merchantId, filters)
- findById(id, merchantId)
- findByCategory(categoryId, merchantId, filters)
- findByPublishStatus(merchantId, status)
- findAvailable(merchantId, filters)
- create(data)
- updateById(id, merchantId, data)
- toggleAvailability(id, merchantId)
- softDelete(id, merchantId, deletedById)
- restore(id, merchantId)
```

#### Task 3.3: Create MenuGroup Repository
- [ ] Extract MenuGroup operations from `MenuRepository.js`
- [ ] Create `src/modules/menu/repository/MenuGroup.repository.js`
- [ ] Implement CRUD operations
- [ ] Add branch-based queries
- [ ] Add visibility-based queries
- [ ] Add item management methods

**Methods:**
```javascript
- findAll(merchantId, filters)
- findById(id, merchantId)
- findByBranch(merchantId, branchId)
- findActive(merchantId, filters)
- create(data)
- updateById(id, merchantId, data)
- addItem(groupId, merchantId, itemData)
- removeItem(groupId, merchantId, menuItemId)
- reorderItems(groupId, merchantId, itemsOrder)
- softDelete(id, merchantId, deletedById)
- restore(id, merchantId)
```

#### Task 3.4: Create Combo Repository
- [ ] Extract Combo operations from `MenuRepository.js`
- [ ] Create `src/modules/menu/repository/Combo.repository.js`
- [ ] Implement CRUD operations
- [ ] Add branch-based queries
- [ ] Add availability methods

**Methods:**
```javascript
- findAll(merchantId, filters)
- findById(id, merchantId)
- findByBranch(merchantId, branchId)
- findActive(merchantId, filters)
- create(data)
- updateById(id, merchantId, data)
- toggleActive(id, merchantId)
- softDelete(id, merchantId, deletedById)
- restore(id, merchantId)
```

#### Task 3.5: Create Repository Barrel Export
- [ ] Create `src/modules/menu/repository/index.js`
- [ ] Export all repositories for clean imports

---

### Phase 4: Service Layer Refactoring (Days 7-9)

#### Task 4.1: Create Category Service
- [ ] Extract Category logic from `MenuService.js`
- [ ] Create `src/modules/menu/service/Category.service.js`
- [ ] Implement business logic layer
- [ ] Add validation orchestration
- [ ] Add multi-tenant checks
- [ ] Handle localization normalization

**Methods:**
```javascript
- async getAll(merchantId, filters, pagination)
- async getById(id, merchantId)
- async create(merchantId, data, createdById)
- async update(id, merchantId, data, updatedById)
- async softDelete(id, merchantId, deletedById)
- async restore(id, merchantId)
- async checkDuplicateName(merchantId, name, excludeId)
```

#### Task 4.2: Create MenuItem Service
- [ ] Extract MenuItem logic from `MenuService.js`
- [ ] Create `src/modules/menu/service/MenuItem.service.js`
- [ ] Implement business logic
- [ ] Add variant management
- [ ] Add pricing validation
- [ ] Add category validation
- [ ] Handle image management

**Methods:**
```javascript
- async getAll(merchantId, filters, pagination)
- async getById(id, merchantId)
- async getByCategory(categoryId, merchantId, filters)
- async create(merchantId, data, createdById)
- async update(id, merchantId, data, updatedById)
- async toggleAvailability(id, merchantId)
- async softDelete(id, merchantId, deletedById)
- async restore(id, merchantId)
- async validateVariants(variants)
- async enrichWithCategory(menuItem)
```

#### Task 4.3: Create MenuGroup Service
- [ ] Extract MenuGroup logic from `MenuService.js`
- [ ] Create `src/modules/menu/service/MenuGroup.service.js`
- [ ] Implement business logic
- [ ] Add scheduling logic
- [ ] Add branch validation
- [ ] Add item management

**Methods:**
```javascript
- async getAll(merchantId, filters, pagination)
- async getById(id, merchantId)
- async getActiveGroups(merchantId, branchId, currentTime)
- async create(merchantId, data, createdById)
- async update(id, merchantId, data, updatedById)
- async addItem(groupId, merchantId, menuItemId, itemConfig)
- async removeItem(groupId, merchantId, menuItemId)
- async reorderItems(groupId, merchantId, itemsOrder)
- async softDelete(id, merchantId, deletedById)
- async restore(id, merchantId)
- async validateBranches(merchantId, branchIds)
- async checkScheduleConflict(groupData)
```

#### Task 4.4: Create Combo Service
- [ ] Extract Combo logic from `MenuService.js`
- [ ] Create `src/modules/menu/service/Combo.service.js`
- [ ] Implement business logic
- [ ] Add pricing calculations
- [ ] Add availability checking
- [ ] Add branch override logic

**Methods:**
```javascript
- async getAll(merchantId, filters, pagination)
- async getById(id, merchantId)
- async getActive(merchantId, branchId)
- async create(merchantId, data, createdById)
- async update(id, merchantId, data, updatedById)
- async toggleActive(id, merchantId)
- async softDelete(id, merchantId, deletedById)
- async restore(id, merchantId)
- async calculateOriginalPrice(items)
- async validateComboItems(items)
- async enrichComboItems(items)
- async isAvailableNow(combo, branchId)
```

#### Task 4.5: Refactor MenuManagement Service
- [ ] Keep `src/modules/menu/service/MenuManagement.service.js`
- [ ] Focus on publication & ordering logic only
- [ ] Update to use new repositories
- [ ] Add proper error handling

**Methods:**
```javascript
- async publishMenuGroup(menuGroupId, merchantId, branchId, publishedBy)
- async validateRecipesForGroup(menuGroupId, merchantId)
- async archiveMenuItem(menuItemId, merchantId)
- async getLatestPublication(merchantId, branchId)
- buildOrderableMenuFilter(merchantId)
- assertMenuItemOrderable(menuItem)
```

#### Task 4.6: Create Service Barrel Export
- [ ] Create `src/modules/menu/service/index.js`
- [ ] Export all services

---

### Phase 5: DTO Layer Creation (Days 10-11)

#### Task 5.1: Create Request DTOs
- [ ] `dto/req/CreateCategoryReq.dto.js`
- [ ] `dto/req/UpdateCategoryReq.dto.js`
- [ ] `dto/req/CreateMenuItemReq.dto.js`
- [ ] `dto/req/UpdateMenuItemReq.dto.js`
- [ ] `dto/req/CreateMenuGroupReq.dto.js`
- [ ] `dto/req/UpdateMenuGroupReq.dto.js`
- [ ] `dto/req/CreateComboReq.dto.js`
- [ ] `dto/req/UpdateComboReq.dto.js`

**Purpose:** Transform and validate request data before service layer

#### Task 5.2: Create Response DTOs
- [ ] `dto/res/CategoryRes.dto.js`
- [ ] `dto/res/MenuItemRes.dto.js`
- [ ] `dto/res/MenuGroupRes.dto.js`
- [ ] `dto/res/ComboRes.dto.js`
- [ ] `dto/res/PublicMenuRes.dto.js`

**Purpose:** Format response data consistently, handle localization, attach images

---

### Phase 6: Validator Layer with Zod (Days 12-13)

#### Task 6.1: Create Category Validators
- [ ] Create `validator/Category.validator.js`
- [ ] Implement Zod schemas for create/update
- [ ] Add localized text validation
- [ ] Add merchant scoping validation

**Schemas:**
```javascript
- createCategorySchema
- updateCategorySchema
- categoryIdSchema
```

#### Task 6.2: Create MenuItem Validators
- [ ] Create `validator/MenuItem.validator.js`
- [ ] Implement create/update schemas
- [ ] Add variant validation
- [ ] Add pricing validation
- [ ] Add category reference validation

**Schemas:**
```javascript
- createMenuItemSchema
- updateMenuItemSchema
- variantSchema
- menuItemIdSchema
```

#### Task 6.3: Create MenuGroup Validators
- [ ] Create `validator/MenuGroup.validator.js`
- [ ] Implement create/update schemas
- [ ] Add scheduling validation
- [ ] Add item configuration validation

**Schemas:**
```javascript
- createMenuGroupSchema
- updateMenuGroupSchema
- addItemSchema
- reorderItemsSchema
```

#### Task 6.4: Create Combo Validators
- [ ] Create `validator/Combo.validator.js`
- [ ] Implement create/update schemas
- [ ] Add combo items validation
- [ ] Add pricing validation

**Schemas:**
```javascript
- createComboSchema
- updateComboSchema
- comboItemSchema
```

#### Task 6.5: Create Common Validators
- [ ] Create `validator/common.validator.js`
- [ ] Add ObjectId validation
- [ ] Add localized text validation
- [ ] Add pagination validation
- [ ] Add filter validation

---

### Phase 7: Controller Layer Refactoring (Days 14-15)

#### Task 7.1: Create Category Controller
- [ ] Create `controller/Category.controller.js`
- [ ] Implement request/response handling
- [ ] Add error handling
- [ ] Add validation middleware integration

**Methods:**
```javascript
- async getAllCategories(req, res, next)
- async getCategoryById(req, res, next)
- async createCategory(req, res, next)
- async updateCategory(req, res, next)
- async deleteCategory(req, res, next)
- async restoreCategory(req, res, next)
```

#### Task 7.2: Create MenuItem Controller
- [ ] Create `controller/MenuItem.controller.js`
- [ ] Implement all CRUD handlers
- [ ] Add file upload handling
- [ ] Add query parameter handling

**Methods:**
```javascript
- async getAllMenuItems(req, res, next)
- async getMenuItemById(req, res, next)
- async getMenuItemsByCategory(req, res, next)
- async createMenuItem(req, res, next)
- async updateMenuItem(req, res, next)
- async toggleMenuItemAvailability(req, res, next)
- async deleteMenuItem(req, res, next)
- async restoreMenuItem(req, res, next)
```

#### Task 7.3: Create MenuGroup Controller
- [ ] Create `controller/MenuGroup.controller.js`
- [ ] Implement CRUD handlers
- [ ] Add item management handlers
- [ ] Add publication handlers

**Methods:**
```javascript
- async getAllMenuGroups(req, res, next)
- async getMenuGroupById(req, res, next)
- async createMenuGroup(req, res, next)
- async updateMenuGroup(req, res, next)
- async addItemToMenuGroup(req, res, next)
- async removeItemFromMenuGroup(req, res, next)
- async reorderMenuGroupItems(req, res, next)
- async publishMenuGroup(req, res, next)
- async deleteMenuGroup(req, res, next)
- async restoreMenuGroup(req, res, next)
```

#### Task 7.4: Create Combo Controller
- [ ] Create `controller/Combo.controller.js`
- [ ] Implement CRUD handlers
- [ ] Add availability handlers

**Methods:**
```javascript
- async getAllCombos(req, res, next)
- async getComboById(req, res, next)
- async createCombo(req, res, next)
- async updateCombo(req, res, next)
- async toggleCombo(req, res, next)
- async deleteCombo(req, res, next)
- async restoreCombo(req, res, next)
```

#### Task 7.5: Keep BranchMenuGroup Controller
- [ ] Refactor existing `controller/BranchMenuGroup.controller.js`
- [ ] Update to use new services

#### Task 7.6: Create Controller Barrel Export
- [ ] Create `controller/index.js`

---

### Phase 8: Router Layer Reorganization (Days 16-17)

#### Task 8.1: Create Category Routes
- [ ] Create `router/category.routes.js`
- [ ] Define all category endpoints
- [ ] Add auth middleware
- [ ] Add validation middleware
- [ ] Add RBAC checks

#### Task 8.2: Create MenuItem Routes
- [ ] Create `router/menuItem.routes.js`
- [ ] Define all menu item endpoints
- [ ] Add file upload middleware
- [ ] Add validation middleware

#### Task 8.3: Create MenuGroup Routes
- [ ] Create `router/menuGroup.routes.js`
- [ ] Define all menu group endpoints
- [ ] Add validation middleware

#### Task 8.4: Create Combo Routes
- [ ] Create `router/combo.routes.js`
- [ ] Define all combo endpoints

#### Task 8.5: Create Public Routes
- [ ] Create `router/public.routes.js`
- [ ] Define public menu endpoints (no auth)
- [ ] Add rate limiting

#### Task 8.6: Create Router Aggregator
- [ ] Create `router/index.js`
- [ ] Mount all sub-routers
- [ ] Export main router

#### Task 8.7: Update Main Routes
- [ ] Update `src/routes/index.js` to use new menu router
- [ ] Remove old route files from root menu module

---

### Phase 9: Testing - Unit Tests (Days 18-20)

#### Task 9.1: Repository Tests
- [ ] `tests/unit/menu/repository/Category.repository.test.js`
- [ ] `tests/unit/menu/repository/MenuItem.repository.test.js`
- [ ] `tests/unit/menu/repository/MenuGroup.repository.test.js`
- [ ] `tests/unit/menu/repository/Combo.repository.test.js`

**Coverage:** Database operations, query building, error handling

#### Task 9.2: Service Tests
- [ ] `tests/unit/menu/service/Category.service.test.js`
- [ ] `tests/unit/menu/service/MenuItem.service.test.js`
- [ ] `tests/unit/menu/service/MenuGroup.service.test.js`
- [ ] `tests/unit/menu/service/Combo.service.test.js`
- [ ] `tests/unit/menu/service/MenuManagement.service.test.js`

**Coverage:** Business logic, validation, authorization, error scenarios

#### Task 9.3: Validator Tests
- [ ] `tests/unit/menu/validator/Category.validator.test.js`
- [ ] `tests/unit/menu/validator/MenuItem.validator.test.js`
- [ ] `tests/unit/menu/validator/MenuGroup.validator.test.js`
- [ ] `tests/unit/menu/validator/Combo.validator.test.js`

**Coverage:** Zod schema validation, edge cases, error messages

---

### Phase 10: Testing - Integration Tests (Days 21-23)

#### Task 10.1: Category Integration Tests
- [ ] `tests/integration/menu/category.integration.test.js`
- [ ] Test full CRUD lifecycle
- [ ] Test multi-tenant isolation
- [ ] Test soft-delete behavior
- [ ] Test localization

#### Task 10.2: MenuItem Integration Tests
- [ ] `tests/integration/menu/menuItem.integration.test.js`
- [ ] Test CRUD with category relationships
- [ ] Test variant management
- [ ] Test availability toggling
- [ ] Test image upload/management

#### Task 10.3: MenuGroup Integration Tests
- [ ] `tests/integration/menu/menuGroup.integration.test.js`
- [ ] Test CRUD operations
- [ ] Test item management (add/remove/reorder)
- [ ] Test scheduling logic
- [ ] Test publication workflow

#### Task 10.4: Combo Integration Tests
- [ ] `tests/integration/menu/combo.integration.test.js`
- [ ] Test CRUD operations
- [ ] Test combo item validation
- [ ] Test pricing calculations
- [ ] Test branch overrides

#### Task 10.5: Public Menu Integration Tests
- [ ] `tests/integration/menu/publicMenu.integration.test.js`
- [ ] Test public menu endpoint
- [ ] Test staff menu endpoint
- [ ] Test active menu filtering
- [ ] Test scheduling logic

#### Task 10.6: Cross-Entity Integration Tests
- [ ] `tests/integration/menu/cross-entity.integration.test.js`
- [ ] Test Category → MenuItem relationships
- [ ] Test MenuItem → MenuGroup relationships
- [ ] Test MenuItem → Combo relationships
- [ ] Test cascading soft-deletes

---

### Phase 11: Testing - End-to-End Tests (Days 24-25)

#### Task 11.1: Complete Menu Management Flow
- [ ] `tests/e2e/menu/completeFlow.e2e.test.js`
- [ ] Create category → Create menu items → Create menu group → Add items → Publish
- [ ] Test full user journey
- [ ] Test error scenarios

#### Task 11.2: Production Scenarios
- [ ] `tests/e2e/menu/productionScenarios.e2e.test.js`
- [ ] Test peak load scenarios
- [ ] Test concurrent operations
- [ ] Test data consistency
- [ ] Test rollback scenarios

---

### Phase 12: Documentation & Migration (Days 26-27)

#### Task 12.1: API Documentation
- [ ] Create comprehensive API documentation
- [ ] Add request/response examples
- [ ] Document error codes
- [ ] Create Postman collection

#### Task 12.2: Migration Guide
- [ ] Document breaking changes
- [ ] Create migration scripts if needed
- [ ] Document rollback procedures
- [ ] Create troubleshooting guide

#### Task 12.3: Code Documentation
- [ ] Add JSDoc to all functions
- [ ] Add inline comments for complex logic
- [ ] Create architecture diagrams
- [ ] Document design decisions

---

### Phase 13: Cleanup & Optimization (Days 28-29)

#### Task 13.1: Remove Old Code
- [ ] Delete old route files from root
- [ ] Delete old monolithic service
- [ ] Delete old monolithic repository
- [ ] Update all imports

#### Task 13.2: Performance Optimization
- [ ] Add database indexes
- [ ] Optimize query patterns
- [ ] Add caching where appropriate
- [ ] Profile slow operations

#### Task 13.3: Code Quality
- [ ] Run ESLint and fix issues
- [ ] Run Prettier and format code
- [ ] Check for unused imports
- [ ] Remove console.logs

---

### Phase 14: Final Review & Deployment (Day 30)

#### Task 14.1: Code Review
- [ ] Self-review all changes
- [ ] Check for security issues
- [ ] Verify error handling
- [ ] Check logging

#### Task 14.2: Testing Review
- [ ] Run full test suite
- [ ] Check code coverage (target: >80%)
- [ ] Fix failing tests
- [ ] Document any known issues

#### Task 14.3: Deployment Preparation
- [ ] Create deployment checklist
- [ ] Prepare rollback plan
- [ ] Document environment variables
- [ ] Create monitoring alerts

---

## Testing Strategy

### Unit Tests (Target: 85% coverage)
- Repository layer: Mock mongoose models
- Service layer: Mock repositories
- Validator layer: Test Zod schemas
- Controller layer: Mock services

### Integration Tests (Target: 75% coverage)
- Test with real test database
- Test full request/response cycle
- Test authentication/authorization
- Test data persistence

### E2E Tests (Target: Key flows covered)
- Test complete user journeys
- Test edge cases
- Test error scenarios
- Test production scenarios

---

## Success Criteria

### Code Quality
- ✅ All tests passing
- ✅ >80% code coverage
- ✅ Zero ESLint errors
- ✅ Zero console.logs in production code
- ✅ All functions documented with JSDoc
- ✅ Proper error handling throughout

### Architecture
- ✅ Clean separation of concerns
- ✅ Single responsibility per file
- ✅ Proper dependency injection
- ✅ No circular dependencies
- ✅ Consistent naming conventions

### Functionality
- ✅ All existing features working
- ✅ No regressions
- ✅ Multi-tenant isolation working
- ✅ Soft-delete working correctly
- ✅ Localization working (en/am)
- ✅ RBAC working correctly

### Performance
- ✅ No performance degradation
- ✅ Proper database indexes
- ✅ Efficient queries
- ✅ Acceptable response times (<500ms for most operations)

---

## Risk Assessment

### High Risk
1. **Model Migration:** Moving models may break existing imports
   - **Mitigation:** Thorough grep search and systematic updates
   
2. **Data Consistency:** Existing data may not match new schema
   - **Mitigation:** Create migration scripts, test thoroughly

3. **Breaking Changes:** API changes may break frontend
   - **Mitigation:** Maintain backward compatibility where possible

### Medium Risk
1. **Test Coverage:** New code may have gaps
   - **Mitigation:** Comprehensive test plan, code review
   
2. **Performance:** Refactoring may introduce inefficiencies
   - **Mitigation:** Performance profiling, benchmarking

### Low Risk
1. **Naming Conflicts:** New names may conflict
   - **Mitigation:** Follow naming conventions strictly

---

## Timeline Estimate

| Phase | Duration | Tasks |
|-------|----------|-------|
| Phase 1: Foundation | 2 days | 2 tasks |
| Phase 2: Models | 2 days | 4 tasks |
| Phase 3: Repositories | 2 days | 5 tasks |
| Phase 4: Services | 3 days | 6 tasks |
| Phase 5: DTOs | 2 days | 2 tasks |
| Phase 6: Validators | 2 days | 5 tasks |
| Phase 7: Controllers | 2 days | 6 tasks |
| Phase 8: Routers | 2 days | 7 tasks |
| Phase 9: Unit Tests | 3 days | 3 tasks |
| Phase 10: Integration Tests | 3 days | 6 tasks |
| Phase 11: E2E Tests | 2 days | 2 tasks |
| Phase 12: Documentation | 2 days | 3 tasks |
| Phase 13: Cleanup | 2 days | 3 tasks |
| Phase 14: Final Review | 1 day | 3 tasks |
| **TOTAL** | **30 days** | **57 tasks** |

---

## Assumptions

1. Existing authentication/authorization middleware can be reused
2. Existing error handling patterns will be maintained
3. Database schema changes are backward compatible
4. Frontend team will be notified of any API changes
5. Staging environment available for testing
6. Code review process in place

---

## Dependencies

### External
- Mongoose (ODM)
- Zod (Validation)
- Express (Web framework)
- Jest/Mocha (Testing)

### Internal
- Auth middleware
- RBAC system
- File management system
- Localization helpers
- Error handlers

---

## Next Steps

1. **Review this specification** and provide feedback
2. **Approve the plan** or request modifications
3. **Begin Phase 1** implementation
4. **Daily progress updates** during implementation
5. **Code reviews** at end of each phase

---

## Questions for Stakeholders

1. Are there any additional requirements not covered?
2. Is the 30-day timeline acceptable?
3. Should we maintain backward compatibility for all APIs?
4. Do we need database migration scripts?
5. What is the acceptable downtime for deployment?
6. Should we implement feature flags for gradual rollout?

---

**Status:** 📋 **AWAITING APPROVAL**  
**Next Action:** Review and approve specification before implementation

---

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Author:** Development Team  
**Approved By:** _Pending_
