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
} = require('./controller/order.controller');
const { protect } = require('../../common/guards/auth.guard');
const { requireFeature } = require('../../common/guards/feature.guard');
const { protectTableSession } = require('../customers/customer-session.guard');
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

// ============================================================
// STAFF ROUTES (JWT auth + task RBAC)
// ============================================================

router.use(protect);
router.use(requireFeature('orders'));

router.post('/staff', validate(placeOrderStaffSchema, 'body'), staffPlaceOrder);

router.get('/active', validate(orderFiltersSchema, 'query'), getActiveOrders);

// Status-specific lists (must be registered before /:id)
router.get('/completed', getCompletedOrders);
router.get('/pending', getPendingOrders);
router.get('/accepted', getAcceptedOrders);
router.get('/preparing', getPreparingOrders);
router.get('/ready', getReadyOrders);
router.get('/served', getServedOrders);
router.get('/canceled', getCanceledOrders);

router.get('/number/:orderNumber', getOrderByNumber);

router.post('/:id/pay', upload.single('image'), markAsPaid);

router.patch('/:id/status', validate(updateOrderStatusSchema, 'body'), updateOrderStatus);

router.patch('/:id/add-items', validate(addItemToOrderSchema, 'body'), addItemToOrder);

router.get('/:id', getOrderById);

module.exports = router;
