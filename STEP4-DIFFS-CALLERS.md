# Step 4: Diffs for Updating All Callers

## 2 Callers Need Updating

### Caller 1: OrderTransactionService.executePlaceOrder()

**File**: `src/modules/order/service/OrderTransactionService.js`
**Line**: 138-148

#### DIFF 1a: Add branchId parameter

```diff
  const { ingredients } = await InventoryService.deductForOrder(
    {
      merchantId,
+     branchId: createdOrder.branch,
      orderId: createdOrder._id,
      orderNumber,
      plan: deductionPlan,
      performedBy,
    },
    session
  );
```

**Current Code**:
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

**New Code**:
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

---

### Caller 2: OrderService.placeOrder()

**File**: `src/modules/order/service/OrderService.js`
**Line**: 459-468

#### DIFF 2a: Add branchId parameter

```diff
  await InventoryService.deductForOrder(
    {
      merchantId,
+     branchId: createdOrder.branch,
      orderId: createdOrder._id,
      orderNumber: createdOrder.orderNumber,
      plan: deductionPlan,
      performedBy,
    },
    mongoSession
  );
```

**Current Code**:
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

**New Code**:
```javascript
await InventoryService.deductForOrder(
  {
    merchantId,
    branchId: createdOrder.branch,
    orderId: createdOrder._id,
    orderNumber: createdOrder.orderNumber,
    plan: deductionPlan,
    performedBy,
  },
  mongoSession
);
```

---

## Summary

| File | Line | Change | Value |
|------|------|--------|-------|
| OrderTransactionService.js | 138-148 | Add branchId parameter | `createdOrder.branch` |
| OrderService.js | 459-468 | Add branchId parameter | `createdOrder.branch` |

**Total changes**: 2 locations, 1 addition each

Both use `createdOrder.branch` because:
- `createdOrder` is the Order document
- Order model has `branch: ObjectId` field (confirmed in Step 2)
- Branch is always populated when order is created

---

## Ready to Apply

Both changes are simple 1-line additions in the parameter object:
```javascript
branchId: createdOrder.branch,
```
