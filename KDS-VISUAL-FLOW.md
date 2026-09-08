# KDS Ticket Management - Visual Flow Diagram

## Complete Order to Kitchen Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER PLACES ORDER                               │
└─────────────────────┬───────────────────────────────────────────────────────┘
                      │
                      ↓
        ┌─────────────────────────────────┐
        │  Order Created (pending)        │
        │                                 │
        │  ❌ Tickets: NONE YET           │
        │  ✓ Waiter can see in app        │
        └─────────────┬───────────────────┘
                      │
              (Waiter Reviews Order)
                      │
                      ↓
        ┌─────────────────────────────────┐
        │  Order Accepted (accepted)      │
        │  by Waiter/Support              │
        │                                 │
        │  ❌ Tickets: NONE YET           │
        │  ✓ Ready to send to kitchen     │
        └─────────────┬───────────────────┘
                      │
         (Waiter Clicks "Send to Kitchen")
                      │
                      ↓
        ┌─────────────────────────────────┐
        │  Order: preparing 🔥            │
        │  "Sent to Kitchen!"             │
        │                                 │
        │  ✨ TICKETS CREATED NOW! ✨     │
        └─────────────┬───────────────────┘
                      │
         ┌────────────┴────────────┬──────────────────┐
         │                         │                  │
         ↓                         ↓                  ↓
  ┌─────────────────┐     ┌──────────────────┐   ┌──────────────────┐
  │ Ticket #PIZZA-1 │     │ Ticket #SALAD-1  │   │ Ticket #BEV-1    │
  │                 │     │                  │   │                  │
  │ Status: pending │     │ Status: pending  │   │ Status: pending  │
  │ Items: (2x Pizza)     │ Items: (1x Salad)    │ Items: (2x Coke) │
  │                 │     │                  │   │                  │
  │ 📱 Pizza Chef's │     │ 🥗 Salad Prep's  │   │ 🍹 Bartender's   │
  │    Screen       │     │    Screen        │   │    Screen        │
  └────────┬────────┘     └────────┬─────────┘   └────────┬─────────┘
           │                       │                      │
     (Chef accepts)          (Staff accepts)      (Bartender accepts)
           │                       │                      │
           ↓                       ↓                      ↓
  ┌─────────────────┐     ┌──────────────────┐   ┌──────────────────┐
  │ PIZZA-1: accepted│    │ SALAD-1: accepted │  │ BEV-1: accepted  │
  │ (Ready to start) │     │ (Ready to start)  │   │ (Ready to start) │
  └────────┬────────┘     └────────┬─────────┘   └────────┬─────────┘
           │                       │                      │
     (Chef starts)          (Starts prep)       (Starts drinks)
           │                       │                      │
           ↓                       ↓                      ↓
  ┌─────────────────────┐  ┌─────────────────────┐ ┌──────────────────┐
  │ PIZZA-1:in_progress │  │ SALAD-1:in_progress │ │ BEV-1:in_progress│
  │                     │  │                     │ │                  │
  │ Items: in_progress  │  │ Items: in_progress  │ │ Items: ready ✓   │
  │ ⏱ Started: 10:17    │  │ ⏱ Started: 10:17    │ │ ✓ Done!          │
  │                     │  │                     │ │                  │
  │ 🔥 COOKING...       │  │ 🔪 CHOPPING...      │ │                  │
  └────────┬────────────┘  └────────┬────────────┘ └────────┬─────────┘
           │                        │                       │
           │    (After 10 min)      │ (After 6 min)  (After 3 min)
           │                        │                       │
           ↓                        ↓                       │
  ┌─────────────────────┐  ┌──────────────────────┐        │
  │ PIZZA-1: ready ✓    │  │ SALAD-1: ready ✓     │        │
  │                     │  │                      │        │
  │ Items: ready ✓✓     │  │ Items: ready ✓       │        │
  │ Pizzas plated!      │  │ Salad plated!        │        │
  └────────┬────────────┘  └────────┬─────────────┘        │
           │                        │                       │
           │                        │            (BEV already done)
           │                        │                       │
           │   (Chef marks done)    │   (Staff marks done)  │
           │                        │                       ↓
           │                        │            ┌─────────────────┐
           │                        │            │ BEV-1: completed│
           │                        │            │ ✓ DONE ✓        │
           │                        │            │ (removed screen)│
           │                        │            └─────────────────┘
           │                        │
           ↓                        ↓
  ┌─────────────────────┐  ┌──────────────────────┐
  │ PIZZA-1: completed  │  │ SALAD-1: completed   │
  │ ✓ DONE ✓            │  │ ✓ DONE ✓             │
  │ (removed from KDS)  │  │ (removed from KDS)   │
  └────────┬────────────┘  └────────┬─────────────┘
           │                        │
           └────────────┬───────────┘
                        │
         (ALL TICKETS COMPLETED)
                        │
                        ↓
        ┌─────────────────────────────────────┐
        │     Order Status Updated:           │
        │     preparing → ready 🔔            │
        │                                     │
        │  App Notifies: "Ready for pickup!"  │
        │  Kitchen Notifies: "All items up!"  │
        └─────────────┬───────────────────────┘
                      │
                (Waiter Confirms Pickup)
                      │
                      ↓
        ┌─────────────────────────────────────┐
        │  Order: ready → served              │
        │                                     │
        │  ✓ Customer received their order    │
        └─────────────┬───────────────────────┘
                      │
                (Payment Completed)
                      │
                      ↓
        ┌─────────────────────────────────────┐
        │  Order: served → completed          │
        │  Payment Status: paid               │
        │                                     │
        │  ✓✓✓ DONE - Order Finished! ✓✓✓     │
        └─────────────────────────────────────┘
```

---

## Parallel Processing: Multiple Stations

```
TIMELINE VIEW: How stations work in parallel

10:15 ┌──────┐     ┌──────┐     ┌──────┐
      │PIZZA │     │SALAD │     │ BEV  │
      │pend. │     │pend. │     │pend. │
10:16 ├──────┤     ├──────┤     ├──────┤
      │accept│     │accept│     │accept│
10:17 ├──────┤     ├──────┤     ├──────┤
      │start ├─┐   │start ├─┐   │start │
      │      │ │   │      │ │   │      │
10:20 │cook  │ │   │prep  │ │   │pour │
      │      │ │   │      │ │   │      │
10:22 │      │ │   │done  ├─┤   │      │
      │      │ │   │ready ├─┤   │done  │
10:25 │done  ├─┤   │      │ │   │ready │
      │ready ├─┤   │      │ │   │      │
10:28 │      │ │   │      │ │   │      │
      │mark  │ │   │      │ │   │      │
10:29 │done  │ │   │      │ │   │      │
      │comp. ├─┘   │      │ │   │      │
      │      │     │      │ │   │      │
      │(gone)│     │      │ │   │      │
      │  ✓   │     │      │ │   │      │
      │      │     │      │ │   │      │
      │      │     │      │ │   │      │
      │      │     │comp. ├─┘   │      │
      │      │     │(gone)│     │      │
      │      │     │  ✓   │     │      │
      │      │     │      │     │(gone)│
      │      │     │      │     │  ✓   │
      │      │     │      │     │      │
      └──────┘     └──────┘     └──────┘

      PIZZA DONE      SALAD DONE    BEV DONE
      @ 10:29         @ 10:29       @ 10:19
      
      ➜ All 3 stations complete → Order READY
```

---

## Cancel Scenario: Order Canceled Mid-Prep

```
SCENARIO: Customer calls "Cancel! I changed my mind!"

                Current State:
                • Order: preparing (cooking now!)
                • Tickets: PIZZA-1 (in_progress)
                •          SALAD-1 (in_progress)
                •          BEV-1 (completed)

                          ↓

            ┌─────────────────────────────┐
            │  Cancel Order API Called    │
            └─────────────┬───────────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
                ↓                   ↓
         ┌─────────────┐      ┌─────────────┐
         │ Order:      │      │ Tickets:    │
         │ canceled ✗  │      │ CANCELED ✗  │
         └─────────────┘      │             │
                              │ PIZZA-1     │
                              │  → canceled │
                              │             │
                              │ SALAD-1     │
                              │  → canceled │
                              │             │
                              │ BEV-1       │
                              │  → completed│
                              │  (already   │
                              │   done)     │
                              └─────────────┘
                              
        ┌─────────────────────────────┐
        │ Kitchen Notification:       │
        │ "Order #ORD-1234 CANCELED"  │
        │ Stop cooking! Customer left │
        └─────────────────────────────┘
        
        ┌─────────────────────────────┐
        │ Kitchen Screens Update:     │
        │ PIZZA-1 → DISAPPEARS ✗      │
        │ SALAD-1 → DISAPPEARS ✗      │
        │ "Order canceled"            │
        └─────────────────────────────┘
```

---

## Ticket Status Transition Rules

```
Valid State Transitions:

      ┌─ pending ──────────┐
      │    (start here)    │
      │                    │
      ├─→ accepted ────────┤
      │    (acknowledge)   │
      │                    │
      ├─→ in_progress ─────┤
      │    (cooking)       │
      │                    │
      ├─→ ready ──────────┤
      │    (plating)       │
      │                    │
      └─→ completed ───────┤
           (finish)        │
                           │
      OR cancel anytime    │
      ├─→ canceled ────────┤
           (stop work)     │
           
Terminal States (can't change):
  ✗ completed
  ✗ canceled
```

---

## How Order Routing Affects Tickets

```
WITH ORDER ROUTING (New System):

┌─ TRUSTED ORDER (Waiter) ──────────────────────┐
│                                               │
│  Waiter creates order (source: 'waiter')     │
│          ↓                                    │
│  Auto-routing enabled? YES                   │
│  requiresReview: false                       │
│          ↓                                    │
│  System auto-transitions:                    │
│  pending → accepted → ✨ preparing           │
│          ↓                                    │
│  Tickets created IMMEDIATELY                 │
│  Kitchen sees them RIGHT AWAY               │
│                                               │
│  ⏱ Time to kitchen: ~1 second               │
└───────────────────────────────────────────────┘

┌─ UNTRUSTED ORDER (Web/Admin/Telegram) ───────┐
│                                               │
│  Customer creates web order                  │
│          ↓                                    │
│  Order: pending (waiting for review)         │
│  Tickets: NONE YET                           │
│          ↓                                    │
│  Waiter reviews in queue                     │
│  Clicks "Approve"                            │
│          ↓                                    │
│  pending → accepted → ✨ preparing           │
│          ↓                                    │
│  Tickets created NOW                         │
│  Kitchen sees them                           │
│                                               │
│  ⏱ Time to kitchen: 2-5 minutes (review)    │
└───────────────────────────────────────────────┘
```

---

## Table Status Integration

```
DINE-IN ORDER WITH TABLE:

Order Created
└─ table: T5 → status: occupied
              (customer seated)

Order: pending → accepted → preparing
└─ Tickets created
└─ Kitchen starts cooking

Order: preparing → ready
└─ Table still occupied (waiting for food)

Order: ready → served
└─ Table still occupied (eating)

Order: served → completed
└─ PAYMENT PROCESSED
└─ Table T5 → status: available
              (table freed for next customer!)
```

---

## Status Matrix: All Possibilities

```
┌─────────────────────────────────────────────────────────────┐
│              COMPLETE STATUS REFERENCE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ORDER STATUS      │ TICKET STATUS   │ WHAT'S HAPPENING    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ pending           │ NONE            │ Waiting for approval│
│ accepted          │ NONE            │ Approved, preparing│
│ preparing         │ pending         │ Ticket appeared    │
│ preparing         │ accepted        │ Staff acknowledged │
│ preparing         │ in_progress     │ 🔥 COOKING         │
│ preparing         │ ready           │ Done, plating      │
│ preparing         │ completed       │ One station done   │
│ ready             │ ALL completed   │ All done, ready    │
│ served            │ ALL completed   │ Given to customer  │
│ completed         │ ALL completed   │ ✓ Finished         │
│ canceled          │ ALL canceled    │ ✗ Stopped          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary: 3-Point Answer to Your Question

### ❓ "When order goes to KDS, there are statuses?"

### ✅ Point 1: YES, Tickets Have Statuses
Each ticket has its own status: `pending → accepted → in_progress → ready → completed`

### ✅ Point 2: When Are They Created?
When order transitions to `preparing` status (from accepted)

### ✅ Point 3: Multiple Tickets, Multiple Statuses
- One order = Multiple tickets (one per station)
- Each ticket progresses independently
- Kitchen sees individual ticket statuses on KDS screen
- Waiter sees overall order status in app
- Order only "ready" when ALL tickets complete

---

**That's it! You now have a complete understanding of KDS ticket management!** 🎉
