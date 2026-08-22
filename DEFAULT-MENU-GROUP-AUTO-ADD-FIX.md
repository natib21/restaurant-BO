# Default Menu Group Auto-Add Issue

**Date:** August 22, 2026  
**Priority:** HIGH  
**Status:** BUG - Menu items not automatically added to default group

---

## Problem Description

When a merchant signs up, a default menu group is created:

```javascript
// From auth.service.js line 305-319
await MenuGroup.create([{
  merchant: merchant._id,
  branches: [mainBranch._id],
  name: {
    en: 'All Items (System Default)',
    am: 'ሁሉም ምግቦች (ነባሪ)',
  },
  description: {
    en: 'Hidden system group for all menu items.',
    am: 'ለሁሉም የምግብ ዝርዝር እቃዎች የተደበቀ የስርዓት ቡድን።',
  },
  visibility: 'always',
  priority: -100,
  isSystemDefault: true,  // ✅ Flag to identify this group
  isAlcoholMenu: false,
  items: [],  // ❌ Empty - items should be added here when created
}])
```

**Expected behavior:** When a menu item is created, it should automatically be added to this default group.

**Actual behavior:** Menu items are created but NOT added to the default group. They remain orphaned until manually added to a menu group.

---

## Root Cause

The system has **TWO menu creation services**:

### 1. Old Service (MenuService.js) - HAS Auto-Add Logic ✅

```javascript
// src/modules/menu/service/MenuService.js lines 411-423

const menu = await MenuRepository.createMenu(menuDataToCreate);

// ✅ Automatically adds to default menu group
await MenuRepository.findOneAndUpdateMenuGroup(
  { merchant: merchantId, isSystemDefault: true },
  {
    $push: {
      items: {
        menu: menu._id,
        sortOrder: Date.now(),
      },
    },
  }
);

return menu;
```

### 2. New Service (MenuItem.service.js) - MISSING Auto-Add Logic ❌

```javascript
// src/modules/menu/service/MenuItem.service.js lines 70-113

static async create(data, merchantId, userId) {
  // ... validation logic ...
  
  // Create menu item
  const menuItem = await MenuItemRepository.create({
    ...data,
    merchant: merchantId,
    createdBy: userId,
    updatedBy: userId
  });

  return menuItem;  // ❌ Returns immediately - never adds to default group
}
```

### Which Service Is Used?

The routes use the **NEW service** (MenuItem.service.js):

```javascript
// src/modules/menu/router/menus.routes.js line 52
router.route('/').post(
  menuController.uploadMenuPhoto,
  menuController.resizeAndProcessImages,
  menuController.createNewMenu  // → Calls MenuItemService.create()
);
```

```javascript
// src/modules/menu/controller/menu.controller.js line 150
const menu = await MenuItemService.create(menuData, merchantId, userId);
// ❌ No logic to add to default group after this
```

---

## Impact

**User Experience:**
- Merchant signs up ✅
- Default menu group created ✅
- Merchant creates menu items ✅
- **Menu items NOT visible in any menu group** ❌
- Merchant must manually:
  1. Create a new menu group, OR
  2. Find the "All Items (System Default)" group
  3. Manually add each item to the group

**Backend Issues:**
- `MenuGroup.items` array remains empty
- Public menu API (`/menus/public`) may not show items if they're not in any visible group
- Staff menu API (`/menus/staff`) may not show items
- Publishing menu groups has no items to publish

---

## Solution

Add the auto-add logic to `MenuItem.service.js` to match the old `MenuService.js` behavior.

### Option 1: Add to MenuItem.service.js (Recommended)

Update the `create` method in `src/modules/menu/service/MenuItem.service.js`:

```javascript
static async create(data, merchantId, userId) {
  if (!merchantId) {
    throw new AppError('Merchant ID is required', 400);
  }

  // ... existing validation logic ...

  // Create menu item
  const menuItem = await MenuItemRepository.create({
    ...data,
    merchant: merchantId,
    createdBy: userId,
    updatedBy: userId
  });

  // ✅ NEW: Add to default menu group
  const MenuGroup = require('../model/MenuGroup.model');
  
  await MenuGroup.findOneAndUpdate(
    { 
      merchant: merchantId, 
      isSystemDefault: true 
    },
    {
      $push: {
        items: {
          menu: menuItem._id,
          sortOrder: Date.now(),
        },
      },
    }
  );

  return menuItem;
}
```

**Pros:**
- Keeps logic in the service layer
- Consistent with old MenuService.js behavior
- Works for all callers of `MenuItem.service.create()`

**Cons:**
- Service has side effect (modifies MenuGroup)
- Tighter coupling between MenuItem and MenuGroup

### Option 2: Add to controller (Alternative)

Update `createNewMenu` in `src/modules/menu/controller/menu.controller.js`:

```javascript
exports.createNewMenu = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  // ... existing image processing ...

  // Create menu item
  const menu = await MenuItemService.create(menuData, merchantId, userId);

  // ✅ NEW: Add to default menu group
  const MenuGroup = require('../model/MenuGroup.model');
  
  await MenuGroup.findOneAndUpdate(
    { 
      merchant: merchantId, 
      isSystemDefault: true 
    },
    {
      $push: {
        items: {
          menu: menu._id,
          sortOrder: Date.now(),
        },
      },
    }
  );

  // ... existing FileAsset updates and response ...
});
```

**Pros:**
- Keeps service layer clean
- Side effect visible in controller

**Cons:**
- Logic must be repeated in any other controller that creates menu items
- Less consistent with domain-driven design

### Option 3: Repository Hook (Advanced)

Add a post-create hook in `MenuItemRepository`:

```javascript
// In MenuItem.repository.js or MenuItem.model.js

MenuItemSchema.post('save', async function(doc) {
  if (this.isNew) {
    const MenuGroup = require('./MenuGroup.model');
    
    await MenuGroup.findOneAndUpdate(
      { 
        merchant: doc.merchant, 
        isSystemDefault: true 
      },
      {
        $push: {
          items: {
            menu: doc._id,
            sortOrder: Date.now(),
          },
        },
      }
    );
  }
});
```

**Pros:**
- Automatic - works everywhere
- No code changes needed in service or controller
- Follows "database trigger" pattern

**Cons:**
- Hidden side effect (harder to debug)
- Hook runs even during seeds/migrations
- Tight coupling at schema level

---

## Recommended Implementation

**Use Option 1** (add to `MenuItem.service.js`) because:
1. Service layer is the right place for business logic
2. Matches existing pattern from old MenuService.js
3. Easy to test
4. Works for all current and future callers

---

## Implementation Steps

### Step 1: Update MenuItem.service.js

```javascript
// File: src/modules/menu/service/MenuItem.service.js

static async create(data, merchantId, userId) {
  if (!merchantId) {
    throw new AppError('Merchant ID is required', 400);
  }

  // Normalize localized fields
  try {
    data.name = normalizeName(data.name);
    if (data.description) {
      data.description = normalizeDescription(data.description);
    }
  } catch (error) {
    throw new AppError(error.message, 400);
  }

  // Validate category exists
  if (data.categoryId) {
    const category = await CategoryRepository.findById(data.categoryId, merchantId, false);
    if (!category) {
      throw new AppError('Category not found', 404);
    }
  } else {
    throw new AppError('categoryId is required', 400);
  }

  // Validate price if provided
  if (data.price !== undefined && data.price < 0) {
    throw new AppError('Price cannot be negative', 400);
  }

  // Validate variants
  if (data.variants && data.variants.length > 0) {
    this.validateVariants(data.variants);
    
    const hasDefault = data.variants.some(v => v.isDefault);
    if (!hasDefault) {
      data.variants[0].isDefault = true;
    }
  } else if (data.price) {
    data.variants = [{
      name: 'Regular',
      price: Number(data.price),
      isDefault: true,
      available: true
    }];
  }

  // Create menu item
  const menuItem = await MenuItemRepository.create({
    ...data,
    merchant: merchantId,
    createdBy: userId,
    updatedBy: userId
  });

  // ✅ ADD THIS: Auto-add to default menu group
  try {
    const MenuGroup = require('../model/MenuGroup.model');
    
    const updateResult = await MenuGroup.findOneAndUpdate(
      { 
        merchant: merchantId, 
        isSystemDefault: true 
      },
      {
        $push: {
          items: {
            menu: menuItem._id,
            sortOrder: Date.now(),
          },
        },
      },
      { new: true }
    );

    // ⚠️ Log warning if default group not found (shouldn't happen in normal flow)
    if (!updateResult) {
      const logger = require('../../../../utils/logger');
      logger.warn('menu_item.create.no_default_group', {
        menuItemId: String(menuItem._id),
        merchantId: String(merchantId),
        message: 'Default menu group not found - item created but not added to any group',
      });
    }
  } catch (error) {
    // ⚠️ Log error but don't fail the request - menu item already created
    const logger = require('../../../../utils/logger');
    logger.error('menu_item.create.default_group_add_failed', {
      menuItemId: String(menuItem._id),
      merchantId: String(merchantId),
      error: error.message,
    });
  }

  return menuItem;
}
```

### Step 2: Test the Fix

**Manual Test:**

```bash
# 1. Sign up a new merchant
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "phone": "+251911111111",
    "email": "test@example.com",
    "business": "Test Restaurant",
    "password": "password123",
    "passwordConfirm": "password123"
  }'

# 2. Login and get token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# 3. Create a menu item
curl -X POST http://localhost:8000/api/v1/menus \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": {"en": "Burger", "am": "በርገር"},
    "description": {"en": "Delicious burger", "am": "ጣፋጭ በርገር"},
    "categoryId": "CATEGORY_ID_HERE",
    "price": 150,
    "type": "food",
    "isVeg": false
  }'

# 4. Check default menu group has the item
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/menu-groups | jq '.data.menuGroups[] | select(.isSystemDefault == true)'

# Expected: items array should contain the menu item ID
```

**Automated Test:**

```javascript
// tests/menu-item-default-group.test.js

const request = require('supertest');
const app = require('../src/app/create-app');
const { connectDatabase } = require('../src/common/database/connection');
const MenuGroup = require('../src/modules/menu/model/MenuGroup.model');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');

describe('MenuItem Auto-Add to Default Group', () => {
  let token;
  let merchantId;
  let categoryId;

  beforeAll(async () => {
    await connectDatabase();
    
    // Sign up and login
    const signupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        firstName: 'Test',
        lastName: 'User',
        phone: '+251911111111',
        email: `test-${Date.now()}@example.com`,
        business: `Test Restaurant ${Date.now()}`,
        password: 'password123',
        passwordConfirm: 'password123',
      });

    token = signupRes.body.token;
    merchantId = signupRes.body.data.user.merchant._id;

    // Create a category
    const categoryRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: { en: 'Test Category', am: 'Test Category' },
      });

    categoryId = categoryRes.body.data.category._id;
  });

  it('should automatically add menu item to default group when created', async () => {
    // Create menu item
    const res = await request(app)
      .post('/api/v1/menus')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: { en: 'Test Item', am: 'Test Item' },
        description: { en: 'Test', am: 'Test' },
        categoryId,
        price: 100,
        type: 'food',
      });

    expect(res.status).toBe(201);
    const menuItemId = res.body.data.menu._id;

    // Check default menu group
    const defaultGroup = await MenuGroup.findOne({
      merchant: merchantId,
      isSystemDefault: true,
    });

    expect(defaultGroup).toBeTruthy();
    expect(defaultGroup.items).toHaveLength(1);
    expect(String(defaultGroup.items[0].menu)).toBe(String(menuItemId));
  });

  it('should add multiple menu items to default group', async () => {
    // Create 3 menu items
    const items = await Promise.all([
      request(app)
        .post('/api/v1/menus')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: { en: 'Item 1', am: 'Item 1' },
          categoryId,
          price: 100,
          type: 'food',
        }),
      request(app)
        .post('/api/v1/menus')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: { en: 'Item 2', am: 'Item 2' },
          categoryId,
          price: 200,
          type: 'food',
        }),
      request(app)
        .post('/api/v1/menus')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: { en: 'Item 3', am: 'Item 3' },
          categoryId,
          price: 300,
          type: 'drink',
        }),
    ]);

    // All should succeed
    items.forEach(res => expect(res.status).toBe(201));

    // Check default group has all items
    const defaultGroup = await MenuGroup.findOne({
      merchant: merchantId,
      isSystemDefault: true,
    });

    expect(defaultGroup.items.length).toBeGreaterThanOrEqual(3);
  });
});
```

### Step 3: Verify Public/Staff Menus Work

After the fix, verify the menu endpoints return items:

```bash
# Staff menu (authenticated)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/menus/staff

# Should return menu items ✅

# Public menu (table session)
curl -H "X-Table-Session-Token: YOUR_SESSION_TOKEN" \
  http://localhost:8000/api/v1/menus/public

# Should return menu items ✅
```

---

## Migration for Existing Data

If merchants already have menu items that were NOT added to the default group, run a migration:

```javascript
// scripts/migrate-add-items-to-default-group.js

const mongoose = require('mongoose');
const { connectDatabase } = require('../src/common/database/connection');
const MenuGroup = require('../src/modules/menu/model/MenuGroup.model');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');

async function migrateExistingItems() {
  await connectDatabase();

  // Get all merchants
  const merchants = await mongoose.model('Merchant').find({}).select('_id');

  console.log(`Found ${merchants.length} merchants`);

  for (const merchant of merchants) {
    const merchantId = merchant._id;

    // Get default menu group
    const defaultGroup = await MenuGroup.findOne({
      merchant: merchantId,
      isSystemDefault: true,
    });

    if (!defaultGroup) {
      console.log(`⚠️  No default group for merchant ${merchantId}`);
      continue;
    }

    // Get existing item IDs in default group
    const existingItemIds = new Set(
      defaultGroup.items.map(item => String(item.menu))
    );

    // Get all menu items for this merchant
    const allItems = await MenuItem.find({
      merchant: merchantId,
      deletedAt: null,
    }).select('_id');

    const itemsToAdd = allItems.filter(
      item => !existingItemIds.has(String(item._id))
    );

    if (itemsToAdd.length === 0) {
      console.log(`✅ Merchant ${merchantId}: All items already in default group`);
      continue;
    }

    // Add missing items
    const newItems = itemsToAdd.map(item => ({
      menu: item._id,
      sortOrder: Date.now(),
    }));

    await MenuGroup.findByIdAndUpdate(defaultGroup._id, {
      $push: { items: { $each: newItems } },
    });

    console.log(`✅ Merchant ${merchantId}: Added ${itemsToAdd.length} items to default group`);
  }

  console.log('✅ Migration complete');
  process.exit(0);
}

migrateExistingItems().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
```

Run the migration:

```bash
node scripts/migrate-add-items-to-default-group.js
```

---

## Testing Checklist

- [ ] New menu item created → appears in default group
- [ ] Multiple menu items created → all appear in default group
- [ ] Staff menu API returns items
- [ ] Public menu API returns items
- [ ] Menu publishing includes items from default group
- [ ] Migration script adds existing orphaned items
- [ ] No duplicate items in default group

---

## Status

**Current:** ❌ BUG - Menu items NOT auto-added  
**After fix:** ✅ Menu items auto-added to default group  
**Migration:** ⚠️ NEEDED for existing data

---

## Related Files

- `src/modules/auth/auth.service.js` - Creates default group on signup
- `src/modules/menu/service/MenuItem.service.js` - **NEEDS FIX** - Add auto-add logic
- `src/modules/menu/service/MenuService.js` - Old service with working auto-add (reference)
- `src/modules/menu/controller/menu.controller.js` - Controller that calls service
- `src/modules/menu/router/menus.routes.js` - Routes configuration

