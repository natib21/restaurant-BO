# InventoryService Audit: deductForOrder() & adjustStockAtomic()

**CRITICAL FINDINGS**

---

## Current Code

### 1. `deductForOrder()` — Line 165

```javascript
static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session) {
  if (!session) {
    throw new Error('deductForOrder requires a MongoDB session');
  }

  const reference = `Order ${orderNumber}`;
  const ingredients = [];

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
    ingredients.push(ingredient);
  }

  return { ingredients, deductions: plan };
}
```

**Analysis**:
- ✅ Takes `merchantId` as parameter
- ❌ **NO `branchId` parameter** — order branch context is completely missing
- ❌ Passes only `merchantId` to `adjustStockAtomic()` — no branch context

---

### 2. `adjustStockAtomic()` — Line 212

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
        merchant: merchantId,
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
        },
      ],
      { session }
    );

    return ingredient;
  }

  // ... [rest of function for 'in' type]
}
```

---

## CRITICAL ISSUES IDENTIFIED

### Issue #1: No Branch Parameter in deductForOrder()

**Current**: 
```javascript
static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session)
```

**Should Be**:
```javascript
static async deductForOrder({ merchantId, branchId, orderNumber, plan, performedBy }, session)
```

**Impact**: Branch context is lost before reaching `adjustStockAtomic()`.

---

### Issue #2: adjustStockAtomic() Missing Branch Filter

**Current Query**:
```javascript
{
  _id: ingredientId,
  merchant: merchantId,                    // ← IDOR protection: YES
  currentStock: { $gte: quantity },
}
```

**Should Be**:
```javascript
{
  _id: ingredientId,
  merchant: merchantId,                    // ← IDOR protection: ✅ PRESENT
  branch: branchId,                        // ← BRANCH ISOLATION: ❌ MISSING
  currentStock: { $gte: quantity },
}
```

**Critical Gap**: 
- ✅ IDOR fix IS present (merchant filter)
- ❌ Branch filter NOT present
- **Result**: Branch A order can deplete Branch B's ingredient stock (per-branch isolation broken)

---

### Issue #3: Stock Movement Not Recording Branch

**Current**:
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
      // ❌ NO branch field recorded
    },
  ],
  { session }
);
```

**Should Include**:
```javascript
{
  merchant: merchantId,
  branch: branchId,                        // ← MISSING
  ingredient: ingredientId,
  type,
  quantity,
  previousStock: ingredient.currentStock + quantity,
  newStock: ingredient.currentStock,
  reason,
  reference,
  cost,
  performedBy,
}
```

**Impact**: Audit trail doesn't record which branch consumed the stock.

---

## Summary: Is Per-Branch Isolation Working in Production?

| Component | Status | Details |
|-----------|--------|---------|
| **stock.service.js** | ✅ FIXED | Atomic functions filter by merchant + branch |
| **InventoryService.adjustStockAtomic()** | ❌ BROKEN | Query filters by merchant only, no branch filter |
| **InventoryService.deductForOrder()** | ❌ BROKEN | No branchId parameter, can't pass branch context |
| **Stock movements audit trail** | ❌ BROKEN | Doesn't record which branch performed deduction |

**Verdict**: **Per-branch isolation is NOT working in the production code path.**

The fix was applied to `stock.service.js` (test code), but the REAL code path used by orders (`InventoryService.adjustStockAtomic()`) was not updated.

---

## Call Chain Analysis

```
OrderTransactionService.executePlaceOrder()
  ↓
  InventoryService.deductStockFromOrder(merchantId, orderItems, performedBy)
    ↓
    InventoryService.deductForOrder({ merchantId, orderNumber, plan, performedBy }, session)
      ↓
      (LOST: no branch context here)
      ↓
      InventoryService.adjustStockAtomic(
        merchantId,              // ← Branch is NOT passed
        ingredientId,
        quantity,
        'out',
        'order_consumption',
        reference,
        performedBy,
        session
      )
        ↓
        Ingredient.findOneAndUpdate({
          _id: ingredientId,
          merchant: merchantId,
          currentStock: { $gte: quantity },
          // ❌ NO branch filter — can match ANY branch's ingredient
        })
```

---

## Required Fixes for Production Deployment

### Fix 1: Add branch parameter to deductForOrder()

**File**: `src/modules/inventory/service/InventoryService.js` (Line 165)

```javascript
// BEFORE
static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session) {

// AFTER
static async deductForOrder({ merchantId, branchId, orderNumber, plan, performedBy }, session) {
```

Then pass branchId to adjustStockAtomic():
```javascript
const ingredient = await this.adjustStockAtomic(
  merchantId,
  branchId,              // ← ADD THIS
  line.ingredientId,
  line.totalQuantity,
  'out',
  'order_consumption',
  reference,
  performedBy,
  session
);
```

---

### Fix 2: Add branch parameter and filter to adjustStockAtomic()

**File**: `src/modules/inventory/service/InventoryService.js` (Line 212)

```javascript
// BEFORE
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
)

// AFTER
static async adjustStockAtomic(
  merchantId,
  branchId,              // ← ADD THIS
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  session,
  cost = 0
)
```

Update the query:
```javascript
// BEFORE
const ingredient = await Ingredient.findOneAndUpdate(
  {
    _id: ingredientId,
    merchant: merchantId,
    currentStock: { $gte: quantity },
  },
  ...
);

// AFTER
const ingredient = await Ingredient.findOneAndUpdate(
  {
    _id: ingredientId,
    merchant: merchantId,
    branch: branchId,      // ← ADD THIS
    currentStock: { $gte: quantity },
  },
  ...
);
```

---

### Fix 3: Record branch in stock movements

**File**: `src/modules/inventory/service/InventoryService.js` (Line 240)

```javascript
// BEFORE
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
    },
  ],
  { session }
);

// AFTER
await InventoryRepository.createStockMovements(
  [
    {
      merchant: merchantId,
      branch: branchId,      // ← ADD THIS
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

### Fix 4: Update all callers of deductForOrder()

Need to find all places that call `deductStockFromOrder()` or `deductForOrder()` and pass branchId:

```javascript
// BEFORE
await this.deductForOrder(
  {
    merchantId,
    orderNumber: 'Unknown',
    plan,
    performedBy,
  },
  session
);

// AFTER
await this.deductForOrder(
  {
    merchantId,
    branchId: order.branch,  // ← ADD THIS (get from order object)
    orderNumber: 'Unknown',
    plan,
    performedBy,
  },
  session
);
```

---

## Status

- [x] Identified that stock.service.js was fixed (test code only)
- [x] Identified that InventoryService.adjustStockAtomic() is NOT fixed (production code)
- [x] Identified missing branch parameter in deductForOrder()
- [x] Identified missing branch filter in query
- [x] Identified missing branch in audit trail
- [ ] Apply fixes to production code
- [ ] Test fixes
- [ ] Deploy

---

## Conclusion

**The per-branch isolation fix exists in test code (stock.service.js) but NOT in production code (InventoryService.js).**

This is a **CRITICAL BUG**: Orders from Branch A can still deplete stock meant for Branch B, defeating the entire purpose of the branch isolation feature.

**Immediate action required**: Apply the three fixes above to InventoryService.js before deploying to production.
