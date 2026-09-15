# Branch-Level Inventory Isolation — Implementation Plan

**Date:** September 3, 2026  
**Scope:** Add branch-level stock scoping to prevent cross-branch inventory contention  
**Strategy:** Hybrid approach with name-based Recipe-Ingredient resolution

---

## Executive Summary

This document outlines the implementation plan for adding branch-level inventory isolation. The key challenge is that **Recipe is merchant-scoped (shared menu) but Ingredient will be branch-scoped (isolated stock)**.

**Recommended Solution:** Hybrid Approach - Keep Ingredient as-is but resolve ingredient references at runtime by `(merchant, name, unit)` tuple rather than by ObjectId.

---

## Current State Analysis

### Branch Context Availability ✅

The branch context IS available throughout the stock deduction stack:

```
Order.branch → deductIngredients(orderId, userId)
  → extracts order.branch
  → passes to deductIngredientAtomic({ orderId, userId, merchantId, branchId })
  → ALREADY IN CONTEXT (used for StockHistory, not for ingredient query)
```

**Status:** branchId is already being passed through. It's just not used in the Ingredient query.

### PurchaseOrder Gap ⚠️

**Finding:** PurchaseOrder model (models/PurchaseOrder.js) does NOT have a branch field.

**Impact:** When stock is received via PO, there's no way to know which branch it belongs to.

**Fix Needed:** Add `branch` field to PurchaseOrder schema.

### Recipe-Ingredient Reference Problem 🔴 CRITICAL

**Current Architecture:**
- Recipe stores `items: [{ ingredient: ObjectId, quantity, unit }]`
- When you have multiple branches, each ingredient becomes multiple documents (one per branch)
- Mongoose populate by ObjectId will only return ONE document (ambiguous which branch)

**Example of the problem:**
```
Recipe for "Burger" says: items = [{ ingredient: 123abc, quantity: 0.5 }]
  
After branch isolation:
- BranchA's "Chicken" ingredient = ObjectId 456def
- BranchB's "Chicken" ingredient = ObjectId 789ghi

But Recipe still points to just 123abc — which branch is it?
Result: When BranchB tries to order, it can't find ingredient 123abc in its context.
```

---

## Three Possible Solutions

### Option A: Store Branch Directly in Ingredient (NOT RECOMMENDED)

**Approach:** Add `branch` field to Ingredient. Each ingredient becomes `{merchant, branch, name, unit}`.

**Pros:**
- Straightforward per-branch stock tracking
- Clear data isolation

**Cons:**
- Recipe.items[].ingredient ObjectId becomes ambiguous (which branch's ingredient?)
- Need to store multiple ObjectIds per ingredient name, or change Recipe schema entirely
- Major migration (existing ingredients → branch-scoped copies)
- Every recipe would need per-branch ingredient arrays
- **Doesn't actually solve the Recipe problem**

**Verdict:** ❌ Creates more problems than it solves

---

### Option B: Name-Based Ingredient Resolution (RECOMMENDED) ✅

**Approach:** 
1. Ingredient stays merchant-scoped (no branch field)
2. Recipe stores `items: [{ ingredientName, quantity, unit }]` (String-based, not ObjectId)
3. At deduction time, resolve ingredient by `(merchant, ingredientName, unit)` tuple
4. Add compound index: `{ merchant: 1, ingredientName: 1, unit: 1 }` (unique)

**Pros:**
- Minimal schema changes
- Recipe remains merchant-wide (shared menu)
- Ingredient lookup is semantic (name-based), not identity-based
- Backward compatible (gradual migration possible)
- Works whether ingredients are per-branch or shared
- Future-proof: can add branch scoping later without touching Recipe

**Cons:**
- Recipe must store ingredient names (not IDs)
- Ingredient lookup adds slight query overhead
- Ingredient names must be unique per merchant per unit

**Implementation:**
```javascript
// Recipe schema (CHANGE FROM ObjectId TO String)
items: [{
  ingredientName: { type: String, required: true },  // e.g., "Chicken"
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },            // e.g., "kg"
}]

// Ingredient schema (NO CHANGE YET)
// But add compound unique index:
ingredientSchema.index({ merchant: 1, name: 1, unit: 1 }, { unique: true });

// At deduction time:
const ingredient = await Ingredient.findOne({
  merchant: order.merchant,
  name: recipeItem.ingredientName,
  unit: recipeItem.unit,
  isActive: true
});
// Then deduct from this ingredient
```

**Verdict:** ✅ Clean, minimal changes, future-proof

---

### Option C: True Per-Branch Ingredients (MOST COMPLEX)

**Approach:** Add `branch` field to Ingredient. Change Recipe to have per-branch ingredient arrays OR use `{merchant, branch, ingredientName}` lookup.

**Pros:**
- Fully independent per-branch stock
- Clear per-branch visibility

**Cons:**
- Major schema restructuring
- Every ingredient becomes multiple documents
- Recipe either becomes per-branch or uses complex lookup logic
- High migration complexity
- Overkill if branches share supplies

**Verdict:** ❌ Too complex for the current use case. Consider only if business model requires fully independent branch inventories.

---

## Recommended Implementation: Option B

### Phase 1: Schema Updates

#### 1.1 Add branch field to PurchaseOrder

**File:** models/PurchaseOrder.js

```javascript
// Add to purchaseOrderSchema:
branch: {
  type: Schema.Types.ObjectId,
  ref: 'Branch',
  required: true,  // Every PO is for a specific branch
  index: true,
},

// Update indexes:
purchaseOrderSchema.index({ merchant: 1, branch: 1, status: 1 });
```

#### 1.2 Add compound index to Ingredient

**File:** models/Ingredient.js

```javascript
// Keep existing schema, add index:
ingredientSchema.index({ merchant: 1, name: 1, unit: 1 }, { unique: true });
```

#### 1.3 Change Recipe.items to use ingredientName (String) instead of ObjectId

**File:** models/Recipe.js

```javascript
// BEFORE:
const recipeItemSchema = new Schema({
  ingredient: {
    type: Schema.Types.ObjectId,
    ref: 'Ingredient',
    required: true,
  },
  quantity: Number,
  unit: String,
});

// AFTER:
const recipeItemSchema = new Schema({
  ingredientName: {
    type: String,
    required: true,  // "Chicken", "Tomato", etc.
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  unit: {
    type: String,
    required: true,  // Must match ingredient.unit
    enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'boxes', 'cans'],
  },
});

// Update pre-save hook to validate by name instead of ID:
recipeSchema.pre('save', async function (next) {
  let totalCost = 0;

  for (const item of this.items) {
    // Lookup ingredient by name + unit instead of ID
    const ingredient = await mongoose.model('Ingredient').findOne({
      merchant: this.merchant,
      name: item.ingredientName,
      unit: item.unit,
      isActive: true,
    });
    
    if (!ingredient) {
      return next(new Error(
        `Ingredient "${item.ingredientName}" (${item.unit}) not found for this merchant`
      ));
    }

    if (ingredient.costPerUnit) {
      totalCost += item.quantity * ingredient.costPerUnit;
    }
  }

  this.totalCost = totalCost / this.yield;
  next();
});
```

---

### Phase 2: Service Layer Updates

#### 2.1 Update stock.service.js - Add branch to deduction queries

**All 6 functions need this pattern update:**

```javascript
// deductIngredientAtomic BEFORE:
const updated = await Ingredient.findOneAndUpdate(
  { 
    _id: ingredientId,
    merchant: merchantId,
    currentStock: { $gte: deductQty },
    isActive: true 
  },
  ...
);

// deductIngredientAtomic AFTER:
const updated = await Ingredient.findOneAndUpdate(
  { 
    _id: ingredientId,
    merchant: merchantId,
    // branch NOT needed here if ingredients remain merchant-wide
    // BUT if moving to per-branch ingredients, add:
    // branch: branchId,
    currentStock: { $gte: deductQty },
    isActive: true 
  },
  ...
);
```

**For now:** No change needed if keeping ingredients merchant-wide.
**If moving to per-branch ingredients later:** Add `branch: branchId` to all 6 query filters.

#### 2.2 Update deductIngredients to resolve by ingredientName

**File:** src/modules/inventory/service/stock.service.js

```javascript
// BEFORE (line ~111-130):
for (const orderItem of order.items) {
  const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
    .populate('items.ingredient');
  
  if (!recipe) continue;
  
  for (const recipeItem of recipe.items) {
    const deductQty = recipeItem.quantity * orderItem.quantity;
    
    const updated = await deductIngredientAtomic(
      recipeItem.ingredient._id,  // ← Uses ObjectId directly
      deductQty,
      { ... }
    );
  }
}

// AFTER:
for (const orderItem of order.items) {
  const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem });
  
  if (!recipe) continue;
  
  for (const recipeItem of recipe.items) {
    // Resolve ingredient by name + unit
    const ingredient = await Ingredient.findOne({
      merchant: order.merchant,
      name: recipeItem.ingredientName,  // ← Use name, not ID
      unit: recipeItem.unit,
      isActive: true,
    });
    
    if (!ingredient) {
      throw new AppError(
        `Ingredient "${recipeItem.ingredientName}" not available in stock for this merchant`,
        404
      );
    }
    
    const deductQty = recipeItem.quantity * orderItem.quantity;
    
    const updated = await deductIngredientAtomic(
      ingredient._id,  // ← Now resolve the ID at runtime
      deductQty,
      { ... }
    );
  }
}
```

#### 2.3 Apply same pattern to reserveIngredients and finalizeIngredients

**Same change:** Resolve ingredient by name before calling atomic function.

#### 2.4 Add branchId parameter to InventoryService.adjustStock()

**File:** src/modules/inventory/service/inventory.service.js

```javascript
// BEFORE:
static async adjustStock(
  merchantId,
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  cost = 0,
  options = {}
)

// AFTER:
static async adjustStock(
  merchantId,
  branchId,  // ← ADD THIS parameter
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  cost = 0,
  options = {}
)

// Then pass branchId to StockMovement:
await InventoryRepository.createStockMovements([
  {
    merchant: merchantId,
    branch: branchId,  // ← Include branch in audit trail
    ingredient: ingredientId,
    // ... other fields
  },
], { session });
```

---

### Phase 3: Repository Updates

#### 3.1 Update inventory.repository.js queries to support branchId parameter

```javascript
// All queries that return stock levels should accept branchId

// OLD:
static findActiveIngredientsByMerchant(merchantId, options = {}) {
  return this.findIngredients({ merchant: merchantId, isActive: true }, options);
}

// NEW:
static findActiveIngredientsByMerchant(merchantId, branchId, options = {}) {
  // For now, ignore branchId if ingredients are still merchant-wide
  // Add branch filtering when ready to move to per-branch ingredients
  return this.findIngredients({ merchant: merchantId, isActive: true }, options);
}

// Same for:
// - getLowStockItems()
// - getInventoryValuation()
// - validateStockAvailability()
// - hasEnoughStock()
```

---

### Phase 4: Controller Updates

#### 4.1 Update purchase-order.controller.js receivePurchaseOrder

**File:** src/modules/inventory/controller/purchase-order.controller.js

```javascript
// BEFORE:
const { receivedItems } = req.body;
for (const item of receivedItems) {
  await InventoryService.adjustStock(
    merchantId,
    item.ingredientId,
    item.receivedQuantity,
    'in',
    'purchase',
    purchaseOrder.poNumber,
    req.user._id,
    poItem.unitPrice
  );
}

// AFTER:
const branchId = purchaseOrder.branch;  // ← From updated PO schema
const { receivedItems } = req.body;
for (const item of receivedItems) {
  await InventoryService.adjustStock(
    merchantId,
    branchId,  // ← Pass branch context
    item.ingredientId,
    item.receivedQuantity,
    'in',
    'purchase',
    purchaseOrder.poNumber,
    req.user._id,
    poItem.unitPrice
  );
}
```

#### 4.2 Update ingredient create/update controller

**File:** src/modules/inventory/controller/ingredient.controller.js

```javascript
// When creating ingredient, optionally require/allow branchId
// For now: No change (if keeping merchant-scoped)
// Future: Add branch field if moving to per-branch ingredients
```

---

## Implementation Steps (In Order)

### Step 1: Schema Changes (No data migration yet)
- [ ] Add branch field to PurchaseOrder schema
- [ ] Add compound index to Ingredient: `{ merchant, name, unit }`
- [ ] Modify Recipe.items: change `ingredient` ObjectId to `ingredientName` String
- [ ] Update Recipe pre-save hook to validate by name

### Step 2: Service Layer
- [ ] Update deductIngredients() to resolve ingredient by name
- [ ] Update reserveIngredients() to resolve ingredient by name
- [ ] Update finalizeIngredients() to resolve ingredient by name
- [ ] Add branchId parameter to InventoryService.adjustStock()

### Step 3: Rollback Functions
- [ ] Update rollbackDeductions() - no changes needed yet (if merchant-scoped)
- [ ] Update releaseReservations() - no changes needed yet (if merchant-scoped)
- [ ] Update rollbackFinalizations() - no changes needed yet (if merchant-scoped)

### Step 4: Repository Layer
- [ ] Add branchId parameter to all ingredient queries (accept but may ignore if merchant-scoped)
- [ ] Update deductStock() signature (already done in IDOR fix, but verify branchId not needed yet)

### Step 5: Controllers
- [ ] Update receivePurchaseOrder() to pass branchId to adjustStock()
- [ ] Update ingredient controller (if allowing per-branch creation)

### Step 6: Testing & Validation
- [ ] Test PO receipt with branchId
- [ ] Test order deduction with name-based ingredient lookup
- [ ] Verify StockHistory captures branch context
- [ ] Test across multiple branches

---

## Future Migration Path (If Moving to Per-Branch Ingredients)

If the business later requires fully independent per-branch stock:

1. Add `branch` field to Ingredient schema
2. Create migration script to copy existing ingredients per branch
3. Update Ingredient unique index to `{ merchant, branch, name, unit }`
4. Add `branch` to all ingredient queries in stock.service.js
5. No Recipe schema changes needed (already uses ingredientName)

This approach allows incremental migration without breaking current functionality.

---

## Risk Assessment

### High Risk ⚠️
- Recipe ObjectId → String change: Requires data migration and code refactor
- Solution: Implement with comprehensive tests; validate recipes before/after

### Medium Risk
- PurchaseOrder adding branch: Existing POs will have null branch
- Solution: Provide controller/API that requires branch on creation; handle null gracefully

### Low Risk
- Adding branchId parameter: Already flows through system; just not used in queries
- Solution: Add gradually, validate branch context availability

---

## Success Criteria

✅ **Order placement at Branch A correctly deducts from Branch A's ingredients**  
✅ **Order placement at Branch B doesn't affect Branch A's stock**  
✅ **PurchaseOrder receipt correctly adds stock to specified branch**  
✅ **Recipe names resolve to correct merchant ingredients at order time**  
✅ **StockHistory correctly captures which branch caused each deduction**  
✅ **No cross-merchant deductions possible (existing IDOR fix holds)**  
✅ **All existing tests pass with name-based ingredient resolution**

---

## Files to Modify

### Schema Files
1. models/PurchaseOrder.js — Add branch field
2. models/Ingredient.js — Add index, no field change yet
3. models/Recipe.js — Change items.ingredient → items.ingredientName

### Service Files
4. src/modules/inventory/service/stock.service.js — Resolve by ingredientName (3 functions)
5. src/modules/inventory/service/inventory.service.js — Add branchId to adjustStock()
6. src/modules/inventory/repository/inventory.repository.js — Accept branchId in queries

### Controller Files
7. src/modules/inventory/controller/purchase-order.controller.js — Pass branchId

### Tests (Create New)
8. tests/branch-inventory-isolation.test.js — Comprehensive test suite

---

## Migration Strategy

**Option 1: Big Bang** (Higher Risk, Faster)
- Deploy all changes at once
- Requires data migration of all recipes
- High testing burden

**Option 2: Gradual** (Lower Risk, Slower - RECOMMENDED)
- Deploy PurchaseOrder branch field first (backward compatible, nullable)
- Deploy Recipe name-based resolution with dual-support (both ObjectId and name)
- Monitor; fix edge cases
- Remove ObjectId support after stability verified
- Complete in 2-3 iterations

---

## Next Steps

Proceed to implementation in this order:
1. Schema changes (PurchaseOrder.branch, Recipe.ingredientName)
2. Service layer updates (ingredient resolution)
3. Controller updates (PO receiving)
4. Comprehensive testing

---

**Status:** 📋 PLANNING COMPLETE — READY FOR IMPLEMENTATION
