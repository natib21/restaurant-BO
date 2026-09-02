# QR Customer Web App - Socket.IO Implementation Guide

## 📡 Overview

Your backend already has Socket.IO set up for **staff users (JWT auth)**. For **QR customers**, we need a separate authentication mechanism using their **session token**.

---

## 🏗️ Architecture

### **Current Socket Setup (Staff Only)**
```
Staff App → JWT Token → Socket Auth → Joins branch rooms → Receives order updates
```

### **New Socket Setup (QR Customers)**
```
QR Customer App → Session Token → Socket Auth → Joins table room → Receives order status updates
```

---

## 🔧 Implementation

### **Step 1: Add Customer Socket Authentication**

Update `src/infrastructure/websocket/socket-server.ts`:

```typescript
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import type { Express } from 'express';
import { logger } from '../../common/logger';
import { loadEnv, getCorsOrigins } from '../../config/env';
const User = require('../../../models/userModel');
const CustomerSession = require('../../../models/customerSessionModule'); // ✅ Add this

const verifyJwt = promisify(jwt.verify) as unknown as (
  token: string,
  secret: string
) => Promise<{ id: string; merchant?: string; branch?: string }>;

let io: SocketServer | null = null;

// ✅ NEW: Customer session authentication
async function authenticateCustomerSocket(
  socket: import('socket.io').Socket,
  next: (err?: Error) => void
) {
  try {
    const sessionToken =
      socket.handshake.auth?.sessionToken ||
      socket.handshake.query?.sessionToken;

    if (!sessionToken) {
      return next(new Error('Session token required'));
    }

    const session = await CustomerSession.findOne({
      token: sessionToken,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return next(new Error('Invalid or expired session'));
    }

    socket.data.session = session;
    socket.data.type = 'customer';
    socket.data.merchantId = session.merchant;
    socket.data.branchId = session.branch;
    socket.data.tableId = session.table;
    socket.data.customerId = session.customer;
    
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
}

// ✅ UPDATED: Staff authentication (existing)
async function authenticateStaffSocket(
  socket: import('socket.io').Socket, 
  next: (err?: Error) => void
) {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization as string | undefined)?.split(' ')?.[1];

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const env = loadEnv();
    const decoded = await verifyJwt(token, env.JWT_SECRET);

    const user = await User.findById(decoded.id)
      .populate({
        path: 'role',
        select: 'name tasks',
        populate: { path: 'tasks', select: 'name endpoint method' },
      })
      .populate('merchant', '_id businessName');

    if (!user || !user.isActive) {
      return next(new Error('User not found or inactive'));
    }

    socket.data.user = user;
    socket.data.type = 'staff';
    socket.data.permissions = (user.role?.tasks || [])
      .map((t: { name?: string }) => t.name)
      .filter(Boolean);
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}

// ✅ NEW: Combined authentication middleware
async function authenticateSocket(
  socket: import('socket.io').Socket,
  next: (err?: Error) => void
) {
  // Check if it's a customer session token
  const sessionToken = 
    socket.handshake.auth?.sessionToken ||
    socket.handshake.query?.sessionToken;
  
  if (sessionToken) {
    return authenticateCustomerSocket(socket, next);
  }
  
  // Otherwise try staff JWT authentication
  return authenticateStaffSocket(socket, next);
}

export function createSocketServer(app: Express) {
  const server = http.createServer(app);
  const origins = getCorsOrigins();

  io = new SocketServer(server, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  io.use(authenticateSocket);

  io.on('connection', socket => {
    const socketType = socket.data.type;
    
    // ✅ CUSTOMER CONNECTION
    if (socketType === 'customer') {
      const { merchantId, branchId, tableId, customerId } = socket.data;
      
      logger.info(`Customer socket connected: ${socket.id} table=${tableId}`);
      
      // Join customer-specific rooms
      socket.join(`table:${tableId}`);
      socket.join(`merchant:${merchantId}:customer`);
      if (customerId) {
        socket.join(`customer:${customerId}`);
      }
      
      // Customer-specific events
      socket.on('customer:ready', () => {
        socket.emit('connection:confirmed', {
          tableId,
          merchantId,
          branchId,
        });
      });
      
      socket.on('disconnect', reason => {
        logger.info(`Customer socket disconnected: ${socket.id} (${reason})`);
      });
      
      return;
    }
    
    // ✅ STAFF CONNECTION (existing logic)
    if (socketType === 'staff') {
      const user = socket.data.user;
      logger.info(`Staff socket connected: ${socket.id} user=${user?._id}`);

      socket.on('setup:session', ({ branchId }) => {
        if (!branchId || !user) return;

        const userBranchIds = Array.isArray(user.branch)
          ? user.branch.map((b: { _id?: unknown }) => String(b._id ?? b))
          : user.branch
            ? [String((user.branch as { _id?: unknown })._id ?? user.branch)]
            : [];

        if (userBranchIds.length && !userBranchIds.includes(String(branchId))) {
          logger.warn(`Socket ${socket.id} denied branch ${branchId}`);
          return;
        }

        socket.join(`branch:${branchId}`);
        const permissions: string[] = socket.data.permissions || [];
        permissions.forEach(perm => socket.join(`branch:${branchId}:perm:${perm}`));
        socket.join(`user:${user._id}`);
        logger.info(`User ${user._id} joined branch ${branchId}`);
      });

      socket.on('order:create', order => {
        const { branchId } = order || {};
        if (!branchId || !io) return;
        io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', order);
        io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', order);
      });

      socket.on('table:sync', ({ branchId, tableId, status }) => {
        if (!branchId || !io) return;
        io.to(`branch:${branchId}`).emit('table:updated', { tableId, status });
      });

      socket.on('notification:broadcast', ({ branchId, targetPermission, data }) => {
        if (!branchId || !io) return;
        const room = targetPermission
          ? `branch:${branchId}:perm:${targetPermission}`
          : `branch:${branchId}`;
        io.to(room).emit('notification', data);
      });

      socket.on('inventory:subscribe', ({ merchantId }) => {
        if (!merchantId || !user?.merchant) return;
        const userMerchantId = String(user.merchant._id ?? user.merchant);
        if (String(merchantId) !== userMerchantId) {
          logger.warn(`Socket ${socket.id} denied inventory merchant ${merchantId}`);
          return;
        }
        socket.join(`merchant:${merchantId}`);
      });

      socket.on('disconnect', reason => {
        logger.info(`Staff socket disconnected: ${socket.id} (${reason})`);
      });
    }
  });

  return server;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

module.exports = { createSocketServer, getIo };
```

---

### **Step 2: Emit Order Events to Customers**

Update `src/modules/order/service/OrderTransactionService.js` to emit to both staff AND customers:

```javascript
// After order creation (around line 210):
try {
  const { getIo } = require('../../../infrastructure/websocket/socket-server');
  const io = getIo();
  
  // ✅ Emit to STAFF (existing)
  io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', {
    orderId: createdOrder._id,
    orderNumber: createdOrder.orderNumber,
    status: createdOrder.status,
    items: createdOrder.items,
    subtotal: createdOrder.subtotal,
    totalAmount: createdOrder.totalAmount,
    table: createdOrder.table,
    customerName: createdOrder.customerName,
    createdAt: createdOrder.createdAt,
    orderType: createdOrder.orderType,
    merchantId,
    branchId,
  });
  
  // ✅ NEW: Emit to CUSTOMER at their table
  if (tableId) {
    io.to(`table:${tableId}`).emit('order:created', {
      orderId: createdOrder._id,
      orderNumber: createdOrder.orderNumber,
      status: createdOrder.status,
      items: createdOrder.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        status: item.status,
      })),
      subtotal: createdOrder.subtotal,
      totalAmount: createdOrder.totalAmount,
      estimatedTime: '20-30 min', // Calculate based on items
      createdAt: createdOrder.createdAt,
    });
  }
} catch (socketError) {
  logger.warn('order.place.socket_emit_failed', {
    orderId: createdOrder._id.toString(),
    error: socketError.message,
  });
}
```

---

### **Step 3: Emit Order Status Updates to Customers**

Update `src/modules/order/service/StatusSyncService.js`:

```javascript
// Add after emitting to staff:
static async afterOrderStatusChange(order, oldStatus, newStatus, actor) {
  // ... existing staff notification logic ...
  
  // ✅ NEW: Notify customer at table
  try {
    const { getIo } = require('../../../infrastructure/websocket/socket-server');
    const io = getIo();
    
    if (order.table) {
      io.to(`table:${order.table}`).emit('order:status_changed', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        oldStatus,
        newStatus,
        updatedAt: new Date(),
        message: getCustomerMessage(newStatus), // Helper function below
      });
    }
  } catch (error) {
    logger.warn('customer.order.status.socket_emit_failed', { error: error.message });
  }
}

// ✅ NEW: Helper to generate customer-friendly messages
function getCustomerMessage(status) {
  const messages = {
    pending: 'Your order is being reviewed',
    accepted: 'Your order has been confirmed!',
    preparing: 'Your order is being prepared',
    ready: 'Your order is ready to serve!',
    served: 'Enjoy your meal!',
    completed: 'Thank you for dining with us!',
    cancelled: 'Your order has been cancelled',
  };
  return messages[status] || 'Order status updated';
}
```

---

## 📱 Frontend Implementation (QR Customer Web App)

### **Install Socket.IO Client:**
```bash
npm install socket.io-client
```

### **React/Vue/Angular Example:**

```javascript
import { io } from 'socket.io-client';

class CustomerSocketService {
  constructor() {
    this.socket = null;
    this.sessionToken = null;
  }
  
  // ✅ Connect with session token
  connect(sessionToken) {
    this.sessionToken = sessionToken;
    
    this.socket = io('http://localhost:8000', {
      auth: {
        sessionToken: sessionToken, // ✅ Pass session token
      },
      transports: ['websocket', 'polling'],
    });
    
    this.socket.on('connect', () => {
      console.log('✅ Connected to restaurant');
      this.socket.emit('customer:ready');
    });
    
    this.socket.on('connection:confirmed', (data) => {
      console.log('✅ Connection confirmed:', data);
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected us, try to reconnect
        this.socket.connect();
      }
    });
  }
  
  // ✅ Listen for order creation confirmation
  onOrderCreated(callback) {
    this.socket.on('order:created', (data) => {
      console.log('🎉 Order created:', data);
      callback(data);
    });
  }
  
  // ✅ Listen for order status changes
  onOrderStatusChanged(callback) {
    this.socket.on('order:status_changed', (data) => {
      console.log('📦 Order status changed:', data);
      callback(data);
    });
  }
  
  // ✅ Disconnect
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export default new CustomerSocketService();
```

---

### **Usage in React Component:**

```javascript
import React, { useEffect, useState } from 'react';
import customerSocket from './services/customerSocket';

function CustomerOrderPage() {
  const [orders, setOrders] = useState([]);
  const [sessionToken, setSessionToken] = useState(null);
  
  useEffect(() => {
    // Get session token from URL or storage
    const token = localStorage.getItem('qr_session_token');
    if (token) {
      setSessionToken(token);
      
      // Connect to socket
      customerSocket.connect(token);
      
      // Listen for order events
      customerSocket.onOrderCreated((data) => {
        console.log('New order created:', data);
        setOrders(prev => [...prev, data]);
        
        // Show notification
        showNotification('Order confirmed!', data.orderNumber);
      });
      
      customerSocket.onOrderStatusChanged((data) => {
        console.log('Order status changed:', data);
        
        // Update order in list
        setOrders(prev => prev.map(order => 
          order.orderId === data.orderId 
            ? { ...order, status: data.newStatus }
            : order
        ));
        
        // Show notification
        showNotification(data.message, data.orderNumber);
      });
    }
    
    // Cleanup
    return () => {
      customerSocket.disconnect();
    };
  }, []);
  
  function showNotification(message, orderNumber) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(message, {
        body: `Order #${orderNumber}`,
        icon: '/logo.png',
      });
    }
  }
  
  return (
    <div>
      <h1>Your Orders</h1>
      {orders.map(order => (
        <OrderCard key={order.orderId} order={order} />
      ))}
    </div>
  );
}
```

---

## 🔄 Real-Time Events for QR Customers

### **Events Customer Receives:**

| Event | Description | Payload |
|-------|-------------|---------|
| `connection:confirmed` | Connection established | `{ tableId, merchantId, branchId }` |
| `order:created` | Order placed successfully | `{ orderId, orderNumber, status, items, totalAmount, estimatedTime }` |
| `order:status_changed` | Order status updated | `{ orderId, orderNumber, oldStatus, newStatus, message }` |
| `order:item_ready` | Individual item ready | `{ orderId, itemId, itemName }` |
| `table:bill_ready` | Bill generated | `{ orderId, totalAmount, billUrl }` |

### **Events Customer Can Emit:**

| Event | Description | Payload |
|-------|-------------|---------|
| `customer:ready` | Client ready | `{}` |
| `customer:request_waiter` | Call waiter | `{ tableId, requestType: 'assistance' }` |
| `customer:request_bill` | Request bill | `{ tableId }` |

---

## 🎯 Socket Room Structure

### **Staff Rooms:**
```
branch:{branchId}                          → All staff in branch
branch:{branchId}:perm:ORDER_VIEW         → Staff with order view permission
branch:{branchId}:perm:ORDER_MANAGE       → Staff with order management
user:{userId}                              → Specific user
```

### **Customer Rooms:**
```
table:{tableId}                            → All customers at table
customer:{customerId}                      → Specific registered customer
merchant:{merchantId}:customer            → All customers in restaurant
```

---

## 🧪 Testing Socket Connection

### **Test Script:**

```javascript
// test-customer-socket.js
const io = require('socket.io-client');

const SESSION_TOKEN = 'your-session-token-here';

const socket = io('http://localhost:8000', {
  auth: {
    sessionToken: SESSION_TOKEN,
  },
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
  socket.emit('customer:ready');
});

socket.on('connection:confirmed', (data) => {
  console.log('✅ Connection confirmed:', data);
});

socket.on('order:created', (data) => {
  console.log('🎉 Order created:', data);
});

socket.on('order:status_changed', (data) => {
  console.log('📦 Status changed:', data);
});

socket.on('connect_error', (error) => {
  console.error('❌ Error:', error.message);
});

// Run: node test-customer-socket.js
```

---

## 📋 Summary

### **What You Need to Do:**

1. ✅ **Update `socket-server.ts`:**
   - Add `authenticateCustomerSocket()` function
   - Update `authenticateSocket()` to handle both staff and customers
   - Add customer-specific connection logic

2. ✅ **Update `OrderTransactionService.js`:**
   - Emit `order:created` event to `table:{tableId}` room

3. ✅ **Update `StatusSyncService.js`:**
   - Emit `order:status_changed` event to `table:{tableId}` room

4. ✅ **Frontend Implementation:**
   - Install `socket.io-client`
   - Create socket service with session token auth
   - Listen for order events
   - Show real-time notifications

---

## 🎉 Result

Customers scanning QR codes will:
- ✅ Get instant order confirmation
- ✅ See real-time status updates (preparing → ready → served)
- ✅ Receive notifications when food is ready
- ✅ Track their order progress live

No page refresh needed! 🚀
