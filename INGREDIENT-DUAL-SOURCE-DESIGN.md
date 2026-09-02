# Ingredient Dual-Source Implementation

**Problem:** Menu items need to show ingredients in two scenarios:
1. **Inventory Module ENABLED:** Get ingredients from Recipe + Ingredient tables (for tracking)
2. **Inventory Module DISABLED:** Get ingredients from static field on MenuItem (for display only)

---

## Current Implementation

### MenuItem Model
```javascript
// MISSING: Static ingredients field for non-inventory merchants
{
  name: "Grilled Chicken",
  recipe: ObjectId("..."),  // ← Links to Recipe (inventory tracking)
  // ❌ NO static ingredient list for display
}
```

### Recipe Model
```javascript
{
  menuItem: ObjectId("..."),
  merchant: ObjectId("..."),
  ingredients: [
    {
      ingredient: ObjectId("ingredient_id"),  // ← References Ingredient table
      quantity: 200,
      unit: "g"
    }
  ]
}
```

### Current getPublicMenu Logic
```javascript
ingredients: menu.recipe?.ingredients || [],  // ← Only gets from Recipe
```

**Problem:** If merchant doesn't use inventory, `recipe` is null → no ingredients shown

---

## Proposed Solution

### 1. Add Static Ingredients Field to MenuItem

```javascript
// MenuItem.model.js

const staticIngredientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  quantity: {
    type: Number,
    min: 0,
  },
  unit: {
    type: String,
    enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'cups', 'tbsp', 'tsp'],
  }
}, { _id: false });

const menuItemSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // ✅ NEW: Static ingredients for display (when no inventory module)
  staticIngredients: {
    type: [staticIngredientSchema],
    default: [],
    comment: 'For merchants without inventory module - display-only ingredient list'
  },
  
  // Existing recipe link (for inventory tracking)
  recipe: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Recipe',
    comment: 'For merchants with inventory module - actual ingredient tracking'
  },
  
  // ... other fields ...
});
```

---

## 2. Update getPublicMenu Logic

```javascript
// MenuGroup.service.js - getPublicMenu method

// Current (line 176):
ingredients: menu.recipe?.ingredients || [],

// NEW:
ingredients: await this.resolveIngredients(menu, merchantId),
```

### Add Helper Method

```javascript
/**
 * Resolve ingredients from two sources:
 * 1. If inventory module enabled: Get from Recipe → Ingredient table
 * 2. If inventory module disabled: Get from MenuItem.staticIngredients
 */
static async resolveIngredients(menu, merchantId) {
  // Check if merchant has inventory module enabled
  const merchant = await Merchant.findById(merchantId).select('features');
  const hasInventoryModule = merchant?.features?.inventory?.enabled;
  
  if (hasInventoryModule && menu.recipe) {
    // Inventory enabled: Get from Recipe + populate Ingredient names
    const Recipe = require('../../../models/Recipe');
    const recipe = await Recipe.findById(menu.recipe)
      .populate('ingredients.ingredient', 'name unit');
    
    if (!recipe) return [];
    
    return recipe.ingredients.map(ing => ({
      name: ing.ingredient?.name || 'Unknown',
      quantity: ing.quantity,
      unit: ing.unit
    }));
  } else {
    // Inventory disabled: Get from static field
    return menu.staticIngredients || [];
  }
}
```

---

## 3. Response Format (Consistent)

Both sources return same format:

```json
{
  "ingredients": [
    {
      "name": "Chicken Breast",
      "quantity": 200,
      "unit": "g"
    },
    {
      "name": "Olive Oil",
      "quantity": 2,
      "unit": "tbsp"
    }
  ]
}
```

---

## Implementation Steps

### Step 1: Update MenuItem Model

Add `staticIngredients` field to schema:

```javascript
// File: src/modules/menu/model/MenuItem.model.js

// After line 77 (after menuIngredientSchema), add:

const staticIngredientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  quantity: {
    type: Number,
    min: 0,
  },
  unit: {
    type: String,
    enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'cups', 'tbsp', 'tsp', 'pinch'],
  }
}, { _id: false });

// Then in menuItemSchema (around line 200), add:

staticIngredients: {
  type: [staticIngredientSchema],
  default: [],
},
```

### Step 2: Add Merchant Feature Check

Add to Merchant model (if not exists):

```javascript
// models/merchantModel.js

features: {
  inventory: {
    enabled: { type: Boolean, default: false },
  },
  // ... other features
}
```

### Step 3: Update getPublicMenu Service

```javascript
// File: src/modules/menu/service/MenuGroup.service.js

// Replace line 176:
ingredients: menu.recipe?.ingredients || [],

// With:
ingredients: await MenuGroupService.resolveMenuIngredients(menu, merchantId),
```

### Step 4: Add Helper Method

```javascript
// File: src/modules/menu/service/MenuGroup.service.js

/**
 * Resolve ingredients from Recipe (if inventory enabled) or static field
 */
static async resolveMenuIngredients(menu, merchantId) {
  // Check if merchant has inventory module
  const Merchant = require('../../../../models/merchantModel');
  const merchant = await Merchant.findById(merchantId)
    .select('features')
    .lean();
  
  const hasInventory = merchant?.features?.inventory?.enabled;
  
  if (hasInventory && menu.recipe) {
    // Get from Recipe + Ingredient tables
    const Recipe = require('../../../../models/Recipe');
    const recipe = await Recipe.findById(menu.recipe)
      .populate('ingredients.ingredient', 'name')
      .lean();
    
    if (!recipe) return [];
    
    return recipe.ingredients.map(ing => ({
      name: ing.ingredient?.name || 'Unknown',
      quantity: ing.quantity,
      unit: ing.unit
    }));
  }
  
  // Fall back to static ingredients (or empty array)
  return menu.staticIngredients || [];
}
```

---

## Migration Strategy

### For Existing Merchants

**Option 1: Keep As-Is (Recommended)**
- Merchants with inventory: Continue using Recipe
- Merchants without inventory: Add staticIngredients to menu items

**Option 2: Backfill Static Ingredients**
- For merchants with inventory: Copy Recipe ingredients to staticIngredients
- Provides fallback if inventory module disabled later

### Migration Script (Optional)

```javascript
// scripts/migrate-static-ingredients.js

const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const Recipe = require('../models/Recipe');

async function migrateStaticIngredients() {
  const menuItems = await MenuItem.find({ recipe: { $exists: true } });
  
  for (const item of menuItems) {
    const recipe = await Recipe.findById(item.recipe)
      .populate('ingredients.ingredient', 'name');
    
    if (recipe) {
      item.staticIngredients = recipe.ingredients.map(ing => ({
        name: ing.ingredient.name,
        quantity: ing.quantity,
        unit: ing.unit
      }));
      
      await item.save();
    }
  }
  
  console.log(`Migrated ${menuItems.length} menu items`);
}
```

---

## Admin UI Considerations

### Menu Item Creation Form

```
┌─ Ingredients ────────────────────┐
│                                  │
│ ○ Link to Recipe (Inventory)    │
│   Recipe: [Dropdown]             │
│                                  │
│ ○ Static List (Display Only)    │
│   Ingredient 1:                  │
│     Name: [________]             │
│     Qty:  [___] Unit: [dropdown] │
│   [+ Add Ingredient]             │
│                                  │
└──────────────────────────────────┘
```

### Logic
```javascript
if (merchant.features.inventory.enabled) {
  // Show Recipe dropdown
  // Auto-populate staticIngredients from Recipe (optional)
} else {
  // Show static ingredient input fields
}
```

---

## Benefits

✅ **Flexibility:** Works with or without inventory module
✅ **No Breaking Changes:** Existing Recipe-based ingredients still work
✅ **Simple Migration:** Just add field, no data loss
✅ **Performance:** Static ingredients don't need Recipe/Ingredient lookups
✅ **Customer Experience:** Ingredients always visible in menu

---

## Example Response

### Merchant WITH Inventory
```json
{
  "id": "6a9533328bc68bc64ec6b679",
  "name": "Grilled Chicken Breast",
  "ingredients": [
    { "name": "Chicken Breast", "quantity": 200, "unit": "g" },
    { "name": "Olive Oil", "quantity": 2, "unit": "tbsp" },
    { "name": "Garlic", "quantity": 3, "unit": "pieces" }
  ],
  "source": "recipe"  // ← From Recipe table
}
```

### Merchant WITHOUT Inventory
```json
{
  "id": "6a9533328bc68bc64ec6b67b",
  "name": "Pasta Carbonara",
  "ingredients": [
    { "name": "Pasta", "quantity": 200, "unit": "g" },
    { "name": "Bacon", "quantity": 100, "unit": "g" },
    { "name": "Parmesan", "quantity": 50, "unit": "g" },
    { "name": "Eggs", "quantity": 2, "unit": "pieces" }
  ],
  "source": "static"  // ← From MenuItem.staticIngredients
}
```

---

## Testing

### Test Case 1: Inventory Enabled
```javascript
// Merchant has inventory module
merchant.features.inventory.enabled = true;

// Create menu item with Recipe
const menuItem = await MenuItem.create({
  name: "Test Dish",
  recipe: recipeId,  // Links to Recipe with ingredients
  staticIngredients: []  // Empty (not needed)
});

// API response should show ingredients from Recipe
const response = await getPublicMenu();
expect(response.data.menus[0].ingredients).toHaveLength(3);
expect(response.data.menus[0].ingredients[0].name).toBe("Chicken");
```

### Test Case 2: Inventory Disabled
```javascript
// Merchant has NO inventory module
merchant.features.inventory.enabled = false;

// Create menu item with static ingredients
const menuItem = await MenuItem.create({
  name: "Test Dish",
  recipe: null,  // No recipe
  staticIngredients: [
    { name: "Chicken", quantity: 200, unit: "g" },
    { name: "Rice", quantity: 150, unit: "g" }
  ]
});

// API response should show static ingredients
const response = await getPublicMenu();
expect(response.data.menus[0].ingredients).toHaveLength(2);
expect(response.data.menus[0].ingredients[0].name).toBe("Chicken");
```

---

## Summary

| Scenario | Ingredient Source | Data Structure |
|----------|------------------|----------------|
| Inventory ON | Recipe → Ingredient table | Dynamic (tracked) |
| Inventory OFF | MenuItem.staticIngredients | Static (display only) |

**Both return same format to frontend** → Customer sees ingredients either way!

