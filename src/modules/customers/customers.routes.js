/**
 * @file src/modules/customers/customers.routes.js
 * @description Customer routes — table-session self-service + staff CRM.
 *
 * Two distinct auth contexts:
 *  - Table session (QR scan): protectTableSession + protectCustomer
 *  - Staff JWT: protect + restrictTo()
 *
 * Middleware pipeline (table session):
 *   protectTableSession → protectCustomer → handler
 *
 * Middleware pipeline (staff):
 *   protect → restrictTo() → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const {
  protectTableSession,
  protectCustomer,
  customerAuthController,
  customerSelfController,
  customerStaffController,
} = require('./index');

const router = express.Router();

// ── 1. Table-session public (QR login) ────────────────────────────────────────
router.post('/login', protectTableSession, customerAuthController.loginOrCreate);

// ── 2. Table-session self-service (must be linked customer) ───────────────────
router.post('/gift/claim',  protectTableSession, protectCustomer, customerSelfController.claimGift);
router.get('/me',           protectTableSession, protectCustomer, customerSelfController.getMe);
router.patch('/me',         protectTableSession, protectCustomer, customerSelfController.updateMe);
router.get('/my-orders',    protectTableSession, protectCustomer, customerSelfController.getMyOrders);

// ── 3. Staff CRM (JWT + RBAC) ─────────────────────────────────────────────────
router.use(protect);
router.use(restrictTo());

router.get('/',           customerStaffController.getAllCustomers);
router.get('/crm',        customerStaffController.getAllCustomers);
router.get('/:id',        customerStaffController.getCustomer);
router.get('/:id/crm',    customerStaffController.getCustomer);
router.post('/:id/gift',  customerStaffController.giveGift);
router.patch('/:id/tag',  customerStaffController.addTagOrNote);
router.patch('/:id',      customerStaffController.updateCustomer);
router.delete('/:id',     customerStaffController.deleteCustomer);

module.exports = router;
