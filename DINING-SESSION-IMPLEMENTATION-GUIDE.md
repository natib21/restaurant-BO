# Dining Session Implementation Guide
## Table-Based Session Management for Multi-Customer QR Ordering

---

## Executive Summary

This document provides a complete implementation guide for refactoring the restaurant backend to support **dining sessions** - representing complete table visits that can contain multiple orders from multiple customers (both QR and staff-created).

### Current State Analysis

**✅ What Already Exists:**
- `CustomerSession` model with active session tracking per table
- Partial unique index preventing multiple active sessions per table
- QR token-based table access system
- Separate customer (QR) and staff order flows
- Table occupancy status tracking
- Socket.IO real-time updates

**❌ What Needs to Change:**
1. `CustomerSession` represents individual customer sessions, not table dining sessions
2. QR access blocked when table is "occupied"
3. Individual order payment triggers table availability
4. No concept of "dining session lifecycle" 
5. Orders don't track their `source` (`qr` vs `staff`)
6. No centralized session management service
7. Staff and customer orders use separate session logic

---

## Architecture Overview

### Current Architecture
```
Customer scans QR
    |
    v
Create CustomerSession (individual)
    |
    v
Table = occupied
    |
    v
BLOCK subsequent QR scans ❌
```

### Target Architecture
```
                    RESTAURANT
                        |
                        v
                      TABLE
                        |
              (status: available/occupied)
                        |
                        v
            ONE ACTIVE DINING SESSION
                        |
        +---------------+---------------+
        |               |               |
        v               v               v
    Order #1        Order #2        Order #3
    (QR, Cust A)    (Staff, Wait)   (QR, Cust B)
        |               |               |
    payment         payment         payment
    (paid)          (unpaid)        (paid)
        |               |               |
        +---------------+---------------+
                        |
                        v
            Session remains ACTIVE
            (until staff closes table)
```

---

## Phase 1: Analysis & Planning

### 1.1 Current Data Model Review

#### CustomerSession Model (Needs Renaming)
```javascript
// models/customerSessionModule.js
{
  token: String,           // ✅ Keep
  table: ObjectId,         // ✅ Keep
  merchant: ObjectId,      // ✅ Keep  
  branch: ObjectId,        // ✅ Keep
  customer: ObjectId,      // ❌ Remove (session != customer)
  deviceInfo: Object,      // ❌ Remove (not session-level)
  expiresAt: Date,         // ✅ Keep but rename logic
  isActive: Boolean,       // ✅ Keep
  createdAt: Date,         // ✅ Keep (becomes startedAt)
  updatedAt: Date          // ✅ Keep
}
```

**Issues:**
- Name implies "customer session" not "table dining session"
- `customer` field ties session to individual customer ❌
- No `status` field (`active`, `ended`, `cancelled`)
- No `endedAt` timestamp
- No `createdBy` tracking for staff-initiated sessions

#### Order Model
```javascript
// models/orderModel.js
{
  table: ObjectId,         // ✅ Has table reference
  merchant: ObjectId,      // ✅ Has merchant
  branch: ObjectId,        // ✅ Has branch
  source: String,          // ✅ Has source ('web', 'telegram', 'admin', 'waiter')
  customer: ObjectId,      // ✅ Optional customer
  orderType: String,       // ✅ Has orderType
  paymentStatus: String,   // ✅ Separate from orderStatus ✅
  // ❌ MISSING: sessionId link
}
```

**Issues:**
- No `sessionId` field to link orders to dining session
- `source` values don't match requirement (`qr` vs `web`)
- No validation preventing order creation without session

#### Table Model
```javascript
// models/tabelModel.js
{
  status: String,          // ✅ Has status enum
  // ✅ Has QR system
  // ✅ Has virtuals for currentOrder & activeSession
}
```

**Issues:**
- Virtual `activeSession` uses `CustomerSession` model (will need update)
- Status transition logic scattered across codebase

### 1.2 Current Flow Analysis

#### QR Order Flow
```javascript
// Current: src/modules/sessions/session.controller.js
POST /api/v1/sessions/start
    |
    v
BranchService.startTableSessionFromQr()
    |
    v
Creates CustomerSession
    |
    v
❌ Blocks if table.status === 'occupied'
```

#### Staff Order Flow  
```javascript
// Current: src/modules/order/controller/handlers/placement.handler.js
POST /api/v1/orders/staff
    |
    v
OrderService.staffPlaceOrder()
    |
    v
❌ Does NOT create/check session
❌ Directly creates order
```

**Problem:** Two completely separate flows with no shared session logic!

---

## Phase 2: Implementation Tasks

### Task 1: Rename & Refactor CustomerSession → DiningSession

**Priority:** HIGH  
**Est. Time:** 3-4 hours  
**Risk:** MEDIUM (backward compatibility)

#### Subtasks:

**1.1 Create Migration Script**
```javascript
// migrations/001-customer-session-to-dining-session.js
async function up() {
  // Rename collection
  await db.renameCollection('customersessions', 'diningsessions');
  
  // Add new fields with defaults
  await db.collection('diningsessions').updateMany({}, {
    $set: {
      status: 'active',
      startedAt: '$createdAt',
      endedAt: null,
      createdBy: null
    },
    $unset: {
      customer: '',
      deviceInfo: ''
    }
  });
  
  // Update indexes
  await db.collection('diningsessions').dropIndex('customer_1');
  // ... other index updates
}
```

**1.2 Create New DiningSession Model**
```javascript
// models/DiningSession.js
const diningSessionSchema = new Schema({
  // Core references
  table: {
    type: Schema.Types.ObjectId,
    ref: 'Table',
    required: true,
    index: true
  },
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true,
    index: true
  },
  branch: {
    type: Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },
  
  // Session identity
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
    comment: 'Secure token for QR access and API calls'
  },
  
  // Lifecycle
  status: {
    type: String,
    enum: ['active', 'ended', 'cancelled'],
    default: 'active',
    required: true,
    index: true
  },
  
  startedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  endedAt: {
    type: Date,
    default: null
  },
  
  // Tracking
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    comment: 'Staff member who created session (null for QR-initiated)'
  },
  
  // Metadata
  metadata: {
    guestCount: { type: Number, default: null },
    notes: { type: String, trim: true }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ CRITICAL: Only one active session per table
diningSessionSchema.index(
  { table: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' }
  }
);

// Compound indexes for queries
diningSessionSchema.index({ merchant: 1, branch: 1, status: 1 });
diningSessionSchema.index({ status: 1, endedAt: 1 });

// Virtuals
diningSessionSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'session',
  match: { status: { $nin: ['canceled'] } }
});

module.exports = mongoose.model('DiningSession', diningSessionSchema);
```

**1.3 Update Table Model Virtuals**
```javascript
// models/tabelModel.js
tableSchema.virtual('activeSession', {
  ref: 'DiningSession',  // ✅ Changed from CustomerSession
  localField: '_id',
  foreignField: 'table',
  justOne: true,
  match: { status: 'active' }
});
```

**1.4 Create Backward Compatibility Alias**
```javascript
// models/customerSessionModule.js
// Keep old file for compatibility during transition
const DiningSession = require('./DiningSession');
module.exports = DiningSession; // Alias to new model
```

---

### Task 2: Add sessionId to Order Model

**Priority:** HIGH  
**Est. Time:** 2 hours  
**Risk:** HIGH (requires data migration)

#### Subtasks:

**2.1 Update Order Schema**
```javascript
// models/orderModel.js
const orderSchema = new Schema({
  // ... existing fields ...
  
  // ✅ NEW: Link to dining session
  session: {
    type: Schema.Types.ObjectId,
    ref: 'DiningSession',
    required: true,  // ❗ Will break existing orders initially
    index: true,
    comment: 'Dining session this order belongs to'
  },
  
  // ✅ UPDATE: Source values to match requirement
  source: {
    type: String,
    enum: ['qr', 'staff', 'web', 'telegram', 'admin', 'waiter'],
    default: 'web',
    required: true,
    index: true,
    comment: 'qr = customer QR scan, staff = waiter created'
  },
  
  // ... rest of schema ...
});

// ✅ NEW: Index for session queries
orderSchema.index({ session: 1, status: 1 });
orderSchema.index({ session: 1, paymentStatus: 1 });
```

**2.2 Create Data Migration Script**
```javascript
// migrations/002-add-session-to-orders.js
async function up() {
  const Order = mongoose.model('Order');
  const DiningSession = mongoose.model('DiningSession');
  const Table = mongoose.model('Table');
  
  // Strategy: Create sessions for tables with active orders
  const ordersWithoutSession = await Order.find({
    session: { $exists: false },
    status: { $nin: ['completed', 'canceled'] }
  }).populate('table');
  
  for (const order of ordersWithoutSession) {
    if (!order.table) continue;
    
    // Find or create active session for this table
    let session = await DiningSession.findOne({
      table: order.table._id,
      status: 'active'
    });
    
    if (!session) {
      // Create session for existing order
      session = await DiningSession.create({
        table: order.table._id,
        merchant: order.merchant,
        branch: order.branch,
        token: crypto.randomBytes(32).toString('hex'),
        status: 'active',
        startedAt: order.createdAt,
        createdBy: null,
        metadata: {
          notes: 'Migrated from existing order'
        }
      });
      
      console.log(`Created session ${session._id} for table ${order.table.tableNumber}`);
    }
    
    // Link order to session
    order.session = session._id;
    await order.save({ validateBeforeSave: false });
  }
  
  // For completed/canceled orders, mark session field as null temporarily
  await Order.updateMany(
    {
      session: { $exists: false },
      status: { $in: ['completed', 'canceled'] }
    },
    {
      $set: { session: null }
    }
  );
}
```

**2.3 Update Source Enum Mapping**
```javascript
// migrations/003-normalize-order-sources.js
async function up() {
  // Map old source values to new enum
  await Order.updateMany(
    { source: 'web' },
    { $set: { source: 'qr' } }  // Assume 'web' was QR orders
  );
  
  await Order.updateMany(
    { source: { $in: ['admin', 'waiter'] } },
    { $set: { source: 'staff' } }
  );
}
```

---

### Task 3: Create SessionService (Core Logic)

**Priority:** CRITICAL  
**Est. Time:** 6-8 hours  
**Risk:** HIGH (affects all order flows)

#### Subtasks:

**3.1 Create SessionService**
```javascript
// src/modules/sessions/service/SessionService.js
const DiningSession = require('../../../../models/DiningSession');
const Table = require('../../../../models/tabelModel');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');
const crypto = require('crypto');
const mongoose = require('mongoose');

class SessionService {
  /**
   * Get or create active session for a table (CORE METHOD)
   * 
   * This is the central method used by both QR and staff flows.
   * Ensures only one active session exists per table.
   * 
   * @param {Object} params
   * @param {ObjectId} params.tableId
   * @param {ObjectId} [params.createdBy] - Staff user ID (null for QR)
   * @param {Object} [params.session] - Mongoose session for transactions
   * @returns {Promise<Object>} { session, isNew }
   */
  static async getOrCreateActiveSession({ tableId, createdBy = null, session = null }) {
    // Validate table
    const table = await Table.findById(tableId).session(session);
    if (!table) {
      throw new AppError('Table not found', 404);
    }
    
    if (!table.isActive) {
      throw new AppError('Table is not available for use', 400);
    }
    
    // Find existing active session (with retry for race conditions)
    let existingSession = await DiningSession.findOne({
      table: tableId,
      status: 'active'
    }).session(session);
    
    if (existingSession) {
      return {
        session: existingSession,
        isNew: false
      };
    }
    
    // Create new session with race condition protection
    try {
      const newSession = await DiningSession.create([{
        table: tableId,
        merchant: table.merchant,
        branch: table.branch,
        token: crypto.randomBytes(32).toString('hex'),
        status: 'active',
        startedAt: new Date(),
        createdBy: createdBy || null,
        metadata: {
          guestCount: null,
          notes: createdBy ? 'Staff-initiated session' : 'QR-initiated session'
        }
      }], { session });
      
      // Mark table as occupied
      table.status = 'occupied';
      await table.save({ session, validateBeforeSave: false });
      
      return {
        session: newSession[0],
        isNew: true
      };
      
    } catch (error) {
      // Handle duplicate key error (race condition)
      if (error.code === 11000) {
        // Another request created session, fetch it
        const raceSession = await DiningSession.findOne({
          table: tableId,
          status: 'active'
        }).session(session);
        
        if (raceSession) {
          return {
            session: raceSession,
            isNew: false
          };
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Get active session for a table
   * Returns null if no active session exists
   */
  static async getActiveSession(tableId, session = null) {
    return await DiningSession.findOne({
      table: tableId,
      status: 'active'
    }).session(session);
  }
  
  /**
   * End a dining session
   * 
   * Validates:
   * - All orders are in terminal state (completed/canceled)
   * - OR payment requirements are met
   * 
   * @param {Object} params
   * @param {ObjectId} params.sessionId
   * @param {ObjectId} params.closedBy - Staff user ID
   * @param {boolean} [params.force] - Force close even with unpaid orders
   * @param {Object} [params.session] - Mongoose session
   */
  static async endSession({ sessionId, closedBy, force = false, session = null }) {
    const diningSession = await DiningSession.findOne({
      _id: sessionId,
      status: 'active'
    }).session(session);
    
    if (!diningSession) {
      throw new AppError('Active session not found', 404);
    }
    
    // Check for unpaid orders
    if (!force) {
      const unpaidOrders = await Order.find({
        session: sessionId,
        paymentStatus: { $in: ['unpaid', 'partially_paid'] },
        status: { $nin: ['canceled'] }
      }).session(session);
      
      if (unpaidOrders.length > 0) {
        throw new AppError(
          `Cannot close session: ${unpaidOrders.length} unpaid order(s) remaining`,
          400,
          {
            code: 'UNPAID_ORDERS_EXIST',
            unpaidOrderIds: unpaidOrders.map(o => o._id),
            unpaidOrderNumbers: unpaidOrders.map(o => o.orderNumber)
          }
        );
      }
    }
    
    // End session
    diningSession.status = 'ended';
    diningSession.endedAt = new Date();
    await diningSession.save({ session });
    
    // Update table status
    const table = await Table.findById(diningSession.table).session(session);
    if (table) {
      table.status = 'needs-cleaning';  // Or 'available' based on business rules
      await table.save({ session, validateBeforeSave: false });
    }
    
    return diningSession;
  }
  
  /**
   * Get all orders for a session
   */
  static async getSessionOrders(sessionId, filters = {}) {
    return await Order.find({
      session: sessionId,
      ...filters
    })
    .populate('items.menuItem', 'name')
    .sort({ createdAt: -1 });
  }
  
  /**
   * Validate table can accept orders
   * Used as pre-check before order creation
   */
  static async validateTableForOrders(tableId) {
    const table = await Table.findById(tableId);
    
    if (!table) {
      throw new AppError('Table not found', 404);
    }
    
    if (!table.isActive) {
      throw new AppError('Table is not available', 400);
    }
    
    // ✅ DO NOT check if table.status === 'occupied'
    // Occupied tables should still accept QR orders!
    
    return table;
  }
}

module.exports = { SessionService };
```

---

### Task 4: Refactor QR Flow to Use SessionService

**Priority:** HIGH  
**Est. Time:** 3-4 hours  
**Risk:** MEDIUM

#### Subtasks:

**4.1 Update BranchService.startTableSessionFromQr**
```javascript
// src/modules/branch/service/BranchService.js

static async startTableSessionFromQr({ data, s: signature }) {
  // 1. Verify QR signature
  const { branch, table } = await this.verifyQrScan({ data, s: signature });
  
  // 2. ✅ NEW: Use centralized session service
  const { session, isNew } = await SessionService.getOrCreateActiveSession({
    tableId: table._id,
    createdBy: null  // QR-initiated, no staff user
  });
  
  // 3. Return session data (same response format)
  return {
    success: true,
    table: {
      _id: table._id,
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      status: table.status,
      branch: {
        _id: branch._id,
        name: branch.name
      }
    },
    session: {
      token: session.token,
      expiresAt: session.expiresAt,
      isNew: isNew  // ✅ Indicates if session was just created
    }
  };
}
```

**4.2 Remove Table Occupancy Block**
```javascript
// src/modules/branch/service/BranchService.js

// ❌ REMOVE this validation:
if (table.status === 'occupied') {
  throw new AppError('Table is currently occupied', 400);
}

// ✅ KEEP validation for:
if (!table.isActive) {
  throw new AppError('Table is not available', 400);
}
```

---

### Task 5: Refactor Customer Order Flow

**Priority:** HIGH  
**Est. Time:** 3 hours  
**Risk:** MEDIUM

#### Subtasks:

**5.1 Update OrderTransactionService.executePlaceOrder**
```javascript
// src/modules/order/service/OrderTransactionService.js

static async executePlaceOrder(command) {
  const {
    merchantId,
    branchId,
    tableId,
    customerId,
    sessionToken,  // ✅ Session token from request
    items,
    // ... other fields
  } = command;
  
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // 1. ✅ Get or create active session
      const { session: diningSession } = await SessionService.getOrCreateActiveSession({
        tableId,
        createdBy: null,  // Customer order
        session
      });
      
      // 2. Generate order number
      const orderNumber = await this.generateOrderNumber({
        merchant: merchantId,
        branch: branchId,
        orderType: 'dine_in'
      }, session);
      
      // 3. Create order with session link
      const order = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        session: diningSession._id,  // ✅ Link to session
        source: 'qr',                // ✅ Mark as QR order
        customer: customerId,
        customerName: command.customerName,
        customerPhone: command.customerPhone,
        orderNumber,
        orderType: 'dine_in',
        items: processedItems,
        subtotal: financials.subtotal,
        taxAmount: financials.taxAmount,
        totalAmount: financials.totalAmount,
        status: 'pending',
        paymentStatus: 'unpaid'
      }], { session });
      
      // 4. Queue notifications & events
      await NotificationService.notifyOrderPlaced({
        order: order[0],
        sessionToken: diningSession.token,
        // ... other context
      }, session);
      
      // ... rest of transaction logic
    });
    
  } finally {
    await session.endSession();
  }
}
```

---

### Task 6: Refactor Staff Order Flow

**Priority:** HIGH  
**Est. Time:** 4 hours  
**Risk:** MEDIUM

#### Subtasks:

**6.1 Update OrderService.staffPlaceOrder**
```javascript
// src/modules/order/service/OrderService.js

static async staffPlaceOrder(data, req) {
  const {
    items,
    tableNumber,
    orderType,
    branchId,
    merchantId,
    performedBy,
    source = 'staff',  // ✅ Default to 'staff'
    // ... other fields
  } = data;
  
  const session = await mongoose.startSession();
  
  try {
    let order;
    
    await session.withTransaction(async () => {
      // 1. Find table
      const table = await Table.findOne({
        tableNumber,
        branch: branchId,
        merchant: merchantId
      }).session(session);
      
      if (!table) {
        throw new AppError('Table not found', 404);
      }
      
      // 2. ✅ Get or create active session
      const { session: diningSession } = await SessionService.getOrCreateActiveSession({
        tableId: table._id,
        createdBy: performedBy,  // ✅ Staff user
        session
      });
      
      // 3. Generate order number
      const orderNumber = await OrderTransactionService.generateOrderNumber({
        merchant: merchantId,
        branch: branchId,
        orderType: orderType || 'dine_in'
      }, session);
      
      // 4. Create order
      order = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: table._id,
        session: diningSession._id,  // ✅ Link to session
        source: 'staff',              // ✅ Mark as staff order
        orderNumber,
        orderType: orderType || 'dine_in',
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        items: processedItems,
        subtotal: financials.subtotal,
        totalAmount: financials.totalAmount,
        status: 'pending',
        paymentStatus: 'unpaid'
      }], { session });
      
      // 5. Queue notifications
      await NotificationService.notifyStaffOrderPlaced({
        order: order[0],
        branchId,
        merchantId,
        placedByName: data.performedByName,
        // ... other context
      }, session);
      
      // ... rest of transaction logic
    });
    
    return order[0];
    
  } finally {
    await session.endSession();
  }
}
```

---

### Task 7: Create Close Table Endpoint

**Priority:** MEDIUM  
**Est. Time:** 3 hours  
**Risk:** LOW

#### Subtasks:

**7.1 Create Table Controller Method**
```javascript
// src/modules/tables/table.controller.js

/**
 * POST /api/v1/tables/:tableId/close
 * Close active dining session for a table
 * 
 * Guards: protect, restrictTo('waiter', 'admin')
 * Body: { force: false }
 */
exports.closeTable = catchAsync(async (req, res, next) => {
  const { tableId } = req.params;
  const { force = false } = req.body;
  const closedBy = req.user._id;
  
  // Find active session for table
  const activeSession = await SessionService.getActiveSession(tableId);
  
  if (!activeSession) {
    return next(new AppError('No active session found for this table', 404));
  }
  
  // End session with validation
  const closedSession = await SessionService.endSession({
    sessionId: activeSession._id,
    closedBy,
    force
  });
  
  // Get final order summary
  const orders = await SessionService.getSessionOrders(closedSession._id);
  
  const summary = {
    totalOrders: orders.length,
    totalAmount: orders.reduce((sum, o) => sum + o.totalAmount, 0),
    paidOrders: orders.filter(o => o.paymentStatus === 'paid').length,
    unpaidOrders: orders.filter(o => o.paymentStatus === 'unpaid').length
  };
  
  res.status(200).json({
    status: 'success',
    message: 'Table closed successfully',
    data: {
      session: {
        _id: closedSession._id,
        startedAt: closedSession.startedAt,
        endedAt: closedSession.endedAt,
        duration: closedSession.endedAt - closedSession.startedAt
      },
      summary
    }
  });
});
```

**7.2 Add Route**
```javascript
// src/modules/tables/tables.routes.js
router.post(
  '/:tableId/close',
  protect,
  restrictTo('waiter', 'admin'),
  tableController.closeTable
);
```

---

### Task 8: Update Socket.IO Events

**Priority:** MEDIUM  
**Est. Time:** 2 hours  
**Risk:** LOW

#### Subtasks:

**8.1 Add Session Event Builders**
```javascript
// src/modules/notifications/events/session-events.js

function buildSessionCreatedEvent({ session, table, createdBy }) {
  return {
    eventType: 'session:created',
    target: {
      room: `branch:${session.branch}`,
      audience: 'staff'
    },
    payload: {
      sessionId: session._id.toString(),
      tableId: table._id.toString(),
      tableNumber: table.tableNumber,
      startedAt: session.startedAt,
      createdBy: createdBy ? {
        userId: createdBy._id,
        name: createdBy.firstName
      } : null,
      source: createdBy ? 'staff' : 'qr'
    },
    aggregateId: session._id,
    aggregateType: 'session',
    merchant: session.merchant,
    timestamp: new Date().toISOString()
  };
}

function buildSessionEndedEvent({ session, table, closedBy, summary }) {
  return {
    eventType: 'session:ended',
    target: {
      room: `branch:${session.branch}`,
      audience: 'staff'
    },
    payload: {
      sessionId: session._id.toString(),
      tableId: table._id.toString(),
      tableNumber: table.tableNumber,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      duration: session.endedAt - session.startedAt,
      closedBy: {
        userId: closedBy._id,
        name: closedBy.firstName
      },
      summary
    },
    aggregateId: session._id,
    aggregateType: 'session',
    merchant: session.merchant,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  buildSessionCreatedEvent,
  buildSessionEndedEvent
};
```

**8.2 Queue Events in SessionService**
```javascript
// In SessionService.getOrCreateActiveSession
if (isNew) {
  await OutboxService.queueEvents([
    buildSessionCreatedEvent({
      session: newSession[0],
      table,
      createdBy
    })
  ], { session });
}

// In SessionService.endSession
await OutboxService.queueEvents([
  buildSessionEndedEvent({
    session: diningSession,
    table,
    closedBy,
    summary
  })
], { session });
```

---

### Task 9: Update Tests

**Priority:** HIGH  
**Est. Time:** 6-8 hours  
**Risk:** MEDIUM

#### Test Coverage Required:

**9.1 SessionService Unit Tests**
```javascript
// tests/session-service.test.js

describe('SessionService', () => {
  describe('getOrCreateActiveSession', () => {
    it('should create new session for available table', async () => {
      const { session, isNew } = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      expect(isNew).toBe(true);
      expect(session.status).toBe('active');
      expect(session.table.toString()).toBe(table._id.toString());
    });
    
    it('should return existing session for occupied table', async () => {
      // Create first session
      const first = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Try to create second
      const second = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      expect(second.isNew).toBe(false);
      expect(second.session._id.toString()).toBe(first.session._id.toString());
    });
    
    it('should handle concurrent session creation (race condition)', async () => {
      // Simulate two simultaneous QR scans
      const [result1, result2] = await Promise.all([
        SessionService.getOrCreateActiveSession({ tableId: table._id }),
        SessionService.getOrCreateActiveSession({ tableId: table._id })
      ]);
      
      // Both should reference same session
      expect(result1.session._id.toString()).toBe(result2.session._id.toString());
      
      // Only one should be "new"
      const newCount = [result1.isNew, result2.isNew].filter(Boolean).length;
      expect(newCount).toBe(1);
    });
  });
  
  describe('endSession', () => {
    it('should reject ending session with unpaid orders', async () => {
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Create unpaid order
      await Order.create({
        session: session._id,
        table: table._id,
        paymentStatus: 'unpaid',
        // ... other fields
      });
      
      await expect(
        SessionService.endSession({
          sessionId: session._id,
          closedBy: admin._id
        })
      ).rejects.toThrow('unpaid order');
    });
    
    it('should allow ending session with force flag', async () => {
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table._id
      });
      
      // Create unpaid order
      await Order.create({
        session: session._id,
        paymentStatus: 'unpaid',
        // ... other fields
      });
      
      const ended = await SessionService.endSession({
        sessionId: session._id,
        closedBy: admin._id,
        force: true
      });
      
      expect(ended.status).toBe('ended');
    });
  });
});
```

**9.2 QR Flow Integration Tests**
```javascript
// tests/qr-multi-customer-ordering.test.js

describe('Multi-Customer QR Ordering', () => {
  it('should allow multiple customers to scan same table QR', async () => {
    // Customer A scans
    const scanA = await request(app)
      .post('/api/v1/sessions/start')
      .query({ data: qrData, s: signature });
    
    expect(scanA.status).toBe(200);
    const sessionTokenA = scanA.body.data.session.token;
    
    // Customer B scans same table
    const scanB = await request(app)
      .post('/api/v1/sessions/start')
      .query({ data: qrData, s: signature });
    
    expect(scanB.status).toBe(200);
    const sessionTokenB = scanB.body.data.session.token;
    
    // Same session token
    expect(sessionTokenA).toBe(sessionTokenB);
  });
  
  it('should create separate orders for each customer', async () => {
    const sessionToken = /* ... */;
    
    // Customer A orders
    const orderA = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ items: [/* ... */] });
    
    // Customer B orders
    const orderB = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ items: [/* ... */] });
    
    expect(orderA.body.data.order._id).not.toBe(orderB.body.data.order._id);
    
    // Both link to same session
    const ordersInSession = await Order.find({
      session: orderA.body.data.order.session
    });
    
    expect(ordersInSession.length).toBe(2);
  });
  
  it('should keep session active after one customer pays', async () => {
    // Create two orders
    const order1 = /* ... */;
    const order2 = /* ... */;
    
    // Pay first order
    await request(app)
      .post(`/api/v1/orders/${order1._id}/pay`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ paymentMethod: 'cash' });
    
    // Check session still active
    const session = await DiningSession.findById(order1.session);
    expect(session.status).toBe('active');
    
    // Check table still occupied
    const table = await Table.findById(order1.table);
    expect(table.status).toBe('occupied');
  });
});
```

**9.3 Staff Order Integration Tests**
```javascript
// tests/staff-order-session.test.js

describe('Staff Order with Sessions', () => {
  it('should create session when creating order for available table', async () => {
    const response = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableNumber: 'T-5',
        customerName: 'John Doe',
        items: [/* ... */]
      });
    
    expect(response.status).toBe(201);
    
    const order = await Order.findById(response.body.data.order._id);
    expect(order.session).toBeDefined();
    expect(order.source).toBe('staff');
    
    const session = await DiningSession.findById(order.session);
    expect(session.status).toBe('active');
    expect(session.createdBy.toString()).toBe(waiterToken.userId);
  });
  
  it('should reuse session when creating second staff order', async () => {
    // Create first order
    const order1 = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableNumber: 'T-5',
        customerName: 'Customer A',
        items: [/* ... */]
      });
    
    const sessionId1 = order1.body.data.order.session;
    
    // Create second order
    const order2 = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableNumber: 'T-5',
        customerName: 'Customer B',
        items: [/* ... */]
      });
    
    const sessionId2 = order2.body.data.order.session;
    
    // Same session
    expect(sessionId1).toBe(sessionId2);
  });
});
```

**9.4 Close Table Tests**
```javascript
// tests/close-table.test.js

describe('Close Table', () => {
  it('should close table when all orders paid', async () => {
    const { session, table, order } = await setupSessionWithOrders({
      orderCount: 2,
      allPaid: true
    });
    
    const response = await request(app)
      .post(`/api/v1/tables/${table._id}/close`)
      .set('Authorization', `Bearer ${waiterToken}`);
    
    expect(response.status).toBe(200);
    
    const closedSession = await DiningSession.findById(session._id);
    expect(closedSession.status).toBe('ended');
    expect(closedSession.endedAt).toBeDefined();
    
    const updatedTable = await Table.findById(table._id);
    expect(updatedTable.status).toBe('needs-cleaning');
  });
  
  it('should prevent closing with unpaid orders', async () => {
    const { table } = await setupSessionWithOrders({
      orderCount: 2,
      allPaid: false
    });
    
    const response = await request(app)
      .post(`/api/v1/tables/${table._id}/close`)
      .set('Authorization', `Bearer ${waiterToken}`);
    
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/unpaid/i);
  });
});
```

---

### Task 10: Documentation Updates

**Priority:** LOW  
**Est. Time:** 2-3 hours  
**Risk:** NONE

#### Subtasks:

**10.1 Update API Documentation**
Create/update:
- `docs/api/sessions.md` - Session lifecycle API
- `docs/api/orders.md` - Updated order creation flows
- `docs/api/tables.md` - Close table endpoint

**10.2 Create Architecture Diagrams**
- Session lifecycle flowchart
- Multi-customer ordering sequence diagram
- Staff vs QR order comparison

**10.3 Update README**
- New session management features
- Migration guide for existing deployments

---

## Phase 3: Migration & Deployment

### Step 1: Pre-Migration Checklist

```bash
# 1. Backup database
mongodump --uri="mongodb://..." --out=backup-$(date +%Y%m%d)

# 2. Run migrations in staging first
NODE_ENV=staging npm run migrate:up

# 3. Verify data integrity
npm run verify:sessions
npm run verify:orders
```

### Step 2: Deployment Strategy

**Option A: Blue-Green Deployment (Recommended)**
1. Deploy new version to green environment
2. Run migrations on green database
3. Test thoroughly
4. Switch traffic to green
5. Monitor for 24 hours
6. Decommission blue

**Option B: Rolling Deployment**
1. Enable backward compatibility mode
2. Deploy to 50% of servers
3. Run migrations
4. Monitor for issues
5. Deploy to remaining 50%
6. Remove compatibility mode after 1 week

### Step 3: Rollback Plan

```javascript
// migrations/rollback-sessions.js
async function down() {
  // Rename back
  await db.renameCollection('diningsessions', 'customersessions');
  
  // Remove new fields
  await db.collection('customersessions').updateMany({}, {
    $unset: {
      status: '',
      startedAt: '',
      endedAt: '',
      createdBy: ''
    }
  });
  
  // Remove session from orders
  await db.collection('orders').updateMany({}, {
    $unset: { session: '' }
  });
}
```

---

## Phase 4: Testing Strategy

### Unit Tests (80% Coverage Target)
- [ ] SessionService methods
- [ ] Order creation with sessions
- [ ] Session validation logic
- [ ] Race condition handling

### Integration Tests (Key Flows)
- [ ] QR scan → session creation
- [ ] Multiple QR scans → same session
- [ ] Staff order → session creation
- [ ] Mixed QR + staff orders → same session
- [ ] Payment doesn't close session
- [ ] Close table validation

### E2E Tests (Critical Paths)
- [ ] Customer journey: QR scan → order → pay → stay
- [ ] Waiter journey: Create order → serve → close table
- [ ] Multi-customer: 3 customers, 5 orders, mixed payment
- [ ] Concurrent requests: 10 simultaneous QR scans

### Performance Tests
- [ ] Session creation under load (1000 req/s)
- [ ] Race condition handling (concurrent creates)
- [ ] Query performance with sessionId indexes

---

## Phase 5: Monitoring & Metrics

### Key Metrics to Track

**Session Metrics:**
```javascript
{
  "sessions_created_total": Counter,
  "sessions_active": Gauge,
  "sessions_ended_total": Counter,
  "session_duration_seconds": Histogram,
  "session_order_count": Histogram
}
```

**Order Metrics:**
```javascript
{
  "orders_per_session": Histogram,
  "qr_orders_total": Counter,
  "staff_orders_total": Counter,
  "session_reuse_rate": Gauge
}
```

**Error Metrics:**
```javascript
{
  "session_creation_errors": Counter,
  "race_condition_retries": Counter,
  "close_table_failures": Counter
}
```

### Alerts

```yaml
alerts:
  - name: HighSessionCreationFailures
    expr: rate(session_creation_errors[5m]) > 0.05
    severity: critical
    
  - name: SessionsNotClosing
    expr: sessions_active > 100
    severity: warning
    
  - name: RaceConditionSpike
    expr: rate(race_condition_retries[1m]) > 10
    severity: warning
```

---

## Risk Assessment

### HIGH RISK
1. **Database Migration** - Existing orders need sessionId
   - Mitigation: Staged rollout, extensive testing, rollback plan
   
2. **Race Conditions** - Multiple concurrent session creates
   - Mitigation: Partial unique index, retry logic, integration tests

3. **Breaking Changes** - API response formats may change
   - Mitigation: Version endpoints, maintain backward compatibility period

### MEDIUM RISK
1. **Performance Impact** - Additional queries for session lookup
   - Mitigation: Proper indexing, query optimization, caching
   
2. **Socket.IO Events** - New event types may break frontend
   - Mitigation: Version socket events, gradual rollout

### LOW RISK
1. **Table Status Logic** - Changed occupancy behavior
   - Mitigation: Clear documentation, staff training
   
2. **Test Coverage** - May miss edge cases initially
   - Mitigation: Phased rollout, canary deployments

---

## Success Criteria

### Functional Requirements
- [ ] Multiple customers can scan same table QR simultaneously
- [ ] QR and staff orders share same session
- [ ] Individual payment doesn't close session/table
- [ ] Staff can manually close table with validation
- [ ] All orders link to dining session
- [ ] Source tracking (qr vs staff) works correctly

### Non-Functional Requirements
- [ ] Session creation < 200ms (p95)
- [ ] No data loss during migration
- [ ] Zero downtime deployment
- [ ] 95% test coverage on new code
- [ ] Clear rollback capability within 5 minutes

### Business Requirements
- [ ] Table turnover time tracked accurately
- [ ] Revenue per session reported correctly
- [ ] Staff workflow unchanged (UX parity)
- [ ] Customer experience improved (no QR blocking)

---

## Timeline Estimate

### Phase 1: Analysis & Planning (2 days)
- Day 1: Analysis, architecture review
- Day 2: Detailed task breakdown, team review

### Phase 2: Implementation (10-12 days)
- Days 1-2: Task 1 (Model refactor)
- Days 3-4: Task 2 (Order schema)
- Days 5-7: Task 3 (SessionService)
- Day 8: Task 4 (QR flow)
- Day 9: Task 5 (Customer orders)
- Day 10: Task 6 (Staff orders)
- Day 11: Task 7 (Close table)
- Day 12: Task 8 (Socket.IO)

### Phase 3: Testing (5 days)
- Days 1-2: Unit tests
- Days 3-4: Integration tests
- Day 5: E2E tests

### Phase 4: Migration & Deployment (3 days)
- Day 1: Staging deployment
- Day 2: Production migration
- Day 3: Monitoring & hotfixes

**Total Estimated Time: 20-22 working days (4-5 weeks)**

---

## Appendix

### A. Database Indexes Reference

```javascript
// DiningSession
{ table: 1 }, { unique: true, partialFilterExpression: { status: 'active' } }
{ merchant: 1, branch: 1, status: 1 }
{ status: 1, endedAt: 1 }
{ token: 1 }, { unique: true }

// Order
{ session: 1, status: 1 }
{ session: 1, paymentStatus: 1 }
{ table: 1, status: 1 }  // Existing
```

### B. Environment Variables

```bash
# Session Configuration
SESSION_DURATION_HOURS=4
SESSION_TOKEN_LENGTH=32
SESSION_ALLOW_CONCURRENT_CREATION=false

# Table Management
TABLE_AUTO_CLEANING_DELAY_MINUTES=10
TABLE_FORCE_CLOSE_ENABLED=false
```

### C. Error Codes Reference

```javascript
const ERROR_CODES = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_ENDED: 'SESSION_ALREADY_ENDED',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  UNPAID_ORDERS_EXIST: 'UNPAID_ORDERS_EXIST',
  TABLE_NOT_AVAILABLE: 'TABLE_NOT_AVAILABLE',
  CONCURRENT_SESSION_DETECTED: 'CONCURRENT_SESSION_DETECTED'
};
```

---

## Next Steps

1. **Review this guide** with the team
2. **Approve architecture** decisions
3. **Create Jira tickets** from tasks
4. **Set up staging environment** for testing
5. **Begin Phase 1** implementation

---

**Document Version:** 1.0  
**Last Updated:** 2026-09-03  
**Author:** Backend Team  
**Status:** DRAFT - Awaiting Approval
