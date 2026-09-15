# Caller Map & Order Model Branch Field Verification

## Step 1: All Callers of stock.service.js

### Result: stock.service.js is DEAD CODE

**Found in production code**: ❌ ZERO references

**Found in test code only**:
1. `tests/branch-isolation-per-branch-stock.test.js` — Line 139, 271 (requires deductIngredientAtomic)
2. `tests/inventory-stage3-deduction.test.js` — Line 14 (requires deductIngredients, rollbackDeductions)
3. `tests/inventory-stage4-reservation.test.js` — Line 14 (requires reserveIngredients, releaseReservations)
4. `tests/inventory-stage5-finalization.test.js` — Line 14 (requires finalizeIngredients, rollbackFinalizations)
5. `tests/inventory-stage5-finalization.test.js` — Line 725 (requires deductIngredientAtomic, rollbackDeductions)
6. `tests/branch-inventory-isolation.test.js` — Line 153, 265 (requires deductIngredients)

**Conclusion**: stock.service.js is 100% unused in production. Can be safely deleted after InventoryService.js is updated.

---

## Step 2: All Callers of InventoryService Deduction Functions

### Found: 2 Production Callers

#### Caller 1: OrderTransactionService.executePlaceOrder()

**File**: `src/modules/order/service/OrderTransactionService.js`
**Line**: 138
**Function**: `executePlaceOrder()`

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

**Context Available**: 
- ✅ `branchId` is available (used later: line 150 for NotificationService)
- ✅ `createdOrder` exists with branch field
- ✅ Can access `createdOrder.branch` or `branchId` local variable

---

#### Caller 2: OrderService.placeOrder()

**File**: `src/modules/order/service/OrderService.js`
**Line**: 459
**Function**: `placeOrder()`

```javascript
// Deduct inventory inside the same transaction
await InventoryService.deductForOrder(
  {
    merchantId,
    orderId: createdOrder._id,
    orderNumber: createdOrder.orderNumber,
    plan: deductionPlan,
    performedBy,
  },
  mongoSession
);
```

**Context Available**:
- ✅ `branchId` is available (used later: line 471 for NotificationService)
- ✅ `createdOrder` exists with branch field
- ✅ Can access `createdOrder.branch` or `branchId` local variable

---

## Step 3: Order Model Verification

### Order Model Has Branch Field? ✅ YES

**File**: `models/orderModel.js`
**Line**: 200-205

```javascript
branch: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Branch',
  required: true,
},
```

**Field Status**:
- ✅ Field name: `branch`
- ✅ Type: ObjectId
- ✅ Reference: 'Branch' model
- ✅ Required: YES
- ✅ Already indexed: YES (line 324: `{ merchant: 1, branch: 1, placedAt: -1 }`)

**Availability at call sites**:
- Caller 1 (OrderTransactionService): `createdOrder.branch` is populated ✅
- Caller 2 (OrderService): `createdOrder.branch` is populated ✅
- Both have `branchId` variable available ✅

---

## Summary: Ready to Proceed

| Item | Status | Evidence |
|------|--------|----------|
| stock.service.js is dead code | ✅ YES | Zero production references, 6 test references only |
| InventoryService functions need branch | ✅ YES | Called from 2 production locations |
| Order model has branch field | ✅ YES | Required, ObjectId, indexed |
| Both callers have branchId available | ✅ YES | Can pass `createdOrder.branch` |
| Ingredient model currently has branch | ❌ NO | Need to add it |

---

## Caller Details for Updates

### Update 1: OrderTransactionService.js (Line 138)

**Current**:
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

**Need to add**: `branchId: createdOrder.branch`

---

### Update 2: OrderService.js (Line 459)

**Current**:
```javascript
await InventoryService.deductForOrder(
  {
    merchantId,
    orderId: createdOrder._id,
    orderNumber: createdOrder.orderNumber,
    plan: deductionPlan,
    performedBy,
  },
  mongoSession
);
```

**Need to add**: `branchId: createdOrder.branch`

---

## Call Chain Visualization

```
OrderTransactionService.executePlaceOrder()
  ├─ createdOrder.branch = ObjectId (✅ available)
  ├─ branchId (local variable, ✅ available)
  └─→ InventoryService.deductForOrder(
        merchantId,
        branchId,              ← NEED TO ADD
        orderId,
        orderNumber,
        plan,
        performedBy,
        session
      )
        └─→ InventoryService.deductStockFromOrder(
              merchantId,
              branchId,        ← NEED TO ADD
              orderItems,
              performedBy
            )
              └─→ InventoryService.adjustStockAtomic(
                    merchantId,
                    branchId,  ← NEED TO ADD
                    ingredientId,
                    quantity,
                    type,
                    reason,
                    reference,
                    performedBy,
                    session
                  )
                    └─→ Ingredient.findOneAndUpdate({
                          _id,
                          merchant,
                          branch,   ← NEED TO ADD TO QUERY
                          currentStock: { $gte }
                        })
```

---

## What Needs to Happen Next

1. ✅ **Step 1 Complete**: Confirmed stock.service.js is dead
2. ✅ **Step 2 Complete**: Found 2 callers, both have branchId available
3. ⏭️ **Step 3**: Add branchId parameter through the 3-function chain
4. ⏭️ **Step 4**: Update both callers to pass `branchId: createdOrder.branch`
5. ⏭️ **Step 5**: Add branch field to Ingredient schema
6. ⏭️ **Step 6**: Delete stock.service.js
7. ⏭️ **Step 7**: Write integration test through real order path

---

## Code Ready for Changes

All pieces are in place:
- ✅ Dead code identified (stock.service.js — unused)
- ✅ Production functions identified (3 in InventoryService)
- ✅ Callers identified (2 in OrderService, OrderTransactionService)
- ✅ Branch context available at all call sites
- ✅ Order model branch field confirmed
- ✅ Test code already has correct implementation to reference

**Ready to proceed with Step 3: Adding branchId parameter through the chain**
