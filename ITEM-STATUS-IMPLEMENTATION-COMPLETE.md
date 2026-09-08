# Item-Level Status Workflow - Implementation Complete

## Summary

Successfully implemented a complete item-level status workflow for the Restaurant Management System with:

1. ✅ **Auto-serve non-cooked items** when order is accepted (dine-in only)
2. ✅ **One-way state machine** preventing backward transitions  
3. ✅ **Void + replacement pattern** for corrections (preserves audit trail)
4. ✅ **Order status recomputation** after every item mutation
5. ✅ **KDS integration** - tickets update item statuses automatically

---

## Implementation Details

### Phase 1: Schema Changes

#### 1.1 MenuItem Model (`src/modules/menu/model/MenuItem.model.js`)
```javascript
requiresKitchen: {
  type: Boolean,
  default: true,
  index: true,
  comment: 'If false, item does not generate kitchen tickets'
}
```

#### 1.2 Order Item Schema (`models/orderModel.js`)
```javascript
// Snapshotted from MenuItem at order creation
requiresKitchen: { type: Boolean, default: true },

// Item status tracking
status: {
  type: String,
  enum: ['pending', 'in_progress', 'ready', 'served', 'void'],
  default: 'pending',
  index: true
},

// Served tracking
servedAt: { type: Date },
servedBy: { type: ObjectId, ref: 'User' },
servedVia: { type: String, enum: ['auto', 'manual'] },

// Void tracking
voidedAt: { type: Date },
voidedBy: { type: ObjectId, ref: 'User' },
voidReason: { type: String },

// Replacement tracking
replacementItemId: { type: ObjectId },
replacedItemId: { type: ObjectId }
```

#### 1.3 OrderService - Snapshot requiresKitchen (`src/modules/order/service/OrderService.js`)
```javascript
orderItems.push({
  // ... existing fields
  requiresKitchen: menuItem.requiresKitchen !== false, // Snapshot
});
```

### Phase 2: Item Status Service

Created `src/modules/order/service/ItemStatusService.js` with:

#### State Machine
```javascript
const ITEM_TRANSITIONS = {
  pending: ['in_progress', 'served', 'void'],
  in_progress: ['ready', 'void'],
  ready: ['served', 'void'],
  served: ['void'],
  void: [] // Terminal
};
```

#### Key Methods
- `autoServeNonCookedItems(order, session)` - Auto-serve dine-in non-cooked items
- `updateItemStatus(order, itemId, newStatus, actor, session)` - Manual status update
- `serveReadyItems(order, actor, session)` - Bulk serve all ready items
- `voidItem(order, itemId, reason, actor, session)` - Void with required reason
- `createReplacementItem(order, voidedItemId, actor, session)` - Create replacement
- `recomputeOrderStatus(order, session)` - Derive order status from items

### Phase 3: Integration Points

#### 3.1 OrderStateMachineService Integration (`src/modules/order/service/OrderStateMachineService.js`)

**After `accepted` transition:**
```javascript
if (!result.noop && toStatus === 'accepted') {
  const { ItemStatusService } = require('./ItemStatusService');
  await ItemStatusService.autoServeNonCookedItems(result.order, session);
}
```

**After every transition:**
```javascript
if (!result.noop) {
  const { ItemStatusService } = require('./ItemStatusService');
  await ItemStatusService.recomputeOrderStatus(result.order, session);
}
```

#### 3.2 KitchenTicketService Integration (`src/modules/kitchen/service/KitchenTicketService.js`)

**Skip items that don't require kitchen:**
```javascript
if (!stationId || orderItem.requiresKitchen === false) {
  continue; // Skip non-kitchen items
}
```

**Update items on ticket creation:**
```javascript
async _updateOrderItemsOnTicketCreation(order, tickets, session) {
  // Set all ticket items to 'in_progress'
}
```

**Update items on ticket transitions:**
```javascript
async _updateOrderItemStatuses(ticket, toStatus, session) {
  // in_progress: Set items to 'in_progress'
  // ready: Set items to 'ready' (NOT served)
}
```

### Phase 4: API Endpoints

Created `src/modules/order/controller/handlers/item-status.handler.js` with 3 endpoints:

#### 1. Update Item Status
```
PATCH /api/v1/orders/:orderId/items/:itemId/status
Body: { status: "served" | "ready" | "in_progress" }
```
- Validates state machine transitions
- Sets `servedVia='manual'` and `servedBy`
- Recomputes order status

#### 2. Bulk Serve Ready Items
```
POST /api/v1/orders/:orderId/items/serve-ready
```
- Serves all items with `status='ready'`
- Useful for waiter picking up multiple dishes at once
- All marked with `servedVia='manual'`

#### 3. Void Item
```
PATCH /api/v1/orders/:orderId/items/:itemId/void
Body: { reason: string, createReplacement?: boolean }
```
- Voids item with required reason (audit trail)
- Optionally creates replacement item
- Replacement links back to voided item

---

## Workflow Examples

### Example 1: Dine-in Order with Mixed Items

**Order created:**
```
Items:
- Grilled Steak (requiresKitchen: true) → status: pending
- Coca Cola (requiresKitchen: false) → status: pending
```

**Order accepted:**
```
Items:
- Grilled Steak → status: pending (unchanged)
- Coca Cola → status: served (auto-served, servedVia: 'auto')
```

**Order moved to preparing (tickets created):**
```
Items:
- Grilled Steak → status: in_progress (ticket created)
- Coca Cola → status: served (unchanged)
```

**Ticket marked ready:**
```
Items:
- Grilled Steak → status: ready (waiter must manually serve)
- Coca Cola → status: served
```

**Waiter serves steak:**
```
PATCH /orders/:id/items/:itemId/status
Body: { status: "served" }

Items:
- Grilled Steak → status: served (servedVia: 'manual', servedBy: waiterId)
- Coca Cola → status: served

Order status → 'served' (all items served)
```

### Example 2: Void and Replacement

**Item voided (wrong order):**
```
PATCH /orders/:id/items/:itemId/void
Body: { reason: "Wrong item sent", createReplacement: true }

Result:
- Original item: status='void', voidReason="Wrong item sent"
- New item created: status='pending', replacedItemId points to voided item
```

### Example 3: Bulk Serve

**Multiple items ready:**
```
Items:
- Steak → status: ready
- Pasta → status: ready
- Salad → status: ready

POST /orders/:id/items/serve-ready

Result:
- All 3 items → status: served (servedVia: 'manual')
```

---

## Order Status Recomputation Logic

Called after **every** item status mutation:

```javascript
const activeItems = order.items.filter(i => i.status !== 'void');

if (all items served) → order.status = 'served'
else if (any item ready) → order.status = 'ready'
else if (any item in_progress) → order.status = 'preparing'
else → order.status = 'accepted' (default for pending items)
```

---

## State Machine Guarantees

✅ **No backward transitions** - Once moved forward, cannot rewind  
✅ **Terminal void status** - Voided items cannot transition  
✅ **Audit trail** - Void requires reason, served tracks who/when/how  
✅ **Replacement pattern** - Corrections create new items, old ones stay voided  

---

## Files Modified

### Schema
- `src/modules/menu/model/MenuItem.model.js` - Added `requiresKitchen` field
- `models/orderModel.js` - Extended orderItemSchema with 11 new fields

### Services
- `src/modules/order/service/OrderService.js` - Snapshot `requiresKitchen`
- `src/modules/order/service/OrderStateMachineService.js` - Added auto-serve + recompute calls
- `src/modules/kitchen/service/KitchenTicketService.js` - Item status updates on ticket transitions

### New Files
- `src/modules/order/service/ItemStatusService.js` - Core item status logic (400+ lines)
- `src/modules/order/controller/handlers/item-status.handler.js` - 3 API endpoints

### Routes
- `src/modules/order/orders.routes.js` - Added 3 item status routes

### Tests
- `tests/item-status-workflow.test.js` - Comprehensive test suite

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Auto-serve trigger** | On `accepted` (not creation) | Order not confirmed yet at creation |
| **Ticket completion** | Items → `ready` (not auto-served) | Preserves handoff visibility for SLA tracking |
| **Void pattern** | Keep voided item + create replacement | Preserves audit trail and accounting data |
| **Recomputation** | After EVERY item mutation | Postcondition pattern prevents missed updates |
| **requiresKitchen snapshot** | Copy at order creation | Prevents retroactive menu changes affecting history |
| **State machine** | One-way only | Preserves when/why things went wrong |

---

## Testing

### Test Coverage
- ✅ Auto-serve non-cooked items (dine-in only)
- ✅ No auto-serve for delivery/pickup
- ✅ Ticket creation sets items to in_progress
- ✅ Ticket ready sets items to ready (NOT served)
- ✅ Manual serve endpoint
- ✅ Bulk serve endpoint
- ✅ Void with reason
- ✅ Void with replacement
- ✅ Invalid transitions rejected
- ✅ Terminal void status enforced
- ✅ Order status recomputation

### Running Tests
```bash
npm test -- tests/item-status-workflow.test.js
```

**Note:** Tests require proper MongoDB setup and may need database cleanup between runs.

---

## API Usage Examples

### 1. Check order item statuses
```bash
GET /api/v1/orders/:orderId

Response:
{
  "items": [
    {
      "_id": "...",
      "name": "Grilled Steak",
      "status": "ready",
      "requiresKitchen": true,
      "servedAt": null,
      "servedVia": null
    },
    {
      "_id": "...",
      "name": "Coca Cola",
      "status": "served",
      "requiresKitchen": false,
      "servedAt": "2024-01-15T10:30:00Z",
      "servedVia": "auto"
    }
  ]
}
```

### 2. Manually serve an item
```bash
PATCH /api/v1/orders/:orderId/items/:itemId/status
Authorization: Bearer <waiter-token>
Content-Type: application/json

{
  "status": "served"
}

Response:
{
  "status": "success",
  "data": {
    "item": {
      "_id": "...",
      "status": "served",
      "servedAt": "2024-01-15T10:35:00Z",
      "servedBy": "waiter-id",
      "servedVia": "manual"
    },
    "noop": false
  }
}
```

### 3. Bulk serve all ready items
```bash
POST /api/v1/orders/:orderId/items/serve-ready
Authorization: Bearer <waiter-token>

Response:
{
  "status": "success",
  "data": {
    "servedCount": 3,
    "servedItems": [
      { "_id": "...", "name": "Steak", "status": "served", "servedAt": "..." },
      { "_id": "...", "name": "Pasta", "status": "served", "servedAt": "..." },
      { "_id": "...", "name": "Salad", "status": "served", "servedAt": "..." }
    ]
  }
}
```

### 4. Void an item with replacement
```bash
PATCH /api/v1/orders/:orderId/items/:itemId/void
Authorization: Bearer <waiter-token>
Content-Type: application/json

{
  "reason": "Customer sent it back - overcooked",
  "createReplacement": true
}

Response:
{
  "status": "success",
  "data": {
    "voidedItem": {
      "_id": "original-id",
      "status": "void",
      "voidReason": "Customer sent it back - overcooked",
      "voidedAt": "...",
      "voidedBy": "waiter-id"
    },
    "replacementItem": {
      "_id": "new-id",
      "status": "pending",
      "replacedItemId": "original-id"
    }
  }
}
```

---

## Next Steps / Future Enhancements

### Phase 2 Possibilities
- [ ] Inventory checks before auto-serve (YAGNI for now)
- [ ] Different "served" semantics for delivery vs dine-in
- [ ] SLA tracking based on item timestamps
- [ ] Analytics dashboard showing item flow times
- [ ] Kitchen prep time reporting

### Monitoring
- Track auto-serve rate vs manual serve
- Monitor void reasons for patterns (quality issues, stockouts)
- Alert on high void rates for specific items
- Track average time from `ready` → `served` (handoff delay)

---

## Conclusion

The item-level status workflow is **fully implemented and integrated**. The system now:

1. Automatically serves non-cooked items for dine-in orders
2. Tracks granular item-level status through the kitchen workflow
3. Prevents invalid state transitions while allowing corrections via void+replacement
4. Keeps order status in sync with item statuses
5. Provides manual override endpoints for staff
6. Maintains complete audit trail of all status changes

The implementation follows all design decisions from the refined specification and preserves the system's existing behavior for backward compatibility.
