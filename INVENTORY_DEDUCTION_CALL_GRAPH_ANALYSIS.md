# Inventory Deduction Call Graph Analysis

## Executive Summary

**Status: ONE active deduction system + TWO dead code paths**

The real order-placement flow uses **a single, simple deduction path**:
```
OrderTransactionService.executePlaceOrder()
  → InventoryService.resolveDeductionPlan()      [pre-validate]
  → InventoryService.deductForOrder()            [atomic in transaction]
    → InventoryService.adjustStockAtomic()       [per-ingredient deduction]
      → Ingredient.findOneAndUpdate()            [atomic stock check + deduct]
```

The `stock.service.js` reserve-then-finalize pattern and `inventory.service.js` deductStockItems are **not called from production code**—only test files.

---

## 1. PRIMARY DEDUCTION SYSTEM (ACTIVE) ✅

### Entry Points

**Both customer and staff order placement call the same path:**

#### Path 1: Customer QR Orders
```
OrderTransactionService.executePlaceOrder() [line 41]
  ├─ resolveDeductionPlan(orderItems, merchantId) [line 77, before transaction]
  └─ session.withTransaction(async () => {
       deductForOrder({merchantId, orderNumber, plan, performedBy}, session) [line 138]
     })
```

#### Path 2: Staff Orders
```
OrderService.staffPlaceOrder() [location: src/modules/order/service/OrderService.js]
  ├─ resolveDeductionPlan(orderItems, merchantId) [line 376, before transaction]
  └─ session.withTransaction(async () => {
       deductForOrder({merchantId, orderNumber, plan, performedBy}, session) [line 459]
     })
```

### Call Flow (Detailed)

```
PHASE 0: Pre-transaction (read-only, NO session)
  resolveDeductionPlan(orderItems, merchantId)
    └─ For each orderItem:
       ├─ getIngredientUsageForMenuItem(menuItemId, merchantId)
       │   └─ Check: does merchant have inventory module enabled?
       │       ├─ If NO: return empty array (skip deduction)
       │       └─ If YES: find recipe, list ingredients required
       └─ Aggregate by ingredient ID → deductionPlan array
           [{ ingredientId, totalQuantity }, ...]

PHASE 1: Atomic transaction with MongoDB session
  await session.withTransaction(async () => {
    
    // Create order document
    [order] = await Order.create([{...}], {session})
    
    // Deduct inventory (same transaction)
    deductForOrder({
      merchantId,
      orderNumber,
      plan: deductionPlan,  // ← Pre-computed from Phase 0
      performedBy
    }, session)  // ← Session passed in (CRITICAL)
    
  });
```

### Active Deduction Code

#### InventoryService.resolveDeductionPlan (lines 139-163)

```javascript
static async resolveDeductionPlan(orderItems, merchantId) {
  const aggregated = new Map();

  for (const orderItem of orderItems) {
    const ingredientUsage = await this.getIngredientUsageForMenuItem(
      orderItem.menuItem,
      merchantId
    );

    // Aggregates: e.g., "2kg chicken + 1kg tomato"
    for (const usage of ingredientUsage) {
      const key = usage.ingredientId.toString();
      const lineQty = usage.quantity * orderItem.quantity;
      if (aggregated.has(key)) {
        aggregated.get(key).totalQuantity += lineQty;
      } else {
        aggregated.set(key, {
          ingredientId: usage.ingredientId,
          totalQuantity: lineQty,
        });
      }
    }
  }

  return Array.from(aggregated.values());
}
```

#### InventoryService.deductForOrder (lines 165-187)

```javascript
static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session) {
  if (!session) {
    throw new Error('deductForOrder requires a MongoDB session');
  }

  const reference = `Order ${orderNumber}`;
  const ingredients = [];

  // ← CRITICAL: All deductions in same transaction
  for (const line of plan) {
    const ingredient = await this.adjustStockAtomic(
      merchantId,
      line.ingredientId,
      line.totalQuantity,
      'out',
      'order_consumption',
      reference,
      performedBy,
      session  // ← Passed to atomic deduction
    );
    ingredients.push(ingredient);
  }

  return { ingredients, deductions: plan };
}
```

#### InventoryService.adjustStockAtomic (lines 212-270)

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
    // ✅ ATOMIC: Check + deduct in single operation
    const ingredient = await Ingredient.findOneAndUpdate(
      {
        _id: ingredientId,
        merchant: merchantId,  // ← IDOR protection
        currentStock: { $gte: quantity },  // ← Atomic check
      },
      {
        $inc: { currentStock: -quantity },  // ← Atomic deduct
      },
      { new: true, session }  // ← Within transaction
    );

    if (!ingredient) {
      throw new Error('Insufficient stock or ingredient not found');
    }

    // Create audit trail
    await InventoryRepository.createStockMovements(
      [
        {
          merchant: merchantId,
          ingredient: ingredientId,
          type,           // 'out'
          quantity,
          previousStock: ingredient.currentStock + quantity,
          newStock: ingredient.currentStock,
          reason,         // 'order_consumption'
          reference,      // 'Order #12345'
          cost,
          performedBy,
        },
      ],
      { session }  // ← Within transaction
    );

    return ingredient;
  }
  // ... for 'in' type (stock inbound)
}
```

**Key characteristics of the active system:**
- ✅ Direct single-step deduction (no reservation state)
- ✅ Atomic: Stock check + deduction in one `findOneAndUpdate` operation
- ✅ Transaction: All within MongoDB session → ACID guarantee
- ✅ Merchant-scoped: Every query includes `merchant: merchantId` filter
- ✅ Audit trail: StockMovement created for each deduction
- ✅ Fail-fast: If any ingredient insufficient, entire transaction rolls back

---

## 2. DEAD CODE PATH 1: `inventory.service.js`

### Location

`src/modules/inventory/service/inventory.service.js` (different file from active `InventoryService.js`)

### Methods Defined

1. **deductStockItems()** (lines 130-188)
   ```javascript
   static async deductStockItems(merchantId, items, orderId, performedBy, options = {}) {
     // Validate availability
     const validation = await InventoryRepository.validateStockAvailability(items, {session});
     
     // Deduct via InventoryRepository.deductStock()
     for (const item of items) {
       const updatedIngredient = await InventoryRepository.deductStock(
         item.ingredientId,
         merchantId,
         item.quantity,
         {session}
       );
     }
   }
   ```

2. **adjustStock()** (lines 25-119)
   - Generic stock adjustment (used for manual staff adjustments, PO receipts)
   - NOT used during order placement

3. **batchAdjustStock()** (lines 286-318)
   - Batch version of adjustStock()
   - For multiple manual adjustments at once

### Why Dead Code

- **Never imported in production:** Module exports (index.js, line 1) explicitly re-export the capitalized `InventoryService.js` (from `./service/InventoryService.js`), NOT this file
- **Never called from order flow:** OrderTransactionService and OrderService never import or call `inventory.service.js`
- **Used only in tests:**
  - `tests/inventory-unified-api.test.js` line 28 (checks module exports)
  - `tests/inventory-deduction.test.js` (deductStockItems tests)

### Module Architecture (Clarifies Why)

`src/modules/inventory/index.js`:
```javascript
module.exports = {
  InventoryService: require('./service/InventoryService.js').InventoryService,  // ← ACTIVE (capitalized)
  InventoryRepository: require('./repository/InventoryRepository.js').InventoryRepository,
  InventoryController: require('./controller/inventory.controller'),
  inventoryValidators: require('./validators/inventory.validator'),
};
```

When OrderService does:
```javascript
const { InventoryService } = require('../../inventory');
InventoryService.deductForOrder(...);
```

It imports the **capitalized `InventoryService.js`**, NOT the lowercase `inventory.service.js`.

The lowercase module is orphaned—defined but never imported.

---

## 3. DEAD CODE PATH 2: `stock.service.js` (Reserve-Then-Finalize Pattern)

### Location

`src/modules/inventory/service/stock.service.js`

### Three-Stage Pattern Defined

**Stage 1: Reserve**
```javascript
async function reserveIngredients(orderId, userId) {
  // Increment reservedStock for each ingredient (deferred deduction)
  // Atomic check: (currentStock - reservedStock) >= reserveQty
}
```

**Stage 2: Deduct (Direct Alternative)**
```javascript
async function deductIngredients(orderId, userId) {
  // Direct deduction (same as active path but standalone)
  // Atomic check: currentStock >= deductQty
}
```

**Stage 3: Finalize**
```javascript
async function finalizeIngredients(orderId, userId) {
  // Convert reserved → consumed
  // Atomic: Decrement both reservedStock AND currentStock
}
```

### Supporting Functions

- `reserveIngredientAtomic()` — Atomic reservation operation
- `deductIngredientAtomic()` — Atomic direct deduction
- `finalizeIngredientAtomic()` — Atomic finalization operation
- `releaseReservations()` — Undo reservations on error
- `rollbackDeductions()` — Undo deductions on error
- `rollbackFinalizations()` — Undo finalizations on error

### Why Dead Code

- **Never imported in production:** No `require('./stock.service.js')` in OrderTransactionService or OrderService
- **No integration points:** Reserved for future use (comment: "Three-stage deduction pattern: 1. reserve → finalize → release")
- **Used only in tests:**
  - `tests/inventory-stage3-deduction.test.js` (Stage 3)
  - `tests/inventory-stage4-reservation.test.js` (Stage 4)
  - `tests/inventory-stage5-finalization.test.js` (Stage 5)

### Design Intent

Appears to be a proposed multi-stage workflow:
1. When order placed → reserve ingredients (pessimistic lock)
2. When order approved → finalize (deduct from reserved)
3. When order canceled → release (unreserve)

**But the production code chose the simpler approach:** Single atomic deduction in the order transaction.

---

## 4. REPOSITORY-LEVEL DEDUCTION: `InventoryRepository.deductStock()`

### Location

`src/modules/inventory/repository/inventory.repository.js` (lines 148-168)

### Implementation

```javascript
static async deductStock(ingredientId, merchantId, quantity, options = {}) {
  const { session } = options;
  let query = Ingredient.findOneAndUpdate(
    {
      _id: ingredientId,
      merchant: merchantId,
    },
    { $inc: { currentStock: -quantity } },
    { new: true }
  );
  if (session) query = query.session(session);
  return query.exec();
}
```

### Call Site

- **Only called from:** `inventory.service.js` line 153 (dead code path)
- **Not called from:** Active InventoryService.deductForOrder() path

The active path uses `Ingredient.findOneAndUpdate()` directly via `adjustStockAtomic()`, not this repository method.

---

## 5. Complete Call Site Table

| **Method** | **File** | **Called By** | **Condition** | **Status** |
|---|---|---|---|---|
| `deductForOrder()` | InventoryService.js | OrderTransactionService:138 | All customer QR orders | ✅ ACTIVE |
| `deductForOrder()` | InventoryService.js | OrderService:459 | All staff orders | ✅ ACTIVE |
| `resolveDeductionPlan()` | InventoryService.js | OrderTransactionService:77 | Pre-validation (all orders) | ✅ ACTIVE |
| `resolveDeductionPlan()` | InventoryService.js | OrderService:376 | Pre-validation (all orders) | ✅ ACTIVE |
| `adjustStockAtomic()` | InventoryService.js | deductForOrder():174 | Per-ingredient deduction | ✅ ACTIVE |
| `getIngredientUsageForMenuItem()` | InventoryService.js | resolveDeductionPlan():154 | Recipe lookup for menu item | ✅ ACTIVE |
| `deductStockItems()` | inventory.service.js | (none) | Would deduct from items array | ❌ DEAD |
| `deductStock()` | InventoryRepository.js | inventory.service.js:153 | Dead code only | ❌ DEAD |
| `deductIngredients()` | stock.service.js | (none in production) | Stage 3 (reserved, unused) | ❌ DEAD |
| `reserveIngredients()` | stock.service.js | (none in production) | Stage 4 (reserved, unused) | ❌ DEAD |
| `finalizeIngredients()` | stock.service.js | (none in production) | Stage 5 (reserved, unused) | ❌ DEAD |

---

## 6. Answer to Your Specific Questions

### Q1: Which deduction system is actually called by OrderTransactionService?

**Answer: ONLY the active path**

```
OrderTransactionService.executePlaceOrder()
  → InventoryService.deductForOrder()
    → InventoryService.adjustStockAtomic()
      → Ingredient.findOneAndUpdate()
```

The flow resolves the deduction plan **before the transaction**, then executes it **inside the transaction**.

**The stock.service.js and inventory.service.js paths are never called.**

### Q2: Is the other path dead code?

**Answer: YES, both are dead code**

- **stock.service.js:** Three-stage reserve-then-finalize pattern exists but is never called from any production code. Only used in tests. Appears to be a design exploration that was superseded.

- **inventory.service.js:** Contains `deductStockItems()` which is never called from OrderService or OrderTransactionService. The module is orphaned despite being defined. Test-only.

### Q3: Does the other path need the branch-scoping fix?

**Answer: NO, because it's dead code. BUT:**

If you ever activate the three-stage pattern in stock.service.js (reserve-then-finalize), it **ALREADY HAS branch-scoping** implemented:

- `deductIngredientAtomic()` (line 27) requires `branchId` in context
- `reserveIngredientAtomic()` (line 241) requires `branchId` in context  
- `finalizeIngredientAtomic()` (line 533) requires `branchId` in context
- All three create `StockHistory` records with `branch: branchId`

The refactored code you wrote earlier **already included** branch context in stock.service.js, even though that path isn't used.

If you need to activate it later, it's already branch-aware.

### Q4: Single surface area for branch-scoping?

**Answer: YES**

For **production order placement**, you only need to update the active path:
- `InventoryService.resolveDeductionPlan()` — Already merchant-scoped ✅
- `InventoryService.deductForOrder()` — NO branch context needed (uses pre-computed plan)
- `InventoryService.adjustStockAtomic()` — **NEEDS branchId** ❌

The key issue: The current active path does NOT carry branch context through the deduction. It deducts from the global ingredient pool without per-branch isolation.

---

## 7. Branch-Scoping Impact Analysis

### Current State (Before Branch Migration)

The active deduction path:
- ✅ Merchant-scoped (merchant: merchantId in all queries)
- ❌ NOT branch-scoped (no branchId context)
- ❌ All branches share the same ingredient stock pool

### What Needs Updating for Branch Isolation

**ONLY the active path needs updates:**

1. **InventoryService.adjustStockAtomic()** (lines 212-270)
   - Currently NO branch context
   - **Action:** Add branchId parameter, include in StockMovement audit record
   - Pass branchId through from deductForOrder()

2. **InventoryService.deductForOrder()** (lines 165-187)
   - Currently receives merchantId + plan
   - **Action:** Extract branchId from order object, pass to adjustStockAtomic()

3. **InventoryService.getIngredientUsageForMenuItem()** (lines 272+)
   - Returns ingredient requirements per menu item (recipe-based)
   - **Action:** No branch changes needed (recipes are merchant-wide)

### What Does NOT Need Updating

- `inventory.service.js` (dead code)
- `stock.service.js` (dead code, already has branchId context if activated)
- `InventoryRepository.deductStock()` (dead code)

---

## 8. Recommendation

### For Branch-Level Inventory Isolation

**Update ONLY the active path:**

1. Modify `deductForOrder()` to extract order.branch and pass to adjustStockAtomic()
2. Modify `adjustStockAtomic()` to accept branchId and include in StockMovement

**Do NOT update:**
- stock.service.js (already has branchId, dead code)
- inventory.service.js (dead code)

**Surface area:** 2 methods, ~15 lines of changes

### If You Want to Consolidate Code

Consider either:
1. **Remove dead code** (inventory.service.js, stock.service.js) to reduce surface area
2. **Or:** Keep as experimental/future-use but document clearly as "not currently used"

---

## Conclusion

**Single active deduction system + two dead code paths**

- ✅ Production order placement uses ONE simple path: `deductForOrder()` → `adjustStockAtomic()`
- ❌ `inventory.service.js` deductStockItems() is never called
- ❌ `stock.service.js` three-stage pattern is never called (appears to be a design that was replaced)
- ✅ For branch isolation, **only update the active path** (InventoryService.deductForOrder + adjustStockAtomic)
- ✅ Low surface area: 2 methods, straightforward changes

**No duplication risk** because the dead code isn't executed, so you won't accidentally miss updating duplicated logic.
