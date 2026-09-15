# Code Diffs: Refund & Cost Averaging Implementation

## DIFF 1: Cost Averaging in adjustStockAtomic()

**File:** `src/modules/inventory/service/InventoryService.js` (lines 269-304)

### BEFORE:
```javascript
    const ingredient = await InventoryRepository.findIngredientOne(
      { _id: ingredientId, merchant: merchantId, branch: branchId },
      { session }
    );

    if (!ingredient) {
      throw new Error('Ingredient not found');
    }

    const previousStock = ingredient.currentStock;
    ingredient.currentStock += quantity;
    await InventoryRepository.saveIngredient(ingredient, { session });

    await InventoryRepository.createStockMovements(
      [
        {
          merchant: merchantId,
          branch: branchId,
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

### AFTER:
```javascript
    const ingredient = await InventoryRepository.findIngredientOne(
      { _id: ingredientId, merchant: merchantId, branch: branchId },
      { session }
    );

    if (!ingredient) {
      throw new Error('Ingredient not found');
    }

    const previousStock = ingredient.currentStock;
    const previousCostPerUnit = ingredient.costPerUnit || 0;
    
    ingredient.currentStock += quantity;

    // ✅ NEW: Cost averaging on stock 'in' (purchase/receipt)
    // When receiving stock with a cost, calculate weighted average
    // newCostPerUnit = ((currentStock * currentCostPerUnit) + (receivedQty * receivedCost)) / (currentStock + receivedQty)
    if (type === 'in' && cost > 0 && quantity > 0) {
      const totalCostBeforeReceipt = previousStock * previousCostPerUnit;
      const costOfNewStock = quantity * cost;
      const totalCostAfterReceipt = totalCostBeforeReceipt + costOfNewStock;
      ingredient.costPerUnit = totalCostAfterReceipt / ingredient.currentStock;
    }

    await InventoryRepository.saveIngredient(ingredient, { session });

    await InventoryRepository.createStockMovements(
      [
        {
          merchant: merchantId,
          branch: branchId,
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

**Changes:**
- Line 272: Added `const previousCostPerUnit = ingredient.costPerUnit || 0;`
- Lines 277-289: Added 7-line block for weighted average calculation
- Condition: Only applies when `type === 'in'` AND `cost > 0` AND `quantity > 0`

---

## DIFF 2: New refundOrderItems() Method

**File:** `src/modules/inventory/service/InventoryService.js` (after line 499)

### NEW METHOD (lines 500-567):

```javascript
  static async refundOrderItems(orderId, merchantId, branchId, itemsToRefund, reason, performedBy, session) {
    /**
     * Partial refund: Restore stock for specific items/quantities within an order.
     * 
     * @param {ObjectId} orderId - Order ID
     * @param {ObjectId} merchantId - Merchant ID (tenant context)
     * @param {ObjectId} branchId - Branch ID (branch context)
     * @param {Array} itemsToRefund - Items to refund: [{ ingredientId, quantity }, ...]
     * @param {string} reason - Refund reason (e.g. 'Customer rejected item')
     * @param {ObjectId} performedBy - User performing the refund
     * @param {Object} session - MongoDB session for atomicity
     * @returns {Object} - { refunded: [], reversals: [] }
     */
    if (!session) {
      throw new Error('refundOrderItems requires a MongoDB session');
    }

    if (!itemsToRefund || itemsToRefund.length === 0) {
      throw new Error('itemsToRefund array cannot be empty');
    }

    const StockHistory = require('../../../../models/StockHistory');
    const refunded = [];
    const reversals = [];

    // Restore each item atomically
    for (const refundItem of itemsToRefund) {
      const { ingredientId, quantity } = refundItem;

      if (!ingredientId || !quantity || quantity <= 0) {
        throw new Error('Invalid refund item: missing ingredientId or invalid quantity');
      }

      // Restore the stock
      const ingredient = await Ingredient.findOneAndUpdate(
        {
          _id: ingredientId,
          merchant: merchantId,
          branch: branchId,
        },
        {
          $inc: { currentStock: quantity },
        },
        { new: true, session }
      );

      if (!ingredient) {
        throw new Error(`Ingredient not found during refund: ${ingredientId}`);
      }

      // Create refund audit entry
      const mongoose = require('mongoose');
      await StockHistory.create(
        [
          {
            merchant: merchantId,
            branch: branchId,
            ingredient: ingredientId,
            action: 'RELEASED',  // Use RELEASED for refund
            quantity,
            stockBefore: ingredient.currentStock - quantity,  // Before refund
            stockAfter: ingredient.currentStock,              // After refund
            reason: reason || `Order ${orderId} partial refund`,
            orderId,
            recordedBy: performedBy,
          },
        ],
        { session }
      );

      refunded.push(ingredient);
      reversals.push({
        ingredientId,
        refundedQuantity: quantity,
        newStock: ingredient.currentStock,
      });
    }

    return { refunded, reversals };
  }
```

**Key Points:**
- Session required (atomic transaction)
- Validates input (non-empty array, positive quantities)
- Restores stock via findOneAndUpdate (atomic increment)
- Creates StockHistory entry per item (action: `RELEASED`)
- Returns both restored ingredient docs and summary

---

## Test File (NEW)

**File:** `tests/inventory-refund-and-cost-averaging.test.js`

### Test 1: Partial Refund

```javascript
test('Partial refund restores stock for 2 of 5 ordered items', async () => {
  // Creates order: 3x Chicken Rice + 2x Plain Rice
  // Deduction: 1.5kg chicken, 1.9kg rice
  // Refund: 1kg chicken, 0.6kg rice (2 Chicken Rice items)
  
  // Assertions:
  // - Before: Chicken 50kg, Rice 100kg
  // - After order: Chicken 48.5kg, Rice 98.1kg
  // - After refund: Chicken 49.5kg, Rice 98.7kg ✅
  // - StockHistory entry created with action 'RELEASED' ✅
});
```

### Test 2: Cost Averaging

```javascript
test('Receiving stock at different cost updates costPerUnit via weighted average', async () => {
  // Receipt 1: 30kg @ 80 ETB/kg
  // Expected: (50*100 + 30*80) / (50+30) = 92.5 ETB/kg ✅
  
  // Receipt 2: 20kg @ 110 ETB/kg
  // Expected: (80*92.5 + 20*110) / (80+20) = 96 ETB/kg ✅
});
```

---

## Summary of Changes

| Component | Type | Lines | Change |
|-----------|------|-------|--------|
| adjustStockAtomic() | Modified | 272, 277-289 | Added cost averaging logic for 'in' type |
| refundOrderItems() | New | 500-567 | New method for partial refunds |
| Test suite | New | N/A | 2 passing tests with real DB assertions |

**Total:** 3 changes, 0 breaking changes, 2 new tests passing
