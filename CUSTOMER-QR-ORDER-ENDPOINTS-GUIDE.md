# Customer QR Order Endpoints - Authentication Guide

## ✅ Updated Endpoints

Your customer-facing endpoints now support **customer session authentication** in addition to staff JWT authentication.

### **Endpoints Summary**

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/v1/orders` | POST | Session | Create new order (customers via QR) |
| `/api/v1/orders/:id` | GET | Dual | Get order details (staff JWT OR customer session) |
| `/api/v1/orders/my-history` | GET | Session | Get customer's order history |

---

## 🔐 Authentication Methods

### **1. Customer Session Authentication** (QR Menu App)
```javascript
// Frontend sends session token in Authorization header
fetch('http://localhost:8000/api/v1/orders/:orderId', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${sessionToken}`  // Session token from QR scan
  }
});
```

**Session token is obtained from:**
```
GET /api/v1/sessions/start?data=<encoded>&s=<signature>
```

### **2. Staff JWT Authentication** (Dashboard/Staff App)
```javascript
// Automatic via cookies (HTTP-only JWT)
fetch('http://localhost:8000/api/v1/orders/:orderId', {
  method: 'GET',
  credentials: 'include'  // Includes JWT cookie
});
```

---

## 📋 Endpoint Details

### **POST `/api/v1/orders`** - Create Order (Customer)

**Authentication:** Session token (from QR scan)

**Request:**
```javascript
fetch('http://localhost:8000/api/v1/orders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    items: [
      {
        menuItemId: '6a9533328bc68bc64ec6b682',
        name: 'Kitfo',
        quantity: 2,
        price: 150,
        subtotal: 300,
        options: [],
        notes: 'No spicy'
      }
    ],
    branchId: '670a1b2c3d4e5f6789018888',
    table: 'T-02',
    customerName: 'Guest',
    subtotal: 300,
    totalAmount: 330
  })
})
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "6a95a5eabdf6ba6ee98544da",
      "orderNumber": "#1001",
      "status": "pending",
      "items": [...],
      "totalAmount": 330,
      "placedAt": "2026-08-31T15:20:45.527Z"
    }
  }
}
```

---

### **GET `/api/v1/orders/:id`** - Get Order Details (Dual Auth)

**Authentication:** Session token (customer) OR JWT (staff)

**Customer Request** (via QR session):
```javascript
fetch('http://localhost:8000/api/v1/orders/6a95a5eabdf6ba6ee98544da', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${sessionToken}`
  }
});
```

**Staff Request** (via JWT):
```javascript
fetch('http://localhost:8000/api/v1/orders/6a95a5eabdf6ba6ee98544da', {
  method: 'GET',
  credentials: 'include'  // HTTP-only JWT cookie
});
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "6a95a5eabdf6ba6ee98544da",
      "orderNumber": "#1001",
      "status": "pending",
      "table": {
        "_id": "670a15f0e7b3c8e4a5d2f1c9",
        "tableNumber": "T-02"
      },
      "items": [
        {
          "menuItem": {
            "_id": "6a9533328bc68bc64ec6b682",
            "name": "Kitfo",
            "price": 150
          },
          "quantity": 2,
          "subtotal": 300
        }
      ],
      "totalAmount": 330,
      "placedAt": "2026-08-31T15:20:45.527Z",
      "branch": { "name": "Main Branch" }
    }
  }
}
```

**Access Control:**
- ✅ **Customer can view** if they have an active session for that table
- ✅ **Staff can view** if order is in their merchant
- ❌ **Customer cannot view** orders from other tables
- ❌ **Staff from different merchant cannot view**

---

### **GET `/api/v1/orders/my-history`** - Get Order History (Session)

**Authentication:** Session token (customer only)

**Request:**
```javascript
fetch('http://localhost:8000/api/v1/orders/my-history', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${sessionToken}`
  }
});
```

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "orders": [
      {
        "_id": "6a95a5eabdf6ba6ee98544da",
        "orderNumber": "#1001",
        "totalAmount": 330,
        "status": "completed",
        "placedAt": "2026-08-31T15:20:45.527Z"
      },
      {
        "_id": "6a95a4d2bdf6ba6ee98544c8",
        "orderNumber": "#1000",
        "totalAmount": 250,
        "status": "completed",
        "placedAt": "2026-08-30T14:15:30.000Z"
      }
    ]
  }
}
```

**Notes:**
- Returns completed and canceled orders only
- Limited to last 50 orders
- Customer only sees their own order history (scoped to their session)

---

## 🔒 Security Features

### **Dual Authentication on `/:id` Endpoint**

The `GET /api/v1/orders/:id` endpoint uses a **dual-auth middleware** that supports both authentication types:

```javascript
// File: src/modules/order/middleware/dual-auth.js

const dualAuth = (req, res, next) => {
  // 1. Check if JWT auth attempted (Bearer header or jwt cookie)
  if (req.headers.authorization?.startsWith('Bearer') || req.cookies?.jwt) {
    // Try JWT auth (staff)
    protect(req, res, (err) => {
      if (!err) {
        return next();  // JWT auth succeeded
      }
      // JWT failed, try session
      return protectTableSession(req, res, next);
    });
  } else {
    // No JWT, try session auth
    return protectTableSession(req, res, next);
  }
};
```

### **Customer Order Isolation**

Customers can **only access orders from their table's session**:

```javascript
// OrderService.getOrderByIdDualAuth()
if (req.tableSession) {
  // Customer session auth
  if (order.table?.toString() !== req.tableId?.toString()) {
    throw new AppError('You do not have access to this order', 403);
  }
}
```

---

## 📐 Architecture

### **Route Structure**

```
POST /api/v1/orders
  ├─ protectTableSession (customer)
  ├─ requireFeature('orders')
  └─ placeOrder

GET /api/v1/orders/:id
  ├─ dualAuth (↓↓↓ BOTH auth types)
  │  ├─ Try JWT (staff)
  │  └─ Fallback to session (customer)
  ├─ requireFeature('orders')
  └─ getOrderById

GET /api/v1/orders/my-history
  ├─ protectTableSession (customer only)
  ├─ requireFeature('orders')
  └─ getMyOrderHistory

[Other staff routes]
  ├─ protect (JWT only)
  ├─ requireFeature('orders')
  └─ [handler]
```

### **Authentication Flow**

**Customer (QR Menu):**
```
1. Scan QR → GET /api/v1/sessions/start
2. Receive session token
3. Store token (frontend)
4. Use in Authorization header for requests
5. Each request: Backend validates session token
6. Access granted if session is active for that table
```

**Staff (Dashboard):**
```
1. Login → POST /api/v1/auth/login
2. Receive JWT in HTTP-only cookie
3. Cookie stored by browser
4. Each request: Cookie auto-included
5. Backend validates JWT
6. Access granted if authorized for that merchant
```

---

## 🛠️ Frontend Implementation

### **Customer QR App**

```javascript
// Step 1: Get session from QR scan
const sessionToken = getSessionTokenFromQR(); // e.g., from URL params

// Step 2: Fetch menu (public endpoint, no auth needed)
const menuResponse = await fetch(
  'http://localhost:8000/api/v1/menu/public',
  { headers: { 'Authorization': `Bearer ${sessionToken}` } }
);

// Step 3: Place order
const orderResponse = await fetch('http://localhost:8000/api/v1/orders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    items: selectedItems,
    branchId: currentBranch._id,
    table: tableNumber,
    customerName: 'Guest',
    totalAmount: calculateTotal(selectedItems)
  })
});

const order = (await orderResponse.json()).data.order;

// Step 4: Check order status
const statusResponse = await fetch(
  `http://localhost:8000/api/v1/orders/${order._id}`,
  { headers: { 'Authorization': `Bearer ${sessionToken}` } }
);

const currentOrder = (await statusResponse.json()).data.order;

// Step 5: View order history
const historyResponse = await fetch(
  'http://localhost:8000/api/v1/orders/my-history',
  { headers: { 'Authorization': `Bearer ${sessionToken}` } }
);

const previousOrders = (await historyResponse.json()).data.orders;
```

### **Staff Dashboard**

```javascript
// Step 1: Login (JWT stored in HTTP-only cookie)
const loginResponse = await fetch('http://localhost:8000/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

// Step 2: Fetch any order (JWT auto-included in cookie)
const orderResponse = await fetch(
  'http://localhost:8000/api/v1/orders/6a95a5eabdf6ba6ee98544da',
  { credentials: 'include' }
);

const order = (await orderResponse.json()).data.order;
```

---

## ✅ Error Handling

### **Customer Session Errors**

```json
// Missing session token
{
  "success": false,
  "message": "You are not logged in. Please scan the QR code again.",
  "statusCode": 401
}

// Expired session
{
  "success": false,
  "message": "Session expired or invalid. Please scan the QR code again.",
  "statusCode": 401
}

// Accessing order from different table
{
  "success": false,
  "message": "You do not have access to this order",
  "statusCode": 403
}
```

### **Staff JWT Errors**

```json
// Missing or expired JWT
{
  "success": false,
  "message": "Your session has expired. Please log in again.",
  "statusCode": 401
}

// Order from different merchant
{
  "success": false,
  "message": "Order not found",
  "statusCode": 404
}
```

---

## 📝 API Comparison Table

| Feature | Customer (Session) | Staff (JWT) |
|---------|-------------------|-----------|
| Order Creation | ✅ Own orders only | ✅ For any customer |
| View Order Details | ✅ Own orders | ✅ Merchant orders |
| View History | ✅ Own history | ❌ Not available |
| Modify Order | ❌ Not allowed | ✅ Staff controls |
| Cancel Order | ⚠️ Active orders | ✅ Full control |
| Payment | ✅ QR payment | ✅ Multiple methods |

---

## 🚀 Frontend URL Configuration

Update your frontend endpoints:

```javascript
// frontend/config.js
const BASE_URL = 'http://localhost:8000/api/v1';

export const getOrderUrl = (orderId, sessionToken) =>
  `${BASE_URL}/orders/${orderId}?token=${sessionToken}`;

export const getMyOrdersUrl = (sessionToken) =>
  `${BASE_URL}/orders/my-history?token=${sessionToken}`;

export const createOrderUrl = `${BASE_URL}/orders`;

// Or use Authorization header instead of query params
export const ordersAPI = {
  create: async (data, sessionToken) =>
    fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }),

  getById: async (orderId, sessionToken) =>
    fetch(`${BASE_URL}/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    }),

  getHistory: async (sessionToken) =>
    fetch(`${BASE_URL}/orders/my-history`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    })
};
```

---

## ✅ Summary

✅ **Customers** can view their own orders via session token  
✅ **Customers** can see order history (only their orders)  
✅ **Customers** access restricted to their table's session  
✅ **Staff** can view any order in their merchant via JWT  
✅ **Same endpoint** works for both auth types (`GET /:id`)  
✅ **Session tokens** auto-populate merchant/branch context  
✅ **Feature guards** work with both auth types

**Status:** ✅ **COMPLETE AND IMPLEMENTED**
