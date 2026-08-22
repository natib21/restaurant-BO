/**
 * @file src/modules/menu/service/MenuItem.service.js
 * @description Business logic for menu item management
 * 
 * Responsibilities:
 * - CRUD operations with business validation
 * - Category validation
 * - Variant management
 * - Pricing validation
 * - Image management
 * - Multi-tenant scoping enforcement
 */

const MenuItemRepository = require('../repository/MenuItem.repository');
const CategoryRepository = require('../repository/Category.repository');
const AppError = require('../../../../utils/appError');
const ApiFeatures = require('../../../../utils/apiFeatures');
const { normalizeName, normalizeDescription } = require('../../../../utils/localization-helper');

class MenuItemService {
  /**
   * Get all menu items with query features
   * 
   * @param {Object} req - Express request object
   * @returns {Promise<Array<MenuItem>>}
   */
  static async getAll(req) {
    const merchantId = req.user?.merchant?._id || req.user?.merchant;

    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Base query from repository
    const baseQuery = MenuItemRepository.findAll(merchantId, {}, false);

    // Apply ApiFeatures
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name.en', 'name.am', 'description.en', 'description.am'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const menuItems = await features.query;

    return menuItems || [];
  }

  /**
   * Get single menu item by ID
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<MenuItem>}
   */
  static async getById(id, merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const menuItem = await MenuItemRepository.findById(id, merchantId, false);

    if (!menuItem) {
      throw new AppError('Menu item not found', 404);
    }

    return menuItem;
  }

  /**
   * Get menu items by category
   * 
   * @param {string} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array<MenuItem>>}
   */
  static async getByCategory(categoryId, merchantId, filters = {}) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Verify category exists
    const category = await CategoryRepository.findById(categoryId, merchantId, false);
    if (!category) {
      throw new AppError('Category not found', 404);
    }

    return MenuItemRepository.findByCategory(categoryId, merchantId, filters);
  }

  /**
   * Create a new menu item
   * 
   * @param {Object} data - Menu item data
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} userId - User ID
   * @returns {Promise<MenuItem>}
   */
  static async create(data, merchantId, userId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Normalize localized fields
    try {
      data.name = normalizeName(data.name);
      if (data.description) {
        data.description = normalizeDescription(data.description);
      }
    } catch (error) {
      // Convert generic errors to AppError with 400 status
      throw new AppError(error.message, 400);
    }

    // Validate category exists
    if (data.categoryId) {
      const category = await CategoryRepository.findById(data.categoryId, merchantId, false);
      if (!category) {
        throw new AppError('Category not found', 404);
      }
    } else {
      throw new AppError('categoryId is required', 400);
    }

    // Validate price if provided
    if (data.price !== undefined && data.price < 0) {
      throw new AppError('Price cannot be negative', 400);
    }

    // Validate variants
    if (data.variants && data.variants.length > 0) {
      this.validateVariants(data.variants);
      
      // Ensure at least one default variant
      const hasDefault = data.variants.some(v => v.isDefault);
      if (!hasDefault) {
        data.variants[0].isDefault = true;
      }
    } else if (data.price) {
      // Create default variant if no variants provided but price exists
      data.variants = [{
        name: 'Regular',
        price: Number(data.price),
        isDefault: true,
        available: true
      }];
    }

    // Create menu item
    const menuItem = await MenuItemRepository.create({
      ...data,
      merchant: merchantId,
      createdBy: userId,
      updatedBy: userId
    });

    // ✅ Auto-add to default menu group (system behavior)
    try {
      const MenuGroup = require('../model/MenuGroup.model');
      
      const updateResult = await MenuGroup.findOneAndUpdate(
        { 
          merchant: merchantId, 
          isSystemDefault: true 
        },
        {
          $push: {
            items: {
              menu: menuItem._id,
              sortOrder: Date.now(),
            },
          },
        },
        { new: true }
      );

      // Log warning if default group not found (shouldn't happen in normal flow)
      if (!updateResult) {
        const logger = require('../../../../utils/logger');
        logger.warn('menu_item.create.no_default_group', {
          menuItemId: String(menuItem._id),
          merchantId: String(merchantId),
          message: 'Default menu group not found - item created but not added to any group',
        });
      }
    } catch (error) {
      // Log error but don't fail the request - menu item already created
      const logger = require('../../../../utils/logger');
      logger.error('menu_item.create.default_group_add_failed', {
        menuItemId: String(menuItem._id),
        merchantId: String(merchantId),
        error: error.message,
      });
    }

    return menuItem;
  }

  /**
   * Update a menu item
   * 
   * @param {string} id - Menu item ID
   * @param {Object} data - Update data
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} userId - User ID
   * @returns {Promise<MenuItem>}
   */
  static async update(id, data, merchantId, userId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Check if menu item exists
    const menuItem = await MenuItemRepository.findById(id, merchantId, false);
    if (!menuItem) {
      throw new AppError('Menu item not found', 404);
    }

    // Normalize localized fields if provided
    if (data.name) {
      try {
        data.name = normalizeName(data.name);
      } catch (error) {
        throw new AppError(error.message, 400);
      }
    }

    if (data.description !== undefined) {
      try {
        data.description = normalizeDescription(data.description);
      } catch (error) {
        throw new AppError(error.message, 400);
      }
    }

    // Validate category if being changed
    if (data.categoryId) {
      const category = await CategoryRepository.findById(data.categoryId, merchantId, false);
      if (!category) {
        throw new AppError('Category not found', 404);
      }
    }

    // Validate variants if provided
    if (data.variants) {
      this.validateVariants(data.variants);
    }

    // Set updatedBy
    data.updatedBy = userId;

    // Update menu item
    const updatedMenuItem = await MenuItemRepository.updateById(id, merchantId, data);

    return updatedMenuItem;
  }

  /**
   * Toggle menu item availability
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<MenuItem>}
   */
  static async toggleAvailability(id, merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const menuItem = await MenuItemRepository.findById(id, merchantId, false);
    if (!menuItem) {
      throw new AppError('Menu item not found', 404);
    }

    return MenuItemRepository.toggleAvailability(id, merchantId);
  }

  /**
   * Soft delete a menu item
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} userId - User ID
   * @returns {Promise<MenuItem>}
   */
  static async softDelete(id, merchantId, userId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const menuItem = await MenuItemRepository.findById(id, merchantId, false);
    if (!menuItem) {
      throw new AppError('Menu item not found', 404);
    }

    // Check if item is used in menu groups or combos
    const MenuGroupRepository = require('../repository/MenuGroup.repository');
    const ComboRepository = require('../repository/Combo.repository');

    const groupsCount = await MenuGroupRepository.findGroupsContainingItem(id, merchantId);
    const combosCount = await ComboRepository.findCombosContainingItem(id, merchantId);

    if (groupsCount.length > 0 || combosCount.length > 0) {
      throw new AppError(
        `Cannot delete menu item. It is used in ${groupsCount.length} menu group(s) and ${combosCount.length} combo(s). Please remove it from those first.`,
        409
      );
    }

    return MenuItemRepository.softDelete(id, merchantId, userId);
  }

  /**
   * Restore a soft-deleted menu item
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<MenuItem>}
   */
  static async restore(id, merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const menuItem = await MenuItemRepository.findById(id, merchantId, true);
    if (!menuItem) {
      throw new AppError('Menu item not found', 404);
    }

    if (!menuItem.deletedAt) {
      throw new AppError('Menu item is not deleted', 400);
    }

    return MenuItemRepository.restore(id, merchantId);
  }

  /**
   * Get available menu items only
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array<MenuItem>>}
   */
  static async getAvailable(merchantId, filters = {}) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    return MenuItemRepository.findAvailable(merchantId, filters);
  }

  /**
   * Validate variants array
   * 
   * @param {Array} variants - Variants array
   * @throws {AppError} - If validation fails
   */
  static validateVariants(variants) {
    if (!Array.isArray(variants)) {
      throw new AppError('Variants must be an array', 400);
    }

    variants.forEach((variant, index) => {
      if (!variant.price || variant.price < 0) {
        throw new AppError(`Variant ${index + 1} must have a valid price`, 400);
      }

      if (variant.name && variant.name.length > 60) {
        throw new AppError(`Variant ${index + 1} name is too long (max 60 characters)`, 400);
      }
    });

    return true;
  }
}

module.exports = MenuItemService;
