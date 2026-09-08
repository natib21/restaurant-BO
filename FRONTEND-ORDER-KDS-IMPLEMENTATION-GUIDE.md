# Frontend Order & KDS Implementation Guide

## 🎯 **Overview**

Your restaurant system has a **professional multi-stage order workflow** with real-time updates via Socket.IO and a Kitchen Display System (KDS). This guide explains the complete flow and how to implement it in your frontend.

---

## 📊 **Complete Order Lifecycle**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RESTAURANT ORDER WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────────┘

1. ORDER PLACED (status: "pending")
   ├─ Customer orders via: POS, Mobile App, or Table QR
   ├─ Order created in system
   ├─ 🔔 SOUND: New order notification
   └─ 📱 Shows in: Waiter Dashboard

2. WAITER ACCEPTS (status: "pending" → "accepted")
   ├─ Waiter reviews order
   ├─ Waiter clicks "Accept Order"
   ├─ 🔔 SOUND: Order accepted confirmation
   └─ 📱 Shows in: Kitchen Dashboard (but NOT in KDS yet!)

3. KITCHEN STARTS PREPARING (status: "accepted" → "preparing")
   ├─ Kitchen staff clicks "Start Preparing"
   ├─ 🔥 KDS TICKETS CREATED HERE!
   ├─ 🔔 SOUND: Kitchen station alert
   ├─ 📱 Tickets appear on: KDS Displays (per station)
   └─ Kitchen staff sees items to cook

4. KITCHEN COOKING (KDS Workflow)
   ├─ Chef accepts ticket (ticket status: "accepted")
   ├─ Chef starts cooking (ticket status: "in_progress")
   ├─ Chef marks ready (ticket status: "ready")
   └─ When ALL tickets ready → Order auto-updates to "ready"

5. FOOD READY (status: "preparing" → "ready")
   ├─ All kitchen tickets completed
   ├─ 🔔 SOUND: Food ready alert
   └─ 📱 Shows in: Waiter Dashboard (Ready for Pickup)

6. WAITER SERVES (status: "ready" → "served")
   ├─ Waiter picks up food
   ├─ Waiter delivers to customer
   └─ Waiter marks "Served"

7. PAYMENT & COMPLETION (status: "served" → "completed")
   ├─ Customer pays
   ├─ Payment recorded
   └─ Order completed
```

---

## 🎭 **User Roles & Their Views**

### **1. Waiter/Cashier Dashboard**
**Sees:**
- 📋 **Pending Orders** (waiting for acceptance)
- ✅ **Accepted Orders** (acknowledged, sent to kitchen)
- 🍳 **Preparing Orders** (kitchen is cooking)
- ✅ **Ready Orders** (ready for pickup/delivery)
- 🚶 **Served Orders** (delivered to customer)

**Actions:**
- Accept order (pending → accepted)
- Start preparing (accepted → preparing)
- Mark served (ready → served)
- Mark paid (served → completed)

---

### **2. Kitchen Display System (KDS)**
**Sees:**
- 🎫 **Kitchen Tickets** (NOT full orders)
- Grouped by station (Grill, Fryer, Pizza Oven, etc.)
- Only appears when order status = "preparing"

**Actions:**
- Accept ticket
- Start cooking
- Mark ready

---

### **3. Manager Dashboard**
**Sees:**
- All orders across all statuses
- Analytics and reports
- Historical data

---

## 🔌 **Socket.IO Real-Time Events**

### **Connection Setup**

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8000', {
  auth: {
    token: localStorage.getItem('token') // JWT token
  }
});

// Join branch room for real-time updates
socket.emit('join:branch', { branchId: 'your-branch-id' });
```

---

### **Event Listeners**

#### **1. New Order Notification**
```javascript
socket.on('order:created', (data) => {
  // Play sound for new order
  playSound('new-order.mp3');
  
  // Show notification
  showNotification('New Order!', `Order #${data.orderNumber}`);
  
  // Add to pending orders list
  addToPendingOrders(data);
  
  // Update order count badge
  updateOrderCount();
});
```

#### **2. Order Status Changed**
```javascript
socket.on('order:status-changed', (data) => {
  const { orderId, previousStatus, newStatus, orderNumber } = data;
  
  // Play appropriate sound
  if (newStatus === 'ready') {
    playSound('order-ready.mp3');
    showNotification('Order Ready!', `Order #${orderNumber} is ready for pickup`);
  }
  
  // Update order in UI
  updateOrderStatus(orderId, newStatus);
  
  // Move order to appropriate column/section
  moveOrderToSection(orderId, newStatus);
});
```

#### **3. KDS Ticket Created**
```javascript
// Only for Kitchen Display screens
socket.on('ticket:created', (tickets) => {
  tickets.forEach(ticket => {
    // Play kitchen alert sound
    playSound('kitchen-alert.mp3');
    
    // Add ticket to appropriate station display
    addTicketToStation(ticket.station, ticket);
    
    // Flash screen or show visual alert
    flashStationAlert(ticket.station);
  });
});
```

#### **4. KDS Ticket Status Changed**
```javascript
socket.on('ticket:status-changed', (data) => {
  const { ticketId, status, station } = data;
  
  // Update ticket in KDS display
  updateTicketStatus(ticketId, status);
  
  // If all tickets ready, order will auto-update
  // (handled by order:status-changed event)
});
```

---

## 🎵 **Sound Notifications**

### **Required Sounds:**

```javascript
const sounds = {
  'new-order.mp3': 'New order placed',      // 🔔 Cheerful ping
  'order-accepted.mp3': 'Order accepted',   // ✅ Confirmation beep
  'kitchen-alert.mp3': 'KDS ticket',        // 🍳 Kitchen bell
  'order-ready.mp3': 'Food ready',          // ✨ Success chime
  'order-served.mp3': 'Order served',       // 🚶 Gentle ding
};

// Sound utility
function playSound(soundFile) {
  const audio = new Audio(`/sounds/${soundFile}`);
  audio.volume = 0.7; // 70% volume
  audio.play().catch(err => {
    console.warn('Could not play sound:', err);
  });
}

// Allow user to enable/disable sounds
const soundsEnabled = localStorage.getItem('sounds-enabled') !== 'false';
```

---

## 📱 **Frontend Components**

### **1. Waiter Dashboard Component**

```jsx
// WaiterDashboard.jsx
import { useState, useEffect } from 'react';
import { socket } from './socket';
import { playSound } from './utils/sound';

export function WaiterDashboard() {
  const [orders, setOrders] = useState({
    pending: [],
    accepted: [],
    preparing: [],
    ready: [],
    served: []
  });

  useEffect(() => {
    // Fetch initial orders
    fetchOrders();

    // Socket.IO listeners
    socket.on('order:created', handleNewOrder);
    socket.on('order:status-changed', handleStatusChange);

    return () => {
      socket.off('order:created', handleNewOrder);
      socket.off('order:status-changed', handleStatusChange);
    };
  }, []);

  const handleNewOrder = (order) => {
    playSound('new-order.mp3');
    showNotification('New Order!', `Order #${order.orderNumber}`);
    
    setOrders(prev => ({
      ...prev,
      pending: [order, ...prev.pending]
    }));
  };

  const handleStatusChange = ({ orderId, previousStatus, newStatus }) => {
    if (newStatus === 'ready') {
      playSound('order-ready.mp3');
      showNotification('Order Ready!', 'Order is ready for pickup');
    }

    // Move order from old status to new status
    setOrders(prev => {
      const order = prev[previousStatus]?.find(o => o._id === orderId);
      if (!order) return prev;

      return {
        ...prev,
        [previousStatus]: prev[previousStatus].filter(o => o._id !== orderId),
        [newStatus]: [{ ...order, status: newStatus }, ...prev[newStatus]]
      };
    });
  };

  const acceptOrder = async (orderId) => {
    await fetch(`/api/v1/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'accepted' })
    });
    // Socket will handle UI update
  };

  const startPreparing = async (orderId) => {
    await fetch(`/api/v1/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'preparing' })
    });
    // This triggers KDS ticket creation
  };

  return (
    <div className="waiter-dashboard">
      {/* Pending Orders - Need Action */}
      <OrderColumn 
        title="Pending" 
        orders={orders.pending}
        actions={[
          { label: 'Accept', onClick: acceptOrder, color: 'green' }
        ]}
      />

      {/* Accepted Orders - Acknowledged */}
      <OrderColumn 
        title="Accepted" 
        orders={orders.accepted}
        actions={[
          { label: 'Start Preparing', onClick: startPreparing, color: 'blue' }
        ]}
      />

      {/* Preparing - In Kitchen */}
      <OrderColumn 
        title="Preparing" 
        orders={orders.preparing}
        badge="🍳"
      />

      {/* Ready - Pickup */}
      <OrderColumn 
        title="Ready" 
        orders={orders.ready}
        actions={[
          { label: 'Mark Served', onClick: markServed, color: 'purple' }
        ]}
        highlight={true}
      />

      {/* Served - Waiting Payment */}
      <OrderColumn 
        title="Served" 
        orders={orders.served}
        actions={[
          { label: 'Mark Paid', onClick: markPaid, color: 'success' }
        ]}
      />
    </div>
  );
}
```

---

### **2. Kitchen Display System (KDS) Component**

```jsx
// KitchenDisplay.jsx
import { useState, useEffect } from 'react';
import { socket } from './socket';
import { playSound } from './utils/sound';

export function KitchenDisplay({ stationId }) {
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    // Fetch initial tickets for this station
    fetchStationTickets(stationId);

    // Socket.IO listeners
    socket.on('ticket:created', handleNewTickets);
    socket.on('ticket:status-changed', handleTicketStatusChange);

    return () => {
      socket.off('ticket:created', handleNewTickets);
      socket.off('ticket:status-changed', handleTicketStatusChange);
    };
  }, [stationId]);

  const handleNewTickets = (newTickets) => {
    // Filter tickets for this station
    const myTickets = newTickets.filter(t => t.station === stationId);
    
    if (myTickets.length > 0) {
      playSound('kitchen-alert.mp3');
      flashScreen(); // Visual alert
      
      setTickets(prev => [...myTickets, ...prev]);
    }
  };

  const handleTicketStatusChange = ({ ticketId, status }) => {
    setTickets(prev => 
      prev.map(t => 
        t._id === ticketId ? { ...t, status } : t
      )
    );
  };

  const acceptTicket = async (ticketId) => {
    await fetch(`/api/v1/kitchen/tickets/${ticketId}/accept`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const startCooking = async (ticketId) => {
    await fetch(`/api/v1/kitchen/tickets/${ticketId}/start`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  const markReady = async (ticketId) => {
    await fetch(`/api/v1/kitchen/tickets/${ticketId}/ready`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  return (
    <div className="kds-display">
      <h1>🍳 {stationName} Station</h1>
      
      <div className="tickets-grid">
        {tickets
          .filter(t => t.status !== 'completed')
          .map(ticket => (
            <TicketCard
              key={ticket._id}
              ticket={ticket}
              onAccept={acceptTicket}
              onStart={startCooking}
              onReady={markReady}
            />
          ))}
      </div>

      {tickets.length === 0 && (
        <div className="no-tickets">
          ✅ All caught up! No pending tickets.
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket, onAccept, onStart, onReady }) {
  const statusColors = {
    pending: 'red',
    accepted: 'yellow',
    in_progress: 'blue',
    ready: 'green'
  };

  return (
    <div className={`ticket ticket-${ticket.status}`}>
      <div className="ticket-header">
        <span className="ticket-number">{ticket.ticketNumber}</span>
        <span className="order-number">Order #{ticket.orderNumber}</span>
      </div>

      <div className="ticket-items">
        {ticket.items.map((item, idx) => (
          <div key={idx} className="ticket-item">
            <span className="quantity">{item.quantity}x</span>
            <span className="name">{item.menuItemName}</span>
            {item.notes && (
              <div className="notes">📝 {item.notes}</div>
            )}
          </div>
        ))}
      </div>

      <div className="ticket-actions">
        {ticket.status === 'pending' && (
          <button onClick={() => onAccept(ticket._id)}>
            Accept
          </button>
        )}
        {ticket.status === 'accepted' && (
          <button onClick={() => onStart(ticket._id)}>
            Start Cooking
          </button>
        )}
        {ticket.status === 'in_progress' && (
          <button onClick={() => onReady(ticket._id)}>
            Mark Ready
          </button>
        )}
      </div>

      <div className="ticket-time">
        ⏱️ {calculateElapsedTime(ticket.createdAt)}
      </div>
    </div>
  );
}
```

---

## 🎨 **UI/UX Best Practices**

### **1. Visual Indicators**

```css
/* Status Colors */
.order-pending { border-left: 4px solid #f59e0b; } /* Orange */
.order-accepted { border-left: 4px solid #3b82f6; } /* Blue */
.order-preparing { border-left: 4px solid #8b5cf6; } /* Purple */
.order-ready { border-left: 4px solid #10b981; } /* Green - Highlight */
.order-served { border-left: 4px solid #6b7280; } /* Gray */

/* Urgent Orders (>20 min) */
.order-urgent {
  animation: pulse 2s infinite;
  border-left-color: #ef4444 !important; /* Red */
}

/* Ready Orders - Extra Highlight */
.order-ready {
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
  animation: glow 2s ease-in-out infinite;
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.3); }
  50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.6); }
}
```

---

### **2. Sound Settings**

```jsx
// SoundSettings.jsx
export function SoundSettings() {
  const [enabled, setEnabled] = useState(
    localStorage.getItem('sounds-enabled') !== 'false'
  );

  const toggleSounds = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    localStorage.setItem('sounds-enabled', newValue);
  };

  return (
    <div>
      <label>
        <input 
          type="checkbox" 
          checked={enabled} 
          onChange={toggleSounds} 
        />
        Enable Sound Notifications
      </label>
    </div>
  );
}
```

---

## 🔄 **Complete API Flow Example**

### **Scenario: Customer Orders Burger**

```javascript
// 1. Create Order (POST /api/v1/orders)
const order = await createOrder({
  items: [
    { menuItem: 'burger-id', quantity: 1 },
    { menuItem: 'fries-id', quantity: 1 }
  ],
  orderType: 'dine-in',
  tableId: 'table-5'
});
// → Status: "pending"
// → Socket emits: order:created
// → Sound: new-order.mp3

// 2. Waiter Accepts (PATCH /api/v1/orders/:id/status)
await updateOrderStatus(order._id, 'accepted');
// → Status: "accepted"
// → Socket emits: order:status-changed
// → Sound: order-accepted.mp3

// 3. Start Preparing (PATCH /api/v1/orders/:id/status)
await updateOrderStatus(order._id, 'preparing');
// → Status: "preparing"
// → Backend creates KDS tickets (2 tickets: Grill + Fryer)
// → Socket emits: ticket:created
// → Sound: kitchen-alert.mp3 (on KDS screens)

// 4. Kitchen Works on Tickets
// Chef at Grill station:
await acceptTicket('ticket-grill-id');
await startCooking('ticket-grill-id');
await markReady('ticket-grill-id');

// Chef at Fryer station:
await acceptTicket('ticket-fryer-id');
await startCooking('ticket-fryer-id');
await markReady('ticket-fryer-id');

// 5. All Tickets Ready → Order Auto-Updates
// → Status: "ready" (automatic!)
// → Socket emits: order:status-changed
// → Sound: order-ready.mp3

// 6. Waiter Serves (PATCH /api/v1/orders/:id/status)
await updateOrderStatus(order._id, 'served');
// → Status: "served"

// 7. Mark Paid (PATCH /api/v1/orders/:id/status)
await updateOrderStatus(order._id, 'completed');
// → Status: "completed"
// → Order archived
```

---

## 📋 **Implementation Checklist**

### **Phase 1: Basic Order Management**
- [ ] Waiter dashboard with order columns (pending, accepted, preparing, ready, served)
- [ ] Socket.IO connection and authentication
- [ ] Order status update API calls
- [ ] Real-time order updates via Socket.IO
- [ ] Sound notifications for new orders

### **Phase 2: Kitchen Display System (KDS)**
- [ ] KDS component for each kitchen station
- [ ] Ticket display with items and notes
- [ ] Ticket status transitions (pending → accepted → in_progress → ready)
- [ ] Real-time ticket updates via Socket.IO
- [ ] Kitchen alert sounds

### **Phase 3: Polish**
- [ ] Elapsed time display (⏱️ 15m, 🔴 25m urgent)
- [ ] Visual alerts (flashing, glowing for urgent/ready orders)
- [ ] Sound settings (enable/disable)
- [ ] Order filtering and search
- [ ] Mobile responsive design

---

## 🎯 **Key Takeaways**

1. ✅ **Orders flow through stages**: pending → accepted → preparing → ready → served → completed
2. ✅ **KDS tickets only appear at "preparing" stage** (not before!)
3. ✅ **Each kitchen station gets its own tickets**
4. ✅ **Socket.IO provides real-time updates** (no polling needed)
5. ✅ **Sound notifications are critical** for staff awareness
6. ✅ **Visual indicators help staff prioritize** (colors, urgency, elapsed time)

---

## 📞 **Support**

If you have questions about implementing any of these features, refer to:
- Backend API documentation
- Socket.IO event schemas
- Order state machine documentation

Good luck building your frontend! 🚀
