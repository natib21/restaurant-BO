# Production Code vs Test Code: Per-Branch Isolation Comparison

## The Problem

You asked: "Is the IDOR fix in adjustStockAtomic()? Does it include branch filtering?"

**Answer**: 
- ✅ YES: IDOR fix (merchant filter) IS present in production code
- ❌ NO: Branch filter is NOT present in production code

---

## Side-by-Side Code Comparison

### PRODUCTION CODE: InventoryService.adjustStockAtomic()

**File**: `src/modules/inventory/service/InventoryService.js` (Line 212)

```javascript
static async adjustStockAtomic(
  merchantId,
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
    // ✅ FIXED: Use findOneAndUpdate instead of updateOne to trigger Mongoose hooks
    // This ensures alertStatus is recalculated after deduction
    const ingredient = await Ingredient.findOneAndUpdate(
      {
        _id: ingredientId,
        merchant: merchantId,                    // ✅ IDOR FIX PRESENT
        currentStock: { $gte: quantity },
      },
      {
        $inc: { currentStock: -quantity },
      },
      { new: true, session }
    );

    if (!ingredient) {
      throw new Error('Insufficient stock or ingredient not found');
    }

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
          // ❌ NO branch recorded in audit trail
        },
      ],
      { session }
    );

    return ingredient;
  }

  // ... handle 'in' type ...
}
```

---

### TEST CODE: stock.service.js deductIngredientAtomic()

**File**: `src/modules/inventory/service/stock.service.js` (Line ~30)

```javascript
async function deductIngredientAtomic(ingredientId, deductQty, { orderId, userId, merchantId, branchId }) {
  if (!branchId) {
    throw new Error('branchId is required for deductIngredientAtomic');
  }
  
  // Atomic update with stock availability condition
  // ✅ SECURITY: Include merchant AND branch filter for true isolation
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId,
      merchant: merchantId,      // ✅ IDOR FIX
      branch: branchId,          // ✅ BRANCH FILTER
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
    const ingredient = await Ingredient.findById(ingredientId);
    
    if (!ingredient) {
      throw new AppError(`Ingredient ${ingredientId} not found`, 404);
    }
    
    if (!ingredient.isActive) {
      throw new AppError(`Ingredient ${ingredient.name} is inactive`, 400);
    }
    
    throw new AppError(
      `Insufficient stock for ${ingredient.name}. ` +
      `Available: ${ingredient.currentStock}, Required: ${deductQty}`,
      409
    );
  }

  // Record deduction in history
  await StockHistory.create({
    ingredient: ingredientId,
    merchant: merchantId,
    branch: branchId,           // ✅ BRANCH RECORDED IN AUDIT
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

## Query Comparison

### PRODUCTION Query (InventoryService.adjustStockAtomic)

```javascript
{
  _id: ingredientId,
  merchant: merchantId,
  currentStock: { $gte: quantity }
}
```

**Filters**: 2
- `_id` (primary key)
- `merchant` (IDOR protection)
- **Missing**: `branch` (isolation broken)

---

### TEST Query (stock.service.js deductIngredientAtomic)

```javascript
{
  _id: ingredientId,
  merchant: merchantId,
  branch: branchId,
  currentStock: { $gte: deductQty },
  isActive: true
}
```

**Filters**: 5
- `_id` (primary key)
- `merchant` (IDOR protection)
- `branch` (branch isolation)
- `currentStock` (availability check)
- `isActive` (soft delete support)

---

## Function Signature Comparison

### PRODUCTION: deductForOrder()

```javascript
static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session)
```

**Parameters**: `{ merchantId, orderNumber, plan, performedBy }`
- ✅ Has merchantId
- ❌ **Missing branchId** (can't pass branch context to adjustStockAtomic)

---

### TEST: deductIngredientAtomic()

```javascript
async function deductIngredientAtomic(
  ingredientId, 
  deductQty, 
  { orderId, userId, merchantId, branchId }  // ✅ branchId included
)
```

**Parameters**: `{ merchantId, branchId, orderId, userId }`
- ✅ Has merchantId
- ✅ Has branchId

---

## Call Chain Comparison

### PRODUCTION Call Chain (BROKEN)

```
OrderTransactionService.executePlaceOrder()
  ↓
  InventoryService.deductStockFromOrder(merchantId, orderItems, performedBy)
    ↓
    InventoryService.deductForOrder({ merchantId, orderNumber, plan, performedBy }, session)
      ↓
      InventoryService.adjustStockAtomic(
        merchantId,           // ← Only merchantId, no branchId
        ingredientId,
        quantity,
        'out',
        'order_consumption',
        reference,
        performedBy,
        session
      )
        ↓
        Query: { _id, merchant }  // ← Can match ANY branch's ingredient
```

**Result**: Cross-branch deduction possible ❌

---

### TEST Call Chain (CORRECT)

```
Test creates Order with branch context
  ↓
  deductIngredientAtomic(ingredientId, qty, { 
    merchantId, 
    branchId,    // ← Branch explicitly passed
    orderId, 
    userId 
  })
    ↓
    Query: { _id, merchant, branch }  // ← Branch-specific match only
```

**Result**: Cross-branch deduction prevented ✅

---

## Audit Trail Comparison

### PRODUCTION Stock Movement Record

```javascript
{
  merchant: merchantId,
  ingredient: ingredientId,
  type: 'order_consumption',
  quantity: 2,
  previousStock: 10,
  newStock: 8,
  reason: 'Order #123',
  reference: 'Order 123',
  cost: 0,
  performedBy: userId
  // ❌ NO branch field
}
```

**Audit Risk**: Can't determine which branch consumed stock.

---

### TEST Stock History Record (StockHistory model)

```javascript
{
  ingredient: ingredientId,
  merchant: merchantId,
  branch: branchId,           // ✅ Branch recorded
  action: 'USED',
  quantity: 2,
  stockBefore: 10,
  stockAfter: 8,
  unit: 'kg',
  // Other fields...
}
```

**Audit Safe**: Branch context preserved.

---

## Verdict: What's Actually Working?

| Component | Production | Test Code | Status |
|-----------|-----------|-----------|--------|
| IDOR protection (merchant filter) | ✅ YES | ✅ YES | **Both OK** |
| Branch isolation (branch filter) | ❌ NO | ✅ YES | **MISMATCH** |
| Branch parameter in deductForOrder() | ❌ NO | ✅ YES | **MISMATCH** |
| Branch in audit trail | ❌ NO | ✅ YES | **MISMATCH** |
| Error messages show stock availability | ❌ Generic | ✅ Detailed | **Test Better** |
| Inventory module feature-flag check | ✅ YES | N/A | **Production Only** |

---

## The Real Situation

**You asked**: "Is the dead code or the existing code in good form?"

**Answer**:
- **Dead code** (stock.service.js): ✅ Well-implemented, includes all fixes
- **Existing code** (InventoryService.js): ❌ Has IDOR fix but missing branch isolation

The test code is more secure than the production code it's supposed to test!

---

## Recommendation

**Do NOT deploy** until:

1. [ ] Add `branchId` parameter to `deductForOrder()`
2. [ ] Add `branchId` parameter to `adjustStockAtomic()`
3. [ ] Update query filter to include `branch: branchId`
4. [ ] Update stock movement creation to include `branch`
5. [ ] Update all callers to pass `order.branch`
6. [ ] Run new tests to verify production code works
7. [ ] Verify no cross-branch stock depletion occurs

**Current State**: Per-branch isolation is **claimed but not enforced** in production.
