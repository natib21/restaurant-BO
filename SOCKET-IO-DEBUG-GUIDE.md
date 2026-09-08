# Socket.IO Debug Guide - Order Notifications

## Current Issue Summary

**Problem:**
- ✅ Customer orders arrive in backend (visible after waiter reloads)
- ❌ **Waiter/Staff NOT receiving real-time Socket.IO notifications for new orders**
- ✅ Customer receives Socket.IO notifications when waiter accepts order
- ❌ **Customer NOT receiving Socket.IO notification when order is served**

## Socket.IO Architecture

### 1. Connection Types

#### Staff/Waiter Connection
- **Auth**: JWT token in `socket.handshake.auth.token` or `Authorization` header
- **Rooms joined**:
  - `branch:{branchId}` - General branch room
  - `branch:{branchId}:perm:{PERMISSION}` - Permission-specific rooms
  - `user:{userId}` - User-specific room

#### Customer Connection
- **Auth**: Session token in `socket.handshake.auth.sessionToken`
- **Rooms joined**:
  - `session:{sessionToken}` - Session-specific room
  - `order:{orderId}` - Order-specific rooms (auto-joined for active orders)

### 2. Event Flow

#### When Customer Places Order
**File**: `src/modules/order/service/OrderTransactionService.js` (Lines 217-242)

```javascript
// Staff notification
io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', {...});
io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', {...});

// Customer notification
io.to(`order:${orderId}`).emit('order:created', {...});
io.to(`session:${sessionToken}`).emit('order:created', {...});
```

#### When Waiter Accepts/Updates Order
**File**: `src/modules/order/service/StatusSyncService.js` (Lines 54-84)

```javascript
// Item status change
io.to(`order:${orderId}`).emit('order:item-status-changed', {...});
io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:item-status-changed', {...});
io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:item-status-changed', {...});

// Order status change (if derived status changed)
io.to(`order:${orderId}`).emit('order:status-changed', {...});
io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:status-changed', {...});
io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:status-changed', {...});
```

#### When Order is Served
**File**: `src/modules/order/service/StatusSyncService.js` (Same as above)
- Emits `order:item-status-changed` and potentially `order:status-changed`

## Debug Checklist

### Issue 1: Waiter NOT Receiving New Order Notifications

#### Check 1: Verify Staff Socket Connection
```bash
# In browser console (waiter app):
socket.on('connect', () => {
  console.log('✅ Socket connected:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket connection error:', error.message);
});
```

#### Check 2: Verify Branch Room Setup
```bash
# In waiter app, after login:
socket.emit('setup:session', { branchId: 'YOUR_BRANCH_ID' });

# Check server logs for:
# "User {userId} joined branch {branchId}"
```

#### Check 3: Verify Permissions
The waiter must have `ORDER_VIEW` or `ORDER_MANAGE` permission.

**Check in MongoDB**:
```javascript
db.users.findOne({ _id: ObjectId('USER_ID') }).populate('role')
// Check role.tasks array contains tasks with name: 'View Order' or 'Manage Order'
```

#### Check 4: Verify Event Listener
```javascript
// In waiter app:
socket.on('order:new', (orderData) => {
  console.log('📥 New order received:', orderData);
});
```

#### Check 5: Check Server Logs
When customer places order, look for:
```
order.created - Order transaction committed
```

### Issue 2: Customer NOT Receiving "Order Served" Notification

#### Check 1: Verify Customer Socket Connection
```javascript
// In customer app:
socket.on('connect', () => {
  console.log('✅ Customer socket connected:', socket.id);
});
```

#### Check 2: Verify Order Room Membership
```javascript
// In customer app:
socket.on('order:created', (data) => {
  console.log('📥 Order created:', data);
  // Socket should auto-join order room
});
```

#### Check 3: Add Event Listeners
```javascript
// In customer app:
socket.on('order:item-status-changed', (data) => {
  console.log('📦 Item status changed:', data);
});

socket.on('order:status-changed', (data) => {
  console.log('📋 Order status changed:', data);
});
```

#### Check 4: Verify Session Token
```javascript
// Customer socket must connect with:
const socket = io('http://localhost:8000', {
  auth: {
    sessionToken: 'YOUR_SESSION_TOKEN'
  }
});
```

## Common Issues & Solutions

### Problem: "getIo() not initialized"
**Cause**: Socket server not started before services try to use it
**Solution**: Ensure `createSocketServer(app)` is called in `server.js` before routes

### Problem: Staff not joining rooms
**Cause**: Missing or incorrect `setup:session` event
**Solution**: 
```javascript
// After socket connects:
socket.emit('setup:session', { branchId: currentBranchId });
```

### Problem: Customer not receiving updates
**Cause**: Not joining order room
**Solution**: Ensure customer socket auto-joins on connection (handled server-side) or manually:
```javascript
socket.emit('order:join', { orderId: 'ORDER_ID' });
```

### Problem: Events emitted but not received
**Cause**: Socket not in correct room
**Debug**:
```javascript
// Server-side (add temporarily):
console.log('Socket rooms:', socket.rooms);
console.log('Emitting to room:', `branch:${branchId}:perm:ORDER_VIEW`);
```

## Testing Commands

### Test 1: Check Socket Connection
```bash
# In browser console:
socket.connected  // Should return true
socket.id         // Should return socket ID
```

### Test 2: Monitor All Events
```javascript
// Add wildcard listener (development only):
socket.onAny((eventName, ...args) => {
  console.log(`📡 Event: ${eventName}`, args);
});
```

### Test 3: Manual Order Creation Test
```bash
# In waiter app console:
socket.emit('order:create', {
  branchId: 'YOUR_BRANCH_ID',
  orderNumber: 'TEST-001',
  status: 'pending'
});
```

## Expected Socket Events

### New Order Flow
1. **Customer places order**
   - Customer receives: `order:created`
   - Staff receives: `order:new`

2. **Waiter accepts order**
   - Customer receives: `order:status-changed` (pending → accepted)
   - Staff receives: `order:status-changed`

3. **Kitchen prepares**
   - Customer receives: `order:item-status-changed` (for each item)
   - Staff receives: `order:item-status-changed`

4. **Waiter serves order**
   - Customer receives: `order:item-status-changed` (status: served)
   - Customer receives: `order:status-changed` (if all items served)
   - Staff receives: same events

## Next Steps

1. **Enable Socket.IO debug logging**:
   ```javascript
   localStorage.debug = 'socket.io-client:socket';
   ```

2. **Check server logs** for Socket.IO connection messages

3. **Verify JWT token** is valid and includes correct permissions

4. **Test with multiple clients** (different browsers/incognito windows)

5. **Check CORS configuration** in `getCorsOrigins()`

6. **Verify branch ID** matches between customer order and staff session

## Files to Check

- Socket server: `src/infrastructure/websocket/socket-server.js`
- Order creation: `src/modules/order/service/OrderTransactionService.js`
- Status updates: `src/modules/order/service/StatusSyncService.js`
- Client connection: Check your frontend Socket.IO client setup
