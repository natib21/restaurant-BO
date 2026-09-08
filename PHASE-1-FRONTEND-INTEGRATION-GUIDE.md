# Phase 1: KDS Integration - Frontend Integration Guide

> **Production-Ready Integration Guide for Kitchen Display System (KDS)**  
> Based on actual production code from Backend implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Authentication](#authentication)
4. [HTTP API Reference](#http-api-reference)
5. [WebSocket Real-Time Events](#websocket-real-time-events)
6. [Data Models](#data-models)
7. [Complete Integration Flows](#complete-integration-flows)
8. [Error Handling](#error-handling)
9. [Testing Guide](#testing-guide)
10. [TypeScript/JavaScript Examples](#typescriptjavascript-examples)

---

## Overview

### What is Phase 1 KDS?

The Kitchen Display System (KDS) Phase 1 provides:

- **Automatic ticket creation** when orders enter "preparing" status
- **Station-based ticket routing** (e.g., GRILL, SALAD, FRY)
- **Explicit RBAC-enforced workflow**: pending → accepted → in_progress → ready
- **Real-time WebSocket updates** for KDS dashboards
- **Automatic order ready rollup** when all tickets complete

### Key Design Decision: Option 1 (Explicit Accept)

Kitchen staff must **explicitly accept** tickets before starting work. This preserves real actor attribution in audit logs and matches the existing Order state machine RBAC pattern.

---

## Architecture

### System Components

```
┌─────────────┐
│   Order     │
│  (pending)  │
└──────┬──────┘
       │ Waiter accepts
       ↓
┌─────────────┐
│   Order     │
│ (accepted)  │
└──────┬──────┘
       │ Kitchen starts preparing
       ↓
┌─────────────┐     ┌──────────────────┐
│   Order     │────→│  Outbox Worker   │
│ (preparing) │     │  (background)    │
└─────────────┘     └────────┬─────────┘
                            │
                            ↓
                  ┌───────────────────┐
                  │  KitchenTickets   │
                  │  (one per station)│
                  └─────────┬─────────┘
                            │
       ┌────────────────────┼────────────────────┐
       ↓                    ↓                    ↓
┌─────────────┐      ┌─────────────┐     ┌─────────────┐
│ GRILL-42    │      │ SALAD-15    │     │  FRY-08     │
│ (pending)   │      │ (pending)   │     │ (pending)   │
└──────┬──────┘      └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       │ Kitchen staff accept (explicit button)
       ↓                    ↓                    ↓
┌─────────────┐      ┌─────────────┐     ┌─────────────┐
│ (accepted)  │      │ (accepted)  │     │ (accepted)  │
└──────┬──────┘      └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       │ Start working
       ↓                    ↓                    ↓
┌─────────────┐      ┌─────────────┐     ┌─────────────┐
│(in_progress)│      │(in_progress)│     │(in_progress)│
└──────┬──────┘      └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       │ Mark ready
       ↓                    ↓                    ↓
┌─────────────┐      ┌─────────────┐     ┌─────────────┐
│   (ready)   │      │   (ready)   │     │   (ready)   │
└──────┬──────┘      └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       └────────────────────┴────────────────────┘
                            │
                   All tickets ready?
                            ↓
                  ┌───────────────────┐
                  │  Outbox Worker    │
                  │  (ready rollup)   │
                  └─────────┬─────────┘
                            ↓
                  ┌───────────────────┐
                  │      Order        │
                  │     (ready)       │
                  └───────────────────┘
```

### Event Flow

1. **Order Creation** → Waiter creates order (status: `pending`)
2. **Order Acceptance** → Waiter accepts order (status: `accepted`)
3. **Order Preparation** → Kitchen starts (`accepted` → `preparing`)
   - Backend creates `OutboxEvent` with type `order:preparing`
   - Background worker processes event → creates KitchenTickets (one per station)
4. **Ticket Workflow** → Kitchen staff:
   - **Accept** ticket (explicit button) → `pending` → `accepted`
   - **Start** working → `accepted` → `in_progress`
   - **Mark Ready** → `in_progress` → `ready`
5. **Ready Rollup** → When ALL tickets for order are `ready`:
   - Backend creates `OutboxEvent` with type `kitchen:all_tickets_ready`
   - Background worker processes event → transitions Order to `ready`

---

## Authentication

### JWT Token Requirements

All API requests and WebSocket connections require a valid JWT token.

#### HTTP Headers

```http
Authorization: Bearer <JWT_TOKEN>
```

**OR** via Cookie:

```http
Cookie: jwt=<JWT_TOKEN>
```

#### WebSocket Authentication

**Method 1: Auth object (preferred)**

```javascript
const socket = io('https://api.example.com', {
  auth: {
    token: '<JWT_TOKEN>'
  }
});
```

**Method 2: Cookie**

```javascript
// JWT will be read from 'jwt' cookie automatically if present
const socket = io('https://api.example.com', {
  withCredentials: true
});
```

**Method 3: Authorization header**

```javascript
const socket = io('https://api.example.com', {
  extraHeaders: {
    Authorization: 'Bearer <JWT_TOKEN>'
  }
});
```

### User Context Requirements

- `req.user` must have populated `role` field
- `req.user.branch` must be set for branch-scoped queries

---

## HTTP API Reference

Base URL: `/api/v1/kitchen`

All endpoints require authentication (`protect` middleware).

### 1. Get Station Tickets

**Get active tickets for a KDS station dashboard**

```http
GET /api/v1/kitchen/stations/:stationId/tickets
```

**Access**: `kitchen`, `admin`, `superAdmin`

**Path Parameters**:
- `stationId` (string, required): Kitchen station ID

**Query Parameters**: None (uses `req.user.branch` for tenant isolation)

**Response** (200 OK):

```json
{
  "status": "success",
  "results": 2,
  "data": {
    "tickets": [
      {
        "_id": "65abc123def456...",
        "ticketNumber": "GRILL-42",
        "orderNumber": "ORD-2024-001",
        "orderType": "dine_in",
        "tableNumber": "T-05",
        "status": "pending",
        "priority": "normal",
        "items": [
          {
            "orderItemId": "65abc...",
            "menuItem": "65xyz...",
            "menuItemName": "Cheeseburger",
            "quantity": 2,
            "notes": "No onions",
            "status": "pending"
          }
        ],
        "station": {
          "_id": "65def...",
          "name": "Grill",
          "code": "GRILL",
          "color": "#FF5733"
        },
        "order": {
          "_id": "65order...",
          "orderNumber": "ORD-2024-001",
          "orderType": "dine_in",
          "tableNumber": "T-05"
        },
        "assignedTo": null,
        "acceptedAt": null,
        "startedAt": null,
        "completedAt": null,
        "createdAt": "2024-08-17T10:30:00.000Z",
        "updatedAt": "2024-08-17T10:30:00.000Z"
      }
    ]
  }
}
```

**Default Filter**: Active statuses only (`pending`, `accepted`, `in_progress`, `ready`)  
Sorted by: `priority` (descending), then `createdAt` (ascending)

---

### 2. Get Order Tickets

**Get all tickets for a specific order (order detail view)**

```http
GET /api/v1/kitchen/orders/:orderId/tickets
```

**Access**: `kitchen`, `waiter`, `admin`, `superAdmin`

**Path Parameters**:
- `orderId` (string, required): Order ID

**Response** (200 OK):

```json
{
  "status": "success",
  "results": 3,
  "data": {
    "tickets": [
      {
        "_id": "65abc...",
        "ticketNumber": "GRILL-42",
        "status": "ready",
        "station": {
          "_id": "65def...",
          "name": "Grill",
          "code": "GRILL"
        },
        "items": [...],
        "assignedTo": {
          "_id": "65user...",
          "name": "John Kitchen"
        },
        "acceptedAt": "2024-08-17T10:31:00.000Z",
        "startedAt": "2024-08-17T10:32:00.000Z",
        "completedAt": "2024-08-17T10:40:00.000Z"
      }
    ]
  }
}
```

**Use Case**: Show order detail page with ticket breakdown by station

---

### 3. Update Ticket Status (Generic)

**Generic status update endpoint with RBAC validation**

```http
PATCH /api/v1/kitchen/tickets/:ticketId/status
```

**Access**: `kitchen`, `admin`, `superAdmin`

**Path Parameters**:
- `ticketId` (string, required): Ticket ID

**Request Body**:

```json
{
  "status": "accepted",
  "reason": "Optional reason for cancellation" 
}
```

**Body Fields**:
- `status` (string, required): One of `accepted`, `in_progress`, `ready`, `canceled`
- `reason` (string, optional): Required only for `canceled` status

**Response** (200 OK):

```json
{
  "status": "success",
  "data": {
    "ticket": { /* Full ticket object */ },
    "previousStatus": "pending",
    "noop": false
  }
}
```

**Response Fields**:
- `ticket`: Updated ticket document
- `previousStatus`: Status before transition
- `noop`: `true` if status was already set (no change made)

**Validation**:
- Invalid transition → `400 Bad Request`
- Insufficient permissions → `403 Forbidden`
- Ticket not found → `404 Not Found`

---

### 4. Accept Ticket

**Explicit accept button (Option 1 pattern)**

```http
PATCH /api/v1/kitchen/tickets/:ticketId/accept
```

**Access**: `kitchen`, `admin`, `superAdmin`

**Path Parameters**:
- `ticketId` (string, required): Ticket ID

**Request Body**: None

**Response** (200 OK):

```json
{
  "status": "success",
  "data": {
    "ticket": { /* Full ticket object */ },
    "message": "Ticket accepted successfully"
  }
}
```

**Side Effects**:
- Sets `status` → `accepted`
- Sets `acceptedAt` → current timestamp
- Sets `assignedTo` → `req.user._id`

**Valid Transitions**:
- `pending` → `accepted` ✅
- Any other status → `400 Bad Request`

---

### 5. Start Ticket

**Start working on a ticket**

```http
PATCH /api/v1/kitchen/tickets/:ticketId/start
```

**Access**: `kitchen`, `admin`, `superAdmin`

**Path Parameters**:
- `ticketId` (string, required): Ticket ID

**Request Body**: None

**Response** (200 OK):

```json
{
  "status": "success",
  "data": {
    "ticket": { /* Full ticket object */ },
    "message": "Ticket started successfully"
  }
}
```

**Side Effects**:
- Sets `status` → `in_progress`
- Sets `startedAt` → current timestamp
- Sets `assignedTo` → `req.user._id` (if not already set)

**Valid Transitions**:
- `accepted` → `in_progress` ✅
- Any other status → `400 Bad Request`

---

### 6. Mark Ticket Ready

**Mark ticket as ready for pickup/serving**

```http
PATCH /api/v1/kitchen/tickets/:ticketId/ready
```

**Access**: `kitchen`, `admin`, `superAdmin`

**Path Parameters**:
- `ticketId` (string, required): Ticket ID

**Request Body**: None

**Response** (200 OK):

```json
{
  "status": "success",
  "data": {
    "ticket": { /* Full ticket object */ },
    "message": "Ticket marked as ready"
  }
}
```

**Side Effects**:
- Sets `status` → `ready`
- Sets `completedAt` → current timestamp
- **Triggers ready rollup check**: If ALL tickets for the order are `ready`, creates `kitchen:all_tickets_ready` outbox event
- Background worker will transition parent Order to `ready` status

**Valid Transitions**:
- `in_progress` → `ready` ✅
- Any other status → `400 Bad Request`

---

### 7. Cancel Ticket

**Cancel a ticket (waiter or kitchen can cancel)**

```http
PATCH /api/v1/kitchen/tickets/:ticketId/cancel
```

**Access**: `kitchen`, `waiter`, `admin`, `superAdmin`

**Path Parameters**:
- `ticketId` (string, required): Ticket ID

**Request Body**:

```json
{
  "reason": "Customer changed order"
}
```

**Body Fields**:
- `reason` (string, optional): Cancellation reason

**Response** (200 OK):

```json
{
  "status": "success",
  "data": {
    "ticket": { /* Full ticket object */ },
    "message": "Ticket canceled successfully"
  }
}
```

**Side Effects**:
- Sets `status` → `canceled`
- Sets `canceledAt` → current timestamp
- Sets `canceledBy` → `req.user._id`
- Sets `canceledReason` → provided reason or default

**Valid Transitions**:
- `pending` → `canceled` ✅
- `accepted` → `canceled` ✅
- `in_progress` → `canceled` ✅
- `ready` → `canceled` ✅
- `completed` → `canceled` ❌ (400 Bad Request)

---

## WebSocket Real-Time Events

### Connection Setup

```javascript
import io from 'socket.io-client';

const socket = io('https://api.example.com', {
  auth: {
    token: localStorage.getItem('jwt')
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

// Handle connection events
socket.on('connect', () => {
  console.log('Connected to KDS WebSocket:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server forced disconnect, manual reconnect needed
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
  // Handle authentication errors (invalid/expired token)
});
```

### Subscribe to KDS Station Updates

**Event**: `kds:subscribe`

**Purpose**: Subscribe to real-time ticket updates for a specific kitchen station

```javascript
// Subscribe to station (e.g., Grill station)
socket.emit('kds:subscribe', {
  branchId: '65abc123def456...',
  stationId: '65def456abc789...'
});

// Room joined: "branch:{branchId}:station:{stationId}"
```

**Server-side validation**:
- Checks if `req.user.branch` matches provided `branchId`
- Denies access if branch mismatch (security)

**Effect**: Client joins Socket.IO room `branch:{branchId}:station:{stationId}`

---

### Receiving Ticket Events

#### Event: `ticket:created`

**When**: New ticket created (order entered "preparing" status)

```javascript
socket.on('ticket:created', (ticket) => {
  console.log('New ticket:', ticket.ticketNumber);
  
  // Add to KDS dashboard
  addTicketToBoard(ticket);
  
  // Play notification sound
  playNotificationSound();
});
```

**Payload**: Full `KitchenTicket` object (see Data Models section)

**Emitted to**:
- `branch:{branchId}:station:{stationId}` (station-specific)
- `branch:{branchId}` (branch-wide)

---

#### Event: `ticket:updated`

**When**: Ticket status changed (accepted, started, ready, canceled)

```javascript
socket.on('ticket:updated', (ticket) => {
  console.log('Ticket updated:', ticket.ticketNumber, '→', ticket.status);
  
  // Update ticket in UI
  updateTicketInBoard(ticket._id, ticket);
  
  // Show visual feedback
  if (ticket.status === 'ready') {
    showReadyAnimation(ticket._id);
  }
});
```

**Payload**: Full updated `KitchenTicket` object

**Emitted to**:
- `branch:{branchId}:station:{stationId}`
- `branch:{branchId}`

---

### Complete WebSocket Setup Example

```javascript
class KDSWebSocketService {
  constructor(apiUrl, jwtToken) {
    this.socket = io(apiUrl, {
      auth: { token: jwtToken },
      transports: ['websocket', 'polling'],
      reconnection: true
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('KDS WebSocket connected');
    });
    
    this.socket.on('ticket:created', (ticket) => {
      this.onTicketCreated(ticket);
    });
    
    this.socket.on('ticket:updated', (ticket) => {
      this.onTicketUpdated(ticket);
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('WebSocket error:', error.message);
    });
  }
  
  subscribeToStation(branchId, stationId) {
    this.socket.emit('kds:subscribe', { branchId, stationId });
  }
  
  onTicketCreated(ticket) {
    // Override in component
  }
  
  onTicketUpdated(ticket) {
    // Override in component
  }
  
  disconnect() {
    this.socket.disconnect();
  }
}

// Usage
const kdsService = new KDSWebSocketService(
  'https://api.example.com',
  localStorage.getItem('jwt')
);

kdsService.onTicketCreated = (ticket) => {
  // Handle in React/Vue component
  dispatch({ type: 'ADD_TICKET', payload: ticket });
};

kdsService.onTicketUpdated = (ticket) => {
  dispatch({ type: 'UPDATE_TICKET', payload: ticket });
};

kdsService.subscribeToStation(branchId, stationId);
```

---

## Data Models

### KitchenStation

```typescript
interface KitchenStation {
  _id: string;
  merchant: string; // Merchant ID
  branch: string;   // Branch ID
  name: string;     // Display name (e.g., "Grill")
  code: string;     // Unique code (e.g., "GRILL")
  description?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}
```

**Indexes**:
- `{ branch: 1, code: 1 }` (unique)
- `{ branch: 1, isActive: 1, displayOrder: 1 }`

**Example**:

```json
{
  "_id": "65abc123def456...",
  "merchant": "65merchant...",
  "branch": "65branch...",
  "name": "Grill Station",
  "code": "GRILL",
  "description": "Hot food preparation",
  "isActive": true,
  "displayOrder": 1,
  "createdAt": "2024-08-17T08:00:00.000Z",
  "updatedAt": "2024-08-17T08:00:00.000Z"
}
```

---

### KitchenTicket

```typescript
interface KitchenTicketItem {
  _id: string;
  orderItemId: string;  // References Order.items[i]._id
  menuItem: string;     // Menu item ID
  menuItemName: string; // Denormalized for display
  quantity: number;
  notes?: string;       // Special instructions
  status: 'pending' | 'in_progress' | 'ready';
  startedAt?: string;
  completedAt?: string;
}

interface KitchenTicket {
  _id: string;
  merchant: string;
  branch: string;
  order: string; // Order ID
  station: string | KitchenStation; // Populated in responses
  ticketNumber: string;    // Format: "GRILL-42"
  orderNumber: string;     // Order number for display
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  tableNumber?: string;    // For dine-in orders
  items: KitchenTicketItem[];
  status: 'pending' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'canceled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTo?: string;     // User ID, set on accept
  acceptedAt?: string;     // ISO timestamp
  startedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  canceledBy?: string;     // User ID
  canceledReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Status Flow**:

```
pending → accepted → in_progress → ready → [completed]
   ↓          ↓           ↓           ↓
   └──────────┴───────────┴───────────┴──→ canceled
```

**Indexes**:
- `{ station: 1, status: 1, createdAt: 1 }`
- `{ order: 1 }`
- `{ station: 1, status: 1, priority: -1, createdAt: 1 }`

**Example**:

```json
{
  "_id": "65ticket123...",
  "merchant": "65merchant...",
  "branch": "65branch...",
  "order": "65order...",
  "station": {
    "_id": "65station...",
    "name": "Grill",
    "code": "GRILL",
    "color": "#FF5733"
  },
  "ticketNumber": "GRILL-42",
  "orderNumber": "ORD-2024-001",
  "orderType": "dine_in",
  "tableNumber": "T-05",
  "items": [
    {
      "_id": "65item1...",
      "orderItemId": "65orderitem...",
      "menuItem": "65menu...",
      "menuItemName": "Cheeseburger",
      "quantity": 2,
      "notes": "No onions, extra cheese",
      "status": "pending"
    }
  ],
  "status": "pending",
  "priority": "normal",
  "assignedTo": null,
  "acceptedAt": null,
  "startedAt": null,
  "completedAt": null,
  "createdAt": "2024-08-17T10:30:00.000Z",
  "updatedAt": "2024-08-17T10:30:00.000Z"
}
```

---

### Order (Relevant Fields)

```typescript
interface Order {
  _id: string;
  merchant: string;
  branch: string;
  orderNumber: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'served' | 
          'out_for_delivery' | 'delivered' | 'completed' | 'canceled';
  items: OrderItem[];
  tableNumber?: string;
  customerName?: string;
  acceptedAt?: string;
  readyAt?: string;
  servedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderItem {
  _id: string;           // ⚠️ CRITICAL: Must have _id: true in schema
  menuItem: string;      // Menu ID
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
}
```

**Critical Note**: `Order.items` subdocuments MUST have `_id: true` in schema for KDS to work. KitchenTicket references `orderItemId` to track which order item is on which ticket.

---

## Complete Integration Flows

### Flow 1: KDS Dashboard (Station View)

**Goal**: Display real-time tickets for a specific kitchen station

#### Step 1: Initial Load

```javascript
// Fetch initial ticket list
async function loadStationTickets(stationId) {
  const response = await fetch(
    `/api/v1/kitchen/stations/${stationId}/tickets`,
    {
      headers: {
        'Authorization': `Bearer ${getJwtToken()}`
      }
    }
  );
  
  const { data } = await response.json();
  return data.tickets; // Array of KitchenTicket
}

// Example usage
const tickets = await loadStationTickets('65station...');
renderTicketBoard(tickets);
```

#### Step 2: Subscribe to Real-Time Updates

```javascript
// Connect WebSocket
const socket = io(API_URL, {
  auth: { token: getJwtToken() }
});

// Subscribe to station
socket.emit('kds:subscribe', {
  branchId: currentBranchId,
  stationId: currentStationId
});

// Listen for new tickets
socket.on('ticket:created', (ticket) => {
  if (ticket.station._id === currentStationId) {
    addTicketToBoard(ticket);
    playSound('new-ticket');
  }
});

// Listen for ticket updates
socket.on('ticket:updated', (ticket) => {
  if (ticket.station._id === currentStationId) {
    updateTicketInBoard(ticket._id, ticket);
    
    if (ticket.status === 'ready') {
      moveTicketToReadyColumn(ticket._id);
    }
  }
});
```

#### Step 3: User Actions (Accept, Start, Ready)

```javascript
// Accept ticket (explicit button)
async function acceptTicket(ticketId) {
  const response = await fetch(
    `/api/v1/kitchen/tickets/${ticketId}/accept`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${getJwtToken()}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const { data } = await response.json();
  return data.ticket;
}

// Start working on ticket
async function startTicket(ticketId) {
  const response = await fetch(
    `/api/v1/kitchen/tickets/${ticketId}/start`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${getJwtToken()}`
      }
    }
  );
  
  const { data } = await response.json();
  return data.ticket;
}

// Mark ticket ready
async function markTicketReady(ticketId) {
  const response = await fetch(
    `/api/v1/kitchen/tickets/${ticketId}/ready`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${getJwtToken()}`
      }
    }
  );
  
  const { data } = await response.json();
  return data.ticket;
}

// Complete workflow
async function processTicket(ticketId) {
  try {
    // Step 1: Accept
    const acceptedTicket = await acceptTicket(ticketId);
    console.log('Ticket accepted:', acceptedTicket.ticketNumber);
    
    // Step 2: Start
    const startedTicket = await startTicket(ticketId);
    console.log('Ticket started:', startedTicket.startedAt);
    
    // ... Kitchen staff prepares food ...
    
    // Step 3: Mark ready
    const readyTicket = await markTicketReady(ticketId);
    console.log('Ticket ready:', readyTicket.completedAt);
    
  } catch (error) {
    console.error('Error processing ticket:', error.message);
    showErrorToast(error.message);
  }
}
```

---

### Flow 2: Order Detail View (Order Management)

**Goal**: Show all tickets for a specific order

```javascript
async function loadOrderTickets(orderId) {
  const response = await fetch(
    `/api/v1/kitchen/orders/${orderId}/tickets`,
    {
      headers: {
        'Authorization': `Bearer ${getJwtToken()}`
      }
    }
  );
  
  const { data } = await response.json();
  return data.tickets;
}

// Example usage
const orderTickets = await loadOrderTickets('65order...');

// Group by station for display
const ticketsByStation = orderTickets.reduce((acc, ticket) => {
  const stationName = ticket.station.name;
  if (!acc[stationName]) acc[stationName] = [];
  acc[stationName].push(ticket);
  return acc;
}, {});

// Render
Object.entries(ticketsByStation).forEach(([stationName, tickets]) => {
  renderStationSection(stationName, tickets);
});

// Check if all tickets ready
const allReady = orderTickets.every(t => t.status === 'ready' || t.status === 'canceled');
if (allReady) {
  showOrderReadyBadge();
}
```

---

### Flow 3: Cancel Ticket

**Goal**: Cancel a ticket (e.g., order changed, mistake)

```javascript
async function cancelTicket(ticketId, reason) {
  const response = await fetch(
    `/api/v1/kitchen/tickets/${ticketId}/cancel`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${getJwtToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const { data } = await response.json();
  return data.ticket;
}

// Example usage
try {
  const canceledTicket = await cancelTicket(
    '65ticket...',
    'Customer changed order'
  );
  
  console.log('Ticket canceled:', canceledTicket.canceledReason);
  removeTicketFromBoard(canceledTicket._id);
  
} catch (error) {
  console.error('Failed to cancel ticket:', error.message);
}
```

---

## Error Handling

### HTTP Error Responses

#### 400 Bad Request

**Invalid Transition**:

```json
{
  "status": "fail",
  "message": "Cannot transition from in_progress to accepted"
}
```

**Missing Fields**:

```json
{
  "status": "fail",
  "message": "Status is required"
}
```

**Invalid Status**:

```json
{
  "status": "fail",
  "message": "Invalid status. Must be one of: accepted, in_progress, ready, canceled"
}
```

#### 401 Unauthorized

```json
{
  "status": "fail",
  "message": "You are not logged in. Please log in to get access"
}
```

#### 403 Forbidden

**Insufficient Permissions**:

```json
{
  "status": "fail",
  "message": "Insufficient permissions. Role 'waiter' cannot perform pending->accepted"
}
```

**Unrecognized Role** (fail-closed security):

```json
{
  "status": "fail",
  "message": "User role not recognized or not populated. Role name: 'undefined', Role._id: undefined"
}
```

#### 404 Not Found

```json
{
  "status": "fail",
  "message": "Kitchen ticket not found"
}
```

### Frontend Error Handling Pattern

```javascript
async function updateTicketStatus(ticketId, status) {
  try {
    const response = await fetch(
      `/api/v1/kitchen/tickets/${ticketId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${getJwtToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      }
    );
    
    // Parse response
    const data = await response.json();
    
    // Handle error responses
    if (!response.ok) {
      if (response.status === 400) {
        // Invalid transition - show user-friendly message
        showErrorToast('Invalid action for current ticket status');
      } else if (response.status === 403) {
        // Permission denied
        showErrorToast('You do not have permission to perform this action');
      } else if (response.status === 404) {
        // Ticket not found
        showErrorToast('Ticket not found');
        removeTicketFromUI(ticketId);
      } else {
        // Generic error
        showErrorToast('Failed to update ticket');
      }
      
      throw new Error(data.message);
    }
    
    // Success
    return data.data.ticket;
    
  } catch (networkError) {
    // Network failure
    console.error('Network error:', networkError);
    showErrorToast('Network error. Please check your connection.');
    throw networkError;
  }
}
```

### WebSocket Error Handling

```javascript
socket.on('connect_error', (error) => {
  console.error('WebSocket connection error:', error.message);
  
  if (error.message === 'Authentication required') {
    // JWT missing
    redirectToLogin();
  } else if (error.message === 'Invalid or expired token') {
    // JWT expired - refresh token
    refreshAuthToken().then(() => {
      socket.auth.token = getNewJwtToken();
      socket.connect();
    });
  } else {
    // Network error
    showConnectionLostBanner();
  }
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server kicked us out (e.g., authentication issue)
    showErrorToast('Connection lost. Please refresh the page.');
  } else if (reason === 'transport close') {
    // Network issue - socket.io will auto-reconnect
    showReconnectingBanner();
  }
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  hideReconnectingBanner();
  
  // Re-subscribe to station
  socket.emit('kds:subscribe', {
    branchId: currentBranchId,
    stationId: currentStationId
  });
});
```

---

## Testing Guide

### Manual Testing Checklist

#### 1. Station Dashboard

- [ ] Load station tickets successfully
- [ ] See only tickets for current station
- [ ] Tickets sorted by priority, then creation time
- [ ] Accept button visible only for `pending` tickets
- [ ] Start button visible only for `accepted` tickets
- [ ] Ready button visible only for `in_progress` tickets
- [ ] Cancel button visible for all non-terminal statuses

#### 2. Real-Time Updates

- [ ] New tickets appear instantly when order enters "preparing"
- [ ] Ticket updates from other users appear instantly
- [ ] Multiple tabs stay in sync
- [ ] WebSocket reconnects after network loss
- [ ] No duplicate tickets after reconnect

#### 3. RBAC Enforcement

- [ ] Kitchen role can accept, start, ready, cancel tickets
- [ ] Waiter role can cancel tickets (but not accept/start/ready)
- [ ] Admin role can perform all actions
- [ ] Invalid role returns 403 Forbidden
- [ ] Unpopulated role returns 403 (fail-closed)

#### 4. Order Ready Rollup

- [ ] Mark all tickets for an order as `ready`
- [ ] Verify order transitions to `ready` status
- [ ] Check order detail page shows all tickets ready

#### 5. Error Handling

- [ ] Invalid transition shows clear error message
- [ ] Permission denied shows 403 error
- [ ] Expired JWT redirects to login
- [ ] Network errors show retry option

### Automated Testing (Example)

```javascript
describe('KDS HTTP API', () => {
  let authToken, stationId, orderId;
  
  beforeAll(async () => {
    // Login and get JWT
    const loginResponse = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'kitchen@test.com',
        password: 'Test1234!'
      })
    });
    const { token } = await loginResponse.json();
    authToken = token;
    
    // Setup test data (station, order)
    // ...
  });
  
  test('GET /stations/:stationId/tickets returns active tickets', async () => {
    const response = await fetch(
      `/api/v1/kitchen/stations/${stationId}/tickets`,
      {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }
    );
    
    expect(response.status).toBe(200);
    
    const { data } = await response.json();
    expect(data.tickets).toBeInstanceOf(Array);
    expect(data.tickets[0]).toHaveProperty('ticketNumber');
    expect(data.tickets[0]).toHaveProperty('status');
  });
  
  test('PATCH /tickets/:ticketId/accept transitions to accepted', async () => {
    // Get a pending ticket
    const ticketsResponse = await fetch(
      `/api/v1/kitchen/stations/${stationId}/tickets`,
      { headers: { 'Authorization': `Bearer ${authToken}` } }
    );
    const { data } = await ticketsResponse.json();
    const pendingTicket = data.tickets.find(t => t.status === 'pending');
    
    // Accept it
    const response = await fetch(
      `/api/v1/kitchen/tickets/${pendingTicket._id}/accept`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${authToken}` }
      }
    );
    
    expect(response.status).toBe(200);
    
    const result = await response.json();
    expect(result.data.ticket.status).toBe('accepted');
    expect(result.data.ticket.acceptedAt).toBeDefined();
    expect(result.data.ticket.assignedTo).toBeDefined();
  });
  
  test('Invalid transition returns 400 error', async () => {
    // Try to transition accepted -> pending (invalid)
    const response = await fetch(
      `/api/v1/kitchen/tickets/${ticketId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'pending' })
      }
    );
    
    expect(response.status).toBe(400);
    
    const error = await response.json();
    expect(error.message).toContain('transition');
  });
});
```

---

## TypeScript/JavaScript Examples

### React Component Example

```typescript
// KDSDashboard.tsx
import React, { useState, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';

interface KitchenTicket {
  _id: string;
  ticketNumber: string;
  orderNumber: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'ready' | 'canceled';
  items: Array<{
    menuItemName: string;
    quantity: number;
    notes?: string;
  }>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
}

interface KDSDashboardProps {
  stationId: string;
  branchId: string;
  authToken: string;
}

export const KDSDashboard: React.FC<KDSDashboardProps> = ({
  stationId,
  branchId,
  authToken
}) => {
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Initial load
  useEffect(() => {
    loadTickets();
  }, [stationId]);
  
  // WebSocket setup
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL!, {
      auth: { token: authToken },
      transports: ['websocket']
    });
    
    newSocket.on('connect', () => {
      console.log('Connected to KDS WebSocket');
      newSocket.emit('kds:subscribe', { branchId, stationId });
    });
    
    newSocket.on('ticket:created', (ticket: KitchenTicket) => {
      setTickets(prev => [...prev, ticket]);
    });
    
    newSocket.on('ticket:updated', (ticket: KitchenTicket) => {
      setTickets(prev =>
        prev.map(t => t._id === ticket._id ? ticket : t)
      );
    });
    
    newSocket.on('connect_error', (err) => {
      console.error('WebSocket error:', err.message);
      setError('Connection error');
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, [stationId, branchId, authToken]);
  
  async function loadTickets() {
    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/v1/kitchen/stations/${stationId}/tickets`,
        {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }
      );
      
      if (!response.ok) throw new Error('Failed to load tickets');
      
      const { data } = await response.json();
      setTickets(data.tickets);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  
  async function acceptTicket(ticketId: string) {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/v1/kitchen/tickets/${ticketId}/accept`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${authToken}` }
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      
      // WebSocket will update the ticket automatically
    } catch (err) {
      alert((err as Error).message);
    }
  }
  
  async function startTicket(ticketId: string) {
    try {
      await fetch(
        `${process.env.REACT_APP_API_URL}/api/v1/kitchen/tickets/${ticketId}/start`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${authToken}` }
        }
      );
    } catch (err) {
      alert((err as Error).message);
    }
  }
  
  async function markReady(ticketId: string) {
    try {
      await fetch(
        `${process.env.REACT_APP_API_URL}/api/v1/kitchen/tickets/${ticketId}/ready`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${authToken}` }
        }
      );
    } catch (err) {
      alert((err as Error).message);
    }
  }
  
  if (loading) return <div>Loading tickets...</div>;
  if (error) return <div>Error: {error}</div>;
  
  // Group by status
  const pendingTickets = tickets.filter(t => t.status === 'pending');
  const acceptedTickets = tickets.filter(t => t.status === 'accepted');
  const inProgressTickets = tickets.filter(t => t.status === 'in_progress');
  const readyTickets = tickets.filter(t => t.status === 'ready');
  
  return (
    <div className="kds-dashboard">
      <h1>Kitchen Display System</h1>
      
      <div className="kds-columns">
        {/* Pending Column */}
        <div className="kds-column">
          <h2>Pending ({pendingTickets.length})</h2>
          {pendingTickets.map(ticket => (
            <TicketCard
              key={ticket._id}
              ticket={ticket}
              actions={[
                <button onClick={() => acceptTicket(ticket._id)}>
                  Accept
                </button>
              ]}
            />
          ))}
        </div>
        
        {/* Accepted Column */}
        <div className="kds-column">
          <h2>Accepted ({acceptedTickets.length})</h2>
          {acceptedTickets.map(ticket => (
            <TicketCard
              key={ticket._id}
              ticket={ticket}
              actions={[
                <button onClick={() => startTicket(ticket._id)}>
                  Start
                </button>
              ]}
            />
          ))}
        </div>
        
        {/* In Progress Column */}
        <div className="kds-column">
          <h2>In Progress ({inProgressTickets.length})</h2>
          {inProgressTickets.map(ticket => (
            <TicketCard
              key={ticket._id}
              ticket={ticket}
              actions={[
                <button onClick={() => markReady(ticket._id)}>
                  Mark Ready
                </button>
              ]}
            />
          ))}
        </div>
        
        {/* Ready Column */}
        <div className="kds-column kds-column-ready">
          <h2>Ready ({readyTickets.length})</h2>
          {readyTickets.map(ticket => (
            <TicketCard key={ticket._id} ticket={ticket} />
          ))}
        </div>
      </div>
    </div>
  );
};

// Ticket Card Component
const TicketCard: React.FC<{
  ticket: KitchenTicket;
  actions?: React.ReactNode[];
}> = ({ ticket, actions }) => {
  return (
    <div className={`ticket-card priority-${ticket.priority}`}>
      <div className="ticket-header">
        <h3>{ticket.ticketNumber}</h3>
        <span className="order-number">{ticket.orderNumber}</span>
      </div>
      
      <div className="ticket-items">
        {ticket.items.map((item, idx) => (
          <div key={idx} className="ticket-item">
            <span className="quantity">{item.quantity}x</span>
            <span className="item-name">{item.menuItemName}</span>
            {item.notes && <p className="item-notes">{item.notes}</p>}
          </div>
        ))}
      </div>
      
      <div className="ticket-actions">
        {actions}
      </div>
      
      <div className="ticket-footer">
        <span className="ticket-time">
          {new Date(ticket.createdAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};
```

### Vue.js Component Example

```vue
<!-- KDSDashboard.vue -->
<template>
  <div class="kds-dashboard">
    <h1>Kitchen Display System</h1>
    
    <div v-if="loading">Loading tickets...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="kds-columns">
      <!-- Pending -->
      <div class="kds-column">
        <h2>Pending ({{ pendingTickets.length }})</h2>
        <ticket-card
          v-for="ticket in pendingTickets"
          :key="ticket._id"
          :ticket="ticket"
          @accept="acceptTicket"
        />
      </div>
      
      <!-- Accepted -->
      <div class="kds-column">
        <h2>Accepted ({{ acceptedTickets.length }})</h2>
        <ticket-card
          v-for="ticket in acceptedTickets"
          :key="ticket._id"
          :ticket="ticket"
          @start="startTicket"
        />
      </div>
      
      <!-- In Progress -->
      <div class="kds-column">
        <h2>In Progress ({{ inProgressTickets.length }})</h2>
        <ticket-card
          v-for="ticket in inProgressTickets"
          :key="ticket._id"
          :ticket="ticket"
          @ready="markReady"
        />
      </div>
      
      <!-- Ready -->
      <div class="kds-column">
        <h2>Ready ({{ readyTickets.length }})</h2>
        <ticket-card
          v-for="ticket in readyTickets"
          :key="ticket._id"
          :ticket="ticket"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import io, { Socket } from 'socket.io-client';
import TicketCard from './TicketCard.vue';

interface KitchenTicket {
  _id: string;
  ticketNumber: string;
  status: string;
  // ... other fields
}

const props = defineProps<{
  stationId: string;
  branchId: string;
  authToken: string;
}>();

const tickets = ref<KitchenTicket[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
let socket: Socket | null = null;

// Computed
const pendingTickets = computed(() =>
  tickets.value.filter(t => t.status === 'pending')
);
const acceptedTickets = computed(() =>
  tickets.value.filter(t => t.status === 'accepted')
);
const inProgressTickets = computed(() =>
  tickets.value.filter(t => t.status === 'in_progress')
);
const readyTickets = computed(() =>
  tickets.value.filter(t => t.status === 'ready')
);

// Methods
async function loadTickets() {
  try {
    loading.value = true;
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/api/v1/kitchen/stations/${props.stationId}/tickets`,
      {
        headers: { 'Authorization': `Bearer ${props.authToken}` }
      }
    );
    
    if (!response.ok) throw new Error('Failed to load tickets');
    
    const { data } = await response.json();
    tickets.value = data.tickets;
    error.value = null;
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function setupWebSocket() {
  socket = io(import.meta.env.VITE_API_URL, {
    auth: { token: props.authToken }
  });
  
  socket.on('connect', () => {
    socket?.emit('kds:subscribe', {
      branchId: props.branchId,
      stationId: props.stationId
    });
  });
  
  socket.on('ticket:created', (ticket: KitchenTicket) => {
    tickets.value.push(ticket);
  });
  
  socket.on('ticket:updated', (ticket: KitchenTicket) => {
    const index = tickets.value.findIndex(t => t._id === ticket._id);
    if (index !== -1) {
      tickets.value[index] = ticket;
    }
  });
}

async function acceptTicket(ticketId: string) {
  try {
    await fetch(
      `${import.meta.env.VITE_API_URL}/api/v1/kitchen/tickets/${ticketId}/accept`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${props.authToken}` }
      }
    );
  } catch (err) {
    alert((err as Error).message);
  }
}

async function startTicket(ticketId: string) {
  try {
    await fetch(
      `${import.meta.env.VITE_API_URL}/api/v1/kitchen/tickets/${ticketId}/start`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${props.authToken}` }
      }
    );
  } catch (err) {
    alert((err as Error).message);
  }
}

async function markReady(ticketId: string) {
  try {
    await fetch(
      `${import.meta.env.VITE_API_URL}/api/v1/kitchen/tickets/${ticketId}/ready`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${props.authToken}` }
      }
    );
  } catch (err) {
    alert((err as Error).message);
  }
}

// Lifecycle
onMounted(() => {
  loadTickets();
  setupWebSocket();
});

onUnmounted(() => {
  socket?.disconnect();
});
</script>
```

---

## Additional Notes

### RBAC Role Mapping

The backend uses **substring matching** to map role names to categories:

```javascript
// Role.name (uppercase) → roleCategory
'KITCHEN-STAFF'        → 'kitchen'
'KITCHEN-MANAGER'      → 'kitchen'
'WAITER-STAFF'         → 'waiter'
'HEAD-WAITER'          → 'waiter'
'SUPER-ADMIN'          → 'superAdmin'
'MERCHANT-ADMIN'       → 'admin'
'SUPER-MERCHANT-ADMIN' → 'admin'
```

**Matching logic** (from `KitchenTicketService._extractRoleCategory`):

1. Check `isSystemRole` or `name === 'SUPER-ADMIN'` → `'superAdmin'`
2. Check `name.includes('KITCHEN')` → `'kitchen'`
3. Check `name.includes('WAITER')` → `'waiter'`
4. Check `name.includes('ADMIN')` → `'admin'`
5. **Fail closed**: Unrecognized role → `403 Forbidden`

### Critical Backend Requirements

1. **Order.items must have _id**: Schema option `{ _id: true }` is **required** for KitchenTicket to reference order items
2. **Role population**: Always populate `user.role` before calling `transitionTicketStatus()` or permission checks will fail
3. **Branch context**: `req.user.branch` must be set for tenant isolation

### Performance Considerations

- **WebSocket scaling**: Use Redis adapter for multi-server deployments
- **Ticket queries**: Indexes on `{ station: 1, status: 1, createdAt: 1 }` ensure fast queries
- **Outbox processing**: Background worker processes events asynchronously (no blocking)

---

## Summary

This guide provides everything needed to integrate with the Phase 1 KDS backend:

✅ **HTTP API**: All 7 endpoints with request/response formats  
✅ **WebSocket Events**: Real-time subscription and event handling  
✅ **Data Models**: Complete TypeScript interfaces  
✅ **Integration Flows**: Station dashboard, order detail, cancellation  
✅ **Error Handling**: All error codes and user-friendly patterns  
✅ **Testing**: Manual checklist and automated test examples  
✅ **Code Examples**: React and Vue.js implementations  

The backend is **production-ready** with:
- ✅ RBAC enforcement (fail-closed)
- ✅ Transactional consistency (Mongoose sessions)
- ✅ Real-time WebSocket updates
- ✅ Audit trail (automatic via auditPlugin)
- ✅ Tenant isolation (branch-scoped)
- ✅ Full test coverage (passing integration test)

**Next Steps**:
1. Implement frontend KDS dashboard using this guide
2. Test with real kitchen staff workflow
3. Monitor performance and optimize queries
4. Proceed to Phase 2 (Global Audit Logging API)
