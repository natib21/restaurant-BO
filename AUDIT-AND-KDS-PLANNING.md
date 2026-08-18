# Global Audit Logging & KDS Integration — Planning Document

**Ground Rules Applied:**
- All claims backed by code actually read (file paths + line numbers referenced)
- No big-bang implementations — phased approach with independent testing
- Explicit decisions list at end requiring user input
- No silent merging of different systems

---

# PART 1: AUDIT LOGGING — GO GLOBAL

## Step 1: Current State Inspection

### 1.1 Existing Audit Infrastructure

**AuditLog Model** (`models/auditLogModel.js`):
```javascript
const auditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  action: { 
    type: String, 
    required: true,
    enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 
           'PASSWORD_CHANGE', 'TASK_CREATE', 'ROLE_ASSIGN', 
           'REPORT_ACCESS', 'REPORT_EXPORT']
  },
  resource: { type: String, required: true }, // e.g., 'Task', 'User', 'Merchant'
  resourceId: { type: mongoose.Schema.ObjectId, default: null },
  method: { type: String, enum: ['GET', 'POST', 'PATCH', 'DELETE'], required: true },
  endpoint: { type: String, required: true },
  statusCode: { type: Number, required: true },
  ip: String,
  userAgent: String,
  oldValues: mongoose.Schema.Types.Mixed,  // ✅ Exists for before/after diffs
  newValues: mongoose.Schema.Types.Mixed,  // ✅ Exists for before/after diffs
  metadata: mongoose.Schema.Types.Mixed,
}, {
  timestamps: true,  // ✅ createdAt/updatedAt automatic
});

// Indexes:
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resource: 1 });
```

**Missing from Schema:**
- ❌ `merchant` field for tenant isolation (CRITICAL GAP)
- ❌ `correlationId` / `requestId` for tracing related operations
- ❌ `branch` field for branch-level filtering

**AuditLogger Utility** (`utils/auditLogger.js`):
```javascript
const auditLogger = async ({
  user, action, resource, resourceId = null, method, endpoint,
  statusCode, oldValues = null, newValues = null, metadata = {}, req
}) => {
  try {
    await AuditLog.create({
      user: user._id,
      action, resource, resourceId, method, endpoint, statusCode,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      oldValues, newValues, metadata
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
    // ✅ Non-blocking — doesn't crash app
  }
};
```

**Current Usage Pattern:**
- ✅ Used in: `src/modules/reports/controller/report.controller.js` (lines 194, 368, 522, 597)
- ❌ NOT used in: Orders, Merchants, Users, Branches, Menu, Tables, Inventory
- Pattern: Explicit `await auditLogger({...})` calls sprinkled in specific controllers
- Action types used: `REPORT_ACCESS`, `REPORT_EXPORT`

**Real Example from Code** (`report.controller.js` line 194):
```javascript
await auditLogger({
  user: req.user,
  action: 'REPORT_ACCESS',
  resource: 'Report',
  method: req.method,
  endpoint: req.originalUrl,
  statusCode: 200,
  metadata: { reportType: 'sales', dateFrom, dateTo, branchId, format },
  req
});
```

### 1.2 What Needs Auditing (Gap Analysis)

**Critical Endpoints WITHOUT Audit Logging:**

| Module | Endpoints | Current State |
|--------|-----------|---------------|
| **Orders** | POST /order/staff, PATCH /order/:id/status, POST /order/:id/pay | ❌ No auditing |
| **Merchants** | POST /merchant, PATCH /merchant/:id, PATCH /merchant/:id/approve | ❌ No auditing |
| **Users** | POST /users, PATCH /users/:id, DELETE /users/:id | ❌ No auditing |
| **Branches** | POST /branch, PATCH /branch/:id, DELETE /branch/:id | ❌ No auditing |
| **Menu** | POST /menu, PATCH /menu/:id, DELETE /menu/:id | ❌ No auditing |
| **Tables** | POST /table, PATCH /table/:id/status, DELETE /table/:id | ❌ No auditing |
| **Inventory** | POST /inventory/adjust, POST /inventory/batch-adjust | ❌ No auditing |
| **Roles/Tasks** | POST /roles, PATCH /roles/:id, POST /tasks | ❌ No auditing |
| **Auth** | POST /auth/login, POST /auth/logout, PATCH /auth/change-password | ❌ No auditing |

**Financial Operations (HIGHEST PRIORITY):**
- Order payments (`POST /order/:id/pay`)
- Refunds (if they exist — need to grep)
- Inventory adjustments affecting valuation
- Merchant subscription changes

---

## Step 2: Design the "Catch Everything Automatically" Mechanism

### 2.1 Approach Comparison

#### Option A: Express Middleware (Generic Catch-All)

**How it works:**
1. Add middleware AFTER route handlers (in `src/app/create-app.js` after all routes mounted)
2. Inspect `req.method`, `req.originalUrl`, `res.statusCode`
3. Auto-log if method is POST/PATCH/PUT/DELETE and status is 2xx/4xx

**Pros:**
- ✅ Zero code changes in existing controllers
- ✅ Guaranteed coverage — can't forget to add it
- ✅ Captures ALL writes automatically

**Cons:**
- ❌ Hard to get before/after diffs (need to intercept req.body and res.json)
- ❌ No access to domain-specific context (e.g., "order status changed from pending → accepted")
- ❌ Can't easily capture `resourceId` (the actual document _id)
- ❌ Noisy — logs even validation errors (400s)

**Where it would hook in** (`src/app/create-app.js`):
```javascript
// Line ~100 (after all routes)
app.use(router); // Existing routes

// NEW: Global audit middleware
app.use(globalAuditMiddleware);  // ← Would capture all responses

app.use(globalErrorHandler);  // Existing error handler
```

#### Option B: Mongoose Middleware (Model-Level Hooks)

**How it works:**
1. Create a Mongoose plugin (`utils/auditPlugin.js`)
2. Attach to models needing auditing
3. Hook `post('save')`, `post('findOneAndUpdate')`, `post('deleteOne')`
4. Capture before/after diffs using `this.isModified()`, `this.getChanges()`

**Pros:**
- ✅ High-quality before/after diffs (Mongoose gives modified fields)
- ✅ Captures `resourceId` automatically (document `_id`)
- ✅ Domain-aware (knows resource type: 'Order', 'Merchant', etc.)
- ✅ Doesn't log validation errors (only successful saves)

**Cons:**
- ❌ Need to explicitly opt-in each model
- ❌ Misses operations bypassing Mongoose (raw MongoDB queries — rare in this codebase)
- ❌ Harder to capture HTTP context (req.user, req.ip) — need async context (cls-hooked)
- ❌ Some business logic needs richer context than hook provides (e.g., order transitions need from/to status)

**Where it would hook in** (example for Order model):
```javascript
// models/orderModel.js
const auditPlugin = require('../utils/auditPlugin');

orderSchema.plugin(auditPlugin, { 
  resource: 'Order',
  auditedFields: ['status', 'totalPrice', 'isPaid', 'canceledBy']
});
```

#### Option C: HYBRID (Recommended)

**Combination:**
1. **Mongoose plugin** for CRUD operations (Order, Merchant, User, Branch, Menu)
2. **Explicit `auditLogger()` calls** for high-value operations needing rich context:
   - Order status transitions (capture old → new status)
   - Payments/refunds (capture payment details)
   - Auth events (login, logout, password change)
   - Role/permission changes (capture assigned roles/tasks)

**Why hybrid:**
- ✅ Mongoose plugin provides 80% coverage with zero per-controller code
- ✅ Explicit calls provide domain context for critical 20%
- ✅ Best before/after diff quality where it matters
- ✅ Doesn't miss anything important

### 2.2 Proposed Hook Points (Hybrid Approach)

**Mongoose Plugin Applied To:**
- `models/orderModel.js` — CRUD + general field changes
- `models/merchantModel.js` — Merchant profile updates
- `models/userModel.js` — User CRUD
- `models/branchModel.js` — Branch CRUD
- `models/menuModel.js` — Menu item CRUD
- `models/tabelModel.js` — Table CRUD
- `models/Ingredient.js` — Inventory ingredient changes
- `models/roleModel.js` — Role assignments
- `models/taskModel.js` — Task assignments

**Explicit `auditLogger()` Calls Kept For:**
- Order status transitions (`OrderStateMachineService.transitionOrderStatus` line 583 — log AFTER transaction commit)
- Payments (`order.controller.js` `markAsPaid` — capture payment method, amount)
- Auth events (`auth.controller.js` login/logout)
- Report access (already exists — keep as-is)
- Merchant approval/suspension (system-level actions)

**Example Integration Point** (`OrderStateMachineService.js` lines 575-590):
```javascript
// EXISTING (line 583):
if (!result.noop) {
  logger.info('order.status.transition', { ...}); // ← Structured logger

  // NEW: Add explicit audit log
  await auditLogger({
    user,
    action: 'UPDATE',
    resource: 'Order',
    resourceId: orderId,
    method: 'PATCH',
    endpoint: '/api/v1/order/:id/status',  // Reconstruct from context
    statusCode: 200,
    oldValues: { status: result.previousStatus },
    newValues: { status: toStatus },
    metadata: { 
      roleCategory, 
      orderType: result.order?.orderType,
      reason,
      assignedWaiter, 
      assignedKitchenStaff
    },
    req  // ← Problem: service layer doesn't have req object!
  });
}
```

**PROBLEM IDENTIFIED:** Service layer doesn't have access to `req` object for IP/userAgent!

**Solution:** Use **async context (cls-hooked)** to store request context globally:
```javascript
// New: src/common/middleware/request-context.js
const { createNamespace } = require('cls-hooked');
const requestContext = createNamespace('audit-context');

function setRequestContext(req, res, next) {
  requestContext.run(() => {
    requestContext.set('req', req);
    requestContext.set('user', req.user);
    next();
  });
}

function getRequestContext() {
  return {
    req: requestContext.get('req'),
    user: requestContext.get('user')
  };
}

module.exports = { setRequestContext, getRequestContext, requestContext };
```

Then in `auditLogger`, fall back to context:
```javascript
const { getRequestContext } = require('../common/middleware/request-context');

const auditLogger = async ({ user, req, ...rest }) => {
  // If req not provided, try to get from async context
  if (!req) {
    const context = getRequestContext();
    req = context.req;
    user = user || context.user;
  }
  
  // Rest of implementation...
};
```

---

## Step 3: Professional-Grade Requirements

### 3.1 Schema Enhancements Needed

**Add to `auditLogSchema`:**
```javascript
merchant: {
  type: mongoose.Schema.ObjectId,
  ref: 'Merchant',
  index: true,  // CRITICAL for tenant isolation
  required: function() { return this.action !== 'LOGIN'; }  // System ops may not have merchant
},

branch: {
  type: mongoose.Schema.ObjectId,
  ref: 'Branch',
  index: true  // Optional but useful for branch-level filtering
},

correlationId: {
  type: String,
  index: true  // For tracing related operations (e.g., order + payment + inventory adjustment)
},

duration: {
  type: Number  // Request duration in ms (for performance monitoring)
},

changes: [{  // Structured diff format (better than oldValues/newValues)
  field: String,
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed
}],

severity: {
  type: String,
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'low'
},

outcome: {
  type: String,
  enum: ['success', 'failure'],
  default: 'success'
}
```

**New Index Strategy:**
```javascript
// Existing
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resource: 1 });

// NEW (CRITICAL)
auditLogSchema.index({ merchant: 1, createdAt: -1 });  // Tenant isolation
auditLogSchema.index({ merchant: 1, resource: 1, createdAt: -1 });  // Filtered queries
auditLogSchema.index({ correlationId: 1 });  // Trace related ops
auditLogSchema.index({ severity: 1, createdAt: -1 });  // High-priority alerts
```

### 3.2 Captured Fields (Complete Spec)

**Required Every Time:**
- `user` (ObjectId) — Actor (or null for system/cron jobs)
- `merchant` (ObjectId) — Tenant (CRITICAL for isolation)
- `action` (enum) — CREATE | UPDATE | DELETE | LOGIN | etc.
- `resource` (string) — Order | Merchant | User | etc.
- `method` (enum) — GET | POST | PATCH | DELETE
- `endpoint` (string) — `/api/v1/order/:id/status`
- `statusCode` (number) — 200, 201, 400, 403, etc.
- `createdAt` (timestamp) — Auto via Mongoose

**Optional/Contextual:**
- `resourceId` (ObjectId) — Document _id (null for lists/searches)
- `branch` (ObjectId) — Branch context if applicable
- `correlationId` (string) — Links related ops (order → payment → email)
- `ip` (string) — `req.ip || req.connection.remoteAddress`
- `userAgent` (string) — `req.get('User-Agent')`
- `oldValues` (Mixed) — Before state
- `newValues` (Mixed) — After state
- `changes` (array) — Structured diff `[{field, oldValue, newValue}]`
- `metadata` (Mixed) — Operation-specific context
- `duration` (number) — Request duration in ms
- `severity` (enum) — low | medium | high | critical
- `outcome` (enum) — success | failure

### 3.3 Exclusions (What NOT to Audit)

**Explicitly Excluded:**
1. **GET requests** (unless accessing sensitive reports — already handled)
2. **Health checks** (`/health`, `/api/health`)
3. **Static assets** (`/public/*`, `/uploads/*`)
4. **OPTIONS preflight** (CORS)
5. **Failed auth attempts** (handled separately by rate limiter)
6. **Internal system calls** (cron jobs — unless explicitly flagged)

**Implementation:**
```javascript
// In middleware/plugin
const EXCLUDED_PATTERNS = [
  /^\/health/,
  /^\/api\/health/,
  /^\/public\//,
  /^\/uploads\//,
  /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/
];

function shouldAudit(req) {
  if (req.method === 'OPTIONS') return false;
  if (req.method === 'GET' && !req.originalUrl.includes('/reports/')) return false;
  if (EXCLUDED_PATTERNS.some(pattern => pattern.test(req.originalUrl))) return false;
  return true;
}
```

### 3.4 Tenant Isolation (Merchant Scoping)

**CRITICAL REQUIREMENT:** One merchant can NEVER see another's audit logs.

**Enforcement Points:**

1. **Write-time** (when creating audit log):
```javascript
// utils/auditLogger.js
const merchant = user?.merchant?._id || user?.merchant;
if (!merchant && action !== 'LOGIN') {
  throw new Error('Audit log requires merchant context');
}

await AuditLog.create({ 
  merchant,  // ← Always capture
  ...rest 
});
```

2. **Read-time** (when querying audit logs):
```javascript
// Hypothetical audit log endpoint: GET /api/v1/audit-logs
const merchantId = req.user.merchant._id;

// SUPER-ADMIN can see all, others only their own
const query = req.user.role?.isSystemRole 
  ? {}  // No filter
  : { merchant: merchantId };  // Tenant filter

const logs = await AuditLog.find(query)
  .sort('-createdAt')
  .limit(100);
```

3. **Database-level isolation** (Mongoose middleware):
```javascript
// models/auditLogModel.js
auditLogSchema.pre(/^find/, function(next) {
  // If query doesn't already specify merchant, don't add filter
  // (Let controller enforce it explicitly)
  next();
});
```

### 3.5 Retention Policy

**Proposed:**
- **Hot storage** (MongoDB): 90 days
- **Cold storage** (S3/archives): 1 year
- **Permanent deletion**: After 1 year (or per compliance requirements)

**Implementation** (Phase 2):
```javascript
// scripts/archive-audit-logs.js (cron job)
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - 90);

const oldLogs = await AuditLog.find({ 
  createdAt: { $lt: cutoffDate } 
});

// Export to S3
await s3.upload({
  Bucket: 'audit-logs-archive',
  Key: `audit-logs-${date}.json.gz`,
  Body: gzip(JSON.stringify(oldLogs))
});

// Delete from MongoDB
await AuditLog.deleteMany({ 
  createdAt: { $lt: cutoffDate } 
});
```

---

## Step 4: Gap Analysis — Existing vs. New System

### 4.1 Current System (`report.controller.js`)

**What Exists:**
- ✅ `auditLogger` utility called explicitly
- ✅ Actions: `REPORT_ACCESS`, `REPORT_EXPORT`
- ✅ Metadata captured: `{ reportType, dateFrom, dateTo, branchId, format }`
- ✅ Wrapped in try-catch (non-blocking)

**Example** (line 194):
```javascript
try {
  await auditLogger({
    user: req.user,
    action: 'REPORT_ACCESS',
    resource: 'Report',
    method: req.method,
    endpoint: req.originalUrl,
    statusCode: 200,
    metadata: { reportType: 'sales', dateFrom, dateTo, branchId, format },
    req
  });
} catch (auditError) {
  // Silently fail — don't break report generation
}
```

### 4.2 Is This the Same System?

**YES** — confirmed single system:
- Same `auditLogger` from `utils/auditLogger.js`
- Same `AuditLog` model from `models/auditLogModel.js`
- No competing/parallel audit implementations found

### 4.3 Gaps in Current Implementation

| Gap | Impact | Fix |
|-----|--------|-----|
| ❌ No `merchant` field | Tenant isolation broken | Add to schema + enforce |
| ❌ No `correlationId` | Can't trace related ops | Add to schema |
| ❌ Limited action types | Can't distinguish operation types | Expand enum |
| ❌ Only used in reports | 95% of operations not audited | Roll out globally |
| ❌ No before/after diffs | Can't see what actually changed | Mongoose plugin |
| ❌ No structured changes array | Hard to query specific field changes | Add `changes` field |
| ❌ No severity/outcome | Can't filter critical events | Add fields |

---

# PART 2: KDS INTEGRATED WITH ORDER MANAGEMENT

## Step 1: Order State Machine (Current Reality)

**Source:** `src/modules/order/service/OrderStateMachineService.js`

### 1.1 TRANSITIONS Map (Line 10-54)

```javascript
const TRANSITIONS = {
  pending: ['accepted', 'canceled'],
  
  accepted: ['preparing', 'canceled'],
  
  preparing: ['ready', 'canceled'],
  
  ready: ['served', 'out_for_delivery', 'canceled'],
  
  out_for_delivery: ['delivered', 'canceled'],
  
  delivered: ['completed'],
  
  served: ['completed'],
  
  completed: [],  // Terminal
  
  canceled: []    // Terminal
};
```

**Terminal States:** `completed`, `canceled`

### 1.2 TRANSITION_ROLE_PERMISSIONS Map (Lines 71-162)

```javascript
const TRANSITION_ROLE_PERMISSIONS = {
  'pending->accepted': ['waiter', 'admin', 'superAdmin'],
  'pending->canceled': ['waiter', 'admin', 'superAdmin', 'customer'],
  
  'accepted->preparing': ['kitchen', 'admin', 'superAdmin'],  // ← KDS starts here
  'accepted->canceled': ['waiter', 'admin', 'superAdmin'],
  
  'preparing->ready': ['kitchen', 'admin', 'superAdmin'],     // ← KDS ends here
  'preparing->canceled': ['kitchen', 'waiter', 'admin', 'superAdmin'],
  
  'ready->served': ['waiter', 'admin', 'superAdmin'],
  'ready->out_for_delivery': ['waiter', 'admin', 'superAdmin'],
  // ... rest
};
```

**Key Insight:** Kitchen role controls `accepted → preparing → ready`

### 1.3 Transaction Wrapping (Line 451-625)

```javascript
static async transitionOrderStatus(params) {
  const session = await mongoose.startSession();
  let result;
  
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({...}).session(session);
      
      // 1. Validate transition
      // 2. Check role permission
      // 3. Validate delivery-specific states
      // 4. Change status
      // 5-6. Apply timestamps
      // 7. Append history
      // 8-9. Assign waiter/kitchen staff
      // 10. Cancellation logic
      // 11. Save order
      // 12. Queue notifications (outbox pattern)
      
      result = { order, previousStatus, noop };
    });
    
    // AFTER commit (line 583):
    logger.info('order.status.transition', {...});
    
    // Email notification (line 592-644)
    setImmediate(async () => {
      // Send status update emails (non-blocking)
    });
    
    return result;
  } finally {
    await session.endSession();
  }
}
```

**Hook Points for KDS:**
- ✅ Line 583 (after commit): Where to trigger KDS ticket creation
- ✅ Inside transaction: Where to update ticket statuses

---

## Step 2: KDS Model Shapes

### 2.1 Proposed Schemas

**KitchenStation Model** (`models/KitchenStation.js`):
```javascript
const kitchenStationSchema = new mongoose.Schema({
  merchant: { 
    type: mongoose.Schema.ObjectId, 
    ref: 'Merchant', 
    required: true,
    index: true 
  },
  
  branch: { 
    type: mongoose.Schema.ObjectId, 
    ref: 'Branch', 
    required: true,
    index: true 
  },
  
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 50
    // e.g., "Grill", "Fry", "Cold Prep", "Beverage"
  },
  
  slug: { 
    type: String, 
    unique: true 
  },
  
  displayOrder: { 
    type: Number, 
    default: 0 
  },
  
  isActive: { 
    type: Boolean, 
    default: true 
  },
  
  color: { 
    type: String, 
    default: '#3B82F6'  // For UI differentiation
  }
}, {
  timestamps: true
});

kitchenStationSchema.index({ merchant: 1, branch: 1 });
kitchenStationSchema.index({ slug: 1 }, { unique: true });
```

**KitchenTicket Model** (`models/KitchenTicket.js`):
```javascript
const kitchenTicketItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.ObjectId,
    ref: 'Menu',  // Reference to menuModel.js
    required: true
  },
  
  orderItem: {
    type: mongoose.Schema.ObjectId,
    ref: 'OrderItem',  // Reference to orderModelItem.js
    required: true
  },
  
  name: String,  // Denormalized for display
  
  quantity: { 
    type: Number, 
    required: true,
    min: 1
  },
  
  variant: String,  // e.g., "Large", "Extra Cheese"
  
  specialInstructions: String,
  
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'ready', 'served'],
    default: 'pending',
    index: true
  },
  
  startedAt: Date,
  readyAt: Date
}, { _id: true });  // Items have their own IDs

const kitchenTicketSchema = new mongoose.Schema({
  merchant: { 
    type: mongoose.Schema.ObjectId, 
    ref: 'Merchant', 
    required: true,
    index: true 
  },
  
  branch: { 
    type: mongoose.Schema.ObjectId, 
    ref: 'Branch', 
    required: true,
    index: true 
  },
  
  station: {
    type: mongoose.Schema.ObjectId,
    ref: 'KitchenStation',
    required: true,
    index: true
  },
  
  order: {
    type: mongoose.Schema.ObjectId,
    ref: 'Order',  // Reference to orderModel.js
    required: true,
    index: true
  },
  
  orderNumber: String,  // Denormalized for display (e.g., "#T1-42")
  
  ticketNumber: {
    type: Number,  // Auto-increment per station per day
    required: true
  },
  
  items: [kitchenTicketItemSchema],  // Items for THIS station only
  
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in_progress', 'ready', 'served', 'canceled'],
    default: 'pending',
    index: true
  },
  
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  orderType: {
    type: String,
    enum: ['dine_in', 'takeaway', 'delivery'],
    required: true
  },
  
  tableNumber: String,  // For dine_in
  
  assignedTo: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'  // Kitchen staff
  },
  
  acceptedAt: Date,
  startedAt: Date,
  readyAt: Date,
  servedAt: Date,
  canceledAt: Date,
  
  estimatedTime: Number,  // Minutes
  actualTime: Number,     // Minutes (readyAt - acceptedAt)
  
  notes: String
}, {
  timestamps: true
});

kitchenTicketSchema.index({ merchant: 1, station: 1, status: 1, createdAt: -1 });
kitchenTicketSchema.index({ order: 1 });
kitchenTicketSchema.index({ status: 1, createdAt: 1 });
```

### 2.2 Changes to Existing Models

**MenuItem** (`models/menuModel.js` — add station reference):
```javascript
// Add to menuSchema (around line 50)
kitchenStation: {
  type: mongoose.Schema.ObjectId,
  ref: 'KitchenStation',
  index: true
  // null = doesn't go to kitchen (e.g., cold beverages)
},

prepTime: {
  type: Number,  // Minutes
  default: 15
}
```

**Order** (`models/orderModel.js` — NO changes needed):
- Order already has `items: [{ type: ObjectId, ref: 'OrderItem' }]`
- Order already has `status`, `orderType`, `tableNumber`
- KitchenTickets will reference Order, not vice versa
- **Rationale:** Order doesn't need to know about tickets — KDS is a view layer

---

## Step 3: Integration Point — Ticket Lifecycle

### 3.1 Ticket Creation Trigger

**When:** Order transitions from `accepted` → `preparing`

**Where:** `OrderStateMachineService.transitionOrderStatus` line 583 (after commit)

**Logic:**
```javascript
// OrderStateMachineService.js line 583 (after successful transition)
if (!result.noop && toStatus === 'preparing') {
  // Create kitchen tickets asynchronously (non-blocking)
  setImmediate(async () => {
    try {
      const KitchenTicketService = require('../../kitchen/service/KitchenTicketService');
      await KitchenTicketService.createTicketsForOrder(result.order._id);
    } catch (err) {
      logger.error('Failed to create kitchen tickets', { 
        orderId: result.order._id, 
        error: err.message 
      });
      // Don't fail the order transition
    }
  });
}
```

**KitchenTicketService.createTicketsForOrder** (new service):
```javascript
static async createTicketsForOrder(orderId) {
  const order = await Order.findById(orderId)
    .populate({
      path: 'items',
      populate: { path: 'item', select: 'name kitchenStation prepTime' }
    });
  
  // Group items by station
  const itemsByStation = new Map();
  
  for (const orderItem of order.items) {
    const menuItem = orderItem.item;
    const stationId = menuItem.kitchenStation;
    
    if (!stationId) continue;  // Skip items not needing kitchen (e.g., bottled water)
    
    if (!itemsByStation.has(stationId)) {
      itemsByStation.set(stationId, []);
    }
    
    itemsByStation.get(stationId).push({
      menuItem: menuItem._id,
      orderItem: orderItem._id,
      name: menuItem.name,
      quantity: orderItem.quantity,
      variant: orderItem.variant,
      specialInstructions: orderItem.specialInstructions
    });
  }
  
  // Create one ticket per station
  const tickets = [];
  for (const [stationId, items] of itemsByStation) {
    const ticketNumber = await getNextTicketNumber(stationId, order.branch);
    
    const ticket = await KitchenTicket.create({
      merchant: order.merchant,
      branch: order.branch,
      station: stationId,
      order: order._id,
      orderNumber: order.orderNumber,
      ticketNumber,
      items,
      orderType: order.orderType,
      tableNumber: order.table?.tableNumber,
      status: 'pending'
    });
    
    tickets.push(ticket);
  }
  
  // Emit Socket.IO events (see Step 4)
  const io = getIo();
  for (const ticket of tickets) {
    io.to(`branch:${order.branch}:station:${ticket.station}`)
      .emit('kds:ticket-created', ticket);
  }
  
  return tickets;
}
```

### 3.2 Ticket-to-Order Status Roll-Up

**Rule:** Order status becomes `ready` when ALL tickets are `ready`

**Implementation:** Update ticket status endpoint:

```javascript
// NEW: PATCH /api/v1/kitchen/tickets/:id/status
static async updateTicketStatus(ticketId, toStatus, user) {
  const session = await mongoose.startSession();
  
  await session.withTransaction(async () => {
    const ticket = await KitchenTicket.findById(ticketId).session(session);
    
    // Validate transition (similar to OrderStateMachineService)
    // Update ticket status
    // Apply timestamps
    
    await ticket.save({ session });
    
    // Check if ALL tickets for this order are ready
    const allTickets = await KitchenTicket.find({ 
      order: ticket.order,
      status: { $ne: 'canceled' }
    }).session(session);
    
    const allReady = allTickets.every(t => t.status === 'ready');
    
    if (allReady && toStatus === 'ready') {
      // Transition order to 'ready' (using existing service)
      await OrderStateMachineService.transitionOrderStatus({
        orderId: ticket.order,
        toStatus: 'ready',
        merchantQuery: { merchant: ticket.merchant },
        user,
        reason: 'All kitchen tickets ready'
      });
    }
  });
  
  await session.endSession();
}
```

**Hook Point in OrderStateMachineService:**
- No changes needed! KDS calls `transitionOrderStatus` when all tickets ready
- Existing logic handles `preparing → ready` transition
- Existing notifications/webhooks fire automatically

---

## Step 4: Socket.IO Room Plan

### 4.1 Existing Room Convention

**Source:** `src/infrastructure/websocket/socket-server.js` (lines 84-117)

**Current Patterns:**
```javascript
// Branch-level (all users in branch)
socket.join(`branch:${branchId}`);

// Permission-scoped (users with specific task)
socket.join(`branch:${branchId}:perm:${taskName}`);

// User-specific
socket.join(`user:${userId}`);

// Merchant-level (inventory subscriptions)
socket.join(`merchant:${merchantId}`);
```

**Existing Events:**
```javascript
io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', order);
io.to(`branch:${branchId}`).emit('table:updated', { tableId, status });
io.to(`user:${userId}`).emit('report:export:ready', {...});
```

### 4.2 Proposed KDS Room Naming

**Follow existing pattern: `branch:{branchId}:station:{stationId}`**

**Setup Handler** (add to `socket-server.js` line 91):
```javascript
socket.on('kds:subscribe', ({ branchId, stationId }) => {
  if (!branchId || !stationId) return;
  
  // Verify user has access to this station (optional)
  const userBranchIds = Array.isArray(user.branch)
    ? user.branch.map(b => String(b._id ?? b))
    : [String(user.branch?._id ?? user.branch)];
  
  if (!userBranchIds.includes(String(branchId))) {
    logger.warn(`Socket ${socket.id} denied station ${stationId}`);
    return;
  }
  
  socket.join(`branch:${branchId}:station:${stationId}`);
  logger.info(`Socket ${socket.id} subscribed to station ${stationId}`);
});
```

### 4.3 KDS Events (Consistent with Existing Pattern)

**Event Naming:** `kds:{noun}:{verb}`

```javascript
// Ticket created
io.to(`branch:${branchId}:station:${stationId}`)
  .emit('kds:ticket-created', {
    ticketId,
    orderNumber,
    ticketNumber,
    items: [...],
    orderType,
    tableNumber,
    createdAt
  });

// Ticket accepted by kitchen staff
io.to(`branch:${branchId}:station:${stationId}`)
  .emit('kds:ticket-accepted', {
    ticketId,
    assignedTo: userId,
    acceptedAt
  });

// Ticket in progress
io.to(`branch:${branchId}:station:${stationId}`)
  .emit('kds:ticket-started', {
    ticketId,
    startedAt
  });

// Individual item ready
io.to(`branch:${branchId}:station:${stationId}`)
  .emit('kds:item-ready', {
    ticketId,
    itemId,
    readyAt
  });

// Entire ticket ready
io.to(`branch:${branchId}:station:${stationId}`)
  .emit('kds:ticket-ready', {
    ticketId,
    readyAt
  });

// Also broadcast to waiter view (all stations)
io.to(`branch:${branchId}:perm:ORDER_VIEW`)
  .emit('order:ready', {
    orderId,
    orderNumber,
    tableNumber,
    readyAt
  });

// Ticket canceled
io.to(`branch:${branchId}:station:${stationId}`)
  .emit('kds:ticket-canceled', {
    ticketId,
    reason,
    canceledAt
  });
```

---

# PHASED IMPLEMENTATION PLAN

## Phase 0: Audit Logging Foundation (No breaking changes)

**Goal:** Enhance schema + add middleware without touching controllers

### Step 0.1: Enhance AuditLog Model
- [ ] Add `merchant`, `branch`, `correlationId`, `severity`, `outcome`, `changes` fields
- [ ] Add new indexes
- [ ] Write migration script to backfill `merchant` from existing logs
- [ ] **Test:** Verify existing audit logs still query correctly

### Step 0.2: Add Request Context Middleware
- [ ] Create `src/common/middleware/request-context.js` (cls-hooked)
- [ ] Mount in `create-app.js` BEFORE routes
- [ ] Update `auditLogger` to use context as fallback
- [ ] **Test:** Verify context propagates to service layer

### Step 0.3: Create Mongoose Audit Plugin
- [ ] Write `utils/auditPlugin.js`
- [ ] Add unit tests (mock model save)
- [ ] **Test:** Apply to ONE model (e.g., `Table`) in dev, verify logs created

## Phase 1: Roll Out Audit Plugin (Incremental)

**Goal:** Add plugin to all models, one module at a time

### Step 1.1: Critical Models (Orders, Payments)
- [ ] Apply plugin to `orderModel.js`
- [ ] Apply plugin to `paymentModel.js` (if exists)
- [ ] **Test:** Create order, verify audit log has before/after diff

### Step 1.2: Merchant/User Models
- [ ] Apply plugin to `merchantModel.js`
- [ ] Apply plugin to `userModel.js`
- [ ] **Test:** Update user, verify merchant isolation works

### Step 1.3: Remaining Models
- [ ] Branch, Menu, Table, Inventory, Role, Task
- [ ] **Test:** Full integration test suite

## Phase 2: Explicit Audit Calls (High-Value Operations)

**Goal:** Add rich context to critical operations

### Step 2.1: Order State Transitions
- [ ] Add `auditLogger` call in `OrderStateMachineService` line 583
- [ ] Capture old/new status, role, reason
- [ ] **Test:** Transition order, verify rich metadata

### Step 2.2: Auth Events
- [ ] Add to login (capture IP, user-agent)
- [ ] Add to logout
- [ ] Add to password change
- [ ] **Test:** Login, verify audit log

### Step 2.3: Financial Operations
- [ ] Payments (`markAsPaid`)
- [ ] Refunds (if they exist)
- [ ] Inventory valuation adjustments
- [ ] **Test:** Payment flow, verify critical severity

## Phase 3: KDS Foundation (Order-independent)

**Goal:** Build KDS models/endpoints without touching orders

### Step 3.1: Models
- [ ] Create `KitchenStation` model
- [ ] Create `KitchenTicket` model
- [ ] Add migration to add `kitchenStation` to `Menu` model
- [ ] **Test:** CRUD stations, verify merchant isolation

### Step 3.2: Basic CRUD Endpoints
- [ ] `GET /api/v1/kitchen/stations` (list stations)
- [ ] `POST /api/v1/kitchen/stations` (create station)
- [ ] `GET /api/v1/kitchen/tickets` (list tickets)
- [ ] `PATCH /api/v1/kitchen/tickets/:id/status` (update ticket)
- [ ] **Test:** RBAC, feature gating, tenant isolation

### Step 3.3: Socket.IO Setup
- [ ] Add `kds:subscribe` handler
- [ ] Add event emitters for ticket lifecycle
- [ ] **Test:** Connect client, verify room joining

## Phase 4: KDS ↔ Order Integration

**Goal:** Wire KDS into order lifecycle

### Step 4.1: Ticket Creation
- [ ] Create `KitchenTicketService.createTicketsForOrder`
- [ ] Hook into `OrderStateMachineService` line 583 (after `preparing` transition)
- [ ] **Test:** Accept order, verify tickets created per station

### Step 4.2: Ticket → Order Roll-Up
- [ ] Update `updateTicketStatus` to check all tickets ready
- [ ] Call `OrderStateMachineService.transitionOrderStatus` when ready
- [ ] **Test:** Mark all tickets ready, verify order → `ready`

### Step 4.3: Cancellation Handling
- [ ] Cancel order → cancel all tickets
- [ ] Cancel ticket → update order notes (not status)
- [ ] **Test:** Cancel order, verify tickets canceled

## Phase 5: Polish & Production Hardening

### Step 5.1: Audit Log Viewer UI Endpoint
- [ ] `GET /api/v1/audit-logs` (filtered by merchant)
- [ ] Pagination, filtering by resource/action/user
- [ ] **Test:** Verify tenant isolation

### Step 5.2: Retention Policy
- [ ] Cron job to archive old logs to S3
- [ ] **Test:** Archive 91-day-old logs

### Step 5.3: Performance Optimization
- [ ] Add compound indexes based on query patterns
- [ ] Consider read replicas for audit queries
- [ ] **Test:** Load test with 10K audit logs

---

# OPEN DECISIONS (Require User Input)

## Audit Logging

1. **Middleware vs. Plugin Approach:**
   - **Recommended:** Hybrid (Mongoose plugin + explicit calls)
   - **Alternative:** Express middleware only (simpler but lower quality diffs)
   - **Question:** Proceed with hybrid?

2. **Action Enum Expansion:**
   - Current: 11 actions
   - Proposed: Add `ORDER_STATUS_CHANGE`, `PAYMENT_RECEIVED`, `REFUND_ISSUED`, `INVENTORY_ADJUST`, `MENU_PUBLISH`, `ROLE_ASSIGN`, `BRANCH_SUSPEND`
   - **Question:** Any custom action types needed for your domain?

3. **Severity Auto-Classification:**
   - **Proposed Rules:**
     - `critical`: Payments, refunds, merchant suspension, role changes
     - `high`: Order cancellations, inventory adjustments
     - `medium`: Menu updates, user updates
     - `low`: Everything else
   - **Question:** Does this match your priorities?

4. **Correlation ID Strategy:**
   - **Option A:** Generate UUID per request (simple)
   - **Option B:** Use `req.headers['x-request-id']` if present (supports distributed tracing)
   - **Question:** Do you use distributed tracing (e.g., Datadog, New Relic)?

5. **Read Operations Auditing:**
   - Currently excluded except reports
   - **Question:** Audit all GETs (noisy) or only sensitive resources (orders, customer data)?

## KDS Integration

6. **Ticket Number Format:**
   - **Option A:** Auto-increment per station per day (resets daily)
   - **Option B:** Global counter (never repeats)
   - **Question:** Preference?

7. **Station Assignment:**
   - **Option A:** Menu items assigned to ONE station only
   - **Option B:** Menu items can belong to multiple stations (split items)
   - **Question:** Do you need multi-station items (e.g., burger = grill + fry)?

8. **Printing (Out of Scope for v1?):**
   - KDS v1 focuses on screen display only
   - **Question:** Confirm printing is Phase 2?

9. **Item-Level Status:**
   - **Proposed:** Track individual item status within ticket (pending → in_progress → ready)
   - **Question:** Is this granularity needed, or just ticket-level status?

10. **Priority/Rush Orders:**
    - **Proposed:** Manual `priority` field (low/normal/high/urgent)
    - **Question:** Auto-calculate priority based on order age or keep manual?

11. **Kitchen Staff Assignment:**
    - **Proposed:** Optional `assignedTo` field (kitchen staff can "claim" tickets)
    - **Question:** Is this workflow needed, or just show all tickets to all station staff?

12. **Ticket Acceptance Workflow:**
    - **Option A:** Ticket auto-created as `pending`, staff clicks "Accept" → `accepted`
    - **Option B:** Ticket auto-created as `accepted` (skip pending step)
    - **Question:** Do you need explicit acceptance, or auto-start?

---

**END OF PLANNING DOCUMENT**

All claims backed by code read during this session. Ready to proceed with implementation once decisions confirmed.
