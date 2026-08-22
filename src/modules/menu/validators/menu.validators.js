const AppError = require('../../../../utils/appError');

function parseJSON(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (err) {
    return fallback;
  }
}

function assertMenuCreateFields({ name, type, categoryId }) {
  // Validate localized name
  if (!name) {
    throw new AppError('name is required', 400);
  }
  
  // If name is an object (localized), validate English name is present
  if (typeof name === 'object') {
    if (!name.en || !name.en.trim()) {
      throw new AppError('name.en (English name) is required', 400);
    }
    if (name.en.length < 2 || name.en.length > 100) {
      throw new AppError('name.en must be between 2 and 100 characters', 400);
    }
    if (name.am && (name.am.length < 2 || name.am.length > 100)) {
      throw new AppError('name.am must be between 2 and 100 characters', 400);
    }
  } else if (typeof name === 'string') {
    // Support legacy string format temporarily
    if (!name.trim()) {
      throw new AppError('name is required', 400);
    }
    if (name.length < 2 || name.length > 100) {
      throw new AppError('name must be between 2 and 100 characters', 400);
    }
  }
  
  if (!type) {
    throw new AppError('type is required', 400);
  }
  
  // CategoryId is now optional (for backward compatibility)
  // but category (string) is deprecated
}

function validateLocalizedDescription(description) {
  if (!description) return true; // Optional field
  
  if (typeof description === 'object') {
    if (description.en && description.en.length > 800) {
      throw new AppError('description.en must not exceed 800 characters', 400);
    }
    if (description.am && description.am.length > 800) {
      throw new AppError('description.am must not exceed 800 characters', 400);
    }
  } else if (typeof description === 'string') {
    if (description.length > 800) {
      throw new AppError('description must not exceed 800 characters', 400);
    }
  }
  
  return true;
}

function assertBranchMenuGroupName(name) {
  if (!name?.trim()) {
    throw new AppError('Menu group name is required', 400);
  }
}

module.exports = {
  parseJSON,
  assertMenuCreateFields,
  validateLocalizedDescription,
  assertBranchMenuGroupName,
};
