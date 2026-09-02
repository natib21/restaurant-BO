/**
 * Orders Module Routes
 *
 * Clean routing with:
 * - Centralized validation (Zod middleware)
 * - Consistent response format (via middleware)
 * - Clear separation of customer vs staff routes
 * - Backward compatible with legacy API
 */

const express = require('express');
const multer = require('multer');
const router = express.Router({ mergeParams: true });

const {
  placeOrder,
  staffPlaceOrder,
  getActiveOrders,
  updateOrderStatus,
  addItemToOrder,
  cancelOrder,
  markAsPaid,
  getOrderById,
  getOrderByNumber,
  getPendingOrders,
  getAcceptedOrders,
  getPreparingOrders,
  getReadyOrders,
  getServedOrders,
  getCanceledOrders,
  getCompletedOrders,
  getReviewQueue,
} = require('./controller/order.controller');
const { protect } = require('../../common/guards/auth.guard');
const { requireFeature } = require('../../common/guards/feature.guard');
const { protectTableSession } = require('../customers/customer-session.guard');
const { dualAuth } = require('./middleware/dual-auth');
const validate = require('../../common/middleware/validate.middleware');

const {
  placeOrderCustomerSchema,
  placeOrderStaffSchema,
  updateOrderStatusSchema,
  addItemToOrderSchema,
  orderFiltersSchema,
} = require('./validators/order.validators');

const upload = multer({ storage: multer.memoryStorage() });

// ============================================================
// CUSTOMER ROUTES (Table session - QR menu ordering)
// ============================================================

router.post(
  '/',
  protectTableSession,
  requireFeature('orders'),
  validate(placeOrderCustomerSchema, 'body'),
  placeOrder
);

// ✅ Customer: Get my order history (session auth)
router.get(
  '/my-history',
  protectTableSession,
  requireFeature('orders'),
  require('./controller/handlers/customer.handler').getMyOrderHistory
);

// ✅ CATCH-ALL: Get order by ID (MUST be BEFORE router.use(protect))
// Works for both staff JWT and customer session via dualAuth
router.get(
  '/:id',
  dualAuth,
  requireFeature('orders'),
  getOrderById
);

// ============================================================
// STAFF ROUTES (JWT auth + task RBAC)
// ============================================================

router.use(protect);
router.use(requireFeature('orders'));

// ✅ NAMED ROUTES FIRST (must be before /:id)
router.post('/staff', validate(placeOrderStaffSchema, 'body'), staffPlaceOrder);

router.get('/active', validate(orderFiltersSchema, 'query'), getActiveOrders);

// Review queue (must be before status-specific lists)
router.get('/review-queue', getReviewQueue);

// Status-specific lists (must be registered before /:id)
router.get('/completed', getCompletedOrders);
router.get('/pending', getPendingOrders);
router.get('/accepted', getAcceptedOrders);
router.get('/preparing', getPreparingOrders);
router.get('/ready', getReadyOrders);
router.get('/served', getServedOrders);
router.get('/canceled', getCanceledOrders);

router.get('/number/:orderNumber', getOrderByNumber);

// ✅ Item-level status workflow routes (MUST be before /:id routes to avoid conflicts)
const itemStatusHandler = require('./controller/handlers/item-status.handler');

router.patch(
  '/:orderId/items/:itemId/status',
  itemStatusHandler.updateItemStatus
);

router.post(
  '/:orderId/items/serve-ready',
  itemStatusHandler.serveReadyItems
);

router.patch(
  '/:orderId/items/:itemId/void',
  itemStatusHandler.voidItem
);

router.post('/:id/pay', upload.single('image'), markAsPaid);

router.patch('/:id/status', validate(updateOrderStatusSchema, 'body'), updateOrderStatus);

router.patch('/:id/add-items', validate(addItemToOrderSchema, 'body'), addItemToOrder);

router.patch('/:id/cancel', cancelOrder);

module.exports = router;
