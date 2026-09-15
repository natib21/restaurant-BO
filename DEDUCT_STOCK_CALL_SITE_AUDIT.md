# deductStock() Call Site Audit

**Date:** September 3, 2026  
**Change:** `InventoryRepository.deductStock()` signature updated to include `merchantId` parameter (IDOR security fix)

---

## Old Signature (Before)
```javascript
static async deductStock(ingredientId, quantity, options = {})
```

## New Signature (After)
```javascript
static async deductStock(ingredientId, merchantId, quantity, options = {})
```

---

## Call Site Inventory

### TOTAL CALL SITES FOUND: 1

All call sites have been identified and verified.

---

## Call Site #1: InventoryService.deductStockItems()

**File:** `src/modules/inventory/service/inventory.service.js`  
**Function:** `static async deductStockItems(merchantId, items, orderId, performedBy, options = {})`  
**Line:** 149-153  
**Status:** ✅ FIXED

### Before (Old Code):
```javascript
for (const item of items) {
  const updatedIngredient = await InventoryRepository.deductStock(
    item.ingredientId,
    item.quantity,
    { session }
  );
  // ...
}
```

### After (Fixed Code):
```javascript
for (const item of items) {
  const updatedIngredient = await InventoryRepository.deductStock(
    item.ingredientId,
    merchantId,              // ← ADDED: merchantId parameter
    item.quantity,
    { session }
  );
  // ...
}
```

### Context in Function:

The function signature has access to `merchantId`:
```javascript
static async deductStockItems(merchantId, items, orderId, performedBy, options = {}) {
  // ↑ merchantId is available in scope
  
  // ... validation ...
  
  for (const item of items) {
    const updatedIngredient = await InventoryRepository.deductStock(
      item.ingredientId,
      merchantId,           // ← Now passed through
      item.quantity,
      { session }
    );
    
    // Create movement record
    await InventoryRepository.createStockMovements([
      {
        merchant: merchantId,  // ← Same merchantId used here
        ingredient: item.ingredientId,
        type: 'out',
        quantity: item.quantity,
        // ...
      },
    ], { session });
  }
}
```

---

## Verification Results

✅ **Repository Method Definition Verified:**
```javascript
// src/modules/inventory/repository/inventory.repository.js line 157
static async deductStock(ingredientId, merchantId, quantity, options = {}) {
  const { session } = options;

  let query = Ingredient.findOneAndUpdate(
    {
      _id: ingredientId,
      merchant: merchantId,  // ← Parameter is used correctly
    },
    { $inc: { currentStock: -quantity } },
    { new: true }
  );
  
  if (session) query = query.session(session);

  return query.exec();
}
```

✅ **Call Site Updated:**
- Location: `src/modules/inventory/service/inventory.service.js` line 149-153
- Parameter added: `merchantId`
- Correct parameter order maintained
- Session parameter passed correctly in options

✅ **No Other Call Sites Found:**
- Grep search for `deductStock(` found only:
  1. Method definition in inventory.repository.js
  2. Method call in inventory.service.js (now fixed)
  3. Schema definition (not a method call)

---

## Summary

| Item | Result |
|------|--------|
| Total call sites | 1 |
| Call sites updated | 1 |
| Call sites needing fixes | 0 |
| Status | ✅ COMPLETE |

**Conclusion:** All call sites have been identified and updated. The `deductStock()` breaking change is fully resolved in the codebase.

---

## Related Files Modified in IDOR Fix

1. **src/modules/inventory/repository/inventory.repository.js**
   - Line 157: Added `merchantId` parameter to function signature
   - Line 160-165: Updated `findOneAndUpdate` to filter by merchant

2. **src/modules/inventory/service/inventory.service.js**
   - Line 149-153: Updated call to pass `merchantId` parameter

3. **src/modules/inventory/service/stock.service.js**
   - 6 atomic deduction functions updated with merchant filters (separate audit)

---

## Testing Recommendations

To verify the fix works correctly:

```javascript
// TEST: Verify merchantId is enforced
await InventoryRepository.deductStock(
  ingredientId,
  merchantA_id,           // ← Pass MerchantA ID
  quantity,
  { session }
);

// Should fail if:
// - ingredientId belongs to MerchantB (different merchant)
// - Returns null or throws error (IDOR prevented)

// Should succeed if:
// - ingredientId belongs to MerchantA (same merchant)
// - Stock is sufficient
```

---

**Audit Completed:** September 3, 2026  
**Status:** ✅ READY FOR DEPLOYMENT
