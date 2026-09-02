# Kitchen Ticket Creation Flow - Detailed Diagram

## System Flow (After Fix)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ORDER CREATION                              │
│                                                                     │
│  MenuItem: Burger (no kitchenStation assigned)                     │
│  MenuItem: Fries (no kitchenStation assigned)                      │
│  MenuItem: Coffee (requiresKitchen = false)                        │
│                                                                     │
│  + Order placed with above items                                   │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  ORDER STATUS: pending → preparing                  │
│                                                                     │
│  Waiter clicks "Start Preparing" button                            │
│  PATCH /api/v1/orders/:id/status { "status": "preparing" }        │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│           CREATE OUTBOX EVENT: "order:preparing"                   │
│                                                                     │
│  Database: INSERT outboxevents {                                  │
│    aggregateId: order._id,                                        │
│    eventType: "order:preparing",                                  │
│    status: "pending"                                              │
│  }                                                                 │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│        OUTBOX WORKER PROCESSES: "order:preparing" EVENT           │
│                                                                     │
│  Worker polls database for pending events                         │
│  Calls: KitchenTicketService.createTicketsForOrder(orderId)      │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────────────────────────┐
   │     KitchenTicketService.createTicketsForOrder()   │
   │                                                     │
   │  1. Fetch order with populated menuItems          │
   │  2. Initialize: itemsByStation (Map) +            │
   │     unassignedItems (Array)                       │
   └─────────────────────────────────────────────────────┘
                 │
         ┌───────┴───────┬───────────────┐
         │               │               │
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────────┐
   │  Burger  │   │  Fries   │   │   Coffee     │
   │(null)    │   │(null)    │   │(requiresK=F) │
   └──────────┘   └──────────┘   └──────────────┘
         │               │               │
         │ No Station    │ No Station    │ Skip
         │               │               │ (non-kitchen)
         ▼               ▼               ▼
   ADD TO          ADD TO          SKIP
   unassigned      unassigned
         │               │
         └───────┬───────┘
                 │
                 ▼
   ┌─────────────────────────────────────────────────────┐
   │  unassignedItems = [Burger, Fries]                 │
   │  itemsByStation = {} (empty)                       │
   └─────────────────────────────────────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────────────────────────┐
   │  UNASSIGNED ITEMS EXIST? → YES                     │
   │                                                     │
   │  Find default station:                            │
   │  KitchenStation.findOne({                          │
   │    branch: order.branch,                           │
   │    isActive: true                                  │
   │  }).sort({ displayOrder: 1, createdAt: 1 })      │
   │                                                     │
   │  Result: GRILL_STATION (displayOrder=1, first)   │
   └─────────────────────────────────────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────────────────────────┐
   │  CREATE FALLBACK TICKET                            │
   │                                                     │
   │  KitchenTicket.create({                            │
   │    merchant: order.merchant,                       │
   │    branch: order.branch,                           │
   │    station: GRILL_STATION._id,  ◄─ Default!      │
   │    ticketNumber: "GRILL-1",                        │
   │    orderNumber: "#12345",                          │
   │    items: [                                        │
   │      {                                             │
   │        menuItemName: "Burger",                    │
   │        quantity: 1,                               │
   │        status: "pending"                          │
   │      },                                            │
   │      {                                             │
   │        menuItemName: "Fries",                     │
   │        quantity: 1,                               │
   │        status: "pending"                          │
   │      }                                             │
   │    ],                                              │
   │    status: "pending",                             │
   │    priority: "normal"                             │
   │  })                                                │
   └─────────────────────────────────────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────────────────────────┐
   │  EMIT SOCKET.IO EVENTS                             │
   │                                                     │
   │  To rooms:                                         │
   │  - branch:${branchId}                             │
   │  - branch:${branchId}:station:${stationId}       │
   │                                                     │
   │  Event: {                                          │
   │    type: "ticket:created",                        │
   │    ticket: { ticket data }                        │
   │  }                                                 │
   └─────────────────────────────────────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────────────────────────┐
   │  MARK OUTBOX EVENT AS PROCESSED                    │
   │                                                     │
   │  UPDATE outboxevents {                             │
   │    _id: event._id,                                │
   │    status: "processed",                           │
   │    processedAt: new Date()                        │
   │  }                                                 │
   └─────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    KDS (KITCHEN DISPLAY SYSTEM)                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │              GRILL STATION                             │       │
│  ├─────────────────────────────────────────────────────────┤       │
│  │ TICKET: GRILL-1                                        │       │
│  │ ┌─────────────────────────────────────────────────────┐ │       │
│  │ │ ORDER #12345                                       │ │       │
│  │ │ ┌─────────────────────────────────────────────────┐ │ │       │
│  │ │ │ □ Burger (qty: 1) - PENDING                   │ │ │       │
│  │ │ │ □ Fries (qty: 1) - PENDING                    │ │ │       │
│  │ │ └─────────────────────────────────────────────────┘ │ │       │
│  │ │                                                     │ │       │
│  │ │ [START PREPARING] [MARK READY] [CANCEL]           │ │       │
│  │ └─────────────────────────────────────────────────────┘ │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│  ✅ Kitchen staff can see ticket immediately!                     │
│  ✅ Can start preparing order                                     │
│  ✅ Can mark items ready when done                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│         KITCHEN STAFF MARKS ITEMS READY                            │
│                                                                     │
│  PATCH /api/v1/kitchen/tickets/:ticketId/status                   │
│  { "status": "ready" }                                             │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│              UPDATE ORDER ITEM STATUSES                            │
│                                                                     │
│  Order items status: pending → in_progress → ready               │
│  Emit: order:item-status-changed events                          │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   FRONTEND (WAITER UI)                             │
│                                                                     │
│  ✅ Real-time socket event received                                │
│  ✅ Order items show as "ready"                                    │
│  ✅ Waiter can serve items to customer                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Decision Logic Inside KitchenTicketService.createTicketsForOrder()

```
FOR EACH orderItem in order.items:
  │
  └─ GET menuItem details
     │
     ├─ Check: requiresKitchen === false?
     │  │  YES → SKIP (non-kitchen item like beverage)
     │  │
     │  └─ NO → Continue
     │
     ├─ Get menuItem.kitchenStation
     │
     ├─ Check: kitchenStation exists?
     │  │
     │  ├─ YES → ADD TO itemsByStation[stationId]
     │  │        (item will get its own ticket for that station)
     │  │
     │  └─ NO  → ADD TO unassignedItems[]
     │           (item will go to fallback ticket)

AFTER PROCESSING ALL ITEMS:
  │
  ├─ itemsByStation has items?
  │  YES → CREATE TICKET FOR EACH STATION
  │
  ├─ unassignedItems has items?
  │  │
  │  └─ YES → FIND DEFAULT STATION
  │           (First by displayOrder, then by createdAt)
  │           │
  │           ├─ Station found?
  │           │  └─ YES → CREATE FALLBACK TICKET with default station
  │           │
  │           └─ No station found?
  │              └─ THROW ERROR: "No kitchen stations found"
  │
  └─ EMIT SOCKET EVENTS for all created tickets
```

---

## Before vs After Comparison

### BEFORE THE FIX ❌
```
Order with Burger (no station) + Fries (no station)
                 │
                 ▼
    KitchenTicketService processes
                 │
                 ├─ Burger: station = null → SKIP
                 ├─ Fries: station = null → SKIP
                 │
                 └─ No items to create tickets!
                 │
                 ▼
    Result: NO TICKETS CREATED
                 │
                 ├─ ❌ KDS: Empty, no tickets
                 └─ ❌ Kitchen staff: Nothing to do
```

### AFTER THE FIX ✅
```
Order with Burger (no station) + Fries (no station)
                 │
                 ▼
    KitchenTicketService processes
                 │
                 ├─ Burger: station = null → ADD TO UNASSIGNED
                 ├─ Fries: station = null → ADD TO UNASSIGNED
                 │
                 └─ Find default station (GRILL)
                 │
                 ▼
    Result: FALLBACK TICKET CREATED with default station
                 │
                 ├─ ✅ KDS: Shows GRILL-1 ticket
                 │        - Burger
                 │        - Fries
                 │
                 └─ ✅ Kitchen staff: Can see & prepare items
```

---

## Test Coverage Map

```
createTicketsForOrder() Method
│
├─ Scenario 1: Item WITHOUT station → Fallback ticket
│  ├─ Input: Order with 1 burger, kitchenStation=null
│  ├─ Process: Detect unassigned, find default station
│  └─ Output: 1 fallback ticket on default station ✅
│
├─ Scenario 2: Multiple items WITHOUT stations → 1 Fallback
│  ├─ Input: Order with burger + steak, both station=null
│  ├─ Process: Both added to unassigned pool
│  └─ Output: 1 fallback ticket with both items ✅
│
├─ Scenario 3: Mixed (some WITH, some WITHOUT)
│  ├─ Input: Fries (FRYER station) + Burger (null)
│  ├─ Process: Fries → FRYER, Burger → unassigned
│  └─ Output: 2 tickets (FRYER + default) ✅
│
├─ Scenario 4: Non-kitchen item (beverage)
│  ├─ Input: Coffee with requiresKitchen=false
│  ├─ Process: Skipped (non-kitchen)
│  └─ Output: 0 tickets ✅
│
└─ Scenario 5: No stations in branch
   ├─ Input: Unassigned items, 0 stations in branch
   ├─ Process: Try to find default, none found
   └─ Output: AppError thrown ✅
```

---

## Real-World Usage

### Merchant Workflow (No Pre-assignment Needed)

```
Day 1: Create Menu Items
  POST /menu/items → Burger, Fries, Coffee (no stations assigned)

Day 2: Create Kitchen Stations
  POST /kitchen/stations → GRILL, FRYER stations

Day 3: Create Order
  POST /orders → Order #12345 with Burger + Fries

  Status: pending → preparing
  ↓
  ✅ GRILL ticket AUTOMATICALLY created
  ✅ Kitchen staff sees it immediately
  ✅ No pre-assignment needed!
```

### Comparison with Old System

| Workflow Step | Old System | New System |
|---|---|---|
| Create menu items | Must assign kitchen stations NOW | Can create items anytime |
| Create kitchen stations | Must create BEFORE menu items | Can create AFTER menu items |
| Create orders | Items must have stations | Items can be unassigned |
| Order → Preparing | ❌ No tickets if no stations | ✅ Fallback to default |
| Kitchen sees tickets | Only if pre-assigned | Always (if station exists) |

---

## Key Insights

1. **Decoupled Menu from Kitchen Operations**
   - Menu items don't need kitchen stations
   - Stations can be created independently
   - Workflow is more flexible

2. **Automatic Fallback Logic**
   - Unassigned items go to default station
   - No data loss or stuck orders
   - Smart routing based on station priority

3. **Backward Compatible**
   - Pre-assigned items still work perfectly
   - Behavior unchanged for existing items
   - No migrations needed

4. **Real-time Updates**
   - Socket events emitted for all tickets
   - KDS updates immediately
   - No polling needed
