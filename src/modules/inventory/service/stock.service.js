// src/modules/inventory/service/stock.service.js
const Ingredient = require('../../../../models/Ingredient');
const StockHistory = require('../../../../models/StockHistory');
const Order = require('../../../../models/orderModel');
const Recipe = require('../../../../models/Recipe');
const AppError = require('../../../../utils/appError');

/**
 * Stock Service - V3 Implementation
 * 
 * Three-stage deduction pattern:
 * 1. reserve → finalize → release (covered in Stage 4 & 5)
 * 2. Direct deduction (this stage)
 * 
 * Race-condition protection via atomic findOneAndUpdate with stock condition.
 */

/**
 * Atomically deduct stock without reservation
 * Used for immediate/direct deductions
 * 
 * @param {ObjectId} ingredientId - Ingredient to deduct from
 * @param {Number} deductQty - Quantity to deduct
 * @param {Object} context - Context object with orderId, userId, merchantId, branchId
 * @returns {Promise<Ingredient>} Updated ingredient document
 */
async function deductIngredientAtomic(ingredientId, deductQty, context) {
  const { orderId, userId, merchantId, branchId } = context;
  
  if (!branchId) {
    throw new Error('branchId is required for deductIngredientAtomic');
  }
  
  // Atomic update with stock availability condition
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
  
  // Alert status updated by hooks automatically - no manual update needed
  
  // Record deduction in history
  await StockHistory.create({
    ingredient: ingredientId,
    merchant: merchantId,
    branch: branchId,
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

/**
 * Deduct ingredients for an order
 * Wrapper around deductIngredientAtomic with rollback support
 * 
 * @param {ObjectId} orderId - Order ID
 * @param {ObjectId} userId - User performing the deduction
 * @returns {Promise<Object>} { success: true, deductions: [...] }
 */
async function deductIngredients(orderId, userId) {
  const order = await Order.findById(orderId);
  
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
            branchId: order.branch,
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
    // SINGLE rollback point - only called once per failed deductIngredients()
    if (deductions.length > 0) {
      await rollbackDeductions(deductions, order.merchant, order.branch);
    }
    throw error;
  }
}

/**
 * Rollback deductions when deduct partially fails
 * 
 * @param {Array} deductions - Array of deduction objects to rollback
 * @param {ObjectId} merchantId - Merchant ID
 * @param {ObjectId} branchId - Branch ID (required)
 * @returns {Promise<Object>} { rolledBack: number, errors: [...] }
 */
async function rollbackDeductions(deductions, merchantId, branchId) {
  if (!branchId) {
    throw new Error('branchId is required for rollbackDeductions');
  }
  
  const rollbackErrors = [];
  
  for (const deduction of deductions) {
    try {
      const updated = await Ingredient.findByIdAndUpdate(
        deduction.ingredientId,
        { 
          $inc: { currentStock: deduction.quantity },
          $set: { lastUpdated: new Date() }
        },
        { new: true }  // ← ADDED: Get updated document so alertStatus hook fires on restored state
      );
      
      // Only create history entry if ingredient was actually updated
      if (updated) {
        await StockHistory.create({
          ingredient: deduction.ingredientId,
          merchant: merchantId,
          branch: branchId,
          action: 'CORRECTED',
          quantity: deduction.quantity,
          stockBefore: deduction.previousStock - deduction.quantity,
          stockAfter: deduction.previousStock,
          reason: 'Deduction rolled back due to error',
          recordedAt: new Date(),
        });
      } else {
        // Ingredient not found - add to errors
        rollbackErrors.push({
          ingredientId: deduction.ingredientId,
          error: 'Ingredient not found during rollback',
        });
      }
    } catch (error) {
      rollbackErrors.push({
        ingredientId: deduction.ingredientId,
        error: error.message,
      });
    }
  }
  
  if (rollbackErrors.length > 0) {
    console.error('deduction_rollback_errors', { errors: rollbackErrors });
  }
  
  return { 
    rolledBack: deductions.length - rollbackErrors.length, 
    errors: rollbackErrors 
  };
}

/**
 * Atomically reserve stock (increment reservedStock)
 * Checks that available stock (currentStock - reservedStock) >= reserveQty
 * 
 * @param {ObjectId} ingredientId - Ingredient to reserve
 * @param {Number} reserveQty - Quantity to reserve
 * @param {Object} context - Context object with orderId, userId, merchantId, branchId
 * @returns {Promise<Ingredient>} Updated ingredient document
 */
async function reserveIngredientAtomic(ingredientId, reserveQty, context) {
  const { orderId, userId, merchantId, branchId } = context;
  
  if (!branchId) {
    throw new Error('branchId is required for reserveIngredientAtomic');
  }
  
  // Atomic update with available stock check: currentStock - reservedStock >= reserveQty
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId,
      isActive: true,
      // Use $expr to check available stock in query
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
    const ingredient = await Ingredient.findById(ingredientId);
    
    if (!ingredient) {
      throw new AppError(`Ingredient ${ingredientId} not found`, 404);
    }
    
    if (!ingredient.isActive) {
      throw new AppError(`Ingredient ${ingredient.name} is inactive`, 400);
    }
    
    const available = ingredient.currentStock - (ingredient.reservedStock || 0);
    throw new AppError(
      `Insufficient available stock for ${ingredient.name}. ` +
      `Available: ${available}, Required: ${reserveQty}`,
      409
    );
  }
  
  // Record reservation in history
  await StockHistory.create({
    ingredient: ingredientId,
    merchant: merchantId,
    branch: branchId,
    action: 'RESERVED',
    quantity: reserveQty,
    stockBefore: updated.currentStock,
    stockAfter: updated.currentStock,
    reservedBefore: (updated.reservedStock - reserveQty) || 0,
    reservedAfter: updated.reservedStock,
    unit: updated.unit,
    orderId,
    recordedBy: userId,
    recordedAt: new Date(),
  });
  
  return updated;
}

/**
 * Reserve ingredients for an order
 * Wrapper around reserveIngredientAtomic with rollback support
 * 
 * @param {ObjectId} orderId - Order ID
 * @param {ObjectId} userId - User performing the reservation
 * @returns {Promise<Object>} { success: true, reservations: [...] }
 */
async function reserveIngredients(orderId, userId) {
  const order = await Order.findById(orderId);
  
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
        
        const updated = await reserveIngredientAtomic(
          recipeItem.ingredient._id,
          reserveQty,
          {
            orderId: order._id,
            userId,
            merchantId: order.merchant,
            branchId: order.branch,
          }
        );
        
        reservations.push({
          ingredientId: recipeItem.ingredient._id,
          quantity: reserveQty,
          // previousReserved kept for future use (e.g., audit trail, finalize logic)
          previousReserved: updated.reservedStock - reserveQty,
        });
      }
    }
    
    return { success: true, reservations };
    
  } catch (error) {
    // SINGLE rollback point - only called once per failed reserveIngredients()
    if (reservations.length > 0) {
      await releaseReservations(reservations, order.merchant, order.branch);
    }
    throw error;
  }
}

/**
 * Release (cancel) reservations when reserve partially fails
 * 
 * @param {Array} reservations - Array of reservation objects to release
 * @param {ObjectId} merchantId - Merchant ID
 * @param {ObjectId} branchId - Branch ID (required)
 * @returns {Promise<Object>} { released: number, errors: [...] }
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
        }
      );
      
      // Only create history entry if ingredient was actually updated
      if (updated) {
        await StockHistory.create({
          ingredient: reservation.ingredientId,
          merchant: merchantId,
          branch: branchId,
          action: 'RELEASED',
          quantity: reservation.quantity,
          stockBefore: updated.currentStock,
          stockAfter: updated.currentStock,
          reservedBefore: updated.reservedStock,
          reservedAfter: updated.reservedStock - reservation.quantity,
          reason: 'Reservation released due to error',
          recordedAt: new Date(),
        });
      } else {
        // Ingredient not found - add to errors
        releaseErrors.push({
          ingredientId: reservation.ingredientId,
          error: 'Ingredient not found during release',
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
    console.error('reservation_release_errors', { errors: releaseErrors });
  }
  
  return { 
    released: reservations.length - releaseErrors.length, 
    errors: releaseErrors 
  };
}

/**
 * Atomically finalize reserved stock (move from reserved to deducted)
 * Decrements both reservedStock and currentStock in single atomic operation
 * 
 * @param {ObjectId} ingredientId - Ingredient to finalize
 * @param {Number} finalizeQty - Quantity to finalize
 * @param {Object} context - Context object with orderId, userId, merchantId, branchId
 * @returns {Promise<Ingredient>} Updated ingredient document
 */
async function finalizeIngredientAtomic(ingredientId, finalizeQty, context) {
  const { orderId, userId, merchantId, branchId } = context;
  
  if (!branchId) {
    throw new Error('branchId is required for finalizeIngredientAtomic');
  }
  
  // Atomic update: decrement both reservedStock and currentStock
  const updated = await Ingredient.findOneAndUpdate(
    { 
      _id: ingredientId,
      isActive: true,
      reservedStock: { $gte: finalizeQty },
      currentStock: { $gte: finalizeQty }
    },
    { 
      $inc: { reservedStock: -finalizeQty, currentStock: -finalizeQty },
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
      `Insufficient reserved stock for ${ingredient.name}. ` +
      `Reserved: ${ingredient.reservedStock || 0}, Required: ${finalizeQty}`,
      409
    );
  }
  
  // Record finalization in history
  await StockHistory.create({
    ingredient: ingredientId,
    merchant: merchantId,
    branch: branchId,
    action: 'USED',
    quantity: finalizeQty,
    stockBefore: updated.currentStock + finalizeQty,
    stockAfter: updated.currentStock,
    reservedBefore: updated.reservedStock + finalizeQty,
    reservedAfter: updated.reservedStock,
    unit: updated.unit,
    orderId,
    recordedBy: userId,
    recordedAt: new Date(),
  });
  
  return updated;
}

/**
 * Finalize ingredients for an order (convert reserved to deducted)
 * Wrapper around finalizeIngredientAtomic with rollback support
 * 
 * @param {ObjectId} orderId - Order ID
 * @param {ObjectId} userId - User performing the finalization
 * @returns {Promise<Object>} { success: true, finalizations: [...] }
 */
async function finalizeIngredients(orderId, userId) {
  const order = await Order.findById(orderId);
  
  if (!order) {
    throw new AppError('Order not found', 404);
  }
  
  if (!order.branch) {
    throw new AppError('Order missing required branch field', 500);
  }
  
  const finalizations = [];
  
  try {
    for (const orderItem of order.items) {
      const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
        .populate('items.ingredient');
      
      if (!recipe) continue;
      
      for (const recipeItem of recipe.items) {
        const finalizeQty = recipeItem.quantity * orderItem.quantity;
        
        const updated = await finalizeIngredientAtomic(
          recipeItem.ingredient._id,
          finalizeQty,
          {
            orderId: order._id,
            userId,
            merchantId: order.merchant,
            branchId: order.branch,
          }
        );
        
        finalizations.push({
          ingredientId: recipeItem.ingredient._id,
          quantity: finalizeQty,
          previousReserved: updated.reservedStock + finalizeQty,
          previousStock: updated.currentStock + finalizeQty,
        });
      }
    }
    
    return { success: true, finalizations };
    
  } catch (error) {
    // SINGLE rollback point - only called once per failed finalizeIngredients()
    if (finalizations.length > 0) {
      await rollbackFinalizations(finalizations, order.merchant, order.branch);
    }
    throw error;
  }
}

/**
 * Rollback (undo) finalizations when finalize partially fails
 * 
 * @param {Array} finalizations - Array of finalization objects to rollback
 * @param {ObjectId} merchantId - Merchant ID
 * @param {ObjectId} branchId - Branch ID (required)
 * @returns {Promise<Object>} { rolledBack: number, errors: [...] }
 */
async function rollbackFinalizations(finalizations, merchantId, branchId) {
  if (!branchId) {
    throw new Error('branchId is required for rollbackFinalizations');
  }
  
  const rollbackErrors = [];
  
  for (const finalization of finalizations) {
    try {
      const updated = await Ingredient.findByIdAndUpdate(
        finalization.ingredientId,
        { 
          $inc: { reservedStock: finalization.quantity, currentStock: finalization.quantity },
          $set: { lastUpdated: new Date() }
        },
        { new: true }  // ← ADDED: Get updated document so alertStatus hook fires on restored state
      );
      
      // Only create history entry if ingredient was actually updated
      if (updated) {
        await StockHistory.create({
          ingredient: finalization.ingredientId,
          merchant: merchantId,
          branch: branchId,
          action: 'CORRECTED',
          quantity: finalization.quantity,
          // Compute from input parameters, not updated document (which has new values after $inc)
          stockBefore: finalization.previousStock - finalization.quantity,
          stockAfter: finalization.previousStock,
          reservedBefore: finalization.previousReserved - finalization.quantity,
          reservedAfter: finalization.previousReserved,
          reason: 'Finalization rolled back due to error',
          recordedAt: new Date(),
        });
      } else {
        // Ingredient not found - add to errors
        rollbackErrors.push({
          ingredientId: finalization.ingredientId,
          error: 'Ingredient not found during rollback',
        });
      }
    } catch (error) {
      rollbackErrors.push({
        ingredientId: finalization.ingredientId,
        error: error.message,
      });
    }
  }
  
  if (rollbackErrors.length > 0) {
    console.error('finalization_rollback_errors', { errors: rollbackErrors });
  }
  
  return { 
    rolledBack: finalizations.length - rollbackErrors.length, 
    errors: rollbackErrors 
  };
}

module.exports = {
  deductIngredientAtomic,
  deductIngredients,
  rollbackDeductions,
  reserveIngredientAtomic,
  reserveIngredients,
  releaseReservations,
  finalizeIngredientAtomic,
  finalizeIngredients,
  rollbackFinalizations,
};
