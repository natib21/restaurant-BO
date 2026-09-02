# Socket.IO Integration Guide - QR Customer Application

## 🎯 Overview

Real-time order status updates for customers using QR code scanning. Customer sees order status change in real-time as: **Pending → Accepted → Preparing → Ready → Served**

---

## 🏗️ Backend Status: ✅ READY

Your backend already has Socket.IO configured for customers in:
- **File:** `src/infrastructure/websocket/socket-server.ts`
- **Features:**
  - ✅ Customer session token authentication
  - ✅ Automatic order room joining
  - ✅ Order status event broadcasting

---

## 📋 Real-Time Order Status Flow

```
Customer places order
       ↓
Backend creates order (status: pending)
       ↓
emit('order:new') to staff via WebSocket
       ↓
Staff accepts order
       ↓
emit('order:status_changed', {status: 'accepted'}) to customer via WebSocket
       ↓
Customer sees: "Order Accepted!" ✅
       ↓
Staff marks order as preparing
       ↓
emit('order:status_changed', {status: 'preparing'}) to customer
       ↓
Customer sees: "Order Preparing..." 👨‍🍳
       ↓
Staff marks order as ready
       ↓
emit('order:status_changed', {status: 'ready'}) to customer
       ↓
Customer sees: "Order Ready for Pickup! 📍" 
       ↓
Staff marks order as served
       ↓
emit('order:status_changed', {status: 'served'}) to customer
       ↓
Customer sees: "Order Served!" ✅
```

---

## 🚀 Frontend Implementation

### **1. Install Socket.IO Client**

```bash
npm install socket.io-client
```

### **2. Create Socket Service (React)**

**File:** `src/services/socket.js`

```javascript
import io from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
  }

  /**
   * Connect to WebSocket server using session token
   * @param {string} sessionToken - JWT session token from QR login
   */
  connect(sessionToken) {
    if (this.isConnected) return;

    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

    this.socket = io(BACKEND_URL, {
      auth: {
        sessionToken: sessionToken,  // ✅ Pass session token from customer session
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // Connection established
    this.socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
      this.isConnected = true;
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
    });

    // Disconnected
    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from WebSocket:', reason);
      this.isConnected = false;
    });
  }

  /**
   * Join a specific order room to receive updates
   * @param {string} orderId - Order ID
   */
  joinOrderRoom(orderId) {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('order:join', { orderId });
    console.log(`Joined order room: ${orderId}`);
  }

  /**
   * Listen for order status changes
   * @param {function} callback - Function to call when status changes
   */
  onOrderStatusChanged(callback) {
    if (!this.socket) return;
    this.socket.on('order:status_changed', (data) => {
      console.log('📢 Order status changed:', data);
      callback(data);
    });
  }

  /**
   * Listen for new order notifications
   * @param {function} callback
   */
  onOrderNew(callback) {
    if (!this.socket) return;
    this.socket.on('order:new', (order) => {
      console.log('📢 New order:', order);
      callback(order);
    });
  }

  /**
   * Listen for item-level status changes
   * @param {function} callback
   */
  onItemStatusChanged(callback) {
    if (!this.socket) return;
    this.socket.on('order:item_status_changed', (data) => {
      console.log('📢 Item status changed:', data);
      callback(data);
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
    }
  }
}

export default new SocketService();
```

### **3. React Hook for Order Tracking**

**File:** `src/hooks/useOrderStatus.js`

```javascript
import { useEffect, useState } from 'react';
import socketService from '../services/socket';

export const useOrderStatus = (orderId, sessionToken) => {
  const [orderStatus, setOrderStatus] = useState(null);
  const [itemStatuses, setItemStatuses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Connect to WebSocket if not already connected
    if (!socketService.isConnected && sessionToken) {
      socketService.connect(sessionToken);
    }

    // Join order room
    if (orderId) {
      socketService.joinOrderRoom(orderId);

      // Listen for order status updates
      socketService.onOrderStatusChanged((data) => {
        if (data.orderId === orderId) {
          setOrderStatus(data.status);
          console.log(`Order status updated: ${data.status}`);
        }
      });

      // Listen for item status updates
      socketService.onItemStatusChanged((data) => {
        if (data.orderId === orderId) {
          setItemStatuses(prev => [
            ...prev.filter(item => item.itemId !== data.itemId),
            {
              itemId: data.itemId,
              itemName: data.itemName,
              status: data.status,
            }
          ]);
        }
      });

      setIsLoading(false);
    }

    // Cleanup
    return () => {
      // Don't disconnect - keep listening for other orders
    };
  }, [orderId, sessionToken]);

  return {
    orderStatus,
    itemStatuses,
    isLoading,
  };
};
```

### **4. Order Status Component**

**File:** `src/components/OrderTracker.jsx`

```javascript
import React from 'react';
import { useOrderStatus } from '../hooks/useOrderStatus';

export function OrderTracker({ orderId, sessionToken }) {
  const { orderStatus, itemStatuses, isLoading } = useOrderStatus(orderId, sessionToken);

  const getStatusIcon = (status) => {
    const icons = {
      pending: '⏳',
      accepted: '✅',
      preparing: '👨‍🍳',
      ready: '📍',
      served: '🎉',
      completed: '✅',
      canceled: '❌',
    };
    return icons[status] || '❓';
  };

  const getStatusMessage = (status) => {
    const messages = {
      pending: 'Your order is pending...',
      accepted: 'Your order has been accepted!',
      preparing: 'Your order is being prepared...',
      ready: 'Your order is ready for pickup!',
      served: 'Your order has been served!',
      completed: 'Order completed',
      canceled: 'Order was canceled',
    };
    return messages[status] || 'Unknown status';
  };

  if (isLoading) {
    return <div className="loading">Connecting to order tracking...</div>;
  }

  return (
    <div className="order-tracker">
      <div className="order-status">
        <h2>Order #{orderId.substring(0, 8)}</h2>
        
        <div className="status-display">
          <span className="status-icon">{getStatusIcon(orderStatus)}</span>
          <span className="status-text">{getStatusMessage(orderStatus)}</span>
        </div>

        <div className="order-timeline">
          <div className={`timeline-item ${orderStatus === 'pending' ? 'active' : ''}`}>
            <span>Pending</span>
          </div>
          <div className={`timeline-item ${orderStatus === 'accepted' ? 'active' : ''}`}>
            <span>Accepted</span>
          </div>
          <div className={`timeline-item ${orderStatus === 'preparing' ? 'active' : ''}`}>
            <span>Preparing</span>
          </div>
          <div className={`timeline-item ${orderStatus === 'ready' ? 'active' : ''}`}>
            <span>Ready</span>
          </div>
          <div className={`timeline-item ${orderStatus === 'served' ? 'active' : ''}`}>
            <span>Served</span>
          </div>
        </div>

        {itemStatuses.length > 0 && (
          <div className="item-statuses">
            <h3>Items:</h3>
            {itemStatuses.map(item => (
              <div key={item.itemId} className="item-status">
                <span>{item.itemName}</span>
                <span className="item-status-badge">{item.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### **5. React App Integration**

**File:** `src/pages/OrderDetails.jsx`

```javascript
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { OrderTracker } from '../components/OrderTracker';
import socketService from '../services/socket';

export function OrderDetailsPage() {
  const { orderId } = useParams();
  const [sessionToken, setSessionToken] = useState(null);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    // Get session token from localStorage (stored after QR login)
    const token = localStorage.getItem('sessionToken');
    setSessionToken(token);

    // Fetch order details
    const fetchOrder = async () => {
      const response = await fetch(`http://localhost:8000/api/v1/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setOrder(data.data);
    };

    if (token && orderId) {
      fetchOrder();
    }
  }, [orderId]);

  return (
    <div className="order-details-page">
      <h1>Order Details</h1>
      
      {order && sessionToken && (
        <>
          <div className="order-items">
            {order.items.map(item => (
              <div key={item._id} className="order-item">
                <h3>{item.name}</h3>
                <p>Quantity: {item.quantity}</p>
                <p>Price: {item.price}</p>
              </div>
            ))}
          </div>

          {/* Real-time status tracking */}
          <OrderTracker orderId={orderId} sessionToken={sessionToken} />
        </>
      )}
    </div>
  );
}
```

### **6. CSS Styling (Optional)**

**File:** `src/styles/OrderTracker.css`

```css
.order-tracker {
  padding: 20px;
  border-radius: 8px;
  background: #f8f9fa;
  margin-top: 20px;
}

.status-display {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 24px;
  margin: 20px 0;
}

.status-icon {
  font-size: 48px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.order-timeline {
  display: flex;
  justify-content: space-between;
  margin: 30px 0;
  position: relative;
}

.order-timeline::before {
  content: '';
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  height: 2px;
  background: #ddd;
  z-index: 0;
}

.timeline-item {
  flex: 1;
  text-align: center;
  position: relative;
  z-index: 1;
  background: white;
  padding: 10px;
}

.timeline-item::before {
  content: '';
  display: block;
  width: 40px;
  height: 40px;
  background: #ddd;
  border-radius: 50%;
  margin: 0 auto 10px;
  border: 3px solid white;
}

.timeline-item.active::before {
  background: #4CAF50;
  box-shadow: 0 0 0 4px rgba(76, 175, 80, 0.2);
}

.item-statuses {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ddd;
}

.item-status {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  align-items: center;
}

.item-status-badge {
  background: #007bff;
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
}
```

---

## 📡 Backend Event Emissions

Your backend needs to emit these events. Check if already implemented:

### **When Order Status Changes**

```javascript
// In order status update handler
const { getIo } = require('../infrastructure/websocket/socket-server');
const io = getIo();

// Emit to customer via order room
io.to(`order:${orderId}`).emit('order:status_changed', {
  orderId: orderId,
  status: 'accepted',  // or 'preparing', 'ready', 'served'
  timestamp: new Date(),
});
```

### **When Item Status Changes**

```javascript
// When individual item status changes (e.g., burger ready but fries not)
io.to(`order:${orderId}`).emit('order:item_status_changed', {
  orderId: orderId,
  itemId: itemId,
  itemName: 'Burger',
  status: 'ready',
  timestamp: new Date(),
});
```

---

## 🔐 Authentication Flow

### **Customer QR Session Token**

1. **Customer scans QR** → Gets `sessionToken`
2. **Stores in localStorage:**
   ```javascript
   localStorage.setItem('sessionToken', sessionToken);
   ```
3. **Passes to Socket.IO:**
   ```javascript
   const socket = io(BACKEND_URL, {
     auth: {
       sessionToken: sessionToken  // ✅ Backend validates this
     }
   });
   ```
4. **Backend validates** via `authenticateCustomerSocket()` in socket-server.ts

---

## 🧪 Testing Socket Connection

### **Test 1: Check Connection**

```javascript
// In browser console
import socketService from './services/socket';

socketService.connect('your-session-token');
// Should see: "✅ Connected to WebSocket server"
```

### **Test 2: Simulate Order Status Change**

```javascript
// In backend terminal (Node.js REPL)
const { getIo } = require('./src/infrastructure/websocket/socket-server');
const io = getIo();

// Emit test event
io.to('order:6a95332832bc68bc64ec6b679').emit('order:status_changed', {
  orderId: '6a95332832bc68bc64ec6b679',
  status: 'accepted',
  timestamp: new Date(),
});
```

### **Test 3: Browser DevTools**

```javascript
// In browser console
socketService.socket.off('order:status_changed');
socketService.socket.on('order:status_changed', (data) => {
  console.log('📢 Received:', data);
});
// Now trigger event from backend
```

---

## 📋 Complete Example: QR Order Checkout to Served

### **1. Customer Scans QR**
```javascript
// 1. Get session token
const response = await fetch('/api/v1/sessions/start?data=...&s=...');
const session = await response.json();
localStorage.setItem('sessionToken', session.data.token);

// 2. Connect socket
socketService.connect(session.data.token);
```

### **2. Customer Places Order**
```javascript
const orderResponse = await fetch('/api/v1/orders', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Authorization': `Bearer ${sessionToken}` },
  body: JSON.stringify({
    items: [{ menuItemId: '...', quantity: 2, price: 100 }],
    table: 'T-01',
    totalAmount: 200,
  })
});

const order = await orderResponse.json();
const orderId = order.data.order._id;

// 3. Redirect to order tracking page
navigate(`/orders/${orderId}`);
```

### **3. Real-Time Updates Received**

```
[Customer sees] ⏳ Your order is pending...

[Staff accepts order]
[Socket emits] order:status_changed { status: 'accepted' }
[Customer sees] ✅ Your order has been accepted!

[Staff marks preparing]
[Socket emits] order:status_changed { status: 'preparing' }
[Customer sees] 👨‍🍳 Your order is being prepared...

[Staff marks ready]
[Socket emits] order:status_changed { status: 'ready' }
[Customer sees] 📍 Your order is ready for pickup!

[Customer picks up order]
[Staff marks served]
[Socket emits] order:status_changed { status: 'served' }
[Customer sees] 🎉 Your order has been served!
```

---

## 📱 Vue 3 Alternative (If using Vue)

**File:** `src/composables/useOrderStatus.js`

```javascript
import { ref, onMounted, onBeforeUnmount } from 'vue';
import socketService from '@/services/socket';

export function useOrderStatus(orderId, sessionToken) {
  const orderStatus = ref(null);
  const itemStatuses = ref([]);
  const isLoading = ref(true);

  onMounted(() => {
    if (!socketService.isConnected && sessionToken) {
      socketService.connect(sessionToken);
    }

    if (orderId) {
      socketService.joinOrderRoom(orderId);

      socketService.onOrderStatusChanged((data) => {
        if (data.orderId === orderId) {
          orderStatus.value = data.status;
        }
      });

      socketService.onItemStatusChanged((data) => {
        if (data.orderId === orderId) {
          const index = itemStatuses.value.findIndex(
            item => item.itemId === data.itemId
          );
          if (index >= 0) {
            itemStatuses.value[index].status = data.status;
          } else {
            itemStatuses.value.push({
              itemId: data.itemId,
              itemName: data.itemName,
              status: data.status,
            });
          }
        }
      });

      isLoading.value = false;
    }
  });

  onBeforeUnmount(() => {
    // Keep socket alive for other components
  });

  return {
    orderStatus,
    itemStatuses,
    isLoading,
  };
}
```

---

## ✅ Checklist

- [ ] Socket.IO client installed (`npm install socket.io-client`)
- [ ] Socket service created with session token auth
- [ ] Order tracker component implemented
- [ ] Frontend passes `sessionToken` to Socket.IO
- [ ] Backend emits `order:status_changed` events
- [ ] Backend emits `order:item_status_changed` events for items
- [ ] Socket connection tested in DevTools
- [ ] Order status updates appear in real-time
- [ ] Handles reconnection automatically
- [ ] Cleanup on component unmount (optional)

---

## 🎯 Summary

**Backend:** ✅ Ready with customer socket authentication
**Frontend:** Needs Socket.IO service + React hooks/Vue composables
**Data Flow:** Customer → Order placed → Socket.IO room created → Real-time status updates

Your customers will see live order updates as they progress through the kitchen! 🚀
