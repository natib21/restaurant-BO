/**
 * Response Standardization Middleware
 *
 * Ensures all API responses follow the standard format:
 *
 * Success:
 * {
 *   "success": true,
 *   "message": "...",
 *   "data": {},
 *   "meta": {}
 * }
 *
 * Error:
 * {
 *   "success": false,
 *   "message": "...",
 *   "errors": []
 * }
 */

/**
 * Middleware to enforce response format
 *
 * Can be used explicitly in controllers:
 * res.sendSuccess(data, statusCode, meta)
 * res.sendError(message, statusCode, errors)
 */
module.exports = (req, res, next) => {
  /**
   * Standard success response
   *
   * @param {*} data - Response data
   * @param {number} statusCode - HTTP status code (default: 200)
   * @param {string} message - Success message (default: "Success")
   * @param {object} meta - Additional metadata (pagination, etc)
   */
  res.sendSuccess = function (data, statusCode = 200, message = 'Success', meta = {}) {
    return this.status(statusCode).json({
      success: true,
      message,
      data,
      ...(Object.keys(meta).length > 0 && { meta }),
    });
  };

  /**
   * Standard error response
   *
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 400)
   * @param {array} errors - Array of error details
   */
  res.sendError = function (message, statusCode = 400, errors = []) {
    return this.status(statusCode).json({
      success: false,
      message,
      ...(errors.length > 0 && { errors }),
    });
  };

  /**
   * List response with pagination
   *
   * @param {array} items - Array of items
   * @param {string} key - Key name for items (e.g., 'orders')
   * @param {number} statusCode - HTTP status code
   * @param {object} meta - Pagination meta (page, pages, total, etc)
   */
  res.sendList = function (items, key = 'items', statusCode = 200, meta = {}) {
    return this.status(statusCode).json({
      success: true,
      message: `${key} retrieved successfully`,
      data: {
        [key]: items,
        count: items.length,
      },
      ...(Object.keys(meta).length > 0 && { meta }),
    });
  };

  next();
};
