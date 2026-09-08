/**
 * Order Status Handlers
 *
 * Handles status queries and status transitions.
 * All handlers are staff/merchant scoped and require JWT + RBAC.
 */

const catchAsync = require('../../../../../utils/catchAsync');
const { getMerchantId } = require('../../../../common/utils/tenant-scope');
const { OrderService } = require('../../service/OrderService');
const { sendResponse } = require('../../../../../utils/sendResponse');

/**
 * GET /api/v1/orders/active (staff)
 * Get active orders for branch
 *
 * Query: { status?, branchId?, page?, limit? }
 * Response: { status: 'success', results, data: { orders } }
 */
exports.getActiveOrders = catchAsync(async (req, res, next) => {
  const result = await OrderService.getActiveOrders(req);
  sendResponse(res, 200, 'orders', result.orders, {
    results: result.results,
    total: result.total,
    page: result.page,
    pages: result.pages,
  });
});

/**
 * PATCH /api/v1/orders/:id/status (staff)
 * Update order status (e.g., pending → accepted → preparing → ready)
 *
 * Params: id (order ID)
 * Body: { status, reason? }
 * Response: { status: 'success', message, data: { order } }
 */
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
  const validatedData = req.validatedBody || req.body;
  req.body = { ...req.body, ...validatedData };

  const result = await OrderService.updateOrderStatus(req);
  const order = result.order;
  const noop = result.noop;

  sendResponse(res, 200, 'order', order, {
    message: noop
      ? `Order already in status ${validatedData.status}`
      : `Order updated to ${validatedData.status}`,
  });
});

/**
 * Factory: Create status-specific list handlers.
 * GET /pending, /accepted, /preparing, /ready, /served, /canceled
 */
const createStatusEndpoint = status =>
  catchAsync(async (req, res) => {
    const result = await OrderService.getOrdersByStatus(req, status);
    sendResponse(res, 200, 'orders', result.orders, {
      results: result.results,
      total: result.total,
      page: result.page,
      pages: result.pages,
    });
  });

exports.getPendingOrders   = createStatusEndpoint('pending');
exports.getAcceptedOrders  = createStatusEndpoint('accepted');
exports.getPreparingOrders = createStatusEndpoint('preparing');
exports.getReadyOrders     = createStatusEndpoint('ready');
exports.getServedOrders    = createStatusEndpoint('served');
exports.getCanceledOrders  = createStatusEndpoint('canceled');

/**
 * GET /api/v1/orders/completed
 * Get all completed orders with summary stats
 *
 * Response: { status: 'success', results, total, page, pages, summary, data: { orders } }
 */
exports.getCompletedOrders = catchAsync(async (req, res) => {
  const result = await OrderService.getCompletedOrders(req);
  sendResponse(res, 200, 'orders', result.orders, {
    results: result.orders.length,
    total: result.total,
    page: result.page,
    pages: result.pages,
    summary: result.summary,
  });
});
