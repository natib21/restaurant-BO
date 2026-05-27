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
const router = express.Router({ mergeParams: true });

const { placeOrder, getActiveOrders, updateOrderStatus, addItemToOrder } = require('../controller/order.controller');
const { protect } = require('../../../common/guards/auth.guard');
const { protectTableSession } = require('../../customers/guards/table-session.guard');
const validate = require('../../../common/middleware/validate.middleware');

const {
  placeOrderCustomerSchema,
  placeOrderStaffSchema,
  updateOrderStatusSchema,
  addItemToOrderSchema,
  orderFiltersSchema,
} = require('../validators/order.validators');

// ============================================================
// CUSTOMER ROUTES (Table session - QR menu ordering)
// ============================================================

/**
 * POST /api/v1/orders (customer)
 * Customer places order from QR menu
 * 
 * Request body:
 * {
 *   "items": [
 *     { "menuItemId": "...", "quantity": 2, "notes": "No onions" }
 *   ]
 * }
 */
router.post(
  '/',
  protectTableSession,
  validate(placeOrderCustomerSchema, 'body'),
  placeOrder
);

// ============================================================
// STAFF ROUTES (JWT auth + task RBAC)
// ============================================================

router.use(protect);  // ← All staff routes require auth

/**
 * POST /api/v1/orders/staff (staff)
 * Staff manually places order
 */
router.post(
  '/staff',
  validate(placeOrderStaffSchema, 'body'),
  placeOrder
);

/**
 * GET /api/v1/orders/active (staff)
 * Get all active orders for current branch
 */
router.get(
  '/active',
  validate(orderFiltersSchema, 'query'),
  getActiveOrders
);

/**
 * GET /api/v1/orders/:id/status (staff)
 * Get order by ID
 */
router.get(
  '/:id',
  (req, res, next) => {
    // Validation handled by controller for now
    next();
  },
  getActiveOrders
);

/**
 * PATCH /api/v1/orders/:id/status (staff)
 * Update order status (pending → accepted → preparing → ready → served/completed)
 * 
 * Request body:
 * {
 *   "status": "accepted",
 *   "reason": "Optional reason for status change"
 * }
 */
router.patch(
  '/:id/status',
  validate(updateOrderStatusSchema, 'body'),
  updateOrderStatus
);

/**
 * PATCH /api/v1/orders/:id/add-items (staff)
 * Add more items to existing order
 */
router.patch(
  '/:id/add-items',
  validate(addItemToOrderSchema, 'body'),
  addItemToOrder
);

module.exports = router;
