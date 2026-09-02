# Order & KDS Frontend Integration Guide

> **Accuracy note:** Every endpoint, field, enum value, and response shape in this document
> was verified against the actual source files after Pass 1 and Pass 2 fixes. Nothing is
> reconstructed from memory.

---

## 1. Overview

### 1.1 Base URL patterns

```
Order module:   /api/v1/orders
Kitchen module: /api/v1/kitchen
```

The exact mount path is configured in `src/app/create-app.js`. If the app is running on
`http://localhost:8000`, full paths look like `http://localhost:8000/api/v1/orders`.

### 1.2 Authentication model

| Route type | Guard | Token source | Token type |
|---|---|---|---|
| Customer (QR scan) | `protectTableSession` | `Authorization: Bearer <token>` only | Session token (not JWT) — obtained when the customer scans the table QR code |
| Staff (all other routes) | `protect` | `Authorization: Bearer <token>` or `Cookie: jwt=<token>` | JWT — obtained from the login endpoint |

**Staff JWT header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Customer session header:**
```
Authorization: Bearer sess_abc123xyz
```

The customer session token is a raw database token (stored in `CustomerSession` collection),
not a signed JWT. It expires after 4 hours by default (`SESSION_DURATION_HOURS` env),
with a sliding window — each authenticated request resets the 4-hour clock.

All staff routes after `POST /` also require the merchant's `orders` feature to be enabled
(`requireFeature('orders')` middleware). If the feature is disabled, the server returns
`403 Forbidden`.

### 1.3 Response envelope

All successful responses use one of two shapes depending on which handler wrote the
response. **Both exist in the codebase** — do not assume uniformity.

**Shape A — `res.sendSuccess` (used by placement, addItemToOrder, updateOrderStatus, getActiveOrders):**
```json
{
  "success": true,
  "message": "Human-readable message",
  "data": { ... },
  "meta": { ... }
}
```
`meta` is omitted when empty.

**Shape B — raw `res.status().json()` (used by most other handlers and all kitchen handlers):**
```json
{
  "status": "success",
  "data": { ... }
}
```
Some also include top-level `results`, `total`, `page`, `pages`, `summary` fields.

**Error responses (all handlers — via global error handler):**
```json
{
  "success": false,
  "message": "Error description",
  "errors": []
}
```
`errors` array is omitted when empty. In development mode the error response also includes
`stack` and `fullError` inside the `errors` array.

**Common HTTP error codes:**

| Code | Meaning |
|---|---|
| `400` | Validation error, business rule violation, bad input |
| `401` | Missing or invalid token |
| `403` | Valid token but insufficient role/permissions |
| `404` | Resource not found or not scoped to this merchant |
| `500` | Unexpected server error |

---

## 2. Order Status & State Machine

### 2.1 Valid order statuses (current model enum)

```
pending → accepted → preparing → ready → served      → completed
                                        ↘ out_for_delivery → delivered → completed
                                              ↓
                                          canceled  (from any non-terminal status)
```

| Status | Description |
|---|---|
| `pending` | Order placed, awaiting staff acceptance |
| `accepted` | Staff accepted the order |
| `preparing` | Kitchen is actively preparing |
| `ready` | All kitchen tickets marked ready; food is ready |
| `out_for_delivery` | Delivery-only: food dispatched to customer |
| `delivered` | Delivery-only: food delivered to customer |
| `served` | Dine-in/takeaway: food served to customer |
| `completed` | Order fully complete and closed |
| `canceled` | Order canceled at any stage before completion |

### 2.2 Allowed transitions

| From | To | Who can trigger | How |
|---|---|---|---|
| `pending` | `accepted` | waiter, admin, superAdmin | PATCH /:id/status |
| `pending` | `canceled` | waiter, admin, superAdmin, **customer** | PATCH /:id/status or PATCH /:id/cancel |
| `accepted` | `preparing` | kitchen, admin, superAdmin | PATCH /:id/status |
| `accepted` | `canceled` | waiter, admin, superAdmin | PATCH /:id/status or PATCH /:id/cancel |
| `preparing` | `ready` | kitchen, admin, superAdmin, **system** | PATCH /:id/status or **automatic** (KDS rollup) |
| `preparing` | `canceled` | kitchen, waiter, admin, superAdmin | PATCH /:id/status or PATCH /:id/cancel |
| `ready` | `served` | waiter, admin, superAdmin | PATCH /:id/status |
| `ready` | `out_for_delivery` | waiter, admin, superAdmin | PATCH /:id/status |
| `ready` | `canceled` | waiter, admin, superAdmin | PATCH /:id/status or PATCH /:id/cancel |
| `out_for_delivery` | `delivered` | waiter, admin, superAdmin | PATCH /:id/status |
| `out_for_delivery` | `canceled` | waiter, admin, superAdmin | PATCH /:id/status or PATCH /:id/cancel |
| `delivered` | `completed` | waiter, admin, superAdmin | PATCH /:id/status |
| `served` | `completed` | waiter, admin, superAdmin | PATCH /:id/status |

**Automatic transitions (no API call needed):**

- `preparing → ready` — triggered automatically by the outbox worker when ALL kitchen
  tickets for the order are marked `ready`. The system actor (`actorType: 'system'`)
  calls `transitionOrderStatus` internally. The frontend receives a `ticket:updated`
  socket event per ticket, then an order status update.

**Customer cancellation restriction:**
- Customers (table session) can only cancel `pending` orders via `PATCH /:id/cancel`.
- Staff can cancel up through `out_for_delivery` — the state machine enforces per-status
  role permissions.

---

## 3. Order Endpoints

### 3.1 `POST /api/v1/orders` — Customer place order

**Auth:** `protectTableSession` (table session Bearer token)

**Description:** Customer places a dine-in order from the QR menu. The customer's table,
branch, and merchant are all taken from the session — the client sends only items.
Supports idempotency via the `Idempotency-Key` header (optional but recommended to prevent
double-submission on network retry).

**Side effects:** Creates order, deducts inventory, notifies kitchen via Socket.IO.

**Request headers:**
```
Authorization: Bearer <session-token>
Idempotency-Key: <uuid>   (optional, recommended)
```

**Request body:**
```json
{
  "items": [
    {
      "menuItemId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "quantity": 2,
      "notes": "No onions"
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | `OrderItemInput[]` | ✅ | Min 1 item |
| `items[].menuItemId` | `string` (ObjectId) | ✅ | Menu item ID |
| `items[].quantity` | `integer` ≥ 1 | ✅ | Quantity |
| `items[].notes` | `string` | ❌ | Special instructions |

**Success response — `201`:**
```json
{
  "success": true,
  "message": "Order #T5-12-345 sent to kitchen!",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
    "orderNumber": "#T5-12-345",
    "status": "pending",
    "totalAmount": 250,
    "placedAt": "2026-08-22T09:15:00.000Z"
  }
}
```

If `Idempotency-Key` matches a previous successful request, the response header
`Idempotent-Replayed: true` is set and the original order is returned.

**Error responses:**
| Code | Example message |
|---|---|
| `400` | "Order must contain at least one item" |
| `400` | "Menu item not found or unavailable" |
| `400` | "Insufficient inventory for this order" |
| `401` | "Session expired or invalid. Please scan the QR code again." |
| `403` | "orders feature is not enabled" |

---

### 3.2 `POST /api/v1/orders/staff` — Staff place order

**Auth:** `protect` (staff JWT)

**Description:** Staff manually places an order on behalf of a customer. Supports dine-in,
takeaway, and delivery. Prices are always resolved server-side from the MenuItem database —
any `unitPrice` in the request is accepted by the validator but **ignored** for financial
computation.

**Side effects:** Creates order, deducts inventory, updates table status to `occupied`
(dine-in), notifies via Socket.IO.

**Request body:**
```json
{
  "branchId": "64f1a2b3c4d5e6f7a8b9c0d3",
  "orderType": "dine_in",
  "tableId": "64f1a2b3c4d5e6f7a8b9c0d4",
  "customerName": "Abebe Bekele",
  "customerPhone": "+251911234567",
  "items": [
    {
      "menuItemId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "quantity": 1,
      "notes": "Extra spicy"
    }
  ],
  "subtotal": 150,
  "notes": "Window seat"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `branchId` | `string` (ObjectId) | ✅ | Branch the order belongs to |
| `orderType` | `"dine_in" \| "takeaway" \| "delivery"` | ✅ | Order type |
| `tableId` | `string` (ObjectId) | ✅ if `dine_in` | Table ID |
| `customerName` | `string` max 100 | ✅ | Customer name |
| `customerPhone` | `string` | ✅ if `delivery`, ❌ otherwise | Phone number |
| `items` | `OrderItemInput[]` | ✅ | Min 1 item |
| `items[].menuItemId` | `string` (ObjectId) | ✅ | Menu item ID |
| `items[].quantity` | `integer` ≥ 1 | ✅ | Quantity |
| `items[].notes` | `string` | ❌ | Special instructions |
| `subtotal` | `number` > 0 | ✅ | Accepted by validator but ignored — server recomputes |
| `notes` | `string` | ❌ | Order-level notes |
| `location` | `LocationInput` | ✅ if `delivery` | Delivery location |
| `location.coordinates` | `[number, number]` | ✅ if `delivery` | `[longitude, latitude]` |
| `location.city` | `string` | ✅ if `delivery` | City name |
| `location.wereda` | `string` | ❌ | Sub-district |
| `location.subCity` | `string` | ❌ | Sub-city |
| `location.specificArea` | `string` | ❌ | Specific area |
| `location.building` | `string` | ❌ | Building name/number |
| `location.formattedAddress` | `string` | ❌ | Full formatted address |
| `deliveryFee` | `number` ≥ 0 | ❌ | Delivery fee |
| `deliveryNotes` | `string` max 500 | ❌ | Delivery instructions |

**Success response — `201`:**
```json
{
  "success": true,
  "message": "Order #T5-12-346 placed successfully!",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d5",
    "orderNumber": "#T5-12-346",
    "orderType": "dine_in",
    "status": "pending",
    "totalAmount": 150,
    "tableNumber": "T5",
    "customerName": "Abebe Bekele",
    "placedAt": "2026-08-22T09:20:00.000Z",
    "items": [ ... ]
  }
}
```

**Error responses:**
| Code | Example message |
|---|---|
| `400` | "tableId is required for dine-in orders" |
| `400` | "location.coordinates and location.city are required for delivery orders" |
| `400` | "Menu item not found or unavailable" |
| `400` | "Insufficient inventory for this order" |
| `404` | "Table not found" |

---

### 3.3 `GET /api/v1/orders/active` — Get active orders

**Auth:** `protect` (staff JWT)

**Description:** Returns orders in `pending`, `accepted`, `preparing`, or `ready` status
for the authenticated staff member's merchant. Filterable by branch and/or status.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `status` | `string` (any valid status) | Filter to one specific status |
| `branchId` | `string` (ObjectId) | Filter by branch |
| `page` | `string` (number) | Pagination page |
| `limit` | `string` (number) | Page size |
| `startDate` | `string` (ISO datetime) | Filter from date |
| `endDate` | `string` (ISO datetime) | Filter to date |

**Success response — `200`:**
```json
{
  "success": true,
  "message": "orders retrieved successfully",
  "data": {
    "orders": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d5",
        "orderNumber": "#T5-12-346",
        "status": "pending",
        "tableNumber": "T5",
        "totalAmount": 150,
        "placedAt": "2026-08-22T09:20:00.000Z",
        "items": [ ... ],
        "branch": { "_id": "...", "name": "Main Branch" },
        "table": { "_id": "...", "tableNumber": "T5" }
      }
    ],
    "count": 1
  }
}
```

---

### 3.4 Status-specific list endpoints

All five endpoints share the same shape. Auth: `protect`.

| Endpoint | Default statuses returned |
|---|---|
| `GET /api/v1/orders/pending` | `pending` |
| `GET /api/v1/orders/accepted` | `accepted` |
| `GET /api/v1/orders/preparing` | `preparing` |
| `GET /api/v1/orders/ready` | `ready` |
| `GET /api/v1/orders/served` | `served` |
| `GET /api/v1/orders/canceled` | `canceled` |

**Query params:** `branchId` (optional string).

**Success response — `200`:**
```json
{
  "status": "success",
  "count": 3,
  "data": {
    "orders": [ ... ]
  }
}
```

`GET /api/v1/orders/completed` has a richer response including pagination and revenue summary:
```json
{
  "status": "success",
  "total": 42,
  "page": 1,
  "pages": 3,
  "data": {
    "orders": [ ... ]
  }
}
```

**Query params for `/completed`:** `branchId`, `dateFrom`, `dateTo`, `search`, `page`, `limit`, `sort`.

---

### 3.5 `GET /api/v1/orders/:id` — Get order by ID

**Auth:** `protect` (staff JWT)

**Description:** Fetch a single order document with populated relations.

**Success response — `200`:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d5",
      "orderNumber": "#T5-12-346",
      "orderType": "dine_in",
      "status": "accepted",
      "paymentStatus": "unpaid",
      "customerName": "Abebe Bekele",
      "tableNumber": "T5",
      "subtotal": 150,
      "totalAmount": 150,
      "items": [
        {
          "_id": "...",
          "menuItem": { "_id": "...", "name": { "en": "Burger" }, "price": 150 },
          "name": "Burger",
          "quantity": 1,
          "unitPrice": 150,
          "totalPrice": 150,
          "notes": "Extra spicy"
        }
      ],
      "branch": { "_id": "...", "name": "Main Branch" },
      "table": { "_id": "...", "tableNumber": "T5" },
      "assignedWaiter": { "_id": "...", "fullName": "Tigist Haile" },
      "placedAt": "2026-08-22T09:20:00.000Z"
    }
  }
}
```

**Error responses:**
| Code | Message |
|---|---|
| `400` | "Order ID is required" |
| `404` | "Order not found" |

---

### 3.6 `GET /api/v1/orders/number/:orderNumber` — Get order by order number

**Auth:** `protect` (staff JWT) or table session (`protectTableSession`)

**Description:** Look up an order by its human-readable number (e.g. `#T5-12-346`). The
leading `#` is optional in the path. Staff see full order details; customers only see their
own orders.

**Path param:** `:orderNumber` — the order number string. The `#` prefix is stripped and
normalized server-side.

**Success response — `200`:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "...",
      "orderNumber": "#T5-12-346",
      "status": "accepted",
      "paymentStatus": "unpaid",
      "orderType": "dine_in",
      "tableNumber": "T5",
      "customerName": "Abebe Bekele",
      "totalAmount": 150,
      "placedAt": "2026-08-22T09:20:00.000Z",
      "acceptedAt": "2026-08-22T09:21:00.000Z",
      "items": [
        {
          "name": "Burger",
          "quantity": 1,
          "unitPrice": 150,
          "totalPrice": 150,
          "notes": null,
          "image": null
        }
      ],
      "timeline": {
        "placed": "2026-08-22T09:20:00.000Z",
        "accepted": "2026-08-22T09:21:00.000Z",
        "ready": null,
        "served": null,
        "completed": null
      },
      "assigned": {
        "waiter": "Tigist Haile",
        "kitchen": null
      }
    }
  }
}
```

> **Note:** `items[].name` is a plain English string snapshot taken at order time for orders
> placed after the Pass 2 fix. Older orders will have `name: null`.

---

### 3.7 `PATCH /api/v1/orders/:id/status` — Update order status

**Auth:** `protect` (staff JWT)

**Description:** Transition an order to a new status. The state machine validates the
transition and enforces role-based permissions. Also accepts optional `assignedWaiter` and
`assignedKitchenStaff` fields to set staff assignments on the same call.

**Request body:**
```json
{
  "status": "accepted",
  "reason": "Customer confirmed",
  "assignedWaiter": "64f1a2b3c4d5e6f7a8b9c0d9",
  "assignedKitchenStaff": "64f1a2b3c4d5e6f7a8b9c0da"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `OrderStatus` | ✅ | Target status (see enum) |
| `reason` | `string` | ❌ | Cancellation or transition reason |
| `assignedWaiter` | `string` (ObjectId) | ❌ | Assign a waiter to this order |
| `assignedKitchenStaff` | `string` (ObjectId) | ❌ | Assign kitchen staff |

**Success response — `200`:**
```json
{
  "success": true,
  "message": "Order updated to accepted",
  "data": {
    "_id": "...",
    "status": "accepted",
    "acceptedAt": "2026-08-22T09:21:00.000Z",
    "statusHistory": [ ... ]
  }
}
```

If the order is already in the requested status:
```json
{
  "success": true,
  "message": "Order already in status accepted",
  "data": { ... }
}
```

**Error responses:**
| Code | Message |
|---|---|
| `400` | "Cannot transition from ready to accepted" |
| `403` | "Your role cannot transition orders from pending to preparing" |
| `404` | "Order not found" |

---

### 3.8 `PATCH /api/v1/orders/:id/add-items` — Add items to an active order

**Auth:** `protect` (staff JWT)

**Description:** Append additional items to an existing order that is still in `pending`,
`accepted`, or `preparing` status. Prices are always resolved from the DB. After adding
items, if the order was not `pending`, it is reset to `accepted`.

**Side effects:** Re-validates inventory for the new items, updates order totals, emits
`order:updated` via notification service.

**Request body:**
```json
{
  "items": [
    {
      "menuItemId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "quantity": 1,
      "notes": "No salt"
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | `OrderItemInput[]` | ✅ | Min 1 item |
| `items[].menuItemId` | `string` (ObjectId) | ✅ | Menu item ID |
| `items[].quantity` | `integer` ≥ 1 | ✅ | Quantity |
| `items[].notes` | `string` | ❌ | Special instructions |

**Success response — `200`:**
```json
{
  "success": true,
  "message": "Items added to order #T5-12-346",
  "data": {
    "_id": "...",
    "orderNumber": "#T5-12-346",
    "status": "accepted",
    "items": [ ... ],
    "subtotal": 300,
    "totalAmount": 300
  }
}
```

**Error responses:**
| Code | Message |
|---|---|
| `404` | "Active order not found or cannot be modified" |
| `400` | "Menu item not found or unavailable" |

---

### 3.9 `PATCH /api/v1/orders/:id/cancel` — Cancel an order

**Auth:** `protect` (staff JWT) — or `protectTableSession` for customer-initiated cancel
(customers can only cancel `pending` orders)

**Description:** Cancel an order. The state machine enforces which statuses can be canceled
and by which roles. Staff can cancel up through `out_for_delivery`; customers are restricted
to `pending` only.

**Request body (optional):**
```json
{
  "reason": "Customer changed mind"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `reason` | `string` | ❌ | Cancellation reason, default: "Customer/Staff Cancellation" |

**Success response — `200`:**
```json
{
  "status": "success",
  "message": "Order #T5-12-346 successfully canceled",
  "data": {
    "order": {
      "_id": "...",
      "status": "canceled",
      "canceledAt": "2026-08-22T10:00:00.000Z",
      "canceledReason": "Customer changed mind"
    }
  }
}
```

If already canceled:
```json
{
  "status": "success",
  "message": "Order #T5-12-346 already canceled",
  "data": { "order": { ... } }
}
```

**Error responses:**
| Code | Message |
|---|---|
| `400` | "Customers can only cancel orders while they are still pending" |
| `400` | "Order is already completed and cannot be canceled" |
| `403` | "Your role cannot transition orders from preparing to canceled" |
| `404` | "Order not found" |

---

### 3.10 `POST /api/v1/orders/:id/pay` — Mark order as paid

**Auth:** `protect` (staff JWT)

**Description:** Mark an order as paid and close it. Optionally accepts a payment receipt
image as `multipart/form-data`. Promotes the order to `completed` if not already there.
Awards loyalty points if a customer session is linked to the order. Releases the table.

**Content-Type:** `multipart/form-data` (even without an image — the multer middleware
processes the request)

**Request fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `paymentMethod` | `"cash" \| "mobile_banking" \| "card"` | ❌ | Default: `"cash"` |
| `bankName` | `string` | ❌ | Bank name for mobile/card payments |
| `image` | `file` | ❌ | Receipt photo (field name: `image`) |

**Side effects:**
- Sets `paymentStatus = 'paid'`, `paymentDetails`, `paidAt`
- Promotes to `completed` if not already completed
- Awards loyalty points to linked customer (atomic `$inc`)
- Closes customer session, releases table to `available`
- Sends payment notification

**Success response — `200`:**
```json
{
  "status": "success",
  "message": "Order #T5-12-346 marked as paid",
  "data": {
    "order": {
      "_id": "...",
      "orderNumber": "#T5-12-346",
      "status": "completed",
      "paymentStatus": "paid",
      "paymentDetails": {
        "method": "cash",
        "bankName": null,
        "paidAt": "2026-08-22T10:30:00.000Z",
        "receiptImage": null
      }
    }
  }
}
```

**Error responses:**
| Code | Message |
|---|---|
| `400` | "Order already paid" |
| `400` | "Cannot mark a canceled order as paid" |
| `404` | "Order not found" |

---

### 3.11 Customer endpoints (table session auth)

These three endpoints require a **table session token**, not a staff JWT.

#### `GET /api/v1/orders/my-active` — Customer's active order

Returns the customer's currently active order at their table (status in
`pending/accepted/preparing/ready/served`). Returns `null` if none exists.

```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "...",
      "orderNumber": "#T5-12-346",
      "status": "preparing",
      "totalAmount": 150,
      "items": [
        {
          "menuItem": { "_id": "...", "name": { "en": "Burger" }, "image": "..." },
          "quantity": 1
        }
      ]
    }
  }
}
```

#### `GET /api/v1/orders/my-history` — Customer's order history

Returns last 50 `completed` or `canceled` orders for the customer. Fields returned:
`orderNumber`, `items`, `totalAmount`, `status`, `placedAt`.

```json
{
  "status": "success",
  "results": 5,
  "data": {
    "orders": [ ... ]
  }
}
```

---

## 4. Kitchen / KDS Endpoints

All kitchen endpoints require a **staff JWT** (`Authorization: Bearer <jwt>`).
Branch and merchant context are extracted from `req.user.branch` and `req.user.merchant`.

### 4.1 Station management

#### `GET /api/v1/kitchen/stations` — List all stations

**Roles:** kitchen, waiter, admin, superAdmin

**Query params:** `includeInactive=true` (optional, default: false)

```json
{
  "status": "success",
  "results": 3,
  "data": {
    "stations": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0db",
        "name": "Grill Station",
        "code": "GRILL",
        "description": "For all grilled items",
        "isActive": true,
        "displayOrder": 1
      }
    ]
  }
}
```

---

#### `POST /api/v1/kitchen/stations` — Create a station

**Roles:** admin, superAdmin

**Request body:**
```json
{
  "name": "Salad Bar",
  "code": "SALAD",
  "description": "Cold items and salads",
  "displayOrder": 2
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` max 100 | ✅ | Station display name |
| `code` | `string` max 20, uppercase | ✅ | Short code, unique per branch (e.g. `GRILL`) |
| `description` | `string` max 500 | ❌ | Description |
| `displayOrder` | `number` | ❌ | Sort order on KDS screen, default 0 |

**Success response — `201`:**
```json
{
  "status": "success",
  "data": {
    "station": { "_id": "...", "name": "Salad Bar", "code": "SALAD", ... }
  }
}
```

**Error responses:**
| Code | Message |
|---|---|
| `400` | "Name and code are required" |
| `400` | `code` "SALAD" already exists. (duplicate key) |

---

#### `GET /api/v1/kitchen/stations/:id` — Get one station

**Roles:** kitchen, waiter, admin, superAdmin. `:id` can be an ObjectId or a station code string (e.g. `GRILL`).

---

#### `PATCH /api/v1/kitchen/stations/:id` — Update a station

**Roles:** admin, superAdmin

**Request body (all optional):**
```json
{
  "name": "Updated Grill",
  "code": "GRILL2",
  "description": "...",
  "displayOrder": 3,
  "isActive": false
}
```

---

#### `DELETE /api/v1/kitchen/stations/:id` — Deactivate a station

**Roles:** admin, superAdmin. Sets `isActive: false` (soft delete).

```json
{
  "status": "success",
  "data": { "message": "Station deactivated" }
}
```

---

### 4.2 Menu item station assignment

#### `PATCH /api/v1/kitchen/menu-items/:menuItemId/station`

**Roles:** kitchen, admin, superAdmin

**Description:** Assign a menu item to a kitchen station. Send `stationId: null` to remove
the assignment. Items with no station are excluded from KDS ticket creation.

**Request body:**
```json
{ "stationId": "64f1a2b3c4d5e6f7a8b9c0db" }
```
or to remove:
```json
{ "stationId": null }
```

```json
{
  "status": "success",
  "data": {
    "menuItem": { "_id": "...", "kitchenStation": "64f1a2b3c4d5e6f7a8b9c0db" }
  }
}
```

---

### 4.3 Ticket listing

#### `GET /api/v1/kitchen/tickets` — All tickets (cross-station)

**Roles:** kitchen, waiter, admin, superAdmin

**Query params:**

| Param | Description |
|---|---|
| `stationId` | Filter by station ObjectId |
| `status` | Filter by single status |

Default returns `pending`, `accepted`, `in_progress`, `ready` tickets.

```json
{
  "status": "success",
  "results": 4,
  "data": {
    "tickets": [ ... ]
  }
}
```

---

#### `GET /api/v1/kitchen/stations/:stationId/tickets` — Station KDS view

**Roles:** kitchen, admin, superAdmin. `:stationId` can be ObjectId or station code.

Returns active tickets (`pending`, `accepted`, `in_progress`, `ready`) for a specific station.

```json
{
  "status": "success",
  "results": 2,
  "data": {
    "tickets": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0dc",
        "ticketNumber": "GRILL-7",
        "orderNumber": "#T5-12-346",
        "orderType": "dine_in",
        "tableNumber": "T5",
        "status": "pending",
        "priority": "normal",
        "items": [
          {
            "orderItemId": "...",
            "menuItem": "64f1a2b3c4d5e6f7a8b9c0d1",
            "menuItemName": "Burger",
            "quantity": 1,
            "notes": "Extra spicy",
            "status": "pending"
          }
        ],
        "station": { "_id": "...", "name": "Grill Station", "code": "GRILL", "color": null },
        "order": { "_id": "...", "orderNumber": "#T5-12-346", "orderType": "dine_in", "tableNumber": "T5" },
        "assignedTo": null,
        "createdAt": "2026-08-22T09:22:00.000Z"
      }
    ]
  }
}
```

---

#### `GET /api/v1/kitchen/orders/:orderId/tickets` — Tickets for one order

**Roles:** kitchen, waiter, admin, superAdmin

Returns all tickets (all statuses) created for a specific order.

---

### 4.4 Ticket status transitions

KDS tickets follow this state machine:

```
pending → accepted → in_progress → ready → (stays here in Phase 1)
    ↓         ↓           ↓          ↓
 canceled  canceled    canceled   canceled
```

There are **two ways** to transition a ticket — a generic endpoint and convenience shortcuts:

#### `PATCH /api/v1/kitchen/tickets/:ticketId/status` — Generic transition

**Roles:** kitchen, admin, superAdmin (+ waiter for `ready→canceled`)

**Request body:**
```json
{
  "status": "accepted",
  "reason": "Optional reason (for cancellations)"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `"accepted" \| "in_progress" \| "ready" \| "canceled"` | ✅ | Target status |
| `reason` | `string` | ❌ | Required convention for `canceled` |

**Success response — `200`:**
```json
{
  "status": "success",
  "data": {
    "ticket": {
      "_id": "...",
      "status": "accepted",
      "acceptedAt": "2026-08-22T09:23:00.000Z",
      "assignedTo": "64f1a2b3c4d5e6f7a8b9c0dd"
    },
    "previousStatus": "pending",
    "noop": false
  }
}
```

---

#### Convenience shortcut endpoints (no request body needed)

| Endpoint | Transition | Roles |
|---|---|---|
| `PATCH /api/v1/kitchen/tickets/:ticketId/accept` | `pending → accepted` | kitchen, admin, superAdmin |
| `PATCH /api/v1/kitchen/tickets/:ticketId/start` | `accepted → in_progress` | kitchen, admin, superAdmin |
| `PATCH /api/v1/kitchen/tickets/:ticketId/ready` | `in_progress → ready` | kitchen, admin, superAdmin |
| `PATCH /api/v1/kitchen/tickets/:ticketId/cancel` | any → canceled | kitchen (+waiter for ready→canceled) |

The `/cancel` shortcut accepts an optional body `{ "reason": "string" }`.

All shortcut responses:
```json
{
  "status": "success",
  "data": {
    "ticket": { ... },
    "message": "Ticket accepted successfully"
  }
}
```

**Error responses for all ticket transitions:**
| Code | Message |
|---|---|
| `400` | "Invalid transition: pending → ready" |
| `403` | "Insufficient permissions. Role 'waiter' cannot perform pending->accepted" |
| `404` | "Kitchen ticket not found" |

**Side effect of marking a ticket `ready`:** When the last non-canceled ticket for an order
reaches `ready`, the server automatically queues an outbox event that transitions the parent
**order** to `ready` status as a system actor. The frontend will receive a `ticket:updated`
socket event followed by an order status update.

---

## 5. TypeScript Types

```typescript
// ─── Enums ───────────────────────────────────────────────────────────────────

type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'served'
  | 'completed'
  | 'canceled';

type OrderType = 'dine_in' | 'takeaway' | 'delivery';

type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

type PaymentMethod = 'cash' | 'mobile_banking' | 'card' | 'unspecified';

type OrderSource = 'web' | 'telegram' | 'admin' | 'waiter';

type TicketStatus = 'pending' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'canceled';

type TicketItemStatus = 'pending' | 'in_progress' | 'ready';

type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

// ─── Order Item (stored snapshot) ────────────────────────────────────────────

interface OrderItem {
  _id: string;
  menuItem: string | MenuItemRef;          // ObjectId or populated ref
  name: string | null;                     // English snapshot; null for pre-fix orders
  quantity: number;
  unitPrice: number;
  unitCost: number | null;                 // COGS; null if no recipe/inventory tracking
  totalPrice: number;
  notes?: string;
}

interface MenuItemRef {
  _id: string;
  name: string | LocalizedText;
  image?: string;
  price?: number;
}

interface LocalizedText {
  en: string;
  am?: string;
}

// ─── Order ───────────────────────────────────────────────────────────────────

interface Order {
  _id: string;
  orderNumber: string;                     // e.g. "#T5-12-346"
  orderType: OrderType;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  merchant: string;
  branch: string | { _id: string; name: string };
  customer?: string;
  customerName: string;
  customerPhone?: string;
  table?: string | { _id: string; tableNumber: string };
  tableNumber?: string;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  deliveryFee: number;
  deliveryNotes?: string;
  delivery?: DeliveryDetails;
  location?: OrderLocation;
  paymentDetails?: PaymentDetails;
  statusHistory: StatusHistoryEntry[];
  placedAt: string;                        // ISO datetime
  placedBy?: string;
  acceptedAt?: string;
  readyAt?: string;
  servedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  canceledBy?: string;
  canceledReason?: string;
  assignedWaiter?: string | { _id: string; fullName: string };
  assignedKitchenStaff?: string | { _id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
}

interface DeliveryDetails {
  location?: { lat: number; lng: number };
  addressNote?: string;
  phone?: string;
  fee: number;
  handledBy?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
}

interface OrderLocation {
  type: 'Point';
  coordinates?: [number, number];          // [longitude, latitude]
  city?: string;
  wereda?: string;
  subCity?: string;
  specificArea?: string;
  building?: string;
  formattedAddress?: string;
}

interface PaymentDetails {
  method: PaymentMethod;
  bankName?: string;
  receiptImage?: string;
  transactionId?: string;
  paidAt?: string;
}

interface StatusHistoryEntry {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedBy?: string;
  changedAt: string;
  reason?: string;
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

interface OrderItemInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

interface PlaceOrderCustomerRequest {
  items: OrderItemInput[];
}

interface LocationInput {
  coordinates?: [number, number];
  city?: string;
  wereda?: string;
  subCity?: string;
  specificArea?: string;
  building?: string;
  formattedAddress?: string;
}

interface PlaceOrderStaffRequest {
  branchId: string;
  orderType: OrderType;
  tableId?: string;                        // required if dine_in
  customerName: string;
  customerPhone?: string;                  // required if delivery
  items: OrderItemInput[];
  subtotal: number;                        // accepted by validator, ignored server-side
  notes?: string;
  location?: LocationInput;               // required if delivery
  deliveryFee?: number;
  deliveryNotes?: string;
}

interface UpdateOrderStatusRequest {
  status: OrderStatus;
  reason?: string;
  assignedWaiter?: string;
  assignedKitchenStaff?: string;
}

interface AddItemsToOrderRequest {
  items: OrderItemInput[];
}

interface CancelOrderRequest {
  reason?: string;
}

interface MarkAsPaidRequest {
  paymentMethod?: 'cash' | 'mobile_banking' | 'card';
  bankName?: string;
  // image: File  (multipart/form-data field named 'image')
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

interface SuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

interface ErrorResponse {
  success: false;
  message: string;
  errors?: Array<{ message?: string; details?: unknown }>;
}

interface OrderByNumberResponse {
  _id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  orderType: OrderType;
  tableNumber?: string;
  customerName: string;
  totalAmount: number;
  placedAt: string;
  acceptedAt?: string;
  readyAt?: string;
  servedAt?: string;
  completedAt?: string;
  items: Array<{
    name: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    notes?: string;
    image?: string;
  }>;
  timeline: {
    placed: string;
    accepted?: string;
    ready?: string;
    served?: string;
    completed?: string;
  };
  assigned: {
    waiter: string | null;
    kitchen: string | null;
  };
}

// ─── Kitchen / KDS ────────────────────────────────────────────────────────────

interface KitchenStation {
  _id: string;
  name: string;
  code: string;                            // e.g. "GRILL"
  description?: string;
  isActive: boolean;
  displayOrder: number;
  merchant: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
}

interface KitchenTicketItem {
  _id: string;
  orderItemId: string;
  menuItem: string;
  menuItemName: string;
  quantity: number;
  notes?: string;
  status: TicketItemStatus;
  startedAt?: string;
  completedAt?: string;
}

interface KitchenTicket {
  _id: string;
  ticketNumber: string;                    // e.g. "GRILL-7"
  orderNumber: string;
  orderType: OrderType;
  tableNumber?: string;
  status: TicketStatus;
  priority: TicketPriority;
  merchant: string;
  branch: string;
  order: string | { _id: string; orderNumber: string; orderType: OrderType; tableNumber?: string };
  station: string | { _id: string; name: string; code: string; color?: string };
  items: KitchenTicketItem[];
  assignedTo?: string | { _id: string; name: string };
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  canceledBy?: string;
  canceledReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateStationRequest {
  name: string;
  code: string;
  description?: string;
  displayOrder?: number;
}

interface UpdateStationRequest {
  name?: string;
  code?: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}

interface AssignMenuItemStationRequest {
  stationId: string | null;
}

interface UpdateTicketStatusRequest {
  status: 'accepted' | 'in_progress' | 'ready' | 'canceled';
  reason?: string;
}

interface TicketTransitionResponse {
  ticket: KitchenTicket;
  previousStatus: TicketStatus;
  noop: boolean;
}

// ─── Socket.IO event payloads ─────────────────────────────────────────────────

interface TicketCreatedEvent {
  _id: string;
  ticketNumber: string;
  orderNumber: string;
  orderType: OrderType;
  tableNumber?: string;
  status: 'pending';
  priority: TicketPriority;
  items: KitchenTicketItem[];
  station: string;
  order: string;
  branch: string;
}

interface TicketUpdatedEvent extends KitchenTicket {}

interface OrderNewEvent {
  // Shape matches what the client originally emitted via order:create —
  // the server re-broadcasts it to permission rooms
  _id?: string;
  branchId: string;
  [key: string]: unknown;
}

interface TableUpdatedEvent {
  tableId: string;
  status: string;
}
```

---

## 6. Real-time / Socket Events

### 6.1 Connection and authentication

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8000', {
  auth: { token: '<staff-jwt>' }
  // OR pass via cookie: jwt=<token>
  // OR pass via Authorization header
});
```

### 6.2 Joining rooms

After connecting, emit `setup:session` to join branch and permission rooms:

```typescript
socket.emit('setup:session', { branchId: '64f1a2b3c4d5e6f7a8b9c0d3' });
```

For KDS station view, also subscribe to the specific station:

```typescript
socket.emit('kds:subscribe', {
  branchId: '64f1a2b3c4d5e6f7a8b9c0d3',
  stationId: '64f1a2b3c4d5e6f7a8b9c0db'
});
```

### 6.3 Events the frontend must listen for

| Event | Room it comes from | When it fires | Payload |
|---|---|---|---|
| `ticket:created` | `branch:{branchId}:station:{stationId}` AND `branch:{branchId}` | An order transitions to `preparing` and KDS tickets are created | `KitchenTicket` (each ticket as a separate emit) |
| `ticket:updated` | `branch:{branchId}:station:{stationId}` AND `branch:{branchId}` | Any ticket status change (accept, start, ready, cancel) | `KitchenTicket` |
| `order:new` | `branch:{branchId}:perm:ORDER_VIEW` and `branch:{branchId}:perm:ORDER_MANAGE` | A client emits `order:create` (e.g., after a customer places an order) | Whatever the client sent in the `order:create` payload |
| `table:updated` | `branch:{branchId}` | A client emits `table:sync` | `{ tableId: string, status: string }` |
| `notification` | `branch:{branchId}:perm:{permission}` or `branch:{branchId}` | A client emits `notification:broadcast` | Arbitrary notification object |

### 6.4 Events the frontend may emit

| Event | Payload | Effect |
|---|---|---|
| `setup:session` | `{ branchId }` | Joins all branch rooms for this user |
| `kds:subscribe` | `{ branchId, stationId }` | Joins the KDS station room for real-time ticket updates |
| `order:create` | `{ branchId, ...orderData }` | Server re-broadcasts as `order:new` to ORDER_VIEW/ORDER_MANAGE rooms |
| `table:sync` | `{ branchId, tableId, status }` | Server re-broadcasts as `table:updated` to branch room |
| `notification:broadcast` | `{ branchId, targetPermission?, data }` | Server re-broadcasts `notification` to permission/branch room |
| `inventory:subscribe` | `{ merchantId }` | Joins `merchant:{merchantId}` room for inventory events |

### 6.5 Room naming reference

| Room | Who joins | Purpose |
|---|---|---|
| `branch:{branchId}` | All staff in a branch | General branch-wide events |
| `branch:{branchId}:perm:{permName}` | Staff with that specific permission | Role-filtered events (e.g. `ORDER_VIEW`) |
| `branch:{branchId}:station:{stationId}` | Kitchen staff subscribed to a station | KDS real-time ticket events |
| `user:{userId}` | Individual user | Per-user notifications |
| `merchant:{merchantId}` | Merchant-wide | Inventory alerts |

---

## 7. Common Integration Flows

### Flow 1 — Customer places a dine-in order (QR scan to kitchen)

```
1. Customer scans table QR code
   → Frontend receives a session token (how this happens is in the customer auth module,
     outside the order module)

2. Customer browses menu, builds cart, taps "Place Order"
   POST /api/v1/orders
   Authorization: Bearer <session-token>
   Body: { items: [{ menuItemId, quantity, notes }] }

   → Response 201: { data: { _id, orderNumber, status: "pending", totalAmount } }
   → Save orderNumber for polling / display

3. Staff dashboard receives socket event
   socket.on('order:new', handler)  ← fires if someone emits order:create after placement
   OR staff polls GET /api/v1/orders/pending

4. Staff accepts order
   PATCH /api/v1/orders/{id}/status
   Body: { status: "accepted" }

5. Staff starts preparation → sends to kitchen
   PATCH /api/v1/orders/{id}/status
   Body: { status: "preparing" }
   → Server creates KDS tickets automatically (outbox worker)
   → Kitchen screens receive: socket.on('ticket:created', handler)

6. Kitchen marks tickets ready one by one
   PATCH /api/v1/kitchen/tickets/{ticketId}/ready
   → When LAST ticket is marked ready, server auto-transitions order to "ready"
   → socket.on('ticket:updated', handler) fires per ticket

7. Staff serves food
   PATCH /api/v1/orders/{id}/status
   Body: { status: "served" }

8. Staff marks as paid
   POST /api/v1/orders/{id}/pay  (multipart/form-data)
   Body: paymentMethod=cash
   → Order moves to "completed", table freed
```

### Flow 2 — Staff dashboard: order lifecycle management

```
1. Load active orders on dashboard mount
   GET /api/v1/orders/active?branchId={branchId}

2. Subscribe to real-time updates
   socket.emit('setup:session', { branchId })
   socket.on('order:new', (order) => addToList(order))
   socket.on('ticket:updated', (ticket) => updateOrderIfReady(ticket))

3. Staff clicks "Accept" on an order card
   PATCH /api/v1/orders/{id}/status  { status: "accepted" }

4. Staff assigns waiter and kitchen staff
   PATCH /api/v1/orders/{id}/status  { status: "accepted", assignedWaiter: id, assignedKitchenStaff: id }

5. Customer asks to add items (still accepting)
   PATCH /api/v1/orders/{id}/add-items  { items: [...] }

6. Send to kitchen
   PATCH /api/v1/orders/{id}/status  { status: "preparing" }
   → KDS tickets appear on kitchen screens

7. When all tickets ready (automatic), order card moves to "ready"
   No API call needed — socket event updates the UI

8. Cancel scenario
   PATCH /api/v1/orders/{id}/cancel  { reason: "Customer left" }
   → Works from pending, accepted, preparing, ready (role-dependent)
```

### Flow 3 — KDS screen: receiving and completing a ticket

```
1. Kitchen staff loads KDS for their station
   GET /api/v1/kitchen/stations/{stationId}/tickets
   → Returns active tickets

2. Subscribe to real-time ticket updates
   socket.emit('setup:session', { branchId })
   socket.emit('kds:subscribe', { branchId, stationId })
   socket.on('ticket:created', (ticket) => addTicketToScreen(ticket))
   socket.on('ticket:updated', (ticket) => updateTicketOnScreen(ticket))

3. New order arrives → ticket:created event fires
   UI shows the ticket in "pending" state with countdown timer

4. Kitchen staff presses "Accept"
   PATCH /api/v1/kitchen/tickets/{ticketId}/accept
   → ticket.status = "accepted", ticket.acceptedAt set, assignedTo set to current user

5. Kitchen staff starts cooking
   PATCH /api/v1/kitchen/tickets/{ticketId}/start
   → ticket.status = "in_progress", ticket.startedAt set

6. Food is ready
   PATCH /api/v1/kitchen/tickets/{ticketId}/ready
   → ticket.status = "ready", ticket.completedAt set
   → If last ticket for the order: order auto-transitions to "ready"

7. Ticket stays at "ready" until Phase 2
   (no completed transition in Phase 1 — see Known Limitations)
```

### Flow 4 — Handling a canceled or failed order

```
1. Order in "preparing" needs to be canceled (e.g., customer left)
   PATCH /api/v1/orders/{id}/cancel  { reason: "Customer walked out" }
   → State machine checks: kitchen staff cannot cancel "ready→canceled", only waiter/admin
   → On success: order.status = "canceled", order.canceledAt/canceledReason set

2. Merged order re-payment attempt is blocked
   POST /api/v1/orders/{mergedSourceId}/pay
   → Response 400: "Cannot mark a canceled order as paid"
   → UI should check order.status before showing the "Pay" button

3. Inventory failure during order placement
   POST /api/v1/orders/staff  (insufficient stock)
   → Response 400: "Insufficient inventory for this order"
   → No order document created; frontend should show stock warning

4. Transition permission denied
   PATCH /api/v1/orders/{id}/status  { status: "preparing" }  (by a waiter role)
   → Response 403: "Your role cannot transition orders from accepted to preparing"
   → UI should hide unavailable transitions based on current user role
```

---

## 8. Known Limitations / Gotchas

### KDS tickets have no `completed` state in Phase 1

The `KitchenTicket` schema has a `completed` status in its enum, and
`TICKET_TRANSITIONS.completed = []` is defined, but there is **no `ready → completed`
transition** registered. The `TICKET_TRANSITION_PERMISSIONS` map has no `ready->completed`
key. Tickets reach `ready` and stay there permanently until they are manually canceled
or until Phase 2 adds an auto-complete trigger (`order:served` event).

**Frontend implication:** Do not show a "Complete" button on ready tickets — the server
will reject it. KDS dashboards that query for "active" tickets will always include
ready-status tickets, even for fully served orders.

### `item.name` is `null` on pre-fix orders

The `name` field was added to `orderItemSchema` in Pass 2. Orders placed before this fix
will have `items[].name === null` or `undefined`. Any UI that renders item names from the
stored order document (not from a live `menuItem` populate) must handle this gracefully.
The `getOrderByNumber` DTO and any receipt rendering should fall back to
`item.menuItem?.name?.en ?? 'Unknown item'` when `item.name` is null.

### Response envelope inconsistency

Two different response shapes exist (`{ success: true, data }` vs `{ status: "success", data }`).
The status-specific list endpoints (`/pending`, `/accepted`, etc.) use the raw shape.
`/active`, `/staff` (place order), `updateOrderStatus`, and `addItemToOrder` use `sendSuccess`.
Code defensively: check for both `res.success === true` and `res.status === 'success'`.

### `subtotal` in staff order request is validated but ignored

The Zod schema requires `subtotal: z.number().positive()` on `POST /orders/staff`. Send a
plausible positive number (e.g. the UI's running total). The server will always replace it
with the server-computed value based on DB prices.

### Merge is not exposed as a route

`OrderService.mergeOrders` is implemented and the handler (`mergeOrders`) exists, but
`POST /api/v1/orders/merge` is **not registered in `orders.routes.js`**. The merge feature
is not reachable via HTTP.

### No customer `getMyActiveOrder` route registered

`customer.handler.js` exports `getMyActiveOrder`, but there is no `GET /my-active` in the
routes file. The endpoint does not exist.

### Socket.IO requires a staff JWT — no customer socket support

`socket-server.js` authenticates sockets via `User.findById` (staff users only). Customer
session tokens do not work for socket connections. Real-time updates for customers must be
polled or handled via a different mechanism.

### `out_for_delivery` and `delivered` timestamps

`OrderStateMachineService.applyDeliveryStatusTimestamps` sets `delivery.dispatchedAt` when
entering `out_for_delivery` and `delivery.deliveredAt` when entering `delivered`. These are
stored on the nested `delivery` sub-document, not as top-level timestamp fields on the order.
Access them as `order.delivery.dispatchedAt` and `order.delivery.deliveredAt`.

### `mergeOrders` source orders keep `paymentStatus: 'unpaid'`

After Pass 2, merged source orders are `status: 'canceled'` and `paymentStatus: 'unpaid'`.
They should not be shown as paid in revenue dashboards. Any UI that reads `paymentStatus`
directly from order documents for display should also check `status !== 'canceled'` before
labeling an order as "unpaid and outstanding".

### KDS ticket item-level `status` field

`kitchenTicketItemSchema` has a `status` field (`pending | in_progress | ready`), but there
are no API endpoints to update individual item statuses within a ticket. Item status appears
to be reserved for future per-item tracking. Currently all items move with the ticket's
top-level status.
