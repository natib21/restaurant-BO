# Inventory System Audit: Executive Summary

**Created**: September 3, 2026  
**Audited Code**: Production order flow, inventory endpoints, stock management  
**Total Issues Found**: 10  
**Blocking Production**: YES (5 critical/high-risk issues)

---

## PRODUCTION READINESS: 🔴 **NOT YET**

### What Works ✅
- Order placement deductions (with branch isolation)
- PO receipt with branch context
- Ingredient creation requires branch
- Deductions wrapped in MongoDB transactions
- Audit trail records branch for order deductions

### What's Broken ❌
- **CRITICAL**: Order cancellations don't restore stock (PERMANENT DATA LOSS)
- **CRITICAL**: Two competing service implementations (split-brain)
- **HIGH**: Manual stock adjustments skip branch validation
- **HIGH**: Ingredient updates can cross branch boundaries
- **HIGH**: Batch adjustments don't require branch context

---

## THE 5 CRITICAL BLOCKING ISSUES

| # | Issue | Risk | Evidence | Fix Time |
|---|-------|------|----------|----------|
| 1 | **Two competing services** | CRITICAL | `InventoryService.js` & `inventory.service.js` both implement adjustStock() with different branch handling | 0.5h |
| 2 | **No stock on cancellation** | CRITICAL | OrderService.cancelOrder() → OrderStateMachineService marks canceled, NO reversal of deductions | 2h |
| 3 | **Update no branch filter** | HIGH | `PATCH /api/v1/ingredients/:id` query: `{_id, merchant}` missing `{branch}` | 0.5h |
| 4 | **Manual adjust no branch** | HIGH | `POST /api/v1/inventory/adjust` doesn't pass/require `branchId` to adjustStock | 1h |
| 5 | **Batch adjust no branch** | HIGH | `POST /api/v1/inventory/batch-adjust` same issue as #4 | 1h |

---

## CODE EVIDENCE: WHERE THINGS BREAK

### Issue #1: Split-Brain Services

**File A (Used by Order modules)**: `src/modules/inventory/service/InventoryService.js:22`
```javascript
static async adjustStock(
  merchantId,
  ingredientId,
  quantity,
  type, reason, reference, performedBy,
  cost = 0
  // ❌ NO branchId parameter
)
```

**File B (Used by Inventory controllers)**: `src/modules/inventory/service/inventory.service.js:36`
```javascript
static async adjustStock(
  merchantId,
  ingredientId,
  quantity,
  type, reason, reference, performedBy,
  cost = 0,
  branchId = null,          // ✅ Has it but optional
  options = {}
)
```

**Index exports uppercase**: `src/modules/inventory/index.js:10`
```javascript
InventoryService: require('./service/InventoryService.js').InventoryService,
```

**But controllers import lowercase**: 
- `src/modules/inventory/controller/inventory.controller.js:11` → `require('../service/inventory.service')`
- `src/modules/inventory/controller/purchase-order.controller.js:11` → `require('../service/inventory.service')`

**Result**: 
- OrderService (imports from index) → InventoryService (uppercase) → ✅ HAS branchId
- ManualAdjust (imports directly) → inventory.service (lowercase) → ❌ branchId ignored

---

### Issue #2: No Stock Restoration on Cancellation

**Path**: `OrderService.cancelOrder()` → `OrderStateMachineService.transitionOrderStatus()`

**File**: `src/modules/order/service/OrderService.js:1089`
```javascript
const result = await OrderStateMachineService.transitionOrderStatus({
  orderId,
  toStatus: 'canceled',
  // ❌ NO stock restoration call
  user: req.user || null,
  actorType: req.user ? 'staff' : 'customer',
  reason,
});
```

**Result**: 
1. Place order → deductForOrder([4kg chicken])
2. Stock: 20kg → 16kg ✅ Recorded in StockHistory
3. Cancel order → toStatus='canceled' 
4. Stock stays: 16kg ❌ NO reversal entry in StockHistory
5. Audit trail: "-4kg chicken" (no "+4kg cancellation_reversal")

**Scenario Impact**:
```
T0: Stock = 20kg
T1: Order A placed, -4kg → Stock = 16kg, StockHistory: [deduction -4kg]
T2: Order A canceled → Stock = 16kg, StockHistory: [deduction -4kg] (NO reversal!)
T3: Order B tries -3kg → Stock = 13kg ✅ Works but SHOULD be 20-3=17kg
T4: Daily report: "We used 7kg (4+3)" but actually sold only 3kg. 4kg phantom loss.
```

---

### Issue #3: Ingredient Update Skips Branch

**File**: `src/modules/inventory/controller/ingredient.controller.js:63`
```javascript
exports.updateIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },  // ❌ No branch filter
    req.body,
    { new: true, runValidators: true }
  );
```

**Attack Scenario**:
1. Branch A staff member gets ingredient ObjectId for "Chicken" (their branch)
2. Constructs request: `PATCH /api/v1/ingredients/{id}` with `{ maxStock: 999, costPerUnit: 0.01 }`
3. Query matches Branch A's document BUT also matches Branch B's document with same _id... wait, ObjectIds are unique. 
4. Actually: If Branch A staff has ObjectId of Branch A ingredient, query matches correctly (only Branch A's doc)
5. But if merchant admin has wrong branch's ingredient ID, they COULD potentially modify it

**Better Attack**: 
- Two branches both have "Chicken" (separate docs, different _ids)
- Branch A tries: `PATCH /ingredients/{branchB_chickenId}` with reduced maxStock
- Current code: `{_id: branchB_id, merchant}` matches → ✅ Updates Branch B's stock thresholds
- Should require: `{_id: branchB_id, merchant, branch: requestorBranch}` → ❌ Fails

---

### Issue #4 & #5: Manual Adjustments Skip Branch

**File**: `src/modules/inventory/controller/inventory.controller.js:43`
```javascript
exports.adjustStock = catchAsync(async (req, res) => {
  const { ingredientId, quantity, type, reason, reference, cost } = req.body;
  // ❌ NO branchId extracted from request
  
  const ingredient = await InventoryService.adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    cost
    // ❌ branchId NOT passed (defaults to undefined in lowercase service)
  );
```

**Schema** (missing branchId):
```javascript
exports.adjustStockSchema = z.object({
  ingredientId: z.string().regex(/^[a-f0-9]{24}$/),
  quantity: z.number().min(0.01),
  type: z.enum(['in', 'out', 'waste', 'adjustment']),
  reason: z.string(),
  // ❌ branchId field MISSING
});
```

**Result**: Any merchant staff can manually adjust any branch's stock without specifying branch

---

## COMPARISON: ORDER FLOW vs MANUAL ADJUSTMENT

### Order Flow (Correct) ✅
```
OrderTransactionService.executePlaceOrder()
  ↓ deductForOrder({merchantId, branchId, orderNumber, plan, performedBy}, session)
  ↓ adjustStockAtomic(merchantId, branchId, ingredientId, ...)
  ↓ Query: {_id, merchant, branch: branchId, currentStock: {$gte}}
  ✅ Branch-filtered, transactional, audit trail includes branch
```

### Manual Adjustment (Broken) ❌
```
inventory.controller.adjustStock()
  ↓ InventoryService.adjustStock(merchantId, ingredientId, quantity, ...)
  ↓ No branchId in call
  ↓ lowercase service: branchId parameter defaults to null
  ↓ Query: {_id, merchant} (no branch filter)
  ✅ Can update ANY branch's ingredient
  ❌ No branch in audit trail
  ❌ May not be transactional
```

---

## THE FIX CHECKLIST

### Must Fix (Blocking Production)

- [ ] **P0-1** (30min): DELETE `src/modules/inventory/service/inventory.service.js`
- [ ] **P0-2** (30min): UPDATE `src/modules/inventory/controller/inventory.controller.js:11` to import uppercase InventoryService
- [ ] **P0-3** (30min): UPDATE `src/modules/inventory/controller/purchase-order.controller.js:11` to import uppercase InventoryService
- [ ] **P0-4** (2h): Implement `InventoryService.restoreOrderStock(orderId, merchantId, branchId, session)`
- [ ] **P0-5** (30min): Require `branchId` in `POST /api/v1/ingredients/:id` update endpoint
- [ ] **P0-6** (30min): Require `branchId` in `DELETE /api/v1/ingredients/:id` endpoint
- [ ] **P0-7** (1h): Add `branchId` to `adjustStockSchema` validator (required field)
- [ ] **P0-8** (1h): Add `branchId` to `batchAdjustStockSchema` validator (required field)
- [ ] **P0-9** (2h): Write test: Order placed → canceled → stock restored → new order succeeds
- [ ] **P0-10** (1h): Test all branch isolation scenarios (manual adjust, ingredient update, batch adjust)

**Total Time**: ~8 hours

---

## RISK ASSESSMENT MATRIX

| Scenario | Before Fix | After Fix |
|----------|-----------|-----------|
| Cancel order | Stock ❌ stays depleted | Stock ✅ restored |
| Manual adjust Branch B ingredient | Staff ❌ can adjust | Requires ✅ branch param |
| Update Branch B ingredient | Staff ❌ can modify | Requires ✅ branch param |
| Two services | Code ❌ split-brain | Single ✅ implementation |
| Audit trail | Branch ❌ sometimes null | Branch ✅ always recorded |
| Order deduction | Already ✅ correct | No change needed |

---

## DEPLOYMENT GATE

### Pre-Deployment Checklist

- [ ] All 10 fixes implemented and code-reviewed
- [ ] Test suite passes (all tests including new tests)
- [ ] Concurrent stress test passes (5 simultaneous orders, same ingredient)
- [ ] Cancellation test passes (order placed, canceled, stock verified restored)
- [ ] Cross-branch isolation test passes (Branch A can't see/modify Branch B's stock)
- [ ] Audit trail validation (all movements have non-null branch)
- [ ] Backward compatibility check (any legacy code using lowercase service?)
- [ ] Deploy to staging and monitor for 24h
- [ ] Production rollout with feature flag or canary

---

## RECOMMENDATIONS

**Immediate** (Week 1):
1. Consolidate inventory services (fix #1)
2. Implement order cancellation reversal (fix #2)
3. Add branch protection to endpoints (fixes #3, #4, #5)

**Short-term** (Week 2-3):
1. Write comprehensive concurrent deduction tests
2. Add automated daily stock reconciliation report
3. Set up alerting for stock anomalies

**Medium-term** (Month 2):
1. Add inventory transfer between branches
2. Implement stock reservation (not just deduction + restoration)
3. Add per-branch SKU tracking

---

## FINAL VERDICT

**🔴 NOT PRODUCTION READY**

**Reason**: Uncontrolled stock loss on cancellations + split-brain services + missing branch validation create unacceptable data integrity risk.

**Can ship once**: All P0 fixes implemented + tests pass + 24h staging validation passes

**ETA to production**: 2 weeks (1 week fixes + testing, 1 week staging + canary)
