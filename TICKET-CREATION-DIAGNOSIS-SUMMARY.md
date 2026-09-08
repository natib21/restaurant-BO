# Ticket Creation Issue - Diagnosis Summary

## 🔍 Problem Found

When orders are created via `staffPlaceOrder`, they:
1. ✅ Go through auto-routing: pending → accepted → preparing
2. ❌ Create `order:status-updated` events instead of `order:preparing` events
3. ❌ NO TICKETS ARE CREATED because outbox worker only handles `order:preparing`

## 📊 Evidence

### Recent Orders (Last 5)
All have status = "preparing" but NO `order:preparing` events:

```
Order: #TAKE-4-189 (6a9133df0e3ae3b296c2ffdf)
  Status: preparing
  Events: order:create, notification, order:status-updated (×3)  ← NO order:preparing!

Order: #TAKE-3-759 (6a91338a0e3ae3b296c2fe05)
  Status: preparing
  Events: order:create, notification, order:status-updated (×3)  ← NO order:preparing!
```

### Outbox Events
- Last 20 `order:preparing` events are all from YESTERDAY (Aug 27)
- Recent orders (Aug 28) have ZERO `order:preparing` events
- All recent events are `order:status-updated` type

### Kitchen Tickets
- ❌ ZERO tickets in database
- This confirms tickets are not being created

## 🐛 Root Cause

The `OrderStateMachineService.transitionOrderStatus()` method:
- Lines 757-779: SHOULD create `order:preparing` event when `toStatus === 'preparing'`
- BUT: It's creating `order:status-updated` instead

**Why?**

Looking at the code flow in `OrderService.staffPlaceOrder()` (lines 466-486):

```javascript
// After transaction commits:
await OrderStateMachineService.transitionOrderStatus({
  orderId: createdOrder._id,
  toStatus: 'preparing',
  ...
});
```

The transition is being called CORRECTLY, but something is preventing the `order:preparing` event from being created.

##  💡 Likely Causes

### Hypothesis 1: Session Parameter Missing
The `order:preparing` event creation happens inside a transaction (line 758 uses `{ session }`). If the session is null or already committed, the event won't be created.

### Hypothesis 2: Code Path Not Reached
The `if (toStatus === 'preparing')` block (line 756) might not be reached if:
- Order is already in "preparing" status (noop check)
- Error thrown before reaching line 756
- Different code path taken

### Hypothesis 3: Event Created But Not Saved
OutboxEvent.create() might be failing silently if:
- Validation error
- Index conflict
- Schema mismatch

## 🔧 Solution Options

### Option 1: Add Debug Logging
Add explicit logging before/after the `order:preparing` event creation:

```javascript
if (toStatus === 'preparing') {
  logger.info('kds.outbox.order-preparing.ABOUT_TO_CREATE', {
    orderId: order._id.toString(),
    hasSession: !!session
  });
  
  const OutboxEvent = require('../../../../models/OutboxEvent');
  
  await OutboxEvent.create([{ ... }], { session });
  
  logger.info('kds.outbox.order-preparing.CREATED', {
    orderId: order._id.toString()
  });
}
```

### Option 2: Check Session State
Verify the session is still active when creating the event:

```javascript
if (toStatus === 'preparing') {
  if (!session || !session.inTransaction()) {
    logger.warn('kds.outbox.no-session', { orderId: order._id.toString() });
    // Create without session
    await OutboxEvent.create([{ ... }]);
  } else {
    await OutboxEvent.create([{ ... }], { session });
  }
}
```

### Option 3: Move Event Creation Outside Transaction
In `OrderService.staffPlaceOrder()`, create the event AFTER the auto-routing:

```javascript
// After auto-routing completes:
if (channelConfig.requiresReview === false) {
  await OrderStateMachineService.transitionOrderStatus({...});
  await OrderStateMachineService.transitionOrderStatus({...});
  
  // Manually create order:preparing event HERE
  await OutboxEvent.create({
    aggregateId: createdOrder._id,
    eventType: 'order:preparing',
    ...
  });
}
```

### Option 4 (RECOMMENDED): Use Separate Transaction for Auto-Routing
The issue is that `staffPlaceOrder` creates the order in one transaction, then calls `transitionOrderStatus` OUTSIDE that transaction. But `transitionOrderStatus` expects to be IN a transaction.

Fix in `OrderService.staffPlaceOrder()`:

```javascript
// Current (BROKEN):
} // transaction ends here

// Auto-routing (NO SESSION)
await OrderStateMachineService.transitionOrderStatus({...});  ← No session!

// Fixed:
} // transaction ends here

// Auto-routing with NEW transaction
const session2 = await mongoose.startSession();
try {
  await session2.withTransaction(async () => {
    await OrderStateMachineService.transitionOrderStatus({
      ...
      session: session2  ← Pass new session
    });
  });
} finally {
  await session2.endSession();
}
```

## 🎯 Immediate Action

1. **Check server logs** for any errors during `order:preparing` event creation
2. **Add debug logging** to confirm code path is reached
3. **Fix session handling** in auto-routing logic
4. **Test with a new order** to verify tickets are created

## 📝 Test Plan

After fix:
1. Create new order via `POST /api/v1/orders/staff`
2. Check outbox events: `db.outboxevents.find({ eventType: "order:preparing" })`
3. Wait 1-2 seconds for worker to process
4. Check tickets: `db.kitchentic kets.find({})`
5. Verify ticket appears in KDS

Expected result:
- ✅ `order:preparing` event created
- ✅ Event processed by worker
- ✅ Ticket created in database
- ✅ Socket event emitted
- ✅ Ticket visible in KDS frontend
