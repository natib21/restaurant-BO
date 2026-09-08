/**
 * @file utils/sendResponse.js
 * @description Standardized response envelope helper for consistent API responses
 * 
 * Standard shapes:
 * - List:   { status: 'success', results: <count>, data: { <resourceKey>: [...] } }
 * - Single: { status: 'success', data: { <resourceKey>: {...} } }
 * - Delete: 204 No Content (empty body)
 * - Action: { status: 'success', message: <string>, data: { <resourceKey>: {...} } }
 */

/**
 * Send standardized JSON response
 * 
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} resourceKey - Resource name for data envelope (e.g., 'menu', 'combos')
 * @param {*} data - Response data (object, array, or null)
 * @param {Object} extra - Additional fields (e.g., { results: 12 } or { message: '...' })
 * 
 * @example
 * // List response
 * sendResponse(res, 200, 'menus', menuArray, { results: menuArray.length });
 * 
 * // Single resource
 * sendResponse(res, 200, 'menu', menuObject);
 * 
 * // Action with message
 * sendResponse(res, 200, 'menu', menuObject, { message: 'Menu item updated' });
 */
exports.sendResponse = (res, statusCode, resourceKey, data, extra = {}) => {
  res.status(statusCode).json({
    status: 'success',
    ...extra,
    data: { [resourceKey]: data },
  });
};
