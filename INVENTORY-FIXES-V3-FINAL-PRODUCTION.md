# Inventory System - V3 Final Production Code

## Verification Results

### Issue #2: Field Name Verification
**Source**: `models/Ingredient.js` lines 29-33
```javascript
minStock: {
  type: Number,
  default: 0,
  min: 0,
},
```
**Confirmed**: Field is `minStock` (exists in production schema)

### Issue #3: Branch Field Decision
**Source**: `models/orderModel.js` lines 188-193
```javascript
branch: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Branch',
  required: true,
},
```
**Decision**: Keep `branch` REQUIRED in StockHistory schema
**Reasoning**: 
- Order model has `branch` as required field (line 192)
- All stock operations originate from orders (which always have branch)
- Branch-specific reporting (proposal Section 5) requires branch for aggregation
- Single-branch merchants still have a branch record (just one)

---

## Production-Ready Code (All Issues Fixed)

### 1. StockHistory Schema (Branch REQUIRED)

```javascript
// models/StockHistory.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const stockHistorySchema = new Schema({
  ingredient: { 
    type: Schema.Types.ObjectId, 
    ref: 'Ingredient', 
    required: true,
    index: true
  },
  merchant: { 
    type: Schema.Types.ObjectId, 
    ref: 'Merchant', 
    required: true,
    index: true
  },
  branch: { 
    type: Schema.Types.ObjectId, 
    ref: 'Branch', 
    required: true  // REQUIRED - all orders have branch
  },
  
  action: { 
    type: String, 
    enum: [
      'ADDED',      // Stock added (purchase/restock)
      'USED',       // Stock deducted (order fulfilled)
      'RESERVED',   // Stock reserved (order pending)
      'RELEASED',   // Reservation released (order canceled)
      'ADJUSTED',   // Manual adjustment
      'WASTE',      // Spoilage/damage
      'CORRECTED'   // Rollback/error correction
    ], 
    required: true 
  },
  
  quantity: { 
    type: Number, 
    required: true 
  },
  
  stockBefore: Number,
  stockAfter: Number,
  unit: String,
  
  // Context
  supplier: String,
  orderId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Order' 
  },
  batchNumber: String,
  expiryDate: Date,
  reason: String,
  costPrice: Number,
  
  recordedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  recordedAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  
  previousStatus: String,
  newStatus: String,
}, {
  timestamps: true
});

// Indexes for reporting
stockHistorySchema.index({ ingredient: 1, recordedAt: -1 });
stockHistorySchema.index({ merchant: 1, branch: 1, action: 1 });
stockHistorySchema.index({ merchant: 1, branch: 1, recordedAt: -1 });
stockHistorySchema.index({ orderId: 1 });

module.exports = mongoose.model('StockHistory', stockHistorySchema);
```

---

### 2. Helper Function (Uses minStock from actual schema)

```javascript
/**
 * Compute alert status based on current stock and minStock threshold
 * Uses minStock field from production Ingredient schema (models/Ingredient.js line 29-33)
 */
function computeAlertStatus(currentStock, minStock) {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock < minStock * 0.5) return 'CRITICAL';
  if (currentStock < minStock) return 'LOW';
  return 'OK';
}
```

---

### 3. Reserve Ingredients (Double-Release Bug FIXED)

```javascript
/**
 * Reserve ingredients atomically with race protection
 * 
 * FIXED: Double-release bug removed
 * - Removed releaseReservations() call from inside if (!updated) block
 * - Single catch block handles all failures
 * - Traced: No other functions have this pattern
 */
async function reserveIngredients(orderId, userId) {
  const order = await Order.findById(orderId).populate('items.menuItem');
  
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  
  if (!order.branch) {
    throw new AppError('Order missing required branch field', 500);
  }
  
  const reservations = [];
  
  try {
    for (const orderItem of order.items) {
      const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
        .populate('items.ingredient');
      
      if (!recipe) continue;
      
      for (const recipeItem of recipe.items) {
        const reserveQty = recipeItem.quantity * orderItem.quantity;
        const ingredient = recipeItem.ingredient;
        
        // Atomic check: available = current - reserved >= needed
        const updated = await Ingredient.findOneAndUpdate(
          {
            _id: ingredient._id,
            isActive: true,
            $expr: { 
              $gte: [
                { $subtract: ['$currentStock', { $ifNull: ['$reservedStock', 0] }] },
                reserveQty
              ] 
            }
          },
          { 
            $inc: { reservedStock: reserveQty },
            $set: { lastUpdated: new Date() }
          },
          { new: true }
        );
        
        if (!updated) {
          // Build error message - DO NOT call releaseReservations here
          // Let the catch block below handle releasing all reservations
          const ing = await Ingredient.findById(ingredient._id);
          const available = ing ? ing.currentStock - (ing.reservedStock || 0) : 0;
          
          throw new AppError(
            `Cannot reserve ${ingredient.name}. ` +
            `Required: ${reserveQty}, Available: ${available}`,
            409
          );
        }
        
        reservations.push({
          ingredientId: ingredient._id,
          quantity: reserveQty,
          ingredientName: ingredient.name,
        });
        
        // Record reservation in history
        // Branch is required and comes from order.branch (verified required in Order model)
        await StockHistory.create({
          ingredient: ingredient._id,
          merchant: order.merchant,
          branch: order.branch,  // Required field - order always has branch
          action: 'RESERVED',
          quantity: reserveQty,
          stockBefore: updated.currentStock,
          stockAfter: updated.currentStock,
          unit: ingredient.unit,
          orderId: order._id,
          recordedBy: userId,
          recordedAt: new Date(),
        });
      }
    }
    
    // Success - store reservations on order
    order.stockReservations = reservations;
    order.stockReservationDate = new Date();
    await order.save();
    
    return { success: true, reservations };
    
  } catch (error) {
    // SINGLE release point - only called once per failed reserveIngredients()
    if (reservations.length > 0) {
      await releaseReservations(reservations, order.merchant, order.branch);
    }
    throw error;
  }
}
```

---

### 4. Release Reservations (Branch Required)

```javascript
/**
 * Release reservations when order is canceled
 * 
 * Call sites traced:
 * 1. reserveIngredients() catch block (this file)
 * 2. Order cancellation handler (when order status → canceled)
 * 
 * Branch parameter: Required (from order.branch)
 */
async function releaseReservations(reservations, merchantId, branchId) {
  if (!branchId) {
    throw new Error('branchId is required for releaseReservations');
  }
  
  const releaseErrors = [];
  
  for (const reservation of reservations) {
    try {
      const updated = await Ingredient.findByIdAndUpdate(
        reservation.ingredientId,
        { 
          $inc: { reservedStock: -reservation.quantity },
          $set: { lastUpdated: new Date() }
        },
        { new: true }
      );
      
      if (updated) {
        await StockHistory.create({
          ingredient: reservation.ingredientId,
          merchant: merchantId,
          branch: branchId,  // Required field
          action: 'RELEASED',
          quantity: reservation.quantity,
          stockBefore: updated.currentStock,
          stockAfter: updated.currentStock,
          unit: updated.unit,
          reason: 'Order canceled or expired',
          recordedAt: new Date(),
        });
      }
    } catch (error) {
      releaseErrors.push({
        ingredientId: reservation.ingredientId,
        error: error.message,
      });
    }
  }
  
  if (releaseErrors.length > 0) {
    logger.error('reservation_release_errors', { errors: releaseErrors });
  }
  
  return { 
    released: reservations.length - releaseErrors.length, 
    errors: releaseErrors 
  };
}
```

---

### 5. Finalize Ingredients (Branch Required)

```javascript
/**
 * Finalize reservations: move from reserved to actually deducted
 * Called when order moves from 'in_progress' to 'ready'
 * 
 * Call sites traced:
 * 1. Order state machine handler (when order.status changes to 'ready')
 * 
 * Branch source: order.branch (required field)
 */
async function finalizeIngredients(orderId, userId) {
  const order = await Order.findById(orderId);
  
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  
  if (!order.branch) {
    throw new AppError('Order missing required branch field', 500);
  }
  
  if (!order.stockReservations || order.stockReservations.length === 0) {
    throw new AppError('No stock reservations found for this order', 400);
  }
  
  if (order.stockReservationsFinalized) {
    throw new AppError('Stock already finalized for this order', 400);
  }
  
  const finalizations = [];
  
  try {
    for (const reservation of order.stockReservations) {
      // Atomic: decrement reserved, decrement current
      const updated = await Ingredient.findOneAndUpdate(
        {
          _id: reservation.ingredientId,
          reservedStock: { $gte: reservation.quantity },
          currentStock: { $gte: reservation.quantity },
        },
        {
          $inc: { 
            reservedStock: -reservation.quantity,
            currentStock: -reservation.quantity,
          },
          $set: { lastUpdated: new Date() }
        },
        { new: true }
      );
      
      if (!updated) {
        // Rollback - DO NOT call rollbackFinalizations here
        // Throw error and let catch block handle it
        throw new AppError(
          `Cannot finalize ${reservation.ingredientName}: insufficient stock`,
          409
        );
      }
      
      finalizations.push({
        ingredientId: reservation.ingredientId,
        quantity: reservation.quantity,
        previousStock: updated.currentStock + reservation.quantity,
      });
      
      // Alert status updated by hooks automatically
      
      // Record finalization
      await StockHistory.create({
        ingredient: reservation.ingredientId,
        merchant: order.merchant,
        branch: order.branch,  // Required field
        action: 'USED',
        quantity: reservation.quantity,
        stockBefore: updated.currentStock + reservation.quantity,
        stockAfter: updated.currentStock,
        unit: updated.unit,
        orderId: order._id,
        recordedBy: userId,
        recordedAt: new Date(),
      });
    }
    
    // Mark as finalized
    order.stockReservationsFinalized = true;
    order.stockFinalizationDate = new Date();
    await order.save();
    
    return { success: true, finalized: finalizations.length };
    
  } catch (error) {
    // SINGLE rollback point
    if (finalizations.length > 0) {
      await rollbackFinalizations(finalizations, order.merchant, order.branch);
    }
    throw error;
  }
}
```

---

### 6. Rollback Finalizations (Branch Required)

```javascript
/**
 * Rollback finalizations when finalize partially fails
 * 
 * Call sites traced:
 * 1. finalizeIngredients() catch block (this file)
 * 
 * Branch parameter: Required (from order.branch)
 */
async function rollbackFinalizations(finalizations, merchantId, branchId) {
  if (!branchId) {
    throw new Error('branchId is required for rollbackFinalizations');
  }
  
  const rollbackErrors = [];
  
  for (const finalization of finalizations) {
    try {
      await Ingredient.findByIdAndUpdate(
        finalization.ingredientId,
        {
          $inc: {
            reservedStock: finalization.quantity,
            currentStock: finalization.quantity,
          },
          $set: { lastUpdated: new Date() }
        }
      );
      
      await StockHistory.create({
        ingredient: finalization.ingredientId,
        merchant: merchantId,
        branch: branchId,  // Required field
        action: 'CORRECTED',
        quantity: finalization.quantity,
        stockBefore: finalization.previousStock - finalization.quantity,
        stockAfter: finalization.previousStock,
        reason: 'Finalization rolled back due to error',
        recordedAt: new Date(),
      });
    } catch (error) {
      rollbackErrors.push({
        ingredientId: finalization.ingredientId,
        error: error.message,
      });
    }
  }
  
  if (rollbackErrors.length > 0) {
    logger.error('finalization_rollback_errors', { errors: rollbackErrors });
  }
  
  return { 
    rolledBack: finalizations.length - rollbackErrors.length, 
    errors: rollbackErrors 
  };
}
```

---

### 7. Atomic Deduction (Direct - Branch Required)

```javascript
/**
 * Atomically deduct stock without reservation
 * Used for immediate/direct deductions
 * 
 * Call sites traced:
 * 1. Simple deductIngredients() wrapper (below)
 * 2. Manual stock adjustments
 * 
 * Branch parameter: Required (from order.branch or user context)
 */
async function deductIngredientAtomic(ingredientId, deductQty, context) {
  const { orderId, userId, merchantId, branchId } = context;
  
  if (!branchId) {
    throw new Error('branchId is required for deductIngredientAtomic');
  }
  
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId, 
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
    const ingredient = await Ingredient.findById(ingredientId);
    
    if (!ingredient) {
      throw new AppError(`Ingredient ${ingredientId} not found`, 404);
    }
    
    if (!ingredient.isActive) {
      throw new AppError(`Ingredient ${ingredient.name} is inactive`, 400);
    }
    
    throw new AppError(
      `Insufficient stock for ${ingredient.name}. ` +
      `Available: ${ingredient.currentStock}, Required: ${deductQty}`,
      409
    );
  }
  
  // Alert status updated by hooks - no manual update needed
  
  // Record deduction
  await StockHistory.create({
    ingredient: ingredientId,
    merchant: merchantId,
    branch: branchId,  // Required field
    action: 'USED',
    quantity: deductQty,
    stockBefore: updated.currentStock + deductQty,
    stockAfter: updated.currentStock,
    unit: updated.unit,
    orderId,
    recordedBy: userId,
    recordedAt: new Date(),
  });
  
  return updated;
}
```

---

### 8. Deduct Ingredients Wrapper (Branch Required)

```javascript
/**
 * Deduct ingredients for an order
 * Wrapper around deductIngredientAtomic with rollback support
 * 
 * Call sites traced:
 * 1. Order fulfillment handler (when order served)
 * 2. Legacy direct deduction flow (non-reservation path)
 * 
 * Branch source: order.branch (required field)
 */
async function deductIngredients(orderId, userId) {
  const order = await Order.findById(orderId).populate('items.menuItem');
  
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  
  if (!order.branch) {
    throw new AppError('Order missing required branch field', 500);
  }
  
  const deductions = [];
  
  try {
    for (const orderItem of order.items) {
      const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
        .populate('items.ingredient');
      
      if (!recipe) continue;
      
      for (const recipeItem of recipe.items) {
        const deductQty = recipeItem.quantity * orderItem.quantity;
        
        const updated = await deductIngredientAtomic(
          recipeItem.ingredient._id,
          deductQty,
          {
            orderId: order._id,
            userId,
            merchantId: order.merchant,
            branchId: order.branch,  // Required field from order
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
    
  } catch (error) {
    // SINGLE rollback point
    if (deductions.length > 0) {
      await rollbackDeductions(deductions, order.merchant, order.branch);
    }
    throw error;
  }
}
```

---

### 9. Rollback Deductions (Branch Required)

```javascript
/**
 * Rollback deductions when deduct partially fails
 * 
 * Call sites traced:
 * 1. deductIngredients() catch block (this file)
 * 
 * Branch parameter: Required (from order.branch)
 */
async function rollbackDeductions(deductions, merchantId, branchId) {
  if (!branchId) {
    throw new Error('branchId is required for rollbackDeductions');
  }
  
  const rollbackErrors = [];
  
  for (const deduction of deductions) {
    try {
      await Ingredient.findByIdAndUpdate(
        deduction.ingredientId,
        { 
          $inc: { currentStock: deduction.quantity },
          $set: { lastUpdated: new Date() }
        }
      );
      
      await StockHistory.create({
        ingredient: deduction.ingredientId,
        merchant: merchantId,
        branch: branchId,  // Required field
        action: 'CORRECTED',
        quantity: deduction.quantity,
        stockBefore: deduction.previousStock - deduction.quantity,
        stockAfter: deduction.previousStock,
        reason: 'Deduction rolled back due to error',
        recordedAt: new Date(),
      });
    } catch (error) {
      rollbackErrors.push({
        ingredientId: deduction.ingredientId,
        error: error.message,
      });
    }
  }
  
  if (rollbackErrors.length > 0) {
    logger.error('deduction_rollback_errors', { errors: rollbackErrors });
  }
  
  return { 
    rolledBack: deductions.length - rollbackErrors.length, 
    errors: rollbackErrors 
  };
}
```

---

## Call Site Trace Results

### Issue #1: Double-Release Pattern
**Functions checked for duplicate rollback calls:**
1. ✅ `reserveIngredients()` - FIXED (removed inner call)
2. ✅ `finalizeIngredients()` - No duplicate (only catch block calls rollback)
3. ✅ `deductIngredients()` - No duplicate (only catch block calls rollback)

**Pattern verified**: Each function has SINGLE rollback point in catch block only

### Issue #3: Branch Field Availability
**All call sites verified to have order.branch:**
1. ✅ `reserveIngredients()` - Gets from order.branch (required in Order model)
2. ✅ `finalizeIngredients()` - Gets from order.branch (validated at entry)
3. ✅ `deductIngredients()` - Gets from order.branch (validated at entry)
4. ✅ `deductIngredientAtomic()` - Receives via context param (validated by caller)

**All rollback functions receive branch from order:**
1. ✅ `releaseReservations()` - Receives order.merchant, order.branch
2. ✅ `rollbackFinalizations()` - Receives order.merchant, order.branch
3. ✅ `rollbackDeductions()` - Receives order.merchant, order.branch

**Validation added**: All entry points validate `order.branch` exists before proceeding

---

## Summary

### Three Issues - All Fixed:

1. ✅ **Double-release bug**: Removed duplicate rollback call from `reserveIngredients()`
2. ✅ **Field verification**: Confirmed `minStock` from actual repo (models/Ingredient.js:29-33)
3. ✅ **Branch decision**: Kept REQUIRED (Order has required branch, enables reporting)

### Code Quality:
- Single rollback point per function (catch block only)
- All StockHistory entries have required merchant/branch
- All entry points validate order.branch exists
- Consistent error handling with partial-failure recovery
- No duplicate alertStatus logic (hooks handle everything)

**Ready for Phase 1 implementation.**
