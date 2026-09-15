# Inventory Management System — Production Readiness Audit

**Date:** September 3, 2026  
**Scope:** Complete inventory module architecture, order integration, data integrity, concurrency safety, merchant isolation, and production operational readiness.

---

## 1. INVENTORY MODULE OVERVIEW

### All Models Involved

**Core Inventory Models:**

1. **Ingredient** (`models/Ingredient.js`)
   - Fields: name, description, unit (enum: kg, g, liter, ml, pieces, boxes, cans)
   - Stock tracking: `currentStock` (Number, min: 0), `reservedStock` (Number, min: 0)
   - Cost tracking: `costPerUnit` (Number, min: 0)
   - Stock thresholds: `minStock`, `maxStock` (Numbers)
   - Status: `isActive` (Boolean, soft delete), `alertStatus` (enum: OK, LOW, CRITICAL, OUT_OF_STOCK)
   - Belongs to: merchant (required, indexed)
   - Relates to: Recipe (one-to-many via recipe.items[].ingredient), StockMovement

2. **Recipe** (`models/Recipe.js`)
   - Fields: name, description, `items` (array of ingredient refs with quantity + unit)
   - Validation: pre-save hook checks ingredient exists (NOT isActive status)
   - Belongs to: MenuItem (via `menuItem` ref), merchant (required, indexed)
   - Status: `isActive` (Boolean, soft delete)
   - Relates to: Ingredient (many), MenuItem (one)

3. **StockMovement** (`models/StockMovement.js`)
   - Audit trail: type (in/out/adjustment/waste/return), quantity, unit, reason, reference (orderId/poNumber)
   - Fields: `timestamp`, `performedBy` (user ref), `cost`, `unitPrice`
   - Belongs to: merchant, ingredient (required, indexed)
   - Purpose: Complete history of all stock changes

4. **Supplier** (`models/Supplier.js`)
   - Fields: name, contact info, paymentTerms, leadTime
   - Belongs to: merchant (required)
   - Relates to: PurchaseOrder (one-to-many)

5. **PurchaseOrder** (`models/PurchaseOrder.js`)
   - Fields: `poNumber`, `supplier`, `items` (array of { ingredient, quantity, unit, unitPrice })
   - Status: draft → sent → confirmed → received → cancelled
   - Dates: `orderDate`, `expectedDeliveryDate`, `actualDeliveryDate`
   - Belongs to: merchant, branch (required, indexed)
   - Relates to: Supplier, Ingredient (via items[].ingredient)

### Relationships Diagram

```
Merchant (multi-tenant root)
  ├── Ingredient [merchant scoped, one-to-many]
  │   └── StockMovement [audit trail, one-to-many]
  │   └── PurchaseOrder.items[].ingredient [reference]
  │   └── Recipe.items[].ingredient [reference]
  ├── Recipe [merchant scoped, one-to-many]
  │   ├── MenuItem [one, via recipe.menuItem]
  │   └── Ingredient [many, via items[].ingredient]
  ├── Supplier [merchant scoped, one-to-many]
  │   └── PurchaseOrder [one-to-many]
  └── PurchaseOrder [merchant scoped, one-to-many]
      └── Supplier [one]
      └── Ingredient [many, via items[].ingredient]
```

### Merchant-Level Inventory Tracking Flag

**Location:** `models/merchantModel.js` lines 175–235, 355–364

**Structure:**
```javascript
features: {
  optional: {
    inventory: {
      enabled: { type: Boolean, default: false }
    }
  }
}
```

**Status:** ✅ **EXISTS** — Inventory module is **optional per merchant** and defaults to **DISABLED**.

**Access Method:**
```javascript
merchant.hasFeature('inventory')  // Returns boolean
```

**Usage Pattern:**
- Line 356 in `merchantModel.js`: `hasFeature()` method checks if feature is enabled
- Line 283 in `InventoryService.js`: Early return if `!merchant.hasFeature('inventory')`
- If disabled: no recipe validation, no stock checks, no deductions

---

## 2. ORDER-INVENTORY COUPLING (CRITICAL QUESTION)

### When an Order is Placed: Is Inventory Deduction REQUIRED?

**Answer: CONDITIONALLY REQUIRED**

**Location:** `src/modules/order/service/OrderTransactionService.js` (lines 41–330)

#### Order Placement Flow

```
1. buildOrderItems() validates menu items, calculates prices, fetches COGS
2. resolveDeductionPlan() aggregates ingredient usage
   → If inventory.enabled = false: Returns []
   → If inventory.enabled = true: Returns ingredient requirements per item
      → If no recipe exists: Throws error (line 302 in InventoryService.js)
3. Transaction opens (MongoDB session)
4. Order created
5. deductForOrder() executes
   → If plan is empty: No-op, succeeds
   → If plan has items: Stock checked atomically via findOneAndUpdate with $gte condition
      → If stock insufficient: Throws 409 Conflict
6. Transaction commits (all-or-nothing)
```

#### Scenario 1: Inventory Disabled (`merchant.features.optional.inventory.enabled = false`)

**Location:** `src/modules/inventory/service/InventoryService.js` lines 283–291

```javascript
static async getIngredientUsageForMenuItem(menuItemId, merchantId) {
  const merchant = await Merchant.findById(merchantId);
  const hasInventoryModule = merchant.hasFeature('inventory');

  if (!hasInventoryModule) {
    logger.info('inventory.recipe.skipped', { menuItemId, merchantId });
    return [];  // ← Returns empty array
  }
  
  // If inventory IS enabled, recipe is REQUIRED below...
}
```

**Result:**
- `resolveDeductionPlan()` returns `[]` (no ingredients to deduct)
- `deductForOrder()` is still called (line 138 of OrderTransactionService), but operates on empty list
- Order creation **SUCCEEDS** with no inventory impact
- No COGS deducted, no stock checked
- **Status: ✅ Merchants can place orders without inventory setup**

#### Scenario 2: Inventory Enabled BUT No Recipe Set Up

**Location:** `src/modules/inventory/service/InventoryService.js` lines 293–312

```javascript
static async getIngredientUsageForMenuItem(menuItemId, merchantId) {
  const hasInventoryModule = merchant.hasFeature('inventory');
  
  if (!hasInventoryModule) return [];
  
  // Inventory IS enabled
  const recipe = await InventoryRepository.findActiveRecipeForMenuItem(menuItemId, merchantId);
  
  if (!recipe || !recipe.items.length) {
    throw new AppError(
      `Inventory module is enabled but no active recipe found for menu item ${menuItemId}. ` +
      `Please configure a recipe or disable inventory tracking.`,
      400
    );
  }
  
  // Process ingredients...
}
```

**Result:**
- `resolveDeductionPlan()` throws error at line 77 of OrderTransactionService
- Order creation **FAILS** with 400 error
- **Status: ❌ Merchants MUST set up recipes if inventory is enabled**

#### Scenario 3: Inventory Enabled, Recipe Exists, Stock Checked Atomically

**Location:** `src/modules/inventory/service/stock.service.js` lines 27–58

```javascript
async function deductIngredientAtomic(ingredientId, deductQty, context, session) {
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId, 
      currentStock: { $gte: deductQty },  // ← Atomic condition
      isActive: true 
    },
    { $inc: { currentStock: -deductQty } },
    { new: true, session }
  );
  
  if (!updated) {
    throw new AppError(
      `Insufficient stock for ${ingredient.name}. ` +
      `Available: ${ingredient.currentStock}${ingredient.unit}, Required: ${deductQty}${ingredient.unit}`,
      409
    );
  }
  
  return updated;
}
```

**Result:**
- Atomic MongoDB query: version check + deduct in single operation
- If stock unavailable, query returns `null`
- Transaction rolls back automatically
- Order creation **FAILS** with 409 Conflict
- **Status: ✅ Prevents overselling via atomic query**

---

### Can Merchants Without Inventory Data Still Place Orders Today?

**Answer: YES, if they don't enable the inventory feature**

**Current Status:**
- Inventory feature defaults to **DISABLED** (`features.optional.inventory.enabled = false`)
- Default merchants have inventory disabled → can place orders without recipe/ingredient setup
- **Status: ✅ ZERO BLOCKING ISSUE — merchants are NOT forced into inventory tracking**

**Proof Points:**
1. Feature flag check at line 283 of InventoryService.js returns early if disabled
2. resolveDeductionPlan() returns empty array when disabled
3. Order still succeeds with empty deduction plan
4. No COGS tracking happens without inventory setup

---

### Is There Already a Toggle to Disable Inventory Tracking Per-Merchant?

**Answer: YES**

**Location:** `models/merchantModel.js` lines 175–235

**Field:** `merchant.features.optional.inventory.enabled` (Boolean, default: false)

**Implementation:**
- **Enable inventory:** `PATCH /api/v1/merchants/{id}` with payload: `{ "features": { "optional": { "inventory": { "enabled": true } } } }`
- **Disable inventory:** Same endpoint with `enabled: false`
- **Default behavior:** New merchants have inventory disabled

**Current Behavior:**
```javascript
// Check if inventory is enabled
if (!merchant.hasFeature('inventory')) {
  // Skip all inventory operations
  return [];
}
```

**Status: ✅ Toggle EXISTS and is FUNCTIONAL**

---

## 3. VALIDATION

### Stock Field Validation

**Location:** `models/Ingredient.js` lines 21–60

**Validations Enforced:**

| Field | Validation | Implementation |
|-------|-----------|-----------------|
| `currentStock` | Non-negative | `min: 0` on schema |
| `reservedStock` | Non-negative | `min: 0` on schema |
| `minStock` | Non-negative | `min: 0` on schema |
| `maxStock` | Non-negative | `min: 0` on schema |
| `unit` | Whitelist: kg, g, liter, ml, pieces, boxes, cans | `enum: [...]` on schema |
| `costPerUnit` | Non-negative number | `min: 0` on schema |

**Additional Atomic Validation:**
- `stock.service.js` lines 32–39: `findOneAndUpdate` with `currentStock: { $gte: deductQty }` prevents negative deductions
- `stockValidation.js` lines 37–72: Pre-order validation checks available stock against required quantity

**Status: ✅ COMPREHENSIVE — Mongoose schema + atomic queries ensure data integrity**

### Recipe-to-Ingredient Validation

**Location:** `models/Recipe.js` lines 72–108 (pre-save hook)

**Current Validation:**
```javascript
recipeSchema.pre('save', async function (next) {
  for (const item of this.items) {
    const ingredient = await mongoose.model('Ingredient').findById(item.ingredient);
    
    if (!ingredient) {
      return next(new Error(`Ingredient ${item.ingredient} not found`));
    }
    
    // Unit validation
    if (item.unit !== ingredient.unit) {
      return next(new Error(
        `Unit mismatch: Recipe uses ${item.unit} but ingredient ` +
        `"${ingredient.name}" is stocked in ${ingredient.unit}`
      ));
    }
  }
  next();
});
```

**Gap: Does NOT check if ingredient is active**
- Line 73: Queries `findById()` directly, no filter on `isActive: true`
- **Problem:** A soft-deleted ingredient (with `isActive: false`) can still be linked in recipes
- **Risk:** Recipe references non-functional ingredients; deduction would fail at runtime

**Recommended Fix:**
```javascript
const ingredient = await mongoose.model('Ingredient').findOne({
  _id: item.ingredient,
  isActive: true  // ← Add this filter
});
```

**Status: ⚠️ MEDIUM ISSUE — Allows orphaned recipe-ingredient links**

---

## 4. DATA INTEGRITY

### What Happens When MenuItem is Deleted?

**Location:** `src/modules/menu/model/MenuItem.model.js` lines 380–385

```javascript
menuItemSchema.methods.softDelete = function(userId) {
  this.deletedAt = new Date();
  this.isActive = false;
  this.available = false;
  if (userId) this.deletedBy = userId;
  return this.save();
};
```

**Cascade Behavior:**
- MenuItem is soft-deleted (marked `deletedAt`, `isActive: false`)
- Associated Recipe is **NOT automatically deleted**
- Recipe remains in database with `menuItem` ref pointing to inactive MenuItem
- **Problem:** Orphaned recipes exist

**Recommendation:**
```javascript
// After MenuItem.softDelete():
await Recipe.updateMany(
  { menuItem: this._id },
  { isActive: false, deletedAt: new Date() }
);
```

**Status: ⚠️ MEDIUM ISSUE — Orphaned recipes not cleaned up**

---

### What Happens When Ingredient is Deleted?

**Location:** `src/modules/inventory/controller/ingredient.controller.js` lines 57–61

```javascript
const ingredient = await Ingredient.findOneAndUpdate(
  { _id: req.params.id, merchant: merchantId },
  { isActive: false },  // ← Soft delete
  { new: true }
);
```

**Cascade Behavior:**
- Ingredient is soft-deleted (`isActive: false`)
- Recipe items array **remains unchanged** (no automatic update/removal)
- Recipe pre-save hook only checks existence, not `isActive` status
- Recipes can reference inactive ingredients

**Impact on Order Placement:**
- Recipe with deleted ingredient still appears valid to order system
- When order is placed, `deductIngredientAtomic()` tries to deduct on deleted ingredient
- Query at line 32 of stock.service.js includes `isActive: true` filter
- Deduction fails: `findOneAndUpdate` returns null → order fails with 409

**Gap:** No automatic invalidation of recipes; error occurs at order time (not at delete time)

**Status: ⚠️ MEDIUM ISSUE — Recipes reference deleted ingredients; errors surface at order time**

---

### Is Stock Deduction Wrapped in Same Transaction as Order Creation?

**Answer: YES, FULLY ATOMIC**

**Location:** `src/modules/order/service/OrderTransactionService.js` lines 80–152

```javascript
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    // 1. Order creation
    const createdOrder = await Order.create([{...}], { session });
    
    // 2. Customer stats (if applicable)
    await customer.save({ session });
    
    // 3. Stock deduction
    const { ingredients } = await InventoryService.deductForOrder(
      { merchantId, orderId: createdOrder._id, plan: deductionPlan, ... },
      session  // ← Session passed through
    );
    
    // 4. Notifications
    await NotificationService.notifyOrderPlaced(..., session);
  });
} finally {
  await session.endSession();
}
```

**ACID Guarantees:**
- All 4 operations succeed together or **all 4 rollback together**
- MongoDB enforces atomicity within transaction
- If deduction fails (line 138), entire order is rolled back
- **No partial order + partial deduction scenarios possible**

**Status: ✅ EXCELLENT — Transactional integrity confirmed**

---

### If Order is Canceled/Refunded, Is Stock Restored?

**Answer: NO, STOCK IS NOT AUTOMATICALLY RESTORED**

**Location:** `src/modules/order/service/OrderStateMachineService.js` lines 378–396

```javascript
if (toStatus === 'canceled') {
  order.canceledAt = new Date();
  if (!order.canceledBy && order.statusHistory?.length) {
    const last = order.statusHistory[order.statusHistory.length - 1];
    order.canceledBy = last.changedBy;
  }
  // ← No inventory restoration logic
}
```

**Current Behavior:**
- Order status changes to 'canceled'
- No stock restoration triggered
- Inventory remains deducted
- StockMovement records show type='out' but no corresponding type='return'

**Gap:** Manual inventory adjustment required:
- Staff must manually call `adjustStock(..., 'in', 'order_cancellation', orderId)`
- Or use inventory UI to manually add stock back

**Impact:**
- Lost inventory (not tracked as returned)
- Inaccurate stock levels
- Manual reconciliation required

**Recommendation:** Add stock restoration hook:
```javascript
if (toStatus === 'canceled' && order.status !== 'canceled') {
  // Restore stock for all items
  for (const item of order.items) {
    const ingredients = await Recipe.findOne({ menuItem: item.menuItem }).select('items');
    for (const ing of ingredients.items) {
      await InventoryService.adjustStock(
        order.merchant,
        ing.ingredient,
        ing.quantity * item.quantity,
        'return',
        'order_cancellation',
        order._id
      );
    }
  }
}
```

**Status: 🔴 CRITICAL ISSUE — No automatic stock restoration on order cancellation**

---

## 5. CONCURRENCY

### Can Two Simultaneous Orders Oversell (Race Condition)?

**Answer: NO — Protected by Atomic MongoDB Query**

**Scenario:** Ingredient with 5 units available, two concurrent orders each needing 4 units

**Protection Mechanism:**

**Location:** `src/modules/inventory/service/stock.service.js` lines 27–58

```javascript
async function deductIngredientAtomic(ingredientId, deductQty, context, session) {
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId, 
      currentStock: { $gte: deductQty },  // ← Atomic condition in query filter
      isActive: true 
    },
    { $inc: { currentStock: -deductQty } },  // ← Atomic increment
    { new: true, session }
  );
  
  if (!updated) {
    throw new AppError('Insufficient stock', 409);
  }
}
```

**Race Condition Timeline:**

| Time | Order 1 | Order 2 | Ingredient Stock |
|------|---------|---------|------------------|
| T0 | Read: stock = 5 | Read: stock = 5 | 5 |
| T1 | Try to deduct 4 (atomic query) | Try to deduct 4 (atomic query) | 5 |
| T2 | First query executes: $gte check PASSES, stock decremented | Waiting... | 1 |
| T3 | Query returns success | Second query executes: $gte check **FAILS** (1 < 4) | 1 |
| T4 | Order succeeds | Query returns null → throws 409 | 1 |

**Result:**
- **Order 1: ✅ SUCCEEDS** with 4 units deducted
- **Order 2: ❌ FAILS** with 409 Conflict (insufficient stock)
- **Final stock: 1 unit** (no overselling)

**Status: ✅ EXCELLENT — Atomic query prevents race condition**

---

### Are Purchase Order Stock Increases Safe?

**Answer: PARTIALLY — No Transaction Wrapping**

**Location:** `src/modules/inventory/controller/purchase-order.controller.js` lines 66–101

```javascript
exports.receivePurchaseOrder = catchAsync(async (req, res, next) => {
  const purchaseOrder = await PurchaseOrder.findOne({...});
  
  const { receivedItems } = req.body; // [{ ingredientId, receivedQuantity }, ...]

  for (const item of receivedItems) {
    const poItem = purchaseOrder.items.find(...);
    if (poItem) {
      // Each adjustStock call is independent — NO session/transaction wrapping
      await InventoryService.adjustStock(
        merchantId,
        item.ingredientId,
        item.receivedQuantity,
        'in',           // Stock increase
        'purchase',
        purchaseOrder.poNumber,
        req.user._id
      );
    }
  }

  purchaseOrder.status = 'received';
  purchaseOrder.actualDeliveryDate = new Date();
  await purchaseOrder.save();
});
```

**Problem:**
- Each `adjustStock()` call is a separate operation
- No MongoDB session/transaction wrapping
- If error occurs mid-receipt (e.g., 3 ingredients succeeded, 4th fails), partial updates are NOT rolled back
- PO status change could succeed even if some stock updates failed

**Gap: No Atomicity for PO Receipt**

**Recommendation:**
```javascript
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    for (const item of receivedItems) {
      await InventoryService.adjustStock(..., { session });
    }
    purchaseOrder.status = 'received';
    await purchaseOrder.save({ session });
  });
} finally {
  await session.endSession();
}
```

**Status: ⚠️ MEDIUM ISSUE — PO receipt not transactional**

---

### Can PO be Received Multiple Times?

**Location:** `src/modules/inventory/controller/purchase-order.controller.js` lines 70–71

```javascript
if (purchaseOrder.status === 'received')
  return next(new AppError('Purchase order already received', 400));
```

**Answer: NO — After first receipt, PO cannot be received again**

**Current Limitation:**
- Status check prevents double-receipt
- But `PurchaseOrder.js` schema allows `'partially_received'` status (not implemented)
- No support for multiple partial shipments
- Only single final receipt supported

**Status: ✅ Double-receipt prevented, but partial shipments not supported**

---

## 6. MERCHANT ISOLATION

### Are All Inventory Queries Merchant-Scoped?

**Answer: MOSTLY YES, but with one critical gap**

#### ✅ Repository Layer Scoping

**Location:** `src/modules/inventory/repository/inventory.repository.js`

All queries include merchant filter:
- Line 49: `findIngredients(filter)` includes `merchant: merchantId`
- Line 127: `findActiveRecipeForMenuItem(menuItemId, merchantId)` filters on merchant
- Line 156: `createStockMovements()` saves merchant on each record
- Line 180: `getPurchaseOrders()` filters by merchant

**Example:**
```javascript
static async findIngredients(filter, options = {}) {
  return Ingredient.find({
    merchant: filter.merchant,  // ← Always included
    ...filter,
  }).select(options.select).lean();
}
```

#### ⚠️ CRITICAL GAP: Stock Deduction Does NOT Filter by Merchant

**Location:** `src/modules/inventory/service/stock.service.js` lines 27–58

```javascript
async function deductIngredientAtomic(ingredientId, deductQty, context, session) {
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId,           // ← Only ingredient ID!
      currentStock: { $gte: deductQty },
      isActive: true 
    },
    { $inc: { currentStock: -deductQty } },
    { new: true, session }
  );
  
  // NO merchant filter!
}
```

**IDOR Risk:**
- If attacker knows an ingredient ID from another merchant
- Can deduct stock from a different merchant's ingredient
- Example: MerchantA places order, system looks up by ID only → could deduct from MerchantB's inventory

**The Fix (simple):**
```javascript
const updated = await Ingredient.findOneAndUpdate(
  { 
    _id: ingredientId,
    merchant: context.merchantId,  // ← Add this
    currentStock: { $gte: deductQty },
    isActive: true 
  },
  { $inc: { currentStock: -deductQty } },
  { new: true, session }
);
```

**How This Bug Manifests:**
1. MerchantA places order for Item with Recipe
2. `deductForOrder()` calls `deductIngredientAtomic()` with ingredientId (but no merchant context)
3. Function deducts on ANY ingredient with that ID, regardless of merchant
4. Cross-merchant inventory corruption possible

**Status: 🔴 CRITICAL ISSUE — IDOR vulnerability in stock deduction**

---

## 7. GENERAL PRODUCTION-READINESS

### Logging on Key Actions

**Location:** `src/modules/inventory/service/` and `src/modules/order/service/`

**Implemented Logging:**

| Action | Log Location | Level | Content |
|--------|---|-------|---------|
| Inventory disabled | `InventoryService.js:290` | INFO | `'inventory.recipe.skipped'` + menuItemId |
| Recipe missing | `InventoryService.js:302` | ERROR | `'inventory.recipe.error'` + reason |
| Order placement success | `OrderTransactionService.js:266` | INFO | `'order.place.success'` + orderId, merchantId, branchId |
| Stock insufficient | `OrderTransactionService.js:308` | WARN | `'order.place.inventory_failed'` + ingredients |
| Order placement failure | `OrderTransactionService.js:316` | ERROR | `'order.place.failed'` + full error |
| Stock deduction | `stock.service.js:61–68` | INFO | StockHistory record created (audit trail) |

**Gap: No Low-Stock Alert Logging**
- Alert status computed but not logged
- Staff must call GET `/inventory/low-stock` endpoint to discover low items
- No proactive notification when threshold crossed

**Status: ✅ GOOD — Order flow logged, but low-stock alerts missing**

---

### Tests

**Location:** `tests/`

**Inventory-Related Tests:**

| Test File | Coverage | Status |
|-----------|----------|--------|
| `order-cogs-integration.test.js` | COGS calculation, recipe requirements, inventory mode | ✅ Exists |
| `reports-endpoints-integration.test.js` | Inventory reporting, low-stock queries | ✅ Exists |
| `task-6-staff-order-session.test.js` | Order placement with ingredients setup | ✅ Exists |
| `task-19.2-profitability-mixed-cost.test.js` | COGS with/without recipes | ✅ Exists |

**Missing Tests:**

| Scenario | Status |
|----------|--------|
| Order cancellation → stock restoration | ❌ MISSING |
| Concurrent orders on limited stock | ❌ MISSING |
| PO receipt with partial items | ❌ MISSING |
| Cross-merchant IDOR deduction | ❌ MISSING |
| Recipe deletion cascade | ❌ MISSING |

**Status: ⚠️ MEDIUM ISSUE — Core scenarios tested, but edge cases and concurrency missing**

---

### Low-Stock Alerting

**Location:** `models/Ingredient.js` lines 91–140

**Alert Status Computation:**

```javascript
function computeAlertStatus(currentStock, minStock) {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock < minStock * 0.5) return 'CRITICAL';  // ← 50% threshold
  if (currentStock <= minStock) return 'LOW';
  return 'OK';
}
```

**Update Triggers:**
- Line 103–107: `pre('save')` — on direct save
- Line 110–117: `post('findOneAndUpdate')` — after stock deduction
- Line 120–123: `post('save')` — on save completion

**Three Alert Statuses:**
- `OUT_OF_STOCK`: 0 or less
- `CRITICAL`: < 50% of minStock
- `LOW`: ≤ minStock
- `OK`: > minStock

**Staff Access:**

**Endpoint:** `GET /api/v1/inventory/low-stock`  
**Location:** `src/modules/inventory/inventory.routes.js` line 47  
**Requires:** `inventory.read` permission

**Response:**
```json
{
  "status": "success",
  "count": 3,
  "data": {
    "items": [
      {
        "_id": "...",
        "name": "Tomato",
        "currentStock": 2,
        "minStock": 10,
        "unit": "kg",
        "status": "CRITICAL"
      }
    ]
  }
}
```

**Reactive Only:**
- Staff must manually call endpoint (no automatic notification)
- Alert status updates on stock changes, not scheduled
- No background job monitors for threshold breaches
- No email/SMS/Slack notifications on low-stock

**Gap: No Proactive Alerting**

**Recommendation:**
```javascript
// Background job (e.g., every 30 minutes)
async function checkLowStockAndNotify() {
  const lowItems = await Ingredient.find({
    alertStatus: { $in: ['LOW', 'CRITICAL', 'OUT_OF_STOCK'] }
  }).populate('merchant');
  
  for (const item of lowItems) {
    await NotificationService.alert(item.merchant._id, {
      type: 'low_stock',
      ingredient: item.name,
      status: item.alertStatus,
      url: `/inventory/low-stock`
    });
  }
}
```

**Status: ⚠️ MEDIUM ISSUE — No automatic low-stock notifications; staff must manually check**

---

## CRITICAL FINDINGS SUMMARY

| Issue | Severity | Category | Location | Impact |
|-------|----------|----------|----------|--------|
| No stock restoration on order cancellation | 🔴 CRITICAL | Data Integrity | OrderStateMachineService.js | Lost inventory, manual reconciliation required |
| IDOR vulnerability in stock deduction | 🔴 CRITICAL | Security | stock.service.js:32 | Cross-merchant inventory corruption possible |
| PO receipt not transactional | ⚠️ MEDIUM | Concurrency | purchase-order.controller.js | Partial updates on failure; PO status inconsistent |
| Recipe validation skips isActive check | ⚠️ MEDIUM | Data Integrity | Recipe.js:73 | Orphaned recipes reference deleted ingredients |
| MenuItem deletion doesn't cascade | ⚠️ MEDIUM | Data Integrity | MenuItem.model.js | Recipes remain linked to inactive items |
| No automatic low-stock alerting | ⚠️ MEDIUM | Operational | Ingredient.js | Staff must manually check; delays on critical shortages |
| Missing concurrency tests | ⚠️ MEDIUM | Testing | tests/ | Edge cases untested (simultaneous orders, etc.) |

---

## ORDER-INVENTORY BLOCKING STATUS

### ❓ Are merchants currently blocked from placing orders if they don't have inventory tracking set up?

**Answer: NO — No Blocking Issue** ✅

**Current Behavior:**
- Inventory module defaults to **DISABLED** per merchant
- Merchants without inventory setup can place orders successfully
- Stock deduction is skipped entirely when disabled
- Orders go through normally

**Proof:**
```javascript
// InventoryService.js:283
if (!merchant.hasFeature('inventory')) {
  return [];  // Empty deduction plan
}

// OrderTransactionService.js:138
const { ingredients } = await InventoryService.deductForOrder(
  { plan: deductionPlan, ... }
);  // Succeeds with empty plan
```

**Recommendation:**
- **No immediate action needed** — merchants can opt into inventory tracking
- Address CRITICAL issues (#1 and #2 above) before enabling inventory feature widely
- Add toggle in merchant onboarding: "Enable inventory tracking?" (default: No)

---

## RECOMMENDATIONS (Priority Order)

### 🔴 CRITICAL (Fix Before Using Inventory Feature in Production)

1. **Add merchant filter to stock deduction** (`stock.service.js:32`)
   - Prevent IDOR cross-merchant inventory corruption
   - Add `merchant: context.merchantId` to findOneAndUpdate filter

2. **Implement stock restoration on order cancellation** (`OrderStateMachineService.js:378`)
   - Call `adjustStock(..., 'return', 'order_cancellation')` when order transitions to cancelled
   - Create StockMovement record for audit trail

### ⚠️ MEDIUM (Address Before Broad Inventory Rollout)

3. **Wrap PO receipt in transaction** (`purchase-order.controller.js:81`)
   - Use MongoDB session for all ingredient updates + PO status change
   - Ensures atomic all-or-nothing semantics

4. **Add isActive check to recipe ingredient validation** (`Recipe.js:73`)
   - Filter: `Ingredient.findOne({ _id: item.ingredient, isActive: true })`
   - Prevent recipes from referencing deleted ingredients

5. **Add cascade soft-delete for recipes** (`MenuItem.model.js:385`)
   - When MenuItem is deleted, also delete associated recipes
   - Prevents orphaned recipe records

6. **Add low-stock alert background job**
   - Every 30 minutes, check for items with LOW/CRITICAL/OUT_OF_STOCK status
   - Send notifications to merchants (email/SMS/Slack)

### 📋 LOW (Nice-to-Have)

7. **Add integration tests for concurrency scenarios**
   - Simultaneous orders on limited stock
   - PO receipt with multiple ingredients
   - Order cancellation + concurrent new orders

8. **Support partial shipments for POs**
   - Implement `'partially_received'` workflow
   - Track which items fully received vs. pending

---

## CONCLUSION

**Overall Production Readiness: ⚠️ CONDITIONAL**

✅ **Safe to Use (Default):**
- Inventory module is disabled by default
- Merchants can place orders without inventory setup
- No blocking issues for merchants not using inventory

❌ **NOT Production Ready (If Inventory Enabled):**
- CRITICAL IDOR vulnerability in stock deduction
- No stock restoration on order cancellation
- PO receipt not transactional
- Missing low-stock alerting

**Recommended Action:**
- Deploy inventory module in **read-only mode** initially (queries, reports, no mutations)
- Fix CRITICAL issues #1 and #2 before enabling stock mutations
- Keep inventory disabled for all merchants until fixes applied
- Roll out gradually with monitoring

---

**Audit Completed:** September 3, 2026  
**Auditor:** Kiro Production Readiness Team
