const { NotificationService } = require('../../notifications');
const { InventoryRepository } = require('../repository/InventoryRepository');
const Ingredient = require('../../../../models/Ingredient');
const logger = require('../../../../utils/logger');

class InventoryService {
  static async getInventoryValuation(merchantId) {
    const ingredients = await InventoryRepository.findActiveIngredientsByMerchant(merchantId);
    let totalValue = 0;

    ingredients.forEach(ingredient => {
      totalValue += ingredient.currentStock * (ingredient.costPerUnit || 0);
    });

    return {
      totalValue,
      itemCount: ingredients.length,
      lowStockItems: ingredients.filter(item => item.isLowStock()).length,
    };
  }

  static async adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    cost = 0,
    branchId = null
  ) {
    const session = await InventoryRepository.startIngredientSession();
    session.startTransaction();

    try {
      if (type === 'out' || type === 'waste' || type === 'adjustment') {
        const result = await InventoryRepository.updateIngredient(
          {
            _id: ingredientId,
            merchant: merchantId,
            ...(branchId && { branch: branchId }),
            currentStock: { $gte: quantity },
          },
          {
            $inc: { currentStock: -quantity },
            $set: { lastRestocked: type === 'in' ? new Date() : undefined },
          },
          { session }
        );

        if (result.modifiedCount === 0) {
          throw new Error('Insufficient stock or ingredient not found');
        }

        const ingredient = await InventoryRepository.findIngredientOne(
          { _id: ingredientId, merchant: merchantId, ...(branchId && { branch: branchId }) },
          { session }
        );

        await InventoryRepository.createStockMovements(
          [
            {
              merchant: merchantId,
              ...(branchId && { branch: branchId }),
              ingredient: ingredientId,
              type,
              quantity,
              previousStock: ingredient.currentStock + quantity,
              newStock: ingredient.currentStock,
              reason,
              reference,
              cost,
              performedBy,
            },
          ],
          { session }
        );

        await session.commitTransaction();

        await this.scheduleInventoryRealtimeEvents(merchantId, ingredient);

        return ingredient;
      }

      const ingredient = await InventoryRepository.findIngredientOne(
        { _id: ingredientId, merchant: merchantId, ...(branchId && { branch: branchId }) },
        { session }
      );

      if (!ingredient) {
        throw new Error('Ingredient not found');
      }

      const previousStock = ingredient.currentStock;
      ingredient.currentStock += quantity;
      if (type === 'in') {
        ingredient.lastRestocked = new Date();
      }

      await InventoryRepository.saveIngredient(ingredient, { session });

      await InventoryRepository.createStockMovements(
        [
          {
            merchant: merchantId,
            ...(branchId && { branch: branchId }),
            ingredient: ingredientId,
            type,
            quantity,
            previousStock,
            newStock: ingredient.currentStock,
            reason,
            reference,
            cost,
            performedBy,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      await this.scheduleInventoryRealtimeEvents(merchantId, ingredient);

      return ingredient;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async scheduleInventoryRealtimeEvents(merchantId, ingredient) {
    await NotificationService.notifyInventoryStockUpdated(merchantId, ingredient);
    if (typeof ingredient.isLowStock === 'function' && ingredient.isLowStock()) {
      await NotificationService.notifyLowStock(merchantId, ingredient);
    }
  }

  static async resolveDeductionPlan(orderItems, merchantId, branchId) {
    const aggregated = new Map();

    for (const orderItem of orderItems) {
      const ingredientUsage = await this.getIngredientUsageForMenuItem(
        orderItem.menuItem,
        merchantId,
        branchId  // ← Pass branch for scoped ingredient lookup
      );

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

  static async deductForOrder({ merchantId, branchId, orderId, orderNumber, plan, performedBy }, session) {
    if (!session) {
      throw new Error('deductForOrder requires a MongoDB session');
    }

    const reference = `Order ${orderNumber}`;
    const ingredients = [];

    for (const line of plan) {
      const ingredient = await this.adjustStockAtomic(
        merchantId,
        branchId,
        line.ingredientId,
        line.totalQuantity,
        'out',
        'order_consumption',
        reference,
        performedBy,
        session,
        0,  // cost
        orderId  // ✅ NEW: Pass orderId for StockHistory linkage
      );
      ingredients.push(ingredient);
    }

    return { ingredients, deductions: plan };
  }

  static async deductStockFromOrder(merchantId, branchId, orderItems, performedBy) {
    const plan = await this.resolveDeductionPlan(orderItems, merchantId);
    const session = await InventoryRepository.startRecipeSession();

    try {
      await session.withTransaction(async () => {
        await this.deductForOrder(
          {
            merchantId,
            branchId,
            orderNumber: 'Unknown',
            plan,
            performedBy,
          },
          session
        );
      });
      return plan;
    } finally {
      session.endSession();
    }
  }

  static async adjustStockAtomic(
    merchantId,
    branchId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    session,
    cost = 0,
    orderId = null  // ✅ NEW: Optional orderId for linking refunds
  ) {
    if (type === 'out' || type === 'waste' || type === 'adjustment') {
      // ✅ FIXED: Use findOneAndUpdate instead of updateOne to trigger Mongoose hooks
      // This ensures alertStatus is recalculated after deduction
      const ingredient = await Ingredient.findOneAndUpdate(
        {
          _id: ingredientId,
          merchant: merchantId,
          branch: branchId,
          currentStock: { $gte: quantity },
        },
        {
          $inc: { currentStock: -quantity },
        },
        { new: true, session }
      );

      if (!ingredient) {
        throw new Error('Insufficient stock or ingredient not found');
      }

      const previousStock = ingredient.currentStock + quantity;
      const newStock = ingredient.currentStock;

      // Create StockMovement entry (existing behavior)
      await InventoryRepository.createStockMovements(
        [
          {
            merchant: merchantId,
            branch: branchId,
            ingredient: ingredientId,
            type,
            quantity,
            previousStock,
            newStock,
            reason,
            reference,
            cost,
            performedBy,
          },
        ],
        { session }
      );

      // ✅ NEW: Also create StockHistory USED entry for order placement (enables void/refund)
      // This is critical for the void handler to find what was deducted
      if (type === 'out' && reason === 'order_consumption' && orderId) {
        const StockHistory = require('../../../../models/StockHistory');
        await StockHistory.create(
          [
            {
              merchant: merchantId,
              branch: branchId,
              ingredient: ingredientId,
              action: 'USED',  // ✅ Marks this as a deduction (used for void/refund lookup)
              quantity,
              stockBefore: previousStock,
              stockAfter: newStock,
              reason: 'Order consumption',
              orderId,
              recordedBy: performedBy,
            },
          ],
          { session }
        );
      }

      return ingredient;
    }

    const ingredient = await InventoryRepository.findIngredientOne(
      { _id: ingredientId, merchant: merchantId, branch: branchId },
      { session }
    );

    if (!ingredient) {
      throw new Error('Ingredient not found');
    }

    const previousStock = ingredient.currentStock;
    const previousCostPerUnit = ingredient.costPerUnit || 0;
    
    ingredient.currentStock += quantity;

    // ✅ NEW: Cost averaging on stock 'in' (purchase/receipt)
    // When receiving stock with a cost, calculate weighted average
    // newCostPerUnit = ((currentStock * currentCostPerUnit) + (receivedQty * receivedCost)) / (currentStock + receivedQty)
    if (type === 'in' && cost > 0 && quantity > 0) {
      const totalCostBeforeReceipt = previousStock * previousCostPerUnit;
      const costOfNewStock = quantity * cost;
      const totalCostAfterReceipt = totalCostBeforeReceipt + costOfNewStock;
      ingredient.costPerUnit = totalCostAfterReceipt / ingredient.currentStock;
    }

    await InventoryRepository.saveIngredient(ingredient, { session });

    await InventoryRepository.createStockMovements(
      [
        {
          merchant: merchantId,
          branch: branchId,
          ingredient: ingredientId,
          type,
          quantity,
          previousStock,
          newStock: ingredient.currentStock,
          reason,
          reference,
          cost,
          performedBy,
        },
      ],
      { session }
    );

    return ingredient;
  }

  /**
   * Get ingredient usage for a menu item from its recipe
   * 
   * CRITICAL: Resolves recipe items by ingredientName (String) against the Ingredient collection.
   * This enables branch-level ingredient isolation — same recipe, but branch-scoped ingredient stocks.
   * 
   * Feature-flag aware:
   * - If merchant has inventory module disabled: Returns empty array (no deduction)
   * - If merchant has inventory module enabled: Recipe is REQUIRED
   * 
   * @param {string} menuItemId - Menu item ID
   * @param {string} merchantId - Merchant ID
   * @param {string} branchId - Branch ID (for ingredient resolution)
   * @returns {Promise<Array>} Array of ingredient usage objects with resolved ingredientId
   */
  static async getIngredientUsageForMenuItem(menuItemId, merchantId, branchId) {
    // Check if merchant has inventory module enabled
    const Merchant = require('../../../../models/merchantModel');
    const merchant = await Merchant.findById(merchantId);

    if (!merchant) {
      throw new Error(`Merchant ${merchantId} not found`);
    }

    const hasInventoryModule = merchant.hasFeature('inventory');

    // If inventory module is disabled, return empty (no inventory deduction)
    if (!hasInventoryModule) {
      logger.info('inventory.recipe.skipped', {
        menuItemId,
        merchantId,
        reason: 'Inventory module not enabled for merchant',
      });
      return []; // No ingredients to deduct
    }

    // Inventory module is enabled - recipe is REQUIRED
    const recipe = await InventoryRepository.findActiveRecipeForMenuItem(menuItemId, merchantId);

    if (!recipe || !recipe.items || recipe.items.length === 0) {
      throw new Error(
        `Inventory module is enabled but no active recipe found for menu item ${menuItemId}. ` +
        `Please create a recipe in the inventory system or disable the inventory module.`
      );
    }

    // ✅ FIXED: Resolve each recipe item by ingredientName + unit against branch-scoped inventory
    const resolved = [];
    for (const recipeItem of recipe.items) {
      // Look up ingredient by name+unit, scoped to merchant+branch
      const ingredient = await Ingredient.findOne({
        merchant: merchantId,
        branch: branchId,
        name: recipeItem.ingredientName,
        unit: recipeItem.unit,
        isActive: true,
      });

      if (!ingredient) {
        throw new Error(
          `Recipe ingredient not found: "${recipeItem.ingredientName}" (${recipeItem.unit}) ` +
          `for merchant ${merchantId}, branch ${branchId}`
        );
      }

      resolved.push({
        ingredientId: ingredient._id,  // Real ObjectId after lookup
        quantity: recipeItem.quantity,
        unit: recipeItem.unit,
      });
    }

    return resolved;
  }

  static async getLowStockAlerts(merchantId) {
    return InventoryRepository.getLowStockItems(merchantId);
  }

  static async getStockMovements(merchantId, { ingredientId, type, startDate, endDate } = {}) {
    const filter = { merchant: merchantId };

    if (ingredientId) filter.ingredient = ingredientId;
    
    // Handle type as array (for multiple type filters)
    if (type) {
      if (Array.isArray(type)) {
        filter.type = { $in: type };
      } else {
        filter.type = type;
      }
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    return InventoryRepository.findStockMovements(filter);
  }

  static async restoreOrderStock(orderId, merchantId, branchId, session) {
    /**
     * Restore all stock deducted for a canceled order.
     * 
     * Finds all 'USED' movements for this order in StockHistory,
     * then adds them back.
     * 
     * @param {string} orderId - Order ID to reverse
     * @param {string} merchantId - Merchant ID (tenant context)
     * @param {string} branchId - Branch ID (branch context)
     * @param {Object} session - MongoDB session for atomicity
     * @returns {Object} - { restored: [], reversals: [] }
     */
    if (!session) {
      throw new Error('restoreOrderStock requires a MongoDB session');
    }

    const StockHistory = require('../../../../models/StockHistory');

    // Find all deductions for this order
    const deductions = await StockHistory.find(
      {
        merchant: merchantId,
        branch: branchId,
        orderId: orderId,
        action: 'USED',
      }
    ).session(session).select('ingredient quantity stockBefore stockAfter');

    if (deductions.length === 0) {
      // No deductions found — order may have been placed but never deducted
      return { restored: [], reversals: [] };
    }

    const restored = [];
    const reversals = [];

    // Restore each deduction atomically
    for (const deduction of deductions) {
      const ingredient = await Ingredient.findOneAndUpdate(
        {
          _id: deduction.ingredient,
          merchant: merchantId,
          branch: branchId,
        },
        {
          $inc: { currentStock: deduction.quantity }, // Restore the deducted amount
        },
        { new: true, session }
      );

      if (!ingredient) {
        throw new Error(`Ingredient not found during cancellation restore: ${deduction.ingredient}`);
      }

      // Create reversal audit entry
      // Use mongoose to create with session
      const mongoose = require('mongoose');
      await StockHistory.create(
        [
          {
            merchant: merchantId,
            branch: branchId,
            ingredient: deduction.ingredient,
            action: 'RELEASED',
            quantity: deduction.quantity,
            stockBefore: deduction.stockAfter, // Before restoration (was depleted)
            stockAfter: ingredient.currentStock, // After restoration
            reason: `Order ${orderId} canceled - stock restored`,
            orderId: orderId,
          },
        ],
        { session }
      );

      restored.push(ingredient);
      reversals.push({
        ingredientId: deduction.ingredient,
        restoredQuantity: deduction.quantity,
        newStock: ingredient.currentStock,
      });
    }

    return { restored, reversals };
  }

  static async refundOrderItems(orderId, merchantId, branchId, itemsToRefund, reason, performedBy, session) {
    /**
     * Partial refund: Restore stock for specific items/quantities within an order.
     * 
     * SAFETY: Validates that refund quantities do NOT exceed what was actually deducted
     * by checking StockHistory 'USED' entries for this order.
     * 
     * @param {ObjectId} orderId - Order ID
     * @param {ObjectId} merchantId - Merchant ID (tenant context)
     * @param {ObjectId} branchId - Branch ID (branch context)
     * @param {Array} itemsToRefund - Items to refund: [{ ingredientId, quantity }, ...]
     * @param {string} reason - Refund reason (e.g. 'Customer rejected item')
     * @param {ObjectId} performedBy - User performing the refund
     * @param {Object} session - MongoDB session for atomicity
     * @returns {Object} - { refunded: [], reversals: [] }
     * @throws {Error} - If refund quantity exceeds deducted amount
     */
    if (!session) {
      throw new Error('refundOrderItems requires a MongoDB session');
    }

    if (!itemsToRefund || itemsToRefund.length === 0) {
      throw new Error('itemsToRefund array cannot be empty');
    }

    const StockHistory = require('../../../../models/StockHistory');
    const refunded = [];
    const reversals = [];

    // ✅ SAFETY: Build map of actual deductions from StockHistory
    const deductionMap = {};  // { ingredientId: totalDeducted }
    const deducedEntries = await StockHistory.find(
      {
        orderId: orderId,
        merchant: merchantId,
        branch: branchId,
        action: 'USED',
      },
      null,
      { session }
    );

    for (const entry of deducedEntries) {
      const key = entry.ingredient.toString();
      deductionMap[key] = (deductionMap[key] || 0) + entry.quantity;
    }

    // Validate and restore each item atomically
    for (const refundItem of itemsToRefund) {
      const { ingredientId, quantity } = refundItem;

      if (!ingredientId || !quantity || quantity <= 0) {
        throw new Error('Invalid refund item: missing ingredientId or invalid quantity');
      }

      // ✅ SAFETY: Check refund amount doesn't exceed what was deducted
      const ingredientKey = ingredientId.toString();
      const actualDeducted = deductionMap[ingredientKey] || 0;

      if (quantity > actualDeducted) {
        throw new Error(
          `Refund validation failed for ingredient ${ingredientId}: ` +
          `requested ${quantity} but only ${actualDeducted} was deducted on order ${orderId}`
        );
      }

      // Restore the stock
      const ingredient = await Ingredient.findOneAndUpdate(
        {
          _id: ingredientId,
          merchant: merchantId,
          branch: branchId,
        },
        {
          $inc: { currentStock: quantity },
        },
        { new: true, session }
      );

      if (!ingredient) {
        throw new Error(`Ingredient not found during refund: ${ingredientId}`);
      }

      // Create refund audit entry
      const mongoose = require('mongoose');
      await StockHistory.create(
        [
          {
            merchant: merchantId,
            branch: branchId,
            ingredient: ingredientId,
            action: 'RELEASED',  // Use RELEASED for refund
            quantity,
            stockBefore: ingredient.currentStock - quantity,  // Before refund
            stockAfter: ingredient.currentStock,              // After refund
            reason: reason || `Order ${orderId} partial refund`,
            orderId,
            recordedBy: performedBy,
          },
        ],
        { session }
      );

      refunded.push(ingredient);
      reversals.push({
        ingredientId,
        refundedQuantity: quantity,
        newStock: ingredient.currentStock,
      });
    }

    return { refunded, reversals };
  }

  static async batchAdjustStock(merchantId, adjustments, performedBy, branchId = null) {
    /**
     * Batch adjust stock for multiple ingredients in a single atomic transaction.
     * 
     * @param {string} merchantId - Merchant ID
     * @param {Array} adjustments - Array of { ingredientId, quantity, type, reason, cost }
     * @param {string} performedBy - User ID performing adjustments
     * @param {string} branchId - Branch ID for branch-level scoping
     * @returns {Array} - Results: [{ success, ingredientId, message }, ...]
     */
    const results = [];

    for (const adjustment of adjustments) {
      try {
        const result = await this.adjustStock(
          merchantId,
          adjustment.ingredientId,
          adjustment.quantity,
          adjustment.type,
          adjustment.reason || 'Batch adjustment',
          adjustment.reference || `Batch adjustment`,
          performedBy,
          adjustment.cost || 0,
          branchId
        );

        results.push({
          success: true,
          ingredientId: adjustment.ingredientId,
          ingredient: result,
        });
      } catch (error) {
        results.push({
          success: false,
          ingredientId: adjustment.ingredientId,
          message: error.message,
        });
      }
    }

    return results;
  }
}

module.exports = { InventoryService };
