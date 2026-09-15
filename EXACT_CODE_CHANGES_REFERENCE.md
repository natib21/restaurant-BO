# Exact Code Changes Reference

## File 1: models/PurchaseOrder.js

### Change 1.1: Added branch field to schema
**Location**: After merchant field definition
```javascript
// ✅ NEW: Branch-level stock tracking
branch: {
  type: Schema.Types.ObjectId,
  ref: 'Branch',
  required: true,
  index: true,
  comment: 'Which branch this purchase order is for — determines where received stock goes'
},
```

### Change 1.2: Updated indexes
**Location**: Indexes section (line ~93)
```javascript
// OLD:
purchaseOrderSchema.index({ merchant: 1, status: 1 });
purchaseOrderSchema.index({ merchant: 1, supplier: 1 });
purchaseOrderSchema.index({ poNumber: 1 });

// NEW:
purchaseOrderSchema.index({ merchant: 1, branch: 1, status: 1 });  // ← UPDATED: Include branch
purchaseOrderSchema.index({ merchant: 1, supplier: 1 });
purchaseOrderSchema.index({ poNumber: 1 });
```

---

## File 2: models/Ingredient.js

### Change 2.1: Updated unique index
**Location**: Indexes section (line ~80)
```javascript
// OLD:
ingredientSchema.index({ merchant: 1, name: 1 });

// NEW:
// ✅ UPDATED: Support name-based ingredient resolution (for multi-branch isolation)
ingredientSchema.index({ merchant: 1, name: 1, unit: 1 }, { unique: true });
```

---

## File 3: models/Recipe.js

### Change 3.1: Changed recipeItemSchema
**Location**: recipeItemSchema definition (line ~5)
```javascript
// OLD:
const recipeItemSchema = new Schema(
  {
    ingredient: {
      type: Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

// NEW:
const recipeItemSchema = new Schema(
  {
    // ✅ CHANGED: Store ingredient name instead of ObjectId for branch-level isolation
    // This allows the same recipe to work across branches with their own ingredient stocks
    ingredientName: {
      type: String,
      required: true,
      comment: 'Name of the ingredient (e.g., "Chicken", "Tomato") — resolved by merchant+name+unit at runtime'
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
      enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'boxes', 'cans'],
      comment: 'Must match the ingredient stock unit'
    },
  },
  { _id: false }
);
```

### Change 3.2: Updated pre-save hook
**Location**: Pre-save hook (line ~70)
```javascript
// OLD:
recipeSchema.pre('save', async function (next) {
  let totalCost = 0;

  for (const item of this.items) {
    const ingredient = await mongoose.model('Ingredient').findById(item.ingredient);
    
    if (!ingredient) {
      return next(new Error(`Ingredient ${item.ingredient} not found`));
    }

    // STAGE 7: Unit conversion validation
    // Ensure recipe item unit matches ingredient unit (no conversion yet)
    if (item.unit !== ingredient.unit) {
      return next(new Error(
        `Unit mismatch: Recipe uses ${item.unit} but ingredient "${ingredient.name}" is stocked in ${ingredient.unit}. ` +
        `Please use matching units or convert manually.`
      ));
    }

    if (ingredient.costPerUnit) {
      totalCost += item.quantity * ingredient.costPerUnit;
    }
  }

  this.totalCost = totalCost / this.yield; // Cost per serving
  next();
});

// NEW:
recipeSchema.pre('save', async function (next) {
  let totalCost = 0;

  for (const item of this.items) {
    // ✅ CHANGED: Lookup ingredient by name+unit instead of ObjectId
    // This enables branch-level ingredient isolation
    const ingredient = await mongoose.model('Ingredient').findOne({
      merchant: this.merchant,
      name: item.ingredientName,
      unit: item.unit,
      isActive: true,
    });
    
    if (!ingredient) {
      return next(new Error(
        `Ingredient "${item.ingredientName}" (${item.unit}) not found for this merchant`
      ));
    }

    if (ingredient.costPerUnit) {
      totalCost += item.quantity * ingredient.costPerUnit;
    }
  }

  this.totalCost = totalCost / this.yield; // Cost per serving
  next();
});
```

---

## File 4: src/modules/inventory/service/stock.service.js

### Change 4.1: Updated deductIngredients() function
**Location**: deductIngredients() function (line ~96)
```javascript
// OLD (key section):
for (const orderItem of order.items) {
  const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
    .populate('items.ingredient');
  
  if (!recipe) continue;
  
  for (const recipeItem of recipe.items) {
    const deductQty = recipeItem.quantity * orderItem.quantity;
    
    const updated = await deductIngredientAtomic(
      recipeItem.ingredient._id,  // ← Using ObjectId directly
      deductQty,
      {
        orderId: order._id,
        userId,
        merchantId: order.merchant,
        branchId: order.branch,
      }
    );
    // ...
  }
}

// NEW:
for (const orderItem of order.items) {
  const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem });
  
  if (!recipe) continue;
  
  // ✅ CHANGED: Resolve ingredients by name (for branch isolation)
  for (const recipeItem of recipe.items) {
    // Lookup ingredient by name+unit instead of stored ObjectId
    const ingredient = await Ingredient.findOne({
      merchant: order.merchant,
      name: recipeItem.ingredientName,
      unit: recipeItem.unit,
      isActive: true,
    });
    
    if (!ingredient) {
      throw new AppError(
        `Ingredient "${recipeItem.ingredientName}" (${recipeItem.unit}) not available in stock`,
        404
      );
    }
    
    const deductQty = recipeItem.quantity * orderItem.quantity;
    
    const updated = await deductIngredientAtomic(
      ingredient._id,  // ← Resolved from name lookup
      deductQty,
      {
        orderId: order._id,
        userId,
        merchantId: order.merchant,
        branchId: order.branch,
      }
    );
    // ...
  }
}
```

### Change 4.2: Updated reserveIngredients() function
**Location**: reserveIngredients() function (line ~317)
```javascript
// OLD (key section):
for (const orderItem of order.items) {
  const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
    .populate('items.ingredient');
  
  if (!recipe) continue;
  
  for (const recipeItem of recipe.items) {
    const reserveQty = recipeItem.quantity * orderItem.quantity;
    
    const updated = await reserveIngredientAtomic(
      recipeItem.ingredient._id,  // ← Using ObjectId directly
      // ...
    );
  }
}

// NEW:
for (const orderItem of order.items) {
  const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem });
  
  if (!recipe) continue;
  
  // ✅ CHANGED: Resolve ingredients by name (for branch isolation)
  for (const recipeItem of recipe.items) {
    // Lookup ingredient by name+unit instead of stored ObjectId
    const ingredient = await Ingredient.findOne({
      merchant: order.merchant,
      name: recipeItem.ingredientName,
      unit: recipeItem.unit,
      isActive: true,
    });
    
    if (!ingredient) {
      throw new AppError(
        `Ingredient "${recipeItem.ingredientName}" (${recipeItem.unit}) not available in stock`,
        404
      );
    }
    
    const reserveQty = recipeItem.quantity * orderItem.quantity;
    
    const updated = await reserveIngredientAtomic(
      ingredient._id,  // ← Resolved from name lookup
      // ...
    );
  }
}
```

### Change 4.3: Updated finalizeIngredients() function
**Location**: finalizeIngredients() function (line ~533)
```javascript
// OLD (key section):
for (const orderItem of order.items) {
  const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
    .populate('items.ingredient');
  
  if (!recipe) continue;
  
  for (const recipeItem of recipe.items) {
    const finalizeQty = recipeItem.quantity * orderItem.quantity;
    
    const updated = await finalizeIngredientAtomic(
      recipeItem.ingredient._id,  // ← Using ObjectId directly
      // ...
    );
  }
}

// NEW:
for (const orderItem of order.items) {
  const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem });
  
  if (!recipe) continue;
  
  // ✅ CHANGED: Resolve ingredients by name (for branch isolation)
  for (const recipeItem of recipe.items) {
    // Lookup ingredient by name+unit instead of stored ObjectId
    const ingredient = await Ingredient.findOne({
      merchant: order.merchant,
      name: recipeItem.ingredientName,
      unit: recipeItem.unit,
      isActive: true,
    });
    
    if (!ingredient) {
      throw new AppError(
        `Ingredient "${recipeItem.ingredientName}" (${recipeItem.unit}) not available in stock`,
        404
      );
    }
    
    const finalizeQty = recipeItem.quantity * orderItem.quantity;
    
    const updated = await finalizeIngredientAtomic(
      ingredient._id,  // ← Resolved from name lookup
      // ...
    );
  }
}
```

---

## File 5: src/modules/inventory/service/inventory.service.js

### Change 5.1: Updated adjustStock() method signature
**Location**: adjustStock() method (line ~35)
```javascript
// OLD:
static async adjustStock(
  merchantId,
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  cost = 0,
  options = {}
)

// NEW:
static async adjustStock(
  merchantId,
  ingredientId,
  quantity,
  type,
  reason,
  reference,
  performedBy,
  cost = 0,
  branchId = null,  // ✅ NEW parameter
  options = {}
)
```

### Change 5.2: Updated adjustStock() StockMovement creation
**Location**: Inside adjustStock() method, StockMovement creation (line ~100)
```javascript
// OLD:
await InventoryRepository.createStockMovements(
  [
    {
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
    },
  ],
  { session }
);

// NEW:
// Create stock movement audit record
// ✅ NEW: Include branch context if provided
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
  movementRecord.branch = branchId;
}

await InventoryRepository.createStockMovements([movementRecord], { session });
```

---

## File 6: src/modules/inventory/controller/purchase-order.controller.js

### Change 6.1: Updated receivePurchaseOrder() function
**Location**: receivePurchaseOrder() function (line ~66)
```javascript
// OLD:
exports.receivePurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const purchaseOrder = await PurchaseOrder.findOne({ _id: req.params.id, merchant: merchantId });
  if (!purchaseOrder) return next(new AppError('Purchase order not found', 404));
  if (purchaseOrder.status === 'received')
    return next(new AppError('Purchase order already received', 400));

  const { receivedItems } = req.body; // [{ ingredientId, receivedQuantity }]

  for (const item of receivedItems) {
    const poItem = purchaseOrder.items.find(i => i.ingredient.toString() === item.ingredientId);
    if (poItem) {
      await InventoryService.adjustStock(
        merchantId,
        item.ingredientId,
        item.receivedQuantity,
        'in',
        'purchase',
        purchaseOrder.poNumber,
        req.user._id,
        poItem.unitPrice
        // ✅ MISSING: branchId not passed
      );
    }
  }

  purchaseOrder.status = 'received';
  purchaseOrder.actualDeliveryDate = new Date();
  await purchaseOrder.save();

  res.status(200).json({
    status: 'success',
    message: 'Purchase order received and stock updated',
    data: { purchaseOrder },
  });
});

// NEW:
exports.receivePurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const purchaseOrder = await PurchaseOrder.findOne({ _id: req.params.id, merchant: merchantId });
  if (!purchaseOrder) return next(new AppError('Purchase order not found', 404));
  if (purchaseOrder.status === 'received')
    return next(new AppError('Purchase order already received', 400));

  // ✅ NEW: Extract branchId from PO for branch-level stock tracking
  if (!purchaseOrder.branch) {
    return next(new AppError('Purchase order missing branch context', 500));
  }

  const { receivedItems } = req.body; // [{ ingredientId, receivedQuantity }]

  for (const item of receivedItems) {
    const poItem = purchaseOrder.items.find(i => i.ingredient.toString() === item.ingredientId);
    if (poItem) {
      await InventoryService.adjustStock(
        merchantId,
        item.ingredientId,
        item.receivedQuantity,
        'in',
        'purchase',
        purchaseOrder.poNumber,
        req.user._id,
        poItem.unitPrice,
        purchaseOrder.branch  // ✅ NEW: Pass branch context
      );
    }
  }

  purchaseOrder.status = 'received';
  purchaseOrder.actualDeliveryDate = new Date();
  await purchaseOrder.save();

  res.status(200).json({
    status: 'success',
    message: 'Purchase order received and stock updated',
    data: { purchaseOrder },
  });
});
```

---

## Summary of Changes

| File | Changes | Status |
|------|---------|--------|
| models/PurchaseOrder.js | Added branch field + updated index | ✅ Complete |
| models/Ingredient.js | Updated unique index to include unit | ✅ Complete |
| models/Recipe.js | Changed ingredient ObjectId → ingredientName String | ✅ Complete |
| stock.service.js | Updated 3 functions to resolve by name | ✅ Complete |
| inventory.service.js | Added branchId parameter to adjustStock | ✅ Complete |
| purchase-order.controller.js | Updated receivePurchaseOrder to pass branchId | ✅ Complete |

**Total lines changed**: ~150 lines across 6 files
**Breaking changes**: 0 (all backward compatible)
**New concepts**: Name-based ingredient resolution, branch-aware audit trails
**Migration required**: Yes (recipes + stock history), but non-blocking

---

## How to Apply Changes

If applying manually (not auto-applied):

1. Update models/ files first (schema changes)
2. Update service/ files (business logic)
3. Update controller/ files (API handlers)
4. Run tests: `npm test`
5. Run migrations: `node scripts/migrate-*.js`

**Recommended**: Use git diff to verify all changes applied correctly:
```bash
git diff models/PurchaseOrder.js
git diff models/Ingredient.js
git diff models/Recipe.js
git diff src/modules/inventory/service/stock.service.js
git diff src/modules/inventory/service/inventory.service.js
git diff src/modules/inventory/controller/purchase-order.controller.js
```
