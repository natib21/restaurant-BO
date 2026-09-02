# Phase 5: Socket Event Wiring - Complete Implementation Plan

## Current State (Before Phase 5)
- ✅ StatusSyncService methods defined and tested (Phase 1-3)
- ✅ Transaction-safe with rollback proven (Phase 4)
- ❌ **StatusSyncService methods NEVER CALLED in production** - dead code
- ❌ Socket events don't fire on item/order mutations
- ❌ Frontend gets no real-time updates

## Goal
Wire StatusSyncService calls into EVERY item/order mutation so:
1. Socket events emit at correct times (item-level always, parent-level only on change)
2. Order status derived from children (via recomputeOrderStatus)
3. Tests prove events fire with real assertions

---

## Phase 5 Implementation: 3 Main Tasks

### Task 1: Wire item-status.handler.js (3 endpoints)

**File:** `src/modules/order/controller/handlers/item-status.handler.js`

Each endpoint mutates items inside a transaction. Currently calls `recomputeOrderStatus()` directly but never calls StatusSyncService.

#### Endpoint 1: updateItemStatus (line 19-75)
- **What it does:** Manual single-item status change (pending→in_progress, in_progress→ready, ready→served)
- **Current code:** 
  ```javascript
  // Inside transaction:
  result = await ItemStatusService.updateItemStatus(order, itemId, newStatus, req.user, session);
  await ItemStatusService.recomputeOrderStatus(order, session);  // Direct call
  ```
- **What's missing:** StatusSyncService call to emit events
- **Fix:**
  ```javascript
  // After transaction, before response:
  await StatusSyncService.afterOrderItemChange(order, result.item, session);
  ```
- **Why:** Emits `order:item-status-changed` and `order:status-changed` (if changed)

#### Endpoint 2: serveReadyItems (line 76-118)
- **What it does:** Bulk serve all ready items (waiter picks up multiple dishes)
- **Current code:**
  ```javascript
  result = await ItemStatusService.serveReadyItems(order, req.user, session);
  await ItemStatusService.recomputeOrderStatus(order, session);  // Direct call
  ```
- **What's missing:** Bulk event coordination
- **Fix:**
  ```javascript
  // After transaction:
  await StatusSyncService.afterBulkOrderItemsChange(order, result.servedItems, session);
  ```
- **Why:** Emits multiple `order:item-status-changed` (one per item) + single `order:status-changed` (if order moved to ready/served)

#### Endpoint 3: voidItem (line 119-171)
- **What it does:** Void an item with required reason (staff removes item from order)
- **Current code:**
  ```javascript
  voidResult = await ItemStatusService.voidItem(order, itemId, reason, req.user, session);
  await ItemStatusService.recomputeOrderStatus(order, session);  // Direct call
  ```
- **What's missing:** StatusSyncService call
- **Fix:**
  ```javascript
  // After transaction:
  await StatusSyncService.afterOrderItemChange(order, voidResult.item, session);
  ```
- **Why:** Emits item-level and order-level events

---

### Task 2: Wire KitchenTicketService (2 methods)

**File:** `src/modules/kitchen/service/KitchenTicketService.js`

Kitchen staff mark ticket items as started/ready. Currently emits socket.io directly, bypassing StatusSyncService coordination.

#### Method 1: updateTicketItemStatus (line 1062-1140)
- **What it does:** Kitchen staff marks ticket item as in_progress or ready
- **Current code:**
  ```javascript
  item.status = newStatus;
  await this.recomputeTicketStatus(ticket, session);
  await ticket.save({ session });
  
  // WRONG: Direct socket emit
  getIo().to(`kitchen:${ticket.branch}`).emit('ticket:item-updated', { ... });
  ```
- **Problem:** 
  - Emits inside transaction (may fire before persistence confirmed)
  - Doesn't sync to order or emit order-level events
  - Hardcoded socket.io logic instead of using StatusSyncService
- **Fix:**
  ```javascript
  // Inside transaction (unchanged):
  item.status = newStatus;
  await this.recomputeTicketStatus(ticket, session);
  await ticket.save({ session });
  
  // After transaction.endSession():
  // 1. Sync ticket item to order item
  await this._syncTicketItemToOrder(ticket, item, newStatus, session);
  
  // 2. Emit via StatusSyncService (coordinates ticket + order events)
  await StatusSyncService.afterTicketItemChange(
    ticket, 
    item,
    order,
    orderItem,
    session
  );
  ```
- **Why:** Ensures both ticket and order events fire coordinated

#### Method 2: _syncTicketItemToOrder (line 1165-1230)
- **What it does:** When ticket item changes, update corresponding order item
- **Current code:**
  ```javascript
  orderItem.status = newStatus;
  await ItemStatusService.recomputeOrderStatus(order, session);
  await order.save({ session });
  // NO StatusSyncService call
  ```
- **Fix:**
  ```javascript
  // After order.save():
  await StatusSyncService.afterTicketItemChange(
    ticket,
    ticketItem,
    order,
    orderItem,
    session
  );
  ```
- **Why:** Ensures order-level events emit when order changes due to ticket update

---

### Task 3: Handle Kitchen Controller Integration

**File:** `src/modules/kitchen/controllers/kitchen.controller.js` (line ~343)

The route handler calls `KitchenTicketService.updateTicketItemStatus()`. Need to ensure events fire after transaction completes.

- **Current:** Calls service method inside transaction
- **Fix:** Let service method handle StatusSyncService internally (Task 2 above does this)

---

## AutoServe Edge Case (OrderStateMachineService)

**File:** `src/modules/order/service/OrderStateMachineService.js` (line 801)

When order transitions from pending→accepted, automatically serves non-kitchen items (beverages, sides).

- **Current:** Calls `ItemStatusService.autoServeNonCookedItems()` but no events
- **Fix:** After state machine transaction, emit:
  ```javascript
  const autoServedResult = await ItemStatusService.autoServeNonCookedItems(order, session);
  if (autoServedResult.servedItems?.length > 0) {
    await StatusSyncService.afterBulkOrderItemsChange(order, autoServedResult.servedItems, session);
  }
  ```

---

## Event Coordination Rules (Enforce in Tests)

### Rule 1: Item-Level Events (ALWAYS emit)
Every mutation that changes `item.status` emits `order:item-status-changed` with:
- orderId, itemId, oldStatus, newStatus, timestamp

**Test:** Each item change → 1 item event

### Rule 2: Parent-Level Events (ONLY if status changes)
After item mutation, if `order.status` changed, emit `order:status-changed` with:
- orderId, oldStatus, newStatus, timestamp

**Test:** Order status changed → parent event fires. Order status unchanged → no parent event

### Rule 3: Bulk Operations (One parent event per batch)
Multiple items changed in one operation → emit multiple item events BUT only ONE parent event

**Test:** serveReadyItems(3 items) → 3 item events + 1 order event (not 4 total)

### Rule 4: Ticket Mutations (Both ticket AND order events)
When ticket item changes:
1. Emit `ticket:item-status-changed` (ticket-level)
2. Sync to order item
3. Emit `order:item-status-changed` (order-level)
4. Recompute order status
5. If order changed, emit `order:status-changed`

**Test:** Ticket item marked ready → ticket event + order item event + order status event (if order moved)

---

## Test Coverage (What Phase 5 Tests Must Prove)

### Test File: `tests/PHASE-5-SOCKET-EVENTS.test.js`

| Test | What it verifies | Key assertion |
|---|---|---|
| Item status change emits event | Single item mutation → socket event fires | `io.emit` called with correct payload |
| Bulk operation single parent event | Multiple items in one call → one parent event | Emit count = (item count + 1) or (item count) if no parent change |
| Ticket mutation syncs to order | Ticket item ready → order item becomes ready | Both `order:item-status-changed` and `ticket:item-status-changed` fire |
| Order status derives from children | All items ready → order.status becomes 'ready' | `order:status-changed` emitted, order.status = 'ready' |
| No event on no-op | Item already has target status → no event | `io.emit` not called |
| Rollback → no events | Error in transaction → state rolls back + no events | Verify item status unchanged AND no emit calls |

---

## Phase 5 Implementation Order

1. ✅ **Identify all mutations** (context-gatherer completed)
2. **Implement item-status.handler.js wiring** (add 3 StatusSyncService calls)
3. **Implement KitchenTicketService wiring** (modify updateTicketItemStatus + _syncTicketItemToOrder)
4. **Add OrderStateMachineService auto-serve handling** (emit after auto-serve)
5. **Write Phase 5 tests** (prove events fire with real assertions, no stubs)
6. **Run all tests** (Phase 1-5 + Phase 4 atomicity + Phase 5 events)
7. **Verify no regressions** (existing functionality still works)

---

## Success Criteria

Phase 5 is done when:
- ✅ All 3 item-status.handler endpoints call StatusSyncService
- ✅ KitchenTicketService updateTicketItemStatus uses StatusSyncService (not direct socket.io)
- ✅ All _syncTicketItemToOrder calls emit events
- ✅ All 6+ socket event tests pass with real assertions
- ✅ No "stubs passed" - every test verifies actual socket.io emit() calls
- ✅ Existing Phase 1-4 tests still pass

---

## Files Modified in Phase 5

| File | Lines | Change |
|---|---|---|
| `src/modules/order/controller/handlers/item-status.handler.js` | 45, 100, 159 | Add StatusSyncService.afterOrderItemChange() or afterBulkOrderItemsChange() |
| `src/modules/kitchen/service/KitchenTicketService.js` | 1125, 1227 | Replace direct socket.io emit, add StatusSyncService calls |
| `src/modules/order/service/OrderStateMachineService.js` | ~810 | Add after-transaction StatusSyncService call for auto-serve |
| `tests/PHASE-5-SOCKET-EVENTS.test.js` | (new) | Comprehensive event tests |

