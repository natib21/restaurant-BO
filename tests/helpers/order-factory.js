/**
 * @file tests/helpers/order-factory.js
 * @description Shared test helper for creating valid Order documents
 * 
 * Root cause fix for validation errors:
 * - Order schema requires `table` when orderType='dine_in' (default)
 * - Order schema requires `subtotal` always
 * 
 * This factory provides sane defaults that satisfy all required fields.
 */

const mongoose = require('mongoose');

/**
 * Build a valid order object with sane defaults
 * @param {Object} overrides - Fields to override defaults
 * @returns {Object} Valid order data
 */
function buildOrderData(overrides = {}) {
  const defaults = {
    merchant: new mongoose.Types.ObjectId(),
    branch: new mongoose.Types.ObjectId(),
    customerName: 'Test Customer',
    orderType: 'takeaway', // Default to takeaway (no table required)
    status: 'pending',
    items: [
      {
        menuItem: new mongoose.Types.ObjectId(),
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
    ],
    subtotal: 100, // Always required
    totalAmount: 100,
    orderNumber: `#TEST-${Date.now()}`,
  };

  const merged = { ...defaults, ...overrides };

  // If orderType is dine_in and no table provided, create one
  if (merged.orderType === 'dine_in' && !merged.table) {
    merged.table = new mongoose.Types.ObjectId();
  }

  // If orderType is delivery and no location provided, create one
  if (merged.orderType === 'delivery' && !merged.location) {
    merged.location = {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Test Address, Addis Ababa, Ethiopia',
    };
  }

  // Recalculate subtotal from items if items were overridden
  if (overrides.items) {
    merged.subtotal = merged.items.reduce((sum, item) => sum + item.totalPrice, 0);
    if (!overrides.totalAmount) {
      merged.totalAmount = merged.subtotal;
    }
  }

  return merged;
}

/**
 * Create an order document in the database
 * @param {Model} OrderModel - Mongoose Order model
 * @param {Object} overrides - Fields to override defaults
 * @returns {Promise<Document>} Created order document
 */
async function createOrder(OrderModel, overrides = {}) {
  const orderData = buildOrderData(overrides);
  return await OrderModel.create(orderData);
}

module.exports = {
  buildOrderData,
  createOrder,
};
