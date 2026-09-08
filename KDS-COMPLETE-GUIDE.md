# Kitchen Display System (KDS) - Complete Guide

## Table of Contents
1. [What is KDS?](#what-is-kds)
2. [Core Concepts](#core-concepts)
3. [System Architecture](#system-architecture)
4. [Complete Workflow](#complete-workflow)
5. [API Endpoints Reference](#api-endpoints-reference)
6. [Real-World Examples](#real-world-examples)
7. [WebSocket Events](#websocket-events)
8. [Frontend Integration](#frontend-integration)

---

## What is KDS?

**Kitchen Display System (KDS)** is a digital system that replaces paper tickets in restaurant kitchens. When customers place orders, instead of printing paper slips, the system displays order items on digital screens at different kitchen stations.

### Why KDS?

**Traditional Problems:**
- 📄 Paper tickets get lost, dirty, or illegible
- 🔥 Kitchen staff can't see order priority
- ⏰ No real-time status updates
- 🤷 Waiters don't know when food is ready
- 📊 No data on kitchen performance

**KDS Solutions:**
- 📱 Digital displays at each station
- ⚡ Real-time status updates
- 🎯 Clear priority and timing
- 🔔 Automatic notifications when ready
- 📈 Performance analytics

---

## Core Concepts

### 1. Kitchen Stations

**What is a Station?**
A **kitchen station** is a physical work area in the kitchen where specific types of food are prepared.

**Examples:**
- **GRILL** - Hot items: burgers, steaks, grilled chicken
- **SALAD** - Cold items: salads, cold appetizers
- **FRY** - Fried items: fries, fried chicken, onion rings
- **DESSERT** - Desserts: cakes, ice cream
- **BAR** - Drinks: cocktails, smoothies
- **PIZZA** - Pizza station
- **WOK** - Asian stir-fry dishes

**Station Data Model:**
```javascript
{
  _id: "507f1f77bcf86cd799439011",
  merchant: "507f...",
  branch: "507f...",
  code: "GRILL",              // Unique identifier (uppercase)
  name: "Grill Station",      // Human-readable name
  description: "Hot food prep area",
  isActive: true,             // Can be disabled without deleting
  displayOrder: 1,            // Order in UI (1 = first)
  createdAt: "2026-08-18T10:00:00.000Z",
  updatedAt: "2026-08-18T10:00:00.000Z"
}
```

**Why Stations Matter:**
- Each menu item belongs to a station (e.g., "Cheeseburger" → GRILL)
- Each station has its own display screen
- Kitchen staff specialize in their station
- Orders are split by station automatically

---

### 2. Kitchen Tickets

**What is a Ticket?**
A **kitchen ticket** is a digital work order for a specific station containing all items from an order that need to be prepared at that station.

**Key Points:**
- **One ticket per station per order**
- If an order has items from 3 stations → creates 3 tickets
- Each ticket has its own status lifecycle
- Tickets are station-specific (GRILL staff only see GRILL tickets)

**Ticket Data Model:**
```javascript
{
  _id: "507f...",
  merchant: "507f...",
  branch: "507f...",
  order: "507f...",                    // Parent order reference
  station: "507f...",                  // Which station (GRILL, SALAD, etc.)
  
  // Identification
  ticketNumber: "GRILL-42",            // Auto-generated: STATION-SEQUENCE
  orderNumber: "ORD-1234",             // Customer's order number
  orderType: "dine-in",                // dine-in, takeaway, delivery
  tableNumber: "T-05",                 // If dine-in
  
  // Items for this station
  items: [
    {
      orderItemId: "507f...",          // Reference to order item
      menuItem: "507f...",             // Menu item reference
      menuItemName: "Cheeseburger",    // Cached name
      quantity: 2,
      notes: "No onions, extra pickles",
      status: "pending"                // Item status (future use)
    },
    {
      orderItemId: "507f...",
      menuItem: "507f...",
      menuItemName: "Grilled Chicken",
      quantity: 1,
      notes: null,
      status: "pending"
    }
  ],
  
  // Status and lifecycle
  status: "pending",                   // pending → accepted → in_progress → ready → completed
  priority: "normal",                  // normal, high, urgent
  
  // Timestamps
  createdAt: "2026-08-18T12:30:00.000Z",
  acceptedAt: null,                    // When staff accepted
  startedAt: null,                     // When cooking started
  completedAt: null,                   // When marked ready
  
  // Actor tracking
  assignedTo: null,                    // Staff member _id
  
  // Cancellation
  canceledAt: null,
  canceledBy: null,
  canceledReason: null
}
```

---

### 3. Menu Items and Station Assignment

**How Items Know Their Station:**

Each menu item has a `kitchenStation` field that determines where it should be prepared:

```javascript
// Menu Item Example
{
  _id: "507f...",
  name: "Cheeseburger",
  category: "main-course",
  kitchenStation: "507f...",           // Points to GRILL station
  prepTime: 12,                        // Estimated minutes
  price: 15.99
}
```

**Example Menu→Station Mapping:**
- Cheeseburger → **GRILL**
- Caesar Salad → **SALAD**
- French Fries → **FRY**
- Mojito → **BAR**
- Tiramisu → **DESSERT**

**Special Case - No Station:**
Some items don't need kitchen prep (e.g., canned soda, bottled water). These have `kitchenStation: null` and **don't create tickets**.

---

### 4. Ticket Status Lifecycle

```
┌─────────┐
│ PENDING │  ← Ticket created when order → "preparing"
└────┬────┘
     │
     │ Kitchen staff clicks "Accept"
     ▼
┌─────────┐
│ACCEPTED │  ← Staff acknowledged the ticket
└────┬────┘
     │
     │ Staff clicks "Start"
     ▼
┌────────────┐
│IN_PROGRESS │  ← Actively cooking
└─────┬──────┘
      │
      │ Staff clicks "Ready"
      ▼
┌──────┐
│READY │  ← Food ready for pickup
└──────┘
```

**Status Descriptions:**

| Status | What It Means | Who Can Trigger | Next Status |
|--------|---------------|-----------------|-------------|
| **pending** | Just created, not acknowledged | System (automatic) | accepted, canceled |
| **accepted** | Kitchen staff saw it and will make it | Kitchen staff | in_progress, canceled |
| **in_progress** | Actively being cooked | Kitchen staff | ready, canceled |
| **ready** | Food is done, waiting for waiter pickup | Kitchen staff | (stays ready until order served) |
| **completed** | Order was served to customer | System (Phase 2) | - |
| **canceled** | Ticket was canceled (order canceled/modified) | Kitchen/Waiter/Admin | - |

---

### 5. Categories vs Stations

**⚠️ Important Distinction:**

| Concept | What It Is | Purpose | Example |
|---------|-----------|---------|---------|
| **Category** | Menu organization for **customers** | Helps customers browse menu | "Appetizers", "Main Course", "Desserts" |
| **Station** | Physical **kitchen work area** | Determines where food is prepared | "GRILL", "SALAD", "FRY" |

**Real Example:**
```javascript
// Menu Item: French Fries
{
  name: "French Fries",
  category: "appetizers",        // Customer sees: Appetizers section
  kitchenStation: "FRY",         // Kitchen: Goes to FRY station
}

// Menu Item: Grilled Chicken Salad
{
  name: "Grilled Chicken Salad",
  category: "salads",            // Customer sees: Salads section
  kitchenStation: "GRILL",       // Kitchen: Goes to GRILL (chicken must be grilled)
}
```

**Note:** In your frontend error, `cat_01` likely refers to a category code (not a station code). Make sure you're sending **station codes** to KDS endpoints!

---

## System Architecture

### High-Level Flow

```
┌──────────┐
│ CUSTOMER │  Places order
└─────┬────┘
      │
      ▼
┌──────────────┐
│    ORDER     │  Status: pending → confirmed → preparing
└──────┬───────┘
       │
       │ When order → "preparing"
       ▼
┌────────────────────────────────────────────┐
│     OUTBOX EVENT: order:preparing         │
└────────────────┬───────────────────────────┘
                 │
                 │ Outbox worker picks up event
                 ▼
┌─────────────────────────────────────────────┐
│   KDS HANDLER: createTicketsForOrder()     │
│   - Groups order items by station          │
│   - Creates one ticket per station         │
└────────────────┬────────────────────────────┘
                 │
       ┌─────────┴──────────┐
       │                    │
       ▼                    ▼
┌──────────────┐    ┌──────────────┐
│ GRILL Ticket │    │ SALAD Ticket │
│  GRILL-42    │    │  SALAD-15    │
│  Status:     │    │  Status:     │
│  pending     │    │  pending     │
└──────┬───────┘    └──────┬───────┘
       │                   │
       │ WebSocket emit    │ WebSocket emit
       │                   │
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│ GRILL Screen │    │ SALAD Screen │
│  (Frontend)  │    │  (Frontend)  │
└──────────────┘    └──────────────┘
```

---

## Complete Workflow

### Scenario: Customer Orders Combo Meal

**Customer Order:**
- 1x Cheeseburger (GRILL station)
- 1x French Fries (FRY station)
- 1x Caesar Salad (SALAD station)
- 1x Coke (no station - bottled drink)

---

### Step-by-Step Flow

#### Step 1: Order Placed
```
POST /api/v1/orders
{
  "orderType": "dine-in",
  "tableNumber": "T-05",
  "items": [
    { "menuItem": "507f...", "quantity": 1, "notes": "No onions" },  // Cheeseburger
    { "menuItem": "507f...", "quantity": 1 },                        // Fries
    { "menuItem": "507f...", "quantity": 1 },                        // Salad
    { "menuItem": "507f...", "quantity": 1 }                         // Coke
  ]
}

Response:
{
  "data": {
    "order": {
      "_id": "507f...",
      "orderNumber": "ORD-1234",
      "status": "pending"
    }
  }
}
```

---

#### Step 2: Waiter Confirms Order
```
PATCH /api/v1/orders/507f.../status
{
  "toStatus": "confirmed"
}

→ Order status: pending → confirmed
```

---

#### Step 3: Kitchen Starts Preparing
```
PATCH /api/v1/orders/507f.../status
{
  "toStatus": "preparing"
}

→ Order status: confirmed → preparing
→ Triggers outbox event: "order:preparing"
```

---

#### Step 4: Outbox Worker Creates Tickets

**Backend (Automatic):**
```javascript
// Outbox worker picks up event
// Calls: KitchenTicketService.createTicketsForOrder()

// Groups items by station:
GRILL: [Cheeseburger]
FRY:   [French Fries]
SALAD: [Caesar Salad]
(Coke has no station - skipped)

// Creates 3 tickets:
```

**Ticket 1 - GRILL:**
```javascript
{
  ticketNumber: "GRILL-42",
  orderNumber: "ORD-1234",
  station: "507f... (GRILL)",
  items: [
    {
      menuItemName: "Cheeseburger",
      quantity: 1,
      notes: "No onions"
    }
  ],
  status: "pending",
  priority: "normal"
}
```

**Ticket 2 - FRY:**
```javascript
{
  ticketNumber: "FRY-28",
  orderNumber: "ORD-1234",
  station: "507f... (FRY)",
  items: [
    {
      menuItemName: "French Fries",
      quantity: 1,
      notes: null
    }
  ],
  status: "pending"
}
```

**Ticket 3 - SALAD:**
```javascript
{
  ticketNumber: "SALAD-15",
  orderNumber: "ORD-1234",
  station: "507f... (SALAD)",
  items: [
    {
      menuItemName: "Caesar Salad",
      quantity: 1,
      notes: null
    }
  ],
  status: "pending"
}
```

---

#### Step 5: Kitchen Stations See Tickets

**GRILL Station Screen:**
```
GET /api/v1/kitchen/stations/GRILL/tickets

Response:
{
  "data": {
    "tickets": [
      {
        "ticketNumber": "GRILL-42",
        "orderNumber": "ORD-1234",
        "status": "pending",
        "items": [...],
        "createdAt": "2026-08-18T12:30:00.000Z"
      },
      // ... other pending GRILL tickets
    ]
  }
}
```

**FRY Station Screen:** (sees FRY-28)  
**SALAD Station Screen:** (sees SALAD-15)

---

#### Step 6: Grill Staff Accepts Ticket

**Staff clicks "Accept" button:**
```
PATCH /api/v1/kitchen/tickets/507f.../accept

→ Ticket status: pending → accepted
→ acceptedAt: timestamp
→ assignedTo: staff member ID
→ WebSocket emits: "ticket:updated"
```

**Screen Updates:**
- ✅ Ticket shows "ACCEPTED" badge
- 👤 Shows staff member name
- 🕐 Shows acceptance timestamp

---

#### Step 7: Staff Starts Cooking

**Staff clicks "Start Cooking" button:**
```
PATCH /api/v1/kitchen/tickets/507f.../start

→ Ticket status: accepted → in_progress
→ startedAt: timestamp
→ WebSocket emits: "ticket:updated"
```

**Screen Updates:**
- 🔥 Ticket shows "IN PROGRESS" badge
- ⏱️ Timer starts counting up
- 🟡 Yellow highlight on ticket

---

#### Step 8: Food Ready

**Staff clicks "Mark Ready" button:**
```
PATCH /api/v1/kitchen/tickets/507f.../ready

→ Ticket status: in_progress → ready
→ completedAt: timestamp
→ WebSocket emits: "ticket:updated"
```

**Screen Updates:**
- ✅ Ticket shows "READY" badge
- 🟢 Green highlight
- 🔔 Notification to expo/waiters

---

#### Step 9: All Tickets Ready → Order Ready

**Backend (Automatic):**
```javascript
// When GRILL-42 → ready:
// Check: Are all tickets for ORD-1234 ready?

GRILL-42: ready ✅
FRY-28:   ready ✅
SALAD-15: ready ✅

→ All ready! Trigger outbox event: "kitchen:all_tickets_ready"
→ Order handler transitions order: preparing → ready
→ WebSocket emits to expo: "order:ready"
```

---

#### Step 10: Order Served

**Waiter marks order as served:**
```
PATCH /api/v1/orders/507f.../status
{
  "toStatus": "served"
}

→ Order status: ready → served
→ (Future: Mark all tickets as "completed")
```

---

## API Endpoints Reference

### Base URL
```
http://localhost:8000/api/v1/kitchen
```

### Authentication
All endpoints require JWT token in header:
```
Authorization: Bearer <your-jwt-token>
```

---

### 1. Get All Stations

**Purpose:** List all kitchen stations in the branch

```http
GET /api/v1/kitchen/stations
```

**Query Parameters:**
- `includeInactive` (optional) - Include disabled stations (default: false)

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "stations": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "code": "GRILL",
        "name": "Grill Station",
        "description": "Hot food prep",
        "isActive": true,
        "displayOrder": 1,
        "createdAt": "2026-08-18T10:00:00.000Z",
        "updatedAt": "2026-08-18T10:00:00.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "code": "SALAD",
        "name": "Salad Station",
        "description": "Cold food prep",
        "isActive": true,
        "displayOrder": 2,
        "createdAt": "2026-08-18T10:00:00.000Z",
        "updatedAt": "2026-08-18T10:00:00.000Z"
      }
    ]
  }
}
```

**Use Case:** Frontend loads this on app init to build station list

---

### 2. Get Station Tickets

**Purpose:** Get all tickets for a specific station (for station display screens)

```http
GET /api/v1/kitchen/stations/:stationIdOrCode/tickets
```

**Parameters:**
- `stationIdOrCode` - Station ObjectId OR station code (e.g., "GRILL", "cat_01")

**Response:**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "tickets": [
      {
        "_id": "507f...",
        "ticketNumber": "GRILL-42",
        "orderNumber": "ORD-1234",
        "orderType": "dine-in",
        "tableNumber": "T-05",
        "status": "pending",
        "priority": "normal",
        "items": [
          {
            "orderItemId": "507f...",
            "menuItem": "507f...",
            "menuItemName": "Cheeseburger",
            "quantity": 2,
            "notes": "No onions, extra pickles",
            "status": "pending"
          }
        ],
        "station": {
          "_id": "507f...",
          "name": "Grill Station",
          "code": "GRILL",
          "color": "#FF5722"
        },
        "order": {
          "_id": "507f...",
          "orderNumber": "ORD-1234",
          "orderType": "dine-in",
          "tableNumber": "T-05"
        },
        "assignedTo": null,
        "createdAt": "2026-08-18T12:30:00.000Z",
        "acceptedAt": null,
        "startedAt": null,
        "completedAt": null
      }
    ]
  }
}
```

**Use Case:** GRILL station screen polls this endpoint or listens to WebSocket

---

### 3. Get All Tickets (Cross-Station)

**Purpose:** Get all tickets across all stations (for manager/expo view)

```http
GET /api/v1/kitchen/tickets
```

**Query Parameters:**
- `stationId` (optional) - Filter by station
- `status` (optional) - Filter by status (pending, accepted, in_progress, ready)

**Response:** Same format as station tickets, but includes tickets from all stations

**Use Case:** Kitchen manager dashboard showing all active tickets

---

### 4. Get Order Tickets

**Purpose:** Get all tickets for a specific order (for order detail view)

```http
GET /api/v1/kitchen/orders/:orderId/tickets
```

**Parameters:**
- `orderId` - Order ObjectId

**Response:** Array of tickets for this order

**Use Case:** Waiter checks "Which stations are working on my order?"

---

### 5. Accept Ticket

**Purpose:** Kitchen staff accepts responsibility for a ticket

```http
PATCH /api/v1/kitchen/tickets/:ticketId/accept
```

**Request Body:** (empty)

**Response:**
```json
{
  "status": "success",
  "data": {
    "ticket": { /* updated ticket with status: accepted */ },
    "message": "Ticket accepted successfully"
  }
}
```

**Status Transition:** `pending → accepted`

**Side Effects:**
- Sets `acceptedAt` timestamp
- Sets `assignedTo` to current user
- Emits WebSocket event

---

### 6. Start Ticket

**Purpose:** Staff starts actively cooking

```http
PATCH /api/v1/kitchen/tickets/:ticketId/start
```

**Request Body:** (empty)

**Response:**
```json
{
  "status": "success",
  "data": {
    "ticket": { /* updated ticket */ },
    "message": "Ticket started successfully"
  }
}
```

**Status Transition:** `accepted → in_progress`

**Side Effects:**
- Sets `startedAt` timestamp
- Emits WebSocket event

---

### 7. Mark Ticket Ready

**Purpose:** Food is done and ready for pickup

```http
PATCH /api/v1/kitchen/tickets/:ticketId/ready
```

**Request Body:** (empty)

**Response:**
```json
{
  "status": "success",
  "data": {
    "ticket": { /* updated ticket */ },
    "message": "Ticket marked as ready"
  }
}
```

**Status Transition:** `in_progress → ready`

**Side Effects:**
- Sets `completedAt` timestamp
- Checks if all order tickets are ready
- If yes, transitions parent order to `ready`
- Emits WebSocket event

---

### 8. Cancel Ticket

**Purpose:** Cancel a ticket (order canceled/modified)

```http
PATCH /api/v1/kitchen/tickets/:ticketId/cancel
```

**Request Body:**
```json
{
  "reason": "Customer canceled order"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "ticket": { /* updated ticket */ },
    "message": "Ticket canceled successfully"
  }
}
```

**Status Transition:** `any → canceled`

**Side Effects:**
- Sets `canceledAt`, `canceledBy`, `canceledReason`
- Emits WebSocket event
- Removes from active displays

---

### 9. Update Ticket Status (Generic)

**Purpose:** Generic endpoint for any status transition (advanced use)

```http
PATCH /api/v1/kitchen/tickets/:ticketId/status
```

**Request Body:**
```json
{
  "status": "in_progress",
  "reason": "Optional reason for cancellation"
}
```

**Valid Statuses:** `accepted`, `in_progress`, `ready`, `canceled`

**Response:** Same as specific endpoints

**Use Case:** When you need programmatic status changes

---

## WebSocket Events

### Connection Setup

```javascript
const socket = io('http://localhost:8000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Subscribe to branch room
socket.emit('subscribe', {
  room: 'branch:507f1f77bcf86cd799439011'
});

// Subscribe to specific station
socket.emit('subscribe', {
  room: 'branch:507f1f77bcf86cd799439011:station:507f1f77bcf86cd799439012'
});
```

### Events Emitted by Server

#### `ticket:created`
New ticket created
```javascript
socket.on('ticket:created', (ticket) => {
  console.log('New ticket:', ticket.ticketNumber);
  // Add to display
});
```

#### `ticket:updated`
Ticket status changed
```javascript
socket.on('ticket:updated', (ticket) => {
  console.log('Ticket updated:', ticket.ticketNumber, ticket.status);
  // Update display
});
```

#### `order:ready`
All tickets for an order are ready
```javascript
socket.on('order:ready', (data) => {
  console.log('Order ready:', data.orderNumber);
  // Notify expo/waiters
});
```

---

## Real-World Examples

### Example 1: Breakfast Rush - Multiple Orders

**Scenario:** Morning rush, 5 orders come in at once

**Orders:**
1. Table 1: Pancakes (GRILL) + Orange Juice (BAR)
2. Table 2: Omelette (GRILL) + Toast (GRILL) + Coffee (BAR)
3. Table 3: Fruit Salad (SALAD)
4. Table 4: Waffles (GRILL)
5. Table 5: Smoothie (BAR)

**Tickets Created:**

**GRILL Station:**
- GRILL-10: Table 1 - Pancakes
- GRILL-11: Table 2 - Omelette, Toast
- GRILL-12: Table 4 - Waffles

**BAR Station:**
- BAR-5: Table 1 - Orange Juice
- BAR-6: Table 2 - Coffee
- BAR-7: Table 5 - Smoothie

**SALAD Station:**
- SALAD-3: Table 3 - Fruit Salad

**GRILL screen shows:** 3 pending tickets (GRILL-10, GRILL-11, GRILL-12)  
**BAR screen shows:** 3 pending tickets (BAR-5, BAR-6, BAR-7)  
**SALAD screen shows:** 1 pending ticket (SALAD-3)

---

### Example 2: Delivery Order - High Priority

**Scenario:** Delivery order needs to be out in 30 minutes

**Order:** ORD-5678 (Delivery - High Priority)
- 2x Burger (GRILL)
- 2x Fries (FRY)
- 2x Milkshake (BAR)

**Tickets:**
- GRILL-50: Priority HIGH, 2x Burger
- FRY-35: Priority HIGH, 2x Fries
- BAR-20: Priority HIGH, 2x Milkshake

**Frontend Display:**
- All 3 tickets show red "HIGH PRIORITY" badge
- Sorted to top of queue
- Timer shows countdown from 30 minutes

---

### Example 3: Order Modification

**Scenario:** Customer changes order mid-preparation

**Original Order:**
- Burger (GRILL) - Status: in_progress
- Fries (FRY) - Status: ready

**Customer:** "Change burger to no cheese!"

**Backend Action:**
1. Cancel existing GRILL ticket
2. Create new GRILL ticket with modified instructions
3. Keep FRY ticket (already ready)

**Tickets:**
- GRILL-51: CANCELED (reason: "Order modified")
- GRILL-52: PENDING (new ticket with "No cheese" note)
- FRY-36: READY (unchanged)

---

## Frontend Integration

### Complete Frontend Flow

#### 1. App Initialization

```javascript
// On app load
async function initializeKDS() {
  // Get all stations
  const { data: { stations } } = await api.get('/api/v1/kitchen/stations');
  
  // Store in state
  setStations(stations);
  
  // Connect WebSocket
  socket.emit('subscribe', {
    room: `branch:${branchId}`
  });
  
  // Load tickets for current station
  const { data: { tickets } } = await api.get(
    `/api/v1/kitchen/stations/${currentStationCode}/tickets`
  );
  
  setTickets(tickets);
}
```

---

#### 2. Station Display Component

```javascript
function StationDisplay({ stationCode }) {
  const [tickets, setTickets] = useState([]);
  
  // Poll for tickets (or use WebSocket)
  useEffect(() => {
    const loadTickets = async () => {
      const { data } = await api.get(
        `/api/v1/kitchen/stations/${stationCode}/tickets`
      );
      setTickets(data.tickets);
    };
    
    loadTickets();
    const interval = setInterval(loadTickets, 5000); // Poll every 5s
    
    return () => clearInterval(interval);
  }, [stationCode]);
  
  // WebSocket real-time updates
  useEffect(() => {
    socket.on('ticket:created', (ticket) => {
      if (ticket.station.code === stationCode) {
        setTickets(prev => [...prev, ticket]);
      }
    });
    
    socket.on('ticket:updated', (ticket) => {
      if (ticket.station.code === stationCode) {
        setTickets(prev => prev.map(t => 
          t._id === ticket._id ? ticket : t
        ));
      }
    });
    
    return () => {
      socket.off('ticket:created');
      socket.off('ticket:updated');
    };
  }, [stationCode]);
  
  return (
    <div className="station-display">
      <h1>{stationCode} Station</h1>
      <div className="tickets-grid">
        {tickets.map(ticket => (
          <TicketCard key={ticket._id} ticket={ticket} />
        ))}
      </div>
    </div>
  );
}
```

---

#### 3. Ticket Card Component

```javascript
function TicketCard({ ticket }) {
  const [loading, setLoading] = useState(false);
  
  const handleAccept = async () => {
    setLoading(true);
    try {
      await api.patch(`/api/v1/kitchen/tickets/${ticket._id}/accept`);
      // WebSocket will update the UI
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleStart = async () => {
    setLoading(true);
    try {
      await api.patch(`/api/v1/kitchen/tickets/${ticket._id}/start`);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleReady = async () => {
    setLoading(true);
    try {
      await api.patch(`/api/v1/kitchen/tickets/${ticket._id}/ready`);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className={`ticket-card status-${ticket.status}`}>
      <div className="ticket-header">
        <h2>{ticket.ticketNumber}</h2>
        <span className="order-number">{ticket.orderNumber}</span>
        {ticket.orderType === 'dine-in' && (
          <span className="table">Table {ticket.tableNumber}</span>
        )}
        {ticket.priority === 'high' && (
          <span className="badge-priority">HIGH</span>
        )}
      </div>
      
      <div className="ticket-items">
        {ticket.items.map((item, i) => (
          <div key={i} className="item">
            <span className="quantity">{item.quantity}x</span>
            <span className="name">{item.menuItemName}</span>
            {item.notes && (
              <span className="notes">📝 {item.notes}</span>
            )}
          </div>
        ))}
      </div>
      
      <div className="ticket-actions">
        {ticket.status === 'pending' && (
          <button onClick={handleAccept} disabled={loading}>
            ✅ Accept
          </button>
        )}
        
        {ticket.status === 'accepted' && (
          <button onClick={handleStart} disabled={loading}>
            🔥 Start Cooking
          </button>
        )}
        
        {ticket.status === 'in_progress' && (
          <button onClick={handleReady} disabled={loading}>
            ✓ Mark Ready
          </button>
        )}
        
        {ticket.status === 'ready' && (
          <div className="ready-indicator">
            ✓ READY FOR PICKUP
          </div>
        )}
      </div>
      
      <div className="ticket-footer">
        <span className="time">
          {formatTimeAgo(ticket.createdAt)}
        </span>
        {ticket.assignedTo && (
          <span className="assigned">👤 {ticket.assignedTo.name}</span>
        )}
      </div>
    </div>
  );
}
```

---

## Summary

**KDS in 5 Points:**

1. **Stations** = Physical work areas (GRILL, SALAD, FRY, etc.)
2. **Tickets** = Digital work orders sent to stations
3. **One order** → **Multiple tickets** (one per station)
4. **Status flow:** pending → accepted → in_progress → ready
5. **All tickets ready** → Order ready for pickup

**Key Benefits:**
- ✅ No lost paper tickets
- ✅ Real-time status tracking
- ✅ Clear prioritization
- ✅ Automatic notifications
- ✅ Performance analytics

**Your Next Steps:**
1. Run seeder: `node scripts/seed-roles-and-tasks.js`
2. Restart server
3. Test endpoints with Postman
4. Build frontend station displays
5. Implement WebSocket updates

---

**Questions? Check:**
- `PHASE-1-FRONTEND-INTEGRATION-GUIDE.md` - Technical API details
- `PHASE-1-API-ERRORS-RESOLVED.md` - Recent fixes
- `tests/kds-integration.test.js` - Working examples
