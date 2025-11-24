// routes/customerAuthRoutes.js
const express = require('express');
const customerAuthController = require('../controllers/customerSessionController');
const authController = require('../controllers/authController'); // your merchant/staff auth

const router = express.Router({ mergeParams: true });

// ====================== 1. PUBLIC: Create Session (After loginOrCreate) ======================
router.post('/session', customerAuthController.createSession);

// ====================== 2. CUSTOMER PROTECTED ROUTES (Customer JWT) ======================
// All below require valid customer JWT (from createSession)
router.use(customerAuthController.protectCustomer);

router.post('/logout', customerAuthController.logout);
router.post('/logout-all', customerAuthController.logoutAll);
router.get('/my-sessions', customerAuthController.getMySessions);

// ====================== 3. MERCHANT / STAFF PROTECTED ROUTES ======================
// All below require merchant login + role (admin, manager, staff)
router.use(authController.protect);
router.use(authController.restrictTo());

// Admin Dashboard Features
router.get('/sessions/all', customerAuthController.getAllActiveSessions);           // All active diners
router.get('/sessions/count', customerAuthController.getActiveDinersCount);        // Real-time count
router.delete('/sessions/:sessionId', customerAuthController.forceKillSession);     // Kill one device
router.delete('/customer/:customerId/sessions', customerAuthController.forceLogoutCustomer); // Kick customer

module.exports = router;