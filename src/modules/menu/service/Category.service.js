/**
 * @file src/modules/menu/service/Category.service.js
 * @description Business logic for category management
 * 
 * Responsibilities:
 * - CRUD operations with business validation
 * - Multi-tenant scoping enforcement
 * - Name uniqueness validation
 * - ApiFeatures integration for list queries
 * - Soft-delete orchestration
 */

const CategoryRepository = require('../repository/Category.repository');
const AppError = require('../../../../utils/appError');
const ApiFeatures = require('../../../../utils/apiFeatures');
const { normalizeName, normalizeDescription } = require('../../../../utils/localization-helper');

class CategoryService {
  /**
   * Get all categories for a merchant with query features
   * 
   * @param {Object} req - Express request object
   * @returns {Promise<Array<Category>>}
   */
  static async getAll(req) {
    const merchantId = req.user?.merchant?._id || req.user?.merchant;

    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Base query from repository (returns Query object)
    const baseQuery = CategoryRepository.findAll(merchantId, {}, false);

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
   * Get active categories only
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Array<Category>>}
   */
  static async getActiveCategories(merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    return CategoryRepository.findActive(merchantId);
  }

  /**
   * Get a single category by ID
   * 
   * @param {string} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Category>}
   */
  static async getById(categoryId, merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const category = await CategoryRepository.findById(categoryId, merchantId, false);

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    return category;
  }

  /**
   * Create a new category
   * 
   * @param {Object} categoryData - Category data
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} userId - User ID (createdBy)
   * @returns {Promise<Category>}
   */
  static async create(categoryData, merchantId, userId) {
    // Validate merchant ID
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Normalize localized fields
    let normalizedName;
    let normalizedDescription = null;

    try {
      normalizedName = normalizeName(categoryData.name);
      if (categoryData.description) {
        normalizedDescription = normalizeDescription(categoryData.description);
      }
    } catch (error) {
      throw new AppError(error.message, 400);
    }

    // Check name uniqueness within merchant
    const nameExists = await CategoryRepository.nameExists(
      normalizedName.en,
      merchantId
    );

    if (nameExists) {
      throw new AppError(
        `Category with name "${normalizedName.en}" already exists`,
        409
      );
    }

    // Create category with merchant scoping
    const category = await CategoryRepository.create({
      ...categoryData,
      name: normalizedName,
      description: normalizedDescription,
      merchant: merchantId,
      createdBy: userId,
      updatedBy: userId
    });

    return category;
  }

  /**
   * Update a category
   * 
   * @param {string} categoryId - Category ID
   * @param {Object} updateData - Update data
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} userId - User ID (updatedBy)
   * @returns {Promise<Category>}
   */
  static async update(categoryId, updateData, merchantId, userId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Check if category exists and belongs to merchant
    const category = await CategoryRepository.findById(categoryId, merchantId, false);

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    // Normalize localized fields if provided
    if (updateData.name) {
      try {
        updateData.name = normalizeName(updateData.name);
      } catch (error) {
        throw new AppError(error.message, 400);
      }
      
      // Check name uniqueness if name is being changed
      const trimmedName = updateData.name.en.trim();
      
      if (trimmedName !== category.name.en) {
        const nameExists = await CategoryRepository.nameExists(
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

    if (updateData.description !== undefined) {
      try {
        updateData.description = normalizeDescription(updateData.description);
      } catch (error) {
        throw new AppError(error.message, 400);
      }
    }

    // Set updatedBy
    updateData.updatedBy = userId;

    // Update category
    const updatedCategory = await CategoryRepository.updateById(
      categoryId,
      merchantId,
      updateData
    );

    return updatedCategory;
  }

  /**
   * Soft delete a category
   * 
   * @param {string} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {ObjectId} userId - User ID (deletedBy)
   * @returns {Promise<Category>}
   */
  static async softDelete(categoryId, merchantId, userId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const category = await CategoryRepository.findById(categoryId, merchantId, false);

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    // Check if category is being used by menu items
    const MenuItem = require('../model/MenuItem.model');
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
    return CategoryRepository.softDelete(categoryId, merchantId, userId);
  }

  /**
   * Restore a soft-deleted category
   * 
   * @param {string} categoryId - Category ID
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Category>}
   */
  static async restore(categoryId, merchantId) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const category = await CategoryRepository.findById(categoryId, merchantId, true);

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    if (!category.deletedAt) {
      throw new AppError('Category is not deleted', 400);
    }

    // Check name uniqueness before restoring
    const nameExists = await CategoryRepository.nameExists(
      category.name.en,
      merchantId,
      categoryId
    );

    if (nameExists) {
      throw new AppError(
        `Cannot restore: Category with name "${category.name.en}" already exists`,
        409
      );
    }

    return CategoryRepository.restore(categoryId, merchantId);
  }

  /**
   * Get category count
   * 
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - Query filters
   * @returns {Promise<number>}
   */
  static async count(merchantId, filters = {}) {
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    return CategoryRepository.count(merchantId, filters, false);
  }
}

module.exports = CategoryService;
