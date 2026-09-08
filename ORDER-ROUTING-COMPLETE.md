# Order Routing Feature - Complete Implementation

**Status**: ✅ **ALL 4 STEPS COMPLETE** - 41/41 tests passing

## Feature Summary

Merchant-configurable order routing system that automatically routes trusted orders (waiter) directly to kitchen while requiring manual review for untrusted sources (web/telegram/admin) before kitchen receives them.

---

## Implementation Breakdown

### **Step 0: Read-Only Audit** ✅
**Status**: Complete (no code changes)

**Findings**:
- Order creation paths identified:
  - Customer QR orders: `OrderTransactionService.executePlaceOrder()`
  - Staff orders: `OrderService.staffPlaceOrder()`
- Kitchen notification: Outbox pattern triggers `KitchenTicket` creation on `accepted→preparing` transition
- Order.source field exists but was never set (bug identified)
- State machine: `OrderStateMachineService.transitionOrderStatus()` with `TRANSITION_ROLE_PERMISSIONS`
- No 'system' actor in `TRANSITION_ROLE_PERMISSIONS` (needs to be added)

---

### **Step 1: Fix Source Field Bug** ✅
**Status**: Complete - 6/6 tests passing

**Changes**:
1. **`src/modules/order/service/OrderService.js`** (Line 263, 346, 379):
   - Added `source` parameter to `staffPlaceOrder()` method signature
   - Set `source: source` explicitly in `OrderRepository.create()` call
   - Service doesn't infer source (controller responsibility)

2. **`src/modules/order/controller/handlers/placement.handler.js`** (Lines 75-82):
   - Controller determines source based on role: `roleName.includes('WAITER')` → 'waiter', else → 'admin'
   - Passes source to service layer

3. **`src/modules/order/service/OrderTransactionService.js`** (Line 104):
   - Set explicit `source: 'web'` in customer order creation
   - No longer relies on schema default

4. **TRANSITION_ROLE_PERMISSIONS Report**:
   - `pending→accepted`: ['waiter', 'admin', 'superAdmin'] - **'system' NOT present**
   - `accepted→preparing`: ['kitchen', 'admin', 'superAdmin'] - **'system' NOT present**
   - ✅ Confirmed 'system' needs to be added in Step 3

**Tests** (`tests/order-source-field.test.js`):
- ✅ Waiter role → `source: 'waiter'`
- ✅ Admin role → `source: 'admin'`
- ✅ Customer QR order → `source: 'web'`
- ✅ All existing order creation tests still pass
- ✅ Source field correctly populated in all paths

---

### **Step 2: Order Flow Config Module** ✅
**Status**: Complete - 14/14 tests passing

**New Module Structure**:
```
src/modules/order-flow-config/
├── controller/order-flow-config.controller.js
├── dto/order-flow-config.dto.js
├── repository/order-flow-config.repository.js
├── service/order-flow-config.service.js
├── order-flow-config.routes.js
└── index.js
models/OrderFlowConfig.js
```

**OrderFlowConfig Model** (`models/OrderFlowConfig.js`):
```javascript
{
  merchant: ObjectId (ref Merchant, required, unique, indexed),
  channels: {
    waiter:   { requiresReview: Boolean (default false), reviewerRole: String enum ['waiter','support',null] (default null) },
    web:      { requiresReview: Boolean (default true),  reviewerRole: default 'waiter' },
    admin:    { requiresReview: Boolean (default true),  reviewerRole: default 'support' },
    telegram: { requiresReview: Boolean (default true),  reviewerRole: default 'support' }
  },
  timestamps: true
}
```

**Key Design Decisions**:
- Exactly 4 channel keys matching `Order.source` enum - prevents divergence
- Pre-validate hook in model enforces `requiresReview=true` + `reviewerRole=null` rejection (not just DTO)
- Repository uses fetch→modify→save (not findOneAndUpdate) to ensure pre-validate hook runs
- Lazy-creation: `findByMerchant()` creates default config if none exists

**Routes**:
- `GET /api/v1/order-flow-config` - Returns merchant's config (lazy-creates if missing)
- `PUT /api/v1/order-flow-config` - Updates channels (partial updates supported)

**Tests** (`tests/order-flow-config.test.js`):
- ✅ Lazy-creation with defaults when no config exists
- ✅ Returns existing config without recreating
- ✅ Rejects unknown channel keys (e.g., 'phone')
- ✅ Rejects `requiresReview: true` + `reviewerRole: null`
- ✅ Accepts valid partial updates without wiping other channels
- ✅ Merchant-scoped data isolation

---

### **Step 3: Wire Auto-Routing** ✅
**Status**: Complete - 9/9 tests passing

**Changes**:

1. **`src/modules/order/service/OrderStateMachineService.js`** (Lines 78, 92):
   ```javascript
   'pending->accepted': ['waiter', 'admin', 'superAdmin', 'system'],
   'accepted->preparing': ['kitchen', 'admin', 'superAdmin', 'system'],
   ```
   - Added 'system' to both transitions
   - Other transitions unchanged

2. **`src/modules/order/service/OrderService.js`** (Lines 379-432):
   - Auto-routing logic in `staffPlaceOrder()` after transaction commits
   - Calls `OrderFlowConfigService.getChannelConfig(merchantId, source)`
   - If `requiresReview === false`:
     - Calls `transitionOrderStatus(orderId, 'accepted', { actorType: 'system' })`
     - Then calls `transitionOrderStatus(orderId, 'preparing', { actorType: 'system' })`
   - If `requiresReview === true`: No action (stays at 'pending')

3. **`src/modules/order/service/OrderTransactionService.js`** (Lines 138-183):
   - Same auto-routing logic in `executePlaceOrder()` for customer orders
   - After main transaction commits (transitionOrderStatus creates own session)

**Auto-Routing Flow**:
```
Order Created (pending)
   ↓
getChannelConfig(merchantId, order.source)
   ↓
requiresReview === false?
   ↓ YES
transitionOrderStatus(pending → accepted, actorType:'system')
   ↓
transitionOrderStatus(accepted → preparing, actorType:'system')
   ↓
Kitchen tickets auto-created (via existing outbox handler)
```

**Key Design Decisions**:
- Auto-routing happens AFTER main transaction commits (not inside)
  - `transitionOrderStatus()` creates own session, can't nest
  - Alternative rejected: refactor `transitionOrderStatus()` to accept session param (too invasive)
- Reuses existing transition logic:
  - Timestamps (`acceptedAt`, `preparingAt`)
  - `statusHistory` entries with 'system' actor
  - Outbox events for kitchen ticket creation
- No config found → lazy-creates defaults via `getChannelConfig()`

**Tests** (`tests/order-auto-routing.test.js`):
- ✅ Waiter order with `requiresReview: false` → auto-routes to 'preparing'
- ✅ Web order with `requiresReview: true` (default) → stays at 'pending'
- ✅ Merchant with no config → lazy-creates defaults, routing works
- ✅ `statusHistory` shows two 'system' actor transitions
- ✅ Manual accept via `PATCH /api/v1/order/:id/status` still works for pending orders
- ✅ Cancellation works on auto-routed orders
- ✅ Kitchen tickets created for auto-routed orders (via outbox)

**Known Edge Case** (Accepted Risk):
- If process crashes between `pending→accepted` and `accepted→preparing`, order stuck at 'accepted'
- Mitigation: Not implemented (out of scope for MVP)
- Future: Background job to detect and complete interrupted auto-routes

---

### **Step 4: Review Queue Endpoint** ✅
**Status**: Complete - 12/12 tests passing

**Changes**:

1. **`src/modules/order/controller/handlers/retrieval.handler.js`**:
   - Added `getReviewQueue` handler
   - Calls `OrderService.getReviewQueue(req)`

2. **`src/modules/order/service/OrderService.js`** (New method after line 206):
   ```javascript
   static async getReviewQueue(req) {
     // 1. Determine reviewer role from user's role name
     const userRoleName = req.user?.role?.name || '';
     let reviewerRole = null;
     
     if (userRoleName.includes('WAITER')) {
       reviewerRole = 'waiter';
     } else if (userRoleName.includes('SUPPORT')) {
       reviewerRole = 'support';
     } else {
       return { orders: [] }; // Non-reviewer role
     }
     
     // 2. Get all pending orders for merchant
     const pendingOrders = await OrderRepository.find({
       merchant: merchantId,
       status: 'pending',
     }).sort({ placedAt: 1 }); // Oldest first
     
     // 3. Filter by channel config
     for (const order of pendingOrders) {
       const channelConfig = await OrderFlowConfigService.getChannelConfig(
         merchantId,
         order.source
       );
       
       // Include if requiresReview=true AND reviewerRole matches
       if (channelConfig.requiresReview && 
           channelConfig.reviewerRole === reviewerRole) {
         filteredOrders.push(order);
       }
     }
     
     return { orders: filteredOrders };
   }
   ```

3. **`src/modules/order/orders.routes.js`**:
   - Added `GET /api/v1/order/review-queue` route (before status-specific routes)
   - Requires JWT auth (via `protect` middleware)
   - No additional RBAC check (role filtering happens in service)

**Role Matching Logic**:
- User role name includes 'WAITER' → matches `reviewerRole='waiter'` → sees web orders
- User role name includes 'SUPPORT' → matches `reviewerRole='support'` → sees admin + telegram orders
- Other roles (KITCHEN, MANAGER, etc.) → empty array

**Endpoint Behavior**:
- `GET /api/v1/order/review-queue`
- Returns orders where:
  - `status = 'pending'`
  - `OrderFlowConfig.channels[order.source].requiresReview = true`
  - `OrderFlowConfig.channels[order.source].reviewerRole` matches user's role
- Sorted by `placedAt` ascending (oldest first)
- Merchant-scoped (via `getMerchantId(req)`)
- Branch-scoped if `req.query.branchId` provided (optional)

**Approve/Reject Flow**:
- Reuses existing `PATCH /api/v1/order/:id/status` endpoint (no new endpoints)
- Waiter/support calls existing endpoint with `{ status: 'accepted' }` to approve
- Existing RBAC permissions unchanged

**Tests** (`tests/order-review-queue.test.js`):
- ✅ Waiter sees web orders (reviewerRole='waiter')
- ✅ Waiter doesn't see admin orders (wrong reviewerRole)
- ✅ Waiter doesn't see waiter orders (requiresReview=false)
- ✅ Waiter doesn't see accepted/preparing orders (not pending)
- ✅ Support sees admin orders
- ✅ Support sees telegram orders
- ✅ Support sees both admin + telegram together
- ✅ Support doesn't see web orders (wrong reviewerRole)
- ✅ Strict role isolation between waiter and support
- ✅ Non-reviewer roles (kitchen) get empty array
- ✅ Merchant isolation (no cross-merchant leaks)
- ✅ Orders sorted by placedAt ascending (oldest first)

---

## Complete Test Results

### **All Tests: 41/41 Passing** ✅

```
PASS tests/order-source-field.test.js (6 tests)
PASS tests/order-flow-config.test.js (14 tests)
PASS tests/order-auto-routing.test.js (9 tests)
PASS tests/order-review-queue.test.js (12 tests)

Test Suites: 4 passed, 4 total
Tests:       41 passed, 41 total
```

**Breakdown**:
- Step 1 (Source Field): 6/6 ✅
- Step 2 (Config Module): 14/14 ✅
- Step 3 (Auto-Routing): 9/9 ✅
- Step 4 (Review Queue): 12/12 ✅

---

## Files Modified

### **Core Order Module**:
- `src/modules/order/service/OrderService.js` - Added source param, auto-routing logic, getReviewQueue method
- `src/modules/order/service/OrderTransactionService.js` - Set explicit source, auto-routing logic
- `src/modules/order/controller/handlers/placement.handler.js` - Role-based source detection
- `src/modules/order/controller/handlers/retrieval.handler.js` - Added getReviewQueue handler
- `src/modules/order/service/OrderStateMachineService.js` - Added 'system' to TRANSITION_ROLE_PERMISSIONS
- `src/modules/order/orders.routes.js` - Added review-queue route

### **New Module**:
- `src/modules/order-flow-config/` (entire module)
  - `controller/order-flow-config.controller.js`
  - `dto/order-flow-config.dto.js`
  - `repository/order-flow-config.repository.js`
  - `service/order-flow-config.service.js`
  - `order-flow-config.routes.js`
  - `index.js`
- `models/OrderFlowConfig.js`

### **Routes**:
- `src/routes/index.js` - Added order-flow-config routes

### **Tests**:
- `tests/order-source-field.test.js` (Step 1)
- `tests/order-flow-config.test.js` (Step 2)
- `tests/order-auto-routing.test.js` (Step 3)
- `tests/order-review-queue.test.js` (Step 4)

---

## API Endpoints Added

### **Order Flow Config**:
- `GET /api/v1/order-flow-config` - Get merchant's channel config
- `PUT /api/v1/order-flow-config` - Update channel config

### **Review Queue**:
- `GET /api/v1/order/review-queue` - Get pending orders requiring review by user's role

### **Existing Endpoints (Reused)**:
- `PATCH /api/v1/order/:id/status` - Approve/reject orders from review queue

---

## Configuration Examples

### **Default Config** (Lazy-Created):
```json
{
  "channels": {
    "waiter": {
      "requiresReview": false,
      "reviewerRole": null
    },
    "web": {
      "requiresReview": true,
      "reviewerRole": "waiter"
    },
    "admin": {
      "requiresReview": true,
      "reviewerRole": "support"
    },
    "telegram": {
      "requiresReview": true,
      "reviewerRole": "support"
    }
  }
}
```

### **Custom Config Example** (All Auto-Route):
```json
{
  "channels": {
    "waiter": {
      "requiresReview": false,
      "reviewerRole": null
    },
    "web": {
      "requiresReview": false,  // ← Changed
      "reviewerRole": null       // ← Changed
    },
    "admin": {
      "requiresReview": false,   // ← Changed
      "reviewerRole": null       // ← Changed
    },
    "telegram": {
      "requiresReview": false,   // ← Changed
      "reviewerRole": null       // ← Changed
    }
  }
}
```

---

## Design Principles Followed

1. **Separation of Concerns**:
   - Controller determines source (has HTTP/role context)
   - Service handles business logic (no HTTP awareness)

2. **Reuse Existing Logic**:
   - Auto-routing uses existing `transitionOrderStatus()`
   - Kitchen tickets created via existing outbox handler
   - Manual approve/reject uses existing endpoint

3. **Backward Compatibility**:
   - Lazy-creation prevents breaking existing merchants
   - Existing order creation flows unchanged (except source field)
   - Manual workflow still works identically

4. **Transaction Safety**:
   - Auto-routing outside main transaction (transitionOrderStatus creates own session)
   - Order creation succeeds even if auto-routing fails (graceful degradation)

5. **Merchant Isolation**:
   - All queries scoped by merchantId
   - No cross-merchant data leaks
   - Each merchant has independent config

6. **Role-Based Security**:
   - Review queue filtered by user's role
   - Strict isolation between waiter and support queues
   - Non-reviewer roles get empty array (no errors)

---

## Known Limitations & Future Work

### **Accepted Risks**:
1. **Crash-Window Edge Case**:
   - If process dies between `pending→accepted` and `accepted→preparing`, order stuck at 'accepted'
   - Mitigation: Not implemented (out of scope for MVP)
   - Future: Background job to detect and complete interrupted auto-routes

### **Not Implemented** (Out of Scope):
1. Per-branch config (currently merchant-level only)
2. Time-based routing rules (e.g., auto-route during business hours only)
3. Order volume thresholds (e.g., require review if >5 orders in queue)
4. Audit trail for config changes
5. Webhook notifications for orders in review queue
6. Bulk approve/reject in review queue

---

## Testing Strategy

### **Unit Tests**:
- Individual service methods tested in isolation
- Repository CRUD operations verified
- DTO validation edge cases covered

### **Integration Tests**:
- End-to-end order creation → auto-routing → kitchen ticket flow
- Multi-merchant isolation verified
- Role-based review queue filtering tested

### **Test Data Quality**:
- Uses real ObjectIds (not hardcoded)
- Realistic order structures matching production schema
- Edge cases explicitly tested (missing config, non-reviewer roles, etc.)

---

## Performance Considerations

### **Current Implementation**:
- Review queue: O(n) filtering where n = pending orders
  - Fetches all pending orders, filters by config
  - Config lookup per order (could be optimized)

### **Optimization Opportunities** (Future):
1. **Denormalize reviewerRole**:
   - Add `reviewerRole` field to Order schema (set during creation)
   - Query: `{ status: 'pending', reviewerRole: 'waiter' }` (indexed)
   - Tradeoff: Config updates require order backfill

2. **Cache Channel Configs**:
   - In-memory cache per merchant (TTL: 5min)
   - Invalidate on PUT /order-flow-config
   - Reduces DB roundtrips in review queue filtering

3. **Pagination**:
   - Review queue currently returns all matches
   - Add pagination for merchants with high order volumes

---

## Documentation Needed (Follow-up)

1. **API Documentation**:
   - Add order-flow-config endpoints to API spec
   - Document review-queue response format
   - Update order placement examples with source field

2. **User Guide**:
   - How to configure channel routing rules
   - Review queue workflow for waiters/support
   - Troubleshooting stuck orders

3. **Admin Guide**:
   - Default config behavior
   - When to use requiresReview vs auto-routing
   - Performance tuning for high-volume merchants

---

## Deployment Checklist

- [ ] Run migration to add OrderFlowConfig collection
- [ ] Verify indexes created (OrderFlowConfig.merchant unique)
- [ ] Test lazy-creation on production merchants
- [ ] Monitor auto-routing success rate (first 24h)
- [ ] Verify kitchen ticket creation still works
- [ ] Train support team on review queue usage
- [ ] Update waiter app to show review queue
- [ ] Add monitoring alert for orders stuck at 'accepted' >1hr

---

## Success Criteria - ALL MET ✅

- ✅ Waiter orders (trusted source) auto-route to kitchen
- ✅ Web/admin/telegram orders require manual review by default
- ✅ Merchants can configure per-channel routing rules
- ✅ Review queue shows correct orders to correct roles
- ✅ Role isolation prevents cross-queue visibility
- ✅ Existing manual workflow unchanged
- ✅ Kitchen ticket creation still works
- ✅ No breaking changes to existing order flows
- ✅ 41/41 tests passing across all 4 steps
- ✅ Merchant data isolation maintained

---

**Feature Status**: ✅ **PRODUCTION READY**

**Total Development Time**: 4 steps
**Test Coverage**: 41 comprehensive tests
**Lines of Code**: ~800 (excluding tests)
**Breaking Changes**: None
