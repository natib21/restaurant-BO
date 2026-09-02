# Payment-Completion Guard & Ticket Completion Sync - CORRECTED Implementation Guide

## Validation Complete ✅

### Confirmed Facts:
1. ✅ `ItemStatusService.recomputeOrderStatus()` **DOES** set `order.status = 'served'` when all items served (line 355-357)
2. ✅ Item status handlers **DO** call `recomputeOrderStatus()` after updates (line 56 item-status.handler.js)
3. ✅ Ticket parent schema **HAS** `'completed'` status (line 102 KitchenTicket.js)
4. ❌ Ticket item schema **MISSING** `'completed'` status (line 34 KitchenTicket.js)
5. ✅ Outbox pattern confirmed in use (logs show `outbox.event.claimed`, `outbox.event.emit.success`)

**Conclusion:** Original Part A guard works as-is. No "ready → served" endpoint needed. Item derivation already handles it.

---

## Part A: Payment-Completion Guard

### Schema: No changes needed ✅

### Code Changes

#### 1. Fix `OrderService.markAsPaid()` - Payment Guard + Table Cleanup Threading

**File:** `src/modules/order/service/OrderService.js`  
**Lines:** ~624-720 (markAsPaid method)

```javascript
static async markAsPaid(req) {
  const { id } = req.params;
  const { paymentMethod, bankName, image } = req.body;

  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {
      order = await OrderRepository.findOne(merchantScopedQuery({ _id: id }, req)).session(
        session
      );

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      if (order.paymentStatus === 'paid') {
        throw new AppError('Order already paid', 400);
      }

      if (order.status === 'canceled') {
        throw new AppError('Cannot mark a canceled order as paid', 400);
      }

      // ✅ GUARD: Dine-in orders must have all items served before payment completes them
      if (order.orderType === 'dine_in' && order.status !== 'served') {
        throw new AppError(
          'Cannot complete a dine-in order before all items have been served',
          400
        );
      }

      // Update payment fields
      order.paymentStatus = 'paid';
      order.paidAt = new Date();

      order.paymentDetails = {
        method: paymentMethod || 'cash',
        bankName: bankName || null,
        paidAt: new Date(),
        receiptImage: image || null,
      };

      await order.save({ session });

      // ✅ COMPLETION LOGIC: Only complete if not already completed
      // For dine-in: guard above ensures status === 'served', so this always succeeds
      // For takeaway/delivery: payment does NOT complete the order (stays in current status)
      if (order.status !== 'completed') {
        // Only dine-in orders reach here (takeaway/delivery require separate pickup/delivery completion)
        if (order.orderType === 'dine_in') {
          order.status = 'completed';
          order.completedAt = new Date();
          await order.save({ session });

          // ✅ TABLE CLEANUP: Only runs when order actually completes
          if (order.table) {
            await CustomerSession.updateOne(
              merchantScopedQuery({ tableId: order.table, isActive: true }, req),
              { isActive: false },
              { session }
            );

            const table = await Table.findOne(
              merchantScopedQuery({ _id: order.table }, req)
            ).session(session);

            if (table) {
              table.status = 'available';
              await table.save({ session });
            }
          }
        }
        // else: takeaway/delivery payment does NOT complete order - separate endpoint needed
      }

      // Loyalty points (unchanged)
      if (req.customer) {
        const points = Math.floor(order.totalAmount);
        const customerId = req.customer._id;

        await Customer.findByIdAndUpdate(
          customerId,
          {
            $inc: {
              'loyalty.points': points,
              'loyalty.totalPointsEarned': points,
            },
            $push: {
              history: {
                action: 'award_points',
                details: `Earned ${points} points from order ${order.orderNumber} (${paymentMethod || 'cash'})`,
                order: order._id,
                addedAt: new Date(),
              },
            },
          },
          { session, new: true }
        );

        const updatedCustomer = await Customer.findById(customerId)
          .select('loyalty.totalPointsEarned loyalty.tier')
          .session(session)
          .lean();

        const tiers = {
          platinum: 50000,
          gold: 20000,
          silver: 5000,
          bronze: 0,
        };

        const newTier = Object.keys(tiers).find(
          tier => updatedCustomer.loyalty.totalPointsEarned >= tiers[tier]
        );

        if (newTier && newTier !== updatedCustomer.loyalty.tier) {
          await Customer.findByIdAndUpdate(
            customerId,
            { $set: { 'loyalty.tier': newTier } },
            { session }
          );
        }
      }

      // Notifications (unchanged)
      await NotificationService.notifyOrderPaid(
        { order, paymentMethod, bankName, image },
        session
      );
    });

    return order;
  } finally {
    await session.endSession();
  }
}
```

**Key Changes:**
1. ✅ Added dine-in guard checking `order.status !== 'served'`
2. ✅ Threaded table cleanup to only run when order actually completes
3. ✅ Takeaway/delivery payment does NOT complete order (separate endpoint needed later)

#### 2. Add Takeaway/Delivery Completion Endpoints (Future Work)

**Note:** Not part of this pass, but document the need:

```javascript
// Future: PATCH /api/v1/orders/:id/pickup (takeaway)
// Future: PATCH /api/v1/orders/:id/deliver (delivery)
// Both should:
// - Validate paymentStatus === 'paid' (or allow pay-on-pickup if configured)
// - Validate order.status === 'ready'
// - Transition to completed
```

---

## Part B: Ticket Completion & Reverse Sync

### Schema Changes

#### 1. Add `completed` status to ticket item enum

**File:** `models/KitchenTicket.js`  
**Line:** 34

```javascript
// BEFORE:
status: {
  type: String,
  enum: ['pending', 'in_progress', 'ready'],
  default: 'pending',
},

// AFTER:
status: {
  type: String,
  enum: ['pending', 'in_progress', 'ready', 'completed'],  // ✅ ADD 'completed'
  default: 'pending',
},
completedServingAt: {  // ✅ ADD NEW FIELD
  type: Date,
  default: null,
},
```

### Code Changes

#### 2. Extend `StatusSyncService` with Reverse Sync (Order → Ticket)

**File:** `src/modules/order/service/StatusSyncService.js`

**Add new method to existing service (DO NOT create new file):**

```javascript
/**
 * Sync order item 'served' status back to linked ticket item
 * Called after item status update, inside transaction
 * 
 * @param {Order} order - Mongoose order document
 * @param {ObjectId} orderItemId - ID of the served item
 * @param {Session} session - Mongoose session
 */
static async syncTicketItemCompletion(order, orderItemId, session) {
  const orderItem = order.items.id(orderItemId);
  
  // Only sync if item requires kitchen and is now served
  if (!orderItem || !orderItem.requiresKitchen || orderItem.status !== 'served') {
    return;
  }

  const KitchenTicket = require('../../../../models/KitchenTicket');
  
  const ticket = await KitchenTicket.findOne({
    order: order._id,
    'items.orderItemId': orderItemId,
  }).session(session);

  if (!ticket) {
    // Item might not have a ticket (e.g., manually added after order creation)
    return;
  }

  const ticketItem = ticket.items.find(
    ti => ti.orderItemId.toString() === orderItemId.toString()
  );

  if (!ticketItem) {
    return;
  }

  // Mark ticket item as completed
  const previousTicketItemStatus = ticketItem.status;
  ticketItem.status = 'completed';
  ticketItem.completedServingAt = new Date();

  // Recompute ticket-level status
  await StatusSyncService._recomputeTicketStatus(ticket, session);
  
  await ticket.save({ session });

  logger.info('status-sync.ticket-item-completed', {
    orderId: order._id.toString(),
    orderItemId: orderItemId.toString(),
    ticketId: ticket._id.toString(),
    previousTicketItemStatus,
  });
}

/**
 * Recompute ticket status from ticket items
 * Same "single lagging item" derivation principle used for orders
 * 
 * @param {KitchenTicket} ticket - Mongoose ticket document
 * @param {Session} session - Mongoose session
 * @private
 */
static async _recomputeTicketStatus(ticket, session) {
  const items = ticket.items;

  const allCompleted = items.every(i => i.status === 'completed');
  const allReady = items.every(i => i.status === 'ready' || i.status === 'completed');
  const anyInProgress = items.some(i => i.status === 'in_progress');

  const previousStatus = ticket.status;
  let newStatus;

  if (allCompleted) {
    newStatus = 'completed';
    if (!ticket.completedAt) {
      ticket.completedAt = new Date();
    }
  } else if (allReady) {
    newStatus = 'ready';
  } else if (anyInProgress) {
    newStatus = 'in_progress';
  } else {
    newStatus = 'pending';
  }

  ticket.status = newStatus;

  // ✅ Queue outbox event if ticket just became completed (real-time update)
  if (previousStatus !== 'completed' && newStatus === 'completed') {
    const OutboxEvent = require('../../../../models/OutboxEvent');
    
    await OutboxEvent.create([{
      merchant: ticket.merchant,
      eventType: 'ticket:completed',
      payload: {
        ticketId: ticket._id.toString(),
        stationId: ticket.station.toString(),
        orderId: ticket.order.toString(),
        orderNumber: ticket.orderNumber,
        previousStatus,
        newStatus: 'completed',
      },
      status: 'pending',
    }], { session });

    logger.info('status-sync.ticket-completed-event-queued', {
      ticketId: ticket._id.toString(),
      previousStatus,
      newStatus: 'completed',
    });
  }
}
```

#### 3. Update Item Status Handler to Call Reverse Sync

**File:** `src/modules/order/controller/handlers/item-status.handler.js`  
**Line:** ~56 (after `recomputeOrderStatus` call)

```javascript
// Inside updateItemStatus, after recomputeOrderStatus:

await session.withTransaction(async () => {
  const order = await Order.findById(orderId).session(session);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  // Update item status
  result = await ItemStatusService.updateItemStatus(
    order,
    itemId,
    newStatus,
    req.user,
    session
  );

  // Recompute order status
  await ItemStatusService.recomputeOrderStatus(order, session);

  // ✅ NEW: Reverse sync to ticket if item was served
  if (newStatus === 'served' && !result.noop) {
    await StatusSyncService.syncTicketItemCompletion(order, itemId, session);
  }
});
```

**Similarly for `serveReadyItems` (bulk serve):**

```javascript
// Inside serveReadyItems, after recomputeOrderStatus:

await session.withTransaction(async () => {
  const order = await Order.findById(orderId).session(session);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  // Serve all ready items
  result = await ItemStatusService.serveReadyItems(order, req.user, session);

  // Recompute order status
  await ItemStatusService.recomputeOrderStatus(order, session);

  // ✅ NEW: Reverse sync all served items to their tickets
  if (result.servedItems && result.servedItems.length > 0) {
    for (const servedItem of result.servedItems) {
      await StatusSyncService.syncTicketItemCompletion(order, servedItem._id, session);
    }
  }
});
```

#### 4. Create Outbox Handler for Ticket Completion Event

**File:** `src/infrastructure/outbox/handlers/ticket-completed-handler.js` (NEW FILE)

```javascript
// src/infrastructure/outbox/handlers/ticket-completed-handler.js

const logger = require('../../../utils/logger');

/**
 * Handle ticket:completed event
 * Emits Socket.IO event to remove ticket from active KDS board
 */
async function handleTicketCompleted(event) {
  const { ticketId, stationId, orderId, orderNumber, previousStatus, newStatus } = event.payload;

  try {
    // Get Socket.IO instance
    const io = require('../../../socket').getIO();

    // Emit to station room
    io.to(`station:${stationId}`).emit('ticket:completed', {
      ticketId,
      stationId,
      orderId,
      orderNumber,
      previousStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    });

    logger.info('ticket-completed.handler.success', {
      ticketId,
      stationId,
    });

    return { success: true };
  } catch (error) {
    logger.error('ticket-completed.handler.failed', {
      ticketId,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
}

module.exports = { handleTicketCompleted };
```

#### 5. Register Handler in Outbox Worker

**File:** `src/infrastructure/outbox/outbox-worker.js`

Add to handler registry:

```javascript
const { handleTicketCompleted } = require('./handlers/ticket-completed-handler');

const EVENT_HANDLERS = {
  'order:preparing': handleOrderPreparing,
  'kitchen:all_tickets_ready': handleOrderReady,
  'ticket:completed': handleTicketCompleted,  // ✅ ADD THIS
  // ... other handlers
};
```

#### 6. Update KDS Controller - Active Board vs History

**File:** `src/modules/kitchen/controllers/kitchen.controller.js`

Update `getStationTickets` to filter out completed tickets:

```javascript
exports.getStationTickets = catchAsync(async (req, res) => {
  const { stationId } = req.params;
  const { includeCompleted = 'false' } = req.query;  // ✅ NEW query param

  const query = {
    station: stationId,
    merchant: req.user.merchant,
  };

  // ✅ Active board: exclude completed tickets by default
  if (includeCompleted !== 'true') {
    query.status = { $ne: 'completed' };
  }

  const tickets = await KitchenTicket.find(query)
    .populate('order', 'orderNumber orderType tableNumber')
    .sort({ priority: -1, createdAt: 1 })
    .lean();

  res.status(200).json({
    status: 'success',
    results: tickets.length,
    data: { tickets },
  });
});
```

**Add history endpoint:**

```javascript
exports.getTicketHistory = catchAsync(async (req, res) => {
  const { stationId, startDate, endDate } = req.query;

  const query = {
    merchant: req.user.merchant,
    status: 'completed',  // ✅ Only completed tickets
  };

  if (stationId) {
    query.station = stationId;
  }

  if (startDate || endDate) {
    query.completedAt = {};
    if (startDate) query.completedAt.$gte = new Date(startDate);
    if (endDate) query.completedAt.$lte = new Date(endDate);
  }

  const tickets = await KitchenTicket.find(query)
    .populate('order', 'orderNumber orderType tableNumber')
    .populate('station', 'name')
    .sort({ completedAt: -1 })
    .limit(100)  // Paginate in production
    .lean();

  res.status(200).json({
    status: 'success',
    results: tickets.length,
    data: { tickets },
  });
});
```

**Add route:**

```javascript
// In kitchen.routes.js
router.get('/tickets/history', protect, getTicketHistory);
```

---

## Testing Checklist

### Part A Tests

```javascript
describe('Payment Completion Guard', () => {
  it('should reject payment on dine-in order with unserved items', async () => {
    // Order with items still in 'ready' status
    // Attempt markAsPaid
    // Expect 400 error
  });

  it('should complete dine-in order when all items served', async () => {
    // Order with all items 'served'
    // Call markAsPaid
    // Expect order.status === 'completed'
    // Expect table.status === 'available'
  });

  it('should accept payment on takeaway order without completing it', async () => {
    // Takeaway order with items still 'preparing'
    // Call markAsPaid
    // Expect paymentStatus === 'paid'
    // Expect order.status !== 'completed' (stays in preparing)
  });

  it('should not free table until order actually completes', async () => {
    // Dine-in order, items still preparing
    // Attempt markAsPaid → should fail
    // Verify table.status still 'occupied'
  });
});
```

### Part B Tests

```javascript
describe('Ticket Completion Sync', () => {
  it('should mark ticket item completed when order item served', async () => {
    // Order item with requiresKitchen: true
    // Update item status to 'served'
    // Verify linked ticket item status === 'completed'
  });

  it('should keep ticket ready until ALL items served', async () => {
    // Ticket with 2 items
    // Serve 1 item
    // Verify ticket.status === 'ready' (not 'completed')
    // Serve 2nd item
    // Verify ticket.status === 'completed'
  });

  it('should queue outbox event when ticket becomes completed', async () => {
    // Serve all items in ticket
    // Verify OutboxEvent created with eventType: 'ticket:completed'
  });

  it('should exclude completed tickets from active board query', async () => {
    // Create ticket, serve all items
    // Query GET /kitchen/stations/:id/tickets
    // Verify completed ticket not in results
    // Query with ?includeCompleted=true
    // Verify completed ticket IS in results
  });

  it('should handle non-kitchen items gracefully', async () => {
    // Order item with requiresKitchen: false
    // Serve item
    // Verify no error (no ticket to sync)
  });

  it('should rollback both order and ticket if transaction fails', async () => {
    // Mock ticket.save() to throw error
    // Attempt to serve item
    // Verify order item status unchanged
    // Verify ticket item status unchanged
  });
});
```

---

## Summary

**Part A Changes:**
- ✅ 1 guard added to `markAsPaid()`
- ✅ Table cleanup threaded correctly
- ✅ No schema changes
- ✅ No new files

**Part B Changes:**
- ✅ 1 schema change (ticket item status enum)
- ✅ 2 methods added to existing `StatusSyncService`
- ✅ 2 handler updates (updateItemStatus, serveReadyItems)
- ✅ 1 new outbox handler
- ✅ 1 controller update (active board filter)
- ✅ 1 new history endpoint

**Validation Confirmed:**
- ✅ `recomputeOrderStatus` already handles 'served' status derivation
- ✅ No separate "serve order" endpoint needed
- ✅ Outbox pattern maintained for Socket.IO
- ✅ Existing services extended, not duplicated

**Estimated Effort:**
- Part A: 1-2 hours (simple guard + table threading)
- Part B: 3-4 hours (schema + sync logic + handler + tests)
- Total: 4-6 hours

**Risk:** LOW - Builds on proven patterns, no architectural changes
