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
      // Get recipe with populated ingredients
      const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
        .populate('items.ingredient');

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
        const ingredient = recipeItem.ingredient;
        const available = ingredient.currentStock;

        // Skip if sufficient stock
        if (available >= required) {
          continue;
        }

        // Insufficient stock detected
        const hasValidOverride =
          branchMenuItem?.availability?.manualOverride?.enabled &&
          branchMenuItem.availability.manualOverride.expiresAt > new Date();

        // CRITICAL: Always reject, regardless of override
        if (ingredient.alertStatus === 'CRITICAL') {
          unavailableItems.push({
            menuItemId: orderItem.menuItem,
            menuItemName: orderItem.menuItemName,
            ingredientId: ingredient._id,
            ingredientName: ingredient.name,
            required,
            available,
            alertStatus: 'CRITICAL',
            reason: 'Critical stock level - no overrides allowed',
          });
          continue; // Skip to next ingredient
        }

        // LOW or insufficient: reject unless manually overridden
        if (!hasValidOverride) {
          unavailableItems.push({
            menuItemId: orderItem.menuItem,
            menuItemName: orderItem.menuItemName,
            ingredientId: ingredient._id,
            ingredientName: ingredient.name,
            required,
            available,
            alertStatus: ingredient.alertStatus || 'LOW',
            reason: 'Insufficient stock - requires manager override',
          });
        } else {
          // Override exists - allow but warn
          warnings.push({
            menuItemId: orderItem.menuItem,
            menuItemName: orderItem.menuItemName,
            ingredientId: ingredient._id,
            ingredientName: ingredient.name,
            available,
            required,
            message: `Using manual override for low stock (${available}/${required})`,
            overrideSetAt: branchMenuItem.availability.manualOverride.setAt,
            overrideExpiresAt: branchMenuItem.availability.manualOverride.expiresAt,
            overrideReason: branchMenuItem.availability.manualOverride.reason,
          });
        }
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
