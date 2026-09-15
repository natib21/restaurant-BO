# Complete Inventory Architecture: Conceptual + Code-Level Explanation

## Overview

This restaurant POS system uses a **multi-tenant, branch-isolated inventory model**. Each merchant can have multiple branches, each branch has its own ingredient stocks, and when a customer orders a MenuItem, the system:

1. **Resolves which ingredients** the MenuItem's recipe requires
2. **Aggregates by ingredient** across multiple order items
3. **Deducts from the ordering branch's inventory** (atomically, in one transaction)
4. **Creates an audit trail** in StockHistory

---

## 1. Ingredient Model

**What it represents:** Physical stock items a restaurant manages (chicken, tomato, rice, etc.). Each ingredient exists **per branch per merchant** — Branch A's chicken stock is completely separate from Branch B's chicken stock.

### Schema Fields

```javascript
{
  merchant: ObjectId,           // Multi-tenant scoping
  branch: ObjectId,             // ✅ BRANCH ISOLATION: Stock is per-branch
  name: String,                 // "Chicken", "Tomato", "Rice"
  category: enum,               // vegetables, meat, dairy, grains, spices, beverages, other
  unit: enum,                   // kg, g, liter, ml, pieces, boxes, cans
  currentStock: Number,         // 50 kg
  minStock: Number,             // Alert if below this
  maxStock: Number,             // Alert if above this
  reservedStock: Number,        // Stock held for pending orders
  reorderQuantity: Number,      // How much to order on restock
  alertStatus: enum,            // OK, LOW, CRITICAL, OUT_OF_STOCK (auto-computed)
  costPerUnit: Number,          // ✅ CRITICAL: Used for COGS calculation
  supplier: ObjectId,           // Link to Supplier
  isActive: Boolean,            // Soft delete
  lastRestocked: Date,
  expiryDate: Date,
}
```

### Branch/Merchant Scoping

**Unique Constraint:**
```javascript
{ merchant: 1, branch: 1, name: 1, unit: 1 }
```

This prevents duplicate "Chicken (kg)" in the same branch, but allows "Chicken (kg)" to exist independently in each branch.

**Query Example:**
```javascript
// Get chicken stock for Branch A of Merchant X
Ingredient.findOne({
  merchant: merchantId,
  branch: branchAId,
  name: "Chicken",
  unit: "kg"
});
```

### Alert Status (Auto-Computed)

Runs on save and after findOneAndUpdate:

```javascript
if (currentStock <= 0) return 'OUT_OF_STOCK';
if (currentStock < minStock * 0.5) return 'CRITICAL';
if (currentStock <= minStock) return 'LOW';
return 'OK';
```

Virtual field `stockStatus` maps this to: `in_stock`, `low_stock`, `out_of_stock`, `over_stock`

---

## 2. Recipe Model

**What it represents:** The formula for a MenuItem — which ingredients and how much of each goes into making one serving.

### Schema Structure

```javascript
{
  merchant: ObjectId,           // Must match MenuItem.merchant
  menuItem: ObjectId,           // Reference to MenuItem
  name: String,                 // "Doro Wat Recipe"
  items: [
    {
      ingredientName: String,   // ✅ NAME-BASED, not ObjectId
      quantity: Number,         // 0.5
      unit: String,             // "kg"
    }
  ],
  totalCost: Number,            // Σ(quantity × costPerUnit) / yield
  yield: Number,                // How many servings (default 1)
  isActive: Boolean,
}
```

### Key Design: Name-Based Ingredient Resolution

**Why:** Instead of storing `ingredient: ObjectId`, recipes store `ingredientName: String`. This enables **branch-level isolation**:

- Same recipe works across all branches
- At deduction time, lookup resolves to the **branch-specific ingredient**:
  ```javascript
  // During order processing for Branch A
  Ingredient.findOne({
    merchant: merchantId,
    branch: branchAId,                // ← Branch A's stock
    name: recipeItem.ingredientName,  // ← "Chicken"
    unit: recipeItem.unit,            // ← "kg"
  });
  ```

### Pre-Save Validation

```javascript
// For each item in recipe.items:
const ingredient = await Ingredient.findOne({
  merchant: this.merchant,
  name: item.ingredientName,
  unit: item.unit,
  isActive: true,
});
if (!ingredient) {
  throw new Error(`Ingredient "${item.ingredientName}" (${item.unit}) not found`);
}
// Calculate totalCost = Σ(quantity × costPerUnit) / yield
```

### Unique Index

```javascript
{ merchant: 1, menuItem: 1 }  // One recipe per MenuItem per merchant
```

---

## 3. MenuItem Model

**What it represents:** A menu item customers can order (Doro Wat, Kitfo, Tej, etc.). Can have variants (Small, Large).

### Schema Fields (Inventory-Relevant)

```javascript
{
  merchant: ObjectId,           // Multi-tenant
  categoryId: ObjectId,         // Category reference
  name: {en: String, am: String}, // Multilingual
  type: enum,                   // 'food' or 'drink'
  
  // COGS Fields
  price: Number,                // Selling price (default variant)
  costPrice: Number,            // Simple COGS (if inventory disabled)
  
  // Recipe Link
  recipe: ObjectId,             // Reference to Recipe (nullable)
  
  // Display when inventory disabled
  staticIngredients: [
    {
      name: String,
      quantity: Number,
      unit: String,
    }
  ],
  
  kitchenStation: ObjectId,     // KDS integration
  requiresKitchen: Boolean,     // If false, item doesn't generate kitchen tickets
  
  variants: [
    {
      name: String,             // "Small", "Large"
      price: Number,
      available: Boolean,
    }
  ],
  
  publishStatus: enum,          // draft, published, archived
  available: Boolean,
  inStock: Boolean,
}
```

### Feature-Flag Aware COGS

**When inventory module ENABLED:**
- Recipe is REQUIRED
- COGS = Σ(recipeItem.quantity × ingredient.costPerUnit)
- Throws error if recipe missing

**When inventory module DISABLED:**
- Recipe optional (for display only via staticIngredients)
- COGS = menuItem.costPrice (simple field)
- No stock deduction happens

---

## 4. Order & OrderItem Models

### Order Schema (Inventory-Relevant Fields)

```javascript
{
  merchant: ObjectId,           // Multi-tenant
  branch: ObjectId,             // ✅ Which branch this order is for
  
  orderNumber: String,          // #T5-467 (table), #TAKE-120 (takeaway), #DEL-980 (delivery)
  orderType: enum,              // dine_in, takeaway, delivery
  source: enum,                 // qr, staff, web, telegram, admin
  
  session: ObjectId,            // ✅ Link to DiningSession (for dine-in)
  table: ObjectId,              // Table reference (dine_in only)
  
  items: [orderItemSchema],     // Array of ordered items
  
  subtotal: Number,             // Sum of all item totalPrice
  totalAmount: Number,          // subtotal + tax - discount + delivery fee
  
  status: enum,                 // pending, accepted, preparing, ready, etc.
  paymentStatus: enum,          // unpaid, paid, refunded
  
  placedAt: Date,
  placedBy: ObjectId,           // User who created order
}
```

### OrderItem Schema (CRITICAL for Inventory)

```javascript
{
  menuItem: ObjectId,           // Reference to MenuItem
  name: String,                 // ✅ SNAPSHOTTED from MenuItem.name.en at order time
  quantity: Number,             // How many of this item
  
  unitPrice: Number,            // ✅ SERVER-COMPUTED, never from client
  unitCost: Number,             // ✅ COGS per unit (from recipe or null)
  totalPrice: Number,           // quantity × unitPrice
  
  requiresKitchen: Boolean,     // ✅ SNAPSHOTTED from MenuItem at order time
  status: enum,                 // pending, in_progress, ready, served, void
  
  // Item-level workflow
  servedAt: Date,
  servedBy: ObjectId,
  voidedAt: Date,
  voidReason: String,
  replacementItemId: ObjectId,  // For item replacement tracking
}
```

### Why Snapshot?

When OrderItem is created, we **snapshot** `name`, `unitPrice`, `requiresKitchen` from MenuItem. This prevents retroactive menu changes from affecting historical orders:

- Menu staff changes Doro Wat price from 150 to 200
- Old orders still show unitPrice: 150 (what customer was charged)
- KDS still knows requiresKitchen: true (what was needed at that time)

---

## 5. StockHistory Model

**What it represents:** Immutable audit log of all inventory movements.

### Schema Fields

```javascript
{
  ingredient: ObjectId,         // Which ingredient
  merchant: ObjectId,           // Which merchant
  branch: ObjectId,             // ✅ Which branch
  
  action: enum,                 // ADDED, USED, RESERVED, RELEASED, ADJUSTED, WASTE, CORRECTED
  
  quantity: Number,             // Amount moved
  stockBefore: Number,          // Snapshot before action
  stockAfter: Number,           // Snapshot after action
  
  unit: String,                 // "kg", "liter", etc.
  
  // Context
  orderId: ObjectId,            // Link to Order (for USED/RELEASED actions)
  reason: String,               // "order_consumption", "stocktake", etc.
  
  recordedBy: ObjectId,         // User who caused this movement
  recordedAt: Date,             // When it happened
}
```

### Index for Queries

```javascript
{ merchant: 1, branch: 1, action: 1 }       // Find all USED entries for branch
{ orderId: 1 }                              // Find all movements for an order
{ ingredient: 1, recordedAt: -1 }           // Ingredient's full history
```

---

## 6. Complete Order → Ingredient Deduction Flow

### Entry Point: OrderService.staffPlaceOrder()

**File:** `src/modules/order/service/OrderService.js` (line 333)

```javascript
static async staffPlaceOrder(data, req) {
  const { items, branchId, merchantId, performedBy } = data;
  
  // STEP 1: Build order items (compute prices server-side)
  const { orderItems, subtotal } = await OrderService.buildOrderItems(
    items,
    merchantId
  );
  
  // STEP 2: Resolve which ingredients to deduct
  const deductionPlan = await InventoryService.resolveDeductionPlan(
    orderItems,
    merchantId
  );
  
  // STEP 3: Create order + deduct inventory (atomically)
  const mongoSession = await mongoose.startSession();
  try {
    return await mongoSession.withTransaction(async () => {
      // Create order
      const [order] = await OrderRepository.create([...], { session: mongoSession });
      
      // Deduct inventory in same transaction
      await InventoryService.deductForOrder(
        {
          merchantId,
          branchId,
          orderNumber: order.orderNumber,
          plan: deductionPlan,
          performedBy,
        },
        mongoSession
      );
      
      return { order };
    });
  } finally {
    mongoSession.endSession();
  }
}
```

---

### Step 1: Build Order Items

**Function:** `OrderService.buildOrderItems(items, merchantId)` (line 276)

For each item in request:

```javascript
// (1) Fetch MenuItem
const menuItem = await MenuItem.findOne({
  _id: item.menuItemId,
  merchant: merchantId,
  available: true,
  deletedAt: null,
});

// (2) Extract pricing (server-only)
const quantity = item.quantity;
const unitPrice = menuItem.price;           // From MenuItem, NOT client
const totalPrice = quantity * unitPrice;

// (3) Calculate COGS (feature-flag aware)
const unitCost = await OrderService.calculateMenuItemCost(
  menuItem,
  merchantId
);

// (4) Build order item
orderItems.push({
  menuItem: menuItem._id,
  name: menuItem.name.en,                 // Snapshot English name
  quantity,
  unitPrice,                              // Server-computed
  unitCost,                               // From recipe or costPrice
  totalPrice,
  requiresKitchen: menuItem.requiresKitchen, // Snapshot
  status: 'pending',
});
```

**calculateMenuItemCost() logic:**

```javascript
static async calculateMenuItemCost(menuItem, merchantId) {
  const merchant = await Merchant.findById(merchantId);
  
  if (!merchant.hasFeature('inventory')) {
    // Inventory disabled: use simple costPrice
    return menuItem.costPrice || 0;
  }
  
  // Inventory enabled: calculate from recipe
  if (!menuItem.recipe?.ingredients?.length) {
    // No recipe: fallback to costPrice
    return menuItem.costPrice || 0;
  }
  
  // Get ingredients
  const ingredientIds = menuItem.recipe.ingredients.map(ri => ri.ingredient);
  const ingredients = await Ingredient.find({
    _id: { $in: ingredientIds },
    isActive: true,
  }).select('_id costPerUnit').lean();
  
  // Aggregate cost
  let totalCost = 0;
  for (const recipeIngredient of menuItem.recipe.ingredients) {
    const ingredient = ingredients.find(i => String(i._id) === String(recipeIngredient.ingredient));
    if (!ingredient?.costPerUnit) return menuItem.costPrice || 0; // Fallback
    totalCost += recipeIngredient.quantity * ingredient.costPerUnit;
  }
  
  return totalCost;
}
```

**Result:**
```javascript
orderItems = [
  {
    menuItem: ObjectId,
    name: "Doro Wat",
    quantity: 2,
    unitPrice: 150,          // Server: from MenuItem
    unitCost: 45,            // From recipe ingredients
    totalPrice: 300,
    requiresKitchen: true,   // Snapshotted
    status: "pending"
  }
]
```

---

### Step 2: Resolve Deduction Plan

**Function:** `InventoryService.resolveDeductionPlan(orderItems, merchantId)` (line 143)

```javascript
static async resolveDeductionPlan(orderItems, merchantId) {
  const aggregated = new Map();  // ingredientId → totalQuantity
  
  for (const orderItem of orderItems) {
    // Get ingredients for this MenuItem
    const ingredientUsage = await this.getIngredientUsageForMenuItem(
      orderItem.menuItem,
      merchantId
    );
    
    // Aggregate across order items
    for (const usage of ingredientUsage) {
      const key = usage.ingredientId.toString();
      const lineQty = usage.quantity * orderItem.quantity;
      
      if (aggregated.has(key)) {
        aggregated.get(key).totalQuantity += lineQty;
      } else {
        aggregated.set(key, {
          ingredientId: usage.ingredientId,
          totalQuantity: lineQty,
        });
      }
    }
  }
  
  return Array.from(aggregated.values());
}
```

**getIngredientUsageForMenuItem() logic:**

```javascript
static async getIngredientUsageForMenuItem(menuItemId, merchantId) {
  // Check feature flag
  const merchant = await Merchant.findById(merchantId);
  if (!merchant.hasFeature('inventory')) {
    return [];  // No deduction if inventory disabled
  }
  
  // Fetch recipe
  const recipe = await InventoryRepository.findActiveRecipeForMenuItem(
    menuItemId,
    merchantId
  );
  
  if (!recipe?.items?.length) {
    throw new Error(
      `Inventory module enabled but no recipe for MenuItem ${menuItemId}`
    );
  }
  
  // Map recipe items to ingredients
  return recipe.items.map(item => ({
    ingredientId: item.ingredient._id,  // Now ObjectId after populate
    quantity: item.quantity,
    unit: item.unit,
  }));
}
```

**Note:** InventoryRepository.findActiveRecipeForMenuItem() does:
```javascript
Recipe.findOne({
  menuItem: menuItemId,
  merchant: merchantId,
  isActive: true,
}).populate('items.ingredient');  // ← Populates ingredient field
```

But wait — **the recipe schema now stores ingredientName (String), not ingredient (ObjectId)**. So the real logic is:

```javascript
// Pre-save hook resolves by name:
for (const item of recipe.items) {
  const ingredient = await Ingredient.findOne({
    merchant: this.merchant,
    name: item.ingredientName,  // ← Name-based lookup
    unit: item.unit,
    isActive: true,
  });
  // Use this ingredient's _id and costPerUnit
}
```

**Result:**
```javascript
deductionPlan = [
  {
    ingredientId: ObjectId,    // Chicken
    totalQuantity: 0.5         // 2 orders × 0.25 kg/order
  },
  {
    ingredientId: ObjectId,    // Tomato
    totalQuantity: 1.0         // 2 orders × 0.5 kg/order
  }
]
```

---

### Step 3: Atomic Deduction (Inside Transaction)

**Function:** `InventoryService.deductForOrder()` (line 169)

```javascript
static async deductForOrder(
  { merchantId, branchId, orderNumber, plan, performedBy },
  session
) {
  if (!session) {
    throw new Error('deductForOrder requires a MongoDB session');
  }
  
  for (const line of plan) {
    const ingredient = await this.adjustStockAtomic(
      merchantId,
      branchId,               // ← BRANCH ISOLATION
      line.ingredientId,
      line.totalQuantity,
      'out',                  // Type: deduction
      'order_consumption',    // Reason
      `Order ${orderNumber}`, // Reference
      performedBy,
      session
    );
  }
}
```

**adjustStockAtomic() — The Core Logic:**

**File:** `src/modules/inventory/service/InventoryService.js` (line 218)

```javascript
static async adjustStockAtomic(
  merchantId,
  branchId,
  ingredientId,
  quantity,
  type,           // 'out' for deduction
  reason,
  reference,
  performedBy,
  session
) {
  if (type === 'out') {
    // ✅ ATOMIC DEDUCTION with branch isolation
    const ingredient = await Ingredient.findOneAndUpdate(
      {
        _id: ingredientId,
        merchant: merchantId,
        branch: branchId,              // ← BRANCH ISOLATION
        currentStock: { $gte: quantity } // ← GUARD: Prevent over-deduction
      },
      {
        $inc: { currentStock: -quantity }
      },
      { new: true, session }
    );
    
    if (!ingredient) {
      throw new Error('Insufficient stock or ingredient not found');
    }
    
    // ✅ CREATE AUDIT ENTRY
    await InventoryRepository.createStockMovements(
      [
        {
          merchant: merchantId,
          branch: branchId,
          ingredient: ingredientId,
          action: 'USED',
          quantity,
          stockBefore: ingredient.currentStock + quantity,
          stockAfter: ingredient.currentStock,
          reason,
          reference,
          performedBy,
          orderId: undefined,  // Will be set by caller if needed
        }
      ],
      { session }
    );
    
    return ingredient;
  }
}
```

**Key Details:**

1. **findOneAndUpdate** (not updateOne):
   - Returns updated document (needed for stockBefore calculation)
   - Triggers Mongoose hooks (alertStatus recalculation)

2. **Branch filter** in condition:
   - `{ merchant, branch, _id, currentStock: {$gte: quantity} }`
   - Prevents cross-branch deductions
   - Prevents over-deduction

3. **StockHistory entry** with action='USED':
   - Logs: ingredient, merchant, branch, quantity, stockBefore, stockAfter, reason, reference, performedBy

---

## 7. Complete Relationship Chain Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ CUSTOMER ORDERS MENU ITEM                                        │
│ (MenuItem = Doro Wat, qty=2)                                     │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ↓
        ┌────────────────────────┐
        │ MenuItem Schema        │
        │ - price: 150           │
        │ - costPrice: null      │
        │ - recipe: ObjectId ←───┼─────────────┐
        │ - kitchenStation       │             │
        └────────────────────────┘             │
                     │                         │
                     ↓                         │
        ┌────────────────────────────────────┐ │
        │ ORDER CREATED                      │ │
        │ ├─ orderItems[0]                  │ │
        │ │  ├─ menuItem: ObjectId         │ │
        │ │  ├─ name: "Doro Wat"           │ │
        │ │  ├─ unitPrice: 150 ✓           │ │
        │ │  ├─ unitCost: 45 (from recipe) │ │
        │ │  ├─ totalPrice: 300            │ │
        │ │  ├─ quantity: 2                │ │
        │ │  └─ requiresKitchen: true ✓    │ │
        │ └─ subtotal: 300                 │ │
        │ └─ branch: branchAId             │ │
        └────────────────────────────────────┘ │
                     │                         │
                     ↓                         │
        ┌────────────────────────┐             │
        │ RESOLVE DEDUCTION PLAN │             │
        │ (which ingredients?)   │             │
        └────────────┬───────────┘             │
                     │                         │
                     ↓                         │
              Recipe ←─────────────────────────┘
              ├─ items[0]: ingredientName="Chicken", qty=0.25 kg
              ├─ items[1]: ingredientName="Tomato", qty=0.5 kg
              └─ items[2]: ingredientName="Onion", qty=0.3 kg
                     │
                     ↓ (lookup by name + unit)
        ┌────────────────────────────────┐
        │ AGGREGATED DEDUCTION PLAN      │
        │ [{                             │
        │   ingredientId: (Chicken),    │
        │   totalQuantity: 0.5 kg       │ (2 × 0.25)
        │ }, {                          │
        │   ingredientId: (Tomato),     │
        │   totalQuantity: 1.0 kg       │ (2 × 0.5)
        │ }, {                          │
        │   ingredientId: (Onion),      │
        │   totalQuantity: 0.6 kg       │ (2 × 0.3)
        │ }]                            │
        └────────────┬───────────────────┘
                     │
                     ↓ (within MongoDB transaction)
        ┌────────────────────────────────────────┐
        │ FOR EACH INGREDIENT IN PLAN:           │
        │                                        │
        │ Ingredient.findOneAndUpdate({          │
        │   _id: ingredientId,                  │
        │   merchant: merchantId,               │
        │   branch: branchId,  ← BRANCH ISO    │
        │   currentStock: {$gte: qty}  ← GUARD │
        │ }, {                                  │
        │   $inc: { currentStock: -qty }       │
        │ })                                    │
        │                                        │
        │ → Updated Ingredient returned         │
        └────────────┬───────────────────────────┘
                     │
                     ↓
        ┌──────────────────────────────────────┐
        │ CREATE STOCKHISTORY ENTRY (USED)    │
        │ ├─ ingredient: (Chicken)            │
        │ ├─ branch: branchId                │
        │ ├─ action: "USED"                  │
        │ ├─ quantity: 0.5 kg                │
        │ ├─ stockBefore: 50 kg              │
        │ ├─ stockAfter: 49.5 kg             │
        │ ├─ reason: "order_consumption"     │
        │ ├─ reference: "Order #T5-467"      │
        │ ├─ orderId: (order._id)            │
        │ └─ recordedBy: (performedBy)       │
        └──────────────────────────────────────┘
                     │
                     ↓
        ┌─────────────────────────────┐
        │ TRANSACTION COMMITS        │
        │ (all-or-nothing)           │
        │                            │
        │ Order created + stock      │
        │ deducted + audit trail     │
        │ (or all rolled back)       │
        └─────────────────────────────┘
```

---

## 8. Branch/Merchant Scoping Throughout

| Layer | Scoping | How It Works |
|-------|---------|------------|
| **Ingredient** | merchant + branch | Unique index: `{merchant, branch, name, unit}` — same ingredient name can exist per branch |
| **Recipe** | merchant only | But items resolve to branch-specific ingredients at deduction time |
| **MenuItem** | merchant | Recipe reference shared across all branches |
| **Order** | merchant + branch | Field `branch` required; all queries filter by both |
| **StockHistory** | merchant + branch | Required fields; indexes on `{merchant, branch, action}` |
| **Deduction** | merchant + branch | findOneAndUpdate filter includes both; prevents cross-branch and cross-tenant leaks |

**Example:** Same "Doro Wat" MenuItem in Branch A and Branch B
- Both reference the same Recipe
- Recipe items store ingredientName ("Chicken", "Tomato", etc.)
- At deduction time:
  - Branch A order deducts from Branch A's "Chicken" (50kg stock)
  - Branch B order deducts from Branch B's "Chicken" (30kg stock)
  - Completely isolated

---

## 9. Key Implementation Files

| Layer | File | Key Functions |
|-------|------|---------------|
| **Entry Point** | `src/modules/order/service/OrderService.js` | `staffPlaceOrder()` (line 333) |
| **Order Building** | `src/modules/order/service/OrderService.js` | `buildOrderItems()` (line 276), `calculateMenuItemCost()` (line 40) |
| **Deduction Logic** | `src/modules/inventory/service/InventoryService.js` | `resolveDeductionPlan()` (line 143), `deductForOrder()` (line 169), `adjustStockAtomic()` (line 218) |
| **Recipe Lookup** | `src/modules/inventory/service/InventoryService.js` | `getIngredientUsageForMenuItem()` (line 318) |
| **Repository Layer** | `src/modules/inventory/repository/inventory.repository.js` | `findActiveRecipeForMenuItem()` (line 135), `deductStock()`, etc. |
| **Ingredient Schema** | `models/Ingredient.js` | Branch/merchant indexes, alert status hooks |
| **Recipe Schema** | `models/Recipe.js` | ingredientName (String) resolution, cost calculation |
| **MenuItem Schema** | `src/modules/menu/model/MenuItem.model.js` | recipe reference, COGS fields, costPrice fallback |
| **Order Schema** | `models/orderModel.js` | Order/OrderItem schemas, branch field, session link |
| **StockHistory Schema** | `models/StockHistory.js` | Audit log fields, branch/action indexes |

---

## 10. Inconsistencies & Known Issues

### 1. Recipe Ingredient Resolution Transition

**Old approach:** Recipe items stored `ingredient: ObjectId` (direct reference)

**New approach:** Recipe items store `ingredientName: String` (name-based)

**Why changed:** Enables branch-level isolation — same recipe across branches, but deduction hits branch-specific ingredient.

**Migration:** Migration script exists to convert old recipes to new format.

**Current behavior:** Pre-save hook resolves ingredientName → Ingredient via merchant+name+unit lookup.

---

### 2. COGS Calculation Fallback Chain

1. **Inventory enabled + Recipe exists + All ingredients have costPerUnit** → Calculate from recipe
2. **Inventory enabled + No recipe OR incomplete costs** → Fall back to menuItem.costPrice
3. **Inventory disabled** → Use menuItem.costPrice (simple field)
4. **No cost data anywhere** → null (acceptable for order tracking)

---

### 3. Feature Flag Dependency

The entire ingredient deduction flow depends on: `Merchant.hasFeature('inventory')`

- **If enabled:** Recipe REQUIRED; deduction HAPPENS
- **If disabled:** Recipe optional (display-only); NO deduction; use costPrice

This means some merchants may not have inventory tracking enabled, and orders don't consume stock.

---

### 4. Partial Order Failure

If any ingredient in the deduction plan fails (insufficient stock), the **entire transaction rolls back**:
- Order not created
- No stock deducted
- All-or-nothing guarantee

Query checks `currentStock: { $gte: quantity }` to prevent over-deduction.

---

## 11. Transaction Safety & Atomicity

**The complete order creation + deduction flow happens in one MongoDB session:**

```javascript
const session = await mongoose.startSession();
try {
  return await session.withTransaction(async () => {
    // Create order
    const order = await OrderRepository.create([...], { session });
    
    // Deduct inventory (same transaction)
    await InventoryService.deductForOrder(..., session);
    
    // Both succeed or both rollback
    return { order };
  });
} finally {
  session.endSession();
}
```

**Guarantees:**
1. ✅ Order and inventory changes are atomic (all-or-nothing)
2. ✅ Branch isolation enforced in every findOneAndUpdate
3. ✅ Over-deduction prevented by currentStock guard
4. ✅ Complete audit trail in StockHistory
5. ✅ Merchant isolation via merchant field in all queries

---

## 12. Visual Summary: The Chain

```
MenuItem (Doro Wat)
  ↓ (contains)
Recipe (Doro Wat Recipe)
  ↓ (items array with ingredient names)
recipeItem (ingredientName="Chicken", qty=0.25 kg)
  ↓ (resolved at deduction time to)
Ingredient (Chicken, branch=branchA, currentStock=50kg)
  ↓ (deducted via)
Order (placed for branchA, qty=2)
  ↓ (creates)
Deduction Plan (aggregated by ingredient)
  ↓ (executed in transaction via)
findOneAndUpdate({merchant, branch, _id})
  ↓ (generates)
StockHistory (action=USED, stockBefore=50, stockAfter=49.5)
```

**Every step is scoped to merchant + branch (except Recipe which is merchant-only but resolves to branch-specific ingredients).**

---

## Conclusion

The inventory system is **conceptually simple** but **carefully implemented**:

- **Ingredient** = per-branch stock
- **Recipe** = ingredient requirements (name-based for branch isolation)
- **MenuItem** = what customer orders
- **Order** = creates deduction plan from order items → aggregates by ingredient
- **Deduction** = atomic, branch-scoped findOneAndUpdate + StockHistory audit
- **StockHistory** = immutable audit trail for compliance

All operations are **multi-tenant scoped (merchant)** and **branch-isolated (branch)**. The transaction wrapper ensures **all-or-nothing atomicity**.
