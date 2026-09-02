# Order Retrieval Issues - Debugging Guide

## Issue 1: Merchant App - "Order not found" (404)

### Error
```
GET /api/v1/orders/6a96e39fc324465f458ea9a1
Status: 404
"Order not found"
```

### Root Causes

#### **Cause A: Wrong Order ID**
The order ID doesn't exist in database.

**Check:**
```bash
# In MongoDB shell
db.orders.findOne({ _id: ObjectId("6a96e39fc324465f458ea9a1") })

# If empty result → order doesn't exist
```

**Fix:** Use correct order ID

---

#### **Cause B: Order Belongs to Different Merchant**
Order exists but belongs to a different merchant than the requesting user.

**How it happens:**
```javascript
// Order was created for Merchant A
order.merchant = "6a95..." (Merchant A)

// User from Merchant B tries to access it
req.merchantId = "6b96..." (Merchant B)

// Verification fails at line 1376
if (order.merchant?.toString() !== req.merchantId?.toString()) {
  throw new AppError('Order not found', 404);  // ❌ Fails here
}
```

**Check:**
```javascript
// In browser console or debug script:
// 1. Get the order
const order = await fetch('/api/v1/orders/6a96e39fc324465f458ea9a1')
  .then(r => r.json());

// 2. Get current user's merchant
const me = await fetch('/api/v1/users/me')
  .then(r => r.json());

// 3. Compare
console.log('Order merchant:', order.data.order.merchant);
console.log('My merchant:', me.data.user.merchant);
// If different → this is the problem!
```

**Fix:** 
- Ensure user is logged in to the correct merchant account
- If trying to access orders from multiple merchants, the business model needs to support cross-merchant access

---

#### **Cause C: Incorrect URL Path**
Routes are registered in specific order. Make sure you're not hitting a named route first.

**Routes (in order of precedence):**
```
1. POST /api/v1/orders/staff              ← Place staff order
2. GET /api/v1/orders/active              ← Get active orders
3. GET /api/v1/orders/review-queue        ← Get review queue
4. GET /api/v1/orders/completed           ← Get completed orders
5. GET /api/v1/orders/pending             ← Get pending orders
6. GET /api/v1/orders/number/:orderNumber ← Get by order number
7. GET /api/v1/orders/:id                 ← Get by ID (generic catch-all)
```

**Check:** Is the route matching before the `:id` catch-all?

---

### How to Fix (Merchant App)

```bash
# 1. Verify the order exists and belongs to your merchant
curl -H "Authorization: Bearer <jwt>" \
  http://localhost:8000/api/v1/orders/6a96e39fc324465f458ea9a1

# 2. Check if you're logged in to the correct merchant
curl -H "Authorization: Bearer <jwt>" \
  http://localhost:8000/api/v1/users/me

# 3. If merchants don't match, login to the correct account
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"correct@merchant.com","password":"..."}' \
  http://localhost:8000/api/v1/auth/login
```

---

## Issue 2: Customer App - "Invalid token" (401)

### Error
```
GET /api/v1/orders/6a96e39fc324465f458ea9a1
Status: 401
"Invalid token. Please log in again."
```

### Root Causes

#### **Cause A: No Session Token Provided**
Customer didn't include the QR session token.

**Wrong:**
```javascript
// ❌ No auth header
fetch('http://localhost:8000/api/v1/orders/6a96e39fc324465f458ea9a1')
```

**Correct:**
```javascript
// ✅ Include session token
fetch('http://localhost:8000/api/v1/orders/6a96e39fc324465f458ea9a1', {
  headers: {
    'Authorization': `Bearer ${sessionToken}`
  }
})
```

---

#### **Cause B: Invalid or Expired Session Token**
Session token is invalid or has expired.

**Session duration:** 4 hours (configurable via `SESSION_DURATION_HOURS`)

**Check:**
```bash
# In MongoDB
db.customersessions.findOne({ token: "your-token-here" })

# Should return:
# - isActive: true
# - expiresAt: future date (not past)
# - Not null → token valid

# If isActive: false or expiresAt in past → expired
```

**Fix:**
1. Get new session from QR code
2. Or extend session by making a request (auto-extends 4 hours)

---

#### **Cause C: Malformed Token**
Token is sent in wrong format.

**Wrong:**
```javascript
// ❌ Wrong format
headers: {
  'Authorization': sessionToken  // Missing "Bearer " prefix
}
```

**Correct:**
```javascript
// ✅ Correct format
headers: {
  'Authorization': `Bearer ${sessionToken}`
}
```

---

#### **Cause D: Using JWT Instead of Session Token**
Customer is trying to use staff JWT token (from login) instead of QR session token.

**Wrong:**
```javascript
// ❌ Using staff JWT (doesn't work for customer)
const staffJwt = '...jwt from /auth/login...';
fetch('http://localhost:8000/api/v1/orders', {
  headers: { 'Authorization': `Bearer ${staffJwt}` },
  credentials: 'include'  // For JWT cookie
});
```

**Correct:**
```javascript
// ✅ Using QR session token
const sessionToken = '...from QR session start...';
fetch('http://localhost:8000/api/v1/orders', {
  headers: { 'Authorization': `Bearer ${sessionToken}` }
});
```

---

### How the `dualAuth` Middleware Works

```javascript
// The middleware checks in this order:

1. Is there a Bearer token in Authorization header?
   Yes → Try JWT auth (staff)
   
2. Is there a jwt cookie?
   Yes → Try JWT auth (staff)
   
3. Did JWT auth succeed?
   Yes → Allow request
   No → Fall back to session auth
   
4. Try session auth (customer QR)
   Success → Allow request
   Fail → Return 401 "Invalid token"
```

### How to Debug (Customer App)

```javascript
// Step 1: Get session token from QR
const qrParams = new URLSearchParams(window.location.search);
const data = JSON.parse(atob(qrParams.get('data')));
const signature = qrParams.get('s');

// Step 2: Start session
const sessionResponse = await fetch('http://localhost:8000/api/v1/sessions/start?data=' + encodeURIComponent(qrParams.get('data')) + '&s=' + signature, {
  method: 'POST'
});
const sessionData = await sessionResponse.json();
const sessionToken = sessionData.data.token;
console.log('Session token:', sessionToken);

// Step 3: Try fetching order
const orderResponse = await fetch('http://localhost:8000/api/v1/orders/6a96e39fc324465f458ea9a1', {
  headers: {
    'Authorization': `Bearer ${sessionToken}`
  }
});
const orderData = await orderResponse.json();
console.log('Order response:', orderData);
```

---

## Quick Checklist

### Merchant App (JWT Auth)
- [ ] User is logged in (`/api/v1/auth/login`)
- [ ] JWT token is valid (check in browser DevTools → Application → Cookies)
- [ ] User's merchant matches order's merchant
- [ ] Order ID is correct
- [ ] Using correct HTTP method (GET not POST)
- [ ] Order exists in database

### Customer App (Session Auth)
- [ ] Started QR session (`/api/v1/sessions/start`)
- [ ] Session token is in `Authorization: Bearer <token>` header
- [ ] Session token is valid and not expired
- [ ] Session belongs to correct table
- [ ] Using `Bearer` prefix in auth header
- [ ] Order belongs to the session's merchant

---

## Database Queries to Debug

### Check if order exists:
```javascript
db.orders.findOne({ _id: ObjectId("6a96e39fc324465f458ea9a1") })
```

### Check if session exists:
```javascript
db.customersessions.findOne({ 
  token: "your-session-token",
  isActive: true,
  expiresAt: { $gt: new Date() }
})
```

### Check user's merchant:
```javascript
db.users.findOne({ email: "user@restaurant.com" }, { merchant: 1 })
```

### Check order's merchant:
```javascript
db.orders.findOne({ _id: ObjectId("6a96e39fc324465f458ea9a1") }, { merchant: 1 })
```

---

## Common Scenarios

### Scenario 1: Merchant tries to fetch order they created
✅ Should work:
- User logs in with JWT
- Requests order they created
- Order.merchant === User.merchant

❌ Fails if:
- User from different merchant
- Order doesn't exist

---

### Scenario 2: Customer QR scans and fetches their order
✅ Should work:
- Customer scans QR
- Gets session token
- Requests order with session token
- Session.merchant === Order.merchant
- Session.table === Order.table

❌ Fails if:
- No session token provided
- Session expired
- Session belongs to different merchant

---

## Testing Commands

### Test 1: List available orders
```bash
curl -H "Authorization: Bearer <jwt>" \
  http://localhost:8000/api/v1/orders
```

### Test 2: Get specific order (staff)
```bash
curl -H "Authorization: Bearer <jwt>" \
  http://localhost:8000/api/v1/orders/6a96e39fc324465f458ea9a1
```

### Test 3: Get order with session
```bash
curl -H "Authorization: Bearer <session-token>" \
  http://localhost:8000/api/v1/orders/6a96e39fc324465f458ea9a1
```

### Test 4: Check current user
```bash
curl -H "Authorization: Bearer <jwt>" \
  http://localhost:8000/api/v1/users/me
```

---

## Summary

| Issue | Cause | Fix |
|-------|-------|-----|
| Merchant: 404 | Wrong order ID | Verify order ID exists |
| Merchant: 404 | Different merchant | Login to correct account |
| Merchant: 404 | Named route matched first | Check URL path |
| Customer: 401 | No auth header | Add `Authorization: Bearer <token>` |
| Customer: 401 | Invalid token | Get new session token |
| Customer: 401 | Expired session | Start new session |
| Customer: 401 | Wrong token type | Use session token, not JWT |

**Most likely fix for your case:**
- **Merchant:** Verify the order belongs to your merchant
- **Customer:** Ensure session token is included in `Authorization` header with `Bearer` prefix
