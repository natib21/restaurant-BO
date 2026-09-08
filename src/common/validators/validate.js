const AppError = require('../errors');

/**
 * Lightweight request validator (Zod-compatible shape, no external dep required).
 * schema: { field: { required?, type?, min?, max?, enum?, email?, match? } }
 */
function validateBody(schema) {
  return (req, _res, next) => {
    const errors = [];
    const body = req.body || {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = body[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      if (value === undefined || value === null) continue;

      if (rules.type === 'string' && typeof value !== 'string') {
        errors.push(`${field} must be a string`);
      }
      if (rules.type === 'number') {
        const n = Number(value);
        if (Number.isNaN(n)) errors.push(`${field} must be a number`);
        else if (rules.min !== undefined && n < rules.min)
          errors.push(`${field} must be >= ${rules.min}`);
      }
      if (rules.email && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push(`${field} must be a valid email`);
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }
      if (rules.minLength && String(value).length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }
    }

    if (schema._match) {
      const [a, b] = schema._match;
      if (body[a] !== body[b]) errors.push(`${a} and ${b} must match`);
    }

    if (errors.length) return next(new AppError(errors.join('; '), 400));
    next();
  };
}

module.exports = { validateBody };
