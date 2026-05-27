/**
 * @file merchantRoutes.js
 * @description Merchant & user management routes
 *              - User routes use req.user.merchant (no :id in URL)
 *              - All access controlled via restrictTo() + tasks
 *              - No magic role strings
 */

const express = require('express');

const merchantController = require('../src/modules/merchants/controllers/merchant.controller');
const merchantUserController = require('../src/modules/merchants/controllers/merchant-user.controller');
const merchantRoleController = require('../src/modules/merchants/controllers/merchant-role.controller');
const { validate } = require('../src/modules/merchants/validators/merchant.validator');
const { createMerchantSchema } = require('../src/modules/merchants/dto/create-merchant.dto');
const { updateMerchantSchema } = require('../src/modules/merchants/dto/update-merchant.dto');

const authController = require('../controllers/authController');

const router = express.Router();

// ===================================================================
// 1. GLOBAL MIDDLEWARE
// ===================================================================

// All routes require login
router.use(authController.protect);

// ===================================================================
// 2. KYC UPLOAD (Merchant self-onboarding)
// ===================================================================

router.post(
  '/KYC',
  authController.restrictTo(), // task: 'upload-kyc'
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia,
  validate(createMerchantSchema),
  merchantController.createNewMerchant
);

// ===================================================================
// 3. MERCHANT-ONLY ROLE MANAGEMENT
// ===================================================================
router
  .route('/roles')
  .post(
    authController.restrictTo(), // task: 'create-role'
    merchantRoleController.createMerchantRole
  )
  .get(
    authController.restrictTo(), // task: 'list-roles'
    merchantRoleController.getAllMerchantRoles
  );

router
  .route('/roles/:id')
  .get(
    authController.restrictTo(), // task: 'view-role'
    merchantRoleController.getMerchantRoleById
  )
  .patch(
    authController.restrictTo(), // task: 'update-role'
    merchantRoleController.updateMerchantRole
  )
  .delete(
    authController.restrictTo(), // task: 'delete-role'
    merchantRoleController.deleteMerchantRole
  );

router.patch(
  '/roles/:id/activate',
  authController.restrictTo(),
  merchantRoleController.activateMerchantRole
);

// ===================================================================
// 3. USER MANAGEMENT (no :merchantId in URL)
// ===================================================================

router
  .route('/users')
  .get(
    authController.restrictTo(), // task: 'view-users'
    merchantUserController.getMerchantUsers
  )
  .post(
    authController.restrictTo(), // task: 'create-user'
    merchantUserController.createMerchantUser
  );

router
  .route('/users/:id')
  .get(authController.restrictTo(), merchantUserController.getMerchantUserById)
  .patch(
    authController.restrictTo(), // task: 'update-user'
    merchantUserController.updateMerchantUser
  )
  .delete(
    authController.restrictTo(), // task: 'delete-user'
    merchantUserController.deleteMerchantUser
  );

router.patch(
  '/users/:id/activate',
  authController.restrictTo(),
  merchantUserController.activateMerchantUser
);

// GET /api/v1/merchants/branches/:branchId/users
router
  .route('/users/branch/:id')
  .get(authController.restrictTo(), merchantUserController.getMerchantUsersByBranch);

// ===================================================================
// 4. MERCHANT CRUD (Back-office only)
// ===================================================================

router.post(
  '/',
  authController.restrictTo(), // task: 'create-merchant'
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia,
  validate(createMerchantSchema),
  merchantController.createNewMerchant
);

router.get(
  '/',
  authController.restrictTo(), // task: 'list-merchants'
  merchantController.getAllMerchants
);

router.get('/me', authController.restrictTo(), merchantController.getMe);

router.patch(
  '/me',
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia,
  validate(updateMerchantSchema),
  merchantController.updateMe
);

router.get(
  '/:id',
  authController.restrictTo(), // task: 'view-merchant'
  merchantController.getMerchant
);

router.patch(
  '/:id',
  authController.restrictTo(), // task: 'update-merchant'
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia,
  validate(updateMerchantSchema),
  merchantController.updateMerchant
);

router.delete(
  '/:id',
  authController.restrictTo(), // task: 'delete-merchant'
  merchantController.deleteMerchant
);

// ===================================================================
// 5. WORKFLOW ROUTES
// ===================================================================

router.patch(
  '/:id/approve',
  authController.restrictTo(), // task: 'approve-merchant'
  merchantController.approveMerchant
);

router.patch(
  '/:id/suspend',
  authController.restrictTo(), // task: 'suspend-merchant'
  merchantController.suspendMerchant
);

router.patch(
  '/:id/activate',
  authController.restrictTo(), // task: 'activate-merchant'
  merchantController.activateMerchant
);

router.patch(
  '/:id/subscription',
  authController.restrictTo(), // task: 'update-subscription'
  merchantController.updateSubscription
);

// ===================================================================
// 6. STATS
// ===================================================================

router.get(
  '/:id/stats',
  authController.restrictTo(), // task: 'view-stats'
  merchantController.getMerchantStats
);

module.exports = router;
