# Multi-Branch Inventory Architecture Analysis

**Date:** September 3, 2026  
**Scope:** Understanding stock scoping, branch isolation, and data model implications for merchants with multiple branches

---

## ANSWER: Does Ingredient Model Have Branch Field?

**SHORT ANSWER: NO** ❌

**Ingredient** (`models/Ingredient.js`) is **merchant-wide only**, with these fields:
- `merchant` (ObjectId, required, indexed) — Tenant scoping
- `currentStock` (Number, default 0) — **SHARED across all branches**
- `reservedStock` (Number, default 0) — **SHARED across all branches**
- `minStock, maxStock, reorderQuantity` — **Applied globally**
- `alertStatus` (enum: OK | LOW | CRITICAL | OUT_OF_STOCK) — **Based on global currentStock**
- No `branch` field exists

**There is NO per-branch stock tracking at the Ingredient level.**

---

## How Multi-Branch Systems Are Currently Affected

### Scenario: Two Branches, One Menu Item

**Setup:**
- Merchant "Tiru Restaurant" has Branch A (Downtown) and Branch B (Mall)
- Both branches sell "Burger" (same MenuItem)
- Recipe for Burger requires 0.5kg of Patty per unit
- Global Patty stock: 100kg

### Current Behavior (Shared Stock):

#### Day 1: Branch A Places Order

```
Event: Branch A orders 100 Burgers
  → Stock deduction calculation:
    - Recipe.items: [{ ingredient: Patty, quantity: 0.5 }]
    - Deduct qty: 0.5kg * 100 burgers = 50kg
  → Database update:
    Ingredient.findOneAndUpdate(
      { _id: Patty._id, merchant: merchantId },  // ← No branch check
      { $inc: { currentStock: -50 } }
    )
  → Global Patty stock: 100kg → 50kg
  → StockHistory created with branch: BranchA
```

#### Day 2: Branch B Tries to Order

```
Event: Branch B orders 150 Burgers
  → Stock deduction calculation:
    - Recipe.items: [{ ingredient: Patty, quantity: 0.5 }]
    - Deduct qty: 0.5kg * 150 burgers = 75kg
  → Database query to check availability:
    Ingredient.findOne({ _id: Patty._id, currentStock: { $gte: 75 } })
  → FAILS: currentStock is 50kg (after Branch A's deduction)
  → Order placement FAILS with 409 "Insufficient stock"
  → StockHistory shows no entry for Branch B (order never placed)

Result: Branch B CANNOT place order, even though their operations are independent.
```

#### Visual Timeline:

```
Day 1:
  Branch A: Orders 100 Burgers → Uses 50kg Patties
  Global Patty Stock: 100kg → 50kg
  
Day 2:
  Branch B: Tries to order 150 Burgers → Needs 75kg
  Check: Is currentStock (50kg) >= 75kg? NO
  Status: ❌ ORDER REJECTED

Day 2 Alternative (if Branch A had ordered more):
  Branch A: Orders 150 Burgers → Uses 75kg Patties
  Global Patty Stock: 100kg → 25kg
  
Day 3:
  Branch B: Tries to order 100 Burgers → Needs 50kg
  Check: Is currentStock (25kg) >= 50kg? NO
  Status: ❌ ORDER REJECTED (insufficient global stock)
```

### The Problem: Cross-Branch Stock Contention

**All branches share a single global stock pool.** This means:

1. **Branch A's usage reduces stock available to Branch B**
2. **No branch-level visibility:** Staff at Branch B can't see how much stock their branch owns
3. **No branch reservation:** If Branch A is high-demand, Branch B starves
4. **No branch-level overrides:** Can't allocate 50% stock to Branch A and 50% to Branch B
5. **All audit trails are branch-aware but stock is not:** StockHistory shows which branch used stock, but there's no way to undo it per-branch

---

## Recipe and MenuItem Scoping

### MenuItem Scoping: MERCHANT-WIDE

**Location:** `src/modules/menu/model/MenuItem.model.js`

**Top-level fields:**
- `merchant` (ObjectId, required, indexed) — Tenant scoping
- `categoryId` (ObjectId, ref: Category)
- `name, description` — Multilingual (en, am)
- `type` (enum: food | drink)
- `price` — Base price
- `recipe` (ObjectId, ref: Recipe) — Link to ingredients
- `variants` — Size/price variations
- `staticIngredients` — Display-only for non-inventory merchants

**KEY: NO branch field on MenuItem**

MenuItems are **shared across all branches of a merchant**. If Burger is on the merchant's menu, both Branch A and Branch B can sell it.

### Branch-Level Customization: BranchMenu Model

**Location:** `models/branchMenuModel.js`

BranchMenu provides **branch-specific overrides** but does NOT control stock:

```javascript
{
  branch: { type: ObjectId, required },          // Which branch
  menuItem: { type: ObjectId, ref: 'Menu' },    // Master item (optional)
  
  // Override fields (only if menuItem exists)
  overridePrice: Number,                         // Different price at this branch
  overrideName: String,                          // Different name at this branch
  overrideVariants: Array,                       // Different sizes/prices
  overrideImage: String,                         // Different image at this branch
  isHidden: Boolean,                             // Hide item at this branch
  isAvailable: Boolean,                          // Availability toggle (but not stock-linked)
  
  manualOverride: {
    enabled: Boolean,                            // Force ordering despite low stock
    reason: String,
    setBy: ObjectId,
    expiresAt: Date,
  }
}
```

**Important:** The `manualOverride.enabled` flag is **just an override flag**, not a stock allocation. It allows ordering even with `alertStatus: CRITICAL` or `OUT_OF_STOCK`, but it doesn't reserve or allocate stock to that branch.

### Recipe Scoping: MERCHANT-WIDE

**Location:** `models/Recipe.js`

**Top-level fields:**
- `merchant` (ObjectId, required, indexed) — Tenant scoping
- `menuItem` (ObjectId, required, ref: Menu) — Links to MenuItem
- `items` — Array of ingredients:
  - `ingredient` (ObjectId, ref: Ingredient)
  - `quantity` (Number)
  - `unit` (String)
- Unique index on `{merchant, menuItem}` — One recipe per item per merchant

**KEY: NO branch field on Recipe**

Recipes are **merchant-wide and Ingredient-centric**. When any branch orders "Burger", the same recipe is used, pulling from the same global Ingredient pool.

### Relationships Diagram:

```
Merchant
  ├── MenuItem (merchant-scoped)
  │   ├── Recipe (merchant-scoped, unique per item)
  │   │   └── RecipeItem[] → Ingredient[] (merchant-scoped)
  │   └── Variants (merchant-scoped)
  │
  ├── BranchMenu (branch-scoped overrides)
  │   └── References MenuItem (optional)
  │   └── Customizes: price, availability, image, name
  │   └── DOES NOT control stock
  │
  ├── Branch (per-branch operations)
  │   ├── Table (branch-specific)
  │   ├── Order (branch-specific)
  │   │   └── OrderItem[] 
  │   │       └── References MenuItem (merchant-scoped)
  │   └── KitchenStation (branch-specific)
  │
  ├── Ingredient (merchant-scoped stock)
  │   ├── currentStock (global)
  │   ├── reservedStock (global)
  │   └── StockHistory (audit trail with branch field)
  │
  └── PurchaseOrder (merchant-scoped inbound)
      └── References Ingredient
      └── Updates global currentStock
```

---

## Stock Deduction Flow — How Branch Field is Used

### Current Implementation

**File:** `src/modules/inventory/service/stock.service.js`

**Function:** `deductIngredients(orderId, userId)`

```javascript
async function deductIngredients(orderId, userId) {
  const order = await Order.findById(orderId);  // Has branch field
  
  const deductions = [];
  
  for (const orderItem of order.items) {  // Each order item (e.g., Burger x5)
    const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
      .populate('items.ingredient');  // Merchant-scoped recipe lookup
    
    for (const recipeItem of recipe.items) {  // Each ingredient (e.g., Patty, Tomato)
      const deductQty = recipeItem.quantity * orderItem.quantity;
      
      const updated = await deductIngredientAtomic(
        recipeItem.ingredient._id,
        deductQty,
        {
          orderId: order._id,
          userId,
          merchantId: order.merchant,          // ← Merchant context (after IDOR fix)
          branchId: order.branch,              // ← Branch context (audit only)
        }
      );
      
      deductions.push({
        ingredientId: recipeItem.ingredient._id,
        quantity: deductQty,
        previousStock: updated.currentStock + deductQty,
      });
    }
  }
  
  return { success: true, deductions };
}
```

### Atomic Deduction (After IDOR Fix)

**File:** `src/modules/inventory/service/stock.service.js` lines 36-49

```javascript
async function deductIngredientAtomic(ingredientId, deductQty, context) {
  const { orderId, userId, merchantId, branchId } = context;
  
  // Atomic update
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId,
      merchant: merchantId,     // ← IDOR fix: merchant check
      // NOTE: NO branchId check here!
      currentStock: { $gte: deductQty },
      isActive: true 
    },
    { 
      $inc: { currentStock: -deductQty },  // ← Global stock updated
      $set: { lastUpdated: new Date() }
    },
    { new: true }
  );
  
  // ... error handling ...
  
  // Create audit record WITH branch field
  await StockHistory.create({
    ingredient: ingredientId,
    merchant: merchantId,
    branch: branchId,          // ← Branch is recorded for audit
    action: 'USED',
    quantity: deductQty,
    stockBefore: updated.currentStock + deductQty,
    stockAfter: updated.currentStock,
    orderId,
    recordedBy: userId,
    recordedAt: new Date(),
  });
  
  return updated;
}
```

### Key Points:

1. **Branch context is passed through but not used in the query** — `branchId` is only for StockHistory
2. **Merchant filter is applied** (after IDOR fix) — prevents cross-merchant deduction
3. **Global currentStock is updated** — no branch-level scoping
4. **StockHistory captures branch** — audit trail shows which branch caused deduction

---

## Stock History: Evidence of Current Behavior

**File:** `models/StockHistory.js`

```javascript
{
  ingredient: ObjectId,           // Which ingredient
  merchant: ObjectId,             // Which merchant
  branch: ObjectId,               // Which branch used/received it ← Branch field EXISTS here
  action: enum [...],             // USED, RESERVED, RELEASED, CORRECTED, etc.
  quantity: Number,               // How much
  stockBefore: Number,            // Before state
  stockAfter: Number,             // After state
  orderId: ObjectId,              // Which order (if any)
  recordedBy: ObjectId,           // Who recorded it
  recordedAt: Date,
  // ... other audit fields ...
}

// Indexes
index({ ingredient: 1, recordedAt: -1 });
index({ merchant: 1, branch: 1, action: 1 });  // ← Can query by branch
index({ merchant: 1, branch: 1, recordedAt: -1 });
index({ orderId: 1 });
```

**This proves that branch information is tracked**, but it's **post-fact audit** rather than **active inventory isolation**.

---

## Data Model Summary Table

| Model | Scope | Branch Field? | Stock Impact |
|-------|-------|----------------|-----------|
| **Ingredient** | Merchant-wide | ❌ NO | Single global currentStock for all branches |
| **MenuItem** | Merchant-wide | ❌ NO | Shared across all branches; variants are merchant-scoped |
| **Recipe** | Merchant-wide | ❌ NO | One recipe per item per merchant; uses merchant ingredients |
| **Order** | Branch-specific | ✅ YES (required) | Order knows its branch; but doesn't isolate stock |
| **BranchMenu** | Branch-specific | ✅ YES (required) | Price/availability overrides; doesn't control stock |
| **StockHistory** | Audit trail | ✅ YES (required) | Records which branch caused deduction; retroactive tracking |
| **PurchaseOrder** | Merchant-wide | ❌ NO | Inbound stock goes to global pool |

---

## Multi-Branch Stock Problem Summary

### Current Architecture:
```
Merchant (1)
  ├─ Ingredient.currentStock = 100kg (GLOBAL)
  ├─ Branch A (Downtown)
  │  └─ Can place order → Deducts from GLOBAL stock
  └─ Branch B (Mall)
     └─ Can place order → Deducts from SAME GLOBAL stock
     
Result: Branches compete for shared inventory.
```

### Impact by Use Case:

**✅ WORKS WELL FOR:**
- Single-location merchants (no branch conflict)
- Merged/centralized inventory (intentionally shared stock)
- Corporate operations wanting global visibility

**❌ DOES NOT WORK FOR:**
- Franchise models (each location is independent)
- Branch autonomy (each location wants its own stock)
- Mixed supply chains (some ingredients branch-specific, some shared)

---

## Architecture Fix Options (NOT IMPLEMENTED YET)

### Option 1: Add Branch Field to Ingredient (Simplest)

**Approach:** Make Ingredient branch-scoped instead of merchant-scoped

**Schema change:**
```javascript
ingredientSchema.add({
  merchant: { required, indexed },
  branch: { required, indexed },  // ← NEW: each branch has its own ingredient stock
  currentStock: { per-branch stock },
  // ... same fields ...
});

index({ merchant: 1, branch: 1, name: 1 });  // Unique per branch
```

**Impact:**
- Branch A and Branch B each have separate "Burger Patty" ingredient record
- Order deduction query becomes: `{ merchant, branch, name }`
- Isolation is automatic: Branch A's order doesn't affect Branch B's stock
- **Breaking change:** Existing Ingredient data would need migration

### Option 2: Create BranchIngredient Model

**Approach:** Keep Ingredient merchant-scoped; add separate BranchIngredient for per-branch overrides

**New model:**
```javascript
branchIngredientSchema = {
  merchant: ObjectId,
  branch: ObjectId,
  ingredient: ObjectId,             // Reference to merchant-scoped ingredient
  branchCurrentStock: Number,       // Branch-specific stock
  branchReservedStock: Number,
  branchMinStock: Number,           // Can differ per branch
  branchMaxStock: Number,
  isAvailable: Boolean,             // Hide/show at this branch
  // ... branch-specific configs ...
}
```

**Impact:**
- Backward compatible: existing Ingredient data untouched
- Per-branch stock is additive/optional
- If BranchIngredient exists, use it; otherwise fallback to Ingredient
- More complex query logic (check both tables)

### Option 3: Stock Allocation Pool (Most Flexible)

**Approach:** Keep Ingredient global; create StockAllocation records per branch

**New model:**
```javascript
stockAllocationSchema = {
  merchant: ObjectId,
  branch: ObjectId,
  ingredient: ObjectId,
  allocatedQuantity: Number,        // Amount reserved for this branch
  // ... timestamps ...
}
```

**Impact:**
- Fully backward compatible
- Allows dynamic reallocation
- Query becomes: check (BranchAllocation.allocated - used) >= needed
- Complex business logic for allocation management

---

## Critical Findings

### 🔴 CRITICAL:
1. **No branch-level stock isolation** — All branches share global ingredient stock
2. **Branch field in orders exists but unused** — branch.id is recorded but doesn't control deductions
3. **Cross-branch contention possible** — High-volume branch can exhaust stock for other branches

### ⚠️ MEDIUM:
1. **Merchant staff can't see per-branch stock** — No reporting on "Branch A has 50kg of Patties"
2. **Manual override is all-or-nothing** — BranchMenu.manualOverride bypasses stock checks entirely, no partial allocation
3. **PurchaseOrder doesn't allocate to branches** — Received stock goes to global pool, no way to designate "this PO is for Branch A only"

### ℹ️ INFORMATIONAL:
1. MenuItem and Recipe are merchant-wide (expected, supports shared menus)
2. StockHistory correctly captures branch context (audit trail is good)
3. BranchMenu provides customization layer (price, availability) but not inventory control

---

## Recommendation

**Before deciding on a fix, answer these business questions:**

1. **Do your merchants typically have independent branches, or do they share inventory?**
   - Independent → Need per-branch stock (Option 1 or 2)
   - Shared → Current model is fine

2. **Should all branches use the same recipe, or can recipes vary per branch?**
   - Same → Current architecture is fine (MenuItem & Recipe are merchant-scoped)
   - Variant → Would need separate Recipe per branch (larger refactor)

3. **Should stock adjustments (PurchaseOrder receipts) be branch-specific?**
   - Yes → Need branch-scoped Ingredient or allocation table
   - No → Current model is fine

4. **Is the branch field on StockHistory sufficient for your audit/reporting needs?**
   - Yes → Current model works; just document it
   - No → Need real-time per-branch stock queries (requires schema change)

**Current Status:** The system works for merchants with **shared inventory across branches** but does NOT isolate stock per branch. Choose your architecture based on business model.

---

**Files Referenced:**
1. `models/Ingredient.js` — No branch field
2. `models/Recipe.js` — Merchant-scoped
3. `src/modules/menu/model/MenuItem.model.js` — Merchant-scoped
4. `models/orderModel.js` — Has branch field (audit only)
5. `models/branchMenuModel.js` — Branch-scoped overrides (price, not stock)
6. `models/StockHistory.js` — Has branch field (post-fact audit)
7. `src/modules/inventory/service/stock.service.js` — Deduction flow (merchant-scoped after IDOR fix)
