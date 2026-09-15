# Comprehensive Inventory System Audit: Production Readiness

**Date**: September 3, 2026  
**Status**: 🔴 **NOT YET - CRITICAL BLOCKING ISSUES**

---

## Q1: Where Does Inventory Get Created/Updated?

### Creation Points

#### 1. **Ingredient Creation Endpoint**
**File**: `src/modules/inventory/controller/ingredient.controller.js` (Line 42)
**Code**:
```javascript
exports.createIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const { branch } = req.body;

  // ✅ NEW: Require branch for per-branch ingredient isolation
  if (!branch) {
    return next(new AppError('Branch is required when creating an ingredient', 400));
  }

  const ingredient = await Ingredient.create({ 
    ...req.body, 
    merchant: merchantId,
    branch  // ← Explicitly set from request
  });

  res.status(201).json({ status: 'success', data: { ingredient } });
});
```
**Status**: ✅ Branch required, branch set explicitly

**Route**: `POST /api/v1/ingredients`

---

### Update Points

#### 1. **Ingredient Update Endpoint**
**File**: `src/modules/inventory/controller/ingredient.controller.js` (Line 63)
**Code**:
```javascript
exports.updateIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );
```
**Status**: 🔴 **MISSING BRANCH FILTER** - Can update ANY branch's ingredient!

**Route**: `PATCH /api/v1/ingredients/:id`

---

#### 2. **Manual Stock Adjustment Endpoint**
**File**: `src/modules/inventory/controller/inventory.controller.js` (Line 43)
**Code**:
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
**Status**: 🟡 Does NOT pass `branchId` - defaults to null in lowercase service

**Route**: `POST /api/v1/inventory/adjust`

---

#### 3. **Batch Stock Adjustment**
**File**: `src/modules/inventory/controller/inventory.controller.js` (Line 80)
**Code**:
```javascript
exports.batchAdjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { adjustments } = req.body;
  const performedBy = req.user._id;

  const results = await InventoryService.batchAdjustStock(
    merchantId, 
    adjustments, 
    performedBy
  );
```
**Status**: 🟡 Does NOT pass `branchId` to batch operations

**Route**: `POST /api/v1/inventory/batch-adjust`

---

#### 4. **Purchase Order Receipt (Stock In)**
**File**: `src/modules/inventory/controller/purchase-order.controller.js` (Line 84)
**Code**:
```javascript
const ingredient = await Ingredient.findOne({
  _id: item.ingredientId,
  merchant: merchantId,
  branch: purchaseOrder.branch  // ← ✅ Includes branch filter
});

await InventoryService.adjustStock(
  merchantId,
  item.ingredientId,
  item.receivedQuantity,
  'in',
  'purchase',
  purchaseOrder.poNumber,
  req.user._id,
  poItem.unitPrice,
  purchaseOrder.branch  // ← ✅ Passes branchId (9th param)
);
```
**Status**: ✅ Branch filter on lookup, branchId passed to adjustStock

**Route**: `POST /purchase-orders/:id/receive`

---

### Stock Deduction on Order Placement

#### **Order Placement → Deduction**
**File**: `src/modules/order/service/OrderTransactionService.js` (Line 138)
**Code**:
```javascript
const { ingredients } = await InventoryService.deductForOrder(
  {
    merchantId,
    branchId: createdOrder.branch,  // ← ✅ Branch passed
    orderId: createdOrder._id,
    orderNumber,
    plan: deductionPlan,
    performedBy,
  },
  session
);
```
**Status**: ✅ Branch context passed through

**Flow**: OrderTransactionService → InventoryService.deductForOrder (uppercase, with branch)

---

### Summary: Q1

| Operation | File | Branch Filter | Status |
|-----------|------|----------------|--------|
| Create Ingredient | ingredient.controller.js:42 | ✅ Required | PASS |
| Update Ingredient | ingredient.controller.js:63 | ❌ MISSING | **FAIL** |
| Manual Adjust Stock | inventory.controller.js:43 | ❌ Not passed | **FAIL** |
| Batch Adjust | inventory.controller.js:80 | ❌ Not passed | **FAIL** |
| PO Receipt | purchase-order.controller.js:84 | ✅ Included | PASS |
| Order Deduction | OrderTransactionService.js:138 | ✅ Passed | PASS |

---

## Q2: Order Placement Path - Checkout to Deduction

### COMPLETE CALL CHAIN

```
Customer places order
  ↓
POST /api/v1/dine-in/place-order (or take-away)
  ↓
OrderService.placeOrder() [src/modules/order/service/OrderService.js:455]
  ↓
OrderService.executeOrder() [Line 400]
  ↓
OrderTransactionService.executePlaceOrder() [src/modules/order/service/OrderTransactionService.js:30]
  ├─ Creates Order document
  ├─ Creates DiningSession or Session
  ├─ Resolves deduction plan: InventoryService.resolveDeductionPlan() [Line 78]
  │
  └─ Deducts stock: InventoryService.deductForOrder() [Line 138]
       ├─ merchantId: from request (tenant)
       ├─ branchId: createdOrder.branch ← ✅ BRANCH CONTEXT
       ├─ orderNumber, plan, performedBy
       ├─ session: MongoDB transaction session
       │
       └─ InventoryService.deductForOrder([Line 165, uppercase InventoryService.js)
            ├─ Validates session exists
            ├─ For each line in plan:
            │  └─ InventoryService.adjustStockAtomic(
            │       merchantId,
            │       branchId,
            │       ingredientId,
            │       quantity,
            │       'out',
            │       'order_consumption',
            │       reference,
            │       performedBy,
            │       session
            │    )
            │
            └─ adjustStockAtomic() [Line 214]
                ├─ Query: Ingredient.findOneAndUpdate({
                │    _id,
                │    merchant,
                │    branch: ← ✅ BRANCH FILTER APPLIED
                │    currentStock: { $gte: qty }
                │  })
                ├─ If found: decrement stock by qty
                ├─ Record to StockHistory:
                │  {
                │    merchant,
                │    branch,  ← ✅ BRANCH RECORDED
                │    ingredient,
                │    type: 'order_consumption',
                │    quantity,
                │    ...
                │  }
                ├─ Commit transaction
                └─ Return updated ingredient
```

### Key Code Sections

**File**: `src/modules/order/service/OrderTransactionService.js`

**Line 78 - Deduction Plan Resolved**:
```javascript
const deductionPlan = await InventoryService.resolveDeductionPlan(orderItems, merchantId);
```

**Line 138 - Deduction Called**:
```javascript
const { ingredients } = await InventoryService.deductForOrder(
  {
    merchantId,
    branchId: createdOrder.branch,
    orderId: createdOrder._id,
    orderNumber,
    plan: deductionPlan,
    performedBy,
  },
  session
);
```

**File**: `src/modules/inventory/service/InventoryService.js`

**Line 165 - deductForOrder Signature**:
```javascript
static async deductForOrder({ merchantId, branchId, orderNumber, plan, performedBy }, session) {
  if (!session) {
    throw new Error('deductForOrder requires a MongoDB session');
  }

  const reference = `Order ${orderNumber}`;
  const ingredients = [];

  for (const line of plan) {
    const ingredient = await this.adjustStockAtomic(
      merchantId,
      branchId,
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

**Line 214 - adjustStockAtomic Signature & Query**:
```javascript
static async adjustStockAtomic(
  merchantId,
  branchId,
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
    const ingredient = await Ingredient.findOneAndUpdate(
      {
        _id: ingredientId,
        merchant: merchantId,
        branch: branchId,  // ← ✅ CRITICAL: Branch filter
        currentStock: { $gte: quantity },
      },
      { $inc: { currentStock: -quantity } },
      { new: true, session }
    );

    if (!ingredient) {
      throw new Error('Insufficient stock or ingredient not found');
    }

    await InventoryRepository.createStockMovements(
      [{
        merchant: merchantId,
        branch: branchId,  // ← ✅ Branch recorded for audit
        ingredient: ingredientId,
        type,
        quantity,
        previousStock: ingredient.currentStock + quantity,
        newStock: ingredient.currentStock,
        reason,
        reference,
        cost,
        performedBy,
      }],
      { session }
    );

    return ingredient;
  }
  // ... handle 'in' type similarly
}
```

### Summary: Q2

**Order placement path**: ✅ **FULLY BRANCH-AWARE** for order deductions
- ✅ Branch context passed through entire chain
- ✅ Query filters by {merchant, branch}
- ✅ Audit trail records branch
- ✅ Wrapped in MongoDB transaction with session

---

## Q3: Order Cancellation/Refund - Stock Restoration

Let me search for cancellation/refund logic:

### Finding Cancellation Code
