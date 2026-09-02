# Complete Order → Kitchen Flow Guide 🍽️

## Understanding the Status Hierarchy

Your system has **TWO parallel status systems**:

### 1️⃣ ORDER Level (Managed by Waiters/POS)
- **Order Status**: Overall order state
- **Order Item Status**: Each item in the order

### 2️⃣ KITCHEN Level (Managed by Kitchen Staff/KDS)
- **Ticket Status**: Kitchen ticket state
- **Ticket Item Status**: Each item in the ticket

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    WAITER (POS System)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Create Order    │
                    │  Status: pending │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Order Accepted   │
                    │ Status: accepted │
                    └────────┬─────────┘
                             │
                             ▼
            ┌────────────────────────────────┐
            │   Send to Kitchen (Auto)       │
            │   Order Status: preparing      │
            │   ✅ CREATES KDS TICKETS       │
            └────────┬───────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌──────────────┐          ┌──────────────┐
│  ORDER       │          │  TICKETS     │
│  ITEMS       │          │  (Kitchen)   │
└──────────────┘          └──────────────┘
│                                │
│ Item 1: pending ───────────►  │ Ticket Item 1: pending
│ Item 2: pending ───────────►  │ Ticket Item 2: pending
│ Item 3: pending ───────────►  │ Ticket Item 3: pending
│                                │
│                                ▼
│                        ┌──────────────────┐
│                        │  KITCHEN STAFF   │
│                        │  Works on items  │
│                        └──────────────────┘
│                                │
│                                ▼
│                        Item 1 → in_progress
│                        Item 2 → in_progress
│                        Item 3 → ready
│                                │
│                                ▼
│ ◄──────────────────── Ticket All Ready
│ Item 1: ready                  │
│ Item 2: ready                  │
│ Item 3: ready                  │
│                                │
▼                                ▼
┌──────────────────────────────────┐
│   Order Status: ready            │
│   All items completed            │
└──────────────────────────────────┘
```

---

## Detailed Flow Step-by-Step

### Step 1: Order Creation (Waiter)
```json
POST /api/v1/order
{
  "orderType": "dine_in",
  "table": "6a8ec91a63250432ef964d36",
  "items": [
    { "menuItem": "6a8f...", "quantity": 2 },
    { "menuItem": "6a8f...", "quantity": 1 }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "ORDER_ID",
      "orderNumber": "#T01-5-123",
      "status": "pending",  // ← Order status
      "items": [
        {
          "_id": "ITEM_1_ID",
          "name": "Grilled Steak",
          "quantity": 2,
          "requiresKitchen": true,
          "status": "pending"  // ← Order item status
        },
        {
          "_id": "ITEM_2_ID",
          "name": "Caesar Salad",
          "quantity": 1,
          "requiresKitchen": true,
          "status": "pending"
        }
      ]
    }
  }
}
```

**Status at this point:**
- ✅ Order: `pending`
- ✅ All Order Items: `pending`
- ❌ No tickets created yet

---

### Step 2: Order Accepted (Auto or Manual)
If your order flow config has `requiresReview: false`, the order auto-accepts and goes to kitchen.

**What happens:**
1. Order status: `pending` → `accepted`
2. Order status: `accepted` → `preparing` (auto-transition)
3. **✅ TICKETS CREATED** for kitchen

**Backend automatically:**
```javascript
// OrderStateMachineService transitions to 'preparing'
// Outbox event 'order:preparing' created
// Outbox worker processes event
// KitchenTicketService.createTicketsForOrder() called
// One ticket per kitchen station
```

---

### Step 3: Tickets Created in Kitchen

**Request (happens automatically via outbox):**
```javascript
// Internal: KitchenTicketService.createTicketsForOrder(orderId)
```

**Tickets created (one per station):**
```json
{
  "_id": "TICKET_ID",
  "ticketNumber": "MAINKITCHEN-10",
  "order": "ORDER_ID",
  "station": "6a8edcef63250432ef967b1b",
  "status": "pending",  // ← Ticket status
  "items": [
    {
      "_id": "TICKET_ITEM_1_ID",
      "orderItemId": "ITEM_1_ID",  // ← Links to order item
      "menuItemName": "Grilled Steak",
      "quantity": 2,
      "status": "pending",  // ← Ticket item status
      "notes": ""
    },
    {
      "_id": "TICKET_ITEM_2_ID",
      "orderItemId": "ITEM_2_ID",
      "menuItemName": "Caesar Salad",
      "quantity": 1,
      "status": "pending",
      "notes": ""
    }
  ]
}
```

**Status at this point:**
- ✅ Order: `preparing`
- ✅ Order Items: `pending` (not changed yet)
- ✅ Ticket: `pending`
- ✅ Ticket Items: `pending`

---

### Step 4: Kitchen Starts Working

Kitchen staff sees the ticket on KDS and starts working on items.

**Request (Kitchen staff clicks "Start" on Item 1):**
```http
PATCH /api/v1/kitchen/tickets/TICKET_ID/item/TICKET_ITEM_1_ID
{
  "status": "in_progress"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "ticket": {
      "_id": "TICKET_ID",
      "status": "in_progress",  // ← Auto-updated!
      "items": [
        {
          "_id": "TICKET_ITEM_1_ID",
          "status": "in_progress",  // ← Updated
          "startedAt": "2026-08-27T12:00:00Z"
        },
        {
          "_id": "TICKET_ITEM_2_ID",
          "status": "pending"  // ← Still pending
        }
      ]
    }
  }
}
```

**What changed:**
- ✅ Ticket status: `pending` → `in_progress` (auto)
- ✅ Ticket Item 1: `pending` → `in_progress`
- ✅ Order Items: Still `pending` (not synced yet)

---

### Step 5: Kitchen Completes Items

Kitchen finishes cooking items one by one.

**Request (Mark Item 1 as ready):**
```http
PATCH /api/v1/kitchen/tickets/TICKET_ID/item/TICKET_ITEM_1_ID
{
  "status": "ready"
}
```

**Request (Mark Item 2 as ready):**
```http
PATCH /api/v1/kitchen/tickets/TICKET_ID/item/TICKET_ITEM_2_ID
{
  "status": "ready"
}
```

**When ALL items are ready:**
```json
{
  "ticket": {
    "status": "ready",  // ← Auto-updated when all items ready
    "items": [
      {
        "_id": "TICKET_ITEM_1_ID",
        "status": "ready",
        "completedAt": "2026-08-27T12:05:00Z"
      },
      {
        "_id": "TICKET_ITEM_2_ID",
        "status": "ready",
        "completedAt": "2026-08-27T12:06:00Z"
      }
    ]
  }
}
```

**Backend automatically:**
- ✅ Ticket status: `in_progress` → `ready`
- ✅ Order items updated: `pending` → `ready`
- ✅ Order status checked and updated: `preparing` → `ready`
- ✅ Outbox event `kitchen:all_tickets_ready` created

---

### Step 6: Order Ready for Serving

**Current state:**
```json
{
  "order": {
    "status": "ready",  // ← All tickets ready
    "items": [
      {
        "_id": "ITEM_1_ID",
        "status": "ready"  // ← Updated by ticket completion
      },
      {
        "_id": "ITEM_2_ID",
        "status": "ready"
      }
    ]
  }
}
```

Waiter can now serve the order to customer.

---

## The Rules 📋

### Rule 1: Order Items vs Ticket Items
- **Order Items** = Source of truth for the ORDER
- **Ticket Items** = Copy for KITCHEN to work on
- They are **LINKED** via `orderItemId`
- Changes in ticket items → sync back to order items

### Rule 2: Status Independence
- Order item status ≠ Ticket item status (initially)
- Kitchen updates **ticket items**
- When ticket completes → order items updated

### Rule 3: Automatic Status Updates

**Ticket Level:**
```javascript
// Ticket status is AUTO-COMPUTED from items
if (all items are 'ready') → ticket = 'ready'
if (any item is 'in_progress') → ticket = 'in_progress'
if (all items are 'pending') → ticket = 'pending'
```

**Order Level:**
```javascript
// Order status updated when ALL tickets ready
if (all tickets 'ready') → order = 'ready'
if (any ticket 'in_progress') → order = 'preparing'
```

### Rule 4: Item Status Flow (One-Way)

**Order Items:**
```
pending → ready → served
```

**Ticket Items:**
```
pending → in_progress → ready
```

❌ **Cannot go backwards** (e.g., ready → pending is NOT allowed)

### Rule 5: Non-Kitchen Items (Drinks)
Items with `requiresKitchen: false` are **auto-served**:
```json
{
  "name": "Coca Cola",
  "requiresKitchen": false,
  "status": "served",  // ← Auto
  "servedAt": "2026-08-27T12:00:00Z",
  "servedVia": "auto"
}
```

These items **DON'T create tickets**.

---

## Frontend Implementation Guide

### 1. POS Interface (Waiter)

**Display Order Status:**
```typescript
// Get order
const order = await fetchOrder(orderId);

// Show order-level status
console.log(`Order Status: ${order.status}`);
// → "preparing", "ready", "served"

// Show each item status
order.items.forEach(item => {
  console.log(`${item.name}: ${item.status}`);
  // → "Grilled Steak: ready"
});
```

**Real-time Updates (Socket.IO):**
```typescript
// Listen for order updates
socket.on('order:status-changed', (data) => {
  // data = { orderId, newStatus, oldStatus }
  updateOrderStatus(data.orderId, data.newStatus);
});

socket.on('order:item-status-changed', (data) => {
  // data = { orderId, itemId, newStatus }
  updateItemStatus(data.orderId, data.itemId, data.newStatus);
});
```

---

### 2. KDS Interface (Kitchen)

**Display Ticket:**
```typescript
// Get tickets for a station
const tickets = await fetch('/api/v1/kitchen/stations/STATION_ID/tickets');

tickets.forEach(ticket => {
  console.log(`Ticket: ${ticket.ticketNumber}`);
  console.log(`Status: ${ticket.status}`);
  
  ticket.items.forEach(item => {
    console.log(`  - ${item.menuItemName} (${item.quantity}x)`);
    console.log(`    Status: ${item.status}`);
  });
});
```

**Update Item Status:**
```typescript
async function markItemAsStarted(ticketId: string, itemId: string) {
  await fetch(`/api/v1/kitchen/tickets/${ticketId}/item/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'in_progress' }),
    headers: { 'Content-Type': 'application/json' }
  });
}

async function markItemAsReady(ticketId: string, itemId: string) {
  await fetch(`/api/v1/kitchen/tickets/${ticketId}/item/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'ready' }),
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Real-time Updates (Socket.IO):**
```typescript
// Join station room
socket.emit('join-station', stationId);

// Listen for ticket updates
socket.on('ticket:item-updated', (data) => {
  // data = { ticketId, itemId, status, ticketStatus }
  updateTicketUI(data.ticketId, data.ticketStatus);
  updateItemUI(data.ticketId, data.itemId, data.status);
});

socket.on('ticket:created', (data) => {
  // New ticket arrived
  addTicketToKDS(data.ticket);
});
```

---

## Status Summary Table

| Location | Object | Statuses | Managed By |
|----------|--------|----------|------------|
| **Order** | Order | `pending`, `accepted`, `preparing`, `ready`, `served`, `completed`, `canceled` | Waiter/POS |
| **Order** | Order Item | `pending`, `ready`, `served`, `void` | Auto-updated from Tickets |
| **Kitchen** | Ticket | `pending`, `accepted`, `in_progress`, `ready`, `completed`, `canceled` | Kitchen Staff |
| **Kitchen** | Ticket Item | `pending`, `in_progress`, `ready` | Kitchen Staff |

---

## Common Questions

### Q1: When do order items change status?
**A:** When the kitchen ticket items are completed. The system syncs ticket item status back to order items.

### Q2: Can I manually update order item status?
**A:** Yes, using `/api/v1/order/:orderId/items/:itemId/status`, but typically the kitchen updates ticket items which auto-sync.

### Q3: What if an item is voided?
**A:** Order items can be voided with reason. The ticket is updated/canceled accordingly.

### Q4: Do all items go to the same ticket?
**A:** No! Items are **grouped by kitchen station**. If you have Grill and Salad stations, you get 2 tickets.

### Q5: Can waiters see ticket status?
**A:** Yes! Call `/api/v1/kitchen/orders/:orderId/tickets` to see all tickets for an order.

---

## Quick Reference API

### Order Operations
- `POST /api/v1/order` - Create order
- `GET /api/v1/order/:id` - Get order with items
- `PATCH /api/v1/order/:orderId/items/:itemId/status` - Update order item status
- `PATCH /api/v1/order/:orderId/items/:itemId/void` - Void item

### Ticket Operations
- `GET /api/v1/kitchen/stations/:stationId/tickets` - Get KDS tickets
- `GET /api/v1/kitchen/orders/:orderId/tickets` - Get tickets for order
- `PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId` - **Update ticket item status**
- `PATCH /api/v1/kitchen/tickets/:ticketId/ready` - Mark entire ticket ready

---

## Visual Status Indicators

### POS (Waiter View)
```
Order #T01-5-123                [PREPARING] 🔄
├─ Grilled Steak (2x)          [READY] ✅
├─ Caesar Salad (1x)           [READY] ✅
└─ Coca Cola (1x)              [SERVED] ✅ (auto)
```

### KDS (Kitchen View)
```
┌────────────────────────────────┐
│ Ticket: MAINKITCHEN-10         │
│ Order: #T01-5-123   [IN_PROGRESS] │
├────────────────────────────────┤
│ ⏳ Grilled Steak (2x)          │
│    [IN_PROGRESS] ⏱ 5 min       │
│                                │
│ ✅ Caesar Salad (1x)           │
│    [READY] ✓ Done              │
└────────────────────────────────┘
```

---

This is the complete flow! The key is understanding that **tickets are for kitchen work**, and **order items reflect the final state**. Kitchen updates tickets → tickets update orders automatically.
