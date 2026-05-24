// routes/customerRoutes.js
const express = require('express');
const customerController = require('../controllers/customerController');
const authController = require('../controllers/authController');
const customerAuthController = require('../controllers/customerSessionController');

const router = express.Router({ mergeParams: true });

// ====================== 1. PUBLIC / TABLE SESSION ======================
router.post('/login', customerAuthController.protectTableSession, customerController.loginOrCreate);

// Customer at-table only (table session + linked customer — NOT staff JWT)
router.post(
  '/gift/claim',
  customerAuthController.protectTableSession,
  customerController.protectCustomer,
  customerController.claimGift
);

// ====================== 2. MERCHANT / STAFF (JWT + RBAC) ======================
router.use(authController.protect);
router.use(authController.restrictTo());

router.get('/crm', customerController.getAllCustomers);
router.get('/:id/crm', customerController.getCustomer);
router.post('/:id/gift', customerController.giveGift);
router.patch('/:id/tag', customerController.addTagOrNote);
router.get('/', customerController.getAllCustomers);
router.get('/:id', customerController.getCustomer);

module.exports = router;
