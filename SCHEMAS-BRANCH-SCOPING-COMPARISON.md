# Schema Fields Comparison: Branch Scoping

## Quick Reference — Which Models Have Branch Field?

| Model | Fields | Branch Field? | Scope |
|-------|--------|---|-------|
| **Ingredient** | merchant, currentStock, reservedStock, minStock, maxStock, alertStatus, ... | ❌ NO | Merchant-wide |
| **MenuItem** | merchant, name, description, recipe, price, variants, ... | ❌ NO | Merchant-wide |
| **Recipe** | merchant, menuItem, items (ingredients), totalCost, yield, ... | ❌ NO | Merchant-wide |
| **Order** | merchant, **branch** ✓, customer, items, table, status, ... | ✅ YES | Branch-specific |
| **BranchMenu** | **branch** ✓, menuItem, overridePrice, isAvailable, ... | ✅ YES | Branch-specific |
| **StockHistory** | ingredient, merchant, **branch** ✓, action, quantity, ... | ✅ YES | Audit trail |
| **PurchaseOrder** | merchant, supplier, items (ingredients), status, ... | ❌ NO | Merchant-wide |

---

## Detailed Schema Fields

### Ingredient (`models/Ingredient.js`) — MERCHANT-SCOPED

```javascript
{
  _id: ObjectId,
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  // ↑ Only this for scoping
  
  name: String (required),
  category: String (enum: vegetables, meat, dairy, grains, spices, beverages, other),
  unit: String (enum: kg, g, liter, ml, pieces, boxes, cans),
  
  // Stock fields — ALL MERCHANT-WIDE (no per-branch split)
  currentStock: { type: Number, default: 0, min: 0 },  // ← Global pool
  minStock: { type: Number, default: 0, min: 0 },      // ← Global threshold
  maxStock: { type: Number, default: 0, min: 0 },      // ← Global threshold
  reservedStock: { type: Number, default: 0, min: 0 }, // ← Global pool
  reorderQuantity: { type: Number, default: 0, min: 0 },
  
  // Alert status computed from global currentStock
  alertStatus: { type: String, enum: ['OK', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'], default: 'OK' },
  
  dailyUsageRate: Number,
  costPerUnit: Number,
  supplier: { type: ObjectId, ref: 'Supplier' },
  isActive: { type: Boolean, default: true },
  lastRestocked: Date,
  expiryDate: Date,
  
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
index({ merchant: 1, name: 1 });
index({ merchant: 1, category: 1 });
index({ merchant: 1, currentStock: 1 });
// ↑ All indexes include merchant, NONE include branch
```

**KEY FINDING:** `currentStock` and `reservedStock` are **single global values** shared across all branches.

---

### MenuItem (`src/modules/menu/model/MenuItem.model.js`) — MERCHANT-SCOPED

```javascript
{
  _id: ObjectId,
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  // ↑ Only this for scoping
  
  categoryId: { type: ObjectId, ref: 'Category', required: true, index: true },
  
  // Multilingual name and description
  name: { type: localizedTextSchema, required: true },   // { en: "...", am: "..." }
  description: { type: localizedTextSchema },
  
  slug: String,
  type: { type: String, enum: ['food', 'drink'], default: 'food' },
  
  // Pricing (merchant-wide, can be overridden per branch in BranchMenu)
  price: { type: Number, min: 0 },
  variants: [{ name: String, size: String, volume: String, price: Number, ... }],
  costPrice: { type: Number, min: 0, default: 0 },
  
  // Recipe link (merchant-wide recipe)
  recipe: { type: ObjectId, ref: 'Recipe', default: null },
  
  // KDS integration
  kitchenStation: { type: ObjectId, ref: 'KitchenStation', default: null, index: true },
  requiresKitchen: { type: Boolean, default: true, index: true },
  
  // Availability
  available: { type: Boolean, default: true },
  inStock: { type: Boolean, default: true },
  publishStatus: { type: String, enum: ['draft', 'published', 'archived'], default: 'published' },
  
  // ... other fields ...
  
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
index({ merchant: 1, available: 1, deletedAt: 1 });
index({ merchant: 1, categoryId: 1, deletedAt: 1 });
index({ merchant: 1, publishStatus: 1, available: 1 });
// ↑ All indexes include merchant, NONE include branch
```

**KEY FINDING:** MenuItem is **fully merchant-scoped**. No per-branch variants at schema level (that's what BranchMenu is for).

---

### Recipe (`models/Recipe.js`) — MERCHANT-SCOPED

```javascript
{
  _id: ObjectId,
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  // ↑ Only this for scoping
  
  menuItem: { type: ObjectId, ref: 'Menu', required: true, index: true },
  
  name: String (required),
  
  // Ingredients with quantities
  items: [
    {
      ingredient: { type: ObjectId, ref: 'Ingredient', required: true },
      quantity: { type: Number, required: true, min: 0 },
      unit: { type: String, required: true },  // Must match ingredient.unit
    }
  ],
  
  totalCost: { type: Number, default: 0, min: 0 },  // Cost per serving
  yield: { type: Number, default: 1, min: 1 },      // Servings this recipe makes
  
  isActive: { type: Boolean, default: true },
  
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
index({ merchant: 1, menuItem: 1 }, { unique: true });  // One per item per merchant
index({ merchant: 1, isActive: 1 });
// ↑ All indexes include merchant, NONE include branch
```

**KEY FINDING:** Recipe is **merchant-wide and item-centric**. All branches using this MenuItem use the same Recipe and same Ingredient references.

---

### Order (`models/orderModel.js`) — BRANCH-SPECIFIC

```javascript
{
  _id: ObjectId,
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  branch: { type: ObjectId, ref: 'Branch', required: true },
  // ↑ BOTH scoping fields
  
  customer: { type: ObjectId, ref: 'Customer' },
  customerName: String (required),
  customerPhone: String,
  
  // Dine-in specific
  table: { type: ObjectId, ref: 'Table', index: true },  // Required if orderType = 'dine_in'
  session: { type: ObjectId, ref: 'DiningSession', index: true },
  tableNumber: String,
  
  // Order metadata
  orderNumber: { type: String, required: true, index: true },  // e.g., "#T5-467"
  orderType: { type: String, enum: ['dine_in', 'takeaway', 'delivery'], default: 'dine_in' },
  source: { type: String, enum: ['qr', 'staff', 'web', 'telegram', 'admin', 'waiter'], default: 'web' },
  
  // Order items
  items: [
    {
      menuItem: { type: ObjectId, ref: 'Menu', required: true },
      name: String,            // Snapshot of item name at order time
      quantity: Number,
      unitPrice: Number,
      unitCost: Number,
      // ... status, servedAt, voidedAt, etc ...
    }
  ],
  
  // Status
  status: { type: String, enum: ['pending', 'accepted', 'preparing', 'ready', ..., 'completed', 'canceled'] },
  statusHistory: [{ fromStatus, toStatus, changedBy, changedAt, reason }],
  
  // Financial
  subtotal: Number,
  taxAmount: Number,
  discountAmount: Number,
  totalAmount: Number,
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'] },
  
  // Cancellation
  canceledAt: Date,
  canceledBy: { type: ObjectId, ref: 'User' },
  canceledReason: String,
  
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
index({ merchant: 1, status: 1 });
index({ merchant: 1, branch: 1, status: 1 });
// ↑ Includes BOTH merchant and branch
```

**KEY FINDING:** Order **has** both `merchant` and `branch` fields, but stock deduction uses only `merchant` (no per-branch stock query).

---

### BranchMenu (`models/branchMenuModel.js`) — BRANCH-SPECIFIC

```javascript
{
  _id: ObjectId,
  branch: { type: ObjectId, ref: 'Branch', required: true, index: true },
  // ↑ Branch-scoped
  
  // Link to master item (optional; can be branch-only item)
  menuItem: { type: ObjectId, ref: 'Menu', default: null, sparse: true },
  
  // === For branch-only custom items (if menuItem is null) ===
  name: String,
  description: String,
  category: String,
  image: String,
  variants: [{ size, volume, price, calories, available }],
  
  // === Override fields (only used if menuItem exists) ===
  overridePrice: Number,              // Different price at this branch
  overrideName: String,               // Different name at this branch
  overrideVariants: [{ ... }],        // Different sizes/prices at this branch
  overrideImage: String,              // Different image at this branch
  
  // === Availability and overrides ===
  isHidden: { type: Boolean, default: false },     // Hide at this branch
  isAvailable: { type: Boolean, default: true },   // Toggle availability
  
  // !! IMPORTANT: This is NOT a stock field !!
  // It's a general availability flag, not linked to Ingredient stock
  availability: {
    manualOverride: {
      enabled: Boolean,          // Force ordering despite low/critical stock?
      reason: String,
      setBy: { type: ObjectId, ref: 'User' },
      setAt: Date,
      expiresAt: Date,           // Temporary override
    },
  },
  
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
index({ branch: 1, menuItem: 1 }, { unique: true, sparse: true });
index({ branch: 1 });
// ↑ No merchant field in index (implicitly scoped via branch relation)
```

**KEY FINDING:** BranchMenu provides **per-branch customization** (price, visibility, availability override) but does **NOT control stock**. The `manualOverride.enabled` flag is just a flag—it doesn't reserve or allocate stock.

---

### StockHistory (`models/StockHistory.js`) — AUDIT TRAIL

```javascript
{
  _id: ObjectId,
  ingredient: { type: ObjectId, ref: 'Ingredient', required: true, index: true },
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  branch: { type: ObjectId, ref: 'Branch', required: true },
  // ↑ All three for complete context
  
  // What happened
  action: { 
    type: String, 
    enum: ['ADDED', 'USED', 'RESERVED', 'RELEASED', 'ADJUSTED', 'WASTE', 'CORRECTED'],
    required: true 
  },
  
  quantity: Number (required),
  stockBefore: Number,
  stockAfter: Number,
  reservedBefore: Number,
  reservedAfter: Number,
  unit: String,
  
  // Context
  supplier: String,
  orderId: { type: ObjectId, ref: 'Order' },
  batchNumber: String,
  expiryDate: Date,
  reason: String,
  costPrice: Number,
  
  // Who and when
  recordedBy: { type: ObjectId, ref: 'User' },
  recordedAt: { type: Date, default: Date.now, index: true },
  
  previousStatus: String,
  newStatus: String,
  
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
index({ ingredient: 1, recordedAt: -1 });
index({ merchant: 1, branch: 1, action: 1 });  // ← Can query by branch!
index({ merchant: 1, branch: 1, recordedAt: -1 });
index({ orderId: 1 });
```

**KEY FINDING:** StockHistory **HAS** branch field and includes it in indexes. This allows **post-fact auditing** by branch (which branch used what stock) but does **NOT prevent cross-branch contention** (deduction still affects global pool).

---

### PurchaseOrder (`models/PurchaseOrder.js`) — MERCHANT-SCOPED

```javascript
{
  _id: ObjectId,
  merchant: { type: ObjectId, ref: 'Merchant', required: true, index: true },
  // ↑ Only merchant scoping (no branch)
  
  supplier: { type: ObjectId, ref: 'Supplier', required: true },
  
  poNumber: { type: String, unique: true },  // e.g., "PO-2024-001"
  
  // Items being ordered
  items: [
    {
      ingredient: { type: ObjectId, ref: 'Ingredient', required: true },
      quantity: Number,
      unit: String,
      unitPrice: Number,
      totalPrice: Number,
    }
  ],
  
  // Financial
  subtotal: Number,
  taxAmount: Number,
  totalAmount: Number,
  
  // Status workflow
  status: { 
    type: String, 
    enum: ['draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'],
    default: 'draft'
  },
  
  // Dates
  createdAt: Date,
  orderDate: Date,
  expectedDeliveryDate: Date,
  actualDeliveryDate: Date,
  
  // Users
  createdBy: { type: ObjectId, ref: 'User' },
  approvedBy: { type: ObjectId, ref: 'User' },
  
  updatedAt: Date,
}

// Indexes
index({ merchant: 1, supplier: 1 });
index({ merchant: 1, status: 1 });
// ↑ All indexes include merchant, NONE include branch
```

**KEY FINDING:** PurchaseOrder is **merchant-scoped only**. When stock is received via PO, it goes into the global Ingredient.currentStock pool (no branch allocation).

---

## Cross-Reference: Which Field Affects Stock Deduction?

### Stock Deduction Query (After IDOR Fix)

**File:** `src/modules/inventory/service/stock.service.js`

```javascript
await Ingredient.findOneAndUpdate(
  { 
    _id: ingredientId,           // ← Required: specific ingredient
    merchant: merchantId,        // ← Required: IDOR fix (prevent cross-merchant)
    // ↑ BRANCH FIELD IS NOT HERE
    currentStock: { $gte: deductQty },
    isActive: true 
  },
  { $inc: { currentStock: -deductQty } },
  { new: true }
);
```

**Result:**
- ✓ Merchant filter prevents IDOR (can't deduct from other merchant's stock)
- ✗ No branch filter → All branches of same merchant share global stock

### StockHistory Record Created

```javascript
await StockHistory.create({
  ingredient: ingredientId,
  merchant: merchantId,
  branch: branchId,         // ← RECORDED for audit
  action: 'USED',
  quantity: deductQty,
  stockBefore: updated.currentStock + deductQty,
  stockAfter: updated.currentStock,
  orderId,
  recordedBy: userId,
  recordedAt: new Date(),
});
```

**Result:**
- ✓ Branch is recorded for auditing (can see which branch used stock)
- ✗ But this doesn't prevent cross-branch contention (recording after-the-fact)

---

## Summary: Schema-Level Branch Support

| Layer | Branch Support | Purpose | Limitation |
|-------|---|---|---|
| **Data Model** | ✗ No (Ingredient, MenuItem, Recipe, PO all merchant-only) | Shared inventory assumption | Can't isolate per-branch stock |
| **Order Capture** | ✓ Yes (Order has branch field) | Know which branch ordered | Doesn't control deduction |
| **Stock Deduction Query** | ✗ No (filters by merchant only) | Cross-merchant security | Allows cross-branch contention |
| **Stock History Audit** | ✓ Yes (StockHistory has branch field) | Track which branch used what | Post-fact only; can't prevent |
| **BranchMenu Overrides** | ✓ Yes (prices, availability) | Branch customization | Doesn't control stock |

**Conclusion:** Branch field exists in Order and StockHistory for **tracking/auditing** but doesn't exist in Ingredient/Recipe for **controlling deductions**. The system records which branch caused stock changes but doesn't isolate stock per branch.
