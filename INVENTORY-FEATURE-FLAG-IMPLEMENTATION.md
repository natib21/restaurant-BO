# Inventory Module Feature Flag Implementation

## Overview

Implemented a **feature-flagged inventory system** that allows merchants to operate with or without advanced inventory tracking based on their subscription tier.

---

## 🎯 **Business Logic**

### **Two-Tier System:**

| Feature | **Basic Plan** (No Inventory) | **Premium Plan** (With Inventory) |
|---------|-------------------------------|-----------------------------------|
| **Menu Items** | ✅ Yes | ✅ Yes |
| **Ingredients Field** | ✅ Array of strings (display only) | ✅ Array of strings (display) |
| **Orders** | ✅ Yes | ✅ Yes |
| **Recipe Required** | ❌ No | ✅ Yes (or order fails) |
| **Inventory Deduction** | ❌ No | ✅ Yes (automatic) |
| **COGS Calculation** | Simple (`costPrice` field) | Accurate (from recipe) |
| **Stock Alerts** | ❌ No | ✅ Yes |
| **Purchase Orders** | ❌ No | ✅ Yes |

---

## 📋 **How It Works**

### **Feature Flag Check**

```javascript
// Merchant model already has feature flags
merchant.hasFeature('inventory') // Returns true/false

// Feature structure in Merchant
{
  features: {
    optional: {
      inventory: {
        enabled: true  // ← Controls inventory module
      }
    }
  }
}
```

### **Order Placement Flow**

```javascript
// When order is placed:

1. Check merchant.hasFeature('inventory')

2a. If FALSE (No inventory module):
   - Skip recipe lookup
   - Skip inventory deduction
   - Use menuItem.costPrice for COGS
   - Order succeeds ✅

2b. If TRUE (Inventory module enabled):
   - Lookup recipe (REQUIRED)
   - If no recipe → order FAILS ❌
   - Calculate COGS from recipe ingredients
   - Deduct inventory automatically
   - Order succeeds ✅
```

---

## 🔧 **Implementation Details**

### **1. MenuItem Model**

Added `costPrice` field for simple COGS:

```javascript
// src/modules/menu/model/MenuItem.model.js

{
  name: "Beef Steak",
  price: 200,           // Selling price
  costPrice: 80,        // ← NEW: Simple COGS (for non-inventory merchants)
  
  // Informational ingredients (array of strings for display)
  ingredients: ["beef", "salt", "pepper", "olive oil"],
  
  // Recipe (only used if inventory module enabled)
  recipe: {
    ingredients: [
      { ingredient: ObjectId("..."), quantity: 300, unit: "g" }
    ]
  }
}
```

### **2. InventoryService**

Modified `getIngredientUsageForMenuItem()`:

```javascript
// src/modules/inventory/service/InventoryService.js

static async getIngredientUsageForMenuItem(menuItemId, merchantId) {
  // Check feature flag
  const merchant = await Merchant.findById(merchantId);
  const hasInventoryModule = merchant.hasFeature('inventory');

  // If no inventory module: return empty (no deduction)
  if (!hasInventoryModule) {
    logger.info('inventory.recipe.skipped', {
      reason: 'Inventory module not enabled'
    });
    return []; // Empty array → no inventory deduction
  }

  // If inventory module enabled: recipe is REQUIRED
  const recipe = await InventoryRepository.findActiveRecipeForMenuItem(...);

  if (!recipe) {
    throw new Error(
      'Inventory module is enabled but no recipe found. ' +
      'Please create a recipe or disable inventory module.'
    );
  }

  return recipe.items.map(...);
}
```

### **3. OrderService**

Modified `calculateMenuItemCost()`:

```javascript
// src/modules/order/service/OrderService.js

static async calculateMenuItemCost(menuItem, merchantId) {
  const merchant = await Merchant.findById(merchantId);
  const hasInventoryModule = merchant.hasFeature('inventory');

  // No inventory module → use simple costPrice
  if (!hasInventoryModule) {
    return menuItem.costPrice || 0;
  }

  // Inventory module enabled → calculate from recipe
  if (!menuItem.recipe || !menuItem.recipe.ingredients.length) {
    logger.warn('No recipe found, falling back to costPrice');
    return menuItem.costPrice || 0;
  }

  // Calculate from ingredient costs
  const ingredients = await Ingredient.find({...});
  let totalCost = 0;
  for (const ri of menuItem.recipe.ingredients) {
    totalCost += ri.quantity * ingredient.costPerUnit;
  }

  return totalCost;
}
```

---

## 📊 **Data Examples**

### **Basic Merchant (No Inventory)**

```javascript
// Merchant
{
  _id: "merchant123",
  businessName: "Joe's Diner",
  features: {
    optional: {
      inventory: { enabled: false }  // ← No inventory
    }
  }
}

// Menu Item
{
  _id: "menuitem456",
  name: "Burger",
  price: 100,
  costPrice: 35,  // ← Simple COGS
  ingredients: ["beef patty", "bun", "lettuce"], // Just text
  // No recipe needed
}

// Order Flow:
// 1. Order placed ✅
// 2. COGS = 35 (from costPrice)
// 3. No inventory deduction
// 4. Order succeeds
```

### **Premium Merchant (With Inventory)**

```javascript
// Merchant
{
  _id: "merchant789",
  businessName: "Gourmet Restaurant",
  features: {
    optional: {
      inventory: { enabled: true }  // ← Inventory enabled
    }
  }
}

// Menu Item
{
  _id: "menuitem101",
  name: "Burger",
  price: 100,
  costPrice: 35,  // Fallback if recipe missing
  ingredients: ["beef patty", "bun", "lettuce"], // Display text
  
  // Recipe REQUIRED for orders
  recipe: {
    ingredients: [
      { ingredient: ObjectId("beef-id"), quantity: 150, unit: "g" },
      { ingredient: ObjectId("bun-id"), quantity: 1, unit: "piece" }
    ]
  }
}

// Recipe Document (Inventory System)
{
  menuItem: ObjectId("menuitem101"),
  ingredients: [
    { 
      ingredient: ObjectId("beef-id"), 
      quantity: 150, 
      unit: "g",
      // Ingredient has costPerUnit: 0.20/g → 150 * 0.20 = 30
    },
    { 
      ingredient: ObjectId("bun-id"), 
      quantity: 1, 
      unit: "piece",
      // Ingredient has costPerUnit: 5/piece → 1 * 5 = 5
    }
  ]
  // Total COGS = 35
}

// Order Flow:
// 1. Order placed
// 2. Recipe lookup (REQUIRED) ✅
// 3. COGS = 35 (from recipe calculation)
// 4. Deduct 150g beef, 1 bun from inventory
// 5. Order succeeds ✅

// If no recipe exists:
// 1. Order placed
// 2. Recipe lookup → NOT FOUND
// 3. ❌ Error: "Inventory module enabled but no recipe found"
// 4. Order FAILS
```

---

## 🔄 **Migration Path**

### **Merchant Upgrades from Basic → Premium**

```javascript
// Before: Basic merchant
merchant.features.optional.inventory.enabled = false;
// - Orders work
// - COGS from costPrice
// - No inventory tracking

// Merchant upgrades to Premium
merchant.features.optional.inventory.enabled = true;
// - Existing orders still work (costPrice fallback)
// - NEW orders require recipes
// - Admin must create recipes for menu items
// - Once recipes exist, accurate COGS + inventory deduction
```

### **Admin Workflow After Enabling Inventory**

1. ✅ Enable inventory module: `merchant.features.optional.inventory.enabled = true`
2. ✅ Create **Ingredient** documents (beef, salt, pepper, etc.)
3. ✅ Create **Recipe** documents linking menu items to ingredients
4. ✅ Set `costPerUnit` on each ingredient
5. ✅ Test: Place order → Recipe found → Inventory deducted ✅

---

## 🚨 **Error Messages**

### **When Inventory Module Enabled but No Recipe**

```json
{
  "success": false,
  "message": "Inventory module is enabled but no active recipe found for menu item 6a8c25a0615898358f0eb407. Please create a recipe in the inventory system or disable the inventory module.",
  "errors": [...]
}
```

**Solution:**
1. Create a recipe for the menu item, OR
2. Disable inventory module for the merchant

---

## 📝 **Files Modified**

### **1. MenuItem Model**
**File:** `src/modules/menu/model/MenuItem.model.js`
- ✅ Added `costPrice` field (Number, default 0)

### **2. InventoryService**
**File:** `src/modules/inventory/service/InventoryService.js`
- ✅ Modified `getIngredientUsageForMenuItem()` to check feature flag
- ✅ Returns empty array if no inventory module
- ✅ Throws error if inventory enabled but no recipe

### **3. OrderService**
**File:** `src/modules/order/service/OrderService.js`
- ✅ Modified `calculateMenuItemCost()` to check feature flag
- ✅ Uses `costPrice` if no inventory module
- ✅ Calculates from recipe if inventory enabled
- ✅ Fallback to `costPrice` if recipe missing

### **4. Merchant Model**
**File:** `models/merchantModel.js`
- ✅ Already has `features.optional.inventory.enabled` field
- ✅ Already has `hasFeature('inventory')` method
- ✅ No changes needed

---

## ✅ **Testing Checklist**

### **Scenario 1: Basic Merchant (No Inventory)**
- [ ] Create merchant with `features.optional.inventory.enabled = false`
- [ ] Create menu item with `costPrice = 50`
- [ ] Place order ✅
- [ ] Verify: COGS = 50 (from costPrice)
- [ ] Verify: No inventory deduction
- [ ] Verify: Order succeeds

### **Scenario 2: Premium Merchant (With Inventory, Has Recipe)**
- [ ] Create merchant with `features.optional.inventory.enabled = true`
- [ ] Create ingredients (beef, salt, etc.)
- [ ] Create recipe linking menu item to ingredients
- [ ] Place order ✅
- [ ] Verify: COGS calculated from recipe
- [ ] Verify: Inventory deducted
- [ ] Verify: Order succeeds

### **Scenario 3: Premium Merchant (With Inventory, No Recipe)**
- [ ] Create merchant with `features.optional.inventory.enabled = true`
- [ ] Create menu item (no recipe)
- [ ] Place order ❌
- [ ] Verify: Error message about missing recipe
- [ ] Verify: Order fails

### **Scenario 4: Merchant Upgrades**
- [ ] Start with inventory disabled
- [ ] Place order → succeeds with costPrice
- [ ] Enable inventory module
- [ ] Place order → fails (no recipe)
- [ ] Create recipe
- [ ] Place order → succeeds with accurate COGS

---

## 🎯 **Benefits**

1. ✅ **Flexible Pricing**: Basic plan merchants can start without inventory complexity
2. ✅ **Gradual Upgrade**: Merchants can upgrade to inventory when ready
3. ✅ **Accurate COGS**: Premium merchants get real-time ingredient cost tracking
4. ✅ **Stock Management**: Automatic inventory deduction prevents overselling
5. ✅ **Business Intelligence**: Track profitability per menu item accurately

---

## 📅 **Implementation Date**
2026-08-22

## ✅ **Status**
**COMPLETE** - Feature-flagged inventory system ready for testing
