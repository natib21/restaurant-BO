# Production Readiness Verdict: Inventory System

**Status**: 🔴 **NOT YET**

**Critical Blocking Issues**: 5  
**High-Risk Issues**: 2  
**Medium-Risk Issues**: 3

---

## BLOCKING ISSUES (Must Fix Before Production)

### 🔴 ISSUE #1: SPLIT-BRAIN SERVICE IMPLEMENTATIONS [CRITICAL - DATA CORRUPTION RISK]

**Severity**: CRITICAL - Can cause data corruption and lost audit trails

**Problem**: TWO competing `adjustStock()` implementations exist:
1. **src/modules/inventory/service/InventoryService.js** (uppercase) - Used by ORDER modules ✅ with branch
2. **src/modules/inventory/service/inventory.service.js** (lowercase) - Used by INVENTORY controllers ❌ partial branch support

**Evidence**:

**File**: `src/modules/inventory/service/InventoryService.js` (Line 22)
```javascript
static async adjustStock(
  merchantId,
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  cost = 0
) {
  // ❌ NO branchId parameter
  const session = await InventoryRepository.startIngredientSession();
  session.startTransaction();

  try {
    if (type === 'out' || type === 'waste' || type === 'adjustment') {
      const result = await InventoryRepository.updateIngredient(
        {
          _id: ingredientId,
          merchant: merchantId,
          // ❌ NO branch filter
          currentStock: { $gte: quantity },
        },
```

**File**: `src/modules/inventory/service/inventory.service.js` (Line 36)
```javascript
static async adjustStock(
  merchantId,
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  cost = 0,
  branchId = null,  // ✅ Has parameter
  options = {}
) {
  // ✅ Conditional branch recording
  if (branchId) {
    movementRecord.branch = branchId;  // ✅ Optionally records
  }
```

**Impact**:
- Manual stock adjustments (`POST /api/v1/inventory/adjust`) use lowercase service → **NO branch filter**
- Batch adjustments use lowercase service → **NO branch filter**
- PO receipt DOES pass branchId, but lowercase service doesn't enforce it in queries
- One staff member can accidentally adjust another branch's stock

**Fix Required**:
```
DELETE src/modules/inventory/service/inventory.service.js
UPDATE src/modules/inventory/controller/inventory.controller.js:11
  FROM: const { InventoryService } = require('../service/inventory.service');
  TO: const { InventoryService } = require('../service/InventoryService.js');
UPDATE src/modules/inventory/controller/purchase-order.controller.js:11
  FROM: const { InventoryService } = require('../service/inventory.service');
  TO: const { InventoryService } = require('../service/InventoryService.js');
```

---

### 🔴 ISSUE #2: NO STOCK RESTORATION ON ORDER CANCELLATION [CRITICAL - DATA LOSS]

**Severity**: CRITICAL - Permanent stock loss on cancellations

**Problem**: When an order is canceled, stock is NEVER restored

**Evidence**:

**File**: `src/modules/order/service/OrderService.js` (Line 1089)
```javascript
static async cancelOrder(req) {
  const { orderId } = req.params;
  const { reason = 'Customer/Staff Cancellation' } = req.body;

  const existing = await OrderRepository.findOne(
    merchantScopedQuery({ _id: orderId }, req)
  );
  if (!existing) throw new AppError('Order not found', 404);

  // ...validation...

  const result = await OrderStateMachineService.transitionOrderStatus({
    orderId,
    toStatus: 'canceled',
    // ❌ No stock restoration
    merchantQuery: merchantScopedQuery({}, req),
    user: req.user || null,
    actorType: req.user ? 'staff' : 'customer',
    customerId: req.customerId,
    reason,
  });

  return { order: result.order, alreadyCanceled: false };
}
```

**File**: `src/modules/order/service/OrderStateMachineService.js` (Line 378)
```javascript
if (toStatus === 'canceled') {
  order.canceledAt = new Date();
  // ❌ Order marked canceled, but no stock reversal logic
  if (!order.canceledBy && order.statusHistory?.length) {
    const last = order.statusHistory[order.statusHistory.length - 1];
    order.canceledBy = last.changedBy;
  }
}
// ... later ...
if (toStatus === 'canceled') {
  // ❌ Just updates status, no stock restore
  order.canceledReason = reason || 'Order canceled';
  order.canceledBy = userId;
  // ... cancel KDS tickets ...
}
```

**Search for reversal code** (Line 5 of grep results):
```
No matches found for: restore.*ingredient|reverse.*deduct|refund.*ingredient|revert.*order
```

**Impact**:
- Cancel pending order for 5kg chicken → Stock stays depleted, never restored
- Over time: Phantom losses accumulate
- Inventory reports show lower stock than reality
- Orders may fail with "insufficient stock" when stock was actually canceled orders

**Scenario**:
1. Order A: Deduct 10kg chicken (stock 20 → 10) ✅ Recorded in StockHistory
2. Order A: Canceled (stock stays 10) ❌ StockHistory NOT reversed
3. Stock movement records show -10kg but no +10kg reversal
4. Audit trail is broken

**Fix Required**:
```
ADD function to InventoryService:
  static async restoreOrderStock(orderId, merchantId, branchId, session) {
    1. Find order's deduction records in StockHistory
    2. For each deduction (type: 'order_consumption'):
       - Call adjustStockAtomic() with opposite quantities
       - Type: 'order_cancellation_reversal'
       - Record original order ID for audit
    3. Return restored ingredients
  }

UPDATE OrderService.cancelOrder():
  BEFORE: await OrderStateMachineService.transitionOrderStatus({...})
  ADD: await InventoryService.restoreOrderStock(
    existing._id,
    merchantId,
    existing.branch,
    session  // Pass session to restore atomically
  );
```

---

### 🔴 ISSUE #3: INGREDIENT UPDATE MISSING BRANCH FILTER [HIGH - IDOR/CROSS-BRANCH]

**Severity**: HIGH - Cross-branch modification

**Problem**: `PATCH /api/v1/ingredients/:id` can update ANY branch's ingredient

**Evidence**:

**File**: `src/modules/inventory/controller/ingredient.controller.js` (Line 63)
```javascript
exports.updateIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    // ❌ Missing: branch: req.body.branch or req.query.branch
    req.body,
    { new: true, runValidators: true }
  );
```

Also **DELETE** at line 76:
```javascript
exports.deleteIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    // ❌ Missing branch filter
```

**Fix Required**:
```javascript
// GET branchId from query or body
const branchId = req.query.branchId || req.body.branch;
if (!branchId) {
  return next(new AppError('Branch is required to update ingredient', 400));
}

const ingredient = await Ingredient.findOneAndUpdate(
  { _id: req.params.id, merchant: merchantId, branch: branchId },  // ← Add branch
  req.body,
  { new: true, runValidators: true }
);
```

---

### 🔴 ISSUE #4: MANUAL ADJUST STOCK ENDPOINT MISSING BRANCH [HIGH - DATA CORRUPTION]

**Severity**: HIGH - Manual stock adjustments not branch-scoped

**Problem**: `POST /api/v1/inventory/adjust` doesn't require or use branch parameter

**Evidence**:

**File**: `src/modules/inventory/controller/inventory.controller.js` (Line 43)
```javascript
exports.adjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { ingredientId, quantity, type, reason, reference, cost } = req.body;
  const performedBy = req.user._id;

  const ingredient = await InventoryService.adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    cost
    // ❌ NOT passed: branchId
  );
```

Schema at `src/modules/inventory/validators/inventory.validator.js`:
```javascript
exports.adjustStockSchema = z.object({
  ingredientId: z.string().regex(/^[a-f0-9]{24}$/),
  quantity: z.number().min(0.01),
  // ❌ NO branchId field
  type: z.enum(['in', 'out', 'waste', 'adjustment']),
  reason: z.string(),
  reference: z.string(),
  cost: z.number().optional(),
});
```

**Fix Required**:
```javascript
// Add to validator schema:
branchId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid branch ID'),  // ← Required

// Update controller:
const { ingredientId, quantity, type, reason, reference, cost, branchId } = req.body;

const ingredient = await InventoryService.adjustStock(
  merchantId,
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  cost,
  branchId  // ← Pass branchId
);
```

---

### 🔴 ISSUE #5: BATCH ADJUST STOCK ENDPOINT MISSING BRANCH [HIGH - DATA CORRUPTION]

**Severity**: HIGH - Same as Issue #4 but for batch operations

**Evidence**:

**File**: `src/modules/inventory/controller/inventory.controller.js` (Line 80)
```javascript
exports.batchAdjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { adjustments } = req.body;
  const performedBy = req.user._id;

  const results = await InventoryService.batchAdjustStock(
    merchantId,
    adjustments,
    performedBy
    // ❌ NOT passed: branchId
  );
```

**File**: `src/modules/inventory/service/inventory.service.js` (Line 266)
```javascript
static async batchAdjustStock(merchantId, adjustments, performedBy, options = {}) {
  // ❌ No branchId parameter
  const { session } = options;
  const results = [];

  for (const adj of adjustments) {
    try {
      const result = await this.adjustStock(
        merchantId,
        adj.ingredientId,
        adj.quantity,
        adj.type,
        adj.reason,
        adj.reference || `Manual batch adjustment`,
        performedBy,
        adj.cost,
        // ❌ adj.branchId NOT passed to adjustStock
      );
```

**Fix Required**: Same pattern as Issue #4 - add branchId to schema and pass through chain

---

## HIGH-RISK ISSUES (Fix Before Full Rollout)

### 🟠 ISSUE #6: NO TRANSACTION WRAPPING ON MANUAL ADJUSTMENTS [HIGH - PARTIAL FAILURE]

**Severity**: HIGH - Manual adjustments not atomic

**Evidence**:

**File**: `src/modules/inventory/service/InventoryService.js` (Line 22)
```javascript
static async adjustStock(...) {
  const session = await InventoryRepository.startIngredientSession();
  session.startTransaction();

  try {
    // ... updates ingredient ...
    await session.commitTransaction();  // ✅ Has transaction
```

BUT in lowercase service `src/modules/inventory/service/inventory.service.js` (Line 36):
```javascript
static async adjustStock(...cost = 0, branchId = null, options = {}) {
  const { session } = options;
  // ❌ If no session passed, NO transaction wrapping!
  
  const updated = await InventoryRepository.updateIngredient(
    { _id: ingredientId, merchant: merchantId },
    { $inc: { currentStock: quantityChange } },
    { session }  // ← May be undefined
  );
```

The controller doesn't create/pass a session, so manual adjustments may not be transactional.

**Fix**: All paths should use consistent transaction wrapping. See ISSUE #1 fix (consolidate to single service).

---

### 🟠 ISSUE #7: AUDIT TRAIL GAPS IN LOWERCASE SERVICE [HIGH - COMPLIANCE]

**Severity**: HIGH - Incomplete audit trails for regulatory compliance

**Evidence**:

**File**: `src/modules/inventory/service/inventory.service.js` (Line 75)
```javascript
const movementRecord = {
  merchant: merchantId,
  ingredient: ingredientId,
  type,
  quantity,
  previousStock: ingredient.currentStock,
  newStock: updatedIngredient.currentStock,
  reason,
  reference,
  cost,
  performedBy,
};

if (branchId) {
  movementRecord.branch = branchId;  // ← OPTIONAL branch
}
```

Manual adjustments from endpoint may have null branch in audit trail, making it impossible to trace which branch was affected.

---

## MEDIUM-RISK ISSUES (Should Fix)

### 🟡 ISSUE #8: RECIPE INGREDIENT LOOKUP NOT BRANCH-SCOPED [MEDIUM - WRONG INGREDIENT]

**Severity**: MEDIUM - May resolve wrong ingredient if name collision exists

**Problem**: When resolving recipe items to find deduction plan, the code uses ingredient name lookups that may not be branch-specific

**File**: `src/modules/inventory/service/InventoryService.js` (Line 147)
```javascript
static async resolveDeductionPlan(orderItems, merchantId) {
  const plan = [];
  const aggregated = new Map();

  for (const item of orderItems) {
    const menuItem = await InventoryRepository.findMenuItem(item.menuItemId);
    if (menuItem?.recipe?.items) {
      for (const recipeItem of menuItem.recipe.items) {
        // ❌ Lookup ingredient without branch context
        const ingredient = await Ingredient.findOne({
          merchant: merchantId,
          _id: recipeItem.ingredient,  // ← Uses ingredient ID, not name
          // ❌ Should include: branch: orderBranch
        });
```

While this uses ObjectId (not name), it should filter by branch to ensure consistency.

---

### 🟡 ISSUE #9: STOCK MOVEMENT TIMESTAMPS NOT INDEXED [MEDIUM - QUERY PERFORMANCE]

**Severity**: MEDIUM - Reporting queries will be slow

**Problem**: StockHistory likely doesn't have indexed createdAt/timestamp, so time-range queries slow

This should be verified in StockHistory schema but not shown in evidence.

---

### 🟡 ISSUE #10: NO CONCURRENCY TESTS [MEDIUM - RACE CONDITIONS]

**Severity**: MEDIUM - Race conditions possible under load

**Problem**: No concurrent deduction tests exist to verify isolation level of transactions

**Evidence**: Grep found no concurrent/race condition tests in inventory:
```
tests/*concurrency* → No matches
tests/*race* → No matches
```

---

## SUMMARY OF FAILING AREAS

### ✅ WORKING CORRECTLY
- Order placement stock deductions (uppercase InventoryService) ✅
- Deduction wrapping in MongoDB transactions ✅
- Branch filter applied to order deductions ✅
- Audit trail records branch for order deductions ✅
- PO receipt with branch context ✅
- Ingredient creation requires branch ✅

### ❌ BROKEN/NOT IMPLEMENTED
- Ingredient updates (PATCH) don't filter by branch ❌
- Manual stock adjustments don't require branch ❌
- Batch stock adjustments don't require branch ❌
- Order cancellations don't restore stock ❌
- Two competing service implementations ❌
- Lowercase service doesn't enforce branch in queries ❌

---

## PRODUCTION READINESS VERDICT

### 🔴 **STATUS: NOT YET**

**Cannot deploy to production because:**

1. **Stock loss on cancellations** - Orders canceled → stock never restored → permanent inventory loss
2. **Split-brain services** - Two implementations, inconsistent branch filtering
3. **Manual adjustments cross-branch** - Staff can modify another branch's inventory
4. **Cross-contamination risk** - Ingredient updates can affect other branches

### FIXES REQUIRED (In Order of Risk)

#### **CRITICAL (Fix First)**

**P0-1**: Delete lowercase inventory.service.js, consolidate to uppercase InventoryService.js
- Time: 30 min
- Risk: Breaking change if anything else imports lowercase
- Action:
  ```bash
  DELETE src/modules/inventory/service/inventory.service.js
  UPDATE src/modules/inventory/controller/inventory.controller.js:11
  UPDATE src/modules/inventory/controller/purchase-order.controller.js:11
  RUN tests to verify
  ```

**P0-2**: Implement stock restoration on order cancellation
- Time: 2 hours
- Risk: High - must be atomic with cancellation
- Action:
  ```javascript
  ADD InventoryService.restoreOrderStock(orderId, merchantId, branchId)
  MODIFY OrderService.cancelOrder() to restore before transition
  ADD test: Order canceled → Stock restored → New order can place
  ```

**P0-3**: Add branch filter to ingredient UPDATE endpoint
- Time: 30 min
- Risk: Medium - requires branchId in request
- Action:
  ```
  REQUIRE branchId in request (query or body)
  UPDATE findOneAndUpdate query to include branch filter
  UPDATE DELETE endpoint similarly
  UPDATE schema validator to require branchId
  ```

**P0-4**: Add branch requirement to manual adjustments
- Time: 1 hour
- Risk: Low - simple parameter addition
- Action:
  ```
  ADD branchId to adjustStockSchema validator (required)
  UPDATE controller to extract and pass branchId
  UPDATE batch adjust similarly
  ```

#### **HIGH (Fix Before Full Production)**

**P1-1**: Unify transaction wrapping across both adjustment paths
- Time: 1 hour
- Action: All adjustStock paths should require session or create one

**P1-2**: Add concurrent deduction tests
- Time: 2 hours
- Action: Test 5 orders deducting same ingredient simultaneously

---

## ROLLOUT PLAN

### Phase 1: Fix Critical Issues (Week 1)
1. Consolidate services
2. Implement order cancellation stock restoration
3. Add branch filters to endpoints

### Phase 2: Testing (Week 2)
1. End-to-end test: Place → Deduct → Cancel → Restore
2. Concurrent stress test
3. Cross-branch isolation test

### Phase 3: Canary Deploy (Week 3)
1. Deploy to 1 branch/merchant
2. Monitor StockHistory for anomalies
3. Run reconciliation: Orders deducted = Ingredients out

### Phase 4: Full Production (Week 4)
1. Deploy to all merchants
2. 24/7 monitoring for stock anomalies
3. Daily reconciliation reports

---

## METRICS TO MONITOR

Once deployed, monitor these KPIs:

1. **Stock Reconciliation**: `SUM(deductions) = SUM(ingredient outflows)` per day
2. **Canceled Orders**: Track % of orders canceled and if stock is properly restored
3. **Cross-Branch Adjustments**: Alert if manual adjustment touches ingredient from different branch
4. **Transaction Rollbacks**: Any adjustStock failures that left stock inconsistent
5. **Audit Trail Completeness**: % of movements with non-null branch field

---

## RISK MATRIX

| Issue | Severity | Likelihood | Impact | Fix Effort | Total Risk |
|-------|----------|-----------|--------|-----------|-----------|
| Split-brain services | CRITICAL | HIGH | Data corruption | 0.5h | **CRITICAL** |
| No cancellation restore | CRITICAL | MEDIUM | Stock loss | 2h | **CRITICAL** |
| Update cross-branch | HIGH | HIGH | Wrong branch mod | 0.5h | **HIGH** |
| Manual adjust unbranched | HIGH | MEDIUM | Wrong branch mod | 1h | **HIGH** |
| Batch adjust unbranched | HIGH | MEDIUM | Wrong branch mod | 1h | **HIGH** |
| No concurrency tests | MEDIUM | MEDIUM | Unknown race cond | 2h | **MEDIUM** |
| Transaction gaps | MEDIUM | LOW | Partial failure | 1h | **MEDIUM** |

**Total effort to fix all issues**: ~8 hours
**Timeline to production-ready**: 2 weeks (including testing)
