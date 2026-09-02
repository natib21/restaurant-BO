/**
 * Order Placement Handlers
 *
 * Handles order creation for both customers (via QR) and staff (manual).
 * Uses idempotency for customer orders and transaction service.
 */

const catchAsync = require('../../../../../utils/catchAsync');
const AppError = require('../../../../../utils/appError');
const { getMerchantId, getBranchId } = require('../../../../common/utils/tenant-scope');
const { OrderService } = require('../../service/OrderService');
const { OrderTransactionService } = require('../../service/OrderTransactionService');
const { IdempotencyService } = require('../../service/IdempotencyService');
const { sendResponse } = require('../../../../../utils/sendResponse');

/**
 * POST /api/v1/orders (customer)
 * Place order from QR menu
 *
 * Guard: protectTableSession
 * Context: req.customerId, req.tableId, req.tableSession
 * Body: { items: [...] }
 * Response: { success, message, data: { order } }
 */
exports.placeOrder = catchAsync(async (req, res, next) => {
  // Data is already validated by middleware
  const items = req.validatedBody?.items || req.body.items;
  const tableId = req.tableId;
  const customerId = req.customerId;
  const sessionToken = req.tableSession?.token; // ✅ Pass session token for notifications

  const merchantId = getMerchantId(req);
  const branchId = getBranchId(req) ?? req.tableSession?.branch;

  if (!branchId) {
    return next(new AppError('Branch context is required', 400));
  }

  // Idempotency for retry safety
  const idempotencyKey = IdempotencyService.normalizeKey(req.get('Idempotency-Key'));

  // Delegate to transaction service (handles complex business logic)
  const { order, replayed } = await OrderTransactionService.executePlaceOrder({
    merchantId,
    branchId,
    tableId,
    customerId,
    customer: req.customer,
    customerName: req.customer?.fullName || 'Guest',
    customerPhone: req.customer?.phone || null,
    sessionToken, // ✅ Pass session token to avoid re-querying
    items,
    performedBy: req.user?._id || null,
    idempotencyKey,
  });

  if (replayed) {
    res.set('Idempotent-Replayed', 'true');
  }

  sendResponse(res, 201, 'order', {
    _id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: order.totalAmount,
    placedAt: order.placedAt,
  }, { message: `Order ${order.orderNumber} sent to kitchen!` });
});

/**
 * POST /api/v1/orders/staff (staff)
 * Staff places order manually
 *
 * Guard: protect, restrictTo (RBAC)
 * Context: req.user (JWT), req.ctx (tenant)
 * Body: { tableNumber, customerName, items, [...] }
 * Response: { success, message, data: { order } }
 */
exports.staffPlaceOrder = catchAsync(async (req, res, next) => {
  const validatedData = req.validatedBody || req.body;

  // Determine source based on user's role
  const roleName = (req.user?.role?.name || '').toUpperCase();
  let source = 'admin'; // default for admin/merchant roles
  
  if (roleName.includes('WAITER')) {
    source = 'waiter';
  }

  const order = await OrderService.staffPlaceOrder({
    ...validatedData,
    performedBy: req.user?._id,
    performedByName: req.user.firstName || 'Staff',
    merchantId: getMerchantId(req),
    source, // pass explicit source
  });

  sendResponse(res, 201, 'order', {
    _id: order._id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    source: order.source,
    status: order.status,
    totalAmount: order.totalAmount,
    tableNumber: order.tableNumber,
    customerName: order.customerName,
    placedAt: order.placedAt,
    items: order.items,
  }, { message: `Order ${order.orderNumber} placed successfully!` });
});
