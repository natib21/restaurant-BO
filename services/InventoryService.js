// services/InventoryService.js
const Ingredient = require('../models/Ingredient');
const StockMovement = require('../models/StockMovement');
const Recipe = require('../models/Recipe');
const { NotificationService } = require('../src/modules/notifications/notification.service');

class InventoryService {
  // Get inventory valuation
  static async getInventoryValuation(merchantId) {
    const ingredients = await Ingredient.find({ merchant: merchantId, isActive: true });
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

  // Adjust stock with ATOMIC operations (prevents negative stock and race conditions)
  static async adjustStock(merchantId, ingredientId, quantity, type, reason, reference, performedBy, cost = 0) {
    const session = await Ingredient.startSession();
    session.startTransaction();

    try {
      // For 'out' operations, use atomic $inc with condition to prevent negative stock
      if (type === 'out' || type === 'waste' || type === 'adjustment') {
        const result = await Ingredient.updateOne(
          {
            _id: ingredientId,
            merchant: merchantId,
            currentStock: { $gte: quantity } // Ensure sufficient stock atomically
          },
          {
            $inc: { currentStock: -quantity },
            $set: { lastRestocked: type === 'in' ? new Date() : undefined }
          },
          { session }
        );

        if (result.modifiedCount === 0) {
          throw new Error('Insufficient stock or ingredient not found');
        }

        // Get updated ingredient for movement tracking
        const ingredient = await Ingredient.findOne({
          _id: ingredientId,
          merchant: merchantId,
        }).session(session);

        // Create stock movement record
        await StockMovement.create([{
          merchant: merchantId,
          ingredient: ingredientId,
          type,
          quantity,
          previousStock: ingredient.currentStock + quantity, // Calculate previous
          newStock: ingredient.currentStock,
          reason,
          reference,
          cost,
          performedBy,
        }], { session });

        await session.commitTransaction();

        await this.scheduleInventoryRealtimeEvents(merchantId, ingredient);

        return ingredient;

      } else {
        // For 'in' and 'return' operations, use regular update
        const ingredient = await Ingredient.findOne({
          _id: ingredientId,
          merchant: merchantId,
        }).session(session);

        if (!ingredient) {
          throw new Error('Ingredient not found');
        }

        const previousStock = ingredient.currentStock;
        ingredient.currentStock += quantity;
        if (type === 'in') {
          ingredient.lastRestocked = new Date();
        }

        await ingredient.save({ session });

        // Create stock movement record
        await StockMovement.create([{
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
        }], { session });

        await session.commitTransaction();

        await this.scheduleInventoryRealtimeEvents(merchantId, ingredient);

        return ingredient;
      }
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /** Queue inventory socket events via transactional outbox (standalone adjustStock path). */
  static async scheduleInventoryRealtimeEvents(merchantId, ingredient) {
    await NotificationService.notifyInventoryStockUpdated(merchantId, ingredient);
    if (typeof ingredient.isLowStock === 'function' && ingredient.isLowStock()) {
      await NotificationService.notifyLowStock(merchantId, ingredient);
    }
  }

  /**
   * Phase 0: resolve recipes and aggregate ingredient quantities per order (no writes).
   * @returns {Promise<Array<{ ingredientId: import('mongoose').Types.ObjectId, totalQuantity: number }>>}
   */
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

  /**
   * Deduct stock within an existing transaction. Does NOT start/commit its own session.
   */
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

  /**
   * Standalone order stock deduction (owns its own transaction). Prefer OrderTransactionService for place order.
   */
  static async deductStockFromOrder(merchantId, orderItems, performedBy) {
    const plan = await this.resolveDeductionPlan(orderItems, merchantId);
    const session = await Recipe.startSession();

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
      await session.endSession();
    }
  }

  // Atomic stock adjustment within a session (for batched operations)
  static async adjustStockAtomic(merchantId, ingredientId, quantity, type, reason, reference, performedBy, session, cost = 0) {
    // For 'out' operations, use atomic $inc with condition
    if (type === 'out' || type === 'waste' || type === 'adjustment') {
      const result = await Ingredient.updateOne(
        {
          _id: ingredientId,
          merchant: merchantId,
          currentStock: { $gte: quantity } // Ensure sufficient stock atomically
        },
        {
          $inc: { currentStock: -quantity }
        },
        { session }
      );

      if (result.modifiedCount === 0) {
        throw new Error('Insufficient stock or ingredient not found');
      }

      // Get updated ingredient for movement tracking
      const ingredient = await Ingredient.findOne({
        _id: ingredientId,
        merchant: merchantId,
      }).session(session);

      // Create stock movement record
      await StockMovement.create([{
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
      }], { session });

      return ingredient;

    } else {
      // For 'in' operations
      const ingredient = await Ingredient.findOne({
        _id: ingredientId,
        merchant: merchantId,
      }).session(session);

      if (!ingredient) {
        throw new Error('Ingredient not found');
      }

      const previousStock = ingredient.currentStock;
      ingredient.currentStock += quantity;
      await ingredient.save({ session });

      await StockMovement.create([{
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
      }], { session });

      return ingredient;
    }
  }

  // Get ingredient usage for menu item (STRICT: requires recipe)
  static async getIngredientUsageForMenuItem(menuItemId, merchantId) {
    const recipe = await Recipe.findOne({
      menuItem: menuItemId,
      merchant: merchantId,
      isActive: true,
    }).populate('items.ingredient');

    if (!recipe || !recipe.items || recipe.items.length === 0) {
      throw new Error(`No active recipe found for menu item ${menuItemId}. Cannot place order without recipe.`);
    }

    return recipe.items.map(item => ({
      ingredientId: item.ingredient._id,
      quantity: item.quantity,
      unit: item.unit,
    }));
  }

  // Get low stock alerts
  static async getLowStockAlerts(merchantId) {
    return Ingredient.getLowStockItems(merchantId);
  }

}

module.exports = InventoryService;