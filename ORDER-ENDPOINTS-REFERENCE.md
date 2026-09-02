# Order Management API - Endpoints Reference

**Base URL:** `/api/v1/orders` ✅ (Fixed - was incorrectly `/api/v1/order`)

---

## 🎯 Customer Routes (QR Menu Ordering)

### 1. Place Order (Customer)
```
POST /api/v1/orders
```
**Description:** Customer places order via QR menu  
**Auth:** Table session token (protectTableSession)  
**Access:** Any customer with valid table session  
**Body:**
```json
{
  "tableId": "65abc...",
  "items": [
    {
      "menuItem": "65def...",
      "quantity": 2,
      "customization": "No onions",
      "addOns": ["65ghi..."]
    }
  ],
  "notes": "Extra spicy please"
}
```

---

## 👨‍💼 Staff Routes (Requires JWT Auth)

### 2. Place Order (Staff)
```
POST /api/v1/orders/staff
```
**Description:** Staff/waiter places order on behalf of customer  
**Access:** kitchen, waiter, admin, superAdmin  
**Body:**
```json
{
  "orderType": "dine_in" | "delivery" | "takeaway",
  "branchId": "65abc...",
  "tableId": "65def..." // required for dine_in
  "customerName": "John Doe",
  "customerPhone": "+251911223344",
  "items": [
    {
      "menuItem": "65ghi...",
      "quantity": 1
    }
  ],
  "notes": "Customer notes",
  "location": {
    "type": "Point",
    "coordinates": [38.7223, 9.0320] // [lng, lat] for delivery
  },
  "deliveryFee": 50,
  "deliveryNotes": "Gate code: 1234",
  "source": "waiter" | "admin"
}
```

---

## 📊 List Orders (Filtered Views)

### 3. Get Active Orders
```
GET /api/v1/orders/active
```
**Description:** Get all active orders (not completed/canceled)  
**Access:** kitchen, waiter, admin, superAdmin  
**Query Params:**
- `branchId` - Filter by branch
- `orderType` - Filter by type (dine_in, delivery, takeaway)
- `page` - Page number
- `limit` - Results per page

---

### 4. Get Review Queue
```
GET /api/v1/orders/review-queue
```
**Description:** Get pending orders requiring manual review (based on order flow config)  
**Access:** kitchen, waiter, admin, superAdmin  
**Query Params:**
- `branchId` - Filter by branch
- `source` - Filter by order source (customer, waiter, admin)

---

### 5. Get Completed Orders
```
GET /api/v1/orders/completed
```
**Description:** Get all completed orders  
**Access:** kitchen, waiter, admin, superAdmin

---

### 6. Get Pending Orders
```
GET /api/v1/orders/pending
```
**Description:** Get orders in pending status  
**Access:** kitchen, waiter, admin, superAdmin

---

### 7. Get Accepted Orders
```
GET /api/v1/orders/accepted
```
**Description:** Get orders in accepted status  
**Access:** kitchen, waiter, admin, superAdmin

---

### 8. Get Preparing Orders
```
GET /api/v1/orders/preparing
```
**Description:** Get orders in preparing status (in kitchen)  
**Access:** kitchen, waiter, admin, superAdmin

---

### 9. Get Ready Orders
```
GET /api/v1/orders/ready
```
**Description:** Get orders ready for pickup/delivery  
**Access:** kitchen, waiter, admin, superAdmin

---

### 10. Get Served Orders
```
GET /api/v1/orders/served
```
**Description:** Get orders that have been served  
**Access:** kitchen, waiter, admin, superAdmin

---

### 11. Get Canceled Orders
```
GET /api/v1/orders/canceled
```
**Description:** Get canceled orders  
**Access:** kitchen, waiter, admin, superAdmin

---

## 🔍 Get Single Order

### 12. Get Order by ID
```
GET /api/v1/orders/:id
```
**Description:** Get order details by ObjectId  
**Access:** kitchen, waiter, admin, superAdmin  
**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "65abc...",
      "orderNumber": "ORD-001-0001",
      "status": "preparing",
      "items": [...],
      "customer": {...},
      "table": {...},
      "totalAmount": 450,
      "paymentStatus": "unpaid"
    }
  }
}
```

---

### 13. Get Order by Number
```
GET /api/v1/orders/number/:orderNumber
```
**Description:** Get order details by order number  
**Access:** kitchen, waiter, admin, superAdmin  
**Example:** `GET /api/v1/orders/number/ORD-001-0042`

---

## 💰 Payment

### 14. Mark Order as Paid
```
POST /api/v1/orders/:id/pay
```
**Description:** Mark order as paid (with optional payment proof image)  
**Access:** kitchen, waiter, admin, superAdmin  
**Content-Type:** `multipart/form-data`  
**Body:**
```
paymentMethod: "cash" | "card" | "mobile_money"
amountPaid: 500
image: [file upload] // optional payment proof
```

---

## 🔄 Order Status Management

### 15. Update Order Status
```
PATCH /api/v1/orders/:id/status
```
**Description:** Transition order to new status (validates state machine)  
**Access:** kitchen, waiter, admin, superAdmin  
**Body:**
```json
{
  "status": "accepted" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "served" | "completed" | "canceled",
  "reason": "Optional reason for status change"
}
```

**Valid Transitions:**
- `pending` → `accepted` → `preparing` → `ready` → `served` → `completed`
- `pending` → `accepted` → `preparing` → `ready` → `out_for_delivery` → `delivered` → `completed`
- Any status → `canceled` (with reason)

---

### 16. Cancel Order
```
PATCH /api/v1/orders/:id/cancel
```
**Description:** Cancel an order  
**Access:** kitchen, waiter, admin, superAdmin  
**Body:**
```json
{
  "reason": "Customer requested cancellation"
}
```

---

## 📝 Modify Order

### 17. Add Items to Order
```
PATCH /api/v1/orders/:id/add-items
```
**Description:** Add more items to an existing order (only for pending/accepted/preparing status)  
**Access:** kitchen, waiter, admin, superAdmin  
**Body:**
```json
{
  "items": [
    {
      "menuItem": "65abc...",
      "quantity": 2,
      "customization": "Extra cheese"
    }
  ]
}
```

**Note:** Prices are always fetched from MenuItem DB (server-side), client-supplied prices are ignored.

---

## 🎯 Item-Level Status Management

### 18. Update Item Status
```
PATCH /api/v1/orders/:orderId/items/:itemId/status
```
**Description:** Update status of individual item within order  
**Access:** kitchen, admin, superAdmin  
**Body:**
```json
{
  "status": "pending" | "in_progress" | "ready" | "served" | "voided"
}
```

---

### 19. Bulk Serve Ready Items
```
POST /api/v1/orders/:orderId/items/serve-ready
```
**Description:** Bulk serve all items that are ready (waiter picks up multiple dishes)  
**Access:** waiter, admin, superAdmin  
**Body:**
```json
{
  "itemIds": ["65abc...", "65def..."] // optional - if omitted, serves all ready items
}
```

---

### 20. Void Item
```
PATCH /api/v1/orders/:orderId/items/:itemId/void
```
**Description:** Void an item with optional replacement  
**Access:** kitchen, waiter, admin, superAdmin  
**Body:**
```json
{
  "reason": "Wrong item prepared",
  "replacementItemId": "65xyz..." // optional
}
```

---

## 📊 Order History

### 21. Get Order History
```
GET /api/v1/orders/:id/history
```
**Description:** Get complete status change history for an order  
**Access:** kitchen, waiter, admin, superAdmin  
**Response:**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "status": "pending",
        "timestamp": "2026-08-22T10:00:00Z",
        "changedBy": {...},
        "reason": null
      },
      {
        "status": "accepted",
        "timestamp": "2026-08-22T10:02:00Z",
        "changedBy": {...},
        "reason": "Auto-accepted by system"
      }
    ]
  }
}
```

---

## 🚀 Common Workflows

### Workflow 1: QR Menu Customer Order
```bash
# 1. Customer scans QR, gets table session token
POST /api/v1/sessions/start
Body: { tableId: "65abc..." }

# 2. Customer places order
POST /api/v1/orders
Headers: { Authorization: "Bearer <table-session-token>" }
Body: { tableId: "65abc...", items: [...] }

# 3. Order auto-routes based on config (may require manual review)
# System automatically creates kitchen tickets
```

### Workflow 2: Waiter Places Order
```bash
# 1. Waiter places order
POST /api/v1/orders/staff
Headers: { Authorization: "Bearer <jwt-token>" }
Body: {
  orderType: "dine_in",
  tableId: "65abc...",
  items: [...],
  source: "waiter"
}

# 2. Order auto-routes (pending → accepted → preparing)
# Kitchen tickets created automatically

# 3. Kitchen marks items ready
PATCH /api/v1/orders/:orderId/items/:itemId/status
Body: { status: "ready" }

# 4. Waiter serves items
POST /api/v1/orders/:orderId/items/serve-ready

# 5. Customer pays
POST /api/v1/orders/:id/pay
Body: { paymentMethod: "cash", amountPaid: 500 }

# 6. Mark as completed
PATCH /api/v1/orders/:id/status
Body: { status: "completed" }
```

### Workflow 3: Delivery Order
```bash
# 1. Admin places delivery order
POST /api/v1/orders/staff
Body: {
  orderType: "delivery",
  customerName: "John Doe",
  customerPhone: "+251911223344",
  location: { type: "Point", coordinates: [38.7223, 9.0320] },
  deliveryFee: 50,
  items: [...]
}

# 2. Kitchen prepares → ready
PATCH /api/v1/orders/:id/status
Body: { status: "ready" }

# 3. Out for delivery
PATCH /api/v1/orders/:id/status
Body: { status: "out_for_delivery" }

# 4. Delivered
PATCH /api/v1/orders/:id/status
Body: { status: "delivered" }

# 5. Mark as completed
PATCH /api/v1/orders/:id/status
Body: { status: "completed" }
```

---

## 🔐 RBAC Tasks

All order endpoints require one of these RBAC tasks:

| Endpoint | Task Name |
|----------|-----------|
| `POST /staff` | `orders.placeStaff` |
| `GET /active` | `orders.listActive` |
| `GET /completed` | `orders.listCompleted` |
| `GET /pending` | `orders.listPending` |
| `GET /accepted` | `orders.listAccepted` |
| `GET /preparing` | `orders.listPreparing` |
| `GET /ready` | `orders.listReady` |
| `GET /served` | `orders.listServed` |
| `GET /canceled` | `orders.listCanceled` |
| `GET /number/:orderNumber` | `orders.getByNumber` |
| `GET /review-queue` | `orders.getReviewQueue` |
| `POST /:id/pay` | `orders.markPaid` |
| `PATCH /:id/status` | `orders.updateStatus` |
| `PATCH /:id/add-items` | `orders.addItems` |
| `PATCH /:id/cancel` | `orders.cancel` |
| `GET /:id` | `orders.read` |
| `GET /:id/history` | `orders.history` |
| `PATCH /:orderId/items/:itemId/status` | `orders.items.updateStatus` |
| `POST /:orderId/items/serve-ready` | `orders.items.serveReady` |
| `PATCH /:orderId/items/:itemId/void` | `orders.items.void` |

---

## ⚠️ Common Errors

### 404 - Endpoint Not Found
```json
{
  "success": false,
  "message": "Cannot find /api/v1/order on this server"
}
```
**Solution:** Use `/api/v1/orders` (plural) not `/api/v1/order`

### 403 - Forbidden
**Cause:** User doesn't have required RBAC task  
**Solution:** Assign appropriate role/task

### 400 - Validation Error
**Cause:** Invalid request body or params  
**Solution:** Check request schema

### 409 - Invalid State Transition
```json
{
  "success": false,
  "message": "Cannot transition from 'completed' to 'preparing'"
}
```
**Solution:** Follow valid state machine transitions

---

## 📚 Related Documentation

- **Routes:** `src/modules/order/orders.routes.js`
- **Controller:** `src/modules/order/controller/order.controller.js`
- **Service:** `src/modules/order/service/OrderService.js`
- **Model:** `models/orderModel.js`
- **State Machine:** `src/modules/order/service/OrderStateMachineService.js`
- **RBAC Tasks:** `scripts/seed-roles-and-tasks.js`

---

**Last Updated:** 2026-08-22  
**Total Endpoints:** 21  
**Base Path:** `/api/v1/orders` ✅
