# Refund Safety Validation — COMPLETE

## Summary
✅ **All requested safety checks implemented and verified with real tests**

---

## 1. SAFETY CHECK: Added to refundOrderItems()

### Location
`src/modules/inventory/service/InventoryService.js`, method `refundOrderItems()` (lines 500-615)

### What Was Added
Before restoring stock, the method now:
1. **Queries StockHistory** for all `USED` entries for the orderId
2. **Builds a deduction map** showing actual quantities deducted per ingredient
3. **Validates each refund item** against this map
4. **Rejects with clear error** if refund > deducted

### Code Diff (Safety Check Section)

```javascript
// ✅ SAFETY: Build map of actual deductions from StockHistory
const deductionMap = {};  // { ingredientId: totalDeducted }
const deducedEntries = await StockHistory.find(
  {
    orderId: orderId,
    merchant: merchantId,
    branch: branchId,
    action: 'USED',
  },
  null,
  { session }
);

for (const entry of deducedEntries) {
  const key = entry.ingredient.toString();
  deductionMap[key] = (deductionMap[key] || 0) + entry.quantity;
}

// Validate and restore each item atomically
for (const refundItem of itemsToRefund) {
  const { ingredientId, quantity } = refundItem;

  if (!ingredientId || !quantity || quantity <= 0) {
    throw new Error('Invalid refund item: missing ingredientId or invalid quantity');
  }

  // ✅ SAFETY: Check refund amount doesn't exceed what was deducted
  const ingredientKey = ingredientId.toString();
  const actualDeducted = deductionMap[ingredientKey] || 0;

  if (quantity > actualDeducted) {
    throw new Error(
      `Refund validation failed for ingredient ${ingredientId}: ` +
      `requested ${quantity} but only ${actualDeducted} was deducted on order ${orderId}`
    );
  }
  // ... rest of refund logic
}
```

---

## 2. CALL SITE: Integrated into Item Void Flow

### Location
`src/modules/order/controller/handlers/item-status.handler.js`, endpoint `PATCH /:orderId/items/:itemId/void`

### What Happens Now
When an item is voided (rejected by customer):

1. **ItemStatusService.voidItem()** marks item status = 'void'
2. **New code checks**: Does merchant have inventory enabled?
3. **If yes**: Queries StockHistory for USED entries for this order
4. **Calls InventoryService.refundOrderItems()** with actual deducted amounts
5. **All happens atomically** within same MongoDB transaction

### Code Diff (Void Handler)

```javascript
// ✅ RESTORE STOCK: Look up what was deducted for this item via StockHistory
// (Only if merchant has inventory enabled and item had ingredients deducted)
const Merchant = require('../../../merchants/models/merchant.model');
const merchant = await Merchant.findById(order.merchant);

if (merchant && merchant.hasFeature('inventory')) {
  const StockHistory = require('../../../../models/StockHistory');
  
  // Find all USED entries for this order (represents deductions at placement)
  const deductions = await StockHistory.find(
    {
      orderId: orderId,
      action: 'USED',
    },
    null,
    { session }
  );

  if (deductions && deductions.length > 0) {
    const { InventoryService } = require('../../../inventory');

    // Build refund request from actual deductions
    const itemsToRefund = deductions.map(d => ({
      ingredientId: d.ingredient,
      quantity: d.quantity,
    }));

    // Restore stock atomically within same transaction
    await InventoryService.refundOrderItems(
      orderId,
      order.merchant,
      order.branch,
      itemsToRefund,
      `Order item voided: ${reason}`,
      req.user?._id,
      session
    );
  }
}
```

---

## 3. TESTS: Over-Refund Rejection Verified

### Test File
`tests/refund-items-safety-validation.test.js` (4 tests, all passing)

### Test Results

```
PASS tests/refund-items-safety-validation.test.js
  SAFETY: refundOrderItems() Validates Refund Amounts
    ✅ Valid refund: restore exact amount deducted (802 ms)
    ✅ Over-refund is REJECTED (169 ms)
    ✅ Partial refund (less than deducted) is allowed (155 ms)
    ✅ Refund for ingredient with NO deduction is REJECTED (99 ms)

Test Suites: 1 passed, 1 total
Tests: 4 passed, 4 total
```

### Test 2: Over-Refund Rejection (CRITICAL)

**Scenario:**
- Order placement deducted 2kg Chicken (recorded in StockHistory)
- Current stock: 98kg
- Attempt to refund: 5kg (MORE than deducted)

**Expected:** Rejection with clear error  
**Actual:**
```
Error caught: Refund validation failed for ingredient 6aa13fb89f0b59a3f9c4cfda: 
  requested 5 but only 2 was deducted on order 6aa13fb89f0b59a3f9c4cfdd
```
✅ **REJECTED** — stock unchanged at 98kg, transaction rolled back

### Test 3: Partial Refund Allowed (ALLOWED)

**Scenario:**
- Order placement deducted 5kg Chicken
- Current stock: 95kg
- Request refund: 2kg (LESS than deducted)

**Expected:** Acceptance, stock restored by 2kg  
**Actual:**
```
Refund accepted: 2 kg
Stock after partial refund: 97 kg (expected 97)
```
✅ **ACCEPTED** — stock correctly updated to 97kg

### Test 4: Zero Deduction Refund Rejection

**Scenario:**
- Order has NO deductions recorded in StockHistory
- Attempt to refund 1kg

**Expected:** Rejection (can't refund what wasn't deducted)  
**Actual:**
```
Error caught: Refund validation failed for ingredient 6aa13fb89f0b59a3f9c4d016: 
  requested 1 but only 0 was deducted on order 6aa13fb89f0b59a3f9c4d019
```
✅ **REJECTED** — no stock change, transaction rolled back

---

## Call Flow Summary

```
PATCH /api/v1/orders/{orderId}/items/{itemId}/void
    ↓
item-status.handler.voidItem() 
    ├─ 1. ItemStatusService.voidItem() [marks status='void']
    ├─ 2. Query StockHistory for USED entries
    ├─ 3. InventoryService.refundOrderItems()
    │   ├─ [NEW] Build deduction map from StockHistory
    │   ├─ [NEW] Validate refund qty ≤ deducted qty
    │   ├─ REJECT if over-refund attempted ❌
    │   └─ Restore stock + record RELEASED entry ✅
    ├─ 4. ItemStatusService.recomputeOrderStatus()
    └─ 5. Emit socket events
    
    Transaction: ATOMIC — all or nothing
```

---

## Files Modified

1. **src/modules/inventory/service/InventoryService.js** (refundOrderItems method)
   - Added StockHistory query to build deduction map
   - Added validation: `if (quantity > actualDeducted) throw Error`
   
2. **src/modules/order/controller/handlers/item-status.handler.js** (voidItem endpoint)
   - Added inventory restoration call when item is voided
   - Pulls actual deducted amounts from StockHistory
   - Calls refundOrderItems atomically within transaction

3. **tests/refund-items-safety-validation.test.js** (NEW)
   - 4 comprehensive tests covering all validation scenarios
   - Proves over-refunds are REJECTED, not allowed

---

## Verification Checklist

- ✅ Safety check added: validates refund ≤ deducted
- ✅ Call site identified: PATCH /items/:itemId/void
- ✅ Integration complete: void handler calls refundOrderItems
- ✅ Stock restored from StockHistory (not hardcoded)
- ✅ Over-refund test: REJECTS with clear error
- ✅ Partial refund test: ALLOWED
- ✅ Atomic transaction: all happens in same session
- ✅ All 4 tests PASS

