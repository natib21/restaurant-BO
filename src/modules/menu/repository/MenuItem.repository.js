/**
 * @file src/modules/menu/repository/MenuItem.repository.js
 * @description Pure database operations for MenuItem model
 * 
 * Responsibilities:
 * - CRUD operations
 * - Query building with filters
 * - Category-based queries
 * - Availability queries
 * - Soft-delete operations
 */

const MenuItem = require('../model/MenuItem.model');

class MenuItemRepository {
  /**
   * Find all menu items with filters
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Query filters
   * @param {boolean} [includeDeleted=false] - Include soft-deleted items
   * @returns {Query}
   */
  static findAll(merchantId, filters = {}, includeDeleted = false) {
    const query = {
      merchant: merchantId,
      ...filters
    };
    
    if (!includeDeleted) {
      query.deletedAt = null;
    }
    
    return MenuItem.find(query).sort({ createdAt: -1 });
  }

  /**
   * Find menu item by ID
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {boolean} [includeDeleted=false] - Include soft-deleted
   * @returns {Promise<MenuItem>}
   */
  static async findById(id, merchantId, includeDeleted = false) {
    const query = {
      _id: id,
      merchant: merchantId
    };
    
    if (!includeDeleted) {
      query.deletedAt = null;
    }
    
    return MenuItem.findOne(query);
  }

  /**
   * Find menu items by category
   * 
   * @param {ObjectId} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Additional filters
   * @returns {Query}
   */
  static findByCategory(categoryId, merchantId, filters = {}) {
    return MenuItem.find({
      merchant: merchantId,
      categoryId,
      deletedAt: null,
      ...filters
    }).sort({ 'name.en': 1 });
  }

  /**
   * Find menu items by publish status
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {string} status - Publish status (draft, published, archived)
   * @returns {Query}
   */
  static findByPublishStatus(merchantId, status) {
    return MenuItem.find({
      merchant: merchantId,
      publishStatus: status,
      deletedAt: null
    });
  }

  /**
   * Find available menu items only
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Additional filters
   * @returns {Query}
   */
  static findAvailable(merchantId, filters = {}) {
    return MenuItem.find({
      merchant: merchantId,
      available: true,
      inStock: true,
      deletedAt: null,
      ...filters
    });
  }

  /**
   * Create a new menu item
   * 
   * @param {Object} data - Menu item data
   * @returns {Promise<MenuItem>}
   */
  static async create(data) {
    const menuItem = new MenuItem(data);
    return menuItem.save();
  }

  /**
   * Update menu item by ID
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} data - Update data
   * @returns {Promise<MenuItem>}
   */
  static async updateById(id, merchantId, data) {
    return MenuItem.findOneAndUpdate(
      { _id: id, merchant: merchantId, deletedAt: null },
      data,
      { new: true, runValidators: true }
    );
  }

  /**
   * Toggle menu item availability
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<MenuItem>}
   */
  static async toggleAvailability(id, merchantId) {
    const menuItem = await this.findById(id, merchantId, false);
    if (!menuItem) return null;
    
    menuItem.available = !menuItem.available;
    // Also toggle all variants
    if (menuItem.variants && menuItem.variants.length > 0) {
      menuItem.variants.forEach(variant => {
        variant.available = menuItem.available;
      });
    }
    
    return menuItem.save();
  }

  /**
   * Soft delete menu item
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} deletedById - User performing deletion
   * @returns {Promise<MenuItem>}
   */
  static async softDelete(id, merchantId, deletedById) {
    const menuItem = await this.findById(id, merchantId, false);
    if (!menuItem) return null;
    
    return menuItem.softDelete(deletedById);
  }

  /**
   * Restore soft-deleted menu item
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<MenuItem>}
   */
  static async restore(id, merchantId) {
    const menuItem = await this.findById(id, merchantId, true);
    if (!menuItem || !menuItem.deletedAt) return null;
    
    return menuItem.restore();
  }

  /**
   * Count menu items
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Query filters
   * @param {boolean} [includeDeleted=false] - Include soft-deleted
   * @returns {Promise<number>}
   */
  static async count(merchantId, filters = {}, includeDeleted = false) {
    const query = {
      merchant: merchantId,
      ...filters
    };
    
    if (!includeDeleted) {
      query.deletedAt = null;
    }
    
    return MenuItem.countDocuments(query);
  }

  /**
   * Count menu items by category
   * 
   * @param {ObjectId} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<number>}
   */
  static async countByCategory(categoryId, merchantId) {
    return MenuItem.countDocuments({
      merchant: merchantId,
      categoryId,
      deletedAt: null
    });
  }

  /**
   * Find one menu item by query
   * 
   * @param {Object} query - MongoDB query
   * @returns {Promise<MenuItem>}
   */
  static async findOne(query) {
    return MenuItem.findOne(query);
  }

  /**
   * Find menu items by IDs
   * 
   * @param {Array<string>} ids - Array of menu item IDs
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Array<MenuItem>>}
   */
  static async findByIds(ids, merchantId) {
    return MenuItem.find({
      _id: { $in: ids },
      merchant: merchantId,
      deletedAt: null
    });
  }

  /**
   * Update many menu items
   * 
   * @param {Object} filter - MongoDB filter
   * @param {Object} update - Update operations
   * @returns {Promise<Object>} - Update result
   */
  static async updateMany(filter, update) {
    return MenuItem.updateMany(filter, update);
  }

  /**
   * Hard delete menu item (use with caution)
   * 
   * @param {string} id - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<MenuItem>}
   */
  static async hardDelete(id, merchantId) {
    return MenuItem.findOneAndDelete({ _id: id, merchant: merchantId });
  }
}

module.exports = MenuItemRepository;
