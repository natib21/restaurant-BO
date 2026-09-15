# Critical Code Locations & What To Fix

## Executive Summary

- **IDOR Protection**: ✅ Present in production (`merchant: merchantId` filter)
- **Branch Isolation**: ❌ Missing in production (no `branch: branchId` filter)
- **Dead Code**: The "dead" stock.service.js is actually more secure than the active code
- **Risk Level**: **CRITICAL** — Branch A orders can deplete Branch B stock

---

## Production Code That Needs Fixing

### File 1: src/modules/inventory/service/InventoryService.js

#### Location 1: Line 165 - deductForOrder()

**CURRENT (BROKEN)**:
```javascript
static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session) {
  // ...
  for (const line of plan) {
    const ingredient = await this.adjustStockAtomic(
      merchantId,
      line.ingredientId,
      line.totalQuantity,
      'out',
      'order_consumption',
      reference,
      performedBy,
      session
    );
  }
}
```

**NEEDED**:
- Add `branchId` to destructured parameters
- Pass `branchId` to `adjustStockAtomic()`

---

#### Location 2: Line 190 - deductStockFromOrder()

**CURRENT (BROKEN)**:
```javascript
static async deductStockFromOrder(merchantId, orderItems, performedBy) {
  // ...
  await this.deductForOrder(
    {
      merchantId,
      orderNumber: 'Unknown',
      plan,
      performedBy,
    },
    session
  );
}
```

**NEEDED**:
- Add `branchId` parameter to function
- Pass `branchId` to `deductForOrder()`

---

#### Location 3: Line 212 - adjustStockAtomic()

**CURRENT (IDOR OK, BUT BRANCH MISSING)**:
```javascript
static async adjustStockAtomic(
  merchantId,           // ← IDOR protection
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  session,
  cost = 0
) {
  if (type === 'out' || type === 'waste' || type === 'adjustment') {
    const ingredient = await Ingredient.findOneAndUpdate(
      {
        _id: ingredientId,
        merchant: merchantId,     // ✅ IDOR filter present
        currentStock: { $gte: quantity },
        // ❌ branch filter MISSING
      },
      { $inc: { currentStock: -quantity } },
      { new: true, session }
    );
```

**NEEDED**:
- Add `branchId` parameter (2nd parameter after merchantId)
- Add `branch: branchId` to the query filter
- Add `branch: branchId` to stock movements

---

#### Location 4: Line 240-255 - Stock Movements Creation

**CURRENT (BROKEN)**:
```javascript
await InventoryRepository.createStockMovements(
  [
    {
      merchant: merchantId,
      ingredient: ingredientId,
      type,
      quantity,
      previousStock: ingredient.currentStock + quantity,
      newStock: ingredient.currentStock,
      reason,
      reference,
      cost,
      performedBy,
      // ❌ NO branch field
    },
  ],
  { session }
);
```

**NEEDED**:
- Add `branch: branchId` field to the movement object

---

### File 2: Where adjustStockAtomic() is CALLED

Find all locations calling `adjustStockAtomic()` and ensure they pass branchId.

**Expected locations**:
1. InventoryService.deductForOrder() — Line 175
2. InventoryService.adjustStock() — Line 22 (if it calls adjustStockAtomic)
3. Any other place that calls adjustStockAtomic()

---

## Test Code (Reference - Already Correct)

### File: src/modules/inventory/service/stock.service.js

#### Function: deductIngredientAtomic()

**CORRECT IMPLEMENTATION** (use as reference):
```javascript
async function deductIngredientAtomic(ingredientId, deductQty, { 
  orderId, 
  userId, 
  merchantId, 
  branchId      // ✅ Branch parameter
}) {
  if (!branchId) {
    throw new Error('branchId is required for deductIngredientAtomic');
  }
  
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId,
      merchant: merchantId,      // ✅ IDOR filter
      branch: branchId,          // ✅ BRANCH filter
      currentStock: { $gte: deductQty },
      isActive: true 
    },
    { $inc: { currentStock: -deductQty } },
    { new: true }
  );

  await StockHistory.create({
    ingredient: ingredientId,
    merchant: merchantId,
    branch: branchId,            // ✅ Branch recorded
    action: 'USED',
    quantity: deductQty,
    stockBefore: updated.currentStock + deductQty,
    stockAfter: updated.currentStock,
    unit: updated.unit,
  });

  return updated;
}
```

---

## Exact Fixes Required

### Fix #1: deductForOrder() signature (Line 165)

```diff
- static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session) {
+ static async deductForOrder({ merchantId, branchId, orderNumber, plan, performedBy }, session) {
```

### Fix #2: deductForOrder() body (Line 175)

```diff
  const ingredient = await this.adjustStockAtomic(
    merchantId,
+   branchId,
    line.ingredientId,
    line.totalQuantity,
```

### Fix #3: deductStockFromOrder() signature (Line 190)

```diff
- static async deductStockFromOrder(merchantId, orderItems, performedBy) {
+ static async deductStockFromOrder(merchantId, branchId, orderItems, performedBy) {
```

### Fix #4: deductStockFromOrder() body (Line 200)

```diff
  await this.deductForOrder(
    {
      merchantId,
+     branchId,
      orderNumber: 'Unknown',
      plan,
```

### Fix #5: adjustStockAtomic() signature (Line 212)

```diff
  static async adjustStockAtomic(
    merchantId,
+   branchId,
    ingredientId,
    quantity,
```

### Fix #6: adjustStockAtomic() query (Line 227)

```diff
  const ingredient = await Ingredient.findOneAndUpdate(
    {
      _id: ingredientId,
      merchant: merchantId,
+     branch: branchId,
      currentStock: { $gte: quantity },
    },
```

### Fix #7: Stock movements (Line 248)

```diff
  await InventoryRepository.createStockMovements(
    [
      {
        merchant: merchantId,
+       branch: branchId,
        ingredient: ingredientId,
```

### Fix #8: adjustStockAtomic() 'in' type branch (Line 265)

```diff
  const ingredient = await InventoryRepository.findIngredientOne(
-   { _id: ingredientId, merchant: merchantId },
+   { _id: ingredientId, merchant: merchantId, branch: branchId },
    { session }
  );
```

### Fix #9: Stock movements for 'in' type (Line 277)

```diff
  await InventoryRepository.createStockMovements(
    [
      {
        merchant: merchantId,
+       branch: branchId,
        ingredient: ingredientId,
```

---

## Find All Callers

Run this grep to find everywhere deductStockFromOrder is called:

```bash
grep -r "deductStockFromOrder" src/
```

Expected results will show places that need to pass `branchId`.

---

## Testing After Fix

### Test Case 1: Same order should work

```javascript
// Should succeed - deducts from correct branch
const result = await InventoryService.deductForOrder({
  merchantId: merchant1._id,
  branchId: branchA._id,           // ← Branch specified
  orderNumber: 'ORD001',
  plan: [{ ingredientId: chickenA._id, totalQuantity: 4 }],
  performedBy: userId,
}, session);
```

### Test Case 2: Cross-branch should fail

```javascript
// Should FAIL - tries to use Branch A's ingredient with Branch B's order
const result = await InventoryService.deductForOrder({
  merchantId: merchant1._id,
  branchId: branchB._id,           // ← Different branch
  orderNumber: 'ORD002',
  plan: [{ ingredientId: chickenA._id, totalQuantity: 4 }],  // ← Branch A's ingredient
  performedBy: userId,
}, session);

// Error: "Ingredient not found" (because chicken A doesn't have branchB filter match)
```

---

## Critical Questions Before Deploying

1. ✅ Is merchant filter present? **YES** (IDOR OK)
2. ❌ Is branch filter present? **NO** (BRANCH BROKEN)
3. ❌ Is branch parameter passed through call chain? **NO**
4. ❌ Is branch recorded in audit trail? **NO**
5. ❌ Are tests verifying branch isolation? **NO**

**Status**: DO NOT DEPLOY until all 5 are YES.

---

## Summary

**The IDOR fix is there. The branch isolation fix is NOT.**

This creates a false sense of security — the code looks safe (merchant filter) but isn't (no branch filter). Branch A can still drain Branch B's inventory.

**Action**: Apply all 9 fixes above to InventoryService.js, then run comprehensive tests before deployment.
