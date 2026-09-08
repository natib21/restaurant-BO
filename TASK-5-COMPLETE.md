# ✅ Task 5 Complete: Customer Order Creation Refactored

**Date:** September 3, 2026  
**Status:** ✅ Complete - Orders now link to sessions with source='qr'

---

## 📋 What Was Implemented

### Changes Made

**1. Updated protectTableSession Middleware**
**File:** `src/modules/customers/customer-session.guard.js`

**Changes:**
- Now fetches `DiningSession` (using new model)
- Uses `status: 'active'` instead of `isActive: true`
- Populates `req.diningSession` (new field)
- Populates `req.ctx.sessionId` (new field)

**Before:**
```javascript
const session = await CustomerSession.findOne({
  token,
  isActive: true,
  expiresAt: { $gt: new Date() },
});

req.tableSession = session;
req.customerId = session.customer;
```

**After:**
```javascript
const session = await DiningSession.findOne({
  token,
  status: 'active',  // ✅ Updated
});

req.tableSession = session;  // Backward compat
req.diningSession = session;  // ✅ NEW
req.ctx.sessionId = session._id;  // ✅ NEW
req.customerId = session.customer || null;
```

---

**2. Updated placeOrder Handler**
**File:** `src/modules/order/controller/handlers/placement.handler.js`

**Changes:**
- Extracts `sessionId` from `req.diningSession`
- Validates session exists before order creation
- Passes `sessionId` to OrderTransactionService

**Before:**
```javascript
exports.placeOrder = catchAsync(async (req, res, next) => {
  const { order } = await OrderTransactionService.executePlaceOrder({
    merchantId,
    branchId,
    tableId,
    customerId,
    // ❌ No sessionId
    items,
    ...
  });
});
```

**After:**
```javascript
exports.placeOrder = catchAsync(async (req, res, next) => {
  const sessionId = req.diningSession?._id;  // ✅ NEW

  if (!sessionId) {
    return next(new AppError('Valid session is required to place order', 401));
  }

  const { order } = await OrderTransactionService.executePlaceOrder({
    merchantId,
    branchId,
    tableId,
    customerId,
    sessionId,  // ✅ NEW
    items,
    ...
  });
});
```

---

**3. Updated Order Creation in Transaction Service**
**File:** `src/modules/order/service/OrderTransactionService.js`

**Changes:**
- Accepts `sessionId` parameter
- Sets `order.session = sessionId`
- Sets `order.source = 'qr'` (was 'web')

**Before:**
```javascript
static async executePlaceOrder(command) {
  const {
    merchantId,
    tableId,
    customerId,
    // ❌ No sessionId
    items,
    ...
  } = command;

  const [order] = await Order.create([{
    merchant: merchantId,
    table: tableId,
    customer: customerId,
    // ❌ session: MISSING
    source: 'web',  // ❌ WRONG
    items: orderItems,
    ...
  }]);
}
```

**After:**
```javascript
static async executePlaceOrder(command) {
  const {
    merchantId,
    tableId,
    customerId,
    sessionId,  // ✅ NEW
    items,
    ...
  } = command;

  const [order] = await Order.create([{
    merchant: merchantId,
    table: tableId,
    customer: customerId,
    session: sessionId,  // ✅ NEW
    source: 'qr',        // ✅ CORRECT
    items: orderItems,
    ...
  }]);
}
```

---

## 🎯 What This Achieves

### Before Task 5 (Broken)

```javascript
// Customer A scans QR, places order
Order {
  _id: "order1",
  table: "table5",
  session: undefined,  // ❌ Not linked to session
  source: "web",       // ❌ Wrong source
  customer: null
}

// Customer B scans same QR, places order
Order {
  _id: "order2",
  table: "table5",
  session: undefined,  // ❌ Not linked to session
  source: "web",       // ❌ Wrong source
  customer: null
}

// Database state:
DiningSession {
  _id: "session123",
  table: "table5",
  status: "active"
}

// Orders NOT linked to session! ❌
```

### After Task 5 (Fixed) ✅

```javascript
// Customer A scans QR, places order
Order {
  _id: "order1",
  table: "table5",
  session: "session123",  // ✅ Linked to session
  source: "qr",           // ✅ Correct source
  customer: null
}

// Customer B scans same QR, places order
Order {
  _id: "order2",
  table: "table5",
  session: "session123",  // ✅ SAME session
  source: "qr",           // ✅ Correct source
  customer: null
}

// Database state:
DiningSession {
  _id: "session123",
  table: "table5",
  status: "active"
}

// Both orders linked to same session! ✅
```

---

## 🔍 Verification

### Test 1: Check Order Has Session Field

```javascript
// Place order via QR
POST /api/v1/orders
Authorization: Bearer <session-token>

Body: {
  "items": [
    { "menuItemId": "item1", "quantity": 2 }
  ]
}

// Response:
{
  "success": true,
  "data": {
    "_id": "order123",
    "orderNumber": "#T5-001",
    "status": "pending"
  }
}

// Verify in database:
db.orders.findOne({ _id: "order123" })

// Should show:
{
  "_id": "order123",
  "table": "table5",
  "session": "session_abc",  // ✅ POPULATED
  "source": "qr",            // ✅ CORRECT
  "items": [...]
}
```

### Test 2: Multiple Customers Same Session

```javascript
// Customer A scans QR
POST /qr-scan → Gets token "abc123"

// Customer A orders
POST /api/v1/orders
Authorization: Bearer abc123
→ Creates order1 with session="session_xyz"

// Customer B scans SAME QR
POST /qr-scan → Gets SAME token "abc123"

// Customer B orders
POST /api/v1/orders
Authorization: Bearer abc123
→ Creates order2 with session="session_xyz"  // ✅ SAME SESSION

// Verify:
db.orders.find({ session: "session_xyz" })
→ Returns [order1, order2]  // ✅ Both orders
```

### Test 3: Query Orders by Session

```javascript
// Get all orders for a dining session
const orders = await Order.find({
  session: sessionId,
  status: { $nin: ['canceled'] }
});

console.log(`Found ${orders.length} orders for this table visit`);
```

---

## 📊 Data Flow

### Complete Flow: QR Scan → Order Creation

```
1. Customer scans QR
   ↓
2. POST /api/v1/sessions/start?data=XXX&s=YYY
   ↓
3. BranchService.startTableSessionFromQr()
   ├─ Validates QR signature
   ├─ SessionService.getOrCreateActiveSession()
   └─ Returns: { sessionToken: "abc123", isNew: true/false }
   ↓
4. Customer stores token in app
   ↓
5. Customer places order
   POST /api/v1/orders
   Authorization: Bearer abc123
   ↓
6. protectTableSession middleware
   ├─ Validates token
   ├─ Fetches DiningSession
   ├─ Populates req.diningSession
   └─ Populates req.ctx.sessionId
   ↓
7. placeOrder handler
   ├─ Extracts sessionId from req.diningSession._id
   ├─ Validates sessionId exists
   └─ Calls OrderTransactionService.executePlaceOrder({ sessionId })
   ↓
8. executePlaceOrder()
   ├─ Creates order with session: sessionId
   ├─ Sets source: 'qr'
   └─ Saves to database
   ↓
9. Database state:
   Order {
     _id: "order123",
     table: "table5",
     session: "session_abc",  ✅
     source: "qr",            ✅
     items: [...]
   }
```

---

## 🔄 Backward Compatibility

### CustomerSession Still Works

The `CustomerSession` model now exports `DiningSession` as an alias:

```javascript
// File: models/customerSessionModule.js
const DiningSession = require('./DiningSession');
module.exports = DiningSession;
```

**This means:**
- Old code using `CustomerSession` continues to work
- Gradual migration path for other parts of codebase
- No breaking changes for existing functionality

---

## 📁 Files Modified

1. ✅ `src/modules/customers/customer-session.guard.js`
   - Updated to use DiningSession
   - Added req.diningSession
   - Added req.ctx.sessionId

2. ✅ `src/modules/order/controller/handlers/placement.handler.js`
   - Extract sessionId from request
   - Validate session before order creation
   - Pass sessionId to transaction service

3. ✅ `src/modules/order/service/OrderTransactionService.js`
   - Accept sessionId parameter
   - Set order.session = sessionId
   - Set order.source = 'qr'

---

## ✅ Task Completion Checklist

- [x] protectTableSession fetches DiningSession
- [x] req.diningSession populated in middleware
- [x] req.ctx.sessionId populated in middleware
- [x] placeOrder handler extracts sessionId
- [x] placeOrder handler validates sessionId exists
- [x] sessionId passed to OrderTransactionService
- [x] Order.create sets session field
- [x] Order.create sets source='qr'
- [x] Orders link to dining sessions
- [x] Multiple customers can order in same session

---

## 🎉 Result

### What Now Works

✅ **QR Blocking Removed:** Multiple customers can scan same QR (Task 4)  
✅ **Sessions Created:** DiningSession model working (Task 1-3)  
✅ **Orders Linked:** Orders have session field populated (Task 5) ✅  
✅ **Source Correct:** Orders have source='qr' (Task 5) ✅  

### Database State After Task 5

```javascript
// Dining Session
DiningSession {
  _id: "session_abc123",
  table: "table5",
  token: "abc123...",
  status: "active",
  startedAt: "2026-09-03T10:00:00Z"
}

// Orders linked to session
Order {
  _id: "order1",
  session: "session_abc123",  // ✅ LINKED
  source: "qr",               // ✅ CORRECT
  table: "table5",
  customer: null,
  items: [...]
}

Order {
  _id: "order2",
  session: "session_abc123",  // ✅ SAME SESSION
  source: "qr",               // ✅ CORRECT
  table: "table5",
  customer: null,
  items: [...]
}

// Query all orders for this table visit:
Order.find({ session: "session_abc123" })
→ Returns [order1, order2] ✅
```

---

## 🚀 Next Steps

**Task 6: Refactor Staff Order Creation** (Pending)
- Update staff order flow to use SessionService
- Set source='staff' for staff-created orders
- Link staff orders to existing session if table occupied

**Task 7: Create Close Table Endpoint** (Pending)
- POST /api/v1/sessions/:id/close
- Validate all orders paid
- End session (status='ended')
- Update table status

---

**Status:** Task 5 Complete ✅  
**Implementation:** Customer orders now properly linked to dining sessions  
**Next:** Task 6 - Staff Order Creation
