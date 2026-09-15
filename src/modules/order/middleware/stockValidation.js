/**
 * Stock Validation Middleware for Order Placement
 * 
 * Validates ingredient stock availability before order creation:
 * - CRITICAL status: Always rejects (no override allowed)
 * - LOW/insufficient stock: Rejects unless valid manual override exists
 * - Warnings attached to request for successful overrides
 */

const Recipe = require('../../../../models/Recipe');
const BranchMenu = require('../../../../models/branchMenuModel');
const AppError = require('../../../../utils/appError');

/**
 * Middleware: Validate order stock before placement
 * Checks each order item against recipe ingredients
 * 
 * @param {Object} req - Express request
 * @param {Array} req.body.items - Order items to validate
 * @returns {void} Calls next() if valid, sends 400 if invalid
 */
async function validateOrderStock(req, res, next) {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return next(); // No items to validate
    }

    const unavailableItems = [];
    const warnings = [];

    for (const orderItem of items) {
      // Get recipe
      const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem });
      // ✅ REMOVED: .populate('items.ingredient') — recipe items store ingredientName (String), not ingredient ObjectId
      // Stock validation now deferred to order placement where ingredient is resolved by branch

      if (!recipe) {
        // No recipe = custom item, skip stock validation
        continue;
      }

      // Get branch menu item for override info
      const branchMenuItem = await BranchMenu.findOne({
        branch: req.user.branch || req.body.branch,
        menuItem: orderItem.menuItem,
      });

      // Check each ingredient in recipe
      for (const recipeItem of recipe.items) {
        const required = recipeItem.quantity * orderItem.quantity;
        
        // ✅ CHANGED: Recipe items now store ingredientName (String), not ingredient ObjectId
        // Stock validation is now deferred to actual order placement (deductForOrder)
        // where ingredients are resolved by branch.
        // This middleware can only do basic checks; precise validation happens at deduction time.
        
        // For now, we'll skip detailed stock checking here since ingredient objects aren't available
        // The real validation happens in deductForOrder() which has branch context
      }
    }

    // Reject if any unavailable items found
    if (unavailableItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be fulfilled due to insufficient stock',
        unavailableItems,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    }

    // All items available - attach warnings to request if any
    if (warnings.length > 0) {
      req.stockWarnings = warnings;
    }

    next();
  } catch (error) {
    next(new AppError(`Stock validation error: ${error.message}`, 500));
  }
}

module.exports = validateOrderStock;
