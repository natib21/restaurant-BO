// routes/orderRoutes.js
const express = require('express');
const router = express.Router({ mergeParams: true });

const orderController = require('../controllers/orderController');
const authController = require('../controllers/authController'); // your staff auth
const protectTableSession = require('../controllers/customerSessionController'); // QR session

// ====================================================
//  CUSTOMER ROUTES (Protected by Table Session)
// ====================================================
router.use(protectTableSession.protectTableSession); // All below require active table session

// Place new order
router.route('/').post(orderController.placeOrder);

// Customer: Get my current active order
router.route('/my-active').get(orderController.getMyActiveOrder);

// Customer: Get my order history
router.route('/my-history').get(orderController.getMyOrderHistory);

// Customer OR Staff: Get order by number (e.g. #T5-467)
router
  .route('/number/:id') // Changed :id to :orderNumber for clarity
  .get(orderController.getOrderByNumber);

// ====================================================
//  STAFF / ADMIN ONLY ROUTES (Protected)
// ====================================================
router.use(authController.protect);
router.use(authController.restrictTo());

// ⭐️ NEW ROUTE: Merge multiple orders into one
router.route('/merge').post(orderController.mergeOrders);

// Kitchen & Waiter Live Screens
router.get('/pending', orderController.getPendingOrders);
router.get('/accepted', orderController.getAcceptedOrders);
router.get('/preparing', orderController.getPreparingOrders);
router.get('/ready', orderController.getReadyOrders);
router.get('/served', orderController.getServedOrders);
router.get('/completed', orderController.getCompletedOrders);
router.get('/canceled', orderController.getCanceledOrders);

// Full analytics dashboard (with filters, pagination)
router.get('/', orderController.getAllOrders);

// Update order status (e.g. accept → preparing → ready)
router.route('/:id/status').patch(orderController.updateOrderStatus);

// Mark order as paid (Cashier)
router.route('/:id/pay').post(orderController.markAsPaid);

module.exports = router;
