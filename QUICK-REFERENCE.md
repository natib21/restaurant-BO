# Item Status Workflow - Quick Reference

## 🎯 What It Does

Automatically serves non-cooked items (drinks, packaged goods) when dine-in orders are accepted, while tracking cooked items through the kitchen workflow.

---

## 📋 New Database Fields

### MenuItem
- `requiresKitchen` (Boolean, default: true) - If false, item won't generate kitchen tickets

### Order.items (each item)
- `requiresKitchen` - Snapshotted from MenuItem
- `status` - 'pending' | 'in_progress' | 'ready' | 'served' | 'void'
- `servedAt`, `servedBy`, `servedVia` - Tracking who/when/how served
- `voidedAt`, `voidedBy`, `voidReason` - Tracking voids
- `replacementItemId`, `replacedItemId` - Linking voided items to replacements

---

## 🔌 New API Endpoints

### 1. Update Item Status (Manual Override)
```bash
PATCH /api/v1/orders/:orderId/items/:itemId/status
Authorization: Bearer <token>

{
  "status": "served"
}
```

### 2. Bulk Serve Ready Items
```bash
POST /api/v1/orders/:orderId/items/serve-ready
Authorization: Bearer <token>

# Response:
{
  "servedCount": 3,
  "servedItems": [...]
}
```

### 3. Void Item with Reason
```bash
PATCH /api/v1/orders/:orderId/items/:itemId/void
Authorization: Bearer <token>

{
  "reason": "Out of stock",
  "createReplacement": true
}
```

---

## 🔄 Automatic Workflow

```
1. ORDER CREATED
   → All items start with status='pending'

2. ORDER ACCEPTED (dine-in)
   → Auto-serve: requiresKitchen=false items → status='served'
   → Manual items: requiresKitchen=true items → stay 'pending'

3. ORDER PREPARING
   → Tickets created for requiresKitchen=true items
   → Those items → status='in_progress'

4. TICKET READY
   → Items in that ticket → status='ready'
   → NOT auto-served (waiter must pick up)

5. WAITER SERVES
   → Manual endpoint or bulk-serve
   → Items → status='served'
   → Order status recomputed → 'served' if all done
```

---

## 🏪 State Machine

```
pending ────────────┐
  │                 │
  ├─→ in_progress ──┤
  │        │        │
  │        ▼        │
  │     ready ──────┤
  │        │        │
  ▼        ▼        ▼
served ──────────→ void (terminal)
```

**Rules:**
- ✅ One-way only (no backward transitions)
- ✅ Void is terminal (cannot change after voided)
- ✅ Corrections use void + replacement pattern

---

## 📊 Usage Examples

### Example 1: Mark non-cooked items in menu
```javascript
// When creating/updating menu items
{
  "name": "Coca Cola",
  "price": 20,
  "requiresKitchen": false, // ✅ Won't create kitchen ticket
  "kitchenStation": null
}
```

### Example 2: Waiter picks up multiple dishes
```bash
# Instead of serving items one by one:
POST /api/v1/orders/12345/items/serve-ready

# Serves all items with status='ready' in one call
```

### Example 3: Item sent back by customer
```bash
PATCH /api/v1/orders/12345/items/67890/void
{
  "reason": "Customer complaint - overcooked",
  "createReplacement": true
}

# Creates new fresh item linked to voided one
```

---

## 🔐 RBAC Tasks Added

**Item Status (3 tasks):**
- `orders.items.updateStatus`
- `orders.items.serveReady`
- `orders.items.void`

**Order Flow Config (4 tasks):**
- `orderFlow.getConfig`
- `orderFlow.updateChannel`
- `orderFlow.updateGlobalSettings`
- `orderFlow.reset`

**Run seeder:**
```bash
node scripts/seed-roles-and-tasks.js
```

---

## 🚀 Quick Start

### 1. Run RBAC Seeder
```bash
node scripts/seed-roles-and-tasks.js
```

### 2. Mark Non-Cooked Menu Items
```javascript
// Update drinks, packaged items, etc.
db.menuitems.updateMany(
  { name: /cola|water|juice|chips/i },
  { $set: { requiresKitchen: false } }
)
```

### 3. Test with Order
```bash
# Create dine-in order with mixed items
POST /api/v1/orders/staff
{
  "items": [
    { "menuItemId": "<steak-id>", "quantity": 1 },
    { "menuItemId": "<cola-id>", "quantity": 1 }
  ],
  "orderType": "dine_in",
  "tableId": "<table-id>",
  ...
}

# Accept order → Cola auto-served, Steak stays pending
PATCH /api/v1/orders/<order-id>/status
{ "status": "accepted" }

# Check item statuses
GET /api/v1/orders/<order-id>
# Response shows Cola already served, Steak still pending
```

---

## 📝 Files Changed

**Created:**
- `src/modules/order/service/ItemStatusService.js`
- `src/modules/order/controller/handlers/item-status.handler.js`
- `tests/item-status-workflow.test.js`

**Modified:**
- `src/modules/menu/model/MenuItem.model.js`
- `models/orderModel.js`
- `src/modules/order/service/OrderService.js`
- `src/modules/order/service/OrderStateMachineService.js`
- `src/modules/kitchen/service/KitchenTicketService.js`
- `src/modules/order/orders.routes.js`
- `scripts/seed-roles-and-tasks.js`

---

## ❓ FAQ

**Q: What happens to existing orders?**  
A: Schema is backward compatible. Existing items will have `status='pending'` by default.

**Q: Do delivery orders auto-serve non-cooked items?**  
A: No, only dine-in orders. Delivery "served" has different semantics.

**Q: Can I undo a void?**  
A: No, void is terminal. Create a replacement item instead.

**Q: How do I see item status history?**  
A: Check order audit logs or use `GET /api/v1/orders/:id` to see current statuses.

**Q: What if kitchen marks ticket ready but item is voided?**  
A: State machine validation prevents invalid transitions. Ticket updates are logged but skipped.

---

## 🎉 Done!

The system is ready. All code is implemented, tested, and documented. Run the seeder and start using it! 🚀
