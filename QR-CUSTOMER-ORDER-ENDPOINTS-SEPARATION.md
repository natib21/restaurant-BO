# QR Customer Order Endpoints - Separation & Documentation

## ✅ Changes Implemented

Split the order retrieval into two distinct endpoints with different authentication:

### **Customer Endpoint (QR Customers)**
```
GET /api/v1/orders/customer/:id
Authorization: Bearer <session-token>
Authentication: Session-based (QR table session)
```

### **Staff Endpoint (Restaurant Staff)**
```
GET /api/v1/orders/:id
Authorization: Bearer <jwt-token>
Authentication: JWT-based (staff login)
```

Both endpoints return the same response format, but with different access control.

---

## 📋 Endpoint Details

### **1. Customer Get Order (QR Session)**

**Route:** `GET /api/v1/orders/customer/:id`

**Authentication:**
- Type: Session Token (from QR scan)
- Guard: `protectTableSession`
- Feature: `requireFeature('orders')`

**Request:**
```bash
GET http://localhost:8000/api/v1/orders/customer/6a9533328bc68bc64ec6b679
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:** 200 OK
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "6a9533328bc68bc64ec6b679",
      "orderNumber": "QR-001",
      "table": {
        "_id": "6a9547001",
        "tableNumber": "T-02"
      },
      "items": [
        {
          "menu": "6a9533328bc68bc64ec6b682",
          "name": "Kitfo",
          "quantity": 2,
          "price": 150,
          "subtotal": 300
        }
      ],
      "status": "preparing",
      "totalAmount": 300,
      "subtotal": 300,
      "placedAt": "2026-08-31T15:20:45.527Z"
    }
  }
}
```

**Error Cases:**
```json
// 401 Unauthorized - No session token
{
  "message": "You are not logged in. Please scan the QR code again."
}

// 403 Forbidden - Customer at different table tries to access order
{
  "message": "You do not have access to this order"
}

// 404 Not Found - Order doesn't exist
{
  "message": "Order not found"
}
```

---

### **2. Staff Get Order (JWT Auth)**

**Route:** `GET /api/v1/orders/:id`

**Authentication:**
- Type: JWT Token (from staff login)
- Guard: `protect` (JWT validation)
- Feature: `requireFeature('orders')`
- RBAC: Task-based (checking OrderManagement permissions)

**Request:**
```bash
GET http://localhost:8000/api/v1/orders/6a9533328bc68bc64ec6b679
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:** 200 OK (Same format as customer)
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "6a9533328bc68bc64ec6b679",
      "orderNumber": "QR-001",
      "table": {
        "_id": "6a9547001",
        "tableNumber": "T-02"
      },
      "items": [...],
      "status": "preparing",
      "totalAmount": 300,
      "placedAt": "2026-08-31T15:20:45.527Z",
      "assignedWaiter": {
        "_id": "...",
        "fullName": "John Doe"
      }
    }
  }
}
```

**Error Cases:**
```json
// 401 Unauthorized - No JWT token
{
  "message": "You are not logged in!"
}

// 403 Forbidden - Wrong merchant
{
  "message": "Order not found"  // Implicit: not in your merchant
}

// 404 Not Found
{
  "message": "Order not found"
}
```

---

## 🔐 Access Control Comparison

| Aspect | Customer | Staff |
|--------|----------|-------|
| **Auth Type** | Session Token | JWT Token |
| **Route** | `/customer/:id` | `/:id` |
| **Can Access** | Their table's orders only | All orders in merchant |
| **Table Validation** | ✅ Enforced | ❌ No validation |
| **Merchant Validation** | ✅ Enforced | ✅ Enforced |
| **Response Format** | Same | Same |
| **Additional Fields** | Limited | Full (assignedWaiter, etc) |

---

## 🧪 Usage Examples

### **Customer (QR Menu) - Get Their Order**
```javascript
// Frontend QR App
const response = await fetch(
  'http://localhost:8000/api/v1/orders/customer/6a9533328bc68bc64ec6b679',
  {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    }
  }
);

const data = await response.json();
console.log(data.data.order);  // Order details
```

### **Staff (Web Dashboard) - Get Customer's Order**
```javascript
// Frontend Staff App
const response = await fetch(
  'http://localhost:8000/api/v1/orders/6a9533328bc68bc64ec6b679',
  {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    }
  }
);

const data = await response.json();
console.log(data.data.order);  // Order with staff details
```

---

## 📝 Route File Structure

```javascript
// File: src/modules/order/orders.routes.js

// ============================================================
// CUSTOMER ROUTES (Table session - QR menu ordering)
// ============================================================

router.post('/', protectTableSession, requireFeature('orders'), placeOrder);
router.get('/my-history', protectTableSession, requireFeature('orders'), getMyOrderHistory);

// ✅ NEW: Customer get order
router.get('/customer/:id', protectTableSession, requireFeature('orders'), getOrderById);

// ============================================================
// STAFF ROUTES (JWT auth + task RBAC)
// ============================================================

router.use(protect);
router.use(requireFeature('orders'));

// Named routes (before /:id catch-all)
router.get('/active', getActiveOrders);
router.get('/review-queue', getReviewQueue);
router.get('/completed', getCompletedOrders);
router.get('/pending', getPendingOrders);
// ... more status-specific routes

router.patch('/:orderId/items/:itemId/status', updateItemStatus);
router.post('/:orderId/items/serve-ready', serveReadyItems);
// ... more staff routes

// ✅ LAST: Staff get order (catch-all)
router.get('/:id', getOrderById);
```

---

## 🎯 Route Matching Order (CRITICAL)

Express evaluates routes in **registration order**. The sequence must be:

1. ✅ **Customer explicit routes** (`/customer/:id`, `/my-history`)
2. ✅ **Auth middleware** (`protect`, `requireFeature`)
3. ✅ **Staff named routes** (`/active`, `/pending`, `/completed`, etc)
4. ✅ **Staff item routes** (`/:orderId/items/:itemId/status`, etc)
5. ✅ **Staff modification routes** (`/:id/status`, `/:id/cancel`, etc)
6. ✅ **Staff catch-all** (`/:id`) - MUST BE LAST

If `/:id` is registered before `/active`, all requests to `/active` match `/:id` first!

---

## ✅ What's Fixed

| Issue | Solution |
|-------|----------|
| Route conflict | Moved customer route to `/customer/:id` (explicit path) |
| Lost named routes | Named routes now match before `/:id` catch-all |
| Auth confusion | Separate explicit auth for each endpoint |
| Access control | Table validation for customers, merchant validation for staff |

---

## 🔗 Related Endpoints

### **Customer QR Endpoints**
```
POST   /api/v1/orders                    # Place order
GET    /api/v1/orders/my-history        # Order history
GET    /api/v1/orders/customer/:id      # Get order details ✅ NEW
PATCH  /api/v1/orders/:id/cancel        # Cancel order
POST   /api/v1/orders/:id/pay           # Pay order (if public)
```

### **Staff Endpoints**
```
POST   /api/v1/orders/staff             # Place staff order
GET    /api/v1/orders/:id               # Get order details
GET    /api/v1/orders/active            # Active orders
GET    /api/v1/orders/pending           # Pending orders
GET    /api/v1/orders/completed         # Completed orders
PATCH  /api/v1/orders/:id/status        # Update status
POST   /api/v1/orders/:id/pay           # Mark as paid
PATCH  /api/v1/orders/:id/cancel        # Cancel order
```

---

## 🚀 Complete QR Customer Flow

```
1. Scan QR
   → GET /api/v1/sessions/start
   → Response: sessionToken

2. Load Menu
   → GET /api/v1/menu/public
   → Response: menu items

3. Place Order
   → POST /api/v1/orders
   → Authorization: Bearer <sessionToken>
   → Response: orderId ✅

4. View Order Details
   → GET /api/v1/orders/customer/:id        ✅ NEW
   → Authorization: Bearer <sessionToken>
   → Response: order ✅

5. View Order History
   → GET /api/v1/orders/my-history
   → Response: order list ✅

6. Cancel Order
   → PATCH /api/v1/orders/:id/cancel
   → Response: canceled order ✅
```

---

## 📊 Summary

**Status:** ✅ **IMPLEMENTED AND WORKING**

- Customer endpoint: `GET /api/v1/orders/customer/:id` → Session auth
- Staff endpoint: `GET /api/v1/orders/:id` → JWT auth
- Both return same response
- Proper route ordering prevents conflicts
- Access control enforced at service layer

