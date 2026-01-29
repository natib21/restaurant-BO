// routes/orderRoutes.js
const express = require('express');
const router = express.Router({ mergeParams: true });

const orderController = require('../controllers/orderController');
const authController = require('../controllers/authController');
const protectTableSession = require('../controllers/customerSessionController');
const CustomerController = require('../controllers/customerController');

// ====================================================
//  CUSTOMER ROUTES (TABLE SESSION)
// ====================================================
// router.use(
//   protectTableSession.protectTableSession,
//   CustomerController.protectCustomer
// );

// Place order (customer)
router.post(
  '/',
  protectTableSession.protectTableSession,
  CustomerController.protectCustomer,
  orderController.placeOrder
);

// Get my active order
router.get(
  '/my-active',
  protectTableSession.protectTableSession,
  CustomerController.protectCustomer,
  orderController.getMyActiveOrder
);

// My order history
router.get(
  '/my-history',
  protectTableSession.protectTableSession,
  CustomerController.protectCustomer,
  orderController.getMyOrderHistory
);

// Lookup by order number
router.get(
  '/number/:orderNumber',
  protectTableSession.protectTableSession,
  CustomerController.protectCustomer,
  orderController.getOrderByNumber
);

// ====================================================
//  STAFF ROUTES
// ====================================================
router.use(authController.protect);

// Staff place order
router.post(
  '/staff',
  // authController.restrictTo(), // add roles if needed
  orderController.staffPlaceOrder
);

// Active orders (staff dashboard)
router.get('/active', orderController.getActiveOrders);

// Status-based views
router.get('/pending', orderController.getPendingOrders);
router.get('/accepted', orderController.getAcceptedOrders);
router.get('/preparing', orderController.getPreparingOrders);
router.get('/ready', orderController.getReadyOrders);
router.get('/served', orderController.getServedOrders);
router.get('/completed', orderController.getCompletedOrders);
router.get('/canceled', orderController.getCanceledOrders);

// Add items to order
router.patch('/:id/add-items', orderController.addItemToOrder);

// Update order status
router.patch('/:id/status', orderController.updateOrderStatus);

// Mark order as paid
router.post(
  '/:id/pay',
  orderController.uploadOrderPaymentPhoto,
  orderController.resizeOrderPaymentPhoto,
  orderController.markAsPaid
);

// Cancel order
router.patch('/:id/cancel', orderController.cancelOrder);

// Merge orders
router.post('/merge', orderController.mergeOrders);

// All orders (branch scoped)
router.get('/', orderController.getAllOrders);
router.get('/:id', orderController.getOrderById);
router.get('/:id/orders', orderController.getBranchOrders);

// ====================================================
//  MERCHANT OWNER (ALL BRANCHES)
// ====================================================
router.get(
  '/merchant/all',
  authController.restrictTo(), // owner/admin
  orderController.getMerchantAllOrders
);

module.exports = router;
