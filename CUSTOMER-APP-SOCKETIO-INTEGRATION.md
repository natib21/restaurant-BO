# Customer QR App - Socket.IO Integration Guide

Your Socket.io service is well-structured! Here's how to use it in your customer app to track orders in real-time.

---

## 📋 Socket Events Reference

### **Events from Backend → Frontend**

```javascript
// Order status changed (pending → accepted → preparing → ready → served)
socket.on('order:status_changed', (data) => {
  // data = { orderId, status, timestamp }
  // Example: { orderId: "6a95...", status: "preparing", timestamp: "2026-09-01T10:05:00Z" }
});

// Individual item status changed (e.g., burger item ready)
socket.on('order:item_status_changed', (data) => {
  // data = { orderId, itemId, itemName, status, timestamp }
  // Example: { orderId: "6a95...", itemId: "6a94...", itemName: "Burger", status: "ready", timestamp: "2026-09-01T10:05:30Z" }
});

// New order notification (for staff, not customers)
socket.on('order:new', (data) => {
  // Not used in customer app
});
```

### **Events from Frontend → Backend**

```javascript
// Join order room to receive updates
socket.emit('order:join', { orderId });

// Leave order room (stop receiving updates)
socket.emit('order:leave', { orderId });
```

---

## 🎯 React Implementation

### **1. Setup Socket Service**

Create `src/services/socketService.js` with your provided code.

### **2. Hook for Order Tracking (Custom Hook)**

```javascript
// src/hooks/useOrderTracking.js
import { useEffect, useState, useCallback } from 'react';
import socketService from '../services/socketService';

export const useOrderTracking = (orderId, sessionToken) => {
  const [orderStatus, setOrderStatus] = useState(null);
  const [itemStatuses, setItemStatuses] = useState({});
  const [isConnected, setIsConnected] = useState(false);

  // Connect to socket when component mounts
  useEffect(() => {
    if (!sessionToken) return;

    socketService.connect(sessionToken);
    
    // Join order room
    if (orderId) {
      socketService.joinOrderRoom(orderId);
    }

    // Listen for status changes
    const handleOrderStatusChange = (data) => {
      if (data.orderId === orderId) {
        setOrderStatus({
          status: data.status,
          timestamp: data.timestamp
        });
      }
    };

    const handleItemStatusChange = (data) => {
      if (data.orderId === orderId) {
        setItemStatuses(prev => ({
          ...prev,
          [data.itemId]: {
            itemName: data.itemName,
            status: data.status,
            timestamp: data.timestamp
          }
        }));
      }
    };

    const handleConnectionChange = (state) => {
      setIsConnected(state === 'connected');
    };

    socketService.onOrderStatusChanged(handleOrderStatusChange);
    socketService.onItemStatusChanged(handleItemStatusChange);
    socketService.onConnectionChange(handleConnectionChange);

    return () => {
      socketService.offOrderStatusChanged(handleOrderStatusChange);
      socketService.offItemStatusChanged(handleItemStatusChange);
      socketService.offConnectionChange(handleConnectionChange);
      
      if (orderId) {
        socketService.leaveOrderRoom(orderId);
      }
    };
  }, [orderId, sessionToken]);

  return {
    orderStatus,
    itemStatuses,
    isConnected,
    connectionState: socketService.connectionState
  };
};
```

### **3. Order Tracking Component**

```javascript
// src/components/OrderTracking.jsx
import React, { useEffect, useState } from 'react';
import { useOrderTracking } from '../hooks/useOrderTracking';

const OrderTracking = ({ orderId, sessionToken }) => {
  const { orderStatus, itemStatuses, isConnected, connectionState } = useOrderTracking(orderId, sessionToken);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch initial order details
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/v1/orders/${orderId}`,
          {
            headers: {
              'Authorization': `Bearer ${sessionToken}`
            }
          }
        );
        const data = await response.json();
        if (data.success) {
          setOrder(data.data.order);
        }
      } catch (error) {
        console.error('Failed to fetch order:', error);
      } finally {
        setLoading(false);
      }
    };

    if (orderId && sessionToken) {
      fetchOrder();
    }
  }, [orderId, sessionToken]);

  if (loading) return <div>Loading order...</div>;
  if (!order) return <div>Order not found</div>;

  const getStatusColor = (status) => {
    const colors = {
      pending: '#FFA500',
      accepted: '#4169E1',
      preparing: '#FF6347',
      ready: '#32CD32',
      served: '#90EE90',
      completed: '#228B22',
    };
    return colors[status] || '#666';
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: 'Order Placed',
      accepted: 'Accepted by Kitchen',
      preparing: 'Being Prepared',
      ready: 'Ready to Serve',
      served: 'Served',
      completed: 'Completed',
    };
    return labels[status] || status;
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
      {/* Order Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2>Order #{order.orderNumber}</h2>
        <p>Table: {order.table?.tableNumber || 'N/A'}</p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          Connection: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </p>
      </div>

      {/* Overall Order Status */}
      <div style={{
        padding: '15px',
        backgroundColor: 'white',
        borderRadius: '8px',
        marginBottom: '20px',
        borderLeft: `5px solid ${getStatusColor(orderStatus?.status || order.status)}`
      }}>
        <h3>Order Status</h3>
        <p style={{ fontSize: '18px', fontWeight: 'bold' }}>
          {getStatusLabel(orderStatus?.status || order.status)}
        </p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          {orderStatus?.timestamp && `Updated: ${new Date(orderStatus.timestamp).toLocaleTimeString()}`}
        </p>
      </div>

      {/* Item-Level Status */}
      <div>
        <h3>Your Items</h3>
        {order.items?.map((item) => {
          const itemStatus = itemStatuses[item._id] || {};
          return (
            <div
              key={item._id}
              style={{
                padding: '12px',
                backgroundColor: 'white',
                borderRadius: '8px',
                marginBottom: '10px',
                borderLeft: `5px solid ${getStatusColor(itemStatus.status || 'pending')}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontWeight: 'bold', margin: '0' }}>
                    {item.menuItem?.name || item.name} x {item.quantity}
                  </p>
                  <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
                    ${item.totalPrice}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 'bold', margin: '0' }}>
                    {itemStatus.status ? getStatusLabel(itemStatus.status) : 'Pending'}
                  </p>
                  {itemStatus.timestamp && (
                    <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
                      {new Date(itemStatus.timestamp).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order Summary */}
      <div style={{
        padding: '15px',
        backgroundColor: 'white',
        borderRadius: '8px',
        marginTop: '20px'
      }}>
        <h4>Order Summary</h4>
        <p>Subtotal: ${order.subtotal}</p>
        <p style={{ fontWeight: 'bold', fontSize: '16px' }}>
          Total: ${order.totalAmount}
        </p>
      </div>
    </div>
  );
};

export default OrderTracking;
```

### **4. Usage in App**

```javascript
// src/pages/OrderPage.jsx
import React from 'react';
import OrderTracking from '../components/OrderTracking';
import { useSession } from '../hooks/useSession'; // Your session hook

const OrderPage = ({ orderId }) => {
  const { sessionToken } = useSession();

  if (!sessionToken) {
    return <div>Please scan QR code to continue</div>;
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Track Your Order</h1>
      <OrderTracking orderId={orderId} sessionToken={sessionToken} />
    </div>
  );
};

export default OrderPage;
```

---

## 🎯 Vue 3 Implementation

### **1. Composable for Order Tracking**

```javascript
// src/composables/useOrderTracking.js
import { ref, onMounted, onUnmounted } from 'vue';
import socketService from '../services/socketService';

export const useOrderTracking = (orderId, sessionToken) => {
  const orderStatus = ref(null);
  const itemStatuses = ref({});
  const isConnected = ref(false);
  const connectionState = ref('disconnected');

  const handleOrderStatusChange = (data) => {
    if (data.orderId === orderId.value) {
      orderStatus.value = {
        status: data.status,
        timestamp: data.timestamp
      };
    }
  };

  const handleItemStatusChange = (data) => {
    if (data.orderId === orderId.value) {
      itemStatuses.value[data.itemId] = {
        itemName: data.itemName,
        status: data.status,
        timestamp: data.timestamp
      };
    }
  };

  const handleConnectionChange = (state) => {
    connectionState.value = state;
    isConnected.value = state === 'connected';
  };

  onMounted(() => {
    if (!sessionToken.value) return;

    socketService.connect(sessionToken.value);
    
    if (orderId.value) {
      socketService.joinOrderRoom(orderId.value);
    }

    socketService.onOrderStatusChanged(handleOrderStatusChange);
    socketService.onItemStatusChanged(handleItemStatusChange);
    socketService.onConnectionChange(handleConnectionChange);
  });

  onUnmounted(() => {
    socketService.offOrderStatusChanged(handleOrderStatusChange);
    socketService.offItemStatusChanged(handleItemStatusChange);
    socketService.offConnectionChange(handleConnectionChange);
    
    if (orderId.value) {
      socketService.leaveOrderRoom(orderId.value);
    }
  });

  return {
    orderStatus,
    itemStatuses,
    isConnected,
    connectionState
  };
};
```

### **2. Order Tracking Component (Vue)**

```vue
<!-- src/components/OrderTracking.vue -->
<template>
  <div class="order-tracking">
    <!-- Loading State -->
    <div v-if="loading" class="loading">Loading order...</div>

    <!-- Order Not Found -->
    <div v-else-if="!order" class="error">Order not found</div>

    <!-- Order Details -->
    <div v-else class="order-container">
      <!-- Header -->
      <div class="order-header">
        <h2>Order #{{ order.orderNumber }}</h2>
        <p>Table: {{ order.table?.tableNumber || 'N/A' }}</p>
        <p class="connection-status">
          Connection: {{ isConnected ? '🟢 Connected' : '🔴 Disconnected' }}
        </p>
      </div>

      <!-- Overall Status -->
      <div class="status-card" :style="{ borderLeftColor: getStatusColor(currentStatus) }">
        <h3>Order Status</h3>
        <p class="status-label">{{ getStatusLabel(currentStatus) }}</p>
        <p class="timestamp" v-if="orderStatus?.timestamp">
          Updated: {{ formatTime(orderStatus.timestamp) }}
        </p>
      </div>

      <!-- Items -->
      <div class="items-section">
        <h3>Your Items</h3>
        <div
          v-for="item in order.items"
          :key="item._id"
          class="item-card"
          :style="{ borderLeftColor: getStatusColor(getItemStatus(item._id)) }"
        >
          <div class="item-info">
            <p class="item-name">{{ item.menuItem?.name || item.name }} x {{ item.quantity }}</p>
            <p class="item-price">${{ item.totalPrice }}</p>
          </div>
          <div class="item-status-info">
            <p class="status-label">{{ getStatusLabel(getItemStatus(item._id)) }}</p>
            <p class="timestamp" v-if="itemStatuses[item._id]?.timestamp">
              {{ formatTime(itemStatuses[item._id].timestamp) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Summary -->
      <div class="summary-card">
        <h4>Order Summary</h4>
        <p>Subtotal: ${{ order.subtotal }}</p>
        <p class="total">Total: ${{ order.totalAmount }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useOrderTracking } from '../composables/useOrderTracking';

const props = defineProps({
  orderId: String,
  sessionToken: String
});

const { orderStatus, itemStatuses, isConnected } = useOrderTracking(
  computed(() => props.orderId),
  computed(() => props.sessionToken)
);

const order = ref(null);
const loading = ref(true);

const currentStatus = computed(() => orderStatus.value?.status || order.value?.status);

onMounted(async () => {
  try {
    const response = await fetch(
      `http://localhost:8000/api/v1/orders/${props.orderId}`,
      {
        headers: {
          'Authorization': `Bearer ${props.sessionToken}`
        }
      }
    );
    const data = await response.json();
    if (data.success) {
      order.value = data.data.order;
    }
  } catch (error) {
    console.error('Failed to fetch order:', error);
  } finally {
    loading.value = false;
  }
});

const getStatusColor = (status) => {
  const colors = {
    pending: '#FFA500',
    accepted: '#4169E1',
    preparing: '#FF6347',
    ready: '#32CD32',
    served: '#90EE90',
    completed: '#228B22',
  };
  return colors[status] || '#666';
};

const getStatusLabel = (status) => {
  const labels = {
    pending: 'Order Placed',
    accepted: 'Accepted by Kitchen',
    preparing: 'Being Prepared',
    ready: 'Ready to Serve',
    served: 'Served',
    completed: 'Completed',
  };
  return labels[status] || status;
};

const getItemStatus = (itemId) => {
  return itemStatuses.value[itemId]?.status || 'pending';
};

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString();
};
</script>

<style scoped>
.order-tracking {
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.loading, .error {
  text-align: center;
  padding: 20px;
  color: #666;
}

.error {
  color: #d9534f;
}

.order-header {
  margin-bottom: 20px;
}

.connection-status {
  font-size: 12px;
  color: #666;
}

.status-card {
  padding: 15px;
  background-color: white;
  border-radius: 8px;
  margin-bottom: 20px;
  border-left: 5px solid;
}

.status-label {
  font-size: 18px;
  font-weight: bold;
  margin: 10px 0;
}

.timestamp {
  font-size: 12px;
  color: #666;
  margin: 5px 0 0 0;
}

.items-section {
  margin-top: 20px;
}

.item-card {
  padding: 12px;
  background-color: white;
  border-radius: 8px;
  margin-bottom: 10px;
  border-left: 5px solid;
  display: flex;
  justify-content: space-between;
}

.item-info {
  flex: 1;
}

.item-name {
  font-weight: bold;
  margin: 0;
}

.item-price {
  font-size: 12px;
  color: #666;
  margin: 5px 0 0 0;
}

.item-status-info {
  text-align: right;
}

.summary-card {
  padding: 15px;
  background-color: white;
  border-radius: 8px;
  margin-top: 20px;
}

.total {
  font-weight: bold;
  font-size: 16px;
}
</style>
```

---

## 🔧 Backend Socket Events (Reference)

Your backend emits these events:

```javascript
// Order status changed
socket.to(orderId).emit('order:status_changed', {
  orderId,
  status,        // 'pending' | 'accepted' | 'preparing' | 'ready' | 'served' | 'completed'
  timestamp      // ISO timestamp
});

// Item status changed
socket.to(orderId).emit('order:item_status_changed', {
  orderId,
  itemId,
  itemName,
  status,        // 'pending' | 'ready' | 'served' | 'served'
  timestamp
});
```

---

## 📝 Complete Workflow

### **1. Customer scans QR**
```javascript
const sessionToken = getTokenFromQR();
// sessionToken = "qr-test-token-xxx"
```

### **2. Customer places order**
```javascript
const order = await placeOrder({
  items: [...],
  table: "T-01"
}, sessionToken);
// order._id = "6a95..."
```

### **3. Customer views order with real-time updates**
```javascript
<OrderTracking orderId={order._id} sessionToken={sessionToken} />
// Socket connects automatically
// Listens for status changes
// UI updates in real-time when:
//   - Order status changes: pending → accepted → preparing → ready → served
//   - Individual items ready: burger → ready
```

### **4. Events received (real-time)**
```javascript
// Backend publishes to room "6a95..."
socket.to("6a95...").emit('order:status_changed', {
  orderId: "6a95...",
  status: "preparing",
  timestamp: "2026-09-01T10:05:00Z"
});

// Frontend receives and UI updates immediately
// "Order Status: Being Prepared"
```

---

## ✅ Features Included

- ✅ Real-time order status updates
- ✅ Item-level status tracking
- ✅ Automatic reconnection with backoff
- ✅ Connection state indicator (🟢 Connected / 🔴 Disconnected)
- ✅ Timestamp tracking for each update
- ✅ Color-coded status indicators
- ✅ Initial order fetch + socket updates
- ✅ Memory leak prevention (cleanup on unmount)

---

## 🚀 Deployment

### **Environment Variables**

```env
# React (.env)
VITE_BACKEND_URL=http://localhost:8000
# Or for production:
VITE_BACKEND_URL=https://api.yourrestaurant.com

# Vue (.env)
VUE_APP_BACKEND_URL=http://localhost:8000
```

### **Socket.io Configuration**

Your service auto-detects backend URL. Make sure it matches:
- Development: `http://localhost:8000`
- Production: `https://api.yourrestaurant.com`

---

## 🐛 Debugging

```javascript
// Enable detailed logging
socketService.socket?.on('*', (event, ...args) => {
  console.log('📡 Event:', event, args);
});

// Check connection state
console.log('Connection:', socketService.connectionState);
console.log('Connected:', socketService.isConnected);
console.log('Joined rooms:', socketService.joinedRooms);

// Check socket ID
console.log('Socket ID:', socketService.socket?.id);
```

---

## 📊 Status Flow Diagram

```
Customer Places Order
        ↓
   Pending ─→ Order placed by customer
        ↓
   Accepted ─→ Kitchen accepts order
        ↓
   Preparing ─→ Kitchen preparing items
        ↓
   Ready ─→ Items ready to serve
        ↓
   Served ─→ Delivered to customer
        ↓
   Completed ─→ Payment received
```

**Each transition triggers a real-time socket event that updates the customer's UI instantly!** 🎉
