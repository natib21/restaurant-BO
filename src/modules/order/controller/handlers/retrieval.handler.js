/**
 * Order Retrieval Handlers
 *
 * Handles listing and fetching orders.
 * All handlers require JWT + RBAC (staff/merchant scoped).
 */

const catchAsync = require('../../../../../utils/catchAsync');
const AppError = require('../../../../../utils/appError');
const { OrderService } = require('../../service/OrderService');
const { sendResponse } = require('../../../../../utils/sendResponse');

/**
 * GET /api/v1/orders (staff)
 * Get all orders for current branch (with pagination, filters)
 *
 * Response: { status: 'success', results, total, page, pages, summary, data: { orders } }
 */
exports.getAllOrders = catchAsync(async (req, res) => {
  const result = await OrderService.getAllOrders(req);
  sendResponse(res, 200, 'orders', result.orders, {
    results: result.orders.length,
    total: result.total,
    page: result.page,
    pages: result.pages,
    summary: result.summary,
  });
});

/**
 * GET /api/v1/orders/merchant/all (merchant owner)
 * Get all orders across ALL branches (merchant scope)
 *
 * Response: { status: 'success', results, total, page, pages, summary, data: { orders } }
 */
exports.getMerchantAllOrders = catchAsync(async (req, res) => {
  const result = await OrderService.getMerchantAllOrders(req);
  sendResponse(res, 200, 'orders', result.orders, {
    results: result.orders.length,
    total: result.total,
    page: result.page,
    pages: result.pages,
    summary: result.summary,
  });
});

/**
 * GET /api/v1/orders/:id/orders (staff)
 * Get orders for a specific branch
 *
 * Response: { status: 'success', results, total, page, pages, summary, data: { orders } }
 */
exports.getBranchOrders = catchAsync(async (req, res) => {
  const result = await OrderService.getBranchOrders(req);
  sendResponse(res, 200, 'orders', result.orders, {
    results: result.orders.length,
    total: result.total,
    page: result.page,
    pages: result.pages,
    summary: result.summary,
  });
});

/**
 * GET /api/v1/orders/:id
 * 
 * Get single order by ID
 * Works for:
 * - Staff (JWT auth) — can view any order in their merchant
 * - Customers (session auth) — can only view orders associated with their session's table
 *
 * Response: { status: 'success', data: { order } }
 */
exports.getOrderById = catchAsync(async (req, res) => {
  const order = await OrderService.getOrderByIdDualAuth(req);
  sendResponse(res, 200, 'order', order);
});

/**
 * GET /api/v1/orders/review-queue (staff - waiter/support)
 * Get pending orders that require review by the requesting user's role
 *
 * Returns orders where:
 * - status = 'pending'
 * - OrderFlowConfig.channels[order.source].reviewerRole matches user's role
 *
 * Response: { status: 'success', results, data: { orders } }
 */
exports.getReviewQueue = catchAsync(async (req, res) => {
  const result = await OrderService.getReviewQueue(req);
  sendResponse(res, 200, 'orders', result.orders, {
    results: result.orders.length,
  });
});
