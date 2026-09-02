# KDS Ticket Management - Quick Reference Guide

## Your Question Clarified: "When order goes to KDS, there are statuses?"

**YES!** When an order transitions to `preparing`, it creates Kitchen Tickets with their own status lifecycle.

---

## Status Comparison at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORDER vs TICKET STATUS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ORDER LIFECYCLE (What you see in app/order list):              │
│  ┌──────────┐     ┌─────────┐     ┌──────────┐     ┌─────────┐ │
│  │ pending  │ --> │accepted │ --> │preparing │ --> │  ready  │ │
│  └──────────┘     └─────────┘     └──────────┘     └─────────┘ │
│        |                                                    |    │
│        └────────────────────────────────────────────────────┘   │
│                         (by Waiters)                             │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TICKET LIFECYCLE PER STATION (What kitchen sees in KDS):      │
│  ┌────────┐    ┌─────────┐    ┌────────────┐    ┌────────┐    │
│  │pending │ -> │accepted │ -> │in_progress │ -> │ ready  │    │
│  └────────┘    └─────────┘    └────────────┘    └────────┘    │
│       |              |                |              |         │
│       └──────────────────────────────────────────────┘         │
│              (by Kitchen Staff)                                 │
│                                                                  │
│  Multiple tickets = Multiple stations work in parallel          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## When Are Tickets Created?

```
ORDER STATE MACHINE TIMELINE:

1. Order Created
   Order: pending
   Tickets: NONE

2. Order Accepted (by Waiter)
   Order: accepted
   Tickets: NONE

3. ✨ Order Sent to Kitchen (preparing)
   Order: preparing
   Tickets: ✅ CREATED NOW (1 per kitchen station)
           Each ticket status: pending

4. Kitchen Works...
   Order: still preparing
   Tickets: pending → accepted → in_progress → ready → completed

5. All Tickets Done
   Order: preparing → ready
   Tickets: all completed

6. Waiter Serves
   Order: served
   Tickets: (already completed)

7. Customer Finishes
   Order: completed
```

---

## Real Example: Pizza Restaurant

### The Order:
```
Customer orders:
- 2x Margherita Pizza
- 1x Caesar Salad
- 2x Cokes
```

### Tickets Created (when order → preparing):
```
Ticket #PIZZA-42 (Pizza Station)
├─ 2x Margherita Pizza (pending)
└─ Kitchen Staff: Pizza Chef

Ticket #SALAD-08 (Salad Station)
├─ 1x Caesar Salad (pending)
└─ Kitchen Staff: Salad Prep

Ticket #BEVERAGE-15 (Beverage Station)
├─ 2x Coke (pending)
└─ Kitchen Staff: Bartender
```

### Kitchen Screen Shows:
```
┌─────────────────────────────────────────┐
│           PIZZA STATION (KDS Screen)    │
├─────────────────────────────────────────┤
│  TICKET: PIZZA-42      [HIGH PRIORITY]  │
│  Order: #ORD-1234      Table: T5        │
│                                         │
│  Items:                                 │
│  ☐ 2x Margherita Pizza                  │
│    └─ Status: PENDING                   │
│                                         │
│  [ACCEPT] [START] [READY] [DONE]       │
└─────────────────────────────────────────┘
```

### Kitchen Actions (Pizza Chef Timeline):

```
10:15 - Sees PIZZA-42 appear on screen (status: pending)
        Clicks [ACCEPT]
        → Ticket status: accepted

10:17 - Starts making pizzas
        Clicks [START COOKING]
        → Ticket status: in_progress
        → Items status: in_progress

10:28 - Pizzas ready
        Clicks [READY]
        → Items status: ready
        → Ticket status: ready

10:29 - All done
        Clicks [DONE]
        → Ticket status: completed
        → Ticket disappears from screen ✓
```

### Meanwhile (Parallel Stations):

```
SALAD STATION            BEVERAGE STATION
───────────────          ────────────────
10:15 Ticket created     10:15 Ticket created
10:16 Accepted           10:16 Accepted
10:17 Started            10:17 Started
10:22 Ready              10:18 Ready
10:23 Completed          10:19 Completed
      ✓ Done                   ✓ Done
```

### Result on Waiter App:

```
When ALL tickets completed:
Order: preparing → ready
Screen shows: "Table T5 - Order ready for pickup!"

Waiter confirms pickup:
Order: ready → served → completed
```

---

## Ticket Status: Detailed

| Status | What It Means | Kitchen Staff Action | Next Status |
|--------|---------------|----------------------|-------------|
| **pending** | Ticket just created, not started yet | Look at screen, read items | `accepted` |
| **accepted** | Staff acknowledged the ticket | Click "Start" to begin | `in_progress` |
| **in_progress** | Currently cooking/preparing | Mark items as ready when done | `ready` |
| **ready** | All items prepared, waiting for pickup | Confirm completion | `completed` |
| **completed** | Done, ticket can be removed | ✓ Notify waiter | (terminal) |
| **canceled** | Order was canceled mid-prep | Stop cooking | (terminal) |

---

## Key Insight: Tickets ≠ Order

```
WRONG: "When I complete a ticket, order is done"
RIGHT: "When I complete a ticket, MY STATION is done. Other stations 
        might still be working. Order is done when ALL tickets completed."

EXAMPLE:
  Pizza Station completes: PIZZA-42 → completed ✓
  Salad Station still working: SALAD-08 → in_progress ⏳
  Beverage Station still working: BEVERAGE-15 → in_progress ⏳
  
  Order status: STILL preparing (waiting for salad & beverage)
  
  When ALL done:
  PIZZA-42 → completed ✓
  SALAD-08 → completed ✓
  BEVERAGE-15 → completed ✓
  
  Order status: NOW ready ✓
```

---

## How Our Order Routing Affects Tickets

### Before Order Routing (Old Way):
```
Web Order arrives → Waiter manually clicks "Accept" → Then "Prepare"
                              ↓
                      Order: pending → accepted → preparing
                              ↓
                     Tickets created immediately
```

### After Order Routing (New Way):

**For Trusted Orders (Waiter):**
```
Waiter places order (source: 'waiter')
         ↓
System automatically transitions (auto-routing enabled)
  pending → accepted → preparing
         ↓
Tickets created immediately (NO MANUAL STEP NEEDED)
```

**For Untrusted Orders (Web/Admin/Telegram):**
```
Customer places web order
         ↓
Order stays: pending (waiting for review)
         ↓
NO TICKETS YET (order hasn't been accepted)
         ↓
Waiter reviews in queue → clicks "Approve"
         ↓
Order: pending → accepted → preparing
         ↓
Now tickets created
```

---

## Ticket Item Status

Each item WITHIN a ticket has its own status:

```
Ticket #GRILL-42 (Ticket status: in_progress)
│
├─ Item: "Grilled Chicken" (qty: 2)
│  Status: ready ✓  (Done, waiting for other items)
│  Completed: 10:35
│
├─ Item: "Beef Steak" (qty: 1)
│  Status: in_progress ⏳ (Still cooking)
│  Started: 10:20
│
└─ Item: "Grilled Veggies" (qty: 1)
   Status: pending (Not started yet)
```

Chef can:
1. Mark individual items as ready
2. Continue working on others
3. Only mark entire ticket "Done" when all items ready

---

## Common Scenarios

### Scenario 1: Customer Cancels Mid-Prep
```
Order: pending → accepted → preparing (cooking now!)
Tickets: PIZZA-42 (in_progress), SALAD-08 (in_progress)

Customer: "Actually, I changed my mind!"

System:
  Order: preparing → canceled
  Ticket PIZZA-42 → canceled
  Ticket SALAD-08 → canceled

Kitchen Screen: Tickets disappear, shows "Order #ORD-1234 CANCELED"
```

### Scenario 2: One Station Done, Others Still Cooking
```
Pizza done: PIZZA-42 → completed (removed from screen)
Salad still cooking: SALAD-08 → in_progress (still on screen)
Beverage still waiting: BEVERAGE-15 → pending (waiting for turn)

Order: still preparing (all items not done yet)

When ALL complete:
  Order automatically → ready
  Waiter notified: "Table T5 ready!"
```

### Scenario 3: Rush Order (High Priority)
```
High Priority Web Order arrives:
  - Order: pending (waiting for review)
  - Tickets: NONE YET

Waiter fast-approves:
  - Order: pending → accepted → preparing
  - Tickets created with priority: "HIGH"

Kitchen Screen: Red highlight! This ticket priority!
```

---

## Frontend Display Example

### For Kitchen Staff (KDS Screen):

```
┌────────────────────────────────────────────────┐
│          PIZZA STATION - KDS DISPLAY           │
├────────────────────────────────────────────────┤
│                                                │
│  URGENT                                        │
│  ┌──────────────────────────────────────────┐ │
│  │ PIZZA-42 | ORDER #ORD-1234 | TABLE T5   │ │
│  │ [⏱ 14 min] [PRIORITY: HIGH]              │ │
│  ├──────────────────────────────────────────┤ │
│  │ 2x Margherita Pizza                      │ │
│  │ NOTES: Extra sauce                       │ │
│  │                                          │ │
│  │ [ACCEPT] [START] [MARK READY] [DONE]   │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  NEXT IN QUEUE                                 │
│  ┌──────────────────────────────────────────┐ │
│  │ PIZZA-43 | ORDER #ORD-1235 | TABLE T2   │ │
│  │ [⏱ 2 min]                                │ │
│  ├──────────────────────────────────────────┤ │
│  │ 1x Pepperoni Pizza                       │ │
│  │ 1x Garlic Bread                          │ │
│  │                                          │ │
│  │ [ACCEPT] [START]                         │ │
│  └──────────────────────────────────────────┘ │
│                                                │
└────────────────────────────────────────────────┘
```

### For Waiters (Order Management):

```
┌────────────────────────────────────────┐
│        ACTIVE ORDERS - WAITER VIEW      │
├────────────────────────────────────────┤
│                                        │
│  ORDER #ORD-1234 | TABLE T5            │
│  Status: PREPARING 🔄                  │
│  ├─ PIZZA: 2x Margherita (in_progress) │
│  ├─ SALAD: 1x Caesar (ready) ✓         │
│  └─ BEVERAGE: 2x Coke (in_progress)    │
│                                        │
│  [CANCEL] [NOTES] [DETAILS]            │
│                                        │
├────────────────────────────────────────┤
│                                        │
│  ORDER #ORD-1235 | TABLE T2            │
│  Status: READY ✓ 🔔                    │
│  All items prepared!                   │
│  [PICKUP] [CANCEL]                     │
│                                        │
└────────────────────────────────────────┘
```

---

## Summary: Your Question Answered

### ✅ "When order goes to KDS, there are statuses?"

**YES, definitely!**

1. **Order has its own status** → customer sees it
2. **Each Kitchen Station gets a Ticket** with its own status
3. **Tickets created** when order reaches 'preparing'
4. **Ticket has statuses**: pending → accepted → in_progress → ready → completed
5. **Items within tickets** also have statuses (pending/in_progress/ready)
6. **Kitchen staff manages tickets** on KDS screen
7. **Waiters manage orders** based on ticket completion
8. **Order only "ready"** when ALL tickets are completed

---

## Next Steps for You

1. **Understand the flow**: Order → Tickets (1:N relationship)
2. **Know when created**: When order reaches 'preparing' status
3. **Track timings**: How long each station takes
4. **Monitor all stations**: Order done only when ALL tickets done
5. **Handle cancellations**: Cancel order = cancel all related tickets

✅ **Done! You now understand KDS ticket management!**
