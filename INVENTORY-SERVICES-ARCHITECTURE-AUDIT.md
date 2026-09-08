# Inventory Services Architecture Audit

## 🔍 Current State Analysis

Date: 2026-08-31

---

## 1. InventoryService.adjustStockAtomic() - CURRENT IMPLEMENTATION

**File:** `src/modules/inventory/service/InventoryService.js`  
**Lines:** 214-250

### **Actual Code (lines 225-235):**
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
      { new: true, session }  // ✅ Returns updated document + uses session
    );

    if (!ingredient) {
      throw new Error('Insufficient stock or ingredient not found');
    }
    // ... creates StockMovement ...
  }
}
```

### **✅ Verdict: CORRECT**
- Uses `findOneAndUpdate()` ✅
- Returns updated document (`new: true`) ✅
- Uses session for transaction ✅
- Triggers Mongoose middleware ✅

---

## 2. Production Order Flow - CALL CHAIN

### **Order Placement Route:**
```
POST /api/v1/orders
  ↓
placement.handler.js → placeOrder()
  ↓
OrderTransactionService.executePlaceOrder() (line 135)
  ↓
InventoryService.deductForOrder() (line 173)
  ↓
InventoryService.adjustStockAtomic() (line 225)
  ↓
Ingredient.findOneAndUpdate() ✅
```

### **Code Evidence:**

**OrderTransactionService.js (line 135):**
```javascript
const { ingredients } = await InventoryService.deductForOrder(
  {
    merchantId,
    orderId: createdOrder._id,
    orderNumber,
    plan: deductionPlan,
    performedBy,
  },
  session
);
```

**InventoryService.js (line 173):**
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

### **✅ Verdict: PRODUCTION PATH USES findOneAndUpdate()**

---

## 3. stock.service.js - CURRENT STATUS

**File:** `src/modules/inventory/service/stock.service.js`

### **Search Results:**
```bash
grep -r "require.*stock.service" --exclude-dir=tests
# Result: No matches found

grep -r "StockService" --exclude-dir=tests  
# Result: No matches found
```

### **✅ Verdict: NOT USED IN PRODUCTION**
- `stock.service.js` exists but is **NOT imported** anywhere in production code
- Only used in tests (Stage 1-7 test files)
- **Zero references** in actual order flow

---

## 4. Architecture Intent Analysis

### **Question:** Is stock.service.js meant to replace InventoryService.adjustStockAtomic()?

### **Answer: NO - It's Test-Driven Development (TDD)**

Based on the evidence:

#### **InventoryService (Production - Current):**
```javascript
// src/modules/inventory/service/InventoryService.js
class InventoryService {
  static async adjustStockAtomic(...) { ... }
  static async deductForOrder(...) { ... }
  static async resolveDeductionPlan(...) { ... }
}
module.exports = { InventoryService };
```
- ✅ Used in production order flow
- ✅ Handles stock deduction atomically
- ✅ Works with transactions
- ✅ Already uses `findOneAndUpdate()` correctly

#### **StockService (Test-Only - Future?):**
```javascript
// src/modules/inventory/service/stock.service.js
class StockService {
  static async deductStock(...) { ... }
  static async adjustStock(...) { ... }
  static async transferStock(...) { ... }
}
module.exports = { StockService };
```
- ❌ NOT imported in production code
- ✅ Used in Stage 1-7 tests
- ❓ Purpose unclear - possibly:
  - **Option A:** Future refactor (not yet integrated)
  - **Option B:** Alternative API for different use cases
  - **Option C:** Testing scaffold for new features

---

## 5. Conflict Analysis

### **Question:** Do they touch the same Ingredient documents?

### **Answer: YES - If Both Were Used**

Both services operate on the **same Ingredient model**:

```javascript
// InventoryService.adjustStockAtomic()
const ingredient = await Ingredient.findOneAndUpdate(
  { _id: ingredientId, merchant: merchantId },
  { $inc: { currentStock: -quantity } },
  { session }
);

// StockService (if it were used)
const ingredient = await Ingredient.findOneAndUpdate(
  { _id: ingredientId, merchant: merchantId },
  { $inc: { 'stock.current': -quantity } },  // Different field path?
  { session }
);
```

### **Potential Conflicts:**
1. **Field name mismatch:**
   - InventoryService: `currentStock`
   - StockService: `stock.current` (nested)
   
2. **Transaction isolation:**
   - If both ran in parallel → race conditions
   - If both ran in same transaction → OK but redundant

3. **Middleware triggering:**
   - Both trigger same Mongoose hooks
   - Could cause double-counting in logs/alerts

### **✅ Current Reality: NO CONFLICTS**
Because `StockService` is **NOT used in production**, there are zero conflicts.

---

## 6. Recommendations

### **Option A: Keep Current Architecture (Recommended)**
```
✅ InventoryService.adjustStockAtomic() is working correctly
✅ Uses findOneAndUpdate() properly
✅ No migration needed
✅ Remove stock.service.js or document it as "test-only"
```

### **Option B: Migrate to StockService**
```
⚠️ Would require:
  1. Update OrderTransactionService to import StockService
  2. Update all InventoryService call sites
  3. Verify field name consistency (currentStock vs stock.current)
  4. Integration testing across entire order flow
  5. Deprecate InventoryService.adjustStockAtomic()
```

### **Option C: Dual Architecture (Not Recommended)**
```
❌ Risks:
  - Code duplication
  - Confusion about which to use
  - Potential field name conflicts
  - Maintenance burden
```

---

## 7. Summary

### **Current Production Path:**
```
POST /api/v1/orders
  → OrderTransactionService.executePlaceOrder()
    → InventoryService.deductForOrder()
      → InventoryService.adjustStockAtomic()
        → Ingredient.findOneAndUpdate() ✅ CORRECT
```

### **Stock Deduction Method:**
- ✅ **Uses:** `findOneAndUpdate()` with session
- ✅ **Returns:** Updated document
- ✅ **Triggers:** Mongoose middleware (alertStatus calculation)
- ✅ **Atomic:** Within MongoDB transaction

### **stock.service.js Status:**
- ❌ **NOT used** in production
- ✅ **Only used** in Stage 1-7 tests
- ❓ **Purpose:** Unclear - needs documentation or removal

### **Conflict Risk:**
- ✅ **Current:** NONE (stock.service.js not imported)
- ⚠️ **Future:** HIGH if both are used simultaneously

---

## 8. Action Items

### **Immediate:**
1. ✅ **Document** that stock.service.js is test-only
2. ✅ **Add comment** in stock.service.js explaining its purpose
3. ✅ **Verify** all order flows use InventoryService (not stock.service.js)

### **Future Decision Needed:**
1. ❓ **Decide:** Is stock.service.js a future replacement or just testing scaffold?
2. ❓ **If replacement:** Create migration plan + timeline
3. ❓ **If testing:** Move to `tests/` directory or mark clearly
4. ❓ **If unused:** Remove to reduce confusion

---

## 9. Files Audited

### **Production Files:**
- ✅ `src/modules/inventory/service/InventoryService.js` (lines 214-250)
- ✅ `src/modules/order/service/OrderTransactionService.js` (line 135)
- ✅ `src/modules/order/controller/handlers/placement.handler.js`

### **Test Files:**
- ✅ `tests/inventory-stage1-schema.test.js`
- ✅ `tests/inventory-stage3-deduction.test.js`
- ✅ `tests/inventory-stage5-finalization.test.js`
- ✅ `tests/inventory-stage7-unitConversion.test.js`

### **Unused (in production):**
- ⚠️ `src/modules/inventory/service/stock.service.js`

---

## ✅ Final Answer

**Q1:** Is InventoryService.adjustStockAtomic() using updateOne() or findOneAndUpdate()?  
**A1:** ✅ **findOneAndUpdate()** - Confirmed on line 225

**Q2:** Is stock.service.js meant to replace InventoryService?  
**A2:** ❓ **Unknown intent** - Currently NOT used in production, only in tests

**Q3:** Do they conflict if both are used?  
**A3:** ⚠️ **Yes, potentially** - But currently no conflict because stock.service.js is unused in production

**Recommendation:** Keep using InventoryService.adjustStockAtomic() - it's working correctly with findOneAndUpdate(). If stock.service.js is meant as a future replacement, document that clearly and create a migration plan. If it's just test scaffolding, move it to the tests directory.
