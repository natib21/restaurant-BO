# WebSocket Authentication Guide

## 🐛 Problem

Your Socket.ts is receiving: `CONNECT ERROR: Authentication required`

This means the frontend is not sending the JWT token during the WebSocket handshake.

---

## ✅ Solution

Your backend expects the JWT token in one of these locations:

### **Option 1: Via Authentication Headers (Recommended)**

```javascript
// Frontend - Socket.io Client
import io from 'socket.io-client';

// Get JWT from HTTP-only cookie (browser sends automatically)
// OR from your auth state if you store it temporarily

const socket = io('http://localhost:8000', {
  // ✅ Option A: Browser sends cookie automatically
  withCredentials: true,  // ✅ Include HTTP-only cookies
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});
```

**Problem:** HTTP-only cookies are NOT accessible to JavaScript during WebSocket handshake with standard socket.io client.

---

### **Option 2: Extract Token from Response Header (Better)**

After login, extract the token from the response:

```javascript
// 1. Login and get token from response
async function login(email, password) {
  const response = await fetch('http://localhost:8000/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',  // ✅ Store JWT in HTTP-only cookie
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();
  
  // ✅ The response includes the token
  console.log('Token:', data.token);
  
  // Store in sessionStorage (not localStorage - more secure)
  sessionStorage.setItem('jwtToken', data.token);
  
  return data;
}

// 2. Connect to WebSocket WITH token
async function connectSocket() {
  const token = sessionStorage.getItem('jwtToken');
  
  if (!token) {
    console.error('No token - please login first');
    return;
  }

  const socket = io('http://localhost:8000', {
    auth: {
      token: token  // ✅ Send token in auth object
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  socket.on('connect', () => {
    console.log('✅ WebSocket connected!');
  });

  socket.on('connect_error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('WebSocket disconnected:', reason);
  });

  return socket;
}

// Usage:
const user = await login('staff@restaurant.com', 'password');
const socket = await connectSocket();
```

---

### **Option 3: For Customer QR Sessions**

For QR customers, pass the session token:

```javascript
// Customer login via QR
async function loginCustomerWithQR() {
  const response = await fetch('http://localhost:8000/api/v1/sessions/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      m: merchantId,
      b: branchId,
      t: tableId
    })
  });

  const data = await response.json();
  const sessionToken = data.data.token;  // ✅ Extract session token
  
  // Connect with session token
  const socket = io('http://localhost:8000', {
    auth: {
      sessionToken: sessionToken  // ✅ Different from JWT!
    }
  });

  socket.on('connect', () => {
    console.log('✅ Customer socket connected!');
  });

  return socket;
}
```

---

## 🎯 Complete React Example

### **Staff Dashboard with WebSocket**

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function StaffDashboard() {
  const [socket, setSocket] = useState(null);
  const [orders, setOrders] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Login first
    const login = async () => {
      try {
        // 1. HTTP login - get JWT token
        const response = await fetch('http://localhost:8000/api/v1/auth/login', {
          method: 'POST',
          credentials: 'include',  // ✅ Store JWT cookie
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'staff@restaurant.com',
            password: 'password123'
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.message);
        }

        // 2. Extract token for WebSocket
        const token = data.token;
        sessionStorage.setItem('jwtToken', token);

        // 3. Connect WebSocket with token
        const newSocket = io('http://localhost:8000', {
          auth: {
            token: token  // ✅ Send JWT token
          },
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5
        });

        // Connection events
        newSocket.on('connect', () => {
          console.log('✅ WebSocket connected!');
          setConnected(true);
          
          // Setup session for branch
          newSocket.emit('setup:session', {
            branchId: data.data.user.branch._id
          });
        });

        newSocket.on('connect_error', (error) => {
          console.error('❌ WebSocket connection error:', error);
          setConnected(false);
        });

        newSocket.on('disconnect', (reason) => {
          console.log('WebSocket disconnected:', reason);
          setConnected(false);
        });

        // Listen for new orders
        newSocket.on('order:new', (order) => {
          console.log('🆕 New order:', order);
          setOrders(prev => [order, ...prev]);
        });

        // Listen for table updates
        newSocket.on('table:updated', (data) => {
          console.log('📍 Table updated:', data);
        });

        // Listen for notifications
        newSocket.on('notification', (data) => {
          console.log('📢 Notification:', data);
        });

        setSocket(newSocket);

      } catch (error) {
        console.error('Login failed:', error);
      }
    };

    login();

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  if (!connected) {
    return <div>⏳ Connecting...</div>;
  }

  return (
    <div className="dashboard">
      <h1>Staff Dashboard</h1>
      <p>Status: {connected ? '✅ Connected' : '❌ Disconnected'}</p>
      
      <div className="orders">
        <h2>Live Orders</h2>
        {orders.map(order => (
          <div key={order.id} className="order-card">
            <h3>Order #{order.orderNumber}</h3>
            <p>Table: {order.table}</p>
            <p>Items: {order.items.length}</p>
            <p>Amount: {order.totalAmount} Br</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StaffDashboard;
```

---

### **Customer QR App with WebSocket**

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function QRMenu() {
  const [socket, setSocket] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);

  useEffect(() => {
    const startSession = async () => {
      try {
        // 1. Start session (QR code parsed)
        const urlParams = new URLSearchParams(window.location.search);
        const encodedData = urlParams.get('data');
        const signature = urlParams.get('s');

        const response = await fetch(
          `http://localhost:8000/api/v1/sessions/start?data=${encodedData}&s=${signature}`,
          { method: 'POST' }
        );

        const data = await response.json();
        const sessionToken = data.data.token;  // ✅ Get session token

        sessionStorage.setItem('sessionToken', sessionToken);

        // 2. Connect WebSocket with session token
        const newSocket = io('http://localhost:8000', {
          auth: {
            sessionToken: sessionToken  // ✅ Use session token for customers
          }
        });

        newSocket.on('connect', () => {
          console.log('✅ Connected to order updates');
        });

        // Listen for order status updates
        newSocket.on('order:status_updated', (update) => {
          console.log('📦 Order status:', update.status);
          setOrderStatus(update);
        });

        newSocket.on('connect_error', (error) => {
          console.error('❌ Connection error:', error);
        });

        setSocket(newSocket);

      } catch (error) {
        console.error('Session failed:', error);
      }
    };

    startSession();

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  return (
    <div className="qr-menu">
      <h1>Your Menu</h1>
      {orderStatus && (
        <div className="status">
          <h2>Order Status: {orderStatus.status}</h2>
          <p>Items ready: {orderStatus.readyCount}/{orderStatus.totalItems}</p>
        </div>
      )}
    </div>
  );
}

export default QRMenu;
```

---

## 🔑 Key Points

### **Staff WebSocket Connection Flow:**
```
1. User logs in with email/password
2. Backend returns JWT token
3. Frontend stores token in sessionStorage
4. Frontend connects WebSocket with auth: { token }
5. Backend verifies JWT
6. Connection established ✅
```

### **Customer WebSocket Connection Flow:**
```
1. Customer scans QR code
2. Frontend calls /sessions/start
3. Backend returns session token
4. Frontend stores session token
5. Frontend connects WebSocket with auth: { sessionToken }
6. Backend verifies session token
7. Connection established ✅
```

---

## 🚨 Common Mistakes

### ❌ Mistake 1: No Token Sent
```javascript
// ❌ WRONG - No auth object
const socket = io('http://localhost:8000');
```

### ❌ Mistake 2: Wrong Token Variable
```javascript
// ❌ WRONG - Trying to access HTTP-only cookie
const token = document.cookie.split('jwt=')[1];
const socket = io('http://localhost:8000', { auth: { token } });
```

### ❌ Mistake 3: Connecting Before Login
```javascript
// ❌ WRONG - Token doesn't exist yet
const socket = io('http://localhost:8000', { 
  auth: { token: sessionStorage.getItem('jwtToken') }  // null!
});

// Then login
login(email, password);
```

### ✅ Correct: Login First, Then Connect
```javascript
// ✅ CORRECT
async function init() {
  // 1. Login and get token
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  
  // 2. Store token
  sessionStorage.setItem('jwtToken', data.token);
  
  // 3. THEN connect socket
  const socket = io('http://localhost:8000', {
    auth: { token: data.token }
  });
}
```

---

## 📋 Implementation Checklist

- [ ] Install `socket.io-client`: `npm install socket.io-client`
- [ ] Login endpoint returns token in response
- [ ] Store token in sessionStorage (not localStorage)
- [ ] Create Socket.io connection after login
- [ ] Pass token in `auth: { token }` object
- [ ] Handle `connect`, `connect_error`, `disconnect` events
- [ ] Emit `setup:session` with branchId for staff
- [ ] Listen for real-time events (`order:new`, `order:status_updated`, etc.)
- [ ] Cleanup socket on component unmount

---

## ✅ Testing

### **Test 1: Check Token is Being Sent**
```javascript
const socket = io('http://localhost:8000', {
  auth: { token: 'test-token' }
});

socket.on('connect_error', (error) => {
  console.log('Error:', error.message);
  // Should say "Invalid or expired token" (not "Authentication required")
  // If it says "Authentication required", token wasn't sent
});
```

### **Test 2: Verify Connection Works**
```javascript
socket.on('connect', () => {
  console.log('✅ Connected! Socket ID:', socket.id);
});

// Should see the message immediately after emitting auth
```

---

## 🎯 Fix Your Current Implementation

**Right now:**
1. ✅ Your backend WebSocket auth is correct
2. ❌ Your frontend is not sending token during handshake

**To fix:**
1. Login first and extract `data.token` from response
2. Pass token in Socket.io auth: `{ auth: { token } }`
3. Test with React example above

---

Done! Your WebSocket should now connect with authentication. 🎉
