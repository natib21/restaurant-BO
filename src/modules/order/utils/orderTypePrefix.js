/**
 * @file src/modules/order/utils/orderTypePrefix.js
 * @description Centralized order type to prefix mapping
 * 
 * Order Types and Prefixes:
 * - dine_in  → DI
 * - takeaway → TA
 * - delivery → DL
 * 
 * Order Source is separate from Order Type:
 * - orderSource: pos, website, telegram, phone, qr, api
 * - orderType determines the prefix, not orderSource
 * 
 * Example:
 * - orderType: "delivery", orderSource: "telegram" → #DL-000001
 * - orderType: "delivery", orderSource: "website"  → #DL-000002
 */

const ORDER_TYPE_PREFIX_MAP = {
  dine_in: 'DI',
  takeaway: 'TA',
  delivery: 'DL',
};

/**
 * Get prefix for a given order type
 * @param {string} orderType - Order type (dine_in, takeaway, delivery)
 * @returns {string} Prefix (DI, TA, DL)
 * @throws {Error} If order type is invalid
 */
function getOrderTypePrefix(orderType) {
  if (!orderType) {
    throw new Error('Order type is required');
  }

  const normalizedType = orderType.toLowerCase().trim();
  const prefix = ORDER_TYPE_PREFIX_MAP[normalizedType];

  if (!prefix) {
    throw new Error(
      `Invalid order type: "${orderType}". Valid types: ${Object.keys(ORDER_TYPE_PREFIX_MAP).join(', ')}`
    );
  }

  return prefix;
}

/**
 * Get all supported order types
 * @returns {string[]} Array of valid order types
 */
function getSupportedOrderTypes() {
  return Object.keys(ORDER_TYPE_PREFIX_MAP);
}

/**
 * Check if an order type is valid
 * @param {string} orderType - Order type to validate
 * @returns {boolean} True if valid
 */
function isValidOrderType(orderType) {
  if (!orderType) return false;
  const normalizedType = orderType.toLowerCase().trim();
  return ORDER_TYPE_PREFIX_MAP.hasOwnProperty(normalizedType);
}

/**
 * Validate order type and throw error if invalid
 * @param {string} orderType - Order type to validate
 * @throws {Error} If order type is invalid
 */
function validateOrderType(orderType) {
  if (!orderType) {
    throw new Error('Order type is required');
  }

  if (!isValidOrderType(orderType)) {
    throw new Error(
      `Invalid order type: "${orderType}". Valid types: ${Object.keys(ORDER_TYPE_PREFIX_MAP).join(', ')}`
    );
  }
}

/**
 * Format order number with prefix and sequence
 * @param {string} prefix - Order type prefix (DI, TA, DL)
 * @param {number} sequence - Sequence number
 * @returns {string} Formatted order number (e.g., #DI-000001)
 */
function formatOrderNumber(prefix, sequence) {
  if (!prefix) {
    throw new Error('Prefix is required');
  }
  if (typeof sequence !== 'number' || sequence < 1) {
    throw new Error('Sequence must be a positive number');
  }

  // Format with 6 digits, but allow overflow if sequence exceeds 999999
  const paddedSequence = sequence.toString().padStart(6, '0');
  return `#${prefix}-${paddedSequence}`;
}

module.exports = {
  ORDER_TYPE_PREFIX_MAP,
  getOrderTypePrefix,
  getSupportedOrderTypes,
  isValidOrderType,
  validateOrderType,
  formatOrderNumber,
};
