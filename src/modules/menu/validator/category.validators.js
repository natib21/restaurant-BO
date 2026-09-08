/**
 * @file src/modules/categories/validators/category.validators.js
 * @description Validation middleware for category endpoints
 * 
 * Validates:
 * - Required fields
 * - Data types
 * - Field formats
 * - Business rules
 */

const AppError = require('../../../../utils/appError');

/**
 * Validate category creation data
 */
exports.validateCreateCategory = (req, res, next) => {
  const { name, description, image, displayOrder } = req.body;

  // Validate name (required)
  if (!name) {
    return next(new AppError('Category name is required', 400));
  }

  // Validate name structure
  if (typeof name !== 'object') {
    return next(new AppError('Category name must be an object with language codes', 400));
  }

  // Validate English name (required)
  if (!name.en || typeof name.en !== 'string' || !name.en.trim()) {
    return next(new AppError('English name (name.en) is required', 400));
  }

  // Validate Amharic name if provided
  if (name.am !== undefined && typeof name.am !== 'string') {
    return next(new AppError('Amharic name (name.am) must be a string', 400));
  }

  // Validate description if provided
  if (description !== undefined) {
    if (typeof description !== 'object') {
      return next(new AppError('Description must be an object with language codes', 400));
    }

    if (description.en !== undefined && typeof description.en !== 'string') {
      return next(new AppError('English description (description.en) must be a string', 400));
    }

    if (description.am !== undefined && typeof description.am !== 'string') {
      return next(new AppError('Amharic description (description.am) must be a string', 400));
    }
  }

  // Validate image if provided
  if (image !== undefined && image !== null && typeof image !== 'string') {
    return next(new AppError('Image must be a string', 400));
  }

  // Validate displayOrder if provided
  if (displayOrder !== undefined) {
    const order = Number(displayOrder);
    if (isNaN(order)) {
      return next(new AppError('Display order must be a valid number', 400));
    }
    req.body.displayOrder = order; // Convert to number
  }

  next();
};

/**
 * Validate category update data
 */
exports.validateUpdateCategory = (req, res, next) => {
  const { name, description, image, displayOrder, isActive } = req.body;

  // Validate name if provided
  if (name !== undefined) {
    if (typeof name !== 'object') {
      return next(new AppError('Category name must be an object with language codes', 400));
    }

    // If name.en is provided, it cannot be empty
    if (name.en !== undefined) {
      if (typeof name.en !== 'string' || !name.en.trim()) {
        return next(new AppError('English name (name.en) cannot be empty', 400));
      }
    }

    // Validate Amharic name if provided
    if (name.am !== undefined && typeof name.am !== 'string') {
      return next(new AppError('Amharic name (name.am) must be a string', 400));
    }
  }

  // Validate description if provided
  if (description !== undefined) {
    if (typeof description !== 'object') {
      return next(new AppError('Description must be an object with language codes', 400));
    }

    if (description.en !== undefined && typeof description.en !== 'string') {
      return next(new AppError('English description (description.en) must be a string', 400));
    }

    if (description.am !== undefined && typeof description.am !== 'string') {
      return next(new AppError('Amharic description (description.am) must be a string', 400));
    }
  }

  // Validate image if provided
  if (image !== undefined && image !== null && typeof image !== 'string') {
    return next(new AppError('Image must be a string', 400));
  }

  // Validate displayOrder if provided
  if (displayOrder !== undefined) {
    const order = Number(displayOrder);
    if (isNaN(order)) {
      return next(new AppError('Display order must be a valid number', 400));
    }
    req.body.displayOrder = order;
  }

  // Validate isActive if provided
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      return next(new AppError('isActive must be a boolean', 400));
    }
  }

  next();
};

/**
 * Validate ObjectId format
 */
exports.validateObjectId = (req, res, next) => {
  const { id } = req.params;

  // Simple ObjectId format validation (24 hex characters)
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return next(new AppError('Invalid category ID format', 400));
  }

  next();
};
