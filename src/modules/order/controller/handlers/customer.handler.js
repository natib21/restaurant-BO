/**
 * Customer Order Handlers
 *
 * Handles customer-specific order operations via table session.
 */

const catchAsync = require('../../../../../utils/catchAsync');
const AppError = require('../../../../../utils/appError');
const { OrderService } = require('../../service/OrderService');
const { formatOrderByNumberPayload } = require('../../dto/order-response.dto');
const { sendResponse } = require('../../../../../utils/sendResponse');

/**
 * GET /api/v1/orders/my-history
 * Response: { status: 'success', results, data: { orders } }
 */
exports.getMyOrderHistory = catchAsync(async (req, res) => {
  const orders = await OrderService.getMyOrderHistory(req);
  sendResponse(res, 200, 'orders', orders, { results: orders.length });
});

/**
 * GET /api/v1/orders/number/:orderNumber
 * Response: { status: 'success', data: { order } }
 */
exports.getOrderByNumber = catchAsync(async (req, res) => {
  const order = await OrderService.getOrderByNumber(req);
  sendResponse(res, 200, 'order', formatOrderByNumberPayload(order));
});

/**
 * GET /api/v1/orders/my-active
 * Response: { status: 'success', data: { order } }  — order may be null
 */
exports.getMyActiveOrder = catchAsync(async (req, res) => {
  const order = await OrderService.getMyActiveOrder(req);
  sendResponse(res, 200, 'order', order || null);
});
