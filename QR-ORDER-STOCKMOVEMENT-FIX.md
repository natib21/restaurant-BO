# QR Order - StockMovement performedBy Fix

## ✅ Problem Solved

**Issue:** QR customer orders failed when trying to deduct inventory:
```
StockMovement validation failed: performedBy: Path `performedBy` is required.
```

**Root Cause:** 
- QR customers are anonymous (no `req.user`)
- `placement.handler.js` passes `performedBy: req.user?._id || null`
- For QR orders: `performedBy = null`
- StockMovement model required `performedBy` to be a valid User ID

---

## 🔧 Solution Applied

### **File Changed:** `models/StockMovement.js`

**Before:**
```javascript
performedBy: {
  type: Schema.Types.ObjectId,
  ref: 'User',
  required: true,  // ❌ Always requires a user
},
```

**After:**
```javascript
performedBy: {
  type: Schema.Types.ObjectId,
  ref: 'User',
  required: false,  // ✅ Allow null for customer/system actions
  default: null,
},
```

---

## 📋 When is performedBy null?

### **Valid Use Cases:**

1. **QR Customer Orders:**
   ```javascript
   // Customer places order via QR menu
   performedBy: null  // Anonymous customer, no user account
   ```

2. **Automated System Actions:**
   ```javascript
   // Scheduled inventory adjustments
   // Automated stock reordering
   // System-triggered waste tracking
   performedBy: null  // System action, not a specific user
   ```

3. **Legacy Data Migration:**
   ```javascript
   // Historical stock movements without user tracking
   performedBy: null  // Unknown user from old system
   ```

### **When performedBy HAS a value:**

1. **Staff Manual Orders:**
   ```javascript
   // Waiter/admin places order manually
   performedBy: userId  // Track which staff member placed order
   ```

2. **Manual Inventory Adjustments:**
   ```javascript
   // Staff manually adjusts stock
   performedBy: userId  // Track who made the adjustment for audit
   ```

---

## ✅ Impact

### **Before Fix:**
```
QR Customer Order → Inventory Deduction
→ StockMovement creation fails
→ Transaction rolls back
→ Order fails ❌
```

### **After Fix:**
```
QR Customer Order → Inventory Deduction
→ StockMovement created with performedBy: null ✅
→ Transaction succeeds
→ Order placed successfully ✅
```

---

## 🔍 Data Flow

### **QR Customer Order Flow:**

1. **Customer places order:**
   ```javascript
   POST /api/v1/orders
   Authorization: Bearer <qr-session-token>
   // No user in session
   ```

2. **Placement handler:**
   ```javascript
   performedBy: req.user?._id || null  // → null for QR customers
   ```

3. **Order transaction service:**
   ```javascript
   await OrderTransactionService.executePlaceOrder({
     performedBy: null,  // Passed to inventory service
     // ...
   });
   ```

4. **Inventory deduction:**
   ```javascript
   await InventoryService.deductForOrder({
     performedBy: null,  // Used in stock movement
     // ...
   });
   ```

5. **Stock movement creation:**
   ```javascript
   await StockMovement.create({
     merchant: merchantId,
     ingredient: ingredientId,
     type: 'out',
     quantity: 2,
     reason: 'order_consumption',
     reference: 'Order #T1-1-001',
     performedBy: null,  // ✅ Now valid
   });
   ```

---

## 📊 Audit Trail

Stock movements still maintain full audit trail:

```javascript
{
  merchant: ObjectId("..."),
  ingredient: ObjectId("..."),
  type: "out",
  quantity: 2,
  previousStock: 100,
  newStock: 98,
  reason: "order_consumption",
  reference: "Order #T1-1-001",  // ✅ Links to order
  performedBy: null,              // ✅ Indicates customer action
  createdAt: "2026-08-31T19:30:00Z",  // ✅ Timestamp preserved
}
```

**What we track:**
- ✅ What ingredient was deducted
- ✅ How much was deducted
- ✅ Why it was deducted (order consumption)
- ✅ Which order caused it (reference)
- ✅ When it happened (timestamps)

**What's null:**
- 🔹 Which staff member did it (not applicable for customer orders)

---

## 🧪 Test Coverage

Existing tests already handle `performedBy: null`:
- `tests/inventory-unified-api.test.js`
- `tests/inventory-deduct.test.js`
- `test-ticket-creation-fix.js`

---

## 🎯 Summary

**Change:** Made `performedBy` optional in StockMovement model

**Reasoning:**
- QR customers are anonymous (no user account)
- System actions may not have a specific user
- Audit trail is still complete via `reference` and `reason` fields

**Result:** QR customer orders can now successfully deduct inventory! 🎉

**Status:** ✅ **COMPLETE**
