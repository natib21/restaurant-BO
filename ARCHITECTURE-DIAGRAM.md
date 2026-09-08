# System Architecture - Visual Overview

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐              ┌──────────────────┐       │
│  │  Customer App    │              │  Staff Dashboard │       │
│  │  (Mobile/Web)    │              │     (Web)        │       │
│  │                  │              │                  │       │
│  │  • QR Scanner    │              │  • Active Tables │       │
│  │  • Menu          │              │  • Session View  │       │
│  │  • Cart          │              │  • Close Table   │       │
│  │  • Order Track   │              │  • Analytics     │       │
│  └──────────────────┘              └──────────────────┘       │
│         │                                   │                  │
│         │ HTTP REST API                     │ HTTP REST API    │
│         │ Socket.IO Events                  │ Socket.IO Events │
│         ▼                                   ▼                  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Express.js API Server                        │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │  │
│  │  │   Order     │  │   Session    │  │    Table      │  │  │
│  │  │  Controller │  │   Service    │  │  Controller   │  │  │
│  │  └─────────────┘  └──────────────┘  └───────────────┘  │  │
│  │         │                │                   │          │  │
│  │         └────────────────┴───────────────────┘          │  │
│  │                          │                               │  │
│  └──────────────────────────┼───────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────┼───────────────────────────────┐  │
│  │         Socket.IO Server │                               │  │
│  │                          │                               │  │
│  │  Rooms:                  │                               │  │
│  │  • order:{orderId}       │                               │  │
│  │  • branch:{id}:perm:VIEW │                               │  │
│  │  • session:{token}       │                               │  │
│  └──────────────────────────┼───────────────────────────────┘  │
│                             │                                  │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      MongoDB (Replica Set)                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ DiningSession│  │    Order     │  │    Table     │         │
│  │              │  │              │  │              │         │
│  │ • table      │  │ • session ───┼──▶ • _id       │         │
│  │ • status     │  │ • source     │  │ • number     │         │
│  │ • token      │  │ • items      │  │ • status     │         │
│  │ • startedAt  │  │ • amount     │  │ • isActive   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Customer Flow Sequence

```
Customer                QR Code         Frontend          Backend           Database
   │                      │                │                │                  │
   │  1. Open Camera      │                │                │                  │
   ├─────────────────────▶│                │                │                  │
   │                      │                │                │                  │
   │  2. Scan QR          │                │                │                  │
   ├─────────────────────▶│                │                │                  │
   │                      │                │                │                  │
   │  3. Parse QR Data    │                │                │                  │
   │     {tableId, token} │                │                │                  │
   │◀─────────────────────┤                │                │                  │
   │                      │                │                │                  │
   │  4. Navigate to Menu │                │                │                  │
   ├────────────────────────────────────▶│                │                  │
   │                      │                │                │                  │
   │  5. Load Menu        │                │                │                  │
   │                      │                │  GET /menu     │                  │
   │                      │                ├───────────────▶│                  │
   │                      │                │                │  Query Menu      │
   │                      │                │                ├─────────────────▶│
   │                      │                │                │◀─────────────────┤
   │                      │                │◀───────────────┤                  │
   │◀──────────────────────────────────────┤                │                  │
   │                      │                │                │                  │
   │  6. Add Items to Cart│                │                │                  │
   ├────────────────────────────────────▶│                │                  │
   │                      │                │                │                  │
   │  7. Place Order      │                │                │                  │
   ├────────────────────────────────────▶│                │                  │
   │                      │                │  POST /orders  │                  │
   │                      │                ├───────────────▶│                  │
   │                      │                │                │                  │
   │                      │                │                │ SessionService   │
   │                      │                │                │ .getOrCreate()   │
   │                      │                │                ├─────────────────▶│
   │                      │                │                │ Find/Create      │
   │                      │                │                │ DiningSession    │
   │                      │                │                │◀─────────────────┤
   │                      │                │                │                  │
   │                      │                │                │ Create Order     │
   │                      │                │                │ with session ref │
   │                      │                │                ├─────────────────▶│
   │                      │                │                │◀─────────────────┤
   │                      │                │                │                  │
   │                      │                │                │ Emit Socket.IO   │
   │                      │                │                │ 'order:new'      │
   │                      │                │                │                  │
   │                      │                │◀───────────────┤                  │
   │◀──────────────────────────────────────┤  Order placed  │                  │
   │   Order #QR-001                       │                │                  │
   │                      │                │                │                  │
   │  8. Track Order      │                │                │                  │
   ├────────────────────────────────────▶│                │                  │
   │                      │                │ Socket.IO      │                  │
   │                      │                │ subscribe      │                  │
   │                      │                ├───────────────▶│                  │
   │                      │                │ join room      │                  │
   │                      │                │ 'order:123'    │                  │
   │                      │                │                │                  │
   │  9. Status Updates   │                │                │                  │
   │     (real-time)      │                │◀───────────────┤                  │
   │◀──────────────────────────────────────┤ 'order:status  │                  │
   │   preparing → ready  │                │  -changed'     │                  │
   │                      │                │                │                  │
```

---

## 🔄 Staff Dashboard Flow Sequence

```
Staff            Dashboard          Socket.IO         Backend         Database
  │                  │                  │                │                │
  │  1. Login        │                  │                │                │
  ├─────────────────▶│                  │                │                │
  │                  │  POST /login     │                │                │
  │                  ├─────────────────────────────────▶│                │
  │                  │◀─────────────────────────────────┤                │
  │◀─────────────────┤  JWT Token                       │                │
  │                  │                  │                │                │
  │  2. Load Dashboard                 │                │                │
  ├─────────────────▶│                  │                │                │
  │                  │                  │                │                │
  │  3. Get Active   │                  │                │                │
  │     Sessions     │                  │                │                │
  │                  │  GET /branches/  │                │                │
  │                  │  {id}/sessions   │                │                │
  │                  ├─────────────────────────────────▶│                │
  │                  │                  │                │ Query active   │
  │                  │                  │                │ sessions       │
  │                  │                  │                ├───────────────▶│
  │                  │                  │                │◀───────────────┤
  │                  │◀─────────────────────────────────┤                │
  │◀─────────────────┤  [Sessions]                      │                │
  │  Display Tables  │                  │                │                │
  │                  │                  │                │                │
  │  4. Connect      │                  │                │                │
  │     Socket.IO    │                  │                │                │
  │                  ├─────────────────▶│                │                │
  │                  │  connect()       │                │                │
  │                  │  auth: token     │                │                │
  │                  │                  │  Authenticate  │                │
  │                  │                  ├───────────────▶│                │
  │                  │                  │◀───────────────┤                │
  │                  │◀─────────────────┤  Connected     │                │
  │                  │                  │                │                │
  │  5. Join Room    │                  │                │                │
  │                  ├─────────────────▶│                │                │
  │                  │  join('branch:   │                │                │
  │                  │   123:perm:VIEW')│                │                │
  │                  │                  │                │                │
  │                  │                  │                │                │
  │ ╔══════════════════════════════════╗│                │                │
  │ ║  Real-Time Events (ongoing)      ║│                │                │
  │ ╚══════════════════════════════════╝│                │                │
  │                  │                  │                │                │
  │  New Customer    │                  │                │  Customer      │
  │  Scans QR        │                  │                │  places order  │
  │                  │                  │                │◀───────────────┤
  │                  │                  │                │                │
  │                  │                  │                │ SessionService │
  │                  │                  │                │ emits event    │
  │                  │                  │◀───────────────┤                │
  │                  │◀─────────────────┤ 'session:      │                │
  │◀─────────────────┤   created'                       │                │
  │  🔔 Notification │  {tableNumber:   │                │                │
  │  New session at  │   'T-101'}       │                │                │
  │  Table T-101     │                  │                │                │
  │                  │                  │                │                │
  │  6. View Session │                  │                │                │
  │     Details      │                  │                │                │
  ├─────────────────▶│                  │                │                │
  │                  │  GET /sessions/  │                │                │
  │                  │  {id}/summary    │                │                │
  │                  ├─────────────────────────────────▶│                │
  │                  │                  │                │ Get session    │
  │                  │                  │                │ & orders       │
  │                  │                  │                ├───────────────▶│
  │                  │                  │                │◀───────────────┤
  │                  │◀─────────────────────────────────┤                │
  │◀─────────────────┤  Summary                         │                │
  │  Show: 3 orders  │  {orderCount: 3,                 │                │
  │  450 ETB total   │   totalAmount: 450}              │                │
  │                  │                  │                │                │
  │  7. Close Table  │                  │                │                │
  ├─────────────────▶│                  │                │                │
  │                  │  POST /tables/   │                │                │
  │                  │  {id}/close      │                │                │
  │                  ├─────────────────────────────────▶│                │
  │                  │                  │                │ SessionService │
  │                  │                  │                │ .endSession()  │
  │                  │                  │                ├───────────────▶│
  │                  │                  │                │ Update session │
  │                  │                  │                │ & table status │
  │                  │                  │                │◀───────────────┤
  │                  │                  │                │                │
  │                  │                  │                │ Emit event     │
  │                  │                  │◀───────────────┤                │
  │                  │◀─────────────────┤ 'session:      │                │
  │◀─────────────────┤   ended'                         │                │
  │  ✅ Table closed │  {summary}       │                │                │
  │                  │                  │                │                │
```

---

## 🔄 Race Condition Handling

When multiple customers scan same QR simultaneously:

```
Customer A           Customer B           Backend              Database
    │                    │                    │                    │
    │  Scan QR           │  Scan QR           │                    │
    ├───────────────────────────────────────▶│                    │
    │                    ├───────────────────▶│                    │
    │                    │                    │                    │
    │                    │                    │  Transaction 1     │
    │                    │                    │  Start             │
    │                    │                    ├───────────────────▶│
    │                    │                    │                    │
    │                    │                    │  Transaction 2     │
    │                    │                    │  Start             │
    │                    │                    ├───────────────────▶│
    │                    │                    │                    │
    │                    │                    │  Try create        │
    │                    │                    │  session (T1)      │
    │                    │                    ├───────────────────▶│
    │                    │                    │  ✅ Success        │
    │                    │                    │◀───────────────────┤
    │                    │                    │                    │
    │                    │                    │  Try create        │
    │                    │                    │  session (T2)      │
    │                    │                    ├───────────────────▶│
    │                    │                    │  ❌ Duplicate key  │
    │                    │                    │◀───────────────────┤
    │                    │                    │                    │
    │                    │                    │  Abort T2          │
    │                    │                    │  Fetch T1 session  │
    │                    │                    ├───────────────────▶│
    │                    │                    │◀───────────────────┤
    │                    │                    │                    │
    │◀───────────────────────────────────────┤  Session (isNew:   │
    │  Session (isNew: true)                 │   false)           │
    │                    │◀───────────────────┤                    │
    │                    │                    │                    │
    │  RESULT: Both customers have same session, no duplicates    │
    │                    │                    │                    │
```

**Key Points:**
- MongoDB unique index prevents duplicate sessions
- Transaction 2 gets duplicate key error
- Backend catches error and fetches winning session
- Both customers end up with same session
- Race condition safely handled

---

## 📊 Data Model Relationships

```
┌──────────────────┐
│    Merchant      │
│                  │
│  • businessName  │
│  • email         │
└────────┬─────────┘
         │
         │ 1:N
         │
┌────────▼─────────┐
│     Branch       │
│                  │
│  • name          │
│  • location      │
└────────┬─────────┘
         │
         │ 1:N
         │
┌────────▼─────────────────────────────────────────────┐
│                                                      │
│  ┌──────────────┐        ┌──────────────┐          │
│  │    Table     │        │ DiningSession│          │
│  │              │        │              │          │
│  │ • tableNumber│◀───────┤ • table      │          │
│  │ • status     │   1:1  │ • status     │          │
│  │ • capacity   │ (active)│ • token      │          │
│  └──────────────┘        │ • startedAt  │          │
│                          │ • endedAt    │          │
│                          └──────┬───────┘          │
│                                 │                   │
│                                 │ 1:N               │
│                                 │                   │
│                          ┌──────▼───────┐          │
│                          │    Order     │          │
│                          │              │          │
│                          │ • session ───┼──┐       │
│                          │ • source     │  │       │
│                          │ • items      │  │       │
│                          │ • amount     │  │       │
│                          │ • status     │  │       │
│                          └──────────────┘  │       │
│                                            │       │
└────────────────────────────────────────────┼───────┘
                                             │
                     Link ensures all orders │
                     at same table are in    │
                     same dining session     │
```

**Constraints:**
- **Unique Index:** `{ table: 1, status: 'active' }` ensures only 1 active session per table
- **Required Field:** `order.session` required for `orderType: 'dine_in'`
- **Enum Values:** `session.status` ∈ ['active', 'ended', 'cancelled']
- **Enum Values:** `order.source` ∈ ['qr', 'staff', 'web', 'pos']

---

## 🎯 Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       Event Timeline                            │
└─────────────────────────────────────────────────────────────────┘

Time │ Action                │ Event Emitted          │ Who Receives
─────┼───────────────────────┼────────────────────────┼─────────────────
     │                       │                        │
10:00│ Customer scans QR     │ session:created        │ Staff Dashboard
     │ (first customer)      │ {tableNumber: T-101}   │ (branch room)
     │                       │                        │
10:05│ Customer places order │ order:new              │ Staff + Kitchen
     │                       │ {orderId, items}       │ (branch room)
     │                       │                        │
10:06│ Another customer      │ (no event)             │ (session reused)
     │ scans same QR         │                        │
     │                       │                        │
10:07│ Second customer       │ order:new              │ Staff + Kitchen
     │ places order          │                        │
     │                       │                        │
10:15│ Kitchen marks item    │ order:item-status-     │ Customers (order
     │ as "preparing"        │ changed                │ rooms) + Staff
     │                       │ {itemId, status}       │
     │                       │                        │
10:25│ Kitchen marks order   │ order:status-changed   │ Customers + Staff
     │ as "ready"            │ {orderId, status}      │
     │                       │                        │
10:30│ Customer pays         │ (no event, internal)   │
     │                       │                        │
10:35│ Staff closes table    │ session:ended          │ Staff Dashboard
     │                       │ {sessionId, summary}   │ (branch room)
     │                       │                        │
```

---

## 🔐 Security Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Security Layers                              │
└──────────────────────────────────────────────────────────────────┘

Layer 1: Transport Security
┌────────────────────────────────────────────────────────────────┐
│  HTTPS / WSS (WebSocket Secure)                                │
│  • TLS 1.2+                                                    │
│  • Certificate validation                                      │
└────────────────────────────────────────────────────────────────┘
                              │
Layer 2: Authentication
┌────────────────────────────▼───────────────────────────────────┐
│  JWT Token Authentication                                      │
│  • Staff: Bearer token in headers                             │
│  • Socket.IO: Token in auth object                            │
│  • Customer: QR token validation                              │
└────────────────────────────▼───────────────────────────────────┘
                              │
Layer 3: Authorization
┌────────────────────────────▼───────────────────────────────────┐
│  Role-Based Access Control (RBAC)                              │
│  • TABLE_MANAGE capability for close table                    │
│  • ORDER_VIEW capability for viewing orders                   │
│  • ORDER_MANAGE capability for managing orders                │
└────────────────────────────▼───────────────────────────────────┘
                              │
Layer 4: Business Logic
┌────────────────────────────▼───────────────────────────────────┐
│  Validation & Rules                                            │
│  • Table exists and is active                                 │
│  • Session exists for dine-in orders                          │
│  • Payment validation before close                            │
│  • Input sanitization                                         │
└────────────────────────────▼───────────────────────────────────┘
                              │
Layer 5: Data Protection
┌────────────────────────────▼───────────────────────────────────┐
│  MongoDB Security                                              │
│  • Transactions for atomicity                                 │
│  • Unique constraints                                         │
│  • Field-level validation                                     │
│  • Replica set for reliability                                │
└────────────────────────────────────────────────────────────────┘
```

---

*This visual guide should help understand the complete system architecture!* 📐
