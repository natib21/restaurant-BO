/**
 * Inventory Service
 *
 * Pure business logic layer — NO Express dependencies (req, res).
 * Safe to import by OrderService for transactional operations.
 * All methods accept optional `session` parameter for MongoDB ACID transactions.
 */

const { InventoryRepository } = require('../repository/inventory.repository');

class InventoryService {
  /**
   * Get inventory valuation for merchant
   *
   * Total value of all active inventory, low stock count, etc.
   */
  static async getInventoryValuation(merchantId, options = {}) {
    const valuation = await InventoryRepository.getInventoryValuation(merchantId, options);
    return valuation;
  }

  /**
   * Adjust stock for single ingredient
   *
   * @param {string} merchantId - Merchant ID (tenant context)
   * @param {string} ingredientId - Ingredient to adjust
   * @param {number} quantity - Quantity to adjust (+ or -)
   * @param {string} type - 'in', 'out', 'waste', 'adjustment'
   * @param {string} reason - Why is stock being adjusted
   * @param {string} reference - PO number, invoice, etc.
   * @param {string} performedBy - User ID who performed the adjustment
   * @param {number} cost - Cost per unit
   * @param {Object} options - { session } for transactions
   */
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
  ) {
    const { session } = options;

    // Validate ingredient exists and belongs to merchant
    const ingredient = await InventoryRepository.findIngredient(
      { _id: ingredientId, merchant: merchantId },
      { session }
    );

    if (!ingredient) {
      throw new Error(`Ingredient not found: ${ingredientId}`);
    }

    // Determine stock change direction
    let quantityChange = quantity;
    if (type === 'out' || type === 'waste') {
      quantityChange = -quantity;

      // Validate sufficient stock
      if (ingredient.currentStock < quantity) {
        throw new Error(
          `Insufficient stock. Required: ${quantity}, Available: ${ingredient.currentStock}`
        );
      }
    }

    // Update ingredient stock
    const updated = await InventoryRepository.updateIngredient(
      { _id: ingredientId, merchant: merchantId },
      {
        $inc: { currentStock: quantityChange },
        ...(type === 'in' && { $set: { lastRestocked: new Date() } }),
      },
      { session }
    );

    if (updated.modifiedCount === 0) {
      throw new Error('Failed to update ingredient stock');
    }

    // Get updated ingredient for response
    const updatedIngredient = await InventoryRepository.findIngredient(
      { _id: ingredientId },
      { session }
    );

    // Create stock movement audit record
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

    return updatedIngredient;
  }

  /**
   * Deduct stock items for order placement
   *
   * CRITICAL: This is the method called from OrderService during order creation.
   * Accepts session for ACID transaction guarantees.
   *
   * @param {string} merchantId - Merchant context
   * @param {Array} items - [{ ingredientId, quantity }, ...]
   * @param {string} orderId - Reference to order being placed
   * @param {string} performedBy - User ID
   * @param {Object} options - { session } for transaction
   * @returns {Object} { success, deducted: [...], shortages: [...] }
   */
  static async deductStockItems(merchantId, items, orderId, performedBy, options = {}) {
    const { session } = options;

    if (!items || items.length === 0) {
      return { success: true, deducted: [], shortages: [] };
    }

    // 1. Validate stock availability BEFORE any deductions
    const validation = await InventoryRepository.validateStockAvailability(items, { session });

    if (!validation.available) {
      return {
        success: false,
        deducted: [],
        shortages: validation.shortages,
        error: 'Insufficient stock for order items',
      };
    }

    // 2. Deduct stock for each item (atomically within transaction)
    const deducted = [];

    for (const item of items) {
      const updatedIngredient = await InventoryRepository.deductStock(
        item.ingredientId,
        item.quantity,
        { session }
      );

      // Create movement record
      await InventoryRepository.createStockMovements(
        [
          {
            merchant: merchantId,
            ingredient: item.ingredientId,
            type: 'out',
            quantity: item.quantity,
            previousStock: updatedIngredient.currentStock + item.quantity,
            newStock: updatedIngredient.currentStock,
            reason: `Order fulfillment`,
            reference: orderId,
            performedBy,
          },
        ],
        { session }
      );

      deducted.push({
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        newStock: updatedIngredient.currentStock,
      });
    }

    return {
      success: true,
      deducted,
      shortages: [],
    };
  }

  /**
   * Check stock availability before order processing
   *
   * @param {Array} items - [{ ingredientId, quantity }, ...]
   * @param {Object} options - { session }
   * @returns {Object} { available, shortages }
   */
  static async validateStockAvailability(items, options = {}) {
    return InventoryRepository.validateStockAvailability(items, options);
  }

  /**
   * Get stock movement history
   *
   * @param {string} merchantId
   * @param {Object} filters - { ingredientId?, type?, startDate?, endDate? }
   * @param {Object} pagination - { limit, offset }
   */
  static async getStockMovements(merchantId, filters = {}, pagination = {}) {
    const { ingredientId, type, startDate, endDate } = filters;
    const { limit = 20, offset = 0 } = pagination;

    const query = { merchant: merchantId };

    if (ingredientId) query.ingredient = ingredientId;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    return InventoryRepository.findStockMovements(query, { limit, offset });
  }

  /**
   * Set stock thresholds (min/max)
   *
   * @param {string} merchantId
   * @param {string} ingredientId
   * @param {number} minStock
   * @param {number} maxStock
   */
  static async setStockThresholds(merchantId, ingredientId, minStock, maxStock) {
    if (maxStock < minStock) {
      throw new Error('maxStock must be >= minStock');
    }

    const updated = await InventoryRepository.updateIngredient(
      { _id: ingredientId, merchant: merchantId },
      { $set: { minStock, maxStock } }
    );

    if (updated.modifiedCount === 0) {
      throw new Error('Ingredient not found or update failed');
    }

    return InventoryRepository.findIngredient({ _id: ingredientId });
  }

  /**
   * Get low stock items
   *
   * Items where currentStock <= minStock
   */
  static async getLowStockItems(merchantId) {
    return InventoryRepository.getLowStockItems(merchantId);
  }

  /**
   * Batch adjust stock (multiple items in one call)
   *
   * Useful for receipt of goods, waste reporting, etc.
   */
  static async batchAdjustStock(merchantId, adjustments, performedBy, options = {}) {
    const { session } = options;
    const results = [];

    for (const adj of adjustments) {
      try {
        const result = await this.adjustStock(
          merchantId,
          adj.ingredientId,
          adj.quantity,
          adj.type,
          adj.reason,
          adj.reference,
          performedBy,
          adj.cost,
          { session }
        );
        results.push({ success: true, ingredient: result });
      } catch (error) {
        results.push({
          success: false,
          ingredientId: adj.ingredientId,
          error: error.message,
        });
      }
    }

    return results;
  }
}

module.exports = { InventoryService };
