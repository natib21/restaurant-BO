/**
 * Order Status Handlers
 * 
 * Handles status queries and status transitions.
 * All handlers are staff/merchant scoped and require JWT + RBAC.
 */

const catchAsync = require('../../../../utils/catchAsync');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { OrderService } = require('../../service/OrderService');

/**
 * GET /api/v1/orders/active (staff)
 * Get active orders for branch
 * 
 * Query: { status?, tableNumber?, limit?, offset? }
 * Response: { success, message, data: { orders }, meta: { count } }
 */
exports.getActiveOrders = catchAsync(async (req, res, next) => {
  const orders = await OrderService.getActiveOrders(req);

  res.sendList(
    orders,
    'orders',
    200,
    { count: orders.length }
  );
});

/**
 * PATCH /api/v1/orders/:id/status (staff)
 * Update order status (e.g., pending → accepted → preparing → ready)
 * 
 * Params: id (order ID)
 * Body: { status, reason? }
 * Response: { success, message, data: { order } }
 */
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
  const orderId = req.params.id;
  const validatedData = req.validatedBody || req.body;
  const merchantId = getMerchantId(req);

  const { order, noop } = await OrderService.updateOrderStatus(
    orderId,
    validatedData.status,
    validatedData.reason,
    merchantId,
    req.user?._id
  );

  res.sendSuccess(
    order,
    200,
    noop 
      ? `Order already in status ${validatedData.status}`
      : `Order updated to ${validatedData.status}`
  );
});

/**
 * Factory: Create status-specific handlers
 * Patterns: GET /pending, /accepted, /preparing, /ready, /served, /canceled, /completed
 */
const createStatusEndpoint = status =>
  catchAsync(async (req, res) => {
    const orders = await OrderService.getOrdersByStatus(req, status);
    res.status(200).json({
      status: 'success',
      count: orders.length,
      data: { orders },
    });
  });

/**
 * GET /api/v1/orders/pending
 * Get all pending orders (not yet accepted)
 */
exports.getPendingOrders = createStatusEndpoint('pending');

/**
 * GET /api/v1/orders/accepted
 * Get all accepted orders (kitchen has seen them)
 */
exports.getAcceptedOrders = createStatusEndpoint('accepted');

/**
 * GET /api/v1/orders/preparing
 * Get all orders being prepared
 */
exports.getPreparingOrders = createStatusEndpoint('preparing');

/**
 * GET /api/v1/orders/ready
 * Get all ready-for-pickup orders
 */
exports.getReadyOrders = createStatusEndpoint('ready');

/**
 * GET /api/v1/orders/served
 * Get all served orders
 */
exports.getServedOrders = createStatusEndpoint('served');

/**
 * GET /api/v1/orders/canceled
 * Get all canceled orders
 */
exports.getCanceledOrders = createStatusEndpoint('canceled');

/**
 * GET /api/v1/orders/completed
 * Get all completed orders with summary stats
 * 
 * Response: { status, count, summary: { totalRevenue, avgValue }, data: { orders } }
 */
exports.getCompletedOrders = catchAsync(async (req, res) => {
  const { orders, summary } = await OrderService.getCompletedOrders(req);

  res.status(200).json({
    status: 'success',
    count: orders.length,
    summary,
    data: { orders },
  });
});
