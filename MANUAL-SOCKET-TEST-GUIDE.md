# Manual Customer Socket Testing Guide

## Overview
Test real-time order status updates flowing from staff to customer via Socket.IO

---

## Prerequisites

1. **Server running:** `npm run dev`
2. **Two browser tabs open**
3. **Tools:** Browser DevTools Console + Network tab

---

## Step 1: Get Test Data

### Get Merchant, Branch, Table IDs:
```bash
# In MongoDB or via API
db.merchants.findOne({}, {_id: 1, businessName: 1})
db.branches.findOne({}, {_id: 1, merchant: 1})
db.tables.findOne({}, {_id: 1, tableNumber: 1, branch: 1, merchant: 1})
```

Example result:
```javascript
merchantId = "6a9532e46c844d03b33ff55b"
branchId = "6a9532e46c844d03b33ff55e"  
tableId = "6a9547081b87804e437fa774"
```

---

## Step 2: Create Customer Session

### Request:
```bash
POST http://localhost:8000/api/v1/sessions/start
Content-Type: application/json

{
  "data": "<base64_encoded_data>",
  "signature": "<signature>"
}
```

Or use the QR URL format:
```
http://localhost:5173/qr?data=eyJt...&s=409f...
```

### Save the session token from response:
```javascript
sessionToken = "abc123def456..." // From response.data.token
```

---

## Step 3: Connect Staff Socket (Tab 1)

Open browser tab 1, paste in console:

```javascript
// Connect staff socket with JWT
const staffSocket = io('http://localhost:8000', {
  auth: {
    token: 'YOUR_STAFF_JWT_TOKEN_HERE'
  }
});

staffSocket.on('connect', () => {
  console.log('✅ Staff connected:', staffSocket.id);
  
  // Join branch room
  staffSocket.emit('setup:session', { 
    branchId: '6a9532e46c844d03b33ff55e' // YOUR BRANCH ID
  });
});

staffSocket.on('connect_error', (err) => {
  console.error('❌ Staff connection error:', err.message);
});

// Listen for order events
staffSocket.on('order:new', (data) => {
  console.log('🆕 Staff received new order:', data);
});

staffSocket.on('order:status-changed', (data) => {
  console.log('📊 Staff received status change:', data);
});

console.log('Staff socket initialized');
```

**Expected output:**
```
✅ Staff connected: abc123...
User abc... joined branch 6a953...
```

---

## Step 4: Connect Customer Socket (Tab 2)

Open browser tab 2, paste in console:

```javascript
// Connect customer socket with session token
const customerSocket = io('http://localhost:8000', {
  auth: {
    sessionToken: 'YOUR_SESSION_TOKEN_HERE' // From Step 2
  }
});

customerSocket.on('connect', () => {
  console.log('✅ Customer connected:', customerSocket.id);
});

customerSocket.on('connect_error', (err) => {
  console.error('❌ Customer connection error:', err.message);
});

// Listen for order events
customerSocket.on('order:created', (data) => {
  console.log('🎉 Customer received order created:', data);
});

customerSocket.on('order:status-changed', (data) => {
  console.log('📊 Customer received status change:', data);
  console.log('   Old status:', data.oldStatus);
  console.log('   New status:', data.newStatus);
});

customerSocket.on('order:item-status-changed', (data) => {
  console.log('🍔 Customer received item status change:', data);
});

console.log('Customer socket initialized');
```

**Expected output:**
```
✅ Customer connected: def456...
Customer joined X active order rooms
```

---

## Step 5: Create Order from Customer

In **Tab 2** (Customer), run:

```javascript
// Create order via REST API
fetch('http://localhost:8000/api/v1/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_SESSION_TOKEN_HERE' // Session token
  },
  body: JSON.stringify({
    items: [
      {
        menuItemId: 'VALID_MENU_ITEM_ID',
        name: 'Test Burger',
        quantity: 2,
        price: 150,
        subtotal: 300
      }
    ],
    branchId: '6a9532e46c844d03b33ff55e', // YOUR BRANCH ID
    table: 'T-02', // YOUR TABLE NUMBER
    customerName: 'Socket Test Customer',
    subtotal: 300,
    totalAmount: 300,
    notes: 'Testing socket notifications'
  })
})
.then(r => r.json())
.then(data => {
  console.log('Order created:', data);
  window.testOrderId = data.data?.order?._id;
})
.catch(err => console.error('Order creation failed:', err));
```

**Expected output in Tab 2 (Customer):**
```javascript
✅ Order created: {...}
🎉 Customer received order created: {
  _id: "6a95...",
  orderNumber: "D-001",
  status: "pending",
  totalAmount: 300,
  placedAt: "2026-08-31T..."
}
```

**Expected output in Tab 1 (Staff):**
```javascript
🆕 Staff received new order: {
  _id: "6a95...",
  orderNumber: "D-001",
  status: "pending",
  tableNumber: "T-02",
  ...
}
```

---

## Step 6: Change Order Status (Staff Action)

In **Tab 1** (Staff), update order status:

```javascript
// Change order status to 'accepted'
fetch(`http://localhost:8000/api/v1/orders/${window.testOrderId}/status`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_STAFF_JWT_TOKEN'
  },
  body: JSON.stringify({
    status: 'accepted',
    reason: 'Order confirmed by staff'
  })
})
.then(r => r.json())
.then(data => console.log('✅ Status updated:', data))
.catch(err => console.error('❌ Update failed:', err));
```

**Expected output in Tab 2 (Customer) - THE KEY TEST:**
```javascript
📊 Customer received status change: {
  orderId: "6a95...",
  oldStatus: "pending",
  newStatus: "accepted",
  reason: "Order confirmed by staff",
  timestamp: "2026-08-31T..."
}
```

**This confirms the customer socket is receiving real-time updates!**

---

## Step 7: Test More Status Changes

Try these status transitions:

```javascript
// In Tab 1 (Staff), run one at a time:

// 1. Accept → Preparing
updateStatus('preparing', 'Sending to kitchen');

// 2. Preparing → Ready
updateStatus('ready', 'Food is ready');

// 3. Ready → Served
updateStatus('served', 'Delivered to table');

// Helper function (paste first):
function updateStatus(status, reason) {
  fetch(`http://localhost:8000/api/v1/orders/${window.testOrderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_STAFF_JWT_TOKEN'
    },
    body: JSON.stringify({ status, reason })
  })
  .then(r => r.json())
  .then(data => console.log(`✅ Status → ${status}:`, data))
  .catch(err => console.error('❌ Failed:', err));
}
```

**Watch Tab 2 (Customer) console** - you should see:
```javascript
📊 Customer received status change: { oldStatus: "accepted", newStatus: "preparing", ... }
📊 Customer received status change: { oldStatus: "preparing", newStatus: "ready", ... }
📊 Customer received status change: { oldStatus: "ready", newStatus: "served", ... }
```

---

## Verification Checklist

### ✅ Customer Socket Connection
- [ ] Customer connects with `sessionToken` in auth
- [ ] Customer joins `session:${token}` room
- [ ] Customer auto-joins existing order rooms

### ✅ Order Creation
- [ ] Customer receives `order:created` event immediately
- [ ] Customer socket auto-joins `order:${orderId}` room
- [ ] Staff receives `order:new` event

### ✅ Real-time Status Updates
- [ ] Staff updates order status via API
- [ ] Customer receives `order:status-changed` event
- [ ] Event contains `oldStatus`, `newStatus`, `timestamp`
- [ ] No changes needed to StatusSyncService

### ✅ Item-level Updates (Optional)
- [ ] Update individual item status
- [ ] Customer receives `order:item-status-changed` event

---

## Troubleshooting

### Customer socket won't connect
```javascript
// Check server logs for:
"Customer socket connected: ..."

// If not appearing, verify:
1. sessionToken is valid (not expired)
2. SessionToken passed in auth object
3. CustomerSession exists in DB
```

### Customer not receiving status updates
```javascript
// Check if customer joined order room:
// Server logs should show:
"Customer socket abc123 joined order room: order:6a95..."

// Manually join order room in Tab 2:
customerSocket.emit('order:join', { orderId: window.testOrderId });
```

### Staff JWT token expired
```bash
# Get new token via login endpoint
POST http://localhost:8000/api/v1/auth/login
{ "email": "staff@example.com", "password": "password" }
```

---

## Expected Server Logs

```
Customer socket connected: def456... session=abc123... table=6a954...
Customer joined 0 active order rooms
Order created: 6a95...
Customer socket def456 manually joined order:6a95...
order.customer_notified { orderId: '6a95...', sessionToken: 'abc123...' }
order.status.transition { orderId: '6a95...', from: 'pending', to: 'accepted' }
Socket disconnected: def456... type=customer (transport close)
```

---

## Success Criteria

✅ **PASS:** Customer tab receives `order:status-changed` events in real-time when staff changes order status

❌ **FAIL:** Customer tab doesn't receive events, or receives them delayed, or connection fails

---

## Clean Up

```javascript
// In both tabs:
staffSocket.disconnect();
customerSocket.disconnect();
```

---

## Next Steps

Once this works manually:
1. Build frontend UI to display order status
2. Add visual notifications (toasts/alerts)
3. Add order history view for customers
4. Add item-level status tracking UI
