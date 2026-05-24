const AppError = require('../../../../utils/appError');

function parseJSON(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (err) {
    return fallback;
  }
}

function assertMenuCreateFields({ name, type, category }) {
  if (!name || !type || !category) {
    throw new AppError('name, type and category are required', 400);
  }
}

function assertBranchMenuGroupName(name) {
  if (!name?.trim()) {
    throw new AppError('Menu group name is required', 400);
  }
}

module.exports = {
  parseJSON,
  assertMenuCreateFields,
  assertBranchMenuGroupName,
};
