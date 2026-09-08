/**
 * Zod-based Request Validation Middleware
 *
 * Validates request body, query, or params against a Zod schema
 * Automatically catches validation errors and returns standard error response
 *
 * Usage in routes:
 * router.post('/orders', validate(orderCreateSchema, 'body'), controller.create)
 * router.get('/orders', validate(orderFiltersSchema, 'query'), controller.list)
 */

const { ZodError } = require('zod');
const AppError = require('../../../utils/appError');

/**
 * Factory function to create validation middleware
 *
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - Request source to validate ('body', 'query', 'params')
 * @returns {function} Express middleware
 */
module.exports = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source];

      // Parse and validate
      const validated = schema.parse(dataToValidate);

      // Attach validated data to request with a marker
      // e.g., req.bodyValidated, req.queryValidated, req.paramsValidated
      req[`${source}Validated`] = validated;

      // Also keep reference for convenience
      if (source === 'body') {
        req.validatedBody = validated;
      } else if (source === 'query') {
        req.validatedQuery = validated;
      } else if (source === 'params') {
        req.validatedParams = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors into readable array
        const errors = error.errors.map(err => ({
          field: err.path.join('.') || 'root',
          message: err.message,
          code: err.code,
        }));

        // Return standard error response
        return res.sendError(`Validation error in ${source}`, 400, errors);
      }

      // Unknown error - pass to error handler
      next(error);
    }
  };
};
