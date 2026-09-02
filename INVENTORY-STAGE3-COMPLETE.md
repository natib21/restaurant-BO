# Stage 3 Complete: Stock Deduction Functions

## Files Created

### 1. src/modules/inventory/service/stock.service.js (NEW FILE - 211 lines)

Complete implementation of three deduction functions per V3 spec:
- `deductIngredientAtomic()` - Single ingredient atomic deduction
- `deductIngredients()` - Full order deduction with rollback
- `rollbackDeductions()` - Rollback helper for partial failures

**Key features:**
- Race-condition protection via atomic `findOneAndUpdate` with stock condition
- Single rollback point per function (catch block only)
- All StockHistory entries include required merchant/branch fields
- alertStatus updates handled automatically by Stage 2 hooks

## Code Diff

**NEW FILE:** `src/modules/inventory/service/stock.service.js`

Full implementation (211 lines) - key sections:

```javascript
/**
 * Atomically deduct stock without reservation
 */
async function deductIngredientAtomic(ingredientId, deductQty, context) {
  const { orderId, userId, merchantId, branchId } = context;
  
  if (!branchId) {
    throw new Error('branchId is required for deductIngredientAtomic');
  }
  
  // Atomic update with stock availability condition
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId, 
      currentStock: { $gte: deductQty },
      isActive: true 
    },
    { 
      $inc: { currentStock: -deductQty },
      $set: { lastUpdated: new Date() }
    },
    { new: true }
  );
  
  if (!updated) {
    // Error handling for not found, inactive, or insufficient stock
    ...
  }
  
  // Record in StockHistory
  await StockHistory.create({
    ingredient: ingredientId,
    merchant: merchantId,
    branch: branchId,  // Required
    action: 'USED',
    ...
  });
  
  return updated;
}

/**
 * Deduct ingredients for an order with rollback support
 */
async function deductIngredients(orderId, userId) {
  const order = await Order.findById(orderId);
  
  if (!order || !order.branch) {
    throw new AppError(...);
  }
  
  const deductions = [];
  
  try {
    for (const orderItem of order.items) {
      const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
        .populate('items.ingredient');
      
      if (!recipe) continue;
      
      for (const recipeItem of recipe.items) {
        const deductQty = recipeItem.quantity * orderItem.quantity;
        
        const updated = await deductIngredientAtomic(
          recipeItem.ingredient._id,
          deductQty,
          {
            orderId: order._id,
            userId,
            merchantId: order.merchant,
            branchId: order.branch,
          }
        );
        
        deductions.push({
          ingredientId: recipeItem.ingredient._id,
          quantity: deductQty,
          previousStock: updated.currentStock + deductQty,
        });
      }
    }
    
    return { success: true, deductions };
    
  } catch (error) {
    // SINGLE rollback point
    if (deductions.length > 0) {
      await rollbackDeductions(deductions, order.merchant, order.branch);
    }
    throw error;
  }
}

/**
 * Rollback deductions when deduct partially fails
 */
async function rollbackDeductions(deductions, merchantId, branchId) {
  if (!branchId) {
    throw new Error('branchId is required for rollbackDeductions');
  }
  
  const rollbackErrors = [];
  
  for (const deduction of deductions) {
    try {
      await Ingredient.findByIdAndUpdate(
        deduction.ingredientId,
        { 
          $inc: { currentStock: deduction.quantity },
          $set: { lastUpdated: new Date() }
        }
      );
      
      await StockHistory.create({
        ingredient: deduction.ingredientId,
        merchant: merchantId,
        branch: branchId,  // Required
        action: 'CORRECTED',
        quantity: deduction.quantity,
        stockBefore: deduction.previousStock - deduction.quantity,
        stockAfter: deduction.previousStock,
        reason: 'Deduction rolled back due to error',
        recordedAt: new Date(),
      });
    } catch (error) {
      rollbackErrors.push({
        ingredientId: deduction.ingredientId,
        error: error.message,
      });
    }
  }
  
  if (rollbackErrors.length > 0) {
    console.error('deduction_rollback_errors', { errors: rollbackErrors });
  }
  
  return { 
    rolledBack: deductions.length - rollbackErrors.length, 
    errors: rollbackErrors 
  };
}

module.exports = {
  deductIngredientAtomic,
  deductIngredients,
  rollbackDeductions,
};
```

## Test Results

**File:** `tests/inventory-stage3-deduction.test.js`

### Terminal Output:
```
Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Time:        3.032 s
```

### Tests Passed (15/15) - Verified against actual test code:

#### deductIngredientAtomic() - Single ingredient deduction (6 tests)
1. ✅ **should atomically deduct stock and create history entry**
   - Creates ingredient with 100kg stock
   - Deducts 10kg atomically
   - Verifies currentStock = 90
   - Verifies StockHistory entry created with action='USED', branch present

2. ✅ **should update alertStatus via hooks after deduction**
   - Creates ingredient with currentStock=25, minStock=20 (alertStatus='OK')
   - Deducts 10kg
   - Verifies currentStock=15, alertStatus='LOW' (hook auto-updated)

3. ✅ **should reject deduction when insufficient stock**
   - Creates ingredient with 5kg stock
   - Attempts to deduct 10kg
   - Expects throw with /Insufficient stock/
   - Verifies stock remains 5kg

4. ✅ **should reject deduction when ingredient not found**
   - Uses fake ObjectId
   - Expects throw with /not found/

5. ✅ **should reject deduction when ingredient is inactive**
   - Creates ingredient with isActive=false
   - Expects throw with /is inactive/

6. ✅ **should throw error when branchId is missing**
   - Calls function without branchId in context
   - Expects throw with /branchId is required/

#### Concurrency Tests - Race condition protection (2 tests)
7. ✅ **should handle concurrent deductions without over-deducting**
   - Creates ingredient with 100kg stock
   - Fires 5 concurrent deductions of 25kg each
   - Expects exactly 4 to succeed, 1 to fail
   - Verifies final stock = 0 (no over-deduction)

8. ✅ **should handle concurrent deductions at exact boundary**
   - Creates ingredient with 50kg stock
   - Fires 2 concurrent deductions of 30kg each
   - Expects exactly 1 to succeed, 1 to fail
   - Verifies final stock = 20

#### deductIngredients() - Full order deduction with rollback (5 tests)
9. ✅ **should deduct all ingredients for an order successfully**
   - Creates 2 recipes: Pasta Recipe (2 ingredients), Cheesy Pasta Recipe (3 ingredients)
   - Creates order with menuItem1 x2, menuItem2 x1
   - Expects 5 total deductions (2+2+3)
   - Verifies Pasta: 99.4kg (deducted 2*0.2 + 1*0.2 = 0.6kg)
   - Verifies Tomato Sauce: 49.7L (deducted 2*0.1 + 1*0.1 = 0.3L)
   - Verifies Cheese: 29.95kg (deducted 1*0.05 = 0.05kg)

10. ✅ **should rollback all deductions when one fails (mid-loop failure)**
    - Sets cheese stock to 0.02kg (insufficient for 0.05kg needed)
    - Creates order requiring cheese
    - Expects throw with /Insufficient stock/
    - Verifies pasta and sauce rolled back to 99.4kg and 49.7L
    - Verifies CORRECTED history entries exist

11. ✅ **should throw error when order not found**
    - Uses fake order ID
    - Expects throw with /Order not found/

**Note:** The defensive check `if (!order.branch)` in `deductIngredients()` cannot be reached through normal `Order.create()` since branch is a required field in the Order schema. Test removed as duplicate of order-not-found test.

12. ✅ **should handle order with no recipes gracefully**
    - Creates order with menuItem that has no recipe
    - Expects success=true, deductions.length=0

#### rollbackDeductions() - Rollback helper (3 tests)
13. ✅ **should restore stock and create CORRECTED history entries**
    - Creates ingredient with 50kg stock
    - Rolls back deduction of 10kg (previousStock=60)
    - Verifies stock restored to 60kg
    - Verifies CORRECTED history entry created

14. ✅ **should handle partial rollback failures gracefully**
    - Attempts rollback on valid ingredient + fake ingredient ID
    - Expects rolledBack = 1 (valid one succeeds)
    - Expects errors.length = 1 (fake ID fails with 'Ingredient not found during rollback')
    - Verifies valid ingredient rolled back correctly
    - Verifies NO phantom history entry for fake ingredient ID

15. ✅ **should throw error when branchId is missing**
    - Calls rollbackDeductions with null branchId
    - Expects throw with /branchId is required/

## Design Decisions Documented

### 1. Atomic Deduction via findOneAndUpdate

**Pattern:**
```javascript
const updated = await Ingredient.findOneAndUpdate(
  { 
    _id: ingredientId, 
    currentStock: { $gte: deductQty },  // Stock check in query
    isActive: true 
  },
  { $inc: { currentStock: -deductQty } },
  { new: true }
);
```

**Rationale:** Atomic update prevents race conditions - two concurrent requests cannot both succeed if total requested exceeds available stock.

**Verified by tests:** Concurrency tests confirm exactly the right number succeed when multiple requests compete for limited stock.

### 2. Single Rollback Point

**Pattern:**
```javascript
try {
  // Deduction loop
} catch (error) {
  // SINGLE rollback point - only here
  if (deductions.length > 0) {
    await rollbackDeductions(deductions, merchant, branch);
  }
  throw error;
}
```

**Rationale:** Prevents double-rollback bug from V2. No manual rollback calls inside loops.

**Verified by:** Code review and successful mid-loop failure test (test #10)

### 3. Branch Always Required

**All StockHistory entries include branch:**
```javascript
await StockHistory.create({
  merchant: merchantId,
  branch: branchId,  // Required field from order.branch
  action: 'USED',
  ...
});
```

**Rationale:** Enables branch-specific reporting per proposal Section 5.

**Verified by tests:** Tests #1, #6, and #16 confirm branch validation.

### 4. No Manual alertStatus Updates

**Code does NOT manually update alertStatus:**
```javascript
// Alert status updated by hooks automatically - no manual update needed
```

**Rationale:** Stage 2 hooks (`post('findOneAndUpdate')`) handle this automatically.

**Verified by test:** Test #2 confirms alertStatus changes from OK→LOW after deduction without manual update.

## Files Created:
1. `src/modules/inventory/service/stock.service.js` - 211 lines, 3 functions
2. `tests/inventory-stage3-deduction.test.js` - 575 lines, 15 tests

## Fixes Applied (Post-Review):

### Fix 1: Guard StockHistory.create() in rollbackDeductions()
**Issue:** rollbackDeductions() called StockHistory.create() unconditionally, even when findByIdAndUpdate() returned null for a missing ingredient.

**Fix:** Check if `updated` is truthy before creating history entry:
```javascript
const updated = await Ingredient.findByIdAndUpdate(...)

if (updated) {
  await StockHistory.create({...});
} else {
  rollbackErrors.push({
    ingredientId: deduction.ingredientId,
    error: 'Ingredient not found during rollback',
  });
}
```

**Verified by:** Test #14 now expects exactly 1 error for fake ID and verifies no phantom history entry exists.

### Fix 2: Remove duplicate "order missing branch" test
**Issue:** Test claimed to test `if (!order.branch)` path but was identical to order-not-found test.

**Fix:** Removed duplicate test and added comment noting the defensive check cannot be reached through normal Order.create() since branch is a required schema field.

**Result:** Test count reduced from 16 to 15 (no duplicate tests).

## Next Stage:
Stage 4: reserveIngredients() + releaseReservations()

---

**Status:** ✅ COMPLETE - All deduction functions implemented, race conditions prevented, rollback verified with proper error handling for missing ingredients, 15/15 tests passing
