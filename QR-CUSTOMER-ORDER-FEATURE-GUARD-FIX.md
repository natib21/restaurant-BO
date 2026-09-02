# QR Customer Order - Feature Guard Fix

## ✅ Problem Solved

**Issue:** Customer orders via QR code were failing with:
```json
{
  "success": false,
  "message": "Your subscription is not active",
  "statusCode": 403
}
```

**Root Cause:** The `protectTableSession` guard (for QR customers) only set `req.merchantId` (string), but the `requireFeature` guard expected `req.merchant` (full Mongoose document with methods like `.hasActiveAccess` and `.hasFeature()`).

---

## 🔧 Solution Applied

### **File Changed:** `src/modules/customers/customer-session.guard.js`

**Before:**
```javascript
req.merchantId = session.merchant;  // ❌ Only set ID string
```

**After:**
```javascript
// ✅ Populate full merchant object for feature guard
const merchant = await Merchant.findById(session.merchant).select(
  'businessName isActive status isSubscriptionActive features subscription'
);

if (!merchant || !merchant.isActive) {
  return next(new AppError('Restaurant is not available at this time.', 403));
}

req.merchantId = session.merchant;  // ✅ Keep ID for backward compatibility
req.merchant = merchant;  // ✅ Add full merchant object with methods
```

---

## ✅ What's Fixed

### **1. Feature Guard Now Works for QR Orders**
- ✅ `req.merchant.hasActiveAccess` → Checks subscription status
- ✅ `req.merchant.hasFeature('orders')` → Checks if orders feature enabled
- ✅ Properly validates merchant status before allowing orders

### **2. Early Merchant Validation**
- ✅ Checks if merchant is active before processing request
- ✅ Returns clear error if restaurant is closed/inactive

### **3. All Tests Passing**
```
✓ should allow customer order request to pass feature guard with valid QR session
✓ should reject order if merchant subscription is inactive
✓ should reject order if merchant is inactive  
✓ should reject order if orders feature is disabled
```

---

## 📋 How It Works Now

### **QR Customer Order Flow:**

1. **Customer scans QR code** → Gets session token
2. **Customer places order** → Sends request with `Authorization: Bearer <token>`
3. **`protectTableSession` guard:**
   - ✅ Validates session token
   - ✅ Loads full merchant object from DB
   - ✅ Checks if merchant is active
   - ✅ Sets `req.merchant` (full object) + `req.merchantId` (ID string)
4. **`requireFeature('orders')` guard:**
   - ✅ Checks `req.merchant.hasActiveAccess` (subscription active)
   - ✅ Checks `req.merchant.hasFeature('orders')` (orders feature enabled)
   - ✅ Allows request to proceed if both pass
5. **Order placement logic** → Processes the order

---

## 🔑 Key Points

### **Merchant Features Structure:**
```javascript
features: {
  core: {
    menu: { enabled: true },
    tableManagement: { enabled: true }
  },
  optional: {
    orders: { enabled: true },  // ⚠️ Orders is in optional, not core!
    inventory: { enabled: false },
    multiBranch: { enabled: false },
    // ... more optional features
  }
}
```

### **Virtual Properties:**
```javascript
// These are computed properties on the Merchant model:
merchant.hasActiveAccess  // → status === 'approved' && isActive && isSubscriptionActive
merchant.hasFeature('orders')  // → features.optional.orders.enabled === true
```

### **Required Fields for Virtual Properties:**
```javascript
// Must select these fields for virtuals to work:
.select('status isActive isSubscriptionActive features')
```

---

## 🧪 Test Coverage

Created `tests/customer-order-qr-fix.test.js`:

- ✅ Valid QR session + active subscription → Passes feature guard
- ✅ Invalid subscription → Returns 403 "subscription not active"
- ✅ Inactive merchant → Returns 403 "not available"
- ✅ Orders feature disabled → Returns 403 "orders not enabled"

---

## 🚀 Impact

### **Before Fix:**
```
POST /api/v1/orders (QR customer)
→ 403 "Your subscription is not active" ❌
```

### **After Fix:**
```
POST /api/v1/orders (QR customer)
→ Properly validates merchant subscription & features ✅
→ Allows order if everything is valid ✅
```

---

## 📝 Files Modified

1. **`src/modules/customers/customer-session.guard.js`**
   - Added merchant object population
   - Added merchant active check
   - Sets both `req.merchant` (object) and `req.merchantId` (ID)

2. **`tests/customer-order-qr-fix.test.js`** (NEW)
   - Comprehensive test coverage for feature guard
   - Tests all rejection scenarios
   - Validates guard behavior

---

## ✅ Verification

Run test:
```bash
npm test tests/customer-order-qr-fix.test.js
```

Expected output:
```
✓ should allow customer order request to pass feature guard
✓ should reject order if merchant subscription is inactive
✓ should reject order if merchant is inactive
✓ should reject order if orders feature is disabled

Tests: 4 passed, 4 total
```

---

## 🎯 Summary

The fix ensures that QR customer orders work exactly like staff orders - both go through the same feature guard validation, but now the guard has access to the full merchant object needed to check subscription status and enabled features.

**Status:** ✅ **COMPLETE AND TESTED**
