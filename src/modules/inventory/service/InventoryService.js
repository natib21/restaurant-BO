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
    cost = 0
  ) {
    const session = await InventoryRepository.startIngredientSession();
    session.startTransaction();

    try {
      if (type === 'out' || type === 'waste' || type === 'adjustment') {
        const result = await InventoryRepository.updateIngredient(
          {
            _id: ingredientId,
            merchant: merchantId,
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
          { _id: ingredientId, merchant: merchantId },
          { session }
        );

        await InventoryRepository.createStockMovements(
          [
            {
              merchant: merchantId,
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
        { _id: ingredientId, merchant: merchantId },
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

  static async resolveDeductionPlan(orderItems, merchantId) {
    const aggregated = new Map();

    for (const orderItem of orderItems) {
      const ingredientUsage = await this.getIngredientUsageForMenuItem(
        orderItem.menuItem,
        merchantId
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

  static async deductForOrder({ merchantId, orderNumber, plan, performedBy }, session) {
    if (!session) {
      throw new Error('deductForOrder requires a MongoDB session');
    }

    const reference = `Order ${orderNumber}`;
    const ingredients = [];

    for (const line of plan) {
      const ingredient = await this.adjustStockAtomic(
        merchantId,
        line.ingredientId,
        line.totalQuantity,
        'out',
        'order_consumption',
        reference,
        performedBy,
        session
      );
      ingredients.push(ingredient);
    }

    return { ingredients, deductions: plan };
  }

  static async deductStockFromOrder(merchantId, orderItems, performedBy) {
    const plan = await this.resolveDeductionPlan(orderItems, merchantId);
    const session = await InventoryRepository.startRecipeSession();

    try {
      await session.withTransaction(async () => {
        await this.deductForOrder(
          {
            merchantId,
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
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    session,
    cost = 0
  ) {
    if (type === 'out' || type === 'waste' || type === 'adjustment') {
      // ✅ FIXED: Use findOneAndUpdate instead of updateOne to trigger Mongoose hooks
      // This ensures alertStatus is recalculated after deduction
      const ingredient = await Ingredient.findOneAndUpdate(
        {
          _id: ingredientId,
          merchant: merchantId,
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

      await InventoryRepository.createStockMovements(
        [
          {
            merchant: merchantId,
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

      return ingredient;
    }

    const ingredient = await InventoryRepository.findIngredientOne(
      { _id: ingredientId, merchant: merchantId },
      { session }
    );

    if (!ingredient) {
      throw new Error('Ingredient not found');
    }

    const previousStock = ingredient.currentStock;
    ingredient.currentStock += quantity;
    await InventoryRepository.saveIngredient(ingredient, { session });

    await InventoryRepository.createStockMovements(
      [
        {
          merchant: merchantId,
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
   * Feature-flag aware:
   * - If merchant has inventory module disabled: Returns empty array (no deduction)
   * - If merchant has inventory module enabled: Recipe is REQUIRED
   * 
   * @param {string} menuItemId - Menu item ID
   * @param {string} merchantId - Merchant ID
   * @returns {Promise<Array>} Array of ingredient usage objects
   */
  static async getIngredientUsageForMenuItem(menuItemId, merchantId) {
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

    return recipe.items.map(item => ({
      ingredientId: item.ingredient._id,
      quantity: item.quantity,
      unit: item.unit,
    }));
  }

  static async getLowStockAlerts(merchantId) {
    return InventoryRepository.getLowStockItems(merchantId);
  }

  static async getStockMovements(merchantId, { ingredientId, type, startDate, endDate } = {}) {
    const filter = { merchant: merchantId };

    if (ingredientId) filter.ingredient = ingredientId;
    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    return InventoryRepository.findStockMovements(filter);
  }
}

module.exports = { InventoryService };
