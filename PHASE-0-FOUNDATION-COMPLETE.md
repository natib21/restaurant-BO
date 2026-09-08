# Phase 0: Foundation Complete

## ✅ Changes Made (Independently Testable)

### 1. Order.items _id Enabled
**File:** `models/orderModel.js` line 17  
**Change:** `{ _id: false }` → `{ _id: true }`  
**Rationale:** 
- Verified safe across 28 usages (see BLOCKING-ISSUES-RESOLUTION.md)
- Enables KitchenTicketItem to reference specific order items
- No breaking changes to existing code

**Testing:**
```bash
# Test that order creation still works
POST /api/v1/orders
# Verify response includes item._id for each order item
```

---

### 2. Improved Audit Error Logging
**File:** `utils/auditLogger.js` lines 27-40  
**Change:** Replaced `console.error()` with structured `logger.error()` including:
- Full error stack
- User/resource/endpoint context
- `severity: 'CRITICAL'` flag for monitoring
- `impact: 'audit_trail_gap'` for alerting

**Rationale:**
- Audit failures are now visible in structured logs
- Severity flag enables external monitoring (Datadog, CloudWatch, etc.)
- Still doesn't crash app on audit failure

**Testing:**
```bash
# Temporarily break MongoDB connection, trigger audit write
# Verify structured error appears in logs with CRITICAL severity
```

---

### 3. Request Context Utility (AsyncLocalStorage)
**File:** `utils/request-context.js` (NEW)  
**Purpose:** Propagate user/correlation ID through async call chain without passing req everywhere

**API:**
- `initializeContext(req, res, next)` - Middleware to set up context
- `getCurrentUser()` - Get authenticated user anywhere
- `getCorrelationId()` - Get UUID correlation ID for tracing
- `getRequest()` - Get original Express req object
- `setUser(user)` - Update context with authenticated user

**Rationale:**
- Native Node.js AsyncLocalStorage (no cls-hooked dependency)
- Enables auto-audit logging without explicit req passing
- Adds X-Correlation-ID header for distributed tracing

**Integration Point:** Will be added to `create-app.js` middleware chain in Phase 1

**Testing:**
```javascript
// Unit test for context propagation
const { initializeContext, getCurrentUser } = require('./utils/request-context');
// Simulate request flow, verify context available in nested async calls
```

---

### 4. KitchenStation Model
**File:** `models/KitchenStation.js` (NEW)  
**Schema:**
- `merchant`, `branch` refs (required)
- `name`, `code` (e.g., "GRILL", "SALAD")
- `isActive`, `displayOrder`
- Unique index on `branch + code`

**Rationale:**
- Single station per menu item (decided in defaults)
- Branch-specific station configuration
- Supports future multi-station items via array change

**Testing:**
```javascript
// Create test stations
KitchenStation.create({ merchant, branch, name: 'Grill', code: 'GRILL' })
// Verify unique constraint on branch+code
```

---

### 5. KitchenTicket Model
**File:** `models/KitchenTicket.js` (NEW)  
**Schema:**
- Links to Order, KitchenStation
- Embedded `items[]` with `orderItemId` (references Order.items[i]._id)
- Status: pending → in_progress → ready → canceled
- `ticketNumber` (e.g., "GRILL-42")
- `priority` (low/normal/high/urgent - manual for now)
- Optional `assignedTo` (kitchen staff)
- Timestamps: acceptedAt, startedAt, completedAt

**Item-level tracking:**
- Each ticket item has its own status (pending/in_progress/ready)
- Enables partial ticket completion

**Rationale:**
- Uses Counter model (already exists) for ticket numbering
- Item status tracking included (decided in defaults)
- No auto-acceptance workflow (pending your decision on flag)

**Indexes:**
- `station + status + createdAt` (active ticket queries)
- `order` (check all tickets for an order)
- `station + status + priority + createdAt` (dashboard with priority)

**Testing:**
```javascript
// Create ticket for order
// Verify ticketNumber format
// Test item-level status transitions
```

---

### 6. Menu.kitchenStation Field
**File:** `models/menuModel.js` line 142  
**Change:** Added `kitchenStation` ObjectId ref field (indexed, nullable)

**Rationale:**
- Single station per menu item (decided in defaults)
- Nullable - items without station won't generate kitchen tickets
- Can be set via menu management endpoints

**Migration:** Existing menu items will have `kitchenStation: null` (safe)

**Testing:**
```bash
# Update menu item with station
PATCH /api/v1/menu/:id { kitchenStation: stationId }
# Verify field saved and populated correctly
```

---

## 🚫 Intentionally NOT Included (Waiting for Decision)

### Ticket Acceptance Workflow
**Your default:** "Skip explicit 'Accept' step, auto-start pending→in_progress"

**My flag:** Your existing OrderStateMachineService has role-based permissions. Auto-starting tickets bypasses:
- Actor attribution (who gets credited in RBAC audit trail?)
- Permission checks for pending→in_progress transition

**Options:**
1. **Keep explicit acceptance** (matches existing RBAC pattern, single-click in UI)
2. **Auto-start with `system` actor** (bypass permissions, faster but loses attribution)

**Recommendation:** Option 1 for consistency with your existing architecture.

**Your call?**

---

## 📊 Database Impact

### New Collections:
- `kitchenstations` (low volume - one record per station per branch)
- `kitchentickets` (high write volume - one per station per order)

### Modified Collections:
- `orders.items[]` - now have `_id` (existing orders unchanged, only new orders affected)
- `menus` - added `kitchenStation` field (existing records have null)
- `counters` - will get new prefixes (GRILL, SALAD, etc.) but schema unchanged

### Index Changes:
- `menus` - new index on `kitchenStation` field
- `kitchentickets` - 3 new indexes (see model)

**Backward compatibility:** ✅ All changes are additive, no breaking changes

---

## 🧪 Recommended Testing Sequence

1. **Test Order.items _id generation**
   ```bash
   # Create new order, verify items have _id
   # Check existing order queries still work
   ```

2. **Test Audit Logger improvements**
   ```bash
   # Trigger audit write with bad MongoDB connection
   # Verify CRITICAL severity in structured logs
   ```

3. **Test Request Context (unit test)**
   ```javascript
   // Simulate async call chain
   // Verify context available at all depths
   ```

4. **Test KitchenStation CRUD**
   ```bash
   # Create station
   # Test unique constraint
   # List stations by branch
   ```

5. **Test Menu.kitchenStation assignment**
   ```bash
   # Update menu item with station
   # Verify populated correctly
   ```

6. **Test KitchenTicket creation (manual)**
   ```javascript
   // Create ticket with items referencing Order.items[i]._id
   // Verify ticketNumber generation
   ```

---

## 🔄 Next: Phase 1 Implementation Plan

Once you confirm the ticket acceptance decision, Phase 1 will add:

1. **Middleware Integration**
   - Add request-context middleware to create-app.js
   - Update auth middleware to call setUser()

2. **Global Audit Middleware**
   - Mongoose plugins for auto-audit on create/update
   - Severity auto-classification rules
   - Correlation ID integration

3. **KDS Service Layer**
   - KitchenTicketService (create, update, status transitions)
   - Integration with OrderStateMachineService via outbox events
   - Ticket numbering logic using Counter model

4. **Order → Ticket Creation**
   - Outbox event handler for order.accepted → create tickets
   - Station-based ticket splitting logic

5. **Ticket → Order Ready Roll-up**
   - Outbox event handler for all-tickets-ready → order.ready

6. **WebSocket Events**
   - Emit to station-specific rooms
   - Follow existing room pattern from socket-server.js

---

**Status:** ✅ Phase 0 Complete - Models and utilities ready for integration  
**Blocked by:** Ticket acceptance workflow decision (Accept step vs auto-start)  
**Ready when:** You confirm acceptance workflow choice

---

**Generated:** 2026-08-17  
**Files Created:** 3 (request-context.js, KitchenStation.js, KitchenTicket.js)  
**Files Modified:** 3 (orderModel.js, auditLogger.js, menuModel.js)  
**Breaking Changes:** None ✅
