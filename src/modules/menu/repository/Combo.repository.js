/**
 * @file src/modules/menu/repository/Combo.repository.js
 * @description Pure database operations for Combo model
 * 
 * Responsibilities:
 * - CRUD operations
 * - Branch-based queries
 * - Availability queries
 * - Soft-delete operations
 */

const Combo = require('../model/Combo.model');

class ComboRepository {
  /**
   * Find all combos with filters
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Query filters
   * @param {boolean} [includeDeleted=false] - Include soft-deleted combos
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
    
    return Combo.find(query).sort({ priority: -1, 'name.en': 1 });
  }

  /**
   * Find combo by ID
   * 
   * @param {string} id - Combo ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {boolean} [includeDeleted=false] - Include soft-deleted
   * @returns {Promise<Combo>}
   */
  static async findById(id, merchantId, includeDeleted = false) {
    const query = {
      _id: id,
      merchant: merchantId
    };
    
    if (!includeDeleted) {
      query.deletedAt = null;
    }
    
    return Combo.findOne(query);
  }

  /**
   * Find combos by branch
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} branchId - Branch ID
   * @param {Object} filters - Additional filters
   * @returns {Query}
   */
  static findByBranch(merchantId, branchId, filters = {}) {
    return Combo.find({
      merchant: merchantId,
      branches: branchId,
      deletedAt: null,
      ...filters
    }).sort({ priority: -1 });
  }

  /**
   * Find active combos only
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Additional filters
   * @returns {Query}
   */
  static findActive(merchantId, filters = {}) {
    return Combo.find({
      merchant: merchantId,
      isActive: true,
      deletedAt: null,
      ...filters
    }).sort({ priority: -1 });
  }

  /**
   * Create a new combo
   * 
   * @param {Object} data - Combo data
   * @returns {Promise<Combo>}
   */
  static async create(data) {
    const combo = new Combo(data);
    return combo.save();
  }

  /**
   * Update combo by ID
   * 
   * @param {string} id - Combo ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} data - Update data
   * @returns {Promise<Combo>}
   */
  static async updateById(id, merchantId, data) {
    return Combo.findOneAndUpdate(
      { _id: id, merchant: merchantId, deletedAt: null },
      data,
      { new: true, runValidators: true }
    );
  }

  /**
   * Toggle combo active status
   * 
   * @param {string} id - Combo ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Combo>}
   */
  static async toggleActive(id, merchantId) {
    const combo = await this.findById(id, merchantId, false);
    if (!combo) return null;
    
    combo.isActive = !combo.isActive;
    return combo.save();
  }

  /**
   * Soft delete combo
   * 
   * @param {string} id - Combo ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} deletedById - User performing deletion
   * @returns {Promise<Combo>}
   */
  static async softDelete(id, merchantId, deletedById) {
    const combo = await this.findById(id, merchantId, false);
    if (!combo) return null;
    
    return combo.softDelete(deletedById);
  }

  /**
   * Restore soft-deleted combo
   * 
   * @param {string} id - Combo ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Combo>}
   */
  static async restore(id, merchantId) {
    const combo = await this.findById(id, merchantId, true);
    if (!combo || !combo.deletedAt) return null;
    
    return combo.restore();
  }

  /**
   * Count combos
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
    
    return Combo.countDocuments(query);
  }

  /**
   * Find one combo by query
   * 
   * @param {Object} query - MongoDB query
   * @returns {Promise<Combo>}
   */
  static async findOne(query) {
    return Combo.findOne(query);
  }

  /**
   * Find combos containing specific menu item
   * 
   * @param {ObjectId} menuItemId - Menu item ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Array<Combo>>}
   */
  static async findCombosContainingItem(menuItemId, merchantId) {
    return Combo.find({
      merchant: merchantId,
      'items.menuItem': menuItemId,
      deletedAt: null
    });
  }

  /**
   * Find combos by IDs
   * 
   * @param {Array<string>} ids - Array of combo IDs
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Array<Combo>>}
   */
  static async findByIds(ids, merchantId) {
    return Combo.find({
      _id: { $in: ids },
      merchant: merchantId,
      deletedAt: null
    });
  }

  /**
   * Update many combos
   * 
   * @param {Object} filter - MongoDB filter
   * @param {Object} update - Update operations
   * @returns {Promise<Object>} - Update result
   */
  static async updateMany(filter, update) {
    return Combo.updateMany(filter, update);
  }

  /**
   * Hard delete combo (use with caution)
   * 
   * @param {string} id - Combo ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Combo>}
   */
  static async hardDelete(id, merchantId) {
    return Combo.findOneAndDelete({ _id: id, merchant: merchantId });
  }
}

module.exports = ComboRepository;
