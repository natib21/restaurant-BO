/**
 * @file src/modules/merchants/merchants.routes.js
 * @description Merchant management — CRUD, KYC, roles, users, workflow actions.
 *
 * All routes require JWT auth.
 * Most require task-based RBAC via restrictTo().
 *
 * Middleware pipeline:
 *   protect → restrictTo() → [upload → validate] → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const merchantController   = require('./controllers/merchant.controller');
const merchantUserController = require('./controllers/merchant-user.controller');
const merchantRoleController = require('./controllers/merchant-role.controller');
const { validate }         = require('./validators/merchant.validator');
const { createMerchantSchema } = require('./dto/create-merchant.dto');
const { updateMerchantSchema } = require('./dto/update-merchant.dto');

const router = express.Router();

router.use(protect);

// ── KYC / Onboarding ──────────────────────────────────────────────────────────
router.post(
  '/kyc',
  restrictTo(),
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia,
  validate(createMerchantSchema),
  merchantController.createNewMerchant
);

// ── Merchant-scoped Role Management ───────────────────────────────────────────
router.route('/roles')
  .post(restrictTo(), merchantRoleController.createMerchantRole)
  .get(restrictTo(),  merchantRoleController.getAllMerchantRoles);

router.route('/roles/:id')
  .get(restrictTo(),    merchantRoleController.getMerchantRoleById)
  .patch(restrictTo(),  merchantRoleController.updateMerchantRole)
  .delete(restrictTo(), merchantRoleController.deleteMerchantRole);

router.patch('/roles/:id/activate', restrictTo(), merchantRoleController.activateMerchantRole);

// ── Merchant-scoped User Management ───────────────────────────────────────────
router.route('/users')
  .get(restrictTo(),  merchantUserController.getMerchantUsers)
  .post(restrictTo(), merchantUserController.createMerchantUser);

router.route('/users/:id')
  .get(restrictTo(),    merchantUserController.getMerchantUserById)
  .patch(restrictTo(),  merchantUserController.updateMerchantUser)
  .delete(restrictTo(), merchantUserController.deleteMerchantUser);

router.patch('/users/:id/activate', restrictTo(), merchantUserController.activateMerchantUser);
router.get('/users/branch/:id',     restrictTo(), merchantUserController.getMerchantUsersByBranch);

// ── Self (logged-in merchant) ──────────────────────────────────────────────────
router.get('/me',   restrictTo(), merchantController.getMe);
router.patch(
  '/me',
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia,
  validate(updateMerchantSchema),
  merchantController.updateMe
);

// ── CRUD (back-office / SUPER-ADMIN) ──────────────────────────────────────────
router.route('/')
  .get(restrictTo(),  merchantController.getAllMerchants)
  .post(
    restrictTo(),
    merchantController.uploadMerchantPhotos,
    merchantController.processMerchantMedia,
    validate(createMerchantSchema),
    merchantController.createNewMerchant
  );

router.route('/:id')
  .get(restrictTo(),  merchantController.getMerchant)
  .patch(
    restrictTo(),
    merchantController.uploadMerchantPhotos,
    merchantController.processMerchantMedia,
    validate(updateMerchantSchema),
    merchantController.updateMerchant
  )
  .delete(restrictTo(), merchantController.deleteMerchant);

// ── Workflow actions ───────────────────────────────────────────────────────────
router.patch('/:id/approve',      restrictTo(), merchantController.approveMerchant);
router.patch('/:id/suspend',      restrictTo(), merchantController.suspendMerchant);
router.patch('/:id/activate',     restrictTo(), merchantController.activateMerchant);
router.patch('/:id/subscription', restrictTo(), merchantController.updateSubscription);

// ── Stats ──────────────────────────────────────────────────────────────────────
router.get('/:id/stats', restrictTo(), merchantController.getMerchantStats);

module.exports = router;
