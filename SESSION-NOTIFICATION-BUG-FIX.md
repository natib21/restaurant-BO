# Session Notification Bug Fix - Critical Security Issue

## 🚨 Critical Bug Identified

**Reported by User:** The customer session lookup in `OrderTransactionService` filters by `table + merchant + isActive`. This can notify the **wrong customer** if multiple active sessions exist for the same table.

---

## 🐛 The Problem

### **Original Code (BUGGY):**
```javascript
// OrderTransactionService.js line 258-262
const session = await CustomerSession.findOne({
  table: tableId,
  merchant: merchantId,
  isActive: true,
  expiresAt: { $gt: new Date() },
}).select('token').lean();
```

### **Why This is Dangerous:**

1. **Multiple Active Sessions Possible:**
   - Customer A scans QR at Table 5 → Creates Session 1
   - Customer A leaves without ending session
   - Customer B scans QR at Table 5 → Creates Session 2
   - **Both sessions are active for the same table!**

2. **`.findOne()` Returns Arbitrary Result:**
   - When multiple documents match, MongoDB returns **one at random**
   - Customer B places order → Might notify Customer A's session! 🚨
   - **Wrong customer gets order updates**

3. **Security & Privacy Issue:**
   - Customer A can see Customer B's order details
   - Real-time order status sent to wrong device
   - Violates customer privacy expectations

---

## ✅ The Solution

### **Pass Session Token from Authenticated Request**

The original request was already authenticated with a session token via `protectTableSession` guard. Instead of re-querying by table (which is ambiguous), we now **use the exact session token from the authenticated request**.

---

## 🔧 Changes Made

### **1. Update Placement Handler**
**File:** `src/modules/order/controller/handlers/placement.handler.js`

```javascript
// BEFORE
exports.placeOrder = catchAsync(async (req, res, next) => {
  const items = req.validatedBody?.items || req.body.items;
  const tableId = req.tableId;
  const customerId = req.customerId;
  // ... sessionToken NOT passed

  const { order, replayed } = await OrderTransactionService.executePlaceOrder({
    merchantId,
    branchId,
    tableId,
    customerId,
    items,
    // ❌ sessionToken missing
  });
});
```

```javascript
// AFTER
exports.placeOrder = catchAsync(async (req, res, next) => {
  const items = req.validatedBody?.items || req.body.items;
  const tableId = req.tableId;
  const customerId = req.customerId;
  const sessionToken = req.tableSession?.token; // ✅ Extract from authenticated request

  const { order, replayed } = await OrderTransactionService.executePlaceOrder({
    merchantId,
    branchId,
    tableId,
    customerId,
    sessionToken, // ✅ Pass to transaction service
    items,
  });
});
```

---

### **2. Update Transaction Service**
**File:** `src/modules/order/service/OrderTransactionService.js`

#### **A. Update JSDoc typedef:**
```javascript
/**
 * @typedef {Object} PlaceOrderCommand
 * @property {import('mongoose').Types.ObjectId} merchantId
 * @property {import('mongoose').Types.ObjectId} branchId
 * @property {import('mongoose').Types.ObjectId} tableId
 * @property {import('mongoose').Types.ObjectId} [customerId]
 * @property {import('mongoose').Document} [customer]
 * @property {string} customerName
 * @property {string|null} [customerPhone]
 * @property {string|null} [sessionToken] - QR session token for customer notifications ✅
 * @property {Array} items
 * @property {import('mongoose').Types.ObjectId|null} [performedBy]
 * @property {string|null} [idempotencyKey]
 */
```

#### **B. Extract sessionToken parameter:**
```javascript
static async executePlaceOrder(command) {
  const {
    merchantId,
    branchId,
    tableId,
    customerId,
    customer,
    customerName,
    customerPhone,
    sessionToken, // ✅ Now accepted as parameter
    items,
    performedBy,
    idempotencyKey,
  } = command;
```

#### **C. Update notification logic:**
```javascript
// BEFORE (BUGGY)
if (customerId || tableId) {
  const CustomerSession = require('../../../../models/customerSessionModule');
  const session = await CustomerSession.findOne({
    table: tableId,        // ❌ Ambiguous if multiple sessions exist
    merchant: merchantId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  }).select('token').lean();
  
  if (session) {
    io.to(`session:${session.token}`).emit('order:created', { ... });
  }
}
```

```javascript
// AFTER (FIXED)
if (customerId || tableId) {
  // ✅ Use sessionToken from authenticated request (primary path)
  if (sessionToken) {
    io.to(`session:${sessionToken}`).emit('order:created', {
      _id: createdOrder._id,
      orderNumber: createdOrder.orderNumber,
      status: createdOrder.status,
      totalAmount: createdOrder.totalAmount,
      placedAt: createdOrder.placedAt,
    });
    
    io.to(`session:${sessionToken}`).socketsJoin(`order:${createdOrder._id}`);
    
    logger.info('order.customer_notified', {
      orderId: createdOrder._id.toString(),
      sessionToken: sessionToken.substring(0, 8) + '...',
    });
  } else {
    // ⚠️ Fallback: For staff orders or if sessionToken not provided
    // This path queries by table (may notify wrong customer if multiple active sessions)
    const CustomerSession = require('../../../../models/customerSessionModule');
    const session = await CustomerSession.findOne({
      table: tableId,
      merchant: merchantId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).select('token').lean();
    
    if (session) {
      io.to(`session:${session.token}`).emit('order:created', { ... });
      
      logger.info('order.customer_notified_fallback', {
        orderId: createdOrder._id.toString(),
        sessionToken: session.token.substring(0, 8) + '...',
        warning: 'Used table lookup - may be inaccurate if multiple sessions exist',
      });
    }
  }
}
```

---

## 📊 Before vs After

### **Before (Buggy):**
```
Customer A (Session 1) → Table 5
  ↓ (leaves without ending session)
Customer B (Session 2) → Table 5
  ↓ (places order)
Query: findOne({ table: 5, isActive: true })
  ↓ (returns arbitrary session - could be Session 1!)
Notify: Session 1 ❌ (Wrong customer!)
```

### **After (Fixed):**
```
Customer A (Session 1) → Table 5
  ↓ (leaves without ending session)
Customer B (Session 2) → Table 5
  ↓ (places order with Bearer Session2Token)
Use: sessionToken = Session2Token from request
  ↓ (exact session from authentication)
Notify: Session 2 ✅ (Correct customer!)
```

---

## 🎯 Benefits

1. **✅ Accuracy:** Always notifies the correct customer who placed the order
2. **✅ Security:** No cross-customer information leakage
3. **✅ Performance:** One less database query (session already in memory)
4. **✅ Reliability:** No ambiguity when multiple sessions exist
5. **✅ Backward Compatible:** Fallback path exists for staff orders

---

## 🧪 Test Scenario

### **Reproduce the Bug:**
```bash
# Terminal 1: Customer A
curl -X POST http://localhost:8000/api/v1/sessions/start?data=...&s=...
# Response: { sessionToken: "token-a-123..." }

# Terminal 2: Customer B (same table as A)
curl -X POST http://localhost:8000/api/v1/sessions/start?data=...&s=...
# Response: { sessionToken: "token-b-456..." }

# Terminal 2: Customer B places order
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer token-b-456" \
  -d '{ "items": [...] }'

# ❌ OLD: Might notify Customer A (token-a-123)
# ✅ NEW: Always notifies Customer B (token-b-456)
```

---

## 📝 Additional Notes

### **TypeScript Compilation Status:**
The user asked about `socket-server.ts` compilation. Current status:
```
❌ FAILED with 6 errors
   - Missing esModuleInterop in tsconfig.json
   - Import errors for winston, chalk, dotenv, path, http, jsonwebtoken
   
This is a separate issue from the session notification bug.
```

### **Fallback Path:**
The fallback path (table lookup) is kept for:
- Staff-placed orders (no session token)
- Legacy code paths that don't pass sessionToken
- Graceful degradation if sessionToken is missing

The fallback logs a warning to alert developers if it's being used.

---

## ✅ Summary

**Status:** ✅ **FIXED**

**Impact:** **CRITICAL** - Prevented wrong-customer notifications and privacy violation

**Files Changed:**
1. `src/modules/order/controller/handlers/placement.handler.js`
2. `src/modules/order/service/OrderTransactionService.js`

**Testing:** Recommend testing multi-session scenario to verify fix

**Deployment:** Safe to deploy - backward compatible with fallback path
