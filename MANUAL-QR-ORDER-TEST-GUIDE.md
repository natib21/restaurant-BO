# Manual Testing Guide: QR Customer Orders

## 📋 Files Changed (Actual Diffs)

### ✅ 1. `src/modules/customers/customer-session.guard.js`

**Changes:**
- Added `Merchant` model import
- Populate full merchant object with subscription & features
- Set `req.merchant` (full object) in addition to `req.merchantId`
- Validate merchant is active before processing request

```diff
+const Merchant = require('../../../models/merchantModel');

+  // ✅ Populate full merchant object for feature guard
+  const merchant = await Merchant.findById(session.merchant).select(
+    'businessName isActive status isSubscriptionActive features subscription'
+  );
+
+  if (!merchant || !merchant.isActive) {
+    return next(new AppError('Restaurant is not available at this time.', 403));
+  }
+
   req.merchantId = session.merchant;
+  req.merchant = merchant; // ✅ Full merchant object with .hasActiveAccess and .hasFeature()
```

---

### ✅ 2. `src/modules/order/service/OrderTransactionService.js`

**Changes:**
- Fixed circular dependency with lazy loading pattern
- Changed `OrderService` import to lazy getter
- Updated `buildOrderItems()` call to use lazy getter

```diff
-const { OrderService } = require('./OrderService');
+// ✅ Lazy load to avoid circular dependency (OrderService also imports this file)
+let OrderService;
+const getOrderService = () => {
+  if (!OrderService) {
+    OrderService = require('./OrderService').OrderService;
+  }
+  return OrderService;
+};

-    const { orderItems, subtotal } = await OrderService.buildOrderItems(items, merchantId);
+    const { orderItems, subtotal } = await getOrderService().buildOrderItems(items, merchantId);
```

---

## 🧪 Manual Testing Steps

### **Prerequisites**
1. Backend server running: `npm run dev`
2. MongoDB running
3. Two browser tabs or Postman collections

---

## **Step 1: Get Real Session Token**

### **Option A: Generate via QR Scan Simulation**

```bash
# 1. Get your merchant, branch, and table IDs from DB
mongo MesobDb
db.merchants.findOne({}, {_id:1, businessName:1})
db.branches.findOne({}, {_id:1, name:1, merchant:1})
db.tables.findOne({}, {_id:1, tableNumber:1, merchant:1, branch:1})
```

```javascript
// 2. Encode QR data (in Node.js or browser console)
const data = {
  m: "YOUR_MERCHANT_ID",  // e.g., "6a9532e46c844d03b33ff55b"
  b: "YOUR_BRANCH_ID",    // e.g., "6a9532e46c844d03b33ff55e"
  t: "YOUR_TABLE_ID"      // e.g., "6a954708  15b8780e437fa774"
};

const encodedData = Buffer.from(JSON.stringify(data)).toString('base64');
// Or in browser: btoa(JSON.stringify(data))

console.log('Encoded:', encodedData);

// 3. Generate signature (using your QR secret from .env)
const crypto = require('crypto');
const secret = process.env.QR_SECRET || 'your-secret-key';
const signature = crypto.createHmac('sha256', secret)
  .update(encodedData)
  .digest('hex');

console.log('Signature:', signature);

// 4. Build QR URL
const qrUrl = `http://localhost:5173/qr?data=${encodedData}&s=${signature}`;
console.log('QR URL:', qrUrl);
```

```bash
# 5. Start a session via API (simulating QR scan)
curl -X POST http://localhost:8000/api/v1/sessions/start?data=ENCODED_DATA&s=SIGNATURE \
  -H "Content-Type: application/json"

# Response will include:
# {
#   "success": true,
#   "data": {
#     "token": "abc123xyz...",  # ← THIS IS YOUR SESSION TOKEN
#     "expiresAt": "2026-08-31T23:00:00.000Z",
#     "table": {...}
#   }
# }
```

### **Option B: Query Existing Session**

```bash
# If you already have a session in DB:
mongo MesobDb
db.customersessions.findOne(
  { isActive: true, expiresAt: { $gt: new Date() } },
  { token: 1, merchant: 1, branch: 1, table: 1 }
)
# Copy the "token" field
```

---

## **Step 2: Test Customer QR Order**

### **Make Order Request**

```bash
# Replace SESSION_TOKEN with the token from Step 1
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "menuItemId": "6a9533328bc68bc64ec6b679",
        "name": "Grilled Chicken",
        "quantity": 2,
        "price": 245,
        "subtotal": 490
      }
    ],
    "branchId": "YOUR_BRANCH_ID",
    "table": "T-02",
    "customerName": "QR Test Customer",
    "customerPhone": null,
    "customer": null,
    "subtotal": 490,
    "totalAmount": 490,
    "notes": "Extra sauce please"
  }'
```

### **Expected Success Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "...",
      "orderNumber": "D-001",
      "status": "pending",
      "source": "web",
      "tableNumber": "T-02",
      "items": [...],
      "totalAmount": 490
    }
  }
}
```

### **If It Fails:**

#### ❌ **403 "Your subscription is not active"**
```bash
# Fix: Enable merchant subscription
mongo MesobDb
db.merchants.updateOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  { $set: { isSubscriptionActive: true, status: "approved", isActive: true } }
)
```

#### ❌ **403 "orders is not enabled for this merchant"**
```bash
# Fix: Enable orders feature
mongo MesobDb
db.merchants.updateOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  { $set: { "features.optional.orders.enabled": true } }
)
```

#### ❌ **500 "Cannot read properties of undefined"**
```
# This means the circular dependency fix didn't apply
# Restart your server: Ctrl+C then npm run dev
```

---

## **Step 3: Verify Order in Database**

```bash
mongo MesobDb

# Check the order was created
db.orders.find().sort({_id:-1}).limit(1).pretty()

# Verify fields:
# - orderNumber: "D-001" (or next number)
# - status: "pending"
# - source: "web"
# - tableNumber: matches your table
# - merchant, branch, table IDs are correct
```

---

## **Step 4: Test Feature Guard Validation**

### **Test 1: Inactive Merchant**
```bash
# Deactivate merchant
mongo MesobDb
db.merchants.updateOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  { $set: { isActive: false } }
)

# Try to order (should fail with 403)
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... same payload ... }'

# Expected: 403 "Restaurant is not available at this time."

# Re-enable merchant
db.merchants.updateOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  { $set: { isActive: true } }
)
```

### **Test 2: Inactive Subscription**
```bash
# Disable subscription
mongo MesobDb
db.merchants.updateOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  { $set: { isSubscriptionActive: false } }
)

# Try to order (should fail with 403)
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... same payload ... }'

# Expected: 403 "Your subscription is not active"

# Re-enable subscription
db.merchants.updateOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  { $set: { isSubscriptionActive: true } }
)
```

### **Test 3: Orders Feature Disabled**
```bash
# Disable orders feature
mongo MesobDb
db.merchants.updateOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  { $set: { "features.optional.orders.enabled": false } }
)

# Try to order (should fail with 403)
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... same payload ... }'

# Expected: 403 "orders is not enabled for this merchant"

# Re-enable orders
db.merchants.updateOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  { $set: { "features.optional.orders.enabled": true } }
)
```

---

## ✅ Success Criteria

### **Feature Guard Working:**
- ✅ Valid session + active subscription + enabled feature → Order succeeds
- ✅ Inactive merchant → 403 "Restaurant not available"
- ✅ Inactive subscription → 403 "Your subscription is not active"
- ✅ Orders feature disabled → 403 "orders is not enabled"

### **Circular Dependency Fixed:**
- ✅ No "Cannot read properties of undefined (reading 'buildOrderItems')" error
- ✅ `OrderService.buildOrderItems()` executes successfully
- ✅ Order items are validated and created

### **Order Created Successfully:**
- ✅ Order document created in database
- ✅ Order number generated (e.g., "D-001")
- ✅ Status set to "pending"
- ✅ Source set to "web"
- ✅ All items attached to order

---

## 🔧 Quick Debug Commands

```bash
# Check if merchant has required fields
mongo MesobDb
db.merchants.findOne(
  { _id: ObjectId("YOUR_MERCHANT_ID") },
  {
    businessName: 1,
    isActive: 1,
    status: 1,
    isSubscriptionActive: 1,
    "features.optional.orders.enabled": 1
  }
)

# Check session validity
db.customersessions.findOne(
  { token: "YOUR_SESSION_TOKEN" },
  { isActive: 1, expiresAt: 1, merchant: 1, branch: 1, table: 1 }
)

# Check last order
db.orders.find().sort({_id:-1}).limit(1).pretty()

# View server logs for errors
# (in your server terminal, watch for errors)
```

---

## 📝 Notes

1. **Session Token Expiry:** Sessions expire after 4 hours by default (configurable via `SESSION_DURATION_HOURS` env var)

2. **Real Menu Items:** Use actual menu item IDs from your database:
   ```bash
   mongo MesobDb
   db.menuitems.find({ available: true, inStock: true }).limit(5)
   ```

3. **Branch & Table:** Make sure your table belongs to the branch in the session

4. **Signature Validation:** The QR signature must match your `QR_SECRET` env variable

5. **Server Restart:** After code changes, always restart the server to apply the circular dependency fix

---

## ✅ Summary

**What We Fixed:**
1. ✅ Feature guard now recognizes customer merchant object
2. ✅ Circular dependency resolved with lazy loading
3. ✅ Customer QR orders work end-to-end

**Test Verification:**
- Run automated test: `npm test tests/customer-order-qr-fix.test.js`
- Or follow manual steps above with real session token

**Result:** QR customers can now place orders successfully! 🎉
