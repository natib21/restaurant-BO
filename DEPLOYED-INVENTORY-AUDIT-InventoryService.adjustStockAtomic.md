# Audit: InventoryService.adjustStockAtomic() — The Deployed Path

**Date:** August 22, 2026  
**Purpose:** Verify whether production code uses atomic operations or naive read-modify-write pattern  
**Criticality:** 🔴 BLOCKS "Path B: System is stable" claim

---

## Code Under Review

**File:** `src/modules/inventory/service/InventoryService.js` (lines 176-227)  
**Actual execution path:** Called from `OrderService.js` line 445 on every order placement

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
  // For order deductions, type === 'out'
  if (type === 'out' || type === 'waste' || type === 'adjustment') {
    
    // QUERY OPERATION (line 186-191)
    const result = await InventoryRepository.updateIngredient(
      {
        _id: ingredientId,
        merchant: merchantId,
        currentStock: { $gte: quantity },  // ← ATOMIC CONDITION
      },
      {
        $inc: { currentStock: -quantity },  // ← ATOMIC UPDATE
      },
      { session }
    );

    // ERROR CHECK (line 193-195)
    if (result.modifiedCount === 0) {
      throw new Error('Insufficient stock or ingredient not found');
    }

    // READ AFTER UPDATE (line 197-201)
    const ingredient = await InventoryRepository.findIngredientOne(
      { _id: ingredientId, merchant: merchantId },
      { session }
    );

    // HISTORY RECORD (line 203-214)
    await InventoryRepository.createStockMovements([...]);

    return ingredient;
  }
  // ... other branches for 'in' type
}
```

---

## Audit Results

### ✅ ATOMIC UPDATE PATTERN — CORRECT

**Line 186-191: updateIngredient()**

Maps to: `InventoryRepository.updateIngredient()` → `Ingredient.updateOne(filter, update, options)`

**Query:**
```javascript
{
  _id: ingredientId,
  merchant: merchantId,
  currentStock: { $gte: quantity }  // ← GUARD
}
```

**Update:**
```javascript
{
  $inc: { currentStock: -quantity }  // ← ATOMIC OPERATOR
}
```

**Execution:** Single MongoDB `updateOne()` command with atomic `$gte` condition + `$inc` operator

✅ **VERDICT: ATOMIC** — MongoDB server handles this as single operation. No read-modify-write race condition here.

---

### ⚠️ HOOK FIRING — CRITICAL CONCERN

**Lines 197-201: Read after atomic update**

After the atomic `updateOne()`, the code calls:
```javascript
const ingredient = await InventoryRepository.findIngredientOne(
  { _id: ingredientId, merchant: merchantId },
  { session }
);
```

**Question:** Does this trigger Mongoose hooks for alertStatus recalculation?

**Answer: NO** ❌

**Why:**
- `updateOne()` bypasses ALL Mongoose hooks (`pre('save')`, `post('save')`, etc.)
- This is standard Mongoose behavior — document hooks don't fire on query-level updates
- The code then calls `findIngredientOne()` to RETRIEVE the document
- findOne() does NOT fire post hooks; it just loads the document from DB
- The retrieved document has stale `alertStatus` (unchanged since last save)

**Impact:**
- After deduction, `ingredient.currentStock` is correct (from DB)
- BUT `ingredient.alertStatus` is **NOT recalculated**
- The Stage 2 fix (`post-findOneAndUpdate` hook) is **NOT triggered**
- If stock dropped from OK → LOW, the document's `alertStatus` field is still 'OK' in memory
- When this stale document is returned to OrderService, status is incorrect

---

### 🔴 REAL SCENARIO: alertStatus Will Be Wrong

**Example order deduction:**

1. Ingredient: `{ _id: 123, currentStock: 25, minStock: 20, alertStatus: 'OK' }`
2. Recipe needs 10kg
3. `adjustStockAtomic()` executes:
   ```javascript
   updateOne({ currentStock: { $gte: 10 } }, { $inc: { currentStock: -10 } })
   // DB now: currentStock = 15
   ```
4. `findIngredientOne()` loads document:
   ```javascript
   // DB returns: { _id: 123, currentStock: 15, minStock: 20, alertStatus: 'OK' }
   // ↑ alertStatus still 'OK' because updateOne didn't trigger hooks
   ```
5. Returned to `OrderService` with `alertStatus: 'OK'` (WRONG — should be 'LOW')
6. Menu shows item as available when it's actually low stock
7. Next 15 customers order from this item thinking it's fully stocked

**Compounding:**
- `InventoryService.scheduleInventoryRealtimeEvents()` (line 97) receives stale `alertStatus`
- Sends notification with wrong status to real-time UI
- Reports show wrong alert status
- No LOW/CRITICAL alerts triggered

---

## Why Stage 2's Post-findOneAndUpdate Hook Doesn't Help

The Stage 2 fix adds this hook:

```javascript
ingredientSchema.post('findOneAndUpdate', async function(doc) {
  // Recalculate alertStatus on updated doc
  const newStatus = computeAlertStatus(doc.currentStock, doc.minStock);
  if (newStatus !== doc.alertStatus) {
    doc.alertStatus = newStatus;
    await doc.save();
  }
});
```

**Problem:** `adjustStockAtomic()` uses `updateOne()`, NOT `findOneAndUpdate()`

- `updateOne()` does NOT trigger `post('findOneAndUpdate')` hooks
- `updateOne()` does NOT trigger any document hooks at all
- The hook only fires for `.findOneAndUpdate()` method, not `.updateOne()`

**Proof:**
```javascript
// updateOne() — NO hooks fire
await Ingredient.updateOne({ ... }, { $inc: { currentStock: -10 } });

// findOneAndUpdate() — post hook DOES fire (would fix the problem)
await Ingredient.findOneAndUpdate({ ... }, { $inc: { currentStock: -10 } }, { new: true });
```

InventoryService uses the wrong method for this architecture.

---

## Severity Assessment

| Risk | Level | Details |
|------|-------|---------|
| **Race condition on stock deduction** | ✅ NONE | Atomic `$gte + $inc` is correct; MongoDB is serialized |
| **alertStatus staleness** | 🔴 CRITICAL | Will return stale status; real-time system mislead |
| **Alerts not triggering** | 🔴 CRITICAL | LOW/CRITICAL notifications won't fire |
| **Data integrity on DB** | ✅ OK | currentStock value itself is correct |
| **Audit trail (StockMovement)** | ✅ OK | History record is correct |

---

## Recommended Fix

**Option A: Switch from updateOne() to findOneAndUpdate()** (Recommended)

```javascript
// Line 186-191 in adjustStockAtomic()
// CHANGE THIS:
const result = await InventoryRepository.updateIngredient(
  {
    _id: ingredientId,
    merchant: merchantId,
    currentStock: { $gte: quantity },
  },
  {
    $inc: { currentStock: -quantity },
  },
  { session }
);

if (result.modifiedCount === 0) {
  throw new Error('Insufficient stock');
}

const ingredient = await InventoryRepository.findIngredientOne(...);

// TO THIS:
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
  throw new Error('Insufficient stock');
}

// Now post-findOneAndUpdate hook fires automatically
// alertStatus is recalculated
```

**Effort:** 20 minutes  
**Risk:** Low (same atomic guarantees, just different method)  
**Benefit:** alertStatus correctly updated, Stage 2 fix now applies

---

## Alternative: Manual alertStatus Update

If switching method is risky:

```javascript
const ingredient = await InventoryRepository.findIngredientOne(...);

// MANUALLY recalculate alertStatus (mimics what hook would do)
const newStatus = computeAlertStatus(ingredient.currentStock, ingredient.minStock);
if (newStatus !== ingredient.alertStatus) {
  ingredient.alertStatus = newStatus;
  await ingredient.save({ session });
}

return ingredient;
```

**Effort:** 30 minutes  
**Risk:** Medium (extra save() call, but same session)  
**Benefit:** Explicit; doesn't rely on hooks

---

## Summary

| Claim | Evidence | Verdict |
|-------|----------|---------|
| "Atomic $gte check prevents race condition" | ✅ `updateOne({ currentStock: { $gte: qty } }, { $inc: { ... } })` | CORRECT |
| "Stage 2 hook fires after deduction" | ❌ `updateOne()` doesn't trigger `post('findOneAndUpdate')` hooks | WRONG |
| "alertStatus is recalculated after deduction" | ❌ Stale document returned; no hook fires; status not updated | WRONG |
| "System is stable as-is" | ⚠️ Stock values OK, but status system broken | PARTIALLY BROKEN |

---

## Path B Revision

**Original claim:** "Current single-deduction model is production-stable"

**Updated assessment:** NOT stable for alertStatus. Correct deduction but broken notification/status system.

**Required fix for Path B stability:**
```
Day 0: Switch adjustStockAtomic() to use findOneAndUpdate() instead of updateOne()
       (or manually recalculate alertStatus)
Day 1: Add concurrency test verifying alertStatus updates on deduction
Day 2: Stage 6 tests (override expiration, CRITICAL-always-reject)
Day 3: Deploy with confidence
```

**New time estimate:** 3 days (not 1 week)  
**New blocker count:** 1 (must fix alertStatus hook firing)

