const Ingredient = require('../../../../models/Ingredient');
const StockMovement = require('../../../../models/StockMovement');
const Recipe = require('../../../../models/Recipe');

/**
 * MongoDB access for inventory domain — thin wrappers only (no business rules).
 */
class InventoryRepository {
  static findActiveIngredientsByMerchant(merchantId) {
    return Ingredient.find({ merchant: merchantId, isActive: true });
  }

  static startIngredientSession() {
    return Ingredient.startSession();
  }

  static startRecipeSession() {
    return Recipe.startSession();
  }

  static updateIngredient(filter, update, options) {
    return Ingredient.updateOne(filter, update, options);
  }

  static findIngredientOne(filter, { session } = {}) {
    const query = Ingredient.findOne(filter);
    if (session) return query.session(session);
    return query;
  }

  static saveIngredient(ingredient, { session } = {}) {
    if (session) return ingredient.save({ session });
    return ingredient.save();
  }

  static createStockMovements(docs, { session } = {}) {
    if (session) return StockMovement.create(docs, { session });
    return StockMovement.create(docs);
  }

  static findActiveRecipeForMenuItem(menuItemId, merchantId) {
    return Recipe.findOne({
      menuItem: menuItemId,
      merchant: merchantId,
      isActive: true,
    }).populate('items.ingredient');
  }

  static getLowStockItems(merchantId) {
    return Ingredient.getLowStockItems(merchantId);
  }

  static findStockMovements(filter) {
    return StockMovement.find(filter)
      .populate('ingredient', 'name unit')
      .populate('performedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(100);
  }
}

module.exports = { InventoryRepository };
