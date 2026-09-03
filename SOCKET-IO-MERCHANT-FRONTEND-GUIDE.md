# Socket.IO Merchant/Waiter Frontend Integration Guide

## Overview

This guide explains exactly what your merchant/waiter frontend application needs to connect to Socket.IO and receive real-time order notifications.

---

## What the Backend Expects

### 1. Authentication Requirements

The backend Socket.IO server requires **JWT token authentication** for staff connections.

**Backend Code (socket-server.js):**
```javascript
async function authenticateStaffSocket(socket, next) {
  const token = socket.handshake.auth?.token ||
                socket.handshake.headers.authorization?.split(' ')?.[1];
  
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  // Verify JWT and load user with role/permissions
  const decoded = await verifyJwt(token, env.JWT_SECRET);
  const user = await User.findById(decoded.id)
    .populate('role') // Must have role with tasks
    .populate('merchant');
  
  if (!user || !user.isActive) {
    return next(new Error('User not found or inactive'));
  }
  
  socket.data.user = user;
  socket.data.userType = 'staff';
  socket.data.permissions = user.role?.tasks.map(t => t.name);
  
  next();
}
```

**What you need:**
- Valid JWT token from login
- User must be active (`isActive: true`)
- User must have a `role` populated with `tasks`
- User must belong to a `merchant`

---

## Frontend Implementation

### Step 1: Install Socket.IO Client

```bash
npm install socket.io-client
```

### Step 2: Create Socket Connection with JWT Token

**IMPORTANT:** You MUST send the JWT token in the `auth` object:

```typescript
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie'; // or your token storage method

const SOCKET_URL = 'http://localhost:8000'; // Your backend URL

// Get JWT token from wherever you store it
const token = Cookies.get('jwt'); // or localStorage.getItem('token')

if (!token) {
  console.error('No JWT token - cannot connect socket');
  return;
}

const socket = io(SOCKET_URL, {
  auth: {
    token: token  // ← REQUIRED! Backend expects this
  },
  transports: ['websocket'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

### Step 3: Handle Connection Events

```typescript
socket.on('connect', () => {
  console.log('✅ Socket connected:', socket.id);
  
  // CRITICAL: After connecting, join branch room
  socket.emit('setup:session', {
    branchId: currentBranchId  // The branch this user is working in
  });
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket connection failed:', error.message);
  // Common errors:
  // - "Authentication required" = No token provided
  // - "Invalid or expired token" = Token is invalid/expired
  // - "User not found or inactive" = User account issue
});

socket.on('disconnect', (reason) => {
  console.log('⚠️ Socket disconnected:', reason);
});
```

### Step 4: Join Branch Room (REQUIRED!)

After successful connection, you MUST emit `setup:session`:

```typescript
socket.emit('setup:session', {
  branchId: 'YOUR_BRANCH_ID'  // e.g., '6a9942a952620eac91b6e67e'
});
```

**Backend expects this event** and will:
1. Verify user has access to this branch
2. Join socket to `branch:{branchId}` room
3. Join socket to permission-specific rooms like `branch:{branchId}:perm:ORDER_VIEW`

**Backend Code:**
```javascript
socket.on('setup:session', ({ branchId }) => {
  // Verify user has access to branch
  const userBranchIds = Array.isArray(user.branch)
    ? user.branch.map(b => String(b._id ?? b))
    : [String(user.branch._id ?? user.branch)];
  
  if (!userBranchIds.includes(String(branchId))) {
    logger.warn(`Socket denied branch ${branchId}`);
    return;
  }
  
  // Join rooms
  socket.join(`branch:${branchId}`);
  
  // Join permission-specific rooms
  const permissions = socket.data.permissions || [];
  permissions.forEach(perm => {
    socket.join(`branch:${branchId}:perm:${perm}`);
  });
  
  logger.info(`User ${user._id} joined branch ${branchId}`);
});
```

### Step 5: Listen for Order Events

```typescript
// New order placed by customer
socket.on('order:new', (orderData) => {
  console.log('📥 NEW ORDER:', orderData);
  // orderData contains:
  // - _id: order ID
  // - orderNumber: display number (e.g., "001")
  // - status: "pending"
  // - source: "qr" or "pos"
  // - tableNumber: table number
  // - customerName: optional
  // - totalAmount: total price
  // - placedAt: timestamp
  // - branchId: branch ID
  
  // Update your UI, play sound, show notification
  playNotificationSound();
  showToast(`New Order #${orderData.orderNumber} from Table ${orderData.tableNumber}`);
  addOrderToList(orderData);
});

// Order status changed (accepted, preparing, ready, served, completed)
socket.on('order:status-changed', (data) => {
  console.log('📋 Order status changed:', data);
  // data contains:
  // - orderId
  // - oldStatus
  // - newStatus
  // - timestamp
  
  updateOrderStatus(data.orderId, data.newStatus);
});

// Individual item status changed
socket.on('order:item-status-changed', (data) => {
  console.log('📦 Item status changed:', data);
  // data contains:
  // - orderId
  // - itemId
  // - newStatus
  // - servedAt
  // - servedVia
  
  updateItemStatus(data.orderId, data.itemId, data.newStatus);
});

// Table status updated
socket.on('table:updated', (data) => {
  console.log('🪑 Table updated:', data);
  // data contains:
  // - tableId
  // - status: "available", "occupied", "reserved"
  
  updateTableStatus(data.tableId, data.status);
});

// Generic notifications
socket.on('notification', (data) => {
  console.log('🔔 Notification:', data);
  showNotification(data);
});
```

---

## Complete Example: React Context Provider

```typescript
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import Cookies from 'js-cookie';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000';

const SocketContext = createContext<Socket | null>(null);

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: React.ReactNode;
  user: any; // Your user type
  currentBranchId: string | null;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({
  children,
  user,
  currentBranchId,
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Only connect if we have user and branch
    if (!user || !currentBranchId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      return;
    }

    // Don't recreate socket if already exists
    if (socketRef.current) return;

    // Get JWT token
    const token = Cookies.get('jwt');
    if (!token) {
      console.error('❌ No JWT token found');
      toast.error('Authentication token missing');
      return;
    }

    console.log('🔌 Creating socket connection...');

    // Create socket with authentication
    const newSocket = io(SOCKET_URL, {
      auth: {
        token: token  // ← REQUIRED!
      },
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection handlers
    newSocket.on('connect', () => {
      console.log('✅ Socket connected:', newSocket.id);
      toast.success('Connected to real-time updates');

      // Join branch room (REQUIRED!)
      newSocket.emit('setup:session', {
        branchId: currentBranchId,
      });
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      toast.error(`Connection failed: ${error.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('⚠️ Disconnected:', reason);
      if (reason === 'io server disconnect') {
        toast.error('Disconnected from server');
      } else {
        toast.warning('Connection lost – reconnecting...');
      }
    });

    // Order event handlers
    newSocket.on('order:new', (orderData) => {
      console.log('📥 NEW ORDER:', orderData);
      toast.success(`New Order #${orderData.orderNumber}`, {
        description: `Table ${orderData.tableNumber} - ${orderData.totalAmount} ETB`,
      });
      // Dispatch to your state management, play sound, etc.
    });

    newSocket.on('order:status-changed', (data) => {
      console.log('📋 Order status changed:', data);
      toast.info(`Order #${data.orderId.slice(-6)} status: ${data.newStatus}`);
    });

    newSocket.on('order:item-status-changed', (data) => {
      console.log('📦 Item status changed:', data);
    });

    newSocket.on('table:updated', (data) => {
      console.log('🪑 Table updated:', data);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?._id, currentBranchId]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
```

---

## Usage in Components

```typescript
import { useSocket } from '@/contexts/SocketContext';

function OrdersPage() {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    // Listen for new orders
    const handleNewOrder = (orderData: any) => {
      console.log('New order in component:', orderData);
      // Update your local state
      setOrders(prev => [orderData, ...prev]);
      playSound();
    };

    socket.on('order:new', handleNewOrder);

    // Cleanup
    return () => {
      socket.off('order:new', handleNewOrder);
    };
  }, [socket]);

  return <div>Orders page</div>;
}
```

---

## Debugging Checklist

### 1. Check JWT Token
```typescript
const token = Cookies.get('jwt');
console.log('Has token:', !!token);
console.log('Token preview:', token?.substring(0, 20) + '...');
```

### 2. Check User Role & Permissions
Your user object must have:
```typescript
{
  _id: "user-id",
  isActive: true,
  role: {
    _id: "role-id",
    name: "Waiter",
    tasks: [
      { name: "View Order", ... },
      { name: "Manage Order", ... }
    ]
  },
  merchant: "merchant-id",
  branch: ["branch-id"] // or single branch object
}
```

### 3. Check Socket Connection
```typescript
console.log('Socket connected:', socket?.connected);
console.log('Socket ID:', socket?.id);
```

### 4. Check Backend Logs
When socket connects, you should see:
```
Staff socket connected: {socketId} user={userId}
User {userId} joined branch {branchId}
```

### 5. Test Event Reception
```typescript
// Add wildcard listener to see ALL events
socket?.onAny((eventName, ...args) => {
  console.log(`📡 Event: ${eventName}`, args);
});
```

---

## Common Errors & Solutions

### Error: "Authentication required"
**Cause:** No JWT token provided
**Solution:** Make sure you pass `auth: { token: yourToken }` in socket config

### Error: "Invalid or expired token"
**Cause:** JWT token is invalid or expired
**Solution:** 
1. Check token exists: `console.log(Cookies.get('jwt'))`
2. Verify token is valid (check expiry)
3. Re-login if needed

### Error: "User not found or inactive"
**Cause:** User account is inactive or doesn't exist
**Solution:** Check user exists in database and `isActive: true`

### Socket connects but no events received
**Cause:** Not calling `setup:session` or wrong branch ID
**Solution:** Make sure to emit `setup:session` after connection:
```typescript
socket.emit('setup:session', { branchId: correctBranchId });
```

### Backend logs show "Socket denied branch X"
**Cause:** User doesn't have access to that branch
**Solution:** Verify user.branch includes the branchId you're trying to join

---

## Required Permissions

For receiving `order:new` events, the user's role must have tasks that map to these permissions:
- `ORDER_VIEW` - Can see orders
- `ORDER_MANAGE` - Can manage orders

The backend emits to these rooms:
```javascript
io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', orderData);
io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', orderData);
```

So your user MUST have at least one of these permissions!

---

## Summary

**Required for Socket.IO connection:**
1. ✅ JWT token in `auth: { token: 'your-jwt' }`
2. ✅ User is active and has role with tasks
3. ✅ User belongs to a merchant
4. ✅ Call `socket.emit('setup:session', { branchId })` after connection
5. ✅ User has access to the branch (user.branch includes branchId)
6. ✅ User role has tasks that map to ORDER_VIEW or ORDER_MANAGE permissions
7. ✅ Listen for `order:new` event

**Backend will automatically:**
- Authenticate your JWT token
- Load your user with role/permissions
- Join you to branch rooms
- Emit events to your socket when orders are created/updated
