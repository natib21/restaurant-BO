# Frontend Order Status Display & Edit Rules

## Summary

**Frontend can DISPLAY order status but can ONLY CHANGE it via item changes:**

| Action | Kitchen Items | Non-Kitchen Items | Notes |
|--------|---|---|---|
| **Display order status** | ✅ YES | ✅ YES | Always show status to user |
| **Directly change order status** | ❌ NO | ❌ NO | Order status is DERIVED (read-only) |
| **Change item status** | ❌ NO (via ticket only) | ✅ YES (via API) | Kitchen items must go through ticket |
| **See order status change in real-time** | ✅ YES | ✅ YES | Via `order:status-changed` socket event |

---

## Rule 1: Order Status is READ-ONLY (Derived)

**Frontend CANNOT directly set order status.**

Order status is **always derived** from its items:
- If ANY item pending → order is `pending`
- If ANY item in_progress → order is `preparing`
- If ALL items ready → order is `ready`
- If ALL items served → order is `served`

### Backend Prevents Direct Changes:
```javascript
// ❌ DOES NOT EXIST
PATCH /api/v1/orders/:orderId/status  // This endpoint doesn't exist!

// ✅ Only way to change order status is via items
PATCH /api/v1/orders/:orderId/items/:itemId/status
```

### Frontend Code:
```javascript
// ❌ WRONG - Don't do this
function changeOrderStatus(orderId, newStatus) {
  // This won't work - endpoint doesn't exist
  fetch(`/api/v1/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
}

// ✅ CORRECT - Change items instead
function changeItemStatus(orderId, itemId, newStatus) {
  fetch(`/api/v1/orders/${orderId}/items/${itemId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
}
```

---

## Rule 2: Display Order Status (Always OK)

**Frontend CAN display the current order status.**

Listen to socket events and display in UI:

```javascript
// Listen to order status changes
socket.on('order:status-changed', (data) => {
  const { orderId, oldStatus, newStatus, timestamp } = data;
  
  // Update UI with new status
  document.getElementById(`order-${orderId}-status`).textContent = newStatus;
  
  // Show badge with color
  updateStatusBadge(orderId, newStatus);
});

// Also display on initial load
function displayOrder(order) {
  return (
    <div>
      <h2>Order {order.orderNumber}</h2>
      <p>Status: <strong>{order.status}</strong></p>
      {/* Show as badge, NOT editable field */}
      <StatusBadge status={order.status} />
    </div>
  );
}
```

### Status Display States:
```
pending   → "Order Pending" (gray)
preparing → "Preparing" (yellow)
ready     → "Ready for Pickup" (green)
served    → "Served" (blue)
```

---

## Rule 3: Kitchen Items (requiresKitchen: true)

**Frontend CANNOT directly change kitchen item status.**

Kitchen items can ONLY be changed via the ticket system (Kitchen Display System):

```javascript
// ❌ BLOCKED - Cannot manually set kitchen item to "ready"
PATCH /api/v1/orders/:orderId/items/:itemId/status
Body: { status: "ready" }
// Response: 400 Bad Request
// "Kitchen items can only reach "ready" via their ticket"

// ✅ CORRECT - Kitchen staff use KDS to mark ticket item ready
// This syncs the ticket item status to the order item automatically
POST /kds/ticket/:ticketId/items/:itemId/ready
```

### Frontend Logic for Kitchen Items:
```javascript
function canChangeItemStatus(item) {
  // Kitchen items are read-only (except via ticket)
  if (item.requiresKitchen) {
    return false;  // Can't edit directly
  }
  
  // Non-kitchen items can be edited
  return true;
}

// Render UI based on item type
function renderItemControls(item) {
  if (item.requiresKitchen) {
    return (
      <div>
        <span>{item.name}</span>
        <StatusBadge status={item.status} />
        <p className="info">
          Status managed by Kitchen Display System
        </p>
      </div>
    );
  }
  
  // Non-kitchen items have manual controls
  return (
    <div>
      <span>{item.name}</span>
      <select onChange={(e) => changeItemStatus(item._id, e.target.value)}>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="ready">Ready</option>
        <option value="served">Served</option>
      </select>
    </div>
  );
}
```

---

## Rule 4: Non-Kitchen Items (requiresKitchen: false)

**Frontend CAN directly change non-kitchen item status.**

Non-kitchen items (beverages, sides, etc.) can be manually managed:

```javascript
// ✅ ALLOWED - Change non-kitchen item status
PATCH /api/v1/orders/:orderId/items/:itemId/status
Body: { status: "served" }
// Success: Item updated, events fired
```

### Valid Transitions for Non-Kitchen Items:
```
pending → in_progress → ready → served
pending → served (skip in_progress if auto-served)
```

### Frontend UI Example:
```javascript
function orderItemRow(item) {
  if (!item.requiresKitchen) {
    return (
      <tr key={item._id} className="non-kitchen-item">
        <td>{item.name}</td>
        <td>
          {/* Show editable status dropdown */}
          <select 
            value={item.status}
            onChange={(e) => updateItemStatus(item._id, e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="ready">Ready</option>
            <option value="served">Served</option>
          </select>
        </td>
      </tr>
    );
  }
  
  // Kitchen items show read-only status
  return (
    <tr key={item._id} className="kitchen-item">
      <td>{item.name}</td>
      <td>
        <StatusBadge status={item.status} readonly />
        <small>(Managed by Kitchen)</small>
      </td>
    </tr>
  );
}
```

---

## Complete Frontend Integration Example

```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function OrderDetailPage({ orderId }) {
  const [order, setOrder] = useState(null);
  const [socket, setSocket] = useState(null);

  // Connect socket
  useEffect(() => {
    const socket = io(process.env.REACT_APP_API_URL);
    
    socket.on('connect', () => {
      socket.emit('join', { orderId });
    });
    
    setSocket(socket);
    return () => socket.disconnect();
  }, [orderId]);

  // Listen to order status changes
  useEffect(() => {
    if (!socket) return;
    
    socket.on('order:status-changed', (data) => {
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          status: data.newStatus
        }));
      }
    });
    
    return () => socket.off('order:status-changed');
  }, [socket, orderId]);

  // Listen to item status changes
  useEffect(() => {
    if (!socket) return;
    
    socket.on('order:item-status-changed', (data) => {
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
    
    return () => socket.off('order:item-status-changed');
  }, [socket, orderId]);

  if (!order) return <div>Loading...</div>;

  return (
    <div className="order-detail">
      <h1>Order {order.orderNumber}</h1>
      
      {/* DISPLAY order status (read-only) */}
      <div className="status-section">
        <label>Order Status:</label>
        <StatusBadge status={order.status} />
        <p className="info">
          Order status is automatically derived from item statuses
        </p>
      </div>

      {/* Item list */}
      <div className="items-section">
        <h3>Items</h3>
        <table>
          <tbody>
            {order.items.map(item => (
              <tr key={item._id}>
                <td>{item.name}</td>
                <td>{item.quantity}x</td>
                
                {/* Show different UI for kitchen vs non-kitchen items */}
                {item.requiresKitchen ? (
                  // Kitchen items: Display only
                  <td>
                    <StatusBadge status={item.status} readonly />
                    <small>(Kitchen managed)</small>
                  </td>
                ) : (
                  // Non-kitchen items: Allow manual change
                  <td>
                    <select 
                      value={item.status}
                      onChange={(e) => updateItemStatus(item._id, e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="ready">Ready</option>
                      <option value="served">Served</option>
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Helper: Update non-kitchen item status
  async function updateItemStatus(itemId, newStatus) {
    try {
      await fetch(`/api/v1/orders/${orderId}/items/${itemId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      // State updates via socket event, no need to refetch
    } catch (error) {
      console.error('Failed to update item:', error);
    }
  }
}

// Status badge component
function StatusBadge({ status, readonly }) {
  const colors = {
    pending: 'gray',
    in_progress: 'yellow',
    ready: 'green',
    served: 'blue',
    void: 'red'
  };
  
  return (
    <span 
      className={`badge badge-${colors[status]}`}
      title={readonly ? 'Read-only status' : ''}
    >
      {status.toUpperCase()}
    </span>
  );
}

export default OrderDetailPage;
```

---

## API Endpoints Available

### ✅ ALLOWED (Frontend can call):

```javascript
// Update non-kitchen item status
PATCH /api/v1/orders/:orderId/items/:itemId/status
Body: { status: "ready" | "served" | "in_progress" }

// Bulk serve all ready items
POST /api/v1/orders/:orderId/items/serve-ready

// Void an item (with reason)
PATCH /api/v1/orders/:orderId/items/:itemId/void
Body: { reason: "string", createReplacement?: boolean }
```

### ❌ NOT ALLOWED (These endpoints don't exist):

```javascript
// Can't directly change order status
PATCH /api/v1/orders/:orderId/status  // ❌ DOES NOT EXIST

// Can't directly change kitchen item status
PATCH /api/v1/orders/:orderId/items/:itemId/status
Body: { status: "ready" }  // ❌ BLOCKED for requiresKitchen items
// Response: 400 "Kitchen items can only reach ready via their ticket"
```

---

## Display vs Edit Summary

### What Frontend DISPLAYS:
- ✅ Order current status (from API or socket)
- ✅ Each item's current status
- ✅ Item type (kitchen vs non-kitchen)
- ✅ Order history/timeline

### What Frontend CAN EDIT:
- ✅ Non-kitchen items (`requiresKitchen: false`)
- ✅ Bulk serve ready items
- ✅ Void items (with reason)

### What Frontend CANNOT EDIT:
- ❌ Order status directly (it's derived)
- ❌ Kitchen items (`requiresKitchen: true`)
- ❌ Terminal statuses (void, served)

---

## Real-Time Updates Flow

```
Kitchen marks ticket item ready
  ↓
Backend syncs to order item
  ✅ Emits: order:item-status-changed
  ✅ Emits: order:status-changed (if all items ready)
  ↓
Frontend socket listeners receive events
  ✅ Update item status UI
  ✅ Update order status UI
  ✓ No API refresh needed
```

---

## Best Practices

### 1. Show Item Type Indicator
```jsx
{item.requiresKitchen && (
  <span className="badge badge-kitchen">🍳 Kitchen Item</span>
)}
```

### 2. Disable Editing for Kitchen Items
```jsx
<select disabled={item.requiresKitchen}>
  {/* options */}
</select>
```

### 3. Show Order Status as Read-Only
```jsx
<div className="order-status">
  <strong>Status:</strong> {order.status}
  <small>(Automatically derived)</small>
</div>
```

### 4. Listen to Real-Time Updates
```javascript
socket.on('order:item-status-changed', handleItemUpdate);
socket.on('order:status-changed', handleOrderUpdate);
```

### 5. Handle Errors Gracefully
```javascript
try {
  await updateItemStatus(itemId, newStatus);
} catch (err) {
  showError('Only non-kitchen items can be manually updated');
}
```

---

## Summary Table

| Feature | Kitchen Items | Non-Kitchen Items | Order Status |
|---------|---|---|---|
| Display status | ✅ YES | ✅ YES | ✅ YES |
| Change status via API | ❌ NO | ✅ YES | ❌ NO |
| Change via KDS ticket | ✅ YES | N/A | AUTO |
| Editable in UI | ❌ NO | ✅ YES | ❌ NO |
| Real-time updates | ✅ YES | ✅ YES | ✅ YES |
| Show type to user | ✅ YES | Optional | N/A |

