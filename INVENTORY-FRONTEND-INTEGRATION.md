# Inventory Domain — Frontend Integration Guide

This document covers the 5 inventory modules. All routes live under the global
`/api/v1/*` prefix and **require a valid JWT** (except `POST /api/v1/auth/*`).

---

## 1) Auth Setup (Prelude)

Every protected request needs:

```
Authorization: Bearer <JWT from /api/v1/auth/login>
Content-Type: application/json
```

Reference:

- [auth.routes.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/auth/auth.routes.js)
- Global router mount in [routes/index.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/routes/index.js#L130-L137)

Error shape:

```json
{
  "status": "error",
  "message": "...",
  "statusCode": 400
}
```

---

## 2) Suppliers — `/api/v1/suppliers`

Route declarations: [suppliers.routes.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/suppliers.routes.js)
Controller (payload/response shape): [supplier.controller.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/controller/supplier.controller.js)
Database schema: [Supplier.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/models/Supplier.js)

| Method | Path   | Purpose                        |
| ------ | ------ | ------------------------------ |
| GET    | `/`    | List all active suppliers      |
| POST   | `/`    | Create a supplier              |
| GET    | `/:id` | Get single supplier            |
| PATCH  | `/:id` | Update supplier                |
| DELETE | `/:id` | Soft-deactivate supplier (204) |

### 2.1 POST /api/v1/suppliers — Create supplier

**Request body**

```json
{
  "name": "Green Farm Co.",
  "contactPerson": "Abebe Bekele",
  "phone": "+251911123456",
  "email": "sales@greenfarm.et",
  "address": {
    "street": "Bole Road",
    "city": "Addis Ababa",
    "zipCode": "1000"
  },
  "paymentTerms": "net_15",
  "leadTime": 3,
  "rating": 4
}
```

**Notes**

- `paymentTerms` enum (Supplier.js L38–L42): `cash | net_7 | net_15 | net_30 | net_60`
- `rating` is 1–5 (defaults to 3)

**Response (201)**

```json
{
  "status": "success",
  "data": { "supplier": { "_id": "...", "name": "...", "merchant": "...", "isActive": true } }
}
```

### 2.2 GET /api/v1/suppliers — List

**Response**

```json
{
  "status": "success",
  "results": 3,
  "data": {
    "suppliers": [
      {
        "_id": "…",
        "name": "Green Farm Co.",
        "phone": "…",
        "paymentTerms": "net_15",
        "isActive": true
      }
    ]
  }
}
```

---

## 3) Ingredients — `/api/v1/ingredients`

Routes: [ingredients.routes.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/ingredients.routes.js)
Controller: [ingredient.controller.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/controller/ingredient.controller.js)
Schema (enums/units): [Ingredient.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/models/Ingredient.js)

| Method | Path   | Purpose                                    |
| ------ | ------ | ------------------------------------------ |
| GET    | `/`    | List ingredients (populates supplier.name) |
| POST   | `/`    | Create ingredient                          |
| GET    | `/:id` | Get ingredient                             |
| PATCH  | `/:id` | Update ingredient                          |
| DELETE | `/:id` | Soft-deactivate (204)                      |

### 3.1 POST /api/v1/ingredients — Create

**Request body**

```json
{
  "name": "Tomato (local)",
  "category": "vegetables",
  "unit": "kg",
  "currentStock": 25,
  "minStock": 10,
  "maxStock": 100,
  "costPerUnit": 120,
  "supplier": "6a243d6c5dd23ba4b994e149",
  "expiryDate": "2026-09-15T00:00:00.000Z"
}
```

**Enums**

- `category` (Ingredient.js L19–L22): `vegetables | meat | dairy | grains | spices | beverages | other`
- `unit` (Ingredient.js L24–L26): `kg | g | liter | ml | pieces | boxes | cans`

**Response (201)** — returns the created document inside `data.ingredient`.

### 3.2 GET /api/v1/ingredients — List

Response includes virtual `stockStatus` driven by `currentStock` vs `minStock`/`maxStock`.

```json
{
  "status": "success",
  "results": 1,
  "data": {
    "ingredients": [
      {
        "_id": "…",
        "name": "Tomato (local)",
        "supplier": { "_id": "…", "name": "Green Farm Co." },
        "currentStock": 25,
        "unit": "kg",
        "stockStatus": "in_stock"
      }
    ]
  }
}
```

---

## 4) Recipes — `/api/v1/recipes`

Routes: [recipes.routes.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/recipes.routes.js)
Controller: [recipe.controller.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/controller/recipe.controller.js)
Schema: [Recipe.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/models/Recipe.js)

| Method | Path   | Purpose                                       |
| ------ | ------ | --------------------------------------------- |
| GET    | `/`    | List recipes (populates menuItem, ingredient) |
| POST   | `/`    | Create recipe (one per menuItem; enforced)    |
| GET    | `/:id` | Get recipe with ingredient current stock      |
| PATCH  | `/:id` | Update recipe                                 |
| DELETE | `/:id` | Soft-deactivate (204)                         |

### 4.1 POST /api/v1/recipes — Create

**Request body**

```json
{
  "menuItem": "6a421b0c03d39206c382def0",
  "name": "Margharita — Standard Recipe",
  "yield": 1,
  "items": [
    { "ingredient": "6b0c…ingredientId", "quantity": 0.15, "unit": "kg" },
    { "ingredient": "6b0c…ingredientId2", "quantity": 0.05, "unit": "kg" }
  ]
}
```

- `menuItem` references a `Menu` \_id. Unique-constraint with merchant (Recipe.js L65).
- `yield` = how many servings the item list produces (cost divides by yield automatically).
- Response (201) inside `data.recipe`. `totalCost` is auto-calculated pre-save.

### 4.2 GET /api/v1/recipes/:id — Detail

Returns `items.ingredient.currentStock` so a recipe card can show "enough stock / not enough".

---

## 5) Inventory — `/api/v1/inventory`

Routes: [inventory.routes.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/inventory.routes.js)
Controller (100% delegated to InventoryService): [inventory.controller.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/controller/inventory.controller.js)
Validation schemas (Zod — hard source of truth for payloads): [inventory.validator.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/validators/inventory.validator.js)

| Method | Path                        | Purpose                                   |
| ------ | --------------------------- | ----------------------------------------- |
| POST   | `/adjust`                   | Single-item stock adjustment              |
| POST   | `/batch-adjust`             | Multi-item batch adjustments              |
| GET    | `/movements`                | Audit log of stock movements              |
| GET    | `/valuation`                | Inventory value + counts                  |
| GET    | `/low-stock`                | Items where currentStock ≤ minStock       |
| PATCH  | `/:ingredientId/thresholds` | Set min/max thresholds                    |
| POST   | `/validate-order`           | Pre-order stock check (returns shortages) |

### 5.1 POST /api/v1/inventory/adjust

```http
POST /api/v1/inventory/adjust
Content-Type: application/json
Authorization: Bearer <token>
```

**Payload**

```json
{
  "ingredientId": "6a421b0c03d39206c382def0",
  "quantity": 10,
  "type": "in",
  "reason": "Delivery received",
  "reference": "PO-20260808-001",
  "cost": 120
}
```

**Enums** (inventory.validator.js L28–L34)

- `type`: `in | out | waste | adjustment`
- `cost` is per-unit; stored with movement so valuation stays accurate.

**Response (200)**

```json
{
  "status": "success",
  "message": "Stock adjusted successfully",
  "data": {
    "ingredient": {
      "_id": "…",
      "name": "Tomato (local)",
      "currentStock": 35,
      "unit": "kg"
    }
  }
}
```

### 5.2 POST /api/v1/inventory/batch-adjust

```json
{
  "adjustments": [
    { "ingredientId": "6a421…A", "quantity": 5, "type": "out", "reason": "Kitchen prep" },
    { "ingredientId": "6a421…B", "quantity": 10, "type": "waste", "reason": "Spoilage" }
  ]
}
```

Response includes per-row success/fail in `data.results`.

### 5.3 GET /api/v1/inventory/movements — Query params

```
?ingredientId=6a421…
&type=in
&startDate=2026-08-01T00:00:00.000Z
&endDate=2026-08-08T23:59:59.999Z
&limit=20
&offset=0
```

### 5.4 POST /api/v1/inventory/validate-order — "Can we serve this order?"

```json
{
  "items": [
    { "ingredientId": "6a421…A", "quantity": 1.2 },
    { "ingredientId": "6a421…B", "quantity": 0.5, "recipeId": "6c…recipe" }
  ]
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "available": false,
    "shortages": [{ "ingredientId": "6a421…A", "required": 1.2, "available": 0.7 }]
  }
}
```

---

## 6) Purchase Orders — `/api/v1/purchase-orders`

Routes: [purchase-orders.routes.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/purchase-orders.routes.js)
Controller (receipt triggers stock adj): [purchase-order.controller.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/src/modules/inventory/controller/purchase-order.controller.js)
Schema: [PurchaseOrder.js](file:///c:/Users/HP/Dev/projects/Restaurant_App/restaurant-BO/models/PurchaseOrder.js)

| Method | Path           | Purpose                                            |
| ------ | -------------- | -------------------------------------------------- |
| GET    | `/`            | List POs (populates supplier, createdBy)           |
| POST   | `/`            | Create PO (auto-generates poNumber, totals)        |
| GET    | `/:id`         | PO detail (populates approvedBy, items.ingredient) |
| PATCH  | `/:id`         | Update PO                                          |
| DELETE | `/:id`         | Hard-delete PO                                     |
| POST   | `/:id/receive` | Mark PO received AND stock-in each line            |

### 6.1 POST /api/v1/purchase-orders — Create

```json
{
  "supplier": "6a243d6c5dd23ba4b994e149",
  "status": "draft",
  "items": [
    { "ingredient": "6a421…A", "quantity": 50, "unitPrice": 120, "totalPrice": 6000 },
    { "ingredient": "6a421…B", "quantity": 20, "unitPrice": 300, "totalPrice": 6000 }
  ],
  "taxAmount": 480,
  "expectedDeliveryDate": "2026-08-12T00:00:00.000Z",
  "notes": "Ring bell at back door"
}
```

**Behaviors (auto-filled, safe to omit from payload)**

- `poNumber` auto-generated (PurchaseOrder.js L92–L99): `PO-YYYYMMDD-NNN`
- `subtotal` = Σ items.totalPrice; `totalAmount` = subtotal + taxAmount
- `status` enum (PurchaseOrder.js L48–L51): `draft | sent | confirmed | partially_received | received | cancelled`

**Response (201)** inside `data.purchaseOrder`.

### 6.2 POST /api/v1/purchase-orders/:id/receive — Goods receipt

```json
{
  "receivedItems": [
    { "ingredientId": "6a421…A", "receivedQuantity": 50 },
    { "ingredientId": "6a421…B", "receivedQuantity": 18 }
  ]
}
```

For each received item, the controller (purchase-order.controller.js L69–L83) calls:

```
InventoryService.adjustStock(merchantId, ingredientId, qty, 'in', 'purchase', poNumber, user, unitPrice)
```

then transitions the PO to `status: 'received'` and sets `actualDeliveryDate = now`.

---

## 7) Response conventions / Frontend tips

- All CRUD creations return **201** with the created resource nested under `data.<resource>`.
- Lists return `status`, `results / count`, and `data.<resource plural>`.
- Deletes are **204 No Content** (soft-delete via `isActive: false` for suppliers/ingredients/recipes; hard for POs).
- Protected paths return a 401 if the JWT is missing and 403 if the user is not `admin/manager`.
- Zod-validated routes (inventory adjustments, thresholds, movements) return structured Zod errors in the `errors` array of the global error handler.

## 8) Quick Start Flow for UI pages

1. **Setup** screen: Create suppliers → ingredients (link supplier) → recipes (link menuItem + ingredients).
2. **Dashboard** screen:
   - Call `GET /api/v1/inventory/valuation` for top KPIs.
   - Call `GET /api/v1/inventory/low-stock` for the alert card.
3. **Stock Movements** screen: `GET /api/v1/inventory/movements?...`
4. **Receive Goods** flow:
   - `GET /api/v1/purchase-orders` → list POs, filter by status.
   - Click "Receive" → `POST /api/v1/purchase-orders/:id/receive` (auto-adjusts stock).
5. **Order validation before placement**: call `POST /api/v1/inventory/validate-order` and render the `shortages[]` list.
