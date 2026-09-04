# Frontend Integration Guide - Dining Session System

## Table of Contents
1. [Quick Start](#quick-start)
2. [Customer QR Flow (React)](#customer-qr-flow-react)
3. [Staff Dashboard (React)](#staff-dashboard-react)
4. [Socket.IO Integration](#socketio-integration)
5. [Vue.js Examples](#vuejs-examples)
6. [React Native Mobile App](#react-native-mobile-app)
7. [API Reference](#api-reference)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)

---

## Quick Start

### Prerequisites
```bash
npm install socket.io-client axios
# or
yarn add socket.io-client axios
```

### Base Configuration
```javascript
// config/api.js
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';
export const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000';
```

---

## Customer QR Flow (React)

### 1. QR Code Scanner Component

```javascript
// components/QRScanner.jsx
import React, { useState } from 'react';
import { QrReader } from 'react-qr-reader';
import { useNavigate } from 'react-router-dom';

export default function QRScanner() {
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleScan = async (result) => {
    if (!result) return;
    
    try {
      setScanning(false);
      
      // Parse QR code data
      const qrData = JSON.parse(result.text);
      // Expected format: { tableId, merchantId, branchId, token }
      
      console.log('QR Scanned:', qrData);
      
      // Navigate to menu with table info
      navigate('/menu', { state: { qrData } });
      
    } catch (err) {
      console.error('Invalid QR code:', err);
      setError('Invalid QR code. Please scan a valid table QR.');
      setScanning(true);
    }
  };

  const handleError = (err) => {
    console.error('QR Scanner Error:', err);
    setError('Camera access denied or unavailable.');
  };

  return (
    <div className="qr-scanner">
      <h2>Scan Table QR Code</h2>
      
      {scanning && (
        <QrReader
          onResult={handleScan}
          onError={handleError}
          constraints={{ facingMode: 'environment' }}
          style={{ width: '100%' }}
        />
      )}
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Try Again</button>
        </div>
      )}
      
      <div className="instructions">
        <p>Point your camera at the QR code on your table</p>
      </div>
    </div>
  );
}
```

### 2. Menu Page Component

```javascript
// pages/MenuPage.jsx
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export default function MenuPage() {
  const location = useLocation();
  const { qrData } = location.state || {};
  
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionInfo, setSessionInfo] = useState(null);

  useEffect(() => {
    if (qrData) {
      initializeSession();
      loadMenu();
    }
  }, [qrData]);

  // Initialize/validate session
  const initializeSession = async () => {
    try {
      // This endpoint validates QR and creates/reuses session
      const response = await axios.post(
        `${API_BASE_URL}/orders/validate-qr`,
        {
          tableId: qrData.tableId,
          merchantId: qrData.merchantId,
          branchId: qrData.branchId,
          token: qrData.token
        }
      );
      
      setSessionInfo(response.data.session);
      
      console.log('Session initialized:', {
        sessionId: response.data.session._id,
        tableNumber: response.data.session.tableNumber,
        isNew: response.data.isNew // true if you're first customer
      });
      
    } catch (error) {
      console.error('Session initialization failed:', error);
      alert('Failed to validate QR code. Please scan again.');
    }
  };

  const loadMenu = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/menu?branchId=${qrData.branchId}`
      );
      setMenu(response.data.items);
    } catch (error) {
      console.error('Failed to load menu:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item) => {
    const existing = cart.find(c => c._id === item._id);
    if (existing) {
      setCart(cart.map(c => 
        c._id === item._id 
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(c => c._id !== itemId));
  };

  const updateQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
    } else {
      setCart(cart.map(c => 
        c._id === itemId ? { ...c, quantity: newQuantity } : c
      ));
    }
  };

  if (loading) return <div>Loading menu...</div>;

  return (
    <div className="menu-page">
      {/* Table Info */}
      {sessionInfo && (
        <div className="table-info">
          <h3>Table {sessionInfo.tableNumber}</h3>
          <p>Order independently - others at your table can scan too!</p>
        </div>
      )}

      {/* Menu Items */}
      <div className="menu-items">
        {menu.map(item => (
          <MenuItem 
            key={item._id} 
            item={item} 
            onAdd={addToCart}
          />
        ))}
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <Cart 
          items={cart}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          qrData={qrData}
        />
      )}
    </div>
  );
}

// Menu Item Component
function MenuItem({ item, onAdd }) {
  return (
    <div className="menu-item">
      <img src={item.image} alt={item.name} />
      <h4>{item.name}</h4>
      <p>{item.description}</p>
      <p className="price">{item.price} ETB</p>
      <button onClick={() => onAdd(item)}>Add to Cart</button>
    </div>
  );
}
```

### 3. Cart & Checkout Component

```javascript
// components/Cart.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export default function Cart({ items, onUpdateQuantity, onRemove, qrData }) {
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const placeOrder = async () => {
    if (!customerName.trim()) {
      alert('Please enter your name');
      return;
    }

    setSubmitting(true);

    try {
      // Place order - backend will automatically link to session
      const response = await axios.post(`${API_BASE_URL}/orders`, {
        tableId: qrData.tableId,
        merchantId: qrData.merchantId,
        branchId: qrData.branchId,
        orderType: 'dine_in',
        customerName: customerName.trim(),
        items: items.map(item => ({
          menuItem: item._id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity
        })),
        // Backend will set session and source='qr' automatically
      });

      console.log('Order placed successfully:', response.data);
      
      setOrderSuccess(true);
      
      // Show order confirmation with order number
      alert(`Order placed! Order #${response.data.order.orderNumber}`);
      
      // Redirect to order tracking
      window.location.href = `/order-tracking?orderId=${response.data.order._id}`;
      
    } catch (error) {
      console.error('Order placement failed:', error);
      
      if (error.response?.data?.message) {
        alert(`Error: ${error.response.data.message}`);
      } else {
        alert('Failed to place order. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cart">
      <h3>Your Cart</h3>
      
      {items.map(item => (
        <div key={item._id} className="cart-item">
          <div className="item-info">
            <h4>{item.name}</h4>
            <p>{item.price} ETB x {item.quantity}</p>
          </div>
          
          <div className="item-controls">
            <button onClick={() => onUpdateQuantity(item._id, item.quantity - 1)}>
              -
            </button>
            <span>{item.quantity}</span>
            <button onClick={() => onUpdateQuantity(item._id, item.quantity + 1)}>
              +
            </button>
            <button onClick={() => onRemove(item._id)}>Remove</button>
          </div>
        </div>
      ))}

      <div className="cart-total">
        <h3>Total: {calculateTotal()} ETB</h3>
      </div>

      <div className="checkout">
        <input
          type="text"
          placeholder="Your name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          disabled={submitting}
        />
        
        <button 
          onClick={placeOrder}
          disabled={submitting || items.length === 0}
        >
          {submitting ? 'Placing Order...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
}
```

### 4. Order Tracking Component

```javascript
// pages/OrderTracking.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';

export default function OrderTracking() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    loadOrder();
    setupSocket();
    
    return () => {
      if (socket) socket.disconnect();
    };
  }, [orderId]);

  const loadOrder = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/orders/${orderId}`);
      setOrder(response.data.order);
    } catch (error) {
      console.error('Failed to load order:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = () => {
    const newSocket = io(SOCKET_URL);
    
    newSocket.on('connect', () => {
      console.log('Socket connected');
      
      // Subscribe to order updates
      newSocket.emit('join', `order:${orderId}`);
    });

    // Listen for order status changes
    newSocket.on('order:status-changed', (data) => {
      console.log('Order status changed:', data);
      
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          status: data.newStatus
        }));
        
        // Show notification
        showNotification(`Order status: ${data.newStatus}`);
      }
    });

    // Listen for item status changes
    newSocket.on('order:item-status-changed', (data) => {
      console.log('Item status changed:', data);
      
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          items: prev.items.map(item => 
            item._id === data.itemId
              ? { ...item, status: data.newStatus }
              : item
          )
        }));
      }
    });

    setSocket(newSocket);
  };

  const showNotification = (message) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Order Update', { body: message });
    }
  };

  if (loading) return <div>Loading order...</div>;
  if (!order) return <div>Order not found</div>;

  return (
    <div className="order-tracking">
      <h2>Order #{order.orderNumber}</h2>
      
      <div className="order-status">
        <OrderStatusBar status={order.status} />
      </div>

      <div className="order-items">
        <h3>Your Items</h3>
        {order.items.map(item => (
          <div key={item._id} className="order-item">
            <span>{item.name} x{item.quantity}</span>
            <span className={`status ${item.status}`}>
              {item.status}
            </span>
          </div>
        ))}
      </div>

      <div className="order-info">
        <p>Table: {order.table?.tableNumber}</p>
        <p>Total: {order.totalAmount} ETB</p>
        <p>Payment: {order.paymentStatus}</p>
      </div>
    </div>
  );
}

function OrderStatusBar({ status }) {
  const statuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];
  const currentIndex = statuses.indexOf(status);

  return (
    <div className="status-bar">
      {statuses.map((s, index) => (
        <div 
          key={s}
          className={`status-step ${index <= currentIndex ? 'active' : ''}`}
        >
          {s}
        </div>
      ))}
    </div>
  );
}
```

---

## Staff Dashboard (React)

### 1. Active Sessions View

```javascript
// pages/StaffDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';

export default function StaffDashboard() {
  const [activeSessions, setActiveSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [socket, setSocket] = useState(null);
  const branchId = localStorage.getItem('branchId'); // Assume stored on login

  useEffect(() => {
    loadActiveSessions();
    setupSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const loadActiveSessions = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/branches/${branchId}/active-sessions`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );
      
      setActiveSessions(response.data.sessions);
    } catch (error) {
      console.error('Failed to load active sessions:', error);
    }
  };

  const setupSocket = () => {
    const newSocket = io(SOCKET_URL, {
      auth: {
        token: localStorage.getItem('authToken')
      }
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      
      // Join branch room
      newSocket.emit('join', `branch:${branchId}:perm:ORDER_VIEW`);
    });

    // Listen for new sessions
    newSocket.on('session:created', (data) => {
      console.log('New session created:', data);
      
      // Add to active sessions list
      setActiveSessions(prev => [...prev, {
        _id: data.sessionId,
        table: { tableNumber: data.tableNumber },
        startedAt: data.startedAt,
        source: data.source
      }]);
      
      // Show notification
      showNotification(`New session at Table ${data.tableNumber}`);
      
      // Play sound
      playNotificationSound();
    });

    // Listen for ended sessions
    newSocket.on('session:ended', (data) => {
      console.log('Session ended:', data);
      
      // Remove from active sessions
      setActiveSessions(prev => 
        prev.filter(s => s._id !== data.sessionId)
      );
      
      // Show summary modal if needed
      if (selectedSession?._id === data.sessionId) {
        showSessionSummary(data.summary);
        setSelectedSession(null);
      }
    });

    // Listen for new orders
    newSocket.on('order:new', (order) => {
      console.log('New order:', order);
      
      // Update session order count
      setActiveSessions(prev => prev.map(session => 
        session._id === order.session
          ? { ...session, orderCount: (session.orderCount || 0) + 1 }
          : session
      ));
    });

    setSocket(newSocket);
  };

  const showNotification = (message) => {
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Restaurant Dashboard', { body: message });
    }
    
    // In-app toast
    // (use your toast library)
  };

  const playNotificationSound = () => {
    const audio = new Audio('/notification.mp3');
    audio.play().catch(err => console.log('Audio play failed:', err));
  };

  const showSessionSummary = (summary) => {
    alert(`Session Summary:
Orders: ${summary.orderCount}
Total: ${summary.totalAmount} ETB
QR Orders: ${summary.qrOrders}
Staff Orders: ${summary.staffOrders}`);
  };

  return (
    <div className="staff-dashboard">
      <h1>Active Tables</h1>
      
      <div className="sessions-grid">
        {activeSessions.map(session => (
          <SessionCard
            key={session._id}
            session={session}
            onClick={() => setSelectedSession(session)}
          />
        ))}
      </div>

      {selectedSession && (
        <SessionDetailsModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
}

function SessionCard({ session, onClick }) {
  const duration = calculateDuration(session.startedAt);
  
  return (
    <div className="session-card" onClick={onClick}>
      <h3>Table {session.table?.tableNumber}</h3>
      <p>Duration: {duration}</p>
      <p>Orders: {session.orderCount || 0}</p>
      <span className={`badge ${session.source}`}>
        {session.source}
      </span>
    </div>
  );
}

function calculateDuration(startedAt) {
  const start = new Date(startedAt);
  const now = new Date();
  const minutes = Math.floor((now - start) / 1000 / 60);
  
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
```

### 2. Session Details Modal

```javascript
// components/SessionDetailsModal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export default function SessionDetailsModal({ session, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionDetails();
  }, [session._id]);

  const loadSessionDetails = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/sessions/${session._id}/summary`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );
      
      setDetails(response.data.summary);
    } catch (error) {
      console.error('Failed to load session details:', error);
    } finally {
      setLoading(false);
    }
  };

  const closeTable = async (force = false) => {
    if (!force && details.unpaidOrders > 0) {
      const confirm = window.confirm(
        `There are ${details.unpaidOrders} unpaid orders. Close anyway?`
      );
      if (!confirm) return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/tables/${session.table._id}/close?force=${force}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );
      
      alert('Table closed successfully');
      onClose();
      
    } catch (error) {
      console.error('Failed to close table:', error);
      
      if (error.response?.data?.error?.code === 'UNPAID_ORDERS_EXIST') {
        const forceClose = window.confirm(
          `${error.response.data.message}\n\nForce close?`
        );
        if (forceClose) {
          closeTable(true);
        }
      } else {
        alert('Failed to close table');
      }
    }
  };

  if (loading) return <div className="modal">Loading...</div>;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Table {session.table?.tableNumber} - Session Details</h2>
        
        <div className="session-stats">
          <div className="stat">
            <label>Duration</label>
            <span>{details.duration}</span>
          </div>
          <div className="stat">
            <label>Orders</label>
            <span>{details.orderCount}</span>
          </div>
          <div className="stat">
            <label>Total Amount</label>
            <span>{details.totalAmount} ETB</span>
          </div>
          <div className="stat">
            <label>Payment Status</label>
            <span>
              {details.paidOrders} paid / {details.unpaidOrders} unpaid
            </span>
          </div>
        </div>

        <div className="order-breakdown">
          <h3>Order Breakdown</h3>
          <p>QR Orders: {details.qrOrders}</p>
          <p>Staff Orders: {details.staffOrders}</p>
        </div>

        <div className="orders-list">
          <h3>Orders</h3>
          {details.orders.map(order => (
            <div key={order.orderId} className="order-summary">
              <span>{order.orderNumber}</span>
              <span className={`badge ${order.source}`}>{order.source}</span>
              <span>{order.totalAmount} ETB</span>
              <span className={`status ${order.paymentStatus}`}>
                {order.paymentStatus}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button 
            onClick={() => closeTable(false)}
            disabled={details.unpaidOrders > 0}
            className="primary"
          >
            Close Table
          </button>
          {details.unpaidOrders > 0 && (
            <button 
              onClick={() => closeTable(true)}
              className="danger"
            >
              Force Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Socket.IO Integration

### Custom Hook for Socket.IO

```javascript
// hooks/useSocket.js
import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { SOCKET_URL } from '../config/api';

export function useSocket(room = null) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      auth: {
        token: localStorage.getItem('authToken')
      },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      setConnected(true);
      
      // Join room if specified
      if (room) {
        newSocket.emit('join', room);
        console.log('Joined room:', room);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [room]);

  return { socket, connected };
}

// Usage:
// const { socket, connected } = useSocket(`branch:${branchId}:perm:ORDER_VIEW`);
```

### Session Events Hook

```javascript
// hooks/useSessionEvents.js
import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';

export function useSessionEvents(branchId) {
  const { socket, connected } = useSocket(
    branchId ? `branch:${branchId}:perm:ORDER_VIEW` : null
  );
  
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!socket || !connected) return;

    // Listen for session:created
    socket.on('session:created', (data) => {
      console.log('Session created event:', data);
      
      setSessions(prev => [...prev, {
        _id: data.sessionId,
        tableId: data.tableId,
        tableNumber: data.tableNumber,
        startedAt: data.startedAt,
        source: data.source
      }]);
    });

    // Listen for session:ended
    socket.on('session:ended', (data) => {
      console.log('Session ended event:', data);
      
      setSessions(prev => prev.filter(s => s._id !== data.sessionId));
    });

    return () => {
      socket.off('session:created');
      socket.off('session:ended');
    };
  }, [socket, connected]);

  return { sessions, connected };
}

// Usage in component:
// const { sessions, connected } = useSessionEvents(branchId);
```

---

## Vue.js Examples

### QR Scanner (Vue 3 Composition API)

```vue
<!-- components/QRScanner.vue -->
<template>
  <div class="qr-scanner">
    <h2>Scan Table QR Code</h2>
    
    <QrcodeStream 
      v-if="scanning"
      @decode="onDecode"
      @init="onInit"
    />
    
    <div v-if="error" class="error">
      {{ error }}
      <button @click="error = null">Try Again</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { QrcodeStream } from 'vue3-qrcode-reader';

const router = useRouter();
const scanning = ref(true);
const error = ref(null);

const onDecode = async (result) => {
  try {
    scanning.value = false;
    
    const qrData = JSON.parse(result);
    
    // Navigate to menu
    router.push({
      name: 'menu',
      state: { qrData }
    });
    
  } catch (err) {
    error.value = 'Invalid QR code';
    scanning.value = true;
  }
};

const onInit = async (promise) => {
  try {
    await promise;
  } catch (err) {
    error.value = 'Camera access denied';
  }
};
</script>
```

### Staff Dashboard (Vue 3)

```vue
<!-- pages/StaffDashboard.vue -->
<template>
  <div class="staff-dashboard">
    <h1>Active Tables</h1>
    
    <div class="connection-status">
      <span :class="{ connected: socketConnected }">
        {{ socketConnected ? 'Connected' : 'Connecting...' }}
      </span>
    </div>
    
    <div class="sessions-grid">
      <SessionCard
        v-for="session in activeSessions"
        :key="session._id"
        :session="session"
        @click="selectedSession = session"
      />
    </div>
    
    <SessionDetailsModal
      v-if="selectedSession"
      :session="selectedSession"
      @close="selectedSession = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';
import SessionCard from '../components/SessionCard.vue';
import SessionDetailsModal from '../components/SessionDetailsModal.vue';

const activeSessions = ref([]);
const selectedSession = ref(null);
const socketConnected = ref(false);
let socket = null;

const branchId = localStorage.getItem('branchId');

onMounted(() => {
  loadActiveSessions();
  setupSocket();
});

onUnmounted(() => {
  if (socket) socket.disconnect();
});

const loadActiveSessions = async () => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/branches/${branchId}/active-sessions`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`
        }
      }
    );
    
    const data = await response.json();
    activeSessions.value = data.sessions;
    
  } catch (error) {
    console.error('Failed to load sessions:', error);
  }
};

const setupSocket = () => {
  socket = io(SOCKET_URL, {
    auth: {
      token: localStorage.getItem('authToken')
    }
  });

  socket.on('connect', () => {
    socketConnected.value = true;
    socket.emit('join', `branch:${branchId}:perm:ORDER_VIEW`);
  });

  socket.on('disconnect', () => {
    socketConnected.value = false;
  });

  socket.on('session:created', (data) => {
    activeSessions.value.push({
      _id: data.sessionId,
      table: { tableNumber: data.tableNumber },
      startedAt: data.startedAt,
      source: data.source
    });
    
    // Notification
    new Notification('New Session', {
      body: `Table ${data.tableNumber}`
    });
  });

  socket.on('session:ended', (data) => {
    activeSessions.value = activeSessions.value.filter(
      s => s._id !== data.sessionId
    );
  });
};
</script>
```

---

## React Native Mobile App

### QR Scanner (React Native)

```javascript
// screens/QRScannerScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Camera } from 'expo-camera';
import { BarCodeScanner } from 'expo-barcode-scanner';

export default function QRScannerScreen({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);

  React.useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    
    setScanned(true);

    try {
      const qrData = JSON.parse(data);
      
      // Navigate to menu
      navigation.navigate('Menu', { qrData });
      
    } catch (error) {
      Alert.alert(
        'Invalid QR Code',
        'Please scan a valid table QR code',
        [{ text: 'OK', onPress: () => setScanned(false) }]
      );
    }
  };

  if (hasPermission === null) {
    return <Text>Requesting camera permission...</Text>;
  }

  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        barCodeScannerSettings={{
          barCodeTypes: [BarCodeScanner.Constants.BarCodeType.qr],
        }}
      />
      
      <View style={styles.overlay}>
        <Text style={styles.instructions}>
          Point camera at table QR code
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructions: {
    color: 'white',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
  },
});
```

### Order Tracking (React Native)

```javascript
// screens/OrderTrackingScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { io } from 'socket.io-client';
import { SOCKET_URL, API_BASE_URL } from '../config/api';

export default function OrderTrackingScreen({ route }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    loadOrder();
    setupSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const loadOrder = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/${orderId}`);
      const data = await response.json();
      setOrder(data.order);
    } catch (error) {
      console.error('Failed to load order:', error);
    }
  };

  const setupSocket = () => {
    const newSocket = io(SOCKET_URL);

    newSocket.on('connect', () => {
      newSocket.emit('join', `order:${orderId}`);
    });

    newSocket.on('order:status-changed', (data) => {
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          status: data.newStatus
        }));
      }
    });

    newSocket.on('order:item-status-changed', (data) => {
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          items: prev.items.map(item =>
            item._id === data.itemId
              ? { ...item, status: data.newStatus }
              : item
          )
        }));
      }
    });

    setSocket(newSocket);
  };

  if (!order) return <Text>Loading...</Text>;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.orderNumber}>Order #{order.orderNumber}</Text>
      
      <View style={styles.statusBar}>
        <OrderStatusIndicator status={order.status} />
      </View>

      <Text style={styles.sectionTitle}>Your Items</Text>
      {order.items.map(item => (
        <View key={item._id} style={styles.item}>
          <Text>{item.name} x{item.quantity}</Text>
          <Text style={styles.itemStatus}>{item.status}</Text>
        </View>
      ))}

      <View style={styles.info}>
        <Text>Table: {order.table?.tableNumber}</Text>
        <Text>Total: {order.totalAmount} ETB</Text>
        <Text>Payment: {order.paymentStatus}</Text>
      </View>
    </ScrollView>
  );
}

function OrderStatusIndicator({ status }) {
  const statuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];
  const currentIndex = statuses.indexOf(status);

  return (
    <View style={styles.statusIndicator}>
      {statuses.map((s, index) => (
        <View
          key={s}
          style={[
            styles.statusDot,
            index <= currentIndex && styles.statusDotActive
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  orderNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusBar: {
    marginBottom: 30,
  },
  statusIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusDot: {
    width: 50,
    height: 10,
    backgroundColor: '#ddd',
    borderRadius: 5,
  },
  statusDotActive: {
    backgroundColor: '#4CAF50',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#f5f5f5',
    marginBottom: 10,
    borderRadius: 8,
  },
  itemStatus: {
    color: '#666',
    fontStyle: 'italic',
  },
  info: {
    marginTop: 30,
    padding: 15,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
});
```

---

## API Reference

### Base URLs
```javascript
const API_BASE_URL = 'http://localhost:3000/api/v1';
const SOCKET_URL = 'http://localhost:3000';
```

### Authentication
```javascript
// Include in all authenticated requests
headers: {
  'Authorization': `Bearer ${authToken}`,
  'Content-Type': 'application/json'
}
```

### Endpoints

#### 1. Validate QR & Initialize Session
```http
POST /api/v1/orders/validate-qr
```

**Request:**
```javascript
{
  "tableId": "60d5ec49f1b2c8b5f8e4a7b3",
  "merchantId": "60d5ec49f1b2c8b5f8e4a7b1",
  "branchId": "60d5ec49f1b2c8b5f8e4a7b2",
  "token": "abc123..."
}
```

**Response:**
```javascript
{
  "success": true,
  "session": {
    "_id": "...",
    "table": "...",
    "tableNumber": "T-101",
    "status": "active",
    "startedAt": "2024-01-15T10:30:00Z",
    "token": "..."
  },
  "isNew": false  // true if you're first customer
}
```

#### 2. Place Order
```http
POST /api/v1/orders
```

**Request:**
```javascript
{
  "tableId": "60d5ec49f1b2c8b5f8e4a7b3",
  "merchantId": "60d5ec49f1b2c8b5f8e4a7b1",
  "branchId": "60d5ec49f1b2c8b5f8e4a7b2",
  "orderType": "dine_in",
  "customerName": "John Doe",
  "items": [
    {
      "menuItem": "...",
      "name": "Burger",
      "quantity": 1,
      "unitPrice": 150,
      "totalPrice": 150
    }
  ]
}
// Backend automatically sets session and source='qr'
```

**Response:**
```javascript
{
  "success": true,
  "order": {
    "_id": "...",
    "orderNumber": "#QR-001",
    "session": "...",  // Linked to dining session
    "source": "qr",    // Automatically set
    "status": "pending",
    "totalAmount": 150
  }
}
```

#### 3. Get Order Details
```http
GET /api/v1/orders/:orderId
```

**Response:**
```javascript
{
  "success": true,
  "order": {
    "_id": "...",
    "orderNumber": "#QR-001",
    "session": "...",
    "table": {
      "_id": "...",
      "tableNumber": "T-101"
    },
    "status": "preparing",
    "paymentStatus": "unpaid",
    "items": [...],
    "totalAmount": 150
  }
}
```

#### 4. Get Active Sessions (Staff)
```http
GET /api/v1/branches/:branchId/active-sessions
Authorization: Bearer <token>
```

**Response:**
```javascript
{
  "success": true,
  "sessions": [
    {
      "_id": "...",
      "table": {
        "_id": "...",
        "tableNumber": "T-101"
      },
      "startedAt": "2024-01-15T10:30:00Z",
      "status": "active",
      "orderCount": 3
    }
  ]
}
```

#### 5. Get Session Summary (Staff)
```http
GET /api/v1/sessions/:sessionId/summary
Authorization: Bearer <token>
```

**Response:**
```javascript
{
  "success": true,
  "summary": {
    "sessionId": "...",
    "tableId": "...",
    "status": "active",
    "startedAt": "2024-01-15T10:30:00Z",
    "duration": "45 minutes",
    "orderCount": 3,
    "totalAmount": 450,
    "paidOrders": 2,
    "unpaidOrders": 1,
    "qrOrders": 2,
    "staffOrders": 1,
    "orders": [...]
  }
}
```

#### 6. Close Table (Staff)
```http
POST /api/v1/tables/:tableId/close?force=false
Authorization: Bearer <token>
```

**Response (Success):**
```javascript
{
  "success": true,
  "message": "Table closed successfully",
  "session": {
    "sessionId": "...",
    "tableNumber": "T-101",
    "status": "ended",
    "duration": "45 minutes",
    "summary": {
      "orderCount": 3,
      "totalAmount": 450,
      "paidOrders": 3,
      "unpaidOrders": 0
    }
  }
}
```

**Response (Error - Unpaid Orders):**
```javascript
{
  "success": false,
  "message": "Cannot close session: 2 unpaid order(s) remaining",
  "error": {
    "code": "UNPAID_ORDERS_EXIST",
    "unpaidOrderIds": ["...", "..."],
    "unpaidOrderNumbers": ["#001", "#002"],
    "unpaidCount": 2
  }
}
```

---

## Error Handling

### Global Error Handler

```javascript
// utils/errorHandler.js
export function handleApiError(error) {
  if (error.response) {
    // Server responded with error
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        return {
          message: data.message || 'Invalid request',
          code: data.error?.code
        };
        
      case 401:
        // Unauthorized - redirect to login
        localStorage.removeItem('authToken');
        window.location.href = '/login';
        return { message: 'Please log in again' };
        
      case 403:
        return { message: 'Access denied' };
        
      case 404:
        return { message: 'Not found' };
        
      case 500:
        return { message: 'Server error. Please try again.' };
        
      default:
        return { message: data.message || 'Something went wrong' };
    }
    
  } else if (error.request) {
    // Request made but no response
    return { message: 'Network error. Check your connection.' };
    
  } else {
    // Something else happened
    return { message: error.message || 'Unknown error' };
  }
}

// Usage:
try {
  await placeOrder();
} catch (error) {
  const { message, code } = handleApiError(error);
  
  if (code === 'UNPAID_ORDERS_EXIST') {
    // Handle specific error
  } else {
    alert(message);
  }
}
```

### Retry Logic for Network Errors

```javascript
// utils/apiClient.js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
});

// Add retry logic
apiClient.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;
    
    // Don't retry if already retried 3 times
    if (!config || !config.retry || config.__retryCount >= 3) {
      return Promise.reject(error);
    }
    
    // Increment retry count
    config.__retryCount = config.__retryCount || 0;
    config.__retryCount += 1;
    
    // Wait before retry (exponential backoff)
    const delay = Math.pow(2, config.__retryCount) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry request
    return apiClient(config);
  }
);

export default apiClient;
```

---

## Best Practices

### 1. Store QR Data Securely

```javascript
// Don't store sensitive data in localStorage
// Use sessionStorage for temporary data

// Good:
sessionStorage.setItem('qrData', JSON.stringify(qrData));

// Better: Use secure state management
import { create } from 'zustand';

const useQRStore = create((set) => ({
  qrData: null,
  setQRData: (data) => set({ qrData: data }),
  clearQRData: () => set({ qrData: null })
}));
```

### 2. Handle Socket Reconnection

```javascript
socket.on('disconnect', () => {
  console.log('Socket disconnected');
  
  // Show reconnecting indicator
  setConnectionStatus('reconnecting');
});

socket.on('connect', () => {
  console.log('Socket reconnected');
  
  // Re-join rooms
  socket.emit('join', `branch:${branchId}:perm:ORDER_VIEW`);
  
  // Reload data
  loadActiveSessions();
  
  setConnectionStatus('connected');
});
```

### 3. Optimize Re-renders

```javascript
// Use React.memo for list items
const SessionCard = React.memo(({ session, onClick }) => {
  // Component logic
}, (prevProps, nextProps) => {
  return prevProps.session._id === nextProps.session._id;
});

// Use useCallback for event handlers
const handleCloseTable = useCallback((tableId) => {
  closeTable(tableId);
}, []);
```

### 4. Implement Offline Support

```javascript
// Use service worker for offline caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Queue orders when offline
import localforage from 'localforage';

async function placeOrderWithOfflineSupport(orderData) {
  if (!navigator.onLine) {
    // Save to local queue
    await localforage.setItem(`pending-order-${Date.now()}`, orderData);
    alert('Order saved. Will be submitted when online.');
    return;
  }
  
  // Submit immediately
  await submitOrder(orderData);
}

// Sync when online
window.addEventListener('online', async () => {
  const keys = await localforage.keys();
  const pendingOrders = keys.filter(k => k.startsWith('pending-order-'));
  
  for (const key of pendingOrders) {
    const orderData = await localforage.getItem(key);
    try {
      await submitOrder(orderData);
      await localforage.removeItem(key);
    } catch (error) {
      console.error('Failed to sync order:', error);
    }
  }
});
```

### 5. Add Loading States

```javascript
// Use loading states for better UX
const [loading, setLoading] = useState({
  sessions: false,
  closeTable: false
});

const closeTable = async (tableId) => {
  setLoading(prev => ({ ...prev, closeTable: true }));
  
  try {
    await api.post(`/tables/${tableId}/close`);
  } finally {
    setLoading(prev => ({ ...prev, closeTable: false }));
  }
};

// In JSX:
<button disabled={loading.closeTable}>
  {loading.closeTable ? 'Closing...' : 'Close Table'}
</button>
```

---

## Complete Example: Customer Flow

```javascript
// App.jsx - Complete customer flow
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import QRScanner from './components/QRScanner';
import MenuPage from './pages/MenuPage';
import OrderTracking from './pages/OrderTracking';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<QRScanner />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/order-tracking" element={<OrderTracking />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## Testing Your Integration

### Test Checklist

**Customer Flow:**
- [ ] QR code scanner works on mobile
- [ ] Multiple customers can scan same QR
- [ ] Orders are placed successfully
- [ ] Real-time updates show in order tracking
- [ ] Notifications work

**Staff Dashboard:**
- [ ] Socket.IO connects successfully
- [ ] New sessions appear in real-time
- [ ] Session details load correctly
- [ ] Close table works (with/without unpaid orders)
- [ ] Force close works
- [ ] Sound notifications play

**Error Handling:**
- [ ] Invalid QR code handled
- [ ] Network errors show friendly message
- [ ] Unpaid orders prevent table close
- [ ] Auth token expiry redirects to login

---

## Support

For issues or questions:
- Check browser console for errors
- Verify Socket.IO connection status
- Test API endpoints with Postman
- Review backend logs for session-related events

---

*Happy coding! 🚀*
