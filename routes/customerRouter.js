// routes/customerRoutes.js
const express = require('express');
const customerController = require('../controllers/customerController');
const authController = require('../controllers/authController');
const customerAuthController = require('../controllers/customerSessionController'); // for protectCustomer

const router = express.Router({ mergeParams: true });

// ====================== 1. PUBLIC ROUTES (No Login Needed) ======================
router.post('/login', customerAuthController.protectTableSession, customerController.loginOrCreate);

// ====================== 2. MERCHANT / STAFF PROTECTED ROUTES ======================
// All below require merchant login (admin, manager, staff)
router.use(authController.protect);
// CRM Dashboard & Analytics
router.get('/crm', customerController.getAllCustomers); // List all customers with stats
router.get('/:id/crm', customerController.getCustomer); // Full 360° profile
// Staff Actions
router.post('/:id/gift', customerController.giveGift); // Give free coffee, discount, etc.
router.patch('/:id/tag', customerController.addTagOrNote); // Add "VIP", "Allergic", note

// Legacy (if still needed)
router.get('/', customerController.getAllCustomers); // Basic list
router.get('/:id', customerController.getCustomer); // Basic single view

// ====================== 3. CUSTOMER PROTECTED ROUTES (Customer JWT) ======================
// Below require customer session (from customerAuthController.createSession)
router.use(customerController.protectCustomer);

router.post('/gift/claim', customerController.claimGift); // Customer claims a gift during order

module.exports = router;
