# Staff Dashboard API Guide

## 📊 Overview

Your backend has all the endpoints needed for a complete staff dashboard. This guide shows you how to integrate them into your frontend.

---

## 🔐 Authentication

All staff dashboard endpoints require JWT authentication via HTTP-only cookies.

### **Login (Staff)**
```bash
POST /api/v1/auth/login
Content-Type: application/json
Credentials: include

{
  "email": "staff@restaurant.com",
  "password": "password123"
}
```

Response:
```json
{
  "status": "success",
  "token": "eyJhbGc...",
  "data": {
    "user": {
      "id": "...",
      "email": "staff@restaurant.com",
      "role": "waiter",
      "merchant": {
        "_id": "merchant-id",
        "businessName": "My Restaurant"
      },
      "branch": {
        "_id": "branch-id",
        "name": "Main Branch"
      }
    }
  }
}
```

---

## 📋 Dashboard Endpoints

### **1. Get All Active Orders (Current Branch)**

Shows all orders for the current staff member's branch.

```bash
GET /api/v1/orders?status=active&page=1&limit=10
Authorization: Bearer <token>
Credentials: include
```

**Query Parameters:**
- `status`: Filter by status (pending, accepted, preparing, ready, served, canceled, completed)
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10)
- `sort`: Sort field (e.g., `-createdAt`, `totalAmount`)
- `search`: Search by order number, customer name, or table

**Response:**
```json
{
  "status": "success",
  "results": 25,
  "total": 127,
  "page": 1,
  "pages": 6,
  "summary": {
    "totalRevenue": 45250.50,
    "totalItems": 342,
    "byStatus": {
      "pending": 3,
      "accepted": 2,
      "preparing": 5,
      "ready": 8,
      "served": 89,
      "canceled": 22
    }
  },
  "data": {
    "orders": [
      {
        "id": "order-123",
        "orderNumber": "ORD-001",
        "status": "ready",
        "source": "qr",
        "table": "T-01",
        "customer": null,
        "customerName": "Guest",
        "items": [
          {
            "menu": {
              "id": "menu-456",
              "name": "Burger",
              "price": 250
            },
            "quantity": 2,
            "price": 500,
            "status": "ready"
          }
        ],
        "subtotal": 500,
        "tax": 50,
        "totalAmount": 550,
        "createdAt": "2026-08-31T15:30:00Z",
        "updatedAt": "2026-08-31T15:45:00Z"
      }
    ]
  }
}
```

---

### **2. Get Pending Orders (Review Queue)**

Shows orders that need review based on staff role.

```bash
GET /api/v1/orders/review-queue
Authorization: Bearer <token>
Credentials: include
```

**Response:** Same as above, but filtered to only pending orders that need this staff member's role.

---

### **3. Get Orders by Status**

Get orders filtered by specific status.

```bash
# Pending orders
GET /api/v1/orders/pending

# Accepted orders
GET /api/v1/orders/accepted

# Currently being prepared
GET /api/v1/orders/preparing

# Ready for serving
GET /api/v1/orders/ready

# Already served
GET /api/v1/orders/served

# Canceled orders
GET /api/v1/orders/canceled

# Completed orders
GET /api/v1/orders/completed
```

---

### **4. Get Single Order Details**

```bash
GET /api/v1/orders/{orderId}
Authorization: Bearer <token>
Credentials: include
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "id": "order-123",
      "orderNumber": "ORD-001",
      "status": "preparing",
      "source": "qr",
      "table": {
        "id": "table-1",
        "number": "T-01",
        "capacity": 4
      },
      "customer": null,
      "customerName": "Guest",
      "items": [
        {
          "id": "item-1",
          "menu": {
            "id": "menu-456",
            "name": {
              "en": "Grilled Burger",
              "am": "የተጠበሰ በርገር"
            },
            "price": 250,
            "prepTime": "15-20 min"
          },
          "quantity": 2,
          "price": 500,
          "notes": "No onions",
          "status": "preparing",
          "statusUpdatedAt": "2026-08-31T15:35:00Z"
        }
      ],
      "subtotal": 500,
      "tax": 50,
      "totalAmount": 550,
      "paymentStatus": "unpaid",
      "paymentMethod": null,
      "notes": "Customer requested window table",
      "createdBy": {
        "id": "user-1",
        "name": "John Staff"
      },
      "createdAt": "2026-08-31T15:30:00Z",
      "updatedAt": "2026-08-31T15:35:00Z"
    }
  }
}
```

---

### **5. Get Merchant-Wide Orders (Owner View)**

Shows all orders across ALL branches (merchant owner only).

```bash
GET /api/v1/orders/merchant/all?page=1&limit=20
Authorization: Bearer <token>
Credentials: include
```

**Same response structure as "Get All Active Orders"**

---

### **6. Get Orders by Branch (Manager View)**

Get orders for a specific branch.

```bash
GET /api/v1/orders/{branchId}/orders?page=1
Authorization: Bearer <token>
Credentials: include
```

---

## 🎯 Update Order Status

### **Update Single Order Item Status**

```bash
PATCH /api/v1/orders/{orderId}/items/{itemId}/status
Authorization: Bearer <token>
Credentials: include
Content-Type: application/json

{
  "status": "ready",
  "notes": "Order is ready for serving"
}
```

**Status Flow:**
- `pending` → `accepted` → `preparing` → `ready` → `served`
- Can jump to `canceled` or `void` from any state

---

### **Mark Item as Void**

```bash
PATCH /api/v1/orders/{orderId}/items/{itemId}/void
Authorization: Bearer <token>
Credentials: include
Content-Type: application/json

{
  "reason": "Out of stock"
}
```

---

### **Serve Ready Items**

Mark all ready items in an order as served.

```bash
POST /api/v1/orders/{orderId}/items/serve-ready
Authorization: Bearer <token>
Credentials: include
```

---

### **Update Entire Order Status**

```bash
PATCH /api/v1/orders/{orderId}/status
Authorization: Bearer <token>
Credentials: include
Content-Type: application/json

{
  "status": "served"
}
```

---

### **Cancel Order**

```bash
PATCH /api/v1/orders/{orderId}/cancel
Authorization: Bearer <token>
Credentials: include
Content-Type: application/json

{
  "reason": "Customer requested cancellation"
}
```

---

### **Mark Order as Paid**

```bash
POST /api/v1/orders/{orderId}/pay
Authorization: Bearer <token>
Credentials: include
Content-Type: multipart/form-data

{
  "paymentMethod": "cash",
  "image": <optional_payment_proof>
}
```

---

## 📊 Dashboard Data Structure

### **Frontend State for Dashboard**

```javascript
{
  // Orders grouped by status
  orders: {
    pending: [],        // Waiting to be accepted
    accepted: [],       // Accepted by kitchen
    preparing: [],      // Currently being prepared
    ready: [],          // Ready for serving
    served: [],         // Already served
    canceled: [],       // Canceled
    completed: []       // Completed & paid
  },

  // Summary statistics
  summary: {
    totalRevenue: 45250.50,
    totalOrders: 127,
    byStatus: {
      pending: 3,
      accepted: 2,
      preparing: 5,
      ready: 8,
      served: 89,
      canceled: 22,
      completed: 0
    }
  },

  // Current selection
  selectedOrder: null,
  loading: false,
  error: null
}
```

---

## 🎨 React Dashboard Component Example

```javascript
import { useState, useEffect } from 'react';

function StaffDashboard() {
  const [orders, setOrders] = useState({
    pending: [],
    accepted: [],
    preparing: [],
    ready: [],
    served: [],
    canceled: [],
    completed: []
  });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    loadOrders();
    // Refresh every 30 seconds
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/v1/orders', {
        credentials: 'include',  // ✅ Include JWT cookie
      });

      const data = await response.json();
      
      // Group by status
      const grouped = {
        pending: [],
        accepted: [],
        preparing: [],
        ready: [],
        served: [],
        canceled: [],
        completed: []
      };

      data.data.orders.forEach(order => {
        grouped[order.status]?.push(order);
      });

      setOrders(grouped);
      setSummary(data.summary);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateItemStatus = async (orderId, itemId, newStatus) => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/orders/${orderId}/items/${itemId}/status`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        }
      );

      if (response.ok) {
        // Refresh orders
        loadOrders();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  if (loading) return <div>Loading orders...</div>;

  return (
    <div className="dashboard">
      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="card">
          <h3>Total Revenue</h3>
          <p className="amount">{summary?.totalRevenue.toFixed(2)} Br</p>
        </div>
        <div className="card">
          <h3>Pending</h3>
          <p className="count">{summary?.byStatus.pending || 0}</p>
        </div>
        <div className="card">
          <h3>Ready</h3>
          <p className="count">{summary?.byStatus.ready || 0}</p>
        </div>
        <div className="card">
          <h3>Completed</h3>
          <p className="count">{summary?.byStatus.completed || 0}</p>
        </div>
      </div>

      {/* Order Kanban Board */}
      <div className="kanban-board">
        {['pending', 'accepted', 'preparing', 'ready', 'served', 'canceled'].map(status => (
          <div key={status} className="column">
            <h3>{status.toUpperCase()}</h3>
            <div className="orders">
              {orders[status].map(order => (
                <div
                  key={order.id}
                  className="order-card"
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="order-header">
                    <span className="order-number">{order.orderNumber}</span>
                    <span className="table">{order.table}</span>
                  </div>
                  <div className="order-body">
                    <p className="customer">{order.customerName}</p>
                    <p className="items">{order.items.length} items</p>
                    <p className="amount">{order.totalAmount} Br</p>
                  </div>
                  <div className="order-time">
                    {new Date(order.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="order-details">
          <h2>Order #{selectedOrder.orderNumber}</h2>
          <p>Table: {selectedOrder.table}</p>
          <p>Customer: {selectedOrder.customerName}</p>
          
          <div className="items">
            <h3>Items</h3>
            {selectedOrder.items.map(item => (
              <div key={item.id} className="item">
                <span>{item.menu.name}</span>
                <span>x{item.quantity}</span>
                <span>{item.status}</span>
                {item.status === 'pending' && (
                  <button
                    onClick={() =>
                      updateItemStatus(selectedOrder.id, item.id, 'preparing')
                    }
                  >
                    Mark Preparing
                  </button>
                )}
                {item.status === 'preparing' && (
                  <button
                    onClick={() =>
                      updateItemStatus(selectedOrder.id, item.id, 'ready')
                    }
                  >
                    Mark Ready
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              onClick={() =>
                fetch(
                  `http://localhost:8000/api/v1/orders/${selectedOrder.id}/items/serve-ready`,
                  { method: 'POST', credentials: 'include' }
                ).then(() => loadOrders())
              }
            >
              Serve Ready Items
            </button>
            <button
              onClick={() =>
                fetch(
                  `http://localhost:8000/api/v1/orders/${selectedOrder.id}/pay`,
                  {
                    method: 'POST',
                    credentials: 'include',
                    body: JSON.stringify({ paymentMethod: 'cash' })
                  }
                ).then(() => loadOrders())
              }
            >
              Mark as Paid
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffDashboard;
```

---

## 🔄 Real-Time Updates (WebSocket Optional)

Your backend has WebSocket support for real-time order updates. For now, polling every 30 seconds works fine:

```javascript
useEffect(() => {
  const interval = setInterval(loadOrders, 30000);
  return () => clearInterval(interval);
}, []);
```

---

## 📱 Mobile Dashboard (Responsive)

For mobile staff devices, show a simplified view:

```javascript
// Mobile view - Show only:
// 1. Pending orders (bright color)
// 2. Ready orders (highlight)
// 3. Quick action buttons
// 4. Minimal details

function MobileStaffDashboard() {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [readyOrders, setReadyOrders] = useState([]);

  // Load only critical statuses
  useEffect(() => {
    const loadCritical = async () => {
      const res = await fetch('http://localhost:8000/api/v1/orders?status=pending,ready', {
        credentials: 'include'
      });
      const data = await res.json();
      // Process...
    };

    loadCritical();
    const interval = setInterval(loadCritical, 15000); // More frequent updates
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mobile-dashboard">
      <div className="critical-section">
        <div className="ready-count badge-alert">{readyOrders.length} READY</div>
      </div>
      
      <div className="pending-list">
        {pendingOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onTap={() => showOrderDetails(order)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## ✅ Dashboard Features Checklist

- [ ] Login with JWT cookie
- [ ] Display all orders grouped by status
- [ ] Show summary statistics (revenue, counts)
- [ ] Click order to see details
- [ ] Update item status (pending → accepted → preparing → ready → served)
- [ ] Mark ready items as served
- [ ] Mark order as paid
- [ ] Cancel orders
- [ ] Search/filter orders
- [ ] Auto-refresh every 30 seconds
- [ ] Show table number
- [ ] Show customer name
- [ ] Show prep time remaining
- [ ] Real-time notifications (optional)

---

## 🎯 Quick Integration Checklist

1. ✅ Staff login endpoint: `/api/v1/auth/login`
2. ✅ Get active orders: `GET /api/v1/orders`
3. ✅ Get by status: `GET /api/v1/orders/pending`, etc.
4. ✅ Get order details: `GET /api/v1/orders/{id}`
5. ✅ Update item status: `PATCH /api/v1/orders/{orderId}/items/{itemId}/status`
6. ✅ Serve ready items: `POST /api/v1/orders/{orderId}/items/serve-ready`
7. ✅ Mark as paid: `POST /api/v1/orders/{orderId}/pay`
8. ✅ Auto-refresh: Poll every 30 seconds
9. ✅ All requests include: `credentials: 'include'` for JWT cookie

---

## 🚀 Example Flow

```
1. Staff logs in
   → POST /api/v1/auth/login
   → JWT stored in HTTP-only cookie ✓

2. Dashboard loads
   → GET /api/v1/orders
   → Shows pending, accepting, preparing, ready, served
   → Auto-refreshes every 30s ✓

3. New order arrives (T-02)
   → Shows in "pending" column
   → Notification (optional)

4. Staff accepts order
   → PATCH /api/v1/orders/{id}/items/{itemId}/status
   → status: "accepted"
   → Moves to "accepted" column ✓

5. Kitchen prepares
   → status: "preparing"
   → Moves to "preparing" column ✓

6. Ready for serving
   → status: "ready"
   → Moves to "ready" column
   → Bright highlight ✓

7. Waiter serves order
   → POST /api/v1/orders/{id}/items/serve-ready
   → Moves to "served" column ✓

8. Customer pays
   → POST /api/v1/orders/{id}/pay
   → status: "completed"
   → Order archived ✓
```

---

This gives you a complete staff dashboard! Start with the pending/ready columns and expand from there.
