# Status Derivation & Real-Time Sync - Implementation Plan

## Overview
Implement the "parent status derived from children" principle consistently across Order and Ticket hierarchies with proper transaction safety and real-time socket events.

---

## Core Principle
```
Order status  ← derived from → Order item statuses
Ticket status ← derived from → Ticket item statuses
```

A parent's status is **never set directly**, always computed from children.

---

## Implementation Phases

### Phase 1: Core Derivation Logic ✅
**Files:**
- `src/modules/order/service/ItemStatusService.js`
- `src/modules/kitchen/service/KitchenTicketService.js`

**Tasks:**
1. ✅ Update `recomputeOrderStatus(order, session?)` with exact rules
2. ✅ Update `recomputeTicketStatus(ticket, session?)` with exact rules
3. ✅ Both must accept optional `session` parameter for transaction support

**Rules:**
```javascript
// Order status derivation
const items = order.items.filter(i => i.status !== 'void');
if (allServed) → 'served'
else if (anyPending or anyInProgress) → 'preparing'
else if (anyReady) → 'ready'

// Ticket status derivation
if (allReady) → 'ready'
else if (anyInProgress) → 'in_progress'
else → 'pending'
```

---

### Phase 2: Socket Event Helpers ✅
**Files:**
- `src/modules/order/service/StatusSyncService.js` (NEW)

**Tasks:**
1. ✅ Create `StatusSyncService.afterOrderItemChange(order, item)`
2. ✅ Create `StatusSyncService.afterTicketItemChange(ticket, ticketItem, order, orderItem)`
3. ✅ Wire up to all mutation points

**Pattern:**
```javascript
async afterOrderItemChange(order, item) {
  // 1. Item-level event (always)
  io.emit('order:item-status-changed', { orderId, itemId, newStatus });
  
  // 2. Recompute parent
  const oldStatus = order.status;
  await recomputeOrderStatus(order);
  
  // 3. Parent-level event (only if changed)
  if (order.status !== oldStatus) {
    io.emit('order:status-changed', { orderId, oldStatus, newStatus });
  }
}
```

---

### Phase 3: Kitchen Item Protection ✅
**Files:**
- `src/modules/order/service/ItemStatusService.js`
- `src/modules/order/controller/handlers/item-status.handler.js`

**Tasks:**
1. ✅ Add validation: reject `ready` on `requiresKitchen: true` items
2. ✅ Allow `ready` on `requiresKitchen: false` items (no tickets)
3. ✅ Update error messages

**Validation:**
```javascript
if (item.requiresKitchen && newStatus === 'ready') {
  throw new AppError(
    'Kitchen items can only reach "ready" via their ticket completing',
    400
  );
}
```

---

### Phase 4: Transaction-Safe Ticket Sync ✅
**Files:**
- `src/modules/kitchen/service/KitchenTicketService.js`

**Tasks:**
1. ✅ Create `completeTicketItem(ticketId, ticketItemId)` with transaction
2. ✅ Update `updateTicketItemStatus()` to use transactions
3. ✅ Ensure ticket → order sync is atomic
4. ✅ Socket events fire AFTER transaction commits

**Pattern:**
```javascript
async completeTicketItem(ticketId, ticketItemId) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      // Load with session
      const ticket = await Ticket.findById(ticketId).session(session);
      const order = await Order.findById(ticket.order).session(session);
      
      // Update both
      ticketItem.status = 'ready';
      orderItem.status = 'ready';
      
      // Recompute (pass session!)
      await recomputeTicketStatus(ticket, session);
      
      // Save both (atomic)
      await ticket.save({ session });
      await order.save({ session });
      
      result = { ticket, order, orderItem };
    });
  } finally {
    session.endSession();
  }

  // Socket events AFTER commit
  await afterItemStatusChange(result.order, result.orderItem);
  
  return result;
}
```

---

### Phase 5: Wire Up Events ✅
**Files:**
- `src/modules/order/service/ItemStatusService.js`
- `src/modules/kitchen/service/KitchenTicketService.js`

**Tasks:**
1. ✅ Call `StatusSyncService.afterOrderItemChange()` in:
   - `updateItemStatus()`
   - `autoServeNonCookedItems()`
   - `serveReadyItems()`
   - `voidItem()`

2. ✅ Call `StatusSyncService.afterTicketItemChange()` in:
   - `updateTicketItemStatus()`
   - `completeTicketItem()`

---

### Phase 6: Tests ✅
**Files:**
- `tests/status-derivation.test.js` (NEW)
- `tests/status-sync-sockets.test.js` (NEW)
- `tests/ticket-order-transaction.test.js` (NEW)

**Test Cases:**
1. ✅ Order with mixed statuses derives correct order status
2. ✅ Ticket with mixed items derives correct ticket status
3. ✅ Kitchen item `ready` rejected via manual endpoint
4. ✅ Non-kitchen item `ready` allowed
5. ✅ Socket events: item-level always, parent-level conditional
6. ✅ Transaction rollback on error (ticket/order consistency)
7. ✅ Individual item updates visible before ticket completes

---

## File Structure

```
src/modules/order/
├── service/
│   ├── ItemStatusService.js          # Updated: recomputeOrderStatus
│   ├── StatusSyncService.js          # NEW: Socket event helpers
│   └── OrderStateMachineService.js   # Updated: Use StatusSyncService

src/modules/kitchen/
├── service/
│   └── KitchenTicketService.js       # Updated: Transactions + sync

tests/
├── status-derivation.test.js         # NEW
├── status-sync-sockets.test.js       # NEW
└── ticket-order-transaction.test.js  # NEW
```

---

## Implementation Checklist

### Phase 1: Core Logic
- [ ] Update `ItemStatusService.recomputeOrderStatus()`
- [ ] Update `KitchenTicketService.recomputeTicketStatus()`
- [ ] Both accept optional `session` parameter

### Phase 2: Socket Helpers
- [ ] Create `StatusSyncService.js`
- [ ] Implement `afterOrderItemChange()`
- [ ] Implement `afterTicketItemChange()`

### Phase 3: Protection
- [ ] Add kitchen item `ready` validation
- [ ] Update error messages
- [ ] Test manual endpoint rejection

### Phase 4: Transactions
- [ ] Create `completeTicketItem()` with session
- [ ] Update `updateTicketItemStatus()` to use transactions
- [ ] Ensure atomic ticket → order sync

### Phase 5: Integration
- [ ] Wire events in ItemStatusService
- [ ] Wire events in KitchenTicketService
- [ ] Test event emission

### Phase 6: Testing
- [ ] Write derivation tests
- [ ] Write socket event tests
- [ ] Write transaction rollback tests
- [ ] Integration test full flow

---

## Success Criteria

✅ **Derivation Rules**
- Order status always computed from items
- Ticket status always computed from items
- No manual status setting

✅ **Socket Events**
- Item-level events always fire
- Parent-level events only when status changes
- No duplicate/spam events

✅ **Integrity**
- Kitchen items cannot manually reach `ready`
- Ticket → order sync is atomic
- Transaction failures rollback completely

✅ **Real-time**
- POS sees item updates immediately
- KDS sees ticket updates immediately
- No race conditions or stale data

---

## Rollout Plan

### Week 1: Foundation
- Days 1-2: Phase 1 (Core logic)
- Days 3-4: Phase 2 (Socket helpers)
- Day 5: Phase 3 (Protection)

### Week 2: Integration
- Days 1-3: Phase 4 (Transactions)
- Days 4-5: Phase 5 (Wire up events)

### Week 3: Testing
- Days 1-3: Phase 6 (Write tests)
- Days 4-5: Integration testing + bug fixes

### Week 4: Deployment
- Deploy to staging
- Frontend integration
- Production rollout

---

## Risk Mitigation

### Risk 1: Transaction Performance
**Mitigation:** Transactions only for ticket → order sync (rare operation)

### Risk 2: Socket Event Flood
**Mitigation:** Conditional parent-level events (only when status changes)

### Risk 3: Breaking Changes
**Mitigation:** Backward compatible - existing code keeps working

### Risk 4: Race Conditions
**Mitigation:** Atomic transactions prevent split-brain state

---

## Notes

- Socket events fire AFTER transaction commits (never inside)
- Recompute functions accept optional session for transaction support
- All helpers pass session through (no implicit writes)
- Pattern matches existing `AuthService.signup` transaction style

---

Ready to implement! 🚀
