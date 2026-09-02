# KDS (Kitchen Display System) Ticket Management - Complete Explanation

## Overview

When an order goes to the kitchen (KDS), it's converted into **Kitchen Tickets** with their own independent status lifecycle. This is separate from the order's status.

---

## 1. Order Status vs Ticket Status

### Order Status (What the customer sees)
```
pending → accepted → preparing → ready → served → completed
```

### Ticket Status (What kitchen staff sees in KDS)
```
pending → accepted → in_progress → ready → completed
         ↘
           → canceled
```

**Key Difference**: Order and Tickets have **different** status lifecycles!

---

## 2. When Tickets are Created

Tickets are created when an order enters the **`preparing`** status:

```
Order Flow:
  pending → accepted → ✨ PREPARING (TICKETS CREATED HERE)
                       ↓
                  Outbox Event Triggered
                       ↓
                  For each Kitchen Station:
                  - Create 1 Ticket per station
                  - Each ticket has items for that station
                  - Ticket status starts at 'pending'
```

### Example: Single Order, Multiple Stations

**Order**: Pizza + Burger + Fries
- Station 1: Pizza Station → Ticket #PIZZA-42 (Pizza items)
- Station 2: Grill Station → Ticket #GRILL-15 (Burger items)
- Station 3: Fry Station → Ticket #FRY-08 (Fries items)

Each station gets its own ticket showing only items they need to prepare!

---

## 3. Ticket Status Lifecycle

### Full Ticket Status Flow

```
┌─────────────────────────────────────────┐
│  TICKET CREATED (status: 'pending')     │
│  - Kitchen sees it on their screen      │
│  - Items have status: 'pending'         │
└──────────────┬──────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│  KITCHEN STAFF ACCEPTS (→ 'accepted')    │
│  - Staff clicks "Accept" button          │
│  - Ticket moves to "In Queue"            │
└──────────────┬──────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│  KITCHEN STAFF STARTS (→ 'in_progress')  │
│  - Staff clicks "Start Cooking"          │
│  - Items status changed to 'in_progress' │
│  - Ticket timer starts                   │
└──────────────┬──────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│  ITEMS READY (→ 'ready')                 │
│  - Staff marks items as ready            │
│  - Items status changed to 'ready'       │
│  - Kitchen continues prep (visible)      │
└──────────────┬──────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────┐
│  ALL ITEMS READY (→ 'completed')         │
│  - Staff clicks "Done"                   │
│  - All items marked complete             │
│  - Ticket disappears from screen         │
│  - Waiter notified to pick up            │
└──────────────────────────────────────────┘
```

### Alternative: Ticket Cancellation

```
Any Status → 'canceled'
- If order is canceled, ALL active tickets auto-cancel
- Staff can also manually cancel
- Reason stored in canceledReason field
```

---

## 4. Ticket Item Status (Within a Ticket)

Each ticket has multiple items, each with its own status:

```
Kitchen Ticket #PIZZA-42
├─ Item 1: "Margherita Pizza" (qty: 2)
│  └─ status: 'ready'          ✓ Done
├─ Item 2: "Caesar Salad" (qty: 1)
│  └─ status: 'in_progress'    ⏳ Being made
└─ Item 3: "Coke" (qty: 2)
   └─ status: 'pending'        ⏸ Not started yet
```

**Item Status Values**:
- `pending` - Not started
- `in_progress` - Currently being prepared
- `ready` - Done and ready to pickup

---

## 5. Detailed Status Transitions with Examples

### Example 1: Full Ticket Lifecycle (Happy Path)

```javascript
// 1. Order transitions to 'preparing'
Order: pending → accepted → ✨ PREPARING

// 2. Outbox worker creates tickets
Ticket #GRILL-1 created (status: 'pending')
Ticket #PIZZA-1 created (status: 'pending')
Ticket #SALAD-1 created (status: 'pending')

// 3. Grill station accepts their ticket
PATCH /api/v1/kitchen-tickets/GRILL-1/status
{ "status": "accepted" }
Result: Ticket #GRILL-1 → accepted

// 4. Grill station starts cooking
PATCH /api/v1/kitchen-tickets/GRILL-1/status
{ "status": "in_progress" }
Result: Ticket #GRILL-1 → in_progress
        All items within ticket → 'in_progress'

// 5. Some items finish, some still cooking
PATCH /api/v1/kitchen-tickets/GRILL-1/items/ITEM-123/status
{ "status": "ready" }
Result: Item "Burger" → ready
        (Ticket still in_progress because other items aren't done)

// 6. All grill items done
- All items now status: 'ready'
- Kitchen marks entire ticket complete

PATCH /api/v1/kitchen-tickets/GRILL-1/status
{ "status": "completed" }
Result: Ticket #GRILL-1 → completed
        Disappears from kitchen screen

// 7. Meanwhile other stations complete...
Ticket #PIZZA-1 → completed
Ticket #SALAD-1 → completed

// 8. Order status updated (orchestrated by app logic)
Order: preparing → ready → served → completed
```

### Example 2: Order Gets Canceled Mid-Kitchen

```javascript
// Order was being prepared across 3 stations
Ticket #GRILL-1 → in_progress
Ticket #PIZZA-1 → in_progress
Ticket #SALAD-1 → pending

// Customer cancels or staff cancels order
ORDER API: PATCH /api/v1/order/:id/cancel
{ "reason": "Customer walked out" }

// Result: ALL active tickets auto-canceled
Ticket #GRILL-1 → canceled
Ticket #PIZZA-1 → canceled
Ticket #SALAD-1 → canceled

// KDS screen updates: all tickets disappear
// Staff can see reason: "Order <#ORD-123> was canceled"
```

---

## 6. Database Fields for Each Ticket

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "merchant": "507f191e810c19729de860ea",
  "branch": "507f191e810c19729de860eb",
  "order": "607f191e810c19729de860ec",
  "station": "707f191e810c19729de860ed",
  
  "ticketNumber": "GRILL-42",
  "orderNumber": "#ORD-1234",
  "orderType": "dine_in",
  "tableNumber": "T5",
  
  // ✨ MAIN STATUS (what kitchen sees)
  "status": "in_progress",
  
  // Items with individual tracking
  "items": [
    {
      "orderItemId": "807f191e810c19729de860ee",
      "menuItem": "907f191e810c19729de860ef",
      "menuItemName": "Grilled Chicken",
      "quantity": 2,
      "notes": "No salt",
      "status": "ready",           // Item-level status
      "startedAt": "2024-01-15T10:20:00Z",
      "completedAt": "2024-01-15T10:35:00Z"
    },
    {
      "orderItemId": "807f191e810c19729de860f0",
      "menuItem": "907f191e810c19729de860f1",
      "menuItemName": "Beef Steak",
      "quantity": 1,
      "notes": "Medium rare",
      "status": "in_progress",     // Item-level status
      "startedAt": "2024-01-15T10:20:00Z",
      "completedAt": null
    }
  ],
  
  // Kitchen staff tracking
  "assignedTo": "a07f191e810c19729de860f2",
  "priority": "high",
  
  // Timestamps
  "acceptedAt": "2024-01-15T10:18:00Z",
  "startedAt": "2024-01-15T10:20:00Z",
  "completedAt": null,
  "canceledAt": null,
  "canceledReason": null,
  
  "createdAt": "2024-01-15T10:15:00Z",
  "updatedAt": "2024-01-15T10:35:00Z"
}
```

---

## 7. Status Transition Rules (Validation)

### Valid Transitions:

```
pending → accepted           ✓ OK
accepted → in_progress       ✓ OK
in_progress → ready          ✓ OK
ready → completed            ✓ OK

pending → completed          ✗ INVALID (skip states)
accepted → ready             ✗ INVALID (skip states)
completed → in_progress      ✗ INVALID (terminal state)
```

### Terminal States (Can't transition further):
- `completed` - Done, won't change
- `canceled` - Canceled, won't change

---

## 8. Real-World Scenario: Pizza Restaurant Order

### The Order Arrives

```
Customer QR Order:
- 2x Margherita Pizza
- 1x Caesar Salad
- 2x Coke

Order Status: pending
```

### Order Accepted & Sent to Kitchen

```
Waiter clicks "Accept"
Order Status: pending → accepted

// Waiter clicks "Send to Kitchen"
Order Status: accepted → ✨ PREPARING

// System creates tickets:
- Ticket #PIZZA-1: 2x Margherita (Pizza Station)
- Ticket #SALAD-1: 1x Caesar Salad (Salad Station)
- Ticket #BEVERAGE-1: 2x Coke (Beverage Station)
```

### Kitchen Staff Actions

#### Pizza Station:
```
T 10:15 - Ticket #PIZZA-1 created (pending)
T 10:16 - Pizza chef clicks "Accept" 
          Ticket → accepted
T 10:17 - Pizza chef clicks "Start"
          Ticket → in_progress
          Items → in_progress
T 10:28 - Both pizzas done
          Items → ready
          Ticket → ready
T 10:29 - Chef clicks "Done"
          Ticket → completed
          (Disappears from kitchen screen)
```

#### Salad Station:
```
T 10:15 - Ticket #SALAD-1 created (pending)
T 10:16 - Salad chef clicks "Accept"
          Ticket → accepted
T 10:17 - Salad chef clicks "Start"
          Ticket → in_progress
T 10:22 - Salad done
          Item → ready
          Ticket → ready
T 10:23 - Chef clicks "Done"
          Ticket → completed
```

#### Beverage Station:
```
T 10:15 - Ticket #BEVERAGE-1 created (pending)
T 10:16 - Bartender clicks "Accept"
          Ticket → accepted
T 10:17 - Bartender prepares drinks
          Ticket → in_progress
T 10:18 - Done
          Ticket → ready
T 10:19 - Ticket → completed
```

### Result on Waiter Screen

```
T 10:30 - All tickets completed
         KDS notifies: "Order #ORD-1234 ready"
         Waiter sees: "Table T5 ready for pickup"
         
         Order Status: preparing → ready
         
         Waiter clicks "Ready" 
         Order Status: ready → served
         
         Waiter clicks "Complete" 
         Order Status: served → completed
```

---

## 9. Key Differences Summary

| Aspect | Order Status | Ticket Status |
|--------|-------------|----------------|
| **What It Tracks** | Customer journey | Kitchen workflow |
| **Who Uses It** | Waiters, Customers | Kitchen staff |
| **Where Shown** | App, Receipt | KDS screen |
| **Number Per Order** | 1 | Multiple (1 per station) |
| **Lifecycle** | pending → served → completed | pending → completed |
| **Can Skip Steps** | No (strict sequence) | No (strict sequence) |
| **Who Changes It** | Waiters/App | Kitchen staff |
| **Synced Together** | Order reaches "preparing" | Tickets created |

---

## 10. API Endpoints for Ticket Management

### Get Tickets for a Station

```http
GET /api/v1/kitchen-tickets?station=GRILL&status=pending,in_progress
Authorization: Bearer <kitchen-staff-token>

Response:
[
  {
    "ticketNumber": "GRILL-42",
    "orderNumber": "#ORD-1234",
    "tableNumber": "T5",
    "status": "pending",
    "priority": "high",
    "items": [...]
  },
  ...
]
```

### Update Ticket Status

```http
PATCH /api/v1/kitchen-tickets/GRILL-42/status
Authorization: Bearer <kitchen-staff-token>
Content-Type: application/json

{
  "status": "in_progress"
}

Response:
{
  "ticketNumber": "GRILL-42",
  "status": "in_progress",
  "startedAt": "2024-01-15T10:20:00Z"
}
```

### Update Individual Item Status

```http
PATCH /api/v1/kitchen-tickets/GRILL-42/items/ITEM-123/status
Authorization: Bearer <kitchen-staff-token>
Content-Type: application/json

{
  "status": "ready"
}

Response:
{
  "itemId": "ITEM-123",
  "menuItemName": "Grilled Chicken",
  "status": "ready",
  "completedAt": "2024-01-15T10:35:00Z"
}
```

---

## 11. Monitoring & Analytics

### Kitchen Staff Can See:

1. **Active Tickets Per Station** - How many orders in queue
2. **Ticket Age** - How long ticket has been sitting
3. **Priority Level** - Rush orders highlighted
4. **Item-Level Details** - Exactly what to cook
5. **Special Instructions** - Customer preferences/notes

### Management Can See:

1. **Average Prep Time** - Per ticket, per station, per item
2. **Throughput** - Tickets completed per hour
3. **Bottlenecks** - Which stations slow down orders
4. **Ticket Completion Rate** - How many completed vs canceled
5. **Peak Hours** - When most tickets come through

---

## 12. Integration With Order Routing Feature

### How Our Order Routing Affects Tickets

**Step 3: Auto-Routing** created tickets automatically for waiter orders:

```
Waiter places order (source: 'waiter')
  ↓
Auto-routing enabled (requiresReview: false)
  ↓
Order: pending → accepted → ✨ PREPARING (via system actor)
  ↓
Outbox worker creates tickets
  ↓
Kitchen sees tickets immediately on screen
```

**Step 4: Review Queue** delayed tickets for web/admin/telegram:

```
Customer places web order
  ↓
Order: pending (waiting for review)
  ↓
Waiter approves from review queue
  ↓
Order: pending → accepted
  ↓
Order: accepted → ✨ PREPARING
  ↓
Kitchen sees tickets
```

**Key Point**: Tickets only appear when order reaches 'preparing', regardless of how it got there.

---

## 13. Common Questions & Answers

### Q: What if kitchen cancels a ticket?
A: They change ticket status to 'canceled'. The order stays in whatever status it's in. Management must cancel the order separately.

### Q: Can I mark an item ready without marking entire ticket ready?
A: Yes! Item status and ticket status are independent. You can have:
- Ticket status: `in_progress`
- Item 1: `ready`
- Item 2: `in_progress`
- Item 3: `pending`

### Q: What happens if I complete a ticket but other station's tickets aren't done?
A: That's fine. Order won't move to 'ready' until ALL items are ready (handled by app logic).

### Q: Can orders and tickets have different final states?
A: No, eventually they sync:
- All tickets → completed
- Order → served → completed

### Q: How do I know if an order is stuck?
A: Check:
1. Order status hasn't moved in X minutes
2. Tickets for that order are all 'pending' (not started)
3. Or tickets are stuck at 'in_progress' (not advancing)

---

## Summary Flow Chart

```
┌─ Order Status ─────────────────────────────────────────────┐
│                                                              │
│  pending → accepted → PREPARING ← Tickets Created Here      │
│                           ↓                                  │
│                  [Kitchen Works Here]                        │
│                           ↓                                  │
│                       ready → served → completed             │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─ Ticket Status (Per Station) ──────────────────────────────┐
│                                                              │
│  pending → accepted → in_progress → ready → completed       │
│     ↓         ↓             ↓         ↓         ↓            │
│  [Pending]  [Accept]   [Start]    [Mark]   [Done]          │
│                                                              │
│                     (Can → canceled anytime)                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

**Bottom Line**: 
- **Order** = What customer gets (overall journey)
- **Tickets** = What kitchen makes (per station breakdown)
- **Tickets created** = When order enters 'preparing'
- **Tickets independent** = Can complete at different times
- **Kitchen staff** = Manage ticket lifecycle on KDS screen
- **Waiters** = Manage order lifecycle based on ticket completion
