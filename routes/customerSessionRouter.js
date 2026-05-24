// routes/customerSessionRoutes.js
const express = require('express');
const router = express.Router();

const customerAuthController = require('../controllers/customerSessionController');
const authController = require('../controllers/authController'); // protect, restrictTo

/* ==================== PUBLIC ROUTE (QR SCAN) ==================== */
// QR → Validate → Create Table Session
router.post('/start-session', customerAuthController.startTableSession);

/* ==================== CUSTOMER SESSION PROTECTED ROUTES ==================== */
// Used for menu, cart, order, payment etc.
router.use('/menu', customerAuthController.protectTableSession);
router.use('/order', customerAuthController.protectTableSession);
router.use('/payment', customerAuthController.protectTableSession);

/* Example protected routes (optional) */
// router.get('/menu/list', menuController.getMenu);

/* ==================== LINK ACCOUNT AFTER LOGIN ==================== */
router.post(
  '/link-account',
  customerAuthController.protectTableSession, // JWT auth for logged customers
  customerAuthController.linkAccount
);

/* ==================== STAFF ONLY ROUTES ==================== */
router.patch(
  '/free-table/:id',
  authController.protect, // staff/admin JWT
  authController.restrictTo(),
  customerAuthController.freeTable
);

/* ==================== ADMIN ROUTES ==================== */
router.get(
  '/sessions',
  authController.protect,
  authController.restrictTo(),
  customerAuthController.getAllSessions
);

router.get(
  '/sessions/table/:tableId',
  authController.protect,
  authController.restrictTo(),
  customerAuthController.getSessionByTable
);

module.exports = router;
