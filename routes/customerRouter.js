// routes/customerRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const {
  protectTableSession,
  protectCustomer,
  customerAuthController,
  customerSelfController,
  customerStaffController,
} = require('../src/modules/customers');

const router = express.Router({ mergeParams: true });

// ====================== 1. PUBLIC / TABLE SESSION ======================
router.post('/login', protectTableSession, customerAuthController.loginOrCreate);

// Customer at-table only (table session + linked customer — NOT staff JWT)
router.post(
  '/gift/claim',
  protectTableSession,
  protectCustomer,
  customerSelfController.claimGift
);

router.get(
  '/me',
  protectTableSession,
  protectCustomer,
  customerSelfController.getMe
);

router.patch(
  '/me',
  protectTableSession,
  protectCustomer,
  customerSelfController.updateMe
);

router.get(
  '/my-orders',
  protectTableSession,
  protectCustomer,
  customerSelfController.getMyOrders
);

// ====================== 2. MERCHANT / STAFF (JWT + RBAC) ======================
router.use(authController.protect);
router.use(authController.restrictTo());

router.get('/crm', customerStaffController.getAllCustomers);
router.get('/:id/crm', customerStaffController.getCustomer);
router.post('/:id/gift', customerStaffController.giveGift);
router.patch('/:id/tag', customerStaffController.addTagOrNote);
router.patch('/:id', customerStaffController.updateCustomer);
router.delete('/:id', customerStaffController.deleteCustomer);
router.get('/', customerStaffController.getAllCustomers);
router.get('/:id', customerStaffController.getCustomer);

module.exports = router;
