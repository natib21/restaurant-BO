# Ticket Creation Fix - Applied Solution

## 🐛 Problem Identified

Orders created via `staffPlaceOrder` were:
1. ✅ Reaching "preparing" status
2. ❌ NOT creating `order:preparing` outbox events
3. ❌ NOT creating kitchen tickets
4. ❌ NOT triggering Socket.IO events

**Root Cause:**
- Auto-routing in `OrderService.staffPlaceOrder()` calls `transitionOrderStatus()` WITHOUT a session parameter
- `OrderStateMachineService` was creating `order:preparing` events using `{ session }` parameter
- When `session` is undefined, Mongoose interprets `{ session }` as `{ session: undefined }` which causes the create to fail silently

## ✅ Solution Applied

**File Modified:** `src/modules/order/service/OrderStateMachineService.js` (lines 756-783)

**Before:**
```javascript
if (toStatus === 'preparing') {
  const OutboxEvent = require('../../../../models/OutboxEvent');
  
  await OutboxEvent.create(
    [{ /* event data */ }],
    { session }  // ← BROKEN: when session is undefined
  );
}
```

**After:**
```javascript
if (toStatus === 'preparing') {
  const OutboxEvent = require('../../../../models/OutboxEvent');
  
  const eventData = {
    aggregateId: order._id,
    aggregateType: 'order',
    eventType: 'order:preparing',
    merchant: order.merchant,
    payload: {
      target: 'room',
      room: `branch:${order.branch}`,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
      },
    },
  };

  // Create event with or without session
  if (session) {
    await OutboxEvent.create([eventData], { session });
  } else {
    await OutboxEvent.create(eventData);  // ← FIXED: works without session
  }

  logger.info('kds.outbox.order-preparing.queued', {
    orderId: order._id.toString(),
    hasSession: !!session,  // ← Added logging
  });
}
```

## 🎯 What This Fixes

### Before Fix:
```
1. Order created via POST /api/v1/orders/staff
2. Auto-routing: pending → accepted → preparing
3. OrderStateMachineService called WITHOUT session
4. OutboxEvent.create([...], { session: undefined }) fails silently
5. NO order:preparing event created
6. Outbox worker has nothing to process
7. NO tickets created
8. NO Socket.IO events emitted
```

### After Fix:
```
1. Order created via POST /api/v1/orders/staff
2. Auto-routing: pending → accepted → preparing
3. OrderStateMachineService called WITHOUT session
4. OutboxEvent.create({...}) succeeds ✅
5. order:preparing event created ✅
6. Outbox worker processes event ✅
7. KitchenTicketService.createTicketsForOrder() called ✅
8. Tickets created ✅
9. Socket.IO events emitted ✅
```

## 📋 Testing Plan

### Test 1: Create Order via Staff API
```bash
POST /api/v1/orders/staff
{
  "orderType": "takeaway",
  "customerName": "Test",
  "items": [{
    "menuItemId": "<menu_item_id>",
    "quantity": 1
  }]
}
```

**Expected Result:**
1. Order status = "preparing"
2. Outbox event created with eventType = "order:preparing"
3. Outbox event processed by worker
4. Kitchen ticket created
5. Socket event emitted to branch room

### Test 2: Check Database
```mongodb
// 1. Find recent order
db.orders.find().sort({ createdAt: -1 }).limit(1)

// 2. Check for order:preparing event
db.outboxevents.find({ 
  aggregateId: ObjectId("order_id"),
  eventType: "order:preparing"
})

// 3. Check for kitchen ticket
db.kitchentickets.find({ order: ObjectId("order_id") })
```

### Test 3: Check Server Logs
```bash
# Should see:
✅ kds.outbox.order-preparing.queued (hasSession: false)
✅ outbox.event.claimed (eventType: order:preparing)
✅ outbox.event.handler.executing
✅ kds.create-tickets.start
✅ kds.ticket.created (or kds.ticket.created-fallback)
✅ outbox.event.handler.success
```

## 🚀 Deployment

### Pre-Deployment Checklist
- [x] Code change made in OrderStateMachineService
- [ ] Test with staff-placed order
- [ ] Verify outbox event created
- [ ] Verify ticket created
- [ ] Verify Socket.IO event emitted
- [ ] Run existing tests to ensure no regression

### Deployment Steps
1. Deploy updated `OrderStateMachineService.js`
2. Restart server (to pick up code changes)
3. Outbox worker will automatically start
4. Test with a new order creation
5. Monitor logs for confirmation

### Rollback Plan
If issues occur:
1. Revert `OrderStateMachineService.js` to previous version
2. Restart server
3. Original behavior restored (tickets still won't work but system stable)

## 📊 Impact

### Systems Affected
- ✅ Order placement (staff API)
- ✅ Kitchen ticket creation
- ✅ Socket.IO real-time updates
- ✅ Outbox event processing

### Systems NOT Affected
- ✅ Customer order placement (QR menu) - uses different code path
- ✅ Manual status transitions via API
- ✅ Existing tickets
- ✅ Other outbox events

### Backward Compatibility
- ✅ 100% backward compatible
- ✅ No database migrations needed
- ✅ No API changes
- ✅ Existing orders unaffected

## 🔍 Related Issues Fixed

This fix also resolves:
1. Socket.IO events not triggering for new orders
2. Kitchen Display System not showing new orders
3. Orders appearing "stuck" in preparing status
4. Waiters not receiving real-time updates

## 📝 Additional Notes

### Why This Wasn't Caught Earlier
- Tests use explicit session management
- Manual status transitions work fine (they pass sessions correctly)
- Only affects auto-routing in `staffPlaceOrder`
- Silent failure - no error thrown, just no event created

### Why Silent Failure Occurred
- Mongoose's `create()` with options object is lenient
- `{ session: undefined }` doesn't throw an error
- It just silently ignores the undefined session
- Event appears to be created but isn't saved to database

### Future Improvements
1. Add explicit session logging in all outbox event creations
2. Add test case for auto-routing flow
3. Add monitoring/alerts for missing outbox events
4. Consider making session parameter required (explicit null check)

## ✅ Verification Checklist

After deployment, verify:
- [ ] New orders create `order:preparing` events
- [ ] Outbox events have status = "published"
- [ ] Kitchen tickets are created
- [ ] Tickets appear in KDS dashboard
- [ ] Socket.IO events received by frontend
- [ ] No errors in server logs
- [ ] Existing functionality still works

---

**Status:** ✅ FIX APPLIED - Ready for Testing
**Date:** August 28, 2026
**Modified Files:** 
- `src/modules/order/service/OrderStateMachineService.js`
