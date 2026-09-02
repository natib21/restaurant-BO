/**
 * Order Mutation Handlers
 *
 * Handles operations that modify/transform orders:
 * - Adding items
 * - Canceling
 * - Merging
 *
 * All handlers require JWT + RBAC (staff/merchant scoped).
 */

const catchAsync = require('../../../../../utils/catchAsync');
const { getMerchantId } = require('../../../../common/utils/tenant-scope');
const { OrderService } = require('../../service/OrderService');
const { sendResponse } = require('../../../../../utils/sendResponse');

/**
 * PATCH /api/v1/orders/:id/add-items (staff)
 * Add items to an existing order
 *
 * Params: id (order ID)
 * Body: { items: [...] }
 * Response: { success, message, data: { order } }
 */
exports.addItemToOrder = catchAsync(async (req, res, next) => {
  const orderId = req.params.id;
  const validatedData = req.validatedBody || req.body;
  const merchantId = getMerchantId(req);

  const order = await OrderService.addItemToOrder(
    orderId,
    validatedData.items,
    merchantId,
    req.user?._id
  );

  sendResponse(res, 200, 'order', order, { message: `Items added to order ${order.orderNumber}` });
});

/**
 * PATCH /api/v1/orders/:id/cancel (staff)
 * Cancel an order
 *
 * Params: id (order ID)
 * Body: { reason?: string }
 * Response: { success, message, data: { order } }
 */
exports.cancelOrder = catchAsync(async (req, res) => {
  const { order, alreadyCanceled } = await OrderService.cancelOrder(req);

  if (alreadyCanceled) {
    return sendResponse(res, 200, 'order', order, {
      message: `Order ${order.orderNumber} already canceled`,
    });
  }

  sendResponse(res, 200, 'order', order, {
    message: `Order ${order.orderNumber} successfully canceled`,
  });
});

/**
 * POST /api/v1/orders/merge (staff)
 * Merge multiple orders into a single order
 *
 * Body: { sourceOrderIds: [id1, id2, ...], targetOrderId: id }
 * Response: { success, message, data: { order } }
 */
exports.mergeOrders = catchAsync(async (req, res) => {
  const targetOrder = await OrderService.mergeOrders(req);

  sendResponse(res, 200, 'order', targetOrder, {
    message: `Orders successfully merged into ${targetOrder.orderNumber}`,
  });
});

/**
 * POST /api/v1/orders/:id/pay (staff)
 * Mark order as paid with optional payment photo
 *
 * Params: id (order ID)
 * Body: { paymentMethod?, amount?, notes? }
 * File: payment-photo (optional)
 * Response: { success, message, data: { order } }
 */
exports.markAsPaid = catchAsync(async (req, res) => {
  const order = await OrderService.markAsPaid(req);

  sendResponse(res, 200, 'order', order, {
    message: `Order ${order.orderNumber} marked as paid`,
  });
});
