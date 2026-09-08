/**
 * Inventory Repository
 *
 * Pure MongoDB data access layer.
 * No business logic, no service calls, no Express dependencies.
 * All methods accept optional `session` for transaction support.
 */

const Ingredient = require('../../../../models/Ingredient');
const StockMovement = require('../../../../models/StockMovement');
const Recipe = require('../../../../models/Recipe');

class InventoryRepository {
  /**
   * Session management
   */
  static startSession() {
    return Ingredient.startSession();
  }

  /**
   * Find single ingredient with optional session
   */
  static findIngredient(filter, options = {}) {
    const { session } = options;
    let query = Ingredient.findOne(filter);
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Find multiple ingredients with optional session
   */
  static findIngredients(filter, options = {}) {
    const { session } = options;
    let query = Ingredient.find(filter);
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Find all active ingredients for merchant
   */
  static findActiveIngredientsByMerchant(merchantId, options = {}) {
    return this.findIngredients({ merchant: merchantId, isActive: true }, options);
  }

  /**
   * Update ingredient stock (for stock adjustments)
   *
   * @param {Object} filter - MongoDB query filter
   * @param {Object} update - MongoDB update operators
   * @param {Object} options - { session }
   * @returns {Object} UpdateResult with modifiedCount
   */
  static async updateIngredient(filter, update, options = {}) {
    const { session } = options;
    let query = Ingredient.updateOne(filter, update);
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Update multiple ingredients (batch)
   */
  static async updateIngredients(updates, options = {}) {
    const { session } = options;
    const session_ = session;
    const results = [];

    for (const { filter, update } of updates) {
      const result = await this.updateIngredient(filter, update, { session: session_ });
      results.push(result);
    }

    return results;
  }

  /**
   * Save ingredient document (for instance methods)
   */
  static saveIngredient(ingredient, options = {}) {
    const { session } = options;
    if (session) {
      return ingredient.save({ session });
    }
    return ingredient.save();
  }

  /**
   * Create stock movement records
   *
   * Critical: Accepts session for ACID transactions
   */
  static createStockMovements(docs, options = {}) {
    const { session } = options;
    if (session) {
      return StockMovement.create(docs, { session, ordered: true });
    }
    return StockMovement.create(docs);
  }

  /**
   * Find stock movement history
   */
  static findStockMovements(filter, options = {}) {
    const { limit = 100, offset = 0 } = options;
    return StockMovement.find(filter)
      .populate('ingredient', 'name unit currentStock')
      .populate('performedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .exec();
  }

  /**
   * Get low stock items for merchant
   */
  static getLowStockItems(merchantId, options = {}) {
    // Assuming Ingredient model has this static method or we query directly
    return this.findIngredients(
      {
        merchant: merchantId,
        isActive: true,
        $expr: { $lte: ['$currentStock', '$minStock'] },
      },
      options
    );
  }

  /**
   * Find active recipe for menu item
   */
  static findActiveRecipeForMenuItem(menuItemId, merchantId, options = {}) {
    const { session } = options;
    let query = Recipe.findOne({
      menuItem: menuItemId,
      merchant: merchantId,
      isActive: true,
    }).populate('items.ingredient');

    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Atomically update ingredient stock
   * Used by deductStockItems for order processing
   *
   * @param {string} ingredientId
   * @param {number} quantity - Amount to deduct (positive number)
   * @param {Object} options - { session }
   * @returns {Object} Updated ingredient document
   */
  static async deductStock(ingredientId, quantity, options = {}) {
    const { session } = options;

    let query = Ingredient.findByIdAndUpdate(
      ingredientId,
      { $inc: { currentStock: -quantity } },
      { new: true, session }
    );

    return query.exec();
  }

  /**
   * Validate stock availability (before deduction)
   * Used to check if order can be fulfilled
   *
   * @param {string} ingredientId
   * @param {number} requiredQuantity
   * @param {Object} options - { session }
   * @returns {boolean} true if stock available
   */
  static async hasEnoughStock(ingredientId, requiredQuantity, options = {}) {
    const ingredient = await this.findIngredient({ _id: ingredientId }, options);

    if (!ingredient) return false;
    return ingredient.currentStock >= requiredQuantity;
  }

  /**
   * Bulk check stock availability
   * Used for order validation before placement
   *
   * @param {Array} items - [{ ingredientId, quantity }, ...]
   * @param {Object} options - { session }
   * @returns {Object} { available: bool, shortages: [{ ingredientId, required, available }] }
   */
  static async validateStockAvailability(items, options = {}) {
    const shortages = [];

    for (const item of items) {
      const hasStock = await this.hasEnoughStock(item.ingredientId, item.quantity, options);

      if (!hasStock) {
        const ingredient = await this.findIngredient({ _id: item.ingredientId }, options);
        shortages.push({
          ingredientId: item.ingredientId,
          required: item.quantity,
          available: ingredient?.currentStock || 0,
        });
      }
    }

    return {
      available: shortages.length === 0,
      shortages,
    };
  }

  /**
   * Get inventory valuation snapshot
   */
  static async getInventoryValuation(merchantId, options = {}) {
    const ingredients = await this.findActiveIngredientsByMerchant(merchantId, options);

    let totalValue = 0;
    let itemCount = 0;
    let lowStockCount = 0;

    ingredients.forEach(ing => {
      const value = ing.currentStock * (ing.costPerUnit || 0);
      totalValue += value;
      itemCount++;
      if (ing.currentStock <= ing.minStock) {
        lowStockCount++;
      }
    });

    return {
      totalValue,
      itemCount,
      lowStockCount,
      ingredients,
    };
  }

  /**
   * Create audit log for inventory operations
   */
  static async createAuditLog(data, options = {}) {
    const { session } = options;
    // Assuming you have an AuditLog model
    const AuditLog = require('../../../../models/auditLogModel');

    if (session) {
      return AuditLog.create([data], { session, ordered: true });
    }
    return AuditLog.create(data);
  }
}

module.exports = { InventoryRepository };
