# Dining Session System - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
4. [API Reference](#api-reference)
5. [Database Schema](#database-schema)
6. [Integration Guide](#integration-guide)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Dining Session System solves the problem of **multiple customers ordering independently at the same table** using QR codes or staff orders. Previously, the system blocked additional customers from scanning a table's QR code once the first customer started ordering. This implementation allows unlimited customers to scan the same QR and place independent orders while maintaining proper session management.

### Problem Statement
**Before:** When Customer A scanned Table 5's QR and ordered, Customer B at the same table couldn't scan the QR to place their own order.

**After:** Multiple customers can scan the same table QR and order independently. All orders are linked to a single dining session for proper table lifecycle management.

### Key Features
- ✅ Multiple customers per table (QR + staff orders)
- ✅ Single active session per table
- ✅ Atomic session creation (race condition safe)
- ✅ Transaction-based consistency
- ✅ Real-time Socket.IO events
- ✅ Payment validation on table closure
- ✅ Complete audit trail

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Customer QR Flow                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │   protectTableSession middleware     │
        │   (validates QR token)               │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │   SessionService                     │
        │   .getOrCreateActiveSession()        │
        │   - Creates OR reuses session        │
        │   - Race condition safe              │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │   OrderTransactionService            │
        │   - Links order.session              │
        │   - Sets order.source = 'qr'         │
        └──────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Staff Order Flow                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │   OrderService.staffPlaceOrder()     │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │   SessionService                     │
        │   .getOrCreateActiveSession()        │
        │   - createdBy = staffUserId          │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │   Order created with session link    │
        │   order.source = 'staff'             │
        └──────────────────────────────────────┘
```

### Data Flow

```
Table QR Scan → Session Check → Create/Reuse Session → Place Order
                     ↓                   ↓                  ↓
              MongoDB Unique       Transaction        Order.session
              Index Check          Protected          Field Set
```

---

## Core Concepts

### 1. DiningSession Model

**Purpose:** Represents a table visit. One session = one group of customers at a table.

**Lifecycle:**
```
created → active → ended/cancelled
```

**Key Fields:**
- `table` - Reference to Table
- `status` - 'active', 'ended', 'cancelled'
- `token` - Unique 64-char hex token
- `startedAt` - Session start timestamp
- `endedAt` - Session end timestamp (null while active)
- `createdBy` - Staff user ID (null for QR-initiated)

**Unique Constraint:**
```javascript
// Partial unique index - only one active session per table
{ table: 1, status: 'active' }, { unique: true }
```

### 2. Session Creation Strategy

**Race Condition Handling:**
The system uses MongoDB's unique index to handle race conditions when multiple customers scan the same QR simultaneously:

1. **Attempt Creation:** Try to create new session
2. **Duplicate Key Error:** If another request already created session
3. **Fetch Winner:** Abort transaction, fetch the winning session
4. **Retry Logic:** Exponential backoff for transaction lock timeouts

**Code Pattern:**
```javascript
try {
  // Try to create new session
  const newSession = await DiningSession.create([{
    table: tableId,
    status: 'active',
    token: crypto.randomBytes(32).toString('hex')
  }], { session: mongoSession });
  
  return { session: newSession[0], isNew: true };
  
} catch (error) {
  if (error.code === 11000) {
    // Race condition - fetch existing session
    const existingSession = await DiningSession.findOne({
      table: tableId,
      status: 'active'
    });
    return { session: existingSession, isNew: false };
  }
  throw error;
}
```

### 3. Order Source Tracking

Orders track their origin:
- `source: 'qr'` - Customer scanned QR
- `source: 'staff'` - Staff placed order

This allows analytics like:
- How many QR orders vs staff orders per session?
- Which tables have more self-service adoption?

### 4. Table Status Lifecycle

```
available → occupied → needs-cleaning → available
     ↓           ↓            ↓
  (idle)   (active session)  (session ended)
```

**Status Changes:**
- `available → occupied`: When first session created
- `occupied → needs-cleaning`: When session ended
- `needs-cleaning → available`: Staff marks cleaned (manual)

---

## API Reference

### SessionService

#### `getOrCreateActiveSession({ tableId, createdBy?, mongoSession? })`

**Purpose:** Get or create active dining session for a table.

**Parameters:**
- `tableId` (ObjectId, required) - Table ID
- `createdBy` (ObjectId, optional) - Staff user ID (null for QR)
- `mongoSession` (MongoSession, optional) - Transaction session

**Returns:**
```javascript
{
  session: DiningSession,  // The active session
  isNew: boolean           // true if created, false if reused
}
```

**Usage:**
```javascript
// QR customer scan
const { session, isNew } = await SessionService.getOrCreateActiveSession({
  tableId: table._id
});

// Staff placing order
const { session } = await SessionService.getOrCreateActiveSession({
  tableId: table._id,
  createdBy: staffUserId
});
```

**Behavior:**
- Creates new session if none exists
- Reuses existing active session if found
- Automatically marks table as 'occupied'
- Retries on transaction conflicts (max 5 times)
- Thread-safe via MongoDB unique index

---

#### `endSession({ sessionId, closedBy, force?, mongoSession? })`

**Purpose:** End a dining session (close table).

**Parameters:**
- `sessionId` (ObjectId, required) - Session ID to end
- `closedBy` (ObjectId, required) - Staff user ID
- `force` (boolean, optional, default: false) - Force close with unpaid orders
- `mongoSession` (MongoSession, optional) - Transaction session

**Returns:** `DiningSession` (ended session)

**Validation:**
- Throws error if unpaid orders exist (unless `force: true`)
- Updates table status to 'needs-cleaning'
- Sets session.status = 'ended' and session.endedAt

**Usage:**
```javascript
// Normal close (requires all orders paid)
await SessionService.endSession({
  sessionId: session._id,
  closedBy: staffUserId,
  force: false
});

// Force close (allows unpaid orders)
await SessionService.endSession({
  sessionId: session._id,
  closedBy: staffUserId,
  force: true
});
```

**Errors:**
```javascript
{
  statusCode: 400,
  message: 'Cannot close session: 2 unpaid order(s) remaining',
  error: {
    code: 'UNPAID_ORDERS_EXIST',
    unpaidOrderIds: ['...', '...'],
    unpaidOrderNumbers: ['#001', '#002'],
    unpaidCount: 2
  }
}
```

---

#### `getSessionOrders(sessionId, filters?, options?)`

**Purpose:** Get all orders for a session.

**Parameters:**
- `sessionId` (ObjectId, required)
- `filters` (Object, optional) - Additional filters (e.g., `{ status: 'pending' }`)
- `options` (Object, optional) - Query options (e.g., `{ populate: true }`)

**Returns:** `Order[]`

**Usage:**
```javascript
// Get all orders
const orders = await SessionService.getSessionOrders(sessionId);

// Get only pending orders
const pending = await SessionService.getSessionOrders(
  sessionId,
  { status: 'pending' }
);

// Get with populated menu items
const orders = await SessionService.getSessionOrders(
  sessionId,
  {},
  { populate: true }
);
```

---

#### `getSessionSummary(sessionId)`

**Purpose:** Get detailed session summary with order analytics.

**Returns:**
```javascript
{
  sessionId: string,
  tableId: string,
  status: 'active' | 'ended' | 'cancelled',
  startedAt: Date,
  endedAt: Date | null,
  duration: string,         // e.g. "45 minutes"
  
  orderCount: number,
  totalAmount: number,
  
  paidOrders: number,
  unpaidOrders: number,
  
  qrOrders: number,
  staffOrders: number,
  
  orders: [{
    orderId: string,
    orderNumber: string,
    source: 'qr' | 'staff',
    totalAmount: number,
    paymentStatus: string,
    status: string,
    placedAt: Date
  }]
}
```

---

#### `getActiveSessions(branchId)`

**Purpose:** Get all active sessions for a branch.

**Parameters:**
- `branchId` (ObjectId, required)

**Returns:** `DiningSession[]` (populated with table info)

**Usage:**
```javascript
const activeSessions = await SessionService.getActiveSessions(branchId);
// Returns sessions with table.tableNumber, table.section populated
```

---

#### `hasUnpaidOrders(sessionId)`

**Purpose:** Check if session has any unpaid orders.

**Returns:** `boolean`

---

#### `transferSession(sessionId, newTableId, movedBy)`

**Purpose:** Move session to different table (when customers change tables).

**Parameters:**
- `sessionId` (ObjectId, required)
- `newTableId` (ObjectId, required)
- `movedBy` (ObjectId, required) - Staff user ID

**Behavior:**
- Updates session.table
- Updates all order.table references
- Updates old table status to 'needs-cleaning'
- Updates new table status to 'occupied'
- All in single transaction

---

### HTTP Endpoints

#### `POST /api/v1/tables/:tableId/close`

**Purpose:** Close table (end active session).

**Auth:** Requires `TABLE_MANAGE` capability

**Query Parameters:**
- `force` (boolean, optional) - Force close with unpaid orders

**Request:**
```http
POST /api/v1/tables/60d5ec49f1b2c8b5f8e4a7b3/close?force=false
Authorization: Bearer <token>
```

**Response (200 OK):**
```javascript
{
  success: true,
  message: 'Table closed successfully',
  session: {
    sessionId: '...',
    tableId: '...',
    tableNumber: 'T-101',
    status: 'ended',
    duration: '45 minutes',
    summary: {
      orderCount: 3,
      totalAmount: 450,
      paidOrders: 3,
      unpaidOrders: 0,
      qrOrders: 2,
      staffOrders: 1
    }
  }
}
```

**Response (400 Bad Request):**
```javascript
{
  success: false,
  message: 'Cannot close session: 2 unpaid order(s) remaining',
  error: {
    code: 'UNPAID_ORDERS_EXIST',
    unpaidOrderIds: ['...', '...'],
    unpaidOrderNumbers: ['#001', '#002'],
    unpaidCount: 2
  }
}
```

---

## Database Schema

### DiningSession Collection

```javascript
{
  _id: ObjectId,
  table: ObjectId,           // ref: 'Table'
  merchant: ObjectId,        // ref: 'Merchant'
  branch: ObjectId,          // ref: 'Branch'
  token: String,             // 64-char hex (crypto.randomBytes(32))
  status: String,            // 'active', 'ended', 'cancelled'
  startedAt: Date,
  endedAt: Date,             // null while active
  createdBy: ObjectId,       // ref: 'User', null for QR-initiated
  metadata: {
    guestCount: Number,
    notes: String
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
```javascript
// Unique constraint - only one active session per table
{ table: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'active' } }

// Query performance
{ branch: 1, status: 1 }
{ status: 1, startedAt: -1 }
```

### Order Schema Changes

```javascript
{
  // ... existing fields ...
  session: ObjectId,         // ref: 'DiningSession' (required for dine_in)
  source: String,            // 'qr', 'staff', 'web', 'pos', etc.
  // ... rest of schema ...
}
```

**Validation:**
- `session` is **required** for `orderType: 'dine_in'`
- `session` is **optional** for takeaway/delivery

---

## Socket.IO Events

### Event: `session:created`

**Emitted When:** New dining session created

**Rooms:**
- `branch:{branchId}:perm:ORDER_VIEW`
- `branch:{branchId}:perm:ORDER_MANAGE`

**Payload:**
```javascript
{
  sessionId: string,
  tableId: string,
  tableNumber: string,      // e.g. "T-101"
  branchId: string,
  source: 'qr' | 'staff',
  startedAt: Date,
  createdBy: string | null  // staff user ID or null
}
```

---

### Event: `session:ended`

**Emitted When:** Dining session closed

**Rooms:**
- `branch:{branchId}:perm:ORDER_VIEW`
- `branch:{branchId}:perm:ORDER_MANAGE`

**Payload:**
```javascript
{
  sessionId: string,
  tableId: string,
  branchId: string,
  endedAt: Date,
  duration: string,         // e.g. "45 minutes"
  closedBy: string,         // staff user ID
  forced: boolean,          // true if closed with unpaid orders
  summary: {
    orderCount: number,
    totalAmount: number,
    paidOrders: number,
    unpaidOrders: number
  }
}
```

---

## Integration Guide

### Frontend: Customer QR Flow

```javascript
// 1. Customer scans QR code
const qrData = parseQR(scanResult);
// qrData = { tableId, merchantId, branchId, token }

// 2. Validate QR and get/create session
const response = await fetch('/api/v1/orders/validate-qr', {
  method: 'POST',
  body: JSON.stringify(qrData)
});
// Middleware calls SessionService.getOrCreateActiveSession()

// 3. Show menu and allow ordering
// Order placement automatically links to session
const orderResponse = await fetch('/api/v1/orders', {
  method: 'POST',
  body: JSON.stringify({
    items: [...],
    tableId: qrData.tableId,
    orderType: 'dine_in'
  })
});
// OrderTransactionService sets order.session and order.source='qr'
```

### Frontend: Staff Dashboard

```javascript
// Subscribe to branch events
socket.emit('join', `branch:${branchId}:perm:ORDER_VIEW`);

// Listen for new sessions
socket.on('session:created', (data) => {
  showNotification(`New session at ${data.tableNumber}`);
  addToActiveSessionsList(data);
});

// Listen for closed sessions
socket.on('session:ended', (data) => {
  showSessionSummary(data);
  removeFromActiveSessionsList(data.sessionId);
});

// View active sessions
const sessions = await fetch(`/api/v1/branches/${branchId}/active-sessions`);
// Uses SessionService.getActiveSessions()

// Close table
await fetch(`/api/v1/tables/${tableId}/close`, {
  method: 'POST',
  body: JSON.stringify({ force: false })
});
```

### Backend: Custom Order Logic

```javascript
// If you need to create orders programmatically
const mongoose = require('mongoose');
const { SessionService } = require('./src/modules/sessions/service/SessionService');

async function placeCustomOrder(tableId, items, staffUserId) {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();
    
    // Get or create dining session
    const { session: diningSession } = await SessionService.getOrCreateActiveSession({
      tableId,
      createdBy: staffUserId,
      mongoSession: session
    });
    
    // Create order
    const order = await Order.create([{
      merchant: merchantId,
      branch: branchId,
      table: tableId,
      session: diningSession._id,  // ✅ Link to session
      orderType: 'dine_in',
      source: 'staff',              // ✅ Track source
      items: items,
      // ... other fields
    }], { session });
    
    await session.commitTransaction();
    return order[0];
    
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
```

---

## Testing

### Test Coverage

**Unit Tests:**
- DiningSession model validation
- SessionService business logic
- Race condition handling
- Transaction rollback scenarios

**Integration Tests (Task 9):**
```
✅ Complete multi-customer flow (3 customers, mixed QR/staff)
✅ Session isolation between tables
✅ Payment validation on close
✅ Partial payment handling
✅ Table lifecycle (available → occupied → needs-cleaning)
✅ Multiple session cycles at same table
✅ Data consistency verification
✅ Session token uniqueness
✅ Branch-level active sessions query
```

**Socket.IO Tests (Task 8):**
```
✅ session:created event (QR customer)
✅ session:created event (staff)
✅ NO emit on session reuse
✅ session:ended event with summary
✅ forced closure flag
✅ multiple orders summary
✅ Resilience on socket failure (creation)
✅ Resilience on socket failure (ending)
```

**Concurrency Tests:**
```
✅ 10 simultaneous getOrCreateActiveSession → 1 session
✅ Retry logic on lock timeout
✅ Exponential backoff working
```

### Running Tests

```bash
# All session tests
npm test -- tests/session

# Specific test suites
npm test -- tests/task-5-verification.test.js          # QR flow
npm test -- tests/task-6-staff-order-session.test.js  # Staff flow
npm test -- tests/task-7-close-table.test.js          # Close table
npm test -- tests/task-8-session-socket-events.test.js  # Socket.IO
npm test -- tests/task-9-integration-full-flow.test.js  # Full integration
npm test -- tests/session-concurrency.test.js         # Concurrency
```

---

## Troubleshooting

### Issue: "Transaction lock timeout"

**Symptoms:** High concurrency causes transaction failures

**Cause:** Multiple requests trying to create session simultaneously

**Solution:** Already implemented - exponential backoff retry logic (max 5 retries)

**Monitoring:**
```javascript
// Check logs for retry patterns
logger.warn('session.transaction_retry', {
  tableId, retryCount, maxRetries, delayMs
});
```

---

### Issue: "Cannot close session: unpaid orders"

**Symptoms:** Staff cannot close table

**Cause:** One or more orders not marked as paid

**Solutions:**
1. Have customers pay all orders first
2. Use `force: true` flag (management override)
3. Check payment status: `SessionService.hasUnpaidOrders(sessionId)`

**Debug:**
```javascript
const summary = await SessionService.getSessionSummary(sessionId);
console.log('Unpaid orders:', summary.orders.filter(o => o.paymentStatus !== 'paid'));
```

---

### Issue: Multiple active sessions for same table

**Symptoms:** Database constraint violation

**Cause:** Session not properly ended before creating new one

**Check:**
```javascript
const sessions = await DiningSession.find({
  table: tableId,
  status: 'active'
});
console.log(`Active sessions for table: ${sessions.length}`);
```

**Fix:**
```javascript
// End all orphaned sessions (admin operation)
await DiningSession.updateMany(
  { table: tableId, status: 'active' },
  { status: 'cancelled', endedAt: new Date() }
);
```

---

### Issue: Orders not linked to session

**Symptoms:** `order.session` is null for dine_in orders

**Cause:** Old code bypassing SessionService

**Check:**
```javascript
const unlinked = await Order.find({
  orderType: 'dine_in',
  session: null
});
```

**Migration Script:**
```javascript
// Link orphaned orders to sessions (run once)
const tables = await Table.find({ status: 'occupied' });

for (const table of tables) {
  const session = await DiningSession.findOne({
    table: table._id,
    status: 'active'
  });
  
  if (session) {
    await Order.updateMany(
      { table: table._id, session: null, orderType: 'dine_in' },
      { session: session._id }
    );
  }
}
```

---

### Issue: Socket.IO events not received

**Symptoms:** Dashboard not updating in real-time

**Check:**
1. Client connected to Socket.IO?
2. Client joined correct room?
3. Server Socket.IO initialized?

**Debug Client:**
```javascript
console.log('Socket connected:', socket.connected);
console.log('Socket rooms:', socket.rooms);

socket.on('session:created', (data) => {
  console.log('✅ Received session:created', data);
});
```

**Debug Server:**
```javascript
// Check if getIo() returns valid instance
const io = require('./src/infrastructure/websocket/socket-server').getIo();
console.log('Socket.IO initialized:', !!io);
```

---

## Performance Considerations

### Database Indexes

**Critical Indexes:**
```javascript
// DiningSession
{ table: 1, status: 'active' } - unique, for session lookup
{ branch: 1, status: 1 } - for getActiveSessions()

// Order
{ session: 1 } - for getSessionOrders()
{ table: 1, session: null } - for finding unlinked orders
```

### Query Optimization

**Good:**
```javascript
// Single query with pagination
const sessions = await SessionService.getActiveSessions(branchId)
  .limit(50)
  .sort({ startedAt: -1 });
```

**Avoid:**
```javascript
// N+1 queries
for (const table of tables) {
  const session = await SessionService.getActiveSession(table._id); // ❌ Slow
}
```

### Transaction Best Practices

- Keep transactions short
- Don't await external APIs inside transactions
- Use `mongoSession` parameter to avoid nested transactions
- Clean up with `.endSession()` in `finally` blocks

---

## Migration Guide

### From Old System to Dining Sessions

**Step 1: Add session field to Order model**
```javascript
// Already done in implementation
session: { type: ObjectId, ref: 'DiningSession' }
```

**Step 2: Deploy DiningSession model**
```bash
# Model is already created
# MongoDB will auto-create collection on first insert
```

**Step 3: Update order placement code**
```javascript
// Old code (remove)
await BranchService.validateQRAndBlock(tableId);

// New code (replace)
const { session } = await SessionService.getOrCreateActiveSession({ tableId });
order.session = session._id;
```

**Step 4: Backfill existing orders (optional)**
```javascript
// Run once to link historical orders
// See "Orders not linked to session" in Troubleshooting
```

**Step 5: Update frontend**
- Remove "table occupied" error handling
- Add session summary display
- Subscribe to Socket.IO events

---

## Security Considerations

### QR Token Validation

- QR tokens are validated via `protectTableSession` middleware
- Tokens are unique per session (64-char hex)
- Tokens don't expire (session lifecycle managed separately)

### Access Control

**Staff Operations:**
- Close table: Requires `TABLE_MANAGE` capability
- Force close: Requires `TABLE_MANAGE` capability
- Transfer session: Requires `TABLE_MANAGE` capability

**Customer Operations:**
- Scan QR: Public (validated via token)
- Place order: Public (validated via session token)

### Audit Trail

**Tracked Fields:**
- `session.createdBy` - Who started session (null for QR)
- `order.source` - How order was placed ('qr' vs 'staff')
- `session.startedAt`, `session.endedAt` - Session duration

**Audit Queries:**
```javascript
// Who closed this session?
const session = await DiningSession.findById(sessionId);
console.log('Closed by:', session.closedBy);

// Session duration
console.log('Duration:', session.getDurationFormatted());

// Order breakdown
const summary = await SessionService.getSessionSummary(sessionId);
console.log(`QR: ${summary.qrOrders}, Staff: ${summary.staffOrders}`);
```

---

## Future Enhancements

### Potential Features

1. **Session Timeout**
   - Auto-end sessions after N hours of inactivity
   - Configurable per merchant

2. **Split Bill**
   - Tag orders with customer identifier
   - Generate separate bills per customer

3. **Session Transfer**
   - Already implemented: `transferSession()`
   - Add UI for staff to move customers between tables

4. **Guest Count**
   - Track `metadata.guestCount`
   - Analytics: avg guests per table, per time slot

5. **Session Analytics**
   - Avg session duration
   - Peak hours for sessions
   - QR adoption rate vs staff orders

---

## Contact & Support

**For questions or issues:**
- Check existing tests for usage examples
- Review SessionService source code
- Search logs for session-related errors

**Log Patterns:**
```
session.created - New session started
session.reused - Existing session reused
session.race_condition_detected - Concurrent creation attempt
session.transaction_retry - Retry due to lock timeout
session.ended - Session closed
session.socket_emitted - Socket.IO event sent
```

---

*Last Updated: Task 10 Complete*
*Version: 1.0.0*
