# Customer QR App - Socket Connection Guide

## ❓ Does the Customer App Need Socket.IO?

**Answer: OPTIONAL - Depends on Your Requirements**

### **Option 1: HTTP-Only (Current Setup) ✅**
**Use Case:** Customer places order and waits for staff notification

**How it works:**
1. Customer scans QR → HTTP session created
2. Customer browses menu → HTTP requests
3. Customer places order → HTTP POST to `/api/v1/orders`
4. **Staff receives order via socket.io** → Staff POS updates in real-time
5. Customer waits at table → No real-time updates needed
6. Staff delivers food → Customer sees it physically

**Pros:**
- ✅ Simpler customer app (no WebSocket connection)
- ✅ Less battery drain on customer phone
- ✅ Works on poor network conditions
- ✅ No authentication complexity for guests

**Cons:**
- ❌ Customer doesn't see live order status updates
- ❌ Customer must ask staff about order status

---

### **Option 2: HTTP + Socket.IO (Advanced)**
**Use Case:** Customer wants live order status updates (like food delivery apps)

**How it works:**
1. Customer scans QR → HTTP session created
2. Customer places order → HTTP POST
3. **Customer connects to socket** → Subscribes to order updates
4. Staff accepts order → Customer sees "Order Accepted" ✅
5. Kitchen starts cooking → Customer sees "Preparing" 🍳
6. Food ready → Customer sees "Ready to Serve" 🔔
7. Staff delivers → Customer sees "Served" ✓

**Pros:**
- ✅ Better customer experience (transparency)
- ✅ Reduces "where's my order?" questions to staff
- ✅ Can show estimated time remaining
- ✅ Builds trust with real-time updates

**Cons:**
- ❌ More complex customer app code
- ❌ Requires WebSocket connection management
- ❌ More battery usage
- ❌ Need error handling for connection drops

---

## 🎯 My Recommendation

**Start with HTTP-Only (Option 1)**

Why?
1. Your current setup already works for order placement
2. Staff-side real-time updates are what matters most
3. Customers typically prefer physical interaction in dine-in
4. You can add sockets later if customers request status updates

**Add Sockets Later If:**
- Customers frequently ask "where's my order?"
- You want to differentiate from competitors
- You plan to add table-side payment notifications
- You want to notify customers when order is ready for pickup

---

## 📱 If You Choose Option 2: Minimal Customer Socket Code

### **1. Customer Frontend Connection**

```javascript
import io from 'socket.io-client';

class CustomerOrderTracker {
  constructor() {
    this.socket = null;
    this.sessionToken = null; // From QR session
    this.orderId = null;
  }

  // Call after placing order
  connectAndTrack(orderId, sessionToken) {
    this.orderId = orderId;
    this.sessionToken = sessionToken;

    // Connect to backend socket
    this.socket = io('http://localhost:8000', {
      auth: {
        token: sessionToken, // Use QR session token
        orderId: orderId,
        role: 'customer'
      },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to order tracking');
      // Subscribe to order-specific updates
      this.socket.emit('customer:track-order', { orderId });
    });

    // Listen for order status updates
    this.socket.on('order:status-changed', (data) => {
      console.log('Order status updated:', data);
      this.handleStatusUpdate(data);
    });

    this.socket.on('order:ready', (data) => {
      console.log('Order is ready!', data);
      this.showNotification('Your order is ready! 🎉');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from tracking');
      // Auto-reconnect or show offline indicator
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      // Fallback to HTTP polling if needed
    });
  }

  handleStatusUpdate(data) {
    const { status, orderId, message } = data;
    
    const statusMessages = {
      'pending': 'Order received - waiting for confirmation',
      'accepted': 'Order confirmed - kitchen preparing your food',
      'preparing': 'Your food is being prepared 🍳',
      'ready': 'Your order is ready! 🔔',
      'served': 'Enjoy your meal! ✓',
    };

    // Update UI with status
    this.updateOrderUI(orderId, status, statusMessages[status]);
  }

  updateOrderUI(orderId, status, message) {
    // Update your React/Vue component state here
    // Example: setOrderStatus({ orderId, status, message });
  }

  showNotification(message) {
    // Show browser notification or in-app alert
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Order Update', { body: message });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Usage in your customer app:
const tracker = new CustomerOrderTracker();

// After placing order successfully:
const orderResponse = await fetch('/api/v1/orders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(orderData)
});

const { data } = await orderResponse.json();
const orderId = data.order._id;

// Start tracking
tracker.connectAndTrack(orderId, sessionToken);

// Cleanup when customer leaves or order completed
// tracker.disconnect();
```

---

### **2. Backend: Add Customer Socket Support**

**File:** `src/infrastructure/websocket/socket-server.js`

```diff
+ async function authenticateCustomerSocket(socket, next) {
+   try {
+     const token = socket.handshake.auth?.token;
+     const role = socket.handshake.auth?.role;
+ 
+     // Customer uses session token, not JWT
+     if (role === 'customer') {
+       const CustomerSession = require('../../../models/customerSessionModule');
+       const session = await CustomerSession.findOne({
+         token,
+         isActive: true,
+         expiresAt: { $gt: new Date() },
+       });
+ 
+       if (!session) {
+         return next(new Error('Invalid or expired session'));
+       }
+ 
+       socket.data.customer = {
+         sessionId: session._id,
+         merchantId: session.merchant,
+         branchId: session.branch,
+         tableId: session.table,
+       };
+       socket.data.role = 'customer';
+       return next();
+     }
+ 
+     // Staff authentication (existing code)
+     // ... rest of staff auth
+   } catch (error) {
+     next(new Error('Authentication failed'));
+   }
+ }

  io.on('connection', socket => {
    const user = socket.data.user;
+   const customer = socket.data.customer;
    
-   logger.info(`Socket connected: ${socket.id} user=${user?._id}`);
+   if (customer) {
+     logger.info(`Customer socket connected: ${socket.id} table=${customer.tableId}`);
+   } else if (user) {
+     logger.info(`Staff socket connected: ${socket.id} user=${user._id}`);
+   }

+   // Customer-specific events
+   if (customer) {
+     socket.on('customer:track-order', ({ orderId }) => {
+       // Subscribe to order-specific room
+       socket.join(`order:${orderId}`);
+       logger.info(`Customer tracking order ${orderId}`);
+     });
+   }

    // ... rest of existing socket.on handlers
  });
```

---

### **3. Emit Customer Updates When Order Status Changes**

Your existing code in `StatusSyncService.js` already emits to `order:${orderId}` room:

```javascript
// This already works - customers subscribed to order:${orderId} will receive it
io.to(`order:${order._id}`).emit('order:status-changed', {
  orderId: order._id.toString(),
  oldStatus: previousOrderStatus,
  newStatus: order.status,
  message: `Order ${order.orderNumber} is now ${order.status}`,
});
```

**No changes needed!** The customer socket connection will automatically receive these events.

---

## 🎯 Final Recommendation

### **Start Simple:**
1. ✅ Use HTTP-only for order placement (current setup)
2. ✅ Staff receives real-time updates (already fixed)
3. ✅ Ship to production

### **Add Later If Needed:**
4. Add customer socket connection for status tracking
5. Add UI components to show order progress
6. Add push notifications for "Order Ready"

---

## 📊 Comparison Table

| Feature | HTTP-Only | HTTP + Socket.IO |
|---------|-----------|------------------|
| Order placement | ✅ | ✅ |
| Staff real-time updates | ✅ | ✅ |
| Customer status tracking | ❌ | ✅ |
| Development complexity | Low | Medium |
| Battery usage | Low | Higher |
| Network requirements | Basic HTTP | WebSocket support |
| Works offline | Better | Worse |
| Customer experience | Good | Excellent |

---

## ✅ Current Status

**What's Working Now:**
- ✅ Customer places order via HTTP POST
- ✅ Backend emits `order:new` event to staff rooms
- ✅ Staff POS receives real-time order notifications
- ✅ Order status updates emit to `order:${orderId}` room (ready for customers)

**What's Optional:**
- 🔲 Customer socket connection (for live status tracking)
- 🔲 Customer UI components for order progress
- 🔲 Push notifications for customers

**Your HTTP-only setup is production-ready!** 🎉
