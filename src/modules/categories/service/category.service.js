/**
 * @file src/modules/categories/service/category.service.js
 * @description Business logic for category management
 * 
 * Responsibilities:
 * - CRUD operations with business validation
 * - Multi-tenant scoping enforcement
 * - ApiFeatures integration for list queries
 * - Name uniqueness validation
 */

// Use new structured model
const Category = require('../../menu/model/Category.model');
const AppError = require('../../../../utils/appError');
const ApiFeatures = require('../../../../utils/apiFeatures');

class CategoryService {
  /**
   * Create a new category
   * @param {Object} categoryData - Category data
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Category>}
   */
  static async createCategory(categoryData, merchantId, userId) {
    // Validate merchant ID
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Validate required fields
    if (!categoryData.name || !categoryData.name.en || !categoryData.name.en.trim()) {
      throw new AppError('English name (name.en) is required', 400);
    }

    // Check name uniqueness within merchant
    const nameExists = await Category.nameExistsForMerchant(
      categoryData.name.en,
      merchantId
    );

    if (nameExists) {
      throw new AppError(
        `Category with name "${categoryData.name.en}" already exists`,
        409
      );
    }

    // Create category with merchant scoping
    const category = await Category.create({
      ...categoryData,
      merchant: merchantId,
      createdBy: userId,
      updatedBy: userId
    });

    return category;
  }

  /**
   * Get all categories for a merchant with query features
   * @param {Object} req - Express request object
   * @returns {Promise<Array<Category>>}
   */
  static async getAllCategories(req) {
    const merchantId = req.user?.merchant?._id || req.user?.merchant;

    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Base query with merchant scoping (NEVER from req.query)
    const baseQuery = Category.find({ merchant: merchantId });

    // Apply ApiFeatures for filter, search, sort, fields, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name.en', 'name.am', 'description.en', 'description.am'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const categories = await features.query;

    return categories || [];
  }

  /**
   * Get a single category by ID
   * @param {string} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Category>}
   */
  static async getCategoryById(categoryId, merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const category = await Category.findOne({
      _id: categoryId,
      merchant: merchantId
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    return category;
  }

  /**
   * Update a category
   * @param {string} categoryId - Category ID
   * @param {Object} updateData - Update data
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Category>}
   */
  static async updateCategory(categoryId, updateData, merchantId, userId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Check if category exists and belongs to merchant
    const category = await Category.findOne({
      _id: categoryId,
      merchant: merchantId
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    // If name.en is being updated, check uniqueness
    if (updateData.name && updateData.name.en) {
      const trimmedName = updateData.name.en.trim();
      
      if (trimmedName !== category.name.en) {
        const nameExists = await Category.nameExistsForMerchant(
          trimmedName,
          merchantId,
          categoryId // Exclude current category from check
        );

        if (nameExists) {
          throw new AppError(
            `Category with name "${trimmedName}" already exists`,
            409
          );
        }
      }
    }

    // Update category
    Object.assign(category, updateData);
    category.updatedBy = userId;

    await category.save();

    return category;
  }

  /**
   * Soft delete a category (set isActive to false)
   * @param {string} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Category>}
   */
  static async deleteCategory(categoryId, merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const category = await Category.findOne({
      _id: categoryId,
      merchant: merchantId
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    // Check if category is being used by menu items
    const MenuItem = require('../../menu/model/MenuItem.model');
    const menuItemsCount = await MenuItem.countDocuments({
      categoryId: categoryId,
      merchant: merchantId,
      deletedAt: null
    });

    if (menuItemsCount > 0) {
      throw new AppError(
        `Cannot delete category. It is used by ${menuItemsCount} menu item(s). Please reassign or delete those items first.`,
        409
      );
    }

    // Soft delete
    await category.softDelete();

    return category;
  }

  /**
   * Get active categories only
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Array<Category>>}
   */
  static async getActiveCategories(merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const categories = await Category.findActiveByMerchant(merchantId);

    return categories;
  }

  /**
   * Restore a soft-deleted category
   * @param {string} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Category>}
   */
  static async restoreCategory(categoryId, merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const category = await Category.findOne({
      _id: categoryId,
      merchant: merchantId
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    if (category.isActive) {
      throw new AppError('Category is already active', 400);
    }

    await category.restore();

    return category;
  }
}

module.exports = { CategoryService };
