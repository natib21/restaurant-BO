# Socket.IO Frontend Integration Guide - Order Status Updates

## Overview

Your backend now emits real-time socket events whenever order or item statuses change. This guide shows how to listen to these events and update your frontend UI in real-time.

---

## Quick Start

### 1. Install Socket.IO Client

```bash
npm install socket.io-client
```

### 2. Connect to Server

```javascript
import io from 'socket.io-client';

const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3000');

// Verify connection
socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

---

## Socket Events: Item-Level Updates

### Event: `order:item-status-changed`

Fired **EVERY TIME** an order item's status changes (pending → in_progress → ready → served).

#### Listen:
```javascript
socket.on('order:item-status-changed', (data) => {
  const { orderId, itemId, newStatus, servedAt, servedVia } = data;
  
  console.log(`Order ${orderId}: Item ${itemId} → ${newStatus}`);
  
  // Update your local state
  setOrders(orders => 
    orders.map(order => {
      if (order._id === orderId) {
        return {
          ...order,
          items: order.items.map(item => 
            item._id === itemId 
              ? { ...item, status: newStatus, servedAt, servedVia }
              : item
          )
        };
      }
      return order;
    })
  );
});
```

#### Payload:
```javascript
{
  orderId: "6a903c76...",
  itemId: "6a903c76...",
  newStatus: "in_progress",        // "pending", "in_progress", "ready", "served"
  servedAt: "2026-08-27T13:30:00Z",  // null if not served yet
  servedVia: "manual"                // "manual" or "auto"
}
```

---

## Socket Events: Order-Level Updates

### Event: `order:status-changed`

Fired **ONLY WHEN** the order's derived status actually changes (preparing → ready → served).

**Important:** This event does NOT fire on every item change. It only fires when the order's overall status transitions.

#### Listen:
```javascript
socket.on('order:status-changed', (data) => {
  const { orderId, oldStatus, newStatus, timestamp } = data;
  
  console.log(`Order ${orderId}: ${oldStatus} → ${newStatus}`);
  
  // Update order status
  setOrders(orders =>
    orders.map(order =>
      order._id === orderId 
        ? { ...order, status: newStatus }
        : order
    )
  );
  
  // Show notification if needed
  if (newStatus === 'ready') {
    showNotification(`Order ${orderId} is ready!`);
  } else if (newStatus === 'served') {
    showNotification(`Order ${orderId} served`);
  }
});
```

#### Payload:
```javascript
{
  orderId: "6a903c76...",
  oldStatus: "preparing",
  newStatus: "ready",
  timestamp: "2026-08-27T13:30:00Z"
}
```

---

## Join Order Room on Load

When you load an order, join a room for real-time updates:

```javascript
useEffect(() => {
  if (!orderId) return;
  
  // Join the order's socket room
  socket.emit('join', { orderId });
  
  return () => {
    // Leave room when component unmounts
    socket.emit('leave', { orderId });
  };
}, [orderId, socket]);
```

**Why this matters:**
- Backend only sends events to clients listening to that order
- Prevents spam to all connected clients
- Scales better with multiple orders

---

## Complete Example: React Hook

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const useOrderRealTime = (orderId) => {
  const [order, setOrder] = useState(null);
  const [socket, setSocket] = useState(null);
  
  // Connect to socket
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });
    
    newSocket.on('connect', () => {
      console.log('Socket connected');
      if (orderId) {
        newSocket.emit('join', { orderId });
      }
    });
    
    setSocket(newSocket);
    
    return () => newSocket.disconnect();
  }, []);
  
  // Listen to item changes
  useEffect(() => {
    if (!socket) return;
    
    socket.on('order:item-status-changed', (data) => {
      if (data.orderId === orderId) {
        setOrder(prevOrder => {
          if (!prevOrder) return null;
          
          return {
            ...prevOrder,
            items: prevOrder.items.map(item =>
              item._id === data.itemId
                ? { ...item, status: data.newStatus, servedAt: data.servedAt }
                : item
            )
          };
        });
      }
    });
    
    return () => socket.off('order:item-status-changed');
  }, [socket, orderId]);
  
  // Listen to order status changes
  useEffect(() => {
    if (!socket) return;
    
    socket.on('order:status-changed', (data) => {
      if (data.orderId === orderId) {
        setOrder(prevOrder => {
          if (!prevOrder) return null;
          return { ...prevOrder, status: data.newStatus };
        });
      }
    });
    
    return () => socket.off('order:status-changed');
  }, [socket, orderId]);
  
  return { order, setOrder };
};

export default useOrderRealTime;
```

### Usage:
```javascript
function OrderDetailPage({ orderId }) {
  const { order, setOrder } = useOrderRealTime(orderId);
  
  return (
    <div>
      <h1>Order {order?.orderNumber}</h1>
      <p>Status: <strong>{order?.status}</strong></p>
      
      <ul>
        {order?.items.map(item => (
          <li key={item._id}>
            {item.name} - {item.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Event Flow Diagram

### Single Item Update:
```
Backend mutation
  ↓
ItemStatusService.updateItemStatus()
  ↓
Recompute order status
  ↓
StatusSyncService.afterOrderItemChange()
  ├─ Emit: order:item-status-changed [ALWAYS]
  └─ Emit: order:status-changed [ONLY if order status changed]
  ↓
Frontend receives both events (or just item event)
  ↓
Update UI
```

### Bulk Update (Multiple Items):
```
Backend mutation (serveReadyItems)
  ↓
StatusSyncService.afterBulkOrderItemsChange()
  ├─ Emit: order:item-status-changed [one per item]
  ├─ Emit: order:item-status-changed [one per item]
  ├─ Emit: order:item-status-changed [one per item]
  └─ Emit: order:status-changed [ONCE if order status changed]
  ↓
Frontend receives 4 events total
  ↓
Update UI (all items + order status)
```

---

## Best Practices

### 1. Join/Leave Rooms
Always join the order room when viewing it, leave when done:
```javascript
socket.emit('join', { orderId });  // When viewing order
socket.emit('leave', { orderId }); // When leaving
```

### 2. Handle Reconnection
```javascript
socket.on('reconnect', () => {
  console.log('Reconnected, re-joining room');
  socket.emit('join', { orderId });
});
```

### 3. Debounce Updates (if needed)
If updates come too fast, debounce state updates:
```javascript
import { debounce } from 'lodash';

const updateOrder = debounce((data) => {
  setOrder(prev => ({...prev, ...data}));
}, 300);
```

### 4. Show Loading States
```javascript
socket.on('connect', () => setConnected(true));
socket.on('disconnect', () => setConnected(false));

// In UI:
{!connected && <p className="warning">Live updates offline</p>}
```

### 5. Persist Order State
Don't lose local state on disconnect:
```javascript
useEffect(() => {
  // Fetch initial state
  fetchOrder(orderId).then(setOrder);
  
  // Connect socket for updates
  const newSocket = io(...);
  // ... socket listeners ...
  
  return () => newSocket.disconnect();
}, [orderId]);
```

---

## Status Transitions Reference

### Valid Item Statuses:
- `pending` → `in_progress` → `ready` → `served`
- `pending` → `void` (special case - item removed)
- `served` is terminal (no further changes)
- `void` is terminal (item removed)

### Order Status Derivation:
- `pending`: ANY item is pending (hasn't started)
- `preparing`: ANY item is in_progress (at least one cooking)
- `ready`: ALL items ready AND NO items pending/cooking
- `served`: ALL items served (terminal)

### Kitchen Item Rule:
- Kitchen items (`requiresKitchen: true`) can only reach `ready` via their ticket
- Cannot manually set kitchen item to `ready`
- Non-kitchen items can be manually transitioned

---

## Handling Errors

### Socket Connection Errors:
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  setError('Failed to connect to server');
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    console.log('Server disconnected');
  }
});
```

### Stale Data:
If you suspect data is stale after reconnect:
```javascript
socket.on('reconnect', async () => {
  // Refresh order from API
  const fresh = await fetchOrder(orderId);
  setOrder(fresh);
});
```

---

## Example: Full Order Tracking UI

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function OrderTracker({ orderId }) {
  const [order, setOrder] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  // Initialize socket
  useEffect(() => {
    const socket = io(process.env.REACT_APP_API_URL);
    
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', { orderId });
    });
    
    socket.on('disconnect', () => {
      setConnected(false);
    });
    
    setSocket(socket);
    return () => socket.disconnect();
  }, [orderId]);

  // Listen to item updates
  useEffect(() => {
    if (!socket) return;
    
    const handleItemChange = (data) => {
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
    };
    
    socket.on('order:item-status-changed', handleItemChange);
    return () => socket.off('order:item-status-changed', handleItemChange);
  }, [socket, orderId]);

  // Listen to order status changes
  useEffect(() => {
    if (!socket) return;
    
    const handleStatusChange = (data) => {
      if (data.orderId === orderId) {
        setOrder(prev => ({ ...prev, status: data.newStatus }));
      }
    };
    
    socket.on('order:status-changed', handleStatusChange);
    return () => socket.off('order:status-changed', handleStatusChange);
  }, [socket, orderId]);

  if (!order) return <div>Loading...</div>;

  return (
    <div className="order-tracker">
      <div className="header">
        <h2>Order {order.orderNumber}</h2>
        <span className={`status ${order.status}`}>
          {order.status}
        </span>
        {!connected && <span className="offline">⚠️ Offline</span>}
      </div>

      <div className="items">
        <h3>Items</h3>
        {order.items.map(item => (
          <div key={item._id} className={`item ${item.status}`}>
            <span className="name">{item.name}</span>
            <span className="status-badge">{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default OrderTracker;
```

---

## Testing Socket Events

### Mock Socket in Tests:
```javascript
import { io } from 'socket.io-client';

jest.mock('socket.io-client');

test('updates order when item changes', (done) => {
  const socket = {
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn()
  };
  
  io.mockReturnValue(socket);
  
  // Simulate event
  const callback = socket.on.mock.calls[0][1]; // Get 'order:item-status-changed' callback
  callback({ orderId: '123', itemId: '456', newStatus: 'ready' });
  
  // Assert UI updated
  expect(screen.getByText('ready')).toBeInTheDocument();
  done();
});
```

---

## Troubleshooting

### Events not arriving?
1. ✅ Check socket is connected: `console.log(socket.connected)`
2. ✅ Verify you're listening to correct room: `socket.emit('join', { orderId })`
3. ✅ Check browser console for connection errors
4. ✅ Verify backend is emitting (check server logs)

### Stale data?
1. ✅ Reload page (hard refresh)
2. ✅ Check timestamp on received events
3. ✅ Fetch fresh state on reconnect

### Too many events?
1. ✅ Normal - one event per item changed
2. ✅ Use debouncing if UI gets slow
3. ✅ Batch updates: `setState` triggers one re-render even if called multiple times in same tick

---

## Environment Setup

### .env.local
```
REACT_APP_API_URL=http://localhost:3000
REACT_APP_SOCKET_URL=http://localhost:3000
```

### For Production
```
REACT_APP_API_URL=https://your-domain.com
REACT_APP_SOCKET_URL=https://your-domain.com
```

---

## Next Steps

1. ✅ Install socket.io-client
2. ✅ Create socket connection in your app
3. ✅ Join order room when viewing order
4. ✅ Listen to `order:item-status-changed` events
5. ✅ Listen to `order:status-changed` events
6. ✅ Update UI when events arrive
7. ✅ Handle reconnection gracefully
8. ✅ Test in browser DevTools Network tab

---

## Summary

**Your frontend will now receive real-time updates when:**
- ✅ Any item status changes → `order:item-status-changed`
- ✅ Order overall status changes → `order:status-changed`
- ✅ Multiple items updated together → multiple item events + 1 order event
- ✅ No duplicate events from server (batching handled)

**Key behavior:**
- Item events: ALWAYS fire
- Order events: ONLY when status actually changes
- Prevents event spam, ensures clean UI updates
