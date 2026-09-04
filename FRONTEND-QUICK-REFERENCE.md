# Frontend Quick Reference - Dining Session System

## 🚀 Quick Setup

```bash
npm install socket.io-client axios
```

```javascript
// config.js
export const API_BASE_URL = 'http://localhost:3000/api/v1';
export const SOCKET_URL = 'http://localhost:3000';
```

---

## 📱 Customer Flow (3 Steps)

### Step 1: Scan QR Code
```javascript
// Get QR data
const qrData = JSON.parse(scanResult);
// { tableId, merchantId, branchId, token }
```

### Step 2: Place Order
```javascript
const response = await axios.post(`${API_BASE_URL}/orders`, {
  tableId: qrData.tableId,
  merchantId: qrData.merchantId,
  branchId: qrData.branchId,
  orderType: 'dine_in',
  customerName: 'John Doe',
  items: [
    {
      menuItem: menuItemId,
      name: 'Burger',
      quantity: 1,
      unitPrice: 150,
      totalPrice: 150
    }
  ]
});
// Backend automatically links to session and sets source='qr'
```

### Step 3: Track Order
```javascript
import io from 'socket.io-client';

const socket = io(SOCKET_URL);
socket.emit('join', `order:${orderId}`);

socket.on('order:status-changed', (data) => {
  console.log('New status:', data.newStatus);
  // Update UI
});
```

---

## 👨‍💼 Staff Dashboard (2 Parts)

### Part 1: List Active Sessions
```javascript
// Load initial data
const response = await axios.get(
  `${API_BASE_URL}/branches/${branchId}/active-sessions`,
  { headers: { Authorization: `Bearer ${token}` } }
);

const activeSessions = response.data.sessions;
```

### Part 2: Real-Time Updates
```javascript
const socket = io(SOCKET_URL, {
  auth: { token: authToken }
});

// Join branch room
socket.emit('join', `branch:${branchId}:perm:ORDER_VIEW`);

// New session
socket.on('session:created', (data) => {
  // data: { sessionId, tableNumber, startedAt, source }
  addSessionToList(data);
});

// Session ended
socket.on('session:ended', (data) => {
  // data: { sessionId, summary: { orderCount, totalAmount, ... } }
  removeSessionFromList(data.sessionId);
  showSummary(data.summary);
});
```

---

## 🔌 Socket.IO Events Reference

### Subscribe to Rooms
```javascript
// Customer: subscribe to their order
socket.emit('join', `order:${orderId}`);

// Staff: subscribe to branch orders
socket.emit('join', `branch:${branchId}:perm:ORDER_VIEW`);
```

### Event: `session:created`
```javascript
socket.on('session:created', (data) => {
  /*
  data = {
    sessionId: string,
    tableId: string,
    tableNumber: string,
    branchId: string,
    source: 'qr' | 'staff',
    startedAt: Date,
    createdBy: string | null
  }
  */
});
```

### Event: `session:ended`
```javascript
socket.on('session:ended', (data) => {
  /*
  data = {
    sessionId: string,
    tableId: string,
    branchId: string,
    endedAt: Date,
    duration: string,
    closedBy: string,
    forced: boolean,
    summary: {
      orderCount: number,
      totalAmount: number,
      paidOrders: number,
      unpaidOrders: number
    }
  }
  */
});
```

### Event: `order:status-changed`
```javascript
socket.on('order:status-changed', (data) => {
  /*
  data = {
    orderId: string,
    orderNumber: string,
    oldStatus: string,
    newStatus: string,
    changedAt: Date
  }
  */
});
```

### Event: `order:item-status-changed`
```javascript
socket.on('order:item-status-changed', (data) => {
  /*
  data = {
    orderId: string,
    itemId: string,
    itemName: string,
    oldStatus: string,
    newStatus: string,
    changedAt: Date
  }
  */
});
```

---

## 🎯 API Endpoints Cheat Sheet

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/orders/validate-qr` | No | Initialize session |
| POST | `/orders` | No | Place order |
| GET | `/orders/:id` | No | Get order details |
| GET | `/branches/:id/active-sessions` | Yes | List active sessions |
| GET | `/sessions/:id/summary` | Yes | Get session details |
| POST | `/tables/:id/close` | Yes | Close table |

### Close Table Endpoint
```javascript
// Normal close (requires all paid)
POST /api/v1/tables/:tableId/close?force=false

// Force close (allows unpaid)
POST /api/v1/tables/:tableId/close?force=true

// Response
{
  success: true,
  message: 'Table closed successfully',
  session: {
    sessionId: '...',
    tableNumber: 'T-101',
    duration: '45 minutes',
    summary: { orderCount: 3, totalAmount: 450, ... }
  }
}

// Error: Unpaid orders
{
  success: false,
  message: 'Cannot close session: 2 unpaid order(s) remaining',
  error: {
    code: 'UNPAID_ORDERS_EXIST',
    unpaidOrderIds: ['...', '...'],
    unpaidCount: 2
  }
}
```

---

## 🎨 React Hooks

### useSocket Hook
```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function useSocket(room) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('authToken') }
    });

    newSocket.on('connect', () => {
      setConnected(true);
      if (room) newSocket.emit('join', room);
    });

    newSocket.on('disconnect', () => setConnected(false));

    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, [room]);

  return { socket, connected };
}

// Usage:
const { socket, connected } = useSocket(`branch:${branchId}:perm:ORDER_VIEW`);
```

### useSessionEvents Hook
```javascript
export function useSessionEvents(branchId) {
  const { socket, connected } = useSocket(
    `branch:${branchId}:perm:ORDER_VIEW`
  );
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!socket || !connected) return;

    socket.on('session:created', (data) => {
      setSessions(prev => [...prev, data]);
    });

    socket.on('session:ended', (data) => {
      setSessions(prev => prev.filter(s => s.sessionId !== data.sessionId));
    });

    return () => {
      socket.off('session:created');
      socket.off('session:ended');
    };
  }, [socket, connected]);

  return { sessions, connected };
}

// Usage:
const { sessions, connected } = useSessionEvents(branchId);
```

---

## 🐛 Error Handling

### Handle API Errors
```javascript
try {
  await placeOrder();
} catch (error) {
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        if (data.error?.code === 'UNPAID_ORDERS_EXIST') {
          // Handle unpaid orders
          const forceClose = confirm(
            `${data.error.unpaidCount} unpaid orders. Close anyway?`
          );
          if (forceClose) closeTable(true);
        } else {
          alert(data.message);
        }
        break;
        
      case 401:
        // Redirect to login
        window.location.href = '/login';
        break;
        
      case 404:
        alert('Not found');
        break;
        
      default:
        alert('Something went wrong');
    }
  } else {
    alert('Network error');
  }
}
```

### Handle Socket Disconnection
```javascript
socket.on('disconnect', () => {
  showBanner('Connection lost. Reconnecting...');
});

socket.on('connect', () => {
  hideBanner();
  
  // Re-join rooms
  socket.emit('join', roomName);
  
  // Reload data
  loadLatestData();
});
```

---

## ✅ Testing Checklist

### Customer App
- [ ] QR scanner works on mobile
- [ ] Can scan same QR multiple times (different customers)
- [ ] Orders place successfully
- [ ] Real-time updates work
- [ ] Offline handling (if implemented)

### Staff Dashboard
- [ ] Socket connects on page load
- [ ] Active sessions load
- [ ] New session notifications appear
- [ ] Session details modal works
- [ ] Close table works (normal + force)
- [ ] Session ended notification appears

### Error Scenarios
- [ ] Invalid QR code handled
- [ ] Network error shown
- [ ] Unpaid orders prevent close
- [ ] Force close works after unpaid error
- [ ] Auth expiry redirects to login

---

## 🎯 Common Patterns

### Notification System
```javascript
// Browser notification
if ('Notification' in window) {
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
  
  if (Notification.permission === 'granted') {
    new Notification('New Session', {
      body: `Table ${tableNumber}`,
      icon: '/icon.png'
    });
  }
}

// In-app toast (using react-hot-toast)
import toast from 'react-hot-toast';

socket.on('session:created', (data) => {
  toast.success(`New session at Table ${data.tableNumber}`);
});
```

### Loading States
```javascript
const [loading, setLoading] = useState(false);

const handleAction = async () => {
  setLoading(true);
  try {
    await performAction();
  } finally {
    setLoading(false);
  }
};

return (
  <button disabled={loading}>
    {loading ? 'Processing...' : 'Submit'}
  </button>
);
```

### Optimistic Updates
```javascript
// Update UI immediately, rollback on error
const closeTable = async (tableId) => {
  // Optimistic update
  setSessions(prev => prev.filter(s => s.table._id !== tableId));
  
  try {
    await api.post(`/tables/${tableId}/close`);
  } catch (error) {
    // Rollback
    loadSessions();
    alert('Failed to close table');
  }
};
```

---

## 📦 Package.json Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-router-dom": "^6.14.0",
    "socket.io-client": "^4.6.0",
    "axios": "^1.4.0",
    "react-qr-reader": "^3.0.0",
    "react-hot-toast": "^2.4.1"
  }
}
```

---

## 🔗 Useful Resources

- **Backend Docs:** `DINING-SESSION-SYSTEM-DOCUMENTATION.md`
- **Full Integration Guide:** `FRONTEND-INTEGRATION-GUIDE.md`
- **API Tests:** `tests/task-9-integration-full-flow.test.js`

---

## 💡 Pro Tips

1. **Always check socket connection status** before showing real-time features
2. **Store auth token** in httpOnly cookies when possible (more secure)
3. **Implement retry logic** for failed API calls
4. **Add loading states** for all async operations
5. **Test on actual mobile devices** - camera/QR scanner behaves differently
6. **Handle offline scenarios** - queue orders if offline
7. **Use optimistic updates** for better perceived performance
8. **Add sound notifications** for staff dashboard (new sessions/orders)
9. **Implement session timeout** on frontend (auto-logout)
10. **Log Socket.IO events** during development for debugging

---

*Quick reference for dining session frontend integration*
