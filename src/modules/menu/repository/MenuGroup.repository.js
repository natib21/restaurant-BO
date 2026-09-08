/**
 * @file src/modules/menu/repository/MenuGroup.repository.js
 * @description Pure database operations for MenuGroup model
 * 
 * Responsibilities:
 * - CRUD operations
 * - Branch-based queries
 * - Visibility filtering
 * - Item management operations
 * - Soft-delete operations
 */

const MenuGroup = require('../model/MenuGroup.model');

class MenuGroupRepository {
  /**
   * Find all menu groups with filters
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Query filters
   * @param {boolean} [includeDeleted=false] - Include soft-deleted groups
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
    
    return MenuGroup.find(query).sort({ priority: -1, 'name.en': 1 });
  }

  /**
   * Find menu group by ID
   * 
   * @param {string} id - Menu group ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {boolean} [includeDeleted=false] - Include soft-deleted
   * @returns {Promise<MenuGroup>}
   */
  static async findById(id, merchantId, includeDeleted = false) {
    const query = {
      _id: id,
      merchant: merchantId
    };
    
    if (!includeDeleted) {
      query.deletedAt = null;
    }
    
    return MenuGroup.findOne(query);
  }

  /**
   * Find menu groups by branch
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} branchId - Branch ID
   * @param {Object} filters - Additional filters
   * @returns {Query}
   */
  static findByBranch(merchantId, branchId, filters = {}) {
    return MenuGroup.find({
      merchant: merchantId,
      branches: branchId,
      deletedAt: null,
      ...filters
    }).sort({ priority: -1 });
  }

  /**
   * Find active menu groups (visibility: always or scheduled)
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Additional filters
   * @returns {Query}
   */
  static findActive(merchantId, filters = {}) {
    return MenuGroup.find({
      merchant: merchantId,
      visibility: { $in: ['always', 'scheduled'] },
      deletedAt: null,
      ...filters
    }).sort({ priority: -1 });
  }

  /**
   * Create a new menu group
   * 
   * @param {Object} data - Menu group data
   * @returns {Promise<MenuGroup>}
   */
  static async create(data) {
    const menuGroup = new MenuGroup(data);
    return menuGroup.save();
  }

  /**
   * Update menu group by ID
   * 
   * @param {string} id - Menu group ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} data - Update data
   * @returns {Promise<MenuGroup>}
   */
  static async updateById(id, merchantId, data) {
    return MenuGroup.findOneAndUpdate(
      { _id: id, merchant: merchantId, deletedAt: null },
      data,
      { new: true, runValidators: true }
    );
  }

  /**
   * Add item to menu group
   * 
   * @param {string} groupId - Menu group ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} itemData - Item data { menu, sortOrder, etc. }
   * @returns {Promise<MenuGroup>}
   */
  static async addItem(groupId, merchantId, itemData) {
    return MenuGroup.findOneAndUpdate(
      { _id: groupId, merchant: merchantId, deletedAt: null },
      { $push: { items: itemData } },
      { new: true, runValidators: true }
    );
  }

  /**
   * Remove item from menu group
   * 
   * @param {string} groupId - Menu group ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {string} menuItemId - Menu item ID to remove
   * @returns {Promise<MenuGroup>}
   */
  static async removeItem(groupId, merchantId, menuItemId) {
    return MenuGroup.findOneAndUpdate(
      { _id: groupId, merchant: merchantId, deletedAt: null },
      { $pull: { items: { menu: menuItemId } } },
      { new: true }
    );
  }

  /**
   * Reorder items in menu group
   * 
   * @param {string} groupId - Menu group ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Array} itemsOrder - Array of { menuId, sortOrder }
   * @returns {Promise<MenuGroup>}
   */
  static async reorderItems(groupId, merchantId, itemsOrder) {
    const menuGroup = await this.findById(groupId, merchantId, false);
    if (!menuGroup) return null;
    
    // Update sortOrder for each item
    menuGroup.items.forEach(item => {
      const newOrder = itemsOrder.find(i => i.menuId === item.menu.toString());
      if (newOrder) {
        item.sortOrder = newOrder.sortOrder;
      }
    });
    
    return menuGroup.save();
  }

  /**
   * Soft delete menu group
   * 
   * @param {string} id - Menu group ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} deletedById - User performing deletion
   * @returns {Promise<MenuGroup>}
   */
  static async softDelete(id, merchantId, deletedById) {
    const menuGroup = await this.findById(id, merchantId, false);
    if (!menuGroup) return null;
    
    return menuGroup.softDelete(deletedById);
  }

  /**
   * Restore soft-deleted menu group
   * 
   * @param {string} id - Menu group ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<MenuGroup>}
   */
  static async restore(id, merchantId) {
    const menuGroup = await this.findById(id, merchantId, true);
    if (!menuGroup || !menuGroup.deletedAt) return null;
    
    return menuGroup.restore();
  }

  /**
   * Count menu groups
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
    
    return MenuGroup.countDocuments(query);
  }

  /**
   * Find one menu group by query
   * 
   * @param {Object} query - MongoDB query
   * @returns {Promise<MenuGroup>}
   */
  static async findOne(query) {
    return MenuGroup.findOne(query);
  }

  /**
   * Find menu groups containing specific menu item
   * 
   * @param {ObjectId} menuItemId - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Array<MenuGroup>>}
   */
  static async findGroupsContainingItem(menuItemId, merchantId) {
    return MenuGroup.find({
      merchant: merchantId,
      'items.menu': menuItemId,
      deletedAt: null
    });
  }

  /**
   * Update many menu groups
   * 
   * @param {Object} filter - MongoDB filter
   * @param {Object} update - Update operations
   * @returns {Promise<Object>} - Update result
   */
  static async updateMany(filter, update) {
    return MenuGroup.updateMany(filter, update);
  }

  /**
   * Hard delete menu group (use with caution)
   * 
   * @param {string} id - Menu group ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<MenuGroup>}
   */
  static async hardDelete(id, merchantId) {
    return MenuGroup.findOneAndDelete({ _id: id, merchant: merchantId });
  }
}

module.exports = MenuGroupRepository;
