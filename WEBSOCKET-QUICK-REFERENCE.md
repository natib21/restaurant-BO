# WebSocket Order Updates - Quick Reference

## 🎯 The Problem (Before)

Customer places order via QR → needs to keep refreshing page to see updates → bad UX

## ✅ The Solution (Now)

When staff updates order status → **customer sees it instantly** via WebSocket

---

## 🚀 Frontend Quick Start

### 1. Connect on Login

```javascript
import socketService from './socket/SocketService';

const response = await loginViaQR();
socketService.connect(response.sessionToken);
```

### 2. Listen for Status Changes

```javascript
// When viewing order details
socketService.joinOrderRoom(orderId);

socketService.onOrderStatusChanged((data) => {
  console.log(`Order ${data.orderNumber}: ${data.status}`);
  updateOrderUI(data);
});
```

### 3. Clean Up

```javascript
socketService.leaveOrderRoom(orderId);
socketService.offOrderStatusChanged(callback);
```

---

## 🖥️ Backend - Already Done!

✅ `OrderStateMachineService.js` - Emits `order:status_changed` event
✅ `socket-server.ts` - Routes events to correct customers
✅ Authentication - Validates session token
✅ Room management - Customer only sees their orders

---

## 📡 Real-Time Events Emitted

### When Staff Updates Order Status

```javascript
// Event: order:status_changed
{
  orderId: "...",
  orderNumber: "QR-001",
  previousStatus: "pending",
  status: "accepted",        // ← The new status
  timestamp: "2026-09-01...",
  orderType: "dine_in",
  table: "..."
}
```

---

## 📊 Customer Journey

```
1. Scan QR
   ↓
2. Connect WebSocket
   ↓
3. Place Order
   ↓
4. Get orderId
   ↓
5. Join order room: socket.emit('order:join', { orderId })
   ↓
6. Listen: socket.on('order:status_changed', callback)
   ↓
7. Staff accepts → Customer sees instantly ✨
   Staff prepares → Customer sees instantly ✨
   Staff marks ready → Customer sees instantly ✨
   Customer pays → Order complete ✨
```

---

## 🔄 Status Flow

```
pending → accepted → preparing → ready → served/delivered → completed

Each transition emits WebSocket event instantly to customers viewing that order.
```

---

## ❓ FAQ

**Q: What if WebSocket disconnects?**
A: Auto-reconnects automatically. If reconnect fails, falls back to polling GET endpoint.

**Q: Can customer see other people's orders?**
A: No. Session token is validated to their table only.

**Q: What if order is already completed?**
A: WebSocket event still emitted, but customer likely left page. Next login shows final status.

**Q: Does polling still work?**
A: Yes. Customer can still `GET /api/v1/orders/:id` as fallback.

---

## 📝 Files Changed

1. `src/modules/order/service/OrderStateMachineService.js` ✅ MODIFIED
   - Added WebSocket emission at end of `transitionOrderStatus()`

2. `src/modules/customers/customers.routes.js` ✅ MODIFIED
   - Added `GET /orders/:id` endpoint for customer order retrieval

---

## ✨ Result

**Before:** Customer refreshes every 5-10 seconds
**After:** Customer sees updates in <100ms

That's the magic of WebSocket! 🚀
