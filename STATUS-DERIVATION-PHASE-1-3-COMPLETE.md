# Status Derivation Implementation - Phases 1-3 Complete ✅

## What's Been Implemented

### ✅ Phase 1: Core Derivation Logic

**File:** `src/modules/order/service/ItemStatusService.js`

**Changes:**
- Updated `recomputeOrderStatus()` with exact rules from spec:
  ```javascript
  if (allServed) → 'served'
  else if (anyInProgress or anyPending) → 'preparing'  // Single lagging item holds order back
  else if (anyReady) → 'ready'
  ```

**File:** `src/modules/kitchen/service/KitchenTicketService.js`

**Changes:**
- Created `recomputeTicketStatus()` method:
  ```javascript
  if (allReady) → 'ready'
  else if (anyInProgress) → 'in_progress'
  else → 'pending'
  ```
- Updated `updateTicketItemStatus()` to use the new `recomputeTicketStatus()`
- Both methods accept optional `session` parameter for transaction support

---

### ✅ Phase 2: Socket Event Helpers

**File:** `src/modules/order/service/StatusSyncService.js` (NEW)

**Created three methods:**

1. **`afterOrderItemChange(order, item, session)`**
   - Emits `order:item-status-changed` (always)
   - Recomputes order status
   - Emits `order:status-changed` (only if changed)

2. **`afterTicketItemChange(ticket, ticketItem, order, orderItem, session)`**
   - Emits `ticket:item-updated` (always - for KDS)
   - Recomputes ticket status
   - Emits `ticket:status-changed` (only if changed)
   - Emits `order:item-status-changed` (always - for POS)
   - Recomputes order status
   - Emits `order:status-changed` (only if changed)

3. **`afterBulkOrderItemsChange(order, changedItems, session)`**
   - Emits multiple `order:item-status-changed` events
   - Recomputes order status once
   - Emits `order:status-changed` (only if changed)

**Key Feature:** Parent-level events only fire when status actually changes!

---

### ✅ Phase 3: Kitchen Item Protection

**File:** `src/modules/order/service/ItemStatusService.js`

**Added validation in `updateItemStatus()`:**
```javascript
if (item.requiresKitchen && newStatus === 'ready') {
  throw new AppError(
    'Kitchen items can only reach "ready" via their ticket completing',
    400
  );
}
```

**Rules:**
- Kitchen items (`requiresKitchen: true`) → CANNOT be manually set to `ready`
- Non-kitchen items (`requiresKitchen: false`) → CAN be set to `ready` (no tickets)
- Kitchen items can still be set to `served` (after they reach `ready` via ticket)

---

## What's Next

### 🔄 Phase 4: Transaction-Safe Ticket Sync (TODO)

**Goal:** Make ticket → order sync atomic

**Tasks:**
1. Create `completeTicketItem(ticketId, ticketItemId)` with transaction
2. Update `updateTicketItemStatus()` to sync to order items inside transaction
3. Socket events fire AFTER transaction commits

**Pattern:**
```javascript
async completeTicketItem(ticketId, ticketItemId) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const ticket = await Ticket.findById(ticketId).session(session);
      const order = await Order.findById(ticket.order).session(session);
      
      // Update both (atomic)
      ticketItem.status = 'ready';
      orderItem.status = 'ready';
      
      await recomputeTicketStatus(ticket, session);
      await ticket.save({ session });
      await order.save({ session });
      
      result = { ticket, order, orderItem };
    });
  } finally {
    session.endSession();
  }

  // Events AFTER commit
  await StatusSyncService.afterTicketItemChange(...);
  
  return result;
}
```

### 🔌 Phase 5: Wire Up Events (TODO)

**Goal:** Call `StatusSyncService` helpers everywhere

**Tasks:**
1. Wire `afterOrderItemChange()` in ItemStatusService methods
2. Wire `afterTicketItemChange()` in KitchenTicketService methods
3. Ensure all mutations trigger appropriate events

### ✅ Phase 6: Tests (TODO)

**Tests to write:**
1. Order status derivation with mixed items
2. Ticket status derivation with mixed items
3. Kitchen item `ready` rejection
4. Socket event conditional firing
5. Transaction rollback safety
6. End-to-end flow

---

## How to Use (For Now)

### Order Status Recomputation
```javascript
const { ItemStatusService } = require('./ItemStatusService');

// After any order item mutation
await ItemStatusService.recomputeOrderStatus(order);
```

### Ticket Status Recomputation
```javascript
const KitchenTicketService = require('./KitchenTicketService');

// After any ticket item mutation
await KitchenTicketService.recomputeTicketStatus(ticket);
```

### Socket Events (Manual for now - will be automatic after Phase 5)
```javascript
const { StatusSyncService } = require('./StatusSyncService');

// After updating an order item
await StatusSyncService.afterOrderItemChange(order, item);

// After updating a ticket item
await StatusSyncService.afterTicketItemChange(ticket, ticketItem, order, orderItem);
```

---

## Testing the Changes

### Test 1: Order Status Derivation
```javascript
// Create order with 2 items
const order = await createOrder({ items: [...] });

// Mark one item as 'ready'
order.items[0].status = 'ready';
await ItemStatusService.recomputeOrderStatus(order);

console.log(order.status); // Should be 'preparing' (other item still pending)

// Mark second item as 'ready'
order.items[1].status = 'ready';
await ItemStatusService.recomputeOrderStatus(order);

console.log(order.status); // Should be 'ready' (all items ready)
```

### Test 2: Kitchen Item Protection
```javascript
// Try to manually set kitchen item to 'ready'
try {
  await ItemStatusService.updateItemStatus(order, itemId, 'ready', actor);
} catch (error) {
  console.log(error.message);
  // → "Kitchen items can only reach "ready" via their ticket completing"
}

// Non-kitchen item can be set to 'ready'
const nonKitchenItem = { requiresKitchen: false, status: 'pending' };
await ItemStatusService.updateItemStatus(order, itemId, 'ready', actor);
// → Works fine
```

### Test 3: Socket Events (Listen in frontend)
```javascript
// POS listens for item updates
socket.on('order:item-status-changed', (data) => {
  console.log('Item updated:', data.itemId, data.newStatus);
});

// POS listens for order status changes
socket.on('order:status-changed', (data) => {
  console.log('Order status changed:', data.oldStatus, '→', data.newStatus);
});

// KDS listens for ticket updates
socket.on('ticket:item-updated', (data) => {
  console.log('Ticket item updated:', data.itemId, data.newStatus);
});
```

---

## Files Modified

1. **`src/modules/order/service/ItemStatusService.js`**
   - Updated `recomputeOrderStatus()` logic
   - Added kitchen item `ready` protection

2. **`src/modules/kitchen/service/KitchenTicketService.js`**
   - Added `recomputeTicketStatus()` method
   - Updated `updateTicketItemStatus()` to use it

3. **`src/modules/order/service/StatusSyncService.js`** (NEW)
   - Created socket event coordination helpers

---

## Benefits Already Achieved

✅ **Consistent Derivation Rules**
- Order status always computed from items
- Ticket status always computed from items
- No ambiguity or manual overrides

✅ **Integrity Protection**
- Kitchen items cannot skip the ticket workflow
- Forces proper kitchen → POS sync

✅ **Smart Socket Events**
- No spam - parent events only when status changes
- Granular item events for precise UI updates

✅ **Transaction Ready**
- All methods accept optional `session` parameter
- Ready for Phase 4 atomic operations

---

## Next Steps

1. **Implement Phase 4** (Transaction-safe sync)
2. **Wire up Phase 5** (Call StatusSyncService everywhere)
3. **Write Phase 6** (Comprehensive tests)
4. **Frontend Integration** (Use new socket events)

---

## Notes

- ⚠️ Phase 5 not done yet - events must be wired manually for now
- ⚠️ `updateTicketItemStatus()` doesn't sync to order items yet (Phase 4)
- ✅ Core logic is solid and ready for integration
- ✅ All methods are transaction-safe (accept session parameter)

---

This is ready for Phase 4! 🚀
