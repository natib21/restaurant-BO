# Item-Status Workflow Implementation Plan

## STEP 1: Architecture Inspection Report

### Current Architecture Analysis

#### ✅ What Currently Exists:

**1. Order Model** (`models/orderModel.js`):
- ✅ Order-level status: `pending → accepted → preparing → ready → served → completed → canceled`
- ✅ Order-level timestamps: `placedAt`, `acceptedAt`, `readyAt`, `servedAt`, `completedAt`
- ✅ Order types: `dine_in`, `takeaway`, `delivery`
- ✅ Order source: `web`, `telegram`, `admin`, `waiter`
- ✅ `statusHistory` array with actors
- ✅ Audit plugin enabled
- **❌ NO item-level status tracking**
- **❌ NO item void/replacement support**
- **❌ NO `servedAt`/`servedBy`/`servedVia` on items**

**Current Item Schema**:
```javascript
{
  menuItem: ObjectId (ref Menu),
  name: String,
  quantity: Number,
  unitPrice: Number,
  unitCost: Number,
  totalPrice: Number,
  notes: String,
  _id: true  // ✅ Already enabled
}
```

**2. MenuItem Model** (`src/modules/menu/model/MenuItem.model.js`):
- ✅ Has `kitchenStation` field (ObjectId ref KitchenStation, nullable)
- **❌ NO `requiresKitchen` field** (needs to be added)
- ✅ Supports food/drink types
- ✅ Audit plugin enabled

**3. KitchenTicket Model** (`models/KitchenTicket.js`):
- ✅ Ticket-level status: `pending → accepted → in_progress → ready → completed → canceled`
- ✅ Item-level status within tickets: `pending → in_progress → ready`
- ✅ References `Order.items[i]._id` via `orderItemId`
- ✅ Audit plugin enabled

**4. Kitchen Ticket Creation** (`src/modules/kitchen/service/KitchenTicketService.js`):
- ✅ `createTicketsForOrder(orderId)` groups items by station
- ✅ **Already skips items without kitchenStation** (line 95-103)
- ✅ Creates one ticket per station
- ✅ Triggered by outbox handler for `order:preparing` event

**5. Order State Machine** (`src/modules/order/service/OrderStateMachineService.js`):
- ✅ Handles order-level transitions
- ✅ Uses transactions
- ✅ Role-based permissions via `resolveActor()`
- ✅ Creates `order:preparing` outbox event
- ✅ Appends `statusHistory`
- **❌ NO item-level logic** (correctly separated)

**6. Authorization**:
- ✅ Guards exist: `auth.guard.js`, `capability.guard.js`, `feature.guard.js`
- ✅ Role resolution pattern in `OrderStateMachineService.resolveActor()`
- Role categories: `superAdmin`, `admin`, `kitchen`, `waiter`, `customer`, `system`

**7. Outbox Pattern**:
- ✅ Event: `order:preparing` triggers ticket creation
- ✅ Handler: `handleOrderPreparing()` calls `KitchenTicketService.createTicketsForOrder()`
- ✅ Worker processes events asynchronously

---

### ❌ What Needs to Be Added:

**1. MenuItem.requiresKitchen**:
- Boolean field (default: true)
- Purpose: Determine if item generates tickets

**2. Order Item Status Fields**:
```javascript
{
  // ... existing fields ...
  requiresKitchen: Boolean,  // Snapshot from MenuItem
  status: enum ['pending', 'in_progress', 'ready', 'served', 'void'],
  servedAt: Date,
  servedBy: ObjectId (ref User),
  servedVia: enum ['auto', 'manual'],
  voidedAt: Date,
  voidedBy: ObjectId (ref User),
  voidReason: String,
  replacementItemId: ObjectId,  // Links to replacement
  replacedItemId: ObjectId      // Links to original (if this is replacement)
}
```

**3. ItemStatusService** (new service):
```javascript
class ItemStatusService {
  static validateTransition(fromStatus, toStatus)
  static autoServeNonCookedItems(order, session)
  static updateItemStatus(order, itemId, newStatus, actor, session)
  static serveReadyItems(order, actor, session)
  static voidItem(order, itemId, reason, actor, session)
  static createReplacementItem(order, voidedItemId, actor, session)
  static recomputeOrderStatus(order)
}
```

**4. New API Endpoints**:
```
PATCH /api/v1/order/:orderId/items/:itemId/status
POST  /api/v1/order/:orderId/items/serve-ready
PATCH /api/v1/order/:orderId/items/:itemId/void
```

**5. Integration Points**:
- `OrderStateMachineService`: Call `autoServeNonCookedItems()` after `pending → accepted`
- `KitchenTicketService`: Already filters by `kitchenStation` ✅, will now also check `requiresKitchen`
- Ticket completion: Update item status to `ready` (not `served`)

---

## STEP 2: Files That Need Modification

### Schema Changes:
1. ✅ `models/orderModel.js` - Add item status fields
2. ✅ `src/modules/menu/model/MenuItem.model.js` - Add `requiresKitchen`

### New Service:
3. ✅ `src/modules/order/service/ItemStatusService.js` (NEW FILE)

### Service Updates:
4. ✅ `src/modules/order/service/OrderStateMachineService.js` - Integrate auto-serve
5. ✅ `src/modules/kitchen/service/KitchenTicketService.js` - Check `requiresKitchen`, update item status on completion

### Controller/Handler:
6. ✅ `src/modules/order/controller/handlers/item-status.handler.js` (NEW FILE)

### Routes:
7. ✅ `src/modules/order/orders.routes.js` - Add item status endpoints

### Tests:
8. ✅ `tests/item-status-workflow.test.js` (NEW FILE)

---

## STEP 3: Conflicts & Design Decisions

### ✅ No Major Conflicts Found!

**Good News**:
1. **KitchenTicketService already skips items without station** (line 95-103)
   - Just need to add explicit `requiresKitchen` check
2. **Order item schema already has `_id: true`** (needed for item tracking)
3. **Audit plugin already exists** (can reuse for item mutations)
4. **State machine pattern well-established** (can follow same pattern for items)
5. **Transaction pattern consistent** (can reuse MongoDB sessions)

**Design Decisions**:

**Decision 1: Where to store `requiresKitchen`?**
- ✅ **On MenuItem** (source of truth)
- ✅ **Snapshot to Order.items** at order creation (prevents retroactive changes)
- Pattern already used: `unitPrice`, `name` are snapshotted

**Decision 2: Auto-serve trigger point**
- ✅ **On `pending → accepted` transition** (in OrderStateMachineService)
- ✅ **Only for dine-in orders** (matches spec)
- ✅ **Call ItemStatusService.autoServeNonCookedItems()** after successful transition

**Decision 3: Ticket completion behavior**
- ✅ **ticket `ready` → item `ready`** (NOT auto-served)
- ✅ **Waiter uses bulk-serve or manual serve** to mark `served`
- Preserves handoff visibility

**Decision 4: Void pattern**
- ✅ **Keep original item** with status `void`
- ✅ **Create new replacement item** with link back
- ✅ **Both items counted in order total** (for accounting)

**Decision 5: Order status recomputation**
- ✅ **Call after EVERY item mutation** (postcondition pattern)
- ✅ **One function: `recomputeOrderStatus()`** (single source of truth)
- Logic:
  ```javascript
  activeItems = items.filter(i => i.status !== 'void')
  if (all served) → order: 'served'
  else if (any ready) → order: 'ready'
  else if (any in_progress) → order: 'preparing'
  ```

**Decision 6: Authorization**
- ✅ **Reuse existing role resolution** (`resolveActor()` pattern)
- ✅ **Use existing guards** (auth.guard, capability.guard)
- ✅ **Item transitions don't need separate permissions** (if you can modify order, you can modify items)

---

## STEP 4-12: Implementation Sequence

### STEP 4: Schema Changes

**4.1 MenuItem Schema**:
```javascript
// Add to menuItemSchema
requiresKitchen: {
  type: Boolean,
  default: true,
  index: true,
  comment: 'If false, item does not generate kitchen tickets'
}
```

**4.2 Order Item Schema**:
```javascript
// Add to orderItemSchema
requiresKitchen: { type: Boolean, default: true },
status: {
  type: String,
  enum: ['pending', 'in_progress', 'ready', 'served', 'void'],
  default: 'pending',
  index: true
},
servedAt: Date,
servedBy: { type: Schema.Types.ObjectId, ref: 'User' },
servedVia: {
  type: String,
  enum: ['auto', 'manual'],
  default: null
},
voidedAt: Date,
voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
voidReason: { type: String, trim: true },
replacementItemId: { type: Schema.Types.ObjectId },
replacedItemId: { type: Schema.Types.ObjectId }
```

**4.3 Order Creation - Snapshot requiresKitchen**:
Update `OrderService.buildOrderItems()` to copy `requiresKitchen` from MenuItem

---

### STEP 5: ItemStatusService

Create comprehensive service with:
- State machine validation
- Auto-serve logic (dine-in only)
- Manual status updates
- Bulk-serve
- Void with replacement
- Order status recomputation

State machine:
```javascript
const ITEM_TRANSITIONS = {
  pending: ['in_progress', 'served', 'void'],
  in_progress: ['ready', 'void'],
  ready: ['served', 'void'],
  served: ['void'],
  void: []
};
```

---

### STEP 6: Integration with OrderStateMachineService

Add hook after `pending → accepted`:
```javascript
if (toStatus === 'accepted') {
  await ItemStatusService.autoServeNonCookedItems(order, session);
}
```

Add recompute after transitions:
```javascript
await ItemStatusService.recomputeOrderStatus(order);
```

---

### STEP 7: Update KDS Ticket Logic

**7.1 KitchenTicketService.createTicketsForOrder()**:
Already skips items without `kitchenStation` ✅
Add explicit check:
```javascript
if (!stationId || !menuItem.requiresKitchen) {
  continue;  // Skip non-cooked items
}
```

**7.2 Ticket Completion Handler**:
When ticket status → `ready`:
```javascript
for (const ticketItem of ticket.items) {
  // Update order item status
  const orderItem = order.items.id(ticketItem.orderItemId);
  if (orderItem) {
    orderItem.status = 'ready';  // NOT 'served'
  }
}
```

---

### STEP 8: API Endpoints

**8.1 Manual Item Status**:
```
PATCH /api/v1/order/:orderId/items/:itemId/status
Body: { "status": "served" }
Guards: protect, requireFeature('orders')
```

**8.2 Bulk Serve**:
```
POST /api/v1/order/:orderId/items/serve-ready
Guards: protect, requireFeature('orders')
```

**8.3 Void Item**:
```
PATCH /api/v1/order/:orderId/items/:itemId/void
Body: { "reason": "Wrong size" }
Guards: protect, requireFeature('orders')
```

---

### STEP 9: Authorization

Reuse existing patterns:
- `protect` middleware (JWT)
- `requireFeature('orders')` guard
- Role resolution via `req.user.role`

No new authorization needed ✅

---

### STEP 10: Tests

Create `tests/item-status-workflow.test.js`:

**Test Coverage**:
1. State machine transitions (valid/invalid)
2. Auto-serve (dine-in vs delivery/pickup)
3. Ticket creation filtering
4. Ticket completion → item ready
5. Bulk serve
6. Void + replacement
7. Order recomputation
8. Authorization checks

---

### STEP 11: Run Tests

Execute:
```bash
npm test tests/item-status-workflow.test.js
```

---

### STEP 12: Final Report

Document:
- Files changed
- APIs added
- Schema changes
- Test results
- Known limitations
- Migration notes

---

## Key Implementation Principles

✅ **Auditability First**:
- Every item mutation logged
- Actor tracked (servedBy, voidedBy)
- Timestamps preserved
- Void doesn't delete, creates audit trail

✅ **One-Way Transitions**:
- No backward edges in state machine
- Corrections via void + replacement
- Historical accuracy preserved

✅ **Clear Separation**:
- Order-level: OrderStateMachineService
- Item-level: ItemStatusService
- Ticket-level: KitchenTicketService

✅ **Physical Workflow Accuracy**:
- `ready` ≠ `served` (handoff gap preserved)
- Auto-serve only dine-in (delivery/pickup different workflow)
- Tickets only for cooked items

✅ **Data Consistency**:
- Transactions throughout
- Recompute after every mutation
- Single source of truth

✅ **Least Privilege**:
- Reuse existing auth
- No hardcoded role checks
- Follow project patterns

---

## Next Steps

Ready to proceed with implementation?

**Recommended Order**:
1. Schema changes (MenuItem + Order)
2. ItemStatusService (core logic)
3. Integration points (state machine, KDS)
4. API endpoints
5. Tests
6. Validation

Shall I proceed with STEP 4 (Schema Changes)?
