# Step 3: Diffs for Adding branchId Parameter Through Chain

## 3 Files to Modify

### File 1: src/modules/inventory/service/InventoryService.js

---

### DIFF 1a: deductForOrder() signature (Line 165)

```diff
- static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session) {
+ static async deductForOrder({ merchantId, branchId, orderNumber, plan, performedBy }, session) {
    if (!session) {
      throw new Error('deductForOrder requires a MongoDB session');
    }
```

---

### DIFF 1b: deductForOrder() passing branchId to adjustStockAtomic (Line 174)

```diff
  for (const line of plan) {
    const ingredient = await this.adjustStockAtomic(
      merchantId,
+     branchId,
      line.ingredientId,
      line.totalQuantity,
      'out',
      'order_consumption',
      reference,
      performedBy,
      session
    );
    ingredients.push(ingredient);
  }
```

---

### DIFF 1c: deductStockFromOrder() signature (Line 190)

```diff
- static async deductStockFromOrder(merchantId, orderItems, performedBy) {
+ static async deductStockFromOrder(merchantId, branchId, orderItems, performedBy) {
    const plan = await this.resolveDeductionPlan(orderItems, merchantId);
    const session = await InventoryRepository.startRecipeSession();
```

---

### DIFF 1d: deductStockFromOrder() passing branchId to deductForOrder (Line 196)

```diff
  await session.withTransaction(async () => {
    await this.deductForOrder(
      {
        merchantId,
+       branchId,
        orderNumber: 'Unknown',
        plan,
        performedBy,
      },
      session
    );
  });
```

---

### DIFF 1e: adjustStockAtomic() signature (Line 212)

```diff
  static async adjustStockAtomic(
    merchantId,
+   branchId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    session,
    cost = 0
  ) {
```

---

### DIFF 1f: adjustStockAtomic() query for 'out' type (Line 227)

```diff
  if (type === 'out' || type === 'waste' || type === 'adjustment') {
    const ingredient = await Ingredient.findOneAndUpdate(
      {
        _id: ingredientId,
        merchant: merchantId,
+       branch: branchId,
        currentStock: { $gte: quantity },
      },
      {
        $inc: { currentStock: -quantity },
      },
      { new: true, session }
    );
```

---

### DIFF 1g: Stock movements record for 'out' type (Line 248)

```diff
  await InventoryRepository.createStockMovements(
    [
      {
        merchant: merchantId,
+       branch: branchId,
        ingredient: ingredientId,
        type,
        quantity,
        previousStock: ingredient.currentStock + quantity,
        newStock: ingredient.currentStock,
        reason,
        reference,
        cost,
        performedBy,
      },
    ],
    { session }
  );
```

---

### DIFF 1h: adjustStockAtomic() query for 'in' type (Line 265)

```diff
- const ingredient = await InventoryRepository.findIngredientOne(
-   { _id: ingredientId, merchant: merchantId },
+ const ingredient = await InventoryRepository.findIngredientOne(
+   { _id: ingredientId, merchant: merchantId, branch: branchId },
    { session }
  );
```

---

### DIFF 1i: Stock movements record for 'in' type (Line 277)

```diff
  await InventoryRepository.createStockMovements(
    [
      {
        merchant: merchantId,
+       branch: branchId,
        ingredient: ingredientId,
        type,
        quantity,
        previousStock,
        newStock: ingredient.currentStock,
        reason,
        reference,
        cost,
        performedBy,
      },
    ],
    { session }
  );
```

---

## Summary of Changes in InventoryService.js

| Function | Change | Lines Affected |
|----------|--------|-----------------|
| `deductForOrder()` | Add `branchId` parameter | 165 |
| `deductForOrder()` | Pass `branchId` to `adjustStockAtomic()` | 174-176 |
| `deductStockFromOrder()` | Add `branchId` parameter | 190 |
| `deductStockFromOrder()` | Pass `branchId` to `deductForOrder()` | 196-206 |
| `adjustStockAtomic()` | Add `branchId` parameter | 212-221 |
| `adjustStockAtomic()` | Add `branch: branchId` to 'out' query | 227-234 |
| `adjustStockAtomic()` | Add `branch: branchId` to 'out' movements | 248-249 |
| `adjustStockAtomic()` | Add `branch: branchId` to 'in' query | 265-266 |
| `adjustStockAtomic()` | Add `branch: branchId` to 'in' movements | 277-278 |

**Total changes**: 9 diff chunks

---

## Impact Analysis

### Parameters Added
- `branchId` added to: `deductForOrder()`, `deductStockFromOrder()`, `adjustStockAtomic()`

### Queries Updated
- Both "out" and "in" type queries now include `branch: branchId` filter
- Matches pattern from stock.service.js's `deductIngredientAtomic()`

### Audit Trail Updated
- Both "out" and "in" type stock movements now record `branch: branchId`
- Enables branch-scoped audit reporting

### Backward Compatibility
- ⚠️ **Breaking Change**: All callers MUST pass `branchId`
- ⚠️ Only 2 callers exist (both updated in Step 4)

---

## Why These Changes

1. **Branch Isolation**: Query includes `branch: branchId` so only that branch's ingredient can be deducted
2. **Audit Trail**: Stock movements record branch so you can trace which branch consumed inventory
3. **Pattern Consistency**: Matches the correct implementation already in stock.service.js

---

## Verification Checklist

Before applying:
- [ ] Diffs match this document
- [ ] 9 changes total across 3 functions
- [ ] All parameter additions match "branchId"
- [ ] All query filters include branch filter
- [ ] All stock movements include branch field

After applying:
- [ ] InventoryService.js has all 9 changes
- [ ] No syntax errors
- [ ] Functions have correct parameter order
- [ ] Tests in Step 7 will verify correctness
