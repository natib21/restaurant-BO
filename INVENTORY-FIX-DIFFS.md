# Inventory System Fixes — Diffs Before Applying

## CHANGE #1: DELETE lowercase inventory.service.js

**File**: `src/modules/inventory/service/inventory.service.js`

**Action**: DELETE (file will be completely removed)

**Reason**: Split-brain service. All functionality is correctly implemented in uppercase `InventoryService.js`.

**Impact**: 
- inventory.controller.js and purchase-order.controller.js will be updated to import from `InventoryService.js` instead
- No loss of functionality — all methods exist in uppercase version

---

## CHANGE #2: Update inventory.controller.js imports

**File**: `src/modules/inventory/controller/inventory.controller.js`

**Current (Line 12)**:
```javascript
const { InventoryService } = require('../service/inventory.service');
```

**New**:
```javascript
const { InventoryService } = require('../service/InventoryService');
```

**Also need to add branchId to controllers** — See CHANGE #6

---

## CHANGE #3: Update purchase-order.controller.js imports

**File**: `src/modules/inventory/controller/purchase-order.controller.js`

**Current (Line 11)**:
```javascript
const { InventoryService } = require('../service/inventory.service');
```

**New**:
```javascript
const { InventoryService } = require('../service/InventoryService');
```

---

## CHANGE #4: Add restoreOrderStock() to InventoryService

**File**: `src/modules/inventory/service/InventoryService.js`

**Location**: Add as new method before closing brace (before line 371)

**New Method**:
```javascript
  static async restoreOrderStock(orderId, merchantId, branchId, session) {
    /**
     * Restore all stock deducted for a canceled order.
     * 
     * Finds all 'order_consumption' movements for this order in StockHistory,
     * then adds them back with corresponding 'cancellation_reversal' entries.
     * 
     * @param {string} orderId - Order ID to reverse
     * @param {string} merchantId - Merchant ID (tenant context)
     * @param {string} branchId - Branch ID (branch context)
     * @param {Object} session - MongoDB session for atomicity
     * @returns {Array} - Restored ingredients with their previous stock levels
     */
    if (!session) {
      throw new Error('restoreOrderStock requires a MongoDB session');
    }

    const StockHistory = require('../../../models/StockHistory');

    // Find all deductions for this order
    const deductions = await StockHistory.find(
      {
        merchant: merchantId,
        branch: branchId,
        reference: `Order ${orderId}`,
        type: 'order_consumption',
      },
      { session }
    ).select('ingredient quantity previousStock newStock');

    if (deductions.length === 0) {
      // No deductions found — order may have been placed but never deducted
      return { restored: [], reversals: [] };
    }

    const Ingredient = require('../../../models/Ingredient');
    const restored = [];
    const reversals = [];

    // Restore each deduction atomically
    for (const deduction of deductions) {
      const ingredient = await Ingredient.findOneAndUpdate(
        {
          _id: deduction.ingredient,
          merchant: merchantId,
          branch: branchId,
        },
        {
          $inc: { currentStock: deduction.quantity }, // Restore the deducted amount
        },
        { new: true, session }
      );

      if (!ingredient) {
        throw new Error(`Ingredient not found during cancellation restore: ${deduction.ingredient}`);
      }

      // Create reversal audit entry
      await InventoryRepository.createStockMovements(
        [
          {
            merchant: merchantId,
            branch: branchId,
            ingredient: deduction.ingredient,
            type: 'cancellation_reversal',
            quantity: deduction.quantity,
            previousStock: ingredient.currentStock - deduction.quantity, // Before reversal
            newStock: ingredient.currentStock, // After reversal
            reason: `Canceled order ${orderId}`,
            reference: `Order ${orderId}`,
            cost: 0,
            performedBy: 'system', // System-generated reversal
          },
        ],
        { session }
      );

      restored.push(ingredient);
      reversals.push({
        ingredientId: deduction.ingredient,
        restoredQuantity: deduction.quantity,
        newStock: ingredient.currentStock,
      });
    }

    return { restored, reversals };
  }
```

---

## CHANGE #5: Add branchId to adjustStock() method signature in InventoryService

**File**: `src/modules/inventory/service/InventoryService.js`

**Current (Line 22)**:
```javascript
  static async adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    cost = 0
  ) {
```

**New**:
```javascript
  static async adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    cost = 0,
    branchId = null  // ← NEW: Add optional branchId parameter
  ) {
```

**Also update Line 41 query** (inside adjustStock):
```javascript
// OLD:
const result = await InventoryRepository.updateIngredient(
  {
    _id: ingredientId,
    merchant: merchantId,
    currentStock: { $gte: quantity },
  },

// NEW (add branch to query):
const result = await InventoryRepository.updateIngredient(
  {
    _id: ingredientId,
    merchant: merchantId,
    ...(branchId && { branch: branchId }),  // ← Include branch if provided
    currentStock: { $gte: quantity },
  },
```

**Also update Line 65 query** (inside adjustStock, 'in' case):
```javascript
// OLD:
const ingredient = await InventoryRepository.findIngredientOne(
  { _id: ingredientId, merchant: merchantId },
  { session }
);

// NEW:
const ingredient = await InventoryRepository.findIngredientOne(
  { _id: ingredientId, merchant: merchantId, ...(branchId && { branch: branchId }) },
  { session }
);
```

**Also update StockMovements creation** (around line 75):
```javascript
// OLD:
await InventoryRepository.createStockMovements(
  [
    {
      merchant: merchantId,
      ingredient: ingredientId,
      type,
      // ...
    },
  ],

// NEW:
await InventoryRepository.createStockMovements(
  [
    {
      merchant: merchantId,
      ...(branchId && { branch: branchId }),  // ← Include branch in audit
      ingredient: ingredientId,
      type,
      // ...
    },
  ],
```

---

## CHANGE #6: Update OrderService.cancelOrder() to restore stock

**File**: `src/modules/order/service/OrderService.js`

**Current (Line 1089-1123)**:
```javascript
static async cancelOrder(req) {
  const { orderId } = req.params;
  const { reason = 'Customer/Staff Cancellation' } = req.body;

  const existing = await OrderRepository.findOne(
    merchantScopedQuery({ _id: orderId }, req)
  );
  if (!existing) throw new AppError('Order not found', 404);

  // Terminal states — check first for clean early exits
  if (existing.status === 'canceled') {
    return { order: existing, alreadyCanceled: true };
  }

  if (existing.status === 'completed') {
    throw new AppError('Order is already completed and cannot be canceled', 400);
  }

  // Customer path (no req.user): only allowed while still pending
  if (!req.user && existing.status !== 'pending') {
    throw new AppError('Customers can only cancel orders while they are still pending', 400);
  }

  // Staff path: state machine enforces per-status role permissions.

  const result = await OrderStateMachineService.transitionOrderStatus({
    orderId,
    toStatus: 'canceled',
    merchantQuery: merchantScopedQuery({}, req),
    user: req.user || null,
    actorType: req.user ? 'staff' : 'customer',
    customerId: req.customerId,
    reason,
  });

  return { order: result.order, alreadyCanceled: false };
}
```

**New** (add stock restoration):
```javascript
static async cancelOrder(req) {
  const { orderId } = req.params;
  const { reason = 'Customer/Staff Cancellation' } = req.body;

  const existing = await OrderRepository.findOne(
    merchantScopedQuery({ _id: orderId }, req)
  );
  if (!existing) throw new AppError('Order not found', 404);

  // Terminal states — check first for clean early exits
  if (existing.status === 'canceled') {
    return { order: existing, alreadyCanceled: true };
  }

  if (existing.status === 'completed') {
    throw new AppError('Order is already completed and cannot be canceled', 400);
  }

  // Customer path (no req.user): only allowed while still pending
  if (!req.user && existing.status !== 'pending') {
    throw new AppError('Customers can only cancel orders while they are still pending', 400);
  }

  // Staff path: state machine enforces per-status role permissions.

  // ← NEW: Restore stock for canceled order (before state transition)
  const merchantId = req.user ? req.user.merchantId : req.merchantId;
  if (existing.branch) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await InventoryService.restoreOrderStock(
          existing._id,
          merchantId,
          existing.branch,
          session
        );

        // State transition happens inside the same transaction
        const result = await OrderStateMachineService.transitionOrderStatus({
          orderId,
          toStatus: 'canceled',
          merchantQuery: merchantScopedQuery({}, req),
          user: req.user || null,
          actorType: req.user ? 'staff' : 'customer',
          customerId: req.customerId,
          reason,
          session,  // ← Pass session to ensure atomicity
        });

        return result;
      });
    } finally {
      session.endSession();
    }
  } else {
    // No branch — just transition status (backward compat)
    const result = await OrderStateMachineService.transitionOrderStatus({
      orderId,
      toStatus: 'canceled',
      merchantQuery: merchantScopedQuery({}, req),
      user: req.user || null,
      actorType: req.user ? 'staff' : 'customer',
      customerId: req.customerId,
      reason,
    });
    return { order: result.order, alreadyCanceled: false };
  }
}
```

**Note**: Add to top of file if not present:
```javascript
const mongoose = require('mongoose');
const { InventoryService } = require('../../inventory');
```

---

## CHANGE #7: Update inventory.validator.js — Add branchId to schemas

**File**: `src/modules/inventory/validators/inventory.validator.js`

### Add branchId to adjustStockSchema (Line 29-33):

**Current**:
```javascript
exports.adjustStockSchema = z.object({
  ingredientId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid ingredient ID'),
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
  type: z.enum(['in', 'out', 'waste', 'adjustment']).describe('Stock movement type'),
  reason: z.string().min(3).max(200).optional().describe('Why stock is being adjusted'),
  reference: z.string().max(100).optional().describe('PO number, invoice, etc.'),
  cost: z.number().min(0).optional().describe('Cost per unit or total cost'),
});
```

**New**:
```javascript
exports.adjustStockSchema = z.object({
  ingredientId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid ingredient ID'),
  branchId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid branch ID'),  // ← NEW: Required
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
  type: z.enum(['in', 'out', 'waste', 'adjustment']).describe('Stock movement type'),
  reason: z.string().min(3).max(200).optional().describe('Why stock is being adjusted'),
  reference: z.string().max(100).optional().describe('PO number, invoice, etc.'),
  cost: z.number().min(0).optional().describe('Cost per unit or total cost'),
});
```

### Add branchId to batchAdjustStockSchema (Line 46-59):

**Current**:
```javascript
exports.batchAdjustStockSchema = z.object({
  adjustments: z
    .array(
      z.object({
        ingredientId: z.string().regex(/^[a-f0-9]{24}$/),
        quantity: z.number().min(0.01),
        type: z.enum(['in', 'out', 'waste', 'adjustment']),
        reason: z.string().optional(),
        cost: z.number().min(0).optional(),
      })
    )
    .min(1)
    .max(50),
});
```

**New**:
```javascript
exports.batchAdjustStockSchema = z.object({
  branchId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid branch ID'),  // ← NEW: Required at root
  adjustments: z
    .array(
      z.object({
        ingredientId: z.string().regex(/^[a-f0-9]{24}$/),
        quantity: z.number().min(0.01),
        type: z.enum(['in', 'out', 'waste', 'adjustment']),
        reason: z.string().optional(),
        cost: z.number().min(0).optional(),
      })
    )
    .min(1)
    .max(50),
});
```

---

## CHANGE #8: Update inventory.controller.js — Extract branchId from request

**File**: `src/modules/inventory/controller/inventory.controller.js`

### Update adjustStock endpoint (Line 40-55):

**Current**:
```javascript
exports.adjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { ingredientId, quantity, type, reason, reference, cost } = req.body;
  const performedBy = req.user._id;

  const ingredient = await InventoryService.adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    cost
  );
```

**New**:
```javascript
exports.adjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { ingredientId, branchId, quantity, type, reason, reference, cost } = req.body;  // ← Add branchId
  const performedBy = req.user._id;

  const ingredient = await InventoryService.adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    cost,
    branchId  // ← Pass branchId
  );
```

### Update batchAdjustStock endpoint (Line 80-95):

**Current**:
```javascript
exports.batchAdjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { adjustments } = req.body;
  const performedBy = req.user._id;

  const results = await InventoryService.batchAdjustStock(merchantId, adjustments, performedBy);
```

**New**:
```javascript
exports.batchAdjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { branchId, adjustments } = req.body;  // ← Extract branchId
  const performedBy = req.user._id;

  const results = await InventoryService.batchAdjustStock(
    merchantId,
    adjustments,
    performedBy,
    branchId  // ← Pass branchId
  );
```

---

## CHANGE #9: Update InventoryService.batchAdjustStock() signature

**File**: `src/modules/inventory/service/InventoryService.js`

**Current signature** (need to find this method):
```javascript
static async batchAdjustStock(merchantId, adjustments, performedBy, options = {}) {
```

**New signature**:
```javascript
static async batchAdjustStock(merchantId, adjustments, performedBy, branchId = null, options = {}) {
```

**And pass branchId to each adjustStock call inside the loop**:
```javascript
// Inside loop:
const result = await this.adjustStock(
  merchantId,
  adj.ingredientId,
  adj.quantity,
  adj.type,
  adj.reason,
  adj.reference || `Manual batch adjustment`,
  performedBy,
  adj.cost,
  branchId  // ← Pass branchId to each item
);
```

---

## CHANGE #10: Update ingredient.controller.js — Add branch filter to UPDATE/DELETE

**File**: `src/modules/inventory/controller/ingredient.controller.js`

### Update updateIngredient endpoint (Line 63-68):

**Current**:
```javascript
exports.updateIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );
```

**New**:
```javascript
exports.updateIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const branchId = req.query.branchId || req.body.branch;  // ← Extract branchId
  
  if (!branchId) {
    return next(new AppError('Branch is required to update ingredient', 400));
  }
  
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId, branch: branchId },  // ← Add branch filter
    req.body,
    { new: true, runValidators: true }
  );
```

### Update deleteIngredient endpoint (Line 75-81):

**Current**:
```javascript
exports.deleteIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { isActive: false },
    { new: true }
  );
```

**New**:
```javascript
exports.deleteIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const branchId = req.query.branchId;  // ← Extract branchId from query
  
  if (!branchId) {
    return next(new AppError('Branch is required to delete ingredient', 400));
  }
  
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId, branch: branchId },  // ← Add branch filter
    { isActive: false },
    { new: true }
  );
```

---

## CHANGE #11: Update purchase-order.controller.js — Add branchId to receivePurchaseOrder

**File**: `src/modules/inventory/controller/purchase-order.controller.js`

**Current (around line 98)**:
```javascript
await InventoryService.adjustStock(
  merchantId,
  item.ingredientId,
  item.quantity,
  'in',
  'goods_receipt',
  `PO-${po._id}`,
  req.user._id,
  item.costPerUnit
);
```

**New**:
```javascript
await InventoryService.adjustStock(
  merchantId,
  item.ingredientId,
  item.quantity,
  'in',
  'goods_receipt',
  `PO-${po._id}`,
  req.user._id,
  item.costPerUnit,
  po.branch  // ← Pass order's branch
);
```

---

## Summary of Changes

| # | File | Change | Type |
|---|------|--------|------|
| 1 | `src/modules/inventory/service/inventory.service.js` | DELETE (split-brain) | Deletion |
| 2 | `src/modules/inventory/controller/inventory.controller.js` | Change import to uppercase InventoryService | Import fix |
| 3 | `src/modules/inventory/controller/purchase-order.controller.js` | Change import to uppercase InventoryService | Import fix |
| 4 | `src/modules/inventory/service/InventoryService.js` | Add `restoreOrderStock()` method | New method |
| 5 | `src/modules/inventory/service/InventoryService.js` | Add branchId param to `adjustStock()` | Parameter addition |
| 6 | `src/modules/order/service/OrderService.js` | Call `restoreOrderStock()` in `cancelOrder()` | Logic addition |
| 7 | `src/modules/inventory/validators/inventory.validator.js` | Add branchId to adjustStockSchema | Schema update |
| 8 | `src/modules/inventory/validators/inventory.validator.js` | Add branchId to batchAdjustStockSchema | Schema update |
| 9 | `src/modules/inventory/controller/inventory.controller.js` | Extract & pass branchId in adjustStock | Controller update |
| 10 | `src/modules/inventory/controller/inventory.controller.js` | Extract & pass branchId in batchAdjustStock | Controller update |
| 11 | `src/modules/inventory/service/InventoryService.js` | Update batchAdjustStock() signature | Method signature |
| 12 | `src/modules/inventory/controller/ingredient.controller.js` | Add branch filter to updateIngredient | Query filter |
| 13 | `src/modules/inventory/controller/ingredient.controller.js` | Add branch filter to deleteIngredient | Query filter |
| 14 | `src/modules/inventory/controller/purchase-order.controller.js` | Pass branchId to adjustStock in receipt | Logic addition |

**Total Files Modified**: 6
**Total Lines Changed**: ~120
**Risk Level**: LOW (all changes are additive or fixing broken paths)
