# Customer QR Real-Time Updates with Socket.IO

## 🎯 Goal
Enable real-time order status updates for QR customers (like Toast/Square/Clover)

---

## 🏢 How Big Restaurants Do It

### **Toast POS Pattern:**
```
Customer scans QR → Places order → Connects to Socket.IO with session token
                                   ↓
                    Receives real-time updates:
                    • Order placed (pending)
                    • Order accepted by waiter
                    • Preparing in kitchen
                    • Ready to serve
                    • Served
```

### **Authentication Pattern:**
- **Staff:** JWT token (already implemented ✅)
- **Customers:** Session token from QR code (needs implementation)

---

## 📋 Current Situation

### **What You Have:**
✅ Socket.IO server set up (`src/infrastructure/websocket/socket-server.js`)
✅ Staff authentication with JWT
✅ Room-based messaging (`branch:`, `station:`, `user:`)
✅ Outbox pattern for reliable events

### **What's Missing:**
❌ Customer authentication (session token-based)
❌ Customer-specific rooms (`table:`, `session:`)
❌ Order status events emitted to customers
❌ Customer-facing Socket.IO endpoint documentation

---

## 🔧 Implementation Plan

### **Phase 1: Customer Socket.IO Authentication**

Add session token authentication alongside JWT:

```javascript
// src/infrastructure/websocket/socket-server.js

async function authenticateSocket(socket, next) {
  try {
    let token = socket.handshake.auth?.token;
    let authType = 'jwt'; // Default to JWT

    // Check if this is a customer session token
    if (token && token.startsWith('qr-')) {
      authType = 'session';
    }

    // ... existing JWT logic ...

    if (authType === 'session') {
      // ✅ NEW: Customer session authentication
      const CustomerSession = require('../../../models/customerSessionModule');
      
      const session = await CustomerSession.findOne({
        token,
        isActive: true,
        expiresAt: { $gt: new Date() },
      }).populate('merchant', '_id businessName')
        .populate('branch', '_id name')
        .populate('table', '_id tableNumber');

      if (!session) {
        return next(new Error('Invalid or expired session'));
      }

      socket.data.session = session;
      socket.data.authType = 'customer';
      socket.data.merchantId = session.merchant._id;
      socket.data.branchId = session.branch._id;
      socket.data.tableId = session.table._id;
      socket.data.customerId = session.customer;
      
      return next();
    }

    // ... existing JWT logic continues ...
  } catch (error) {
    next(new Error('Authentication failed'));
  }
}
```

---

### **Phase 2: Customer-Specific Rooms**

Add customer room subscriptions:

```javascript
io.on('connection', socket => {
  const authType = socket.data.authType;

  if (authType === 'customer') {
    // ✅ Customer connects with session token
    const session = socket.data.session;
    
    // Join rooms automatically
    socket.join(`table:${session.table._id}`);
    socket.join(`session:${session.token}`);
    socket.join(`branch:${session.branch._id}:customers`);
    
    logger.info(`Customer socket connected`, {
      socketId: socket.id,
      tableNumber: session.table.tableNumber,
      sessionToken: session.token,
    });

    // Send connection confirmation
    socket.emit('connection:success', {
      tableNumber: session.table.tableNumber,
      restaurant: session.merchant.businessName,
    });
    
  } else {
    // ✅ Staff connects with JWT (existing logic)
    const user = socket.data.user;
    logger.info(`Staff socket connected: ${socket.id} user=${user?._id}`);
    
    // ... existing staff logic ...
  }
});
```

---

### **Phase 3: Emit Order Events to Customers**

Update order placement to emit to customer rooms:

```javascript
// src/modules/order/service/OrderTransactionService.js
// After order is created successfully:

const io = require('../../infrastructure/websocket/socket-server').getIo();

// Emit to customer (via table room)
io.to(`table:${tableId}`).emit('order:created', {
  orderId: createdOrder._id,
  orderNumber: createdOrder.orderNumber,
  status: createdOrder.overallStatus,
  items: createdOrder.items.map(item => ({
    name: item.name,
    quantity: item.quantity,
    status: item.itemStatus,
  })),
  estimatedTime: '15-20 min',
  message: {
    en: 'Your order has been placed!',
    am: 'ትእዛዝዎ ተቀብለናል!',
  },
});

// Emit to staff (existing)
io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', order);
```

---

### **Phase 4: Status Update Events**

Emit on every status change:

```javascript
// src/modules/order/service/OrderStateMachineService.js
// After successful status transition:

function emitOrderStatusUpdate(order, oldStatus, newStatus) {
  const io = require('../../infrastructure/websocket/socket-server').getIo();
  
  // ✅ Emit to customer
  io.to(`table:${order.table}`).emit('order:status_changed', {
    orderId: order._id,
    orderNumber: order.orderNumber,
    oldStatus,
    newStatus,
    message: getCustomerMessage(newStatus),
    timestamp: new Date(),
  });

  // ✅ Emit to staff
  io.to(`branch:${order.branch}`).emit('order:updated', {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: newStatus,
  });
}

function getCustomerMessage(status) {
  const messages = {
    pending: {
      en: 'Your order is pending confirmation',
      am: 'ትእዛዝዎ ለማረጋገጥ በመጠበቅ ላይ ነው',
    },
    accepted: {
      en: 'Your order has been accepted and is being prepared',
      am: 'ትእዛዝዎ ተቀብለናል እና በማዘጋጀት ላይ ነው',
    },
    preparing: {
      en: 'Your food is being prepared',
      am: 'ምግብዎ በማዘጋጀት ላይ ነው',
    },
    ready: {
      en: 'Your order is ready!',
      am: 'ትእዛዝዎ ዝግጁ ነው!',
    },
    served: {
      en: 'Your order has been served. Enjoy!',
      am: 'ትእዛዝዎ ቀርቧል። ይደሰቱ!',
    },
  };
  
  return messages[status] || { en: 'Order status updated', am: 'የትዕዛዝ ሁኔታ ተዘምኗል' };
}
```

---

## 📱 Frontend Integration

### **Customer App Connection:**

```javascript
// Customer QR app
import io from 'socket.io-client';

const sessionToken = localStorage.getItem('qr_session_token');

const socket = io('http://localhost:8000', {
  auth: {
    token: sessionToken, // Pass session token, not JWT
  },
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('Connected to real-time updates');
});

socket.on('connection:success', (data) => {
  console.log(`Welcome to ${data.restaurant}! Table: ${data.tableNumber}`);
});

// ✅ Listen for order events
socket.on('order:created', (data) => {
  console.log('Order placed:', data.orderNumber);
  showNotification(`Order ${data.orderNumber} placed successfully!`);
  updateOrderStatus(data.status);
});

socket.on('order:status_changed', (data) => {
  console.log('Order status:', data.newStatus);
  showNotification(data.message.en); // or .am for Amharic
  updateOrderStatus(data.newStatus);
  
  // Show confetti when ready!
  if (data.newStatus === 'ready') {
    playSound('order-ready.mp3');
    showConfetti();
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected from real-time updates');
  showReconnectingIndicator();
});
```

---

## 🎯 Event Types

### **Customer Events (Receive Only):**

| Event | When | Payload |
|-------|------|---------|
| `connection:success` | Socket connects | `{ tableNumber, restaurant }` |
| `order:created` | Order placed | `{ orderId, orderNumber, status, items, estimatedTime, message }` |
| `order:status_changed` | Status changes | `{ orderId, orderNumber, oldStatus, newStatus, message, timestamp }` |
| `order:item_ready` | Item ready to serve | `{ orderId, itemId, itemName }` |
| `order:ready` | All items ready | `{ orderId, orderNumber, message }` |
| `order:served` | Order delivered | `{ orderId, orderNumber, message }` |

### **Staff Events (Existing):**

| Event | When | Payload |
|-------|------|---------|
| `order:new` | New order placed | Full order object |
| `order:updated` | Order status changed | `{ orderId, status }` |
| `ticket:created` | Kitchen ticket created | Ticket object |
| `ticket:updated` | Ticket status changed | Ticket object |

---

## 🔐 Security Considerations

### **1. Session Token Validation:**
```javascript
// Validate session is active and not expired
// Already done in authenticateSocket
```

### **2. Room Isolation:**
```javascript
// Customers can only receive events for THEIR table
// Staff can receive events for their branch/permissions
// Enforced by room membership
```

### **3. Data Filtering:**
```javascript
// Don't send sensitive data to customers:
// ❌ Internal notes, cost, staff names
// ✅ Order number, status, estimated time, items
```

---

## 📊 Status Flow Example

```
Customer Places Order
       ↓
   [pending] ← Socket: "Order placed, waiting for confirmation"
       ↓ (Waiter accepts)
   [accepted] ← Socket: "Order accepted, preparing..."
       ↓ (Kitchen starts)
   [preparing] ← Socket: "Your food is being prepared"
       ↓ (Food ready)
   [ready] ← Socket: "Your order is ready! 🎉"
       ↓ (Waiter serves)
   [served] ← Socket: "Enjoy your meal!"
```

---

## 🚀 Implementation Priority

### **Must Have (MVP):**
1. ✅ Customer session authentication
2. ✅ `order:created` event
3. ✅ `order:status_changed` event
4. ✅ Table-based rooms

### **Should Have:**
5. ✅ Item-level status updates
6. ✅ Estimated time calculation
7. ✅ Multilingual messages (en/am)

### **Nice to Have:**
8. Read receipts (customer saw the update)
9. Push notifications (when app backgrounded)
10. Order timeline view

---

## 🧪 Testing

```javascript
// Test customer socket connection
const socket = io('http://localhost:8000', {
  auth: { token: 'your-qr-session-token' },
});

socket.on('connect', () => console.log('✅ Connected'));
socket.on('order:created', (data) => console.log('✅ Order created:', data));
socket.on('order:status_changed', (data) => console.log('✅ Status:', data));
```

---

## 📝 Summary

**Big restaurants like Toast handle this by:**
1. Dual authentication: JWT for staff, session tokens for customers
2. Room-based isolation: Each table/session gets its own room
3. Event-driven updates: Every status change emits to relevant rooms
4. Reliable delivery: Outbox pattern ensures events aren't lost
5. Mobile-first UX: Real-time feedback makes customers feel informed

**Your implementation should:**
- ✅ Support both staff (JWT) and customer (session) auth
- ✅ Emit events at order creation and every status change
- ✅ Use table-based rooms for customer isolation
- ✅ Provide multilingual messages (en/am)
- ✅ Include estimated times when possible

Want me to implement this for you?
