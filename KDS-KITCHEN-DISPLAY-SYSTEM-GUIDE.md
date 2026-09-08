# Kitchen Display System (KDS) - Socket.IO Integration Guide

## Overview

Kitchen staff use the KDS (Kitchen Display System) to see tickets and mark items ready. The KDS receives real-time updates via socket events when:
- New tickets are created
- Items within tickets are updated
- Ticket status changes
- Items sync to orders

---

## Socket Events for Kitchen Staff

### Event 1: `ticket:item-updated`

Fires when a kitchen staff member marks a ticket item as started or completed.

#### Listen:
```javascript
socket.on('ticket:item-updated', (data) => {
  const { ticketId, itemId, status, ticketStatus, startedAt, completedAt } = data;
  
  console.log(`Ticket ${ticketId}: Item marked ${status}`);
  
  // Update KDS display
  updateTicketDisplay(ticketId, itemId, {
    status,
    startedAt,
    completedAt
  });
});
```

#### Payload:
```javascript
{
  ticketId: "6a903c76...",
  itemId: "6a903c76...",
  status: "in_progress",           // "pending", "in_progress", "ready"
  ticketStatus: "in_progress",     // Current ticket overall status
  startedAt: "2026-08-27T13:30:00Z", // When item was started (null if pending)
  completedAt: "2026-08-27T13:35:00Z" // When item was completed (null if not ready)
}
```

#### When It Fires:
```
Kitchen staff marks item "in_progress"
  ↓
✅ ticket:item-updated fires
  ↓
KDS screen updates: shows item with "in_progress" badge

Kitchen staff marks item "ready"
  ↓
✅ ticket:item-updated fires
  ↓
KDS screen updates: shows item with "ready" badge + completion time
```

---

### Event 2: `ticket:status-changed`

Fires when the ticket's overall status changes (e.g., all items ready → ticket becomes ready).

#### Listen:
```javascript
socket.on('ticket:status-changed', (data) => {
  const { ticketId, oldStatus, newStatus } = data;
  
  console.log(`Ticket ${ticketId}: ${oldStatus} → ${newStatus}`);
  
  // Update ticket status in KDS
  updateTicketStatus(ticketId, newStatus);
  
  // Show notification if ticket is ready
  if (newStatus === 'ready') {
    showNotification(`🔔 TICKET ${ticketId} IS READY!`);
  }
});
```

#### Payload:
```javascript
{
  ticketId: "6a903c76...",
  oldStatus: "in_progress",
  newStatus: "ready"
}
```

#### When It Fires:
```
Kitchen marks last item as ready
  ↓
All items in ticket are now "ready"
  ↓
✅ ticket:status-changed fires (pending → in_progress → ready)
  ↓
KDS shows: "TICKET READY" in big letters
Kitchen staff gets audio/visual alert
```

---

## Join Ticket Room (Kitchen Staff)

When kitchen staff views the KDS, they should join the station room:

```javascript
// Connect to socket
const socket = io(process.env.REACT_APP_API_URL);

// Join kitchen station room
socket.on('connect', () => {
  // Station ID from login or config
  const stationId = getUserStation();
  
  socket.emit('join', { 
    room: `station-${stationId}`,
    type: 'kitchen' 
  });
  
  console.log(`Joined station room: station-${stationId}`);
});

// Reconnect on disconnect
socket.on('reconnect', () => {
  socket.emit('join', { 
    room: `station-${stationId}`,
    type: 'kitchen' 
  });
});
```

---

## Complete KDS Implementation Example

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function KitchenDisplaySystem() {
  const [tickets, setTickets] = useState([]);
  const [socket, setSocket] = useState(null);
  const [stationId, setStationId] = useState(null);

  // Initialize socket and join station
  useEffect(() => {
    const socket = io(process.env.REACT_APP_API_URL);
    const station = getStationFromUser();
    
    socket.on('connect', () => {
      console.log('KDS connected');
      socket.emit('join', { room: `station-${station._id}`, type: 'kitchen' });
    });
    
    setSocket(socket);
    setStationId(station._id);
    
    return () => socket.disconnect();
  }, []);

  // Listen to ticket item updates
  useEffect(() => {
    if (!socket) return;
    
    socket.on('ticket:item-updated', (data) => {
      setTickets(prev => 
        prev.map(ticket => {
          if (ticket._id === data.ticketId) {
            return {
              ...ticket,
              items: ticket.items.map(item =>
                item._id === data.itemId
                  ? {
                      ...item,
                      status: data.status,
                      startedAt: data.startedAt,
                      completedAt: data.completedAt
                    }
                  : item
              ),
              status: data.ticketStatus
            };
          }
          return ticket;
        })
      );
    });
    
    return () => socket.off('ticket:item-updated');
  }, [socket]);

  // Listen to ticket status changes
  useEffect(() => {
    if (!socket) return;
    
    socket.on('ticket:status-changed', (data) => {
      if (data.newStatus === 'ready') {
        playAlert();  // Audio alert
        showNotification(`TICKET ${data.ticketId} IS READY!`);
      }
      
      setTickets(prev =>
        prev.map(ticket =>
          ticket._id === data.ticketId
            ? { ...ticket, status: data.newStatus }
            : ticket
        )
      );
    });
    
    return () => socket.off('ticket:status-changed');
  }, [socket]);

  // Load initial tickets
  useEffect(() => {
    if (!stationId) return;
    
    fetchTicketsForStation(stationId).then(setTickets);
  }, [stationId]);

  return (
    <div className="kds-display">
      <h1>Kitchen Display System</h1>
      
      <div className="tickets-grid">
        {tickets
          .filter(t => ['pending', 'accepted', 'in_progress'].includes(t.status))
          .map(ticket => (
            <TicketCard key={ticket._id} ticket={ticket} />
          ))}
      </div>
    </div>
  );
}

// Individual ticket card
function TicketCard({ ticket }) {
  return (
    <div className={`ticket ticket-${ticket.status}`}>
      <h3>Ticket #{ticket.ticketNumber}</h3>
      <p className="order">Order: {ticket.orderNumber}</p>
      
      <div className="items">
        {ticket.items.map(item => (
          <div key={item._id} className={`item item-${item.status}`}>
            <span className="name">{item.menuItemName}</span>
            <span className="qty">x{item.quantity}</span>
            <span className={`status-badge ${item.status}`}>
              {item.status.toUpperCase()}
            </span>
            
            {/* Show cooking time */}
            {item.startedAt && (
              <span className="timer">
                {getElapsedTime(item.startedAt)} min
              </span>
            )}
          </div>
        ))}
      </div>
      
      {/* Ticket status */}
      <div className={`ticket-status ${ticket.status}`}>
        {ticket.status === 'ready' && (
          <span className="ready-badge">✓ READY</span>
        )}
      </div>
    </div>
  );
}

export default KitchenDisplaySystem;
```

---

## KDS Workflow

### Step 1: Kitchen Receives New Ticket
```
New order created
  ↓
Ticket created for grill station
  ↓
✅ Ticket appears on KDS
  ↓
Kitchen staff sees: "ORDER #123 - 2 burgers, 1 fries"
```

### Step 2: Kitchen Marks Item Started
```
Kitchen staff clicks "START" on burger 1
  ↓
PUT /api/v1/kitchen/tickets/:ticketId/items/:itemId/status
  { status: "in_progress" }
  ↓
✅ ticket:item-updated fires
  ↓
KDS shows: "Burger 1 - IN PROGRESS (0 min)"
Timer starts counting cooking time
```

### Step 3: Kitchen Marks Item Ready
```
After 5 minutes, burger ready
  ↓
Kitchen staff clicks "READY" on burger 1
  ↓
PUT /api/v1/kitchen/tickets/:ticketId/items/:itemId/status
  { status: "ready" }
  ↓
✅ ticket:item-updated fires
✅ Syncs to order item
✅ order:item-status-changed fires (waiter sees update)
  ↓
KDS shows: "Burger 1 - READY (5 min)"
Order item marked ready
```

### Step 4: All Items Ready → Ticket Ready
```
Kitchen marks burger 2 ready (last item)
  ↓
All ticket items now "ready"
  ↓
✅ ticket:status-changed fires
✅ order:status-changed fires (all order items ready)
  ↓
KDS: "TICKET READY!" (large, green, alert sound)
POS: Shows "Order Ready for Pickup"
```

---

## KDS UI Components

### Ticket Status Badge
```jsx
function TicketStatusBadge({ status }) {
  const styles = {
    pending: { bg: 'gray', text: 'PENDING' },
    accepted: { bg: 'yellow', text: 'ACCEPTED' },
    in_progress: { bg: 'orange', text: 'COOKING' },
    ready: { bg: 'green', text: '✓ READY' },
  };
  
  return (
    <div className={`badge badge-${status}`}>
      {styles[status].text}
    </div>
  );
}
```

### Item Status with Cooking Timer
```jsx
function ItemWithTimer({ item }) {
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    if (!item.startedAt) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const started = new Date(item.startedAt).getTime();
      setElapsed(Math.floor((now - started) / 1000 / 60)); // minutes
    }, 1000);
    
    return () => clearInterval(interval);
  }, [item.startedAt]);
  
  return (
    <div className="item">
      <h4>{item.menuItemName}</h4>
      <p>Qty: {item.quantity}</p>
      
      <div className={`status ${item.status}`}>
        {item.status === 'in_progress' && (
          <span className="timer">{elapsed} min</span>
        )}
        {item.status === 'ready' && (
          <span className="completed">✓ {elapsed} min</span>
        )}
      </div>
    </div>
  );
}
```

### Ticket Card with Real-Time Updates
```jsx
function TicketCard({ ticket, onMarkReady }) {
  const allItemsReady = ticket.items.every(i => i.status === 'ready');
  
  return (
    <div className={`ticket ticket-${ticket.status}`}>
      <header>
        <h2>#{ticket.ticketNumber}</h2>
        <span className="order">{ticket.orderNumber}</span>
      </header>
      
      <section className="items">
        {ticket.items.map(item => (
          <ItemWithTimer key={item._id} item={item} />
        ))}
      </section>
      
      {/* Show alert if ready */}
      {allItemsReady && ticket.status === 'ready' && (
        <div className="alert alert-ready">
          <span className="animation">⭐</span>
          TICKET READY FOR PICKUP
          <span className="animation">⭐</span>
        </div>
      )}
    </div>
  );
}
```

---

## API Endpoints for KDS

### Update Ticket Item Status
```javascript
PUT /api/v1/kitchen/tickets/:ticketId/items/:itemId/status

Body: {
  status: "in_progress" | "ready"
}

Response: {
  ticketId: "...",
  itemId: "...",
  status: "in_progress",
  ticketStatus: "in_progress"
}
```

### Get Tickets for Station
```javascript
GET /api/v1/kitchen/stations/:stationId/tickets

Query params:
  - status: "pending,accepted,in_progress" (filter by status)
  - sort: "-createdAt" (sort by creation time)

Response: [
  {
    _id: "...",
    ticketNumber: "T-001",
    orderNumber: "#123",
    status: "in_progress",
    items: [
      {
        _id: "...",
        menuItemName: "Burger",
        quantity: 1,
        status: "in_progress",
        startedAt: "2026-08-27T13:30:00Z",
        completedAt: null
      }
    ]
  }
]
```

---

## Real-Time Event Sequence

### Complete Flow with All Events:

```
USER ACTION: Kitchen marks item ready
  ↓
API CALL: PATCH /api/v1/kitchen/tickets/T1/items/I1/status
  ↓
BACKEND:
  ├─ Update ticket item status
  ├─ Sync to order item
  ├─ Recompute ticket status
  ├─ Recompute order status
  └─ Save transaction
  ↓
SOCKET EVENTS EMITTED:
  ├─ ticket:item-updated [to station-GRILL]
  │  ├─ ticketId: T1
  │  ├─ itemId: I1
  │  ├─ status: ready
  │  └─ completedAt: 2026-08-27T13:35:00Z
  │
  ├─ ticket:status-changed [to station-GRILL] (if ticket now ready)
  │  ├─ ticketId: T1
  │  ├─ newStatus: ready
  │
  ├─ order:item-status-changed [to order:O1] (POS/Waiter view)
  │  ├─ orderId: O1
  │  ├─ itemId: OI1
  │  ├─ newStatus: ready
  │
  └─ order:status-changed [to order:O1] (if all items ready)
     ├─ orderId: O1
     ├─ newStatus: ready
  ↓
KITCHEN KDS:
  ✅ Item shows "READY" badge
  ✅ Timer shows final cooking time
  ✅ (If all items ready) Ticket shows "READY" alert
  ✅ Audio alert plays
  ↓
POS WAITER:
  ✅ Order item shows "ready"
  ✅ (If all items ready) Order shows "READY FOR PICKUP"
```

---

## Best Practices for KDS

### 1. Join Station Room on Load
```javascript
useEffect(() => {
  socket.emit('join', { room: `station-${stationId}`, type: 'kitchen' });
}, [stationId]);
```

### 2. Handle Reconnection
```javascript
socket.on('reconnect', () => {
  console.log('KDS reconnected');
  socket.emit('join', { room: `station-${stationId}`, type: 'kitchen' });
  // Optionally refresh tickets from API
  refreshTickets();
});
```

### 3. Show Connection Status
```javascript
const [connected, setConnected] = useState(false);

socket.on('connect', () => setConnected(true));
socket.on('disconnect', () => setConnected(false));

// In UI:
{!connected && (
  <div className="offline-banner">
    ⚠️ KDS Offline - Reconnecting...
  </div>
)}
```

### 4. Audio/Visual Alerts for Ready
```javascript
socket.on('ticket:status-changed', (data) => {
  if (data.newStatus === 'ready') {
    // Play alert sound
    playSound('alert.mp3');
    
    // Show visual alert
    flash();
    
    // Vibrate if supported
    navigator.vibrate && navigator.vibrate(200);
  }
});
```

### 5. Auto-Refresh Tickets Periodically
```javascript
useEffect(() => {
  const interval = setInterval(() => {
    refreshTickets(); // Fallback in case socket events missed
  }, 30000); // Every 30 seconds
  
  return () => clearInterval(interval);
}, []);
```

---

## KDS vs POS Events Summary

| Event | Audience | Fired When | Display Location |
|-------|----------|-----------|------------------|
| `ticket:item-updated` | Kitchen (station) | Item marked started/ready | KDS screen |
| `ticket:status-changed` | Kitchen (station) | Ticket status changes | KDS alert |
| `order:item-status-changed` | Waiter (order) | Item status changes | POS order view |
| `order:status-changed` | Waiter (order) | Order status changes | POS alert |

---

## Troubleshooting KDS

### Events Not Arriving?
1. ✅ Check socket connected: `console.log(socket.connected)`
2. ✅ Verify joined station room: `socket.emit('join', ...)`
3. ✅ Check browser console for errors
4. ✅ Verify backend emitting (check server logs)

### Stale Tickets?
1. ✅ Refresh from API periodically
2. ✅ Check timestamp on events
3. ✅ Handle reconnection explicitly

### Duplicate Events?
1. ✅ Normal if user clicks button twice
2. ✅ Backend prevents duplicate mutations (noop handling)
3. ✅ Frontend should debounce button clicks

---

## Complete KDS App Structure

```
KitchenDisplaySystem/
├── KDS.jsx (main component)
├── components/
│   ├── TicketCard.jsx (ticket display)
│   ├── ItemRow.jsx (item with timer)
│   ├── StatusBadge.jsx (status indicator)
│   └── AlertBanner.jsx (ready alert)
├── hooks/
│   ├── useKitchenSocket.js (socket connection)
│   ├── useTickets.js (ticket management)
│   └── useTimer.js (cooking timer)
├── api/
│   └── kitchenApi.js (API calls)
└── styles/
    └── kds.css (styling)
```

---

## Summary

**Kitchen staff see and update tickets in real-time:**
- ✅ Socket room: `station-${stationId}`
- ✅ Listen to: `ticket:item-updated`, `ticket:status-changed`
- ✅ Update via: PATCH /api/v1/kitchen/tickets/:id/items/:id/status
- ✅ Auto-syncs to order (waiter sees update immediately)

**Complete event flow:**
- Kitchen marks item ready → `ticket:item-updated` fires
- All items ready → `ticket:status-changed` fires
- Item syncs to order → `order:item-status-changed` fires (waiter sees)
- Order all ready → `order:status-changed` fires (waiter alert)
