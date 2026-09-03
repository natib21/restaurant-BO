# Socket.IO Quick Fix Guide

## Issue: Waiter Not Receiving New Order Notifications

### Most Common Cause
The waiter's Socket.IO client is **not calling `setup:session`** after connecting, which means the socket never joins the branch rooms.

### Frontend Fix (Waiter/Merchant App)

```javascript
// After socket connects, MUST call this:
socket.on('connect', () => {
  console.log('✅ Socket connected:', socket.id);
  
  // THIS IS CRITICAL - Without this, waiter won't receive order notifications!
  socket.emit('setup:session', {
    branchId: currentBranchId  // Make sure this is the correct branch ID
  });
});

// Listen for new orders
socket.on('order:new', (orderData) => {
  console.log('📥 NEW ORDER:', orderData);
  // Update UI with new order
  playNotificationSound();
  showNewOrderNotification(orderData);
});
```

### Check if `setup:session` is Being Called

**In browser console (waiter app):**
```javascript
// Check if socket is connected
socket.connected  // Should be true

// Manually trigger setup (for testing)
socket.emit('setup:session', { branchId: 'YOUR_BRANCH_ID_HERE' });
```

**Check server logs - you should see:**
```
User {userId} joined branch {branchId}
```

If you DON'T see this log message, the `setup:session` event is not being called!

---

## Issue: Customer Not Receiving "Order Served" Notification

### Most Common Causes

1. **Customer socket disconnected** - Mobile browsers often disconnect WebSockets in background
2. **Customer not in order room** - Session expired or order room not joined properly
3. **Wrong event listener** - Customer app listening for wrong event names

### Frontend Fix (Customer App)

```javascript
// Reconnection handling
socket.on('disconnect', (reason) => {
  console.warn('⚠️ Socket disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server disconnected, reconnect manually
    socket.connect();
  }
});

socket.on('connect', () => {
  console.log('✅ Customer socket connected:', socket.id);
  
  // Rejoin order room if we have an active order
  if (currentOrderId) {
    socket.emit('order:join', { orderId: currentOrderId });
  }
});

// Listen for item status changes (when order is served)
socket.on('order:item-status-changed', (data) => {
  console.log('📦 Item status changed:', data);
  // data.newStatus will be 'served' when waiter serves the item
  updateOrderItemStatus(data.itemId, data.newStatus);
});

// Listen for overall order status changes
socket.on('order:status-changed', (data) => {
  console.log('📋 Order status changed:', data);
  // data.newStatus could be 'accepted', 'preparing', 'ready', 'served', 'completed'
  updateOrderStatus(data.newStatus);
});
```

### Test Customer Socket

**In browser console (customer app):**
```javascript
// Check connection
socket.connected  // Should be true

// Check which rooms socket is in (you need to log this server-side)
// Manually join order room
socket.emit('order:join', { orderId: 'YOUR_ORDER_ID' });

// Test event reception
socket.onAny((eventName, ...args) => {
  console.log(`📡 Received event: ${eventName}`, args);
});
```

---

## Quick Server-Side Debug

### Add Logging to Socket Server

**File:** `src/infrastructure/websocket/socket-server.js`

Find the `setup:session` handler (around line 117) and add logging:

```javascript
socket.on('setup:session', ({ branchId }) => {
  if (!branchId || !user) return;
  
  console.log('🔧 setup:session called', { 
    userId: user._id, 
    branchId,
    socketId: socket.id
  });
  
  // ... existing code ...
  
  socket.join(`branch:${branchId}`);
  permissions.forEach(perm => {
    socket.join(`branch:${branchId}:perm:${perm}`);
    console.log(`✅ Socket joined room: branch:${branchId}:perm:${perm}`);
  });
  
  logger.info(`User ${user._id} joined branch ${branchId}`);
});
```

### Test Order Creation

**Create test order via API:**
```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{
    "items": [
      {
        "menu": "MENU_ID",
        "quantity": 1
      }
    ],
    "tableId": "TABLE_ID"
  }'
```

**Check server logs - you should see:**
```
order.socket_emit_to_staff - Emitting to branch rooms
order.created - Order transaction committed
```

---

## Verification Checklist

### For Waiter Not Receiving Orders:
- [ ] Socket connects successfully (`socket.connected === true`)
- [ ] `setup:session` is called with correct `branchId`
- [ ] Server logs show "User X joined branch Y"
- [ ] Waiter has `ORDER_VIEW` or `ORDER_MANAGE` permission
- [ ] Event listener `socket.on('order:new', ...)` is registered
- [ ] CORS allows waiter app domain
- [ ] JWT token is valid and not expired

### For Customer Not Receiving Updates:
- [ ] Socket connects with `sessionToken` in auth
- [ ] Socket connects successfully
- [ ] Customer joins order room (auto or manual)
- [ ] Event listeners for `order:item-status-changed` and `order:status-changed` are registered
- [ ] Socket doesn't disconnect when app goes to background
- [ ] Session token is valid and not expired

---

## Emergency Workaround

If Socket.IO continues to fail, implement polling as fallback:

```javascript
// In waiter app
setInterval(async () => {
  const response = await fetch('/api/v1/orders?status=pending');
  const data = await response.json();
  // Check for new orders and update UI
}, 5000); // Poll every 5 seconds
```

This is NOT ideal but ensures orders are not missed while you debug Socket.IO.
