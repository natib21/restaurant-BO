# Critical Fixes for Inventory System

## Issues Identified

### 🔴 Critical Issues (Will cause production failures)
1. **Race condition on stock deduction** - Concurrent orders can oversell
2. **Validation middleware logic gap** - Allows insufficient-but-not-CRITICAL stock through

### 🟡 Important Issues (Will cause bugs)
3. **Hook bypass with findOneAndUpdate** - Alert status won't update
4. **Field name mismatch** - minStock vs minThreshold
5. **Deduction timing mismatch** - Single vs three-stage deduction
6. **Unit conversion missing** - Recipe/ingredient unit mismatch

---

## Fix 1: Atomic Stock Deduction (Race Condition)

### ❌ WRONG (Current Integration Plan)
```javascript
// RACE CONDITION: Two concurrent orders can both read same stock
const stockBefore = ingredient.currentStock;
ingredient.currentStock -= deductQty;
await ingredient.save();
// Last write wins, silent oversell
```

### ✅ CORRECT (Atomic Operation)
```javascript
/**
 * Atomically deduct stock with optimistic concurrency control
 * Prevents race conditions in concurrent order processing
 */
async function deductIngredientAtomic(ingredientId, deductQty, orderId, userId) {
  // Step 1: Atomic conditional decrement
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId, 
      currentStock: { $gte: deductQty },  // Only succeed if enough stock
      isActive: true 
    },
    { 
      $inc: { currentStock: -deductQty },
      $set: { lastUpdated: new Date() }
    },
    { new: true }  // Return updated document
  );
  
  if (!updated) {
    // Stock was insufficient or ingredient was deactivated
    const ingredient = await Ingredient.findById(ingredientId);
    
    if (!ingredient) {
      throw new AppError(`Ingredient ${ingredientId} not found`, 404);
    }
    
    if (!ingredient.isActive) {
      throw new AppError(`Ingredient ${ingredient.name} is inactive`, 400);
    }
    
    // Insufficient stock - this is the race condition catch
    throw new AppError(
      `Insufficient stock for ${ingredient.name}. Available: ${ingredient.currentStock}, Required: ${deductQty}`,
      409
    );
  }
  
  // Step 2: Recompute alert status (since findOneAndUpdate skips pre-save hooks)
  const newAlertStatus = computeAlertStatus(updated.currentStock, updated.minStock);
  
  if (newAlertStatus !== updated.alertStatus) {
    updated.alertStatus = newAlertStatus;
    await updated.save();  // This WILL trigger hooks for alerts
  }
  
  // Step 3: Record in history
  await StockHistory.create({
    ingredient: ingredientId,
    merchant: updated.merchant,
    branch: updated.branch,
    action: 'USED',
    quantity: deductQty,
    stockBefore: updated.currentStock + deductQty,  // Before deduction
    stockAfter: updated.currentStock,
    unit: updated.unit,
    orderId,
    recordedBy: userId,
    recordedAt: new Date(),
    previousStatus: updated.alertStatus,  // May have changed
    newStatus: newAlertStatus,
  });
  
  return updated;
}

/**
 * Helper: Compute alert status (extracted from hook logic)
 */
function computeAlertStatus(currentStock, minStock) {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock < minStock * 0.5) return 'CRITICAL';
  if (currentStock < minStock) return 'LOW';
  return 'OK';
}
```

---

## Fix 2: Validation Middleware Logic Gap

### ❌ WRONG (Current Integration Plan)
```javascript
if (available < required) {
  const hasOverride = ...
  // BUG: Only rejects if CRITICAL - allows insufficient LOW stock through!
  if (!hasOverride && recipeItem.ingredient.alertStatus === 'CRITICAL') {
    unavailableItems.push(...)
  }
}
```

### ✅ CORRECT (Proper Validation)
```javascript
const validateOrderStock = async (req, res, next) => {
  const { items } = req.body;
  const unavailableItems = [];
  const warnings = [];
  
  for (const orderItem of items) {
    const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
      .populate('items.ingredient');
    
    if (!recipe) continue;
    
    for (const recipeItem of recipe.items) {
      const required = recipeItem.quantity * orderItem.quantity;
      const available = recipeItem.ingredient.currentStock;
      
      // Check if insufficient stock
      if (available < required) {
        const ingredient = recipeItem.ingredient;
        
        // Check for manual override
        const menuItem = await Menu.findById(orderItem.menuItem);
        const hasValidOverride = 
          menuItem.availability.manualOverride?.enabled &&
          menuItem.availability.manualOverride.expiresAt > new Date();
        
        // CRITICAL: ALWAYS reject, regardless of override
        if (ingredient.alertStatus === 'CRITICAL') {
          unavailableItems.push({
            menuItem: orderItem.menuItem,
            menuItemName: menuItem.name,
            ingredient: ingredient.name,
            required,
            available,
            alertStatus: 'CRITICAL',
            reason: 'Critical stock level - no overrides allowed',
          });
          continue;  // Skip to next ingredient
        }
        
        // LOW or insufficient: reject unless manually overridden
        if (!hasValidOverride) {
          unavailableItems.push({
            menuItem: orderItem.menuItem,
            menuItemName: menuItem.name,
            ingredient: ingredient.name,
            required,
            available,
            alertStatus: ingredient.alertStatus,
            reason: 'Insufficient stock - requires manager override',
          });
        } else {
          // Override exists - allow but warn
          warnings.push({
            menuItem: orderItem.menuItem,
            ingredient: ingredient.name,
            message: `Using override for low stock (${available}/${required})`,
            overrideExpires: menuItem.availability.manualOverride.expiresAt,
          });
        }
      }
    }
  }
  
  if (unavailableItems.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Order cannot be fulfilled due to insufficient stock',
      unavailableItems,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  }
  
  // All items available - attach warnings if any
  if (warnings.length > 0) {
    req.stockWarnings = warnings;
  }
  
  next();
};
```

---

## Fix 3: Field Name Standardization

### Decision: Use `minStock` (already exists in your schema)

Update the integration plan to use existing field names:

```javascript
// ✅ Use existing fields from your Ingredient model
{
  currentStock: Number,    // ✅ Already exists
  minStock: Number,        // ✅ Already exists (NOT minThreshold)
  maxStock: Number,        // ✅ Already exists
  // NEW fields to add:
  reorderQuantity: Number,
  alertStatus: String,
  dailyUsageRate: Number,
}

// Update alert status computation to use minStock
function computeAlertStatus(currentStock, minStock) {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock < minStock * 0.5) return 'CRITICAL';
  if (currentStock < minStock) return 'LOW';
  return 'OK';
}
```

---

## Fix 4: Three-Stage Deduction (Reservation System)

### Decision: Implement properly from Phase 1

```javascript
/**
 * Three-stage stock management (as per proposal Layer 4)
 */

// Stage 1: Reserve stock (pending → in_progress)
async function reserveIngredients(orderId) {
  const order = await Order.findById(orderId).populate('items.menuItem');
  const reservations = [];
  
  for (const orderItem of order.items) {
    const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
      .populate('items.ingredient');
    
    if (!recipe) continue;
    
    for (const recipeItem of recipe.items) {
      const reserveQty = recipeItem.quantity * orderItem.quantity;
      
      // Atomic reservation (doesn't deduct, just marks as reserved)
      const updated = await Ingredient.findOneAndUpdate(
        { 
          _id: recipeItem.ingredient._id,
          currentStock: { $gte: reserveQty },
        },
        {
          $inc: { reservedStock: reserveQty },  // NEW field needed
        },
        { new: true }
      );
      
      if (!updated) {
        // Rollback previous reservations
        await releaseReservations(reservations);
        throw new AppError(
          `Cannot reserve ${recipeItem.ingredient.name}: insufficient stock`,
          409
        );
      }
      
      reservations.push({
        ingredientId: recipeItem.ingredient._id,
        quantity: reserveQty,
      });
      
      // Record reservation
      await StockHistory.create({
        ingredient: recipeItem.ingredient._id,
        merchant: order.merchant,
        action: 'RESERVED',  // NEW action type
        quantity: reserveQty,
        orderId: order._id,
        recordedBy: order.createdBy,
      });
    }
  }
  
  // Store reservation IDs on order for rollback if needed
  order.stockReservations = reservations;
  await order.save();
  
  return reservations;
}

// Stage 2: Finalize deduction (in_progress → ready)
async function finalizeIngredients(orderId) {
  const order = await Order.findById(orderId);
  
  for (const reservation of order.stockReservations) {
    // Atomic: move from reserved to actually deducted
    await Ingredient.findByIdAndUpdate(
      reservation.ingredientId,
      {
        $inc: { 
          reservedStock: -reservation.quantity,
          currentStock: -reservation.quantity,
        },
      }
    );
    
    // Update history
    await StockHistory.create({
      ingredient: reservation.ingredientId,
      merchant: order.merchant,
      action: 'USED',
      quantity: reservation.quantity,
      orderId: order._id,
      recordedBy: order.createdBy,
    });
  }
}

// Stage 3: Release reservation (if order canceled)
async function releaseReservations(reservations) {
  for (const reservation of reservations) {
    await Ingredient.findByIdAndUpdate(
      reservation.ingredientId,
      {
        $inc: { reservedStock: -reservation.quantity },
      }
    );
    
    await StockHistory.create({
      ingredient: reservation.ingredientId,
      action: 'RELEASED',  // NEW action type
      quantity: reservation.quantity,
    });
  }
}
```

**Ingredient schema update needed:**
```javascript
{
  currentStock: Number,       // Available for sale
  reservedStock: Number,      // Reserved by pending orders
  minStock: Number,
  
  // Virtual: actual available
  availableStock: function() {
    return this.currentStock - (this.reservedStock || 0);
  }
}
```

---

## Fix 5: Unit Conversion Validation

### Phase 1: At minimum, validate units match

```javascript
// In Recipe schema validation
recipeSchema.pre('save', async function(next) {
  for (const item of this.items) {
    const ingredient = await Ingredient.findById(item.ingredient);
    
    if (!ingredient) {
      return next(new Error(`Ingredient ${item.ingredient} not found`));
    }
    
    // CRITICAL: Units must match exactly (no conversion yet)
    if (item.unit !== ingredient.unit) {
      return next(new Error(
        `Unit mismatch: Recipe uses ${item.unit} but ingredient ${ingredient.name} is stocked in ${ingredient.unit}. ` +
        `Please use matching units or convert manually.`
      ));
    }
  }
  next();
});
```

### Phase 2+: Implement conversion table (future)
```javascript
const UNIT_CONVERSIONS = {
  'kg_to_g': 1000,
  'liter_to_ml': 1000,
  // etc.
};

function convertUnit(quantity, fromUnit, toUnit) {
  if (fromUnit === toUnit) return quantity;
  
  const key = `${fromUnit}_to_${toUnit}`;
  if (UNIT_CONVERSIONS[key]) {
    return quantity * UNIT_CONVERSIONS[key];
  }
  
  throw new Error(`No conversion defined from ${fromUnit} to ${toUnit}`);
}
```

---

## Fix 6: Alert Status Update with findOneAndUpdate

### Problem: `pre('save')` hooks don't run with `findOneAndUpdate`

### ✅ Solution: Explicit alertStatus update

```javascript
// Don't rely on pre-save hooks after atomic operations
ingredientSchema.post('findOneAndUpdate', async function(doc) {
  if (!doc) return;
  
  // Manually recompute and update alert status
  const newStatus = computeAlertStatus(doc.currentStock, doc.minStock);
  
  if (newStatus !== doc.alertStatus) {
    doc.alertStatus = newStatus;
    await doc.save();  // This WILL trigger post-save hooks for notifications
  }
});

// Keep the pre-save hook for manual updates
ingredientSchema.pre('save', function(next) {
  if (this.isModified('currentStock') || this.isModified('minStock')) {
    this.alertStatus = computeAlertStatus(this.currentStock, this.minStock);
  }
  next();
});

// Notification trigger (post-save works for both paths now)
ingredientSchema.post('save', async function(doc) {
  if (this.isModified('alertStatus') && 
      (doc.alertStatus === 'LOW' || doc.alertStatus === 'CRITICAL')) {
    await InventoryAlertService.sendLowStockAlert(doc);
  }
  
  if (doc.alertStatus === 'CRITICAL') {
    await MenuAvailabilityService.updateMenuAvailabilityForIngredient(doc._id);
  }
});
```

---

## Complete Corrected deductIngredients Function

```javascript
/**
 * Deduct ingredients for an order (production-ready version)
 * Handles: race conditions, alert updates, history, rollback
 */
async function deductIngredients(orderId, userId) {
  const order = await Order.findById(orderId).populate('items.menuItem');
  const deductions = [];
  
  try {
    for (const orderItem of order.items) {
      const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
        .populate('items.ingredient');
      
      if (!recipe) continue;
      
      for (const recipeItem of recipe.items) {
        const deductQty = recipeItem.quantity * orderItem.quantity;
        const ingredient = recipeItem.ingredient;
        
        // Atomic deduction with race protection
        const updated = await Ingredient.findOneAndUpdate(
          { 
            _id: ingredient._id,
            currentStock: { $gte: deductQty },
            isActive: true
          },
          { 
            $inc: { currentStock: -deductQty },
            $set: { lastUpdated: new Date() }
          },
          { new: true }
        );
        
        if (!updated) {
          // Rollback previous deductions
          await rollbackDeductions(deductions);
          
          throw new AppError(
            `Insufficient stock for ${ingredient.name} (required: ${deductQty}, available: ${ingredient.currentStock})`,
            409
          );
        }
        
        // Track for potential rollback
        deductions.push({
          ingredientId: ingredient._id,
          quantity: deductQty,
          previousStock: updated.currentStock + deductQty,
        });
        
        // Recompute alert status
        const newAlertStatus = computeAlertStatus(updated.currentStock, updated.minStock);
        if (newAlertStatus !== updated.alertStatus) {
          updated.alertStatus = newAlertStatus;
          await updated.save();  // Triggers notification hooks
        }
        
        // Record in history
        await StockHistory.create({
          ingredient: ingredient._id,
          merchant: order.merchant,
          branch: order.branch,
          action: 'USED',
          quantity: deductQty,
          stockBefore: updated.currentStock + deductQty,
          stockAfter: updated.currentStock,
          unit: ingredient.unit,
          orderId: order._id,
          recordedBy: userId,
          recordedAt: new Date(),
          previousStatus: updated.alertStatus,
          newStatus: newAlertStatus,
        });
      }
    }
    
    return { success: true, deductions };
    
  } catch (error) {
    // Ensure rollback happened
    await rollbackDeductions(deductions);
    throw error;
  }
}

/**
 * Rollback deductions (if order validation fails after stock was taken)
 */
async function rollbackDeductions(deductions) {
  for (const deduction of deductions) {
    await Ingredient.findByIdAndUpdate(
      deduction.ingredientId,
      { $inc: { currentStock: deduction.quantity } }
    );
    
    await StockHistory.create({
      ingredient: deduction.ingredientId,
      action: 'CORRECTED',
      quantity: deduction.quantity,
      reason: 'Order deduction rolled back',
    });
  }
}
```

---

## Summary of Fixes

| Issue | Status | Fix |
|-------|--------|-----|
| Race condition | 🔴 CRITICAL | Use `findOneAndUpdate` with `$gte` condition |
| Validation gap | 🔴 CRITICAL | Check insufficient stock, not just CRITICAL status |
| Hook bypass | 🟡 IMPORTANT | Explicit alertStatus update after findOneAndUpdate |
| Field mismatch | 🟡 IMPORTANT | Use existing `minStock` field consistently |
| Deduction timing | 🟡 IMPORTANT | Implement three-stage: reserve → deduct → release |
| Unit mismatch | 🟡 IMPORTANT | Validate units match at recipe save time |

---

## Next Steps

1. **Apply these fixes to the integration plan**
2. **Add new fields to Ingredient schema:**
   - `reservedStock` (for reservation system)
   - `reorderQuantity`
   - `alertStatus`
   - `dailyUsageRate`

3. **Update StockHistory actions:**
   - Add `'RESERVED'` and `'RELEASED'` to enum

4. **Create unit tests for concurrency:**
   ```javascript
   it('should handle concurrent stock deductions safely', async () => {
     const promises = [
       deductIngredients(order1._id),
       deductIngredients(order2._id),
       deductIngredients(order3._id),
     ];
     
     const results = await Promise.allSettled(promises);
     // Only orders with available stock should succeed
   });
   ```

5. **Then proceed with Phase 1 implementation**

---

Ready to update the integration plan with these fixes?
