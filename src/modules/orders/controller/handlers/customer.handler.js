/**
 * Customer Order Handlers
 * 
 * Handles customer-specific order operations via table session.
 * All handlers extract context from req.ctx (table session).
 */

const catchAsync = require('../../../../../utils/catchAsync');
const AppError = require('../../../../../utils/appError');
const { OrderService } = require('../../service/OrderService');

/**
 * GET /api/v1/orders/my-history
 * Get customer's order history
 * 
 * Context: req.customerId (from table session)
 * Response: { status, results, data: { orders } }
 */
exports.getMyOrderHistory = catchAsync(async (req, res) => {
  const ordersWithImages = await OrderService.getMyOrderHistory(req);

  res.status(200).json({
    status: 'success',
    results: ordersWithImages.length,
    data: { orders: ordersWithImages },
  });
});

/**
 * GET /api/v1/orders/number/:orderNumber
 * Lookup order by order number (customer view)
 * 
 * Context: req.customerId (from table session)
 * Response: { status, data: { order } }
 */
exports.getOrderByNumber = catchAsync(async (req, res) => {
  const order = await OrderService.getOrderByNumber(req);

  res.status(200).json({
    status: 'success',
    data: {
      order: formatOrderByNumberPayload(order),
    },
  });
});

/**
 * GET /api/v1/orders/my-active
 * Get customer's currently active order at table
 * 
 * Context: req.customerId, req.tableId (from table session)
 * Response: { status, data: { order } }
 */
exports.getMyActiveOrder = catchAsync(async (req, res) => {
  const order = await OrderService.getMyActiveOrder(req);

  if (!order) {
    return res.status(200).json({
      status: 'success',
      data: { order: null },
    });
  }

  res.status(200).json({
    status: 'success',
    data: { order },
  });
});

/**
 * Helper: Format order payload for customer view
 */
function formatOrderByNumberPayload(order) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: order.totalAmount,
    items: order.items,
    placedAt: order.placedAt,
    estimatedTime: order.estimatedTime,
  };
}
