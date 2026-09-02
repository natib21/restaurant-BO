# Dual-Source Ingredients Implementation - COMPLETE ✅

**Date:** August 31, 2026  
**Status:** Implemented and Ready

---

## What Was Implemented

### 1. ✅ Added staticIngredients Field to MenuItem Model

**File:** `src/modules/menu/model/MenuItem.model.js`

**Changes:**
- Added `staticIngredientSchema` (lines 79-93)
- Added `staticIngredients` field to menuItemSchema (lines 233-238)

**Schema Structure:**
```javascript
staticIngredients: [
  {
    name: String,      // e.g., "Chicken Breast"
    quantity: Number,  // e.g., 200
    unit: String       // e.g., "g" (kg, g, liter, ml, pieces, cups, tbsp, tsp, pinch, boxes, cans)
  }
]
```

---

### 2. ✅ Updated getPublicMenu Service

**File:** `src/modules/menu/service/MenuGroup.service.js`

**Changes:**
1. Added `staticIngredients` to populate select (line 138)
2. Added merchant inventory feature check (lines 148-150)
3. Updated ingredient resolution logic (line 165)
4. Added `resolveMenuIngredients()` helper method (lines 759-789)

**Logic Flow:**
```
1. Check if merchant.features.inventory.enabled
   ↓
2a. IF TRUE → Get ingredients from Recipe table
   - Populate Recipe
   - Populate Recipe.ingredients.ingredient (Ingredient table)
   - Return: [{ name, quantity, unit }]
   ↓
2b. IF FALSE → Get from MenuItem.staticIngredients
   - Return: staticIngredients array
```

---

## How It Works

### Scenario 1: Merchant WITH Inventory Module

```javascript
// MenuItem has Recipe reference
{
  _id: "6a95...",
  name: "Grilled Chicken",
  recipe: "6a94...",           // ← Links to Recipe
  staticIngredients: []         // Empty (not needed)
}

// Recipe table
{
  _id: "6a94...",
  menuItem: "6a95...",
  ingredients: [
    {
      ingredient: "6a93...",  // References Ingredient table
      quantity: 200,
      unit: "g"
    }
  ]
}

// Ingredient table
{
  _id: "6a93...",
  name: "Chicken Breast",
  currentStock: 5000,
  unit: "g"
}

// ✅ API Response
{
  "ingredients": [
    {
      "name": "Chicken Breast",  // From Ingredient table
      "quantity": 200,
      "unit": "g"
    }
  ]
}
```

---

### Scenario 2: Merchant WITHOUT Inventory Module

```javascript
// MenuItem has static ingredients
{
  _id: "6a95...",
  name: "Grilled Chicken",
  recipe: null,                 // No recipe
  staticIngredients: [          // ← Static list for display
    {
      name: "Chicken Breast",
      quantity: 200,
      unit: "g"
    },
    {
      name: "Olive Oil",
      quantity: 2,
      unit: "tbsp"
    }
  ]
}

// ✅ API Response
{
  "ingredients": [
    {
      "name": "Chicken Breast",  // From staticIngredients
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

## Public Menu API Response (Enhanced)

### Complete Response Structure

```json
GET /api/v1/menu/public

{
  "status": "success",
  "data": {
    "restaurant": "My Restaurant",
    "generatedAt": "2026-08-31T09:00:00.000Z",
    "totalItems": 13,
    "tableNumber": "T-01",
    "menus": [
      {
        "id": "6a9533328bc68bc64ec6b679",
        "name": "Grilled Chicken Breast",
        "description": "Juicy grilled chicken breast with roasted vegetables and mashed potatoes",
        
        // ✅ Full image path (complete URL)
        "image": "http://localhost:8000/api/v1/files/6a953c7f6c844d03b34010cb/content",
        
        "price": 245,
        "variants": [
          {
            "name": "regular",
            "price": 245,
            "available": true,
            "isDefault": true
          }
        ],
        
        // ✅ Food type for filtering
        "type": "food",
        
        // ✅ Dietary information
        "isVeg": false,
        "isSpicy": false,
        "isAlcoholic": false,
        
        // ✅ Prep time estimate
        "prepTime": "15-25 min",
        
        // ✅ DUAL-SOURCE INGREDIENTS (from Recipe OR staticIngredients)
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
          },
          {
            "name": "Garlic",
            "quantity": 3,
            "unit": "pieces"
          }
        ],
        
        // ✅ Allergen warnings
        "allergens": ["dairy"],
        
        // ✅ Rating
        "rating": 4.5,
        
        // ✅ Menu group name
        "displayedIn": "Lunch Specials"
      }
    ],
    "specialOffers": [
      {
        "id": "6a9533328bc68bc64ec6b684",
        "name": "Beyaynetu (Veggie Combo)",
        "image": "http://localhost:8000/api/v1/files/6a953c7f6c844d03b34010cb/content",
        "price": 600,
        "tag": "chef-special"
      }
    ]
  }
}
```

---

## Customer-Facing Information Included

| Information | Field | Source | Purpose |
|-------------|-------|--------|---------|
| **Item Name** | `name` | MenuItem | Display in menu |
| **Description** | `description` | MenuItem | Show details |
| **Image** | `image` | FileAsset (full URL) | Display photo |
| **Price** | `price` | MenuItem/variant | Show cost |
| **Size Options** | `variants[]` | MenuItem | Size selector |
| **Food Type** | `type` | MenuItem | Filter (food/drink) |
| **Vegetarian** | `isVeg` | MenuItem | Dietary badge |
| **Spicy** | `isSpicy` | MenuItem | Spicy icon |
| **Alcoholic** | `isAlcoholic` | MenuItem | Age verification |
| **Prep Time** | `prepTime` | MenuItem | Time estimate |
| **Ingredients** | `ingredients[]` | Recipe OR staticIngredients | Allergen info |
| **Allergens** | `allergens[]` | MenuItem | Warning labels |
| **Rating** | `rating` | MenuItem | Star rating |
| **Menu Group** | `displayedIn` | MenuGroup | Categorization |

---

## Migration Strategy

### For New Merchants

**Option 1: With Inventory Module**
- Create Recipes with Ingredient references
- Leave `staticIngredients` empty
- Ingredients pulled from Ingredient table

**Option 2: Without Inventory Module**
- Add `staticIngredients` to each MenuItem
- Example:
```javascript
staticIngredients: [
  { name: "Chicken", quantity: 200, unit: "g" },
  { name: "Rice", quantity: 150, unit: "g" }
]
```

### For Existing Merchants

**No action required** - backward compatible:
- Merchants with Recipes: Continue working (pulls from Recipe)
- Merchants without: Add staticIngredients as needed

### Optional: Backfill Script

```javascript
// scripts/backfill-static-ingredients.js

const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const Recipe = require('../models/Recipe');

async function backfillStaticIngredients() {
  const items = await MenuItem.find({ 
    recipe: { $exists: true },
    staticIngredients: { $size: 0 }
  });
  
  for (const item of items) {
    const recipe = await Recipe.findById(item.recipe)
      .populate('ingredients.ingredient', 'name');
    
    if (recipe) {
      item.staticIngredients = recipe.ingredients.map(ing => ({
        name: ing.ingredient.name,
        quantity: ing.quantity,
        unit: ing.unit
      }));
      
      await item.save();
      console.log(`✅ Backfilled: ${item.name.en}`);
    }
  }
}
```

---

## Admin UI Updates Needed

### Menu Item Form

```html
<form>
  <h3>Ingredients</h3>
  
  <!-- IF merchant has inventory module -->
  <div v-if="merchantHasInventory">
    <label>Link to Recipe</label>
    <select v-model="menuItem.recipe">
      <option v-for="recipe in recipes" :value="recipe._id">
        {{ recipe.name }}
      </option>
    </select>
  </div>
  
  <!-- IF merchant does NOT have inventory module -->
  <div v-else>
    <label>Static Ingredients (for display only)</label>
    <div v-for="(ing, index) in menuItem.staticIngredients" :key="index">
      <input v-model="ing.name" placeholder="Ingredient name" />
      <input v-model.number="ing.quantity" type="number" placeholder="Qty" />
      <select v-model="ing.unit">
        <option value="g">grams</option>
        <option value="kg">kilograms</option>
        <option value="pieces">pieces</option>
        <option value="tbsp">tablespoons</option>
        <!-- ... -->
      </select>
      <button @click="removeIngredient(index)">Remove</button>
    </div>
    <button @click="addIngredient()">+ Add Ingredient</button>
  </div>
</form>
```

---

## Testing

### Test Case 1: Inventory Enabled
```bash
# 1. Enable inventory for merchant
curl -X PATCH http://localhost:8000/api/v1/merchants/6a95.../
  -d '{ "features": { "inventory": { "enabled": true } } }'

# 2. Create menu item with Recipe
# (Recipe references Ingredient table)

# 3. Get public menu
curl http://localhost:8000/api/v1/menu/public

# ✅ Expected: ingredients from Recipe + Ingredient tables
```

### Test Case 2: Inventory Disabled
```bash
# 1. Disable inventory for merchant
curl -X PATCH http://localhost:8000/api/v1/merchants/6a95.../
  -d '{ "features": { "inventory": { "enabled": false } } }'

# 2. Add staticIngredients to MenuItem
curl -X PATCH http://localhost:8000/api/v1/menu/items/6a95.../
  -d '{
    "staticIngredients": [
      { "name": "Chicken", "quantity": 200, "unit": "g" }
    ]
  }'

# 3. Get public menu
curl http://localhost:8000/api/v1/menu/public

# ✅ Expected: ingredients from staticIngredients
```

---

## Benefits

✅ **Flexibility** - Works with or without inventory module  
✅ **Backward Compatible** - No breaking changes  
✅ **Customer Experience** - Ingredients always visible  
✅ **Performance** - Static ingredients don't need DB lookups  
✅ **Simple Migration** - Just add field, no data loss  
✅ **Clear Separation** - Recipe for tracking, static for display  

---

## Summary

| What | Status |
|------|--------|
| staticIngredients field added | ✅ Done |
| getPublicMenu updated | ✅ Done |
| Dual-source logic implemented | ✅ Done |
| Image full path included | ✅ Done (already working) |
| Customer info complete | ✅ Done |
| Backward compatible | ✅ Yes |
| Migration needed | ❌ No (optional backfill) |
| Admin UI updates | ⏳ Recommended |

**Ready for production!** 🚀

