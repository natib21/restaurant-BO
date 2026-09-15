# CONTRADICTION RESOLVED: Recipe Schema Has TWO Active Implementations

## THE CONTRADICTION

The inventory architecture document shows TWO different versions of Recipe item schema, and **BOTH ARE CURRENTLY ACTIVE IN THE CODEBASE**:

### Version A: ObjectId-Based (ingredient field)
```javascript
items: [
  {
    ingredient: ObjectId,  // Direct reference to Ingredient
    quantity: 0.2,
    unit: 'kg'
  }
]
```

### Version B: Name-Based (ingredientName field)
```javascript
items: [
  {
    ingredientName: String,  // Name reference to Ingredient
    quantity: 0.2,
    unit: 'kg'
  }
]
```

---

## ACTUAL CURRENT RECIPE SCHEMA (models/Recipe.js)

**ONLY Version B is in the schema:**

```javascript
const recipeItemSchema = new Schema(
  {
    // ✅ CHANGED: Store ingredient name instead of ObjectId for branch-level isolation
    // This allows the same recipe to work across branches with their own ingredient stocks
    ingredientName: {
      type: String,
      required: true,
      comment: 'Name of the ingredient (e.g., "Chicken", "Tomato") — resolved by merchant+name+unit at runtime'
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
      enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'boxes', 'cans'],
      comment: 'Must match the ingredient stock unit'
    },
  },
  { _id: false }
);
```

**File:** `models/Recipe.js` (lines 6-25)

**The schema has NO `ingredient` field anymore.**

---

## ACTUAL getIngredientUsageForMenuItem() FUNCTION

**File:** `src/modules/inventory/service/InventoryService.js` (lines 318-351)

```javascript
static async getIngredientUsageForMenuItem(menuItemId, merchantId) {
  // Check if merchant has inventory module enabled
  const Merchant = require('../../../../models/merchantModel');
  const merchant = await Merchant.findById(merchantId);

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }

  const hasInventoryModule = merchant.hasFeature('inventory');

  // If inventory module is disabled, return empty (no inventory deduction)
  if (!hasInventoryModule) {
    logger.info('inventory.recipe.skipped', {
      menuItemId,
      merchantId,
      reason: 'Inventory module not enabled for merchant',
    });
    return []; // No ingredients to deduct
  }

  // Inventory module is enabled - recipe is REQUIRED
  const recipe = await InventoryRepository.findActiveRecipeForMenuItem(menuItemId, merchantId);

  if (!recipe || !recipe.items || recipe.items.length === 0) {
    throw new Error(
      `Inventory module is enabled but no active recipe found for menu item ${menuItemId}. ` +
      `Please create a recipe in the inventory system or disable the inventory module.`
    );
  }

  return recipe.items.map(item => ({
    ingredientId: item.ingredient._id,        // ← BUG: Tries to access item.ingredient
    quantity: item.quantity,
    unit: item.unit,
  }));
}
```

**Line 351 has the bug:**
```javascript
ingredientId: item.ingredient._id,  // ← WRONG: item has no 'ingredient' field
```

---

## THE BROKEN CHAIN: InventoryRepository.findActiveRecipeForMenuItem()

**File:** `src/modules/inventory/repository/inventory.repository.js` (lines 136-147)

```javascript
static findActiveRecipeForMenuItem(menuItemId, merchantId, options = {}) {
  const { session } = options;
  let query = Recipe.findOne({
    menuItem: menuItemId,
    merchant: merchantId,
    isActive: true,
  }).populate('items.ingredient');  // ← Tries to populate non-existent field
  
  if (session) query = query.session(session);
  return query.exec();
}
```

**Line 141 tries to populate:** `.populate('items.ingredient')`

**But the schema field is:** `items.ingredientName` (String)

**Result:** The populate() does nothing (field doesn't exist), returns recipe with items containing only:
- `ingredientName` (String)
- `quantity` (Number)
- `unit` (String)

---

## TEST DATA REVEALS THE SPLIT

### Test A: Using ObjectId Format (WILL FAIL)

**File:** `tests/inventory-stage3-deduction.test.js` (lines 356-376)

```javascript
await Recipe.create({
  merchant: merchantId,
  menuItem: menuItem1,
  name: 'Pasta Recipe',
  items: [
    { ingredient: ingredient1._id, quantity: 0.2, unit: 'kg' },  // ← ObjectId format
    { ingredient: ingredient2._id, quantity: 0.1, unit: 'liter' },
  ],
  isActive: true,
});
```

**This will FAIL on save** because the schema requires `ingredientName` (String), not `ingredient` (ObjectId).

### Test B: Using String Format (WILL PASS)

**File:** `tests/branch-inventory-isolation.test.js` (lines 102-115)

```javascript
recipe = await Recipe.create({
  merchant: merchant._id,
  name: 'Grilled Chicken',
  items: [
    {
      ingredientName: 'Chicken',  // ← String format (matches schema)
      quantity: 0.25,
      unit: 'kg',
    },
  ],
  yield: 1,
  category: 'Main Course',
  totalCost: 15,
});
```

**This will PASS on save** because it uses the correct `ingredientName` field.

### Test C: Using ObjectId Format (OLDER TEST)

**File:** `tests/order-e2e-lifecycle.test.js` (line 229)

```javascript
recipe = await Recipe.create({
  merchant: merchant._id, menuItem: menuItem._id, name: 'E2E Burger Recipe',
  isActive: true, yield: 1, items: [{ ingredient: ingredient._id, quantity: 1, unit: 'kg' }],  // ← ObjectId
});
```

**This will FAIL on save** because `ingredient` is not a valid schema field.

---

## WHEN resolveDeductionPlan() RUNS

**What happens:**

1. Call `resolveDeductionPlan(orderItems, merchantId)`
   - File: `src/modules/inventory/service/InventoryService.js` line 143

2. For each orderItem, call `getIngredientUsageForMenuItem(menuItem, merchantId)`
   - File: `src/modules/inventory/service/InventoryService.js` line 318

3. Inside getIngredientUsageForMenuItem():
   - Call `InventoryRepository.findActiveRecipeForMenuItem(menuItemId, merchantId)`
   - File: `src/modules/inventory/repository/inventory.repository.js` line 136
   - Returns recipe with `.populate('items.ingredient')` applied
   - **BUT:** There is no `items.ingredient` field in the schema (it's `items.ingredientName`)
   - **So:** populate() does nothing, recipe.items[0] = `{ingredientName: "Chicken", quantity: 0.25, unit: "kg"}`

4. Back in getIngredientUsageForMenuItem(), line 351:
   ```javascript
   return recipe.items.map(item => ({
     ingredientId: item.ingredient._id,  // ← CRASH: item.ingredient is undefined
     quantity: item.quantity,
     unit: item.unit,
   }));
   ```
   - `item.ingredient` is **undefined** (schema field is `ingredientName`)
   - Trying to access `item.ingredient._id` throws: `TypeError: Cannot read property '_id' of undefined`

---

## DEAD CODE CHECK

### populate('items.ingredient') - DEAD BUT STILL PRESENT

**Found in 13 locations:**

1. `src/modules/inventory/repository/inventory.repository.js:141` - InventoryRepository.findActiveRecipeForMenuItem()
2. `src/modules/order/middleware/stockValidation.js:36`
3. `src/modules/inventory/controller/recipe.controller.js:15` 
4. `src/modules/inventory/controller/recipe.controller.js:25`
5. `src/modules/inventory/controller/purchase-order.controller.js:30`
6. Plus 8 more in various documentation files

**All these are DEAD because:**
- The field `items.ingredient` does not exist in the schema
- The schema field is `items.ingredientName` (String)
- populate() silently does nothing on non-existent fields

**References:**
- grep results show `.populate('items.ingredient')` in production code (InventoryRepository, stockValidation middleware, recipe controller)
- Only file truly using it for production deduction: InventoryRepository.findActiveRecipeForMenuItem() which is called by getIngredientUsageForMenuItem()

---

## MIGRATION SCRIPT EXISTS

**File:** `scripts/migrate-recipes-to-ingredient-names.js`

This script is supposed to convert old recipes from `items[].ingredient` (ObjectId) to `items[].ingredientName` (String).

**Status:**
- Migration script exists
- Pre-save hook in Recipe schema validates `ingredientName` lookup
- **BUT:** The InventoryService.getIngredientUsageForMenuItem() still assumes OLD format (accessing `item.ingredient._id`)

---

## CRITICAL ISSUE: WOULD resolveDeductionPlan() WORK?

**Answer: NO, it would CRASH.**

**Trace with a real Recipe:**

```javascript
// Assume this recipe exists in DB (created with correct schema):
const recipe = {
  merchant: merchantId,
  menuItem: menuItemId,
  items: [
    {
      ingredientName: "Chicken",  // String, as per schema
      quantity: 0.25,
      unit: "kg"
    }
  ]
}

// Call resolveDeductionPlan([{menuItem: menuItemId, quantity: 2}], merchantId)
// 1. Calls getIngredientUsageForMenuItem(menuItemId, merchantId)
// 2. Fetches recipe via InventoryRepository.findActiveRecipeForMenuItem()
// 3. Executes: Recipe.findOne({...}).populate('items.ingredient')
// 4. populate() finds no 'items.ingredient' field, does nothing
// 5. recipe.items[0] = {ingredientName: "Chicken", quantity: 0.25, unit: "kg"}
// 6. Back in getIngredientUsageForMenuItem(), line 351:
//    return recipe.items.map(item => ({
//      ingredientId: item.ingredient._id,  // ← CRASH HERE
//      ...
//    }))
// 7. item.ingredient = undefined
// 8. TypeError: Cannot read property '_id' of undefined
```

**The function would THROW an error.**

---

## WHY THE CONTRADICTION EXISTS

The codebase is **mid-migration:**

1. **Schema Updated:** Recipe.items now uses `ingredientName` (String) — `models/Recipe.js` updated
2. **Pre-save Hook Added:** Validates ingredientName exists via name lookup — `models/Recipe.js` pre-save hook added
3. **Service NOT Updated:** getIngredientUsageForMenuItem() still assumes OLD format `item.ingredient._id` — **UNCHANGED**
4. **Repository NOT Updated:** findActiveRecipeForMenuItem() still uses `.populate('items.ingredient')` — **UNCHANGED**
5. **Old Tests:** Tests using `{ingredient: ObjectId}` format **WILL FAIL** on save (schema validation)
6. **New Tests:** Tests using `{ingredientName: String}` format **WILL PASS** on save but crash during deduction

---

## SUMMARY

| Component | Current State | Issue |
|-----------|----------------|-------|
| Recipe Schema | ingredientName (String) | ✅ Correct |
| Pre-save Hook | Validates ingredientName lookup | ✅ Correct |
| findActiveRecipeForMenuItem() | populate('items.ingredient') | ❌ DEAD: field doesn't exist |
| getIngredientUsageForMenuItem() | Accesses item.ingredient._id | ❌ BROKEN: field is ingredientName |
| resolveDeductionPlan() | Calls getIngredientUsageForMenuItem() | ❌ WILL CRASH: undefined property |
| Old Tests | Using {ingredient: ObjectId} | ❌ FAIL on save (schema mismatch) |
| New Tests | Using {ingredientName: String} | ❌ WILL CRASH on deduction (code mismatch) |

**Conclusion:** The migration from ObjectId to name-based resolution was partially completed. The schema and validation were updated, but the service layer code reading the recipe items was not updated to match.
