/**
 * @file src/modules/menu/repository/Category.repository.js
 * @description Pure database operations for Category model
 * 
 * Responsibilities:
 * - CRUD operations
 * - Query building
 * - Soft-delete operations
 * - NO business logic
 * - NO validation
 */

const Category = require('../model/Category.model');

class CategoryRepository {
  /**
   * Find all categories for a merchant with filters
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Query filters
   * @param {boolean} [includeDeleted=false] - Include soft-deleted categories
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
    
    return Category.find(query).sort({ displayOrder: 1, 'name.en': 1 });
  }

  /**
   * Find category by ID
   * 
   * @param {string} id - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {boolean} [includeDeleted=false] - Include soft-deleted
   * @returns {Promise<Category>}
   */
  static async findById(id, merchantId, includeDeleted = false) {
    const query = {
      _id: id,
      merchant: merchantId
    };
    
    if (!includeDeleted) {
      query.deletedAt = null;
    }
    
    return Category.findOne(query);
  }

  /**
   * Find active categories only
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Array<Category>>}
   */
  static async findActive(merchantId) {
    return Category.findActiveByMerchant(merchantId);
  }

  /**
   * Create a new category
   * 
   * @param {Object} data - Category data
   * @returns {Promise<Category>}
   */
  static async create(data) {
    const category = new Category(data);
    return category.save();
  }

  /**
   * Update category by ID
   * 
   * @param {string} id - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} data - Update data
   * @returns {Promise<Category>}
   */
  static async updateById(id, merchantId, data) {
    return Category.findOneAndUpdate(
      { _id: id, merchant: merchantId, deletedAt: null },
      data,
      { new: true, runValidators: true }
    );
  }

  /**
   * Soft delete category
   * 
   * @param {string} id - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} deletedById - User performing deletion
   * @returns {Promise<Category>}
   */
  static async softDelete(id, merchantId, deletedById) {
    const category = await this.findById(id, merchantId, false);
    if (!category) return null;
    
    return category.softDelete(deletedById);
  }

  /**
   * Restore soft-deleted category
   * 
   * @param {string} id - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Category>}
   */
  static async restore(id, merchantId) {
    const category = await this.findById(id, merchantId, true);
    if (!category || !category.deletedAt) return null;
    
    return category.restore();
  }

  /**
   * Count categories
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
    
    return Category.countDocuments(query);
  }

  /**
   * Check if category name exists
   * 
   * @param {string} nameEn - English name
   * @param {ObjectId} merchantId - Merchant ID
   * @param {string} [excludeId] - Exclude this ID from check
   * @returns {Promise<boolean>}
   */
  static async nameExists(nameEn, merchantId, excludeId = null) {
    return Category.nameExistsForMerchant(nameEn, merchantId, excludeId);
  }

  /**
   * Hard delete category (use with caution)
   * 
   * @param {string} id - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Category>}
   */
  static async hardDelete(id, merchantId) {
    return Category.findOneAndDelete({ _id: id, merchant: merchantId });
  }

  /**
   * Find one category by query
   * 
   * @param {Object} query - MongoDB query
   * @returns {Promise<Category>}
   */
  static async findOne(query) {
    return Category.findOne(query);
  }

  /**
   * Bulk update categories
   * 
   * @param {Object} filter - MongoDB filter
   * @param {Object} update - Update operations
   * @returns {Promise<Object>} - Update result
   */
  static async updateMany(filter, update) {
    return Category.updateMany(filter, update);
  }
}

module.exports = CategoryRepository;
