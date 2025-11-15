/**
 * @file merchantRoutes.js
 * @description Merchant & user management routes
 *              - User routes use req.user.merchant (no :id in URL)
 *              - All access controlled via restrictTo() + tasks
 *              - No magic role strings
 */

const express = require('express');
const merchantController = require('../controllers/merchantController');
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
  merchantController.createNewMerchant
);

// ===================================================================
// 3. MERCHANT-ONLY ROLE MANAGEMENT
// ===================================================================
// POST /api/v1/merchants/roles
// GET  /api/v1/merchants/roles
router
  .route('/roles')
  .post(
    authController.restrictTo(), // task: 'create-role'
    merchantController.createMerchantRole
  )
  .get(
    authController.restrictTo(), // task: 'list-roles'
    merchantController.getAllMerchantRoles
  );

// GET    /api/v1/merchants/roles/:roleId
// PATCH  /api/v1/merchants/roles/:roleId
// DELETE /api/v1/merchants/roles/:roleId
router
  .route('/roles/:id')
  .get(
    authController.restrictTo(), // task: 'view-role'
    merchantController.getMerchantRoleById
  )
  .patch(
    authController.restrictTo(), // task: 'update-role'
    merchantController.updateMerchantRole
  )
  .delete(
    authController.restrictTo(), // task: 'delete-role'
    merchantController.deleteMerchantRole
  );
router.patch(
  '/roles/:id/activate',
  authController.restrictTo(),
  merchantController.activateMerchantRole
);

// ===================================================================
// 3. USER MANAGEMENT (no :merchantId in URL)
// ===================================================================

// GET    /api/v1/merchants/users
// POST   /api/v1/merchants/users
router
  .route('/users')
  .get(
    authController.restrictTo(), // task: 'view-users'
    merchantController.getMerchantUsers
  )
  .post(
    authController.restrictTo(), // task: 'create-user'
    merchantController.createMerchantUser
  );

// PATCH  /api/v1/merchants/users/:userId
// DELETE /api/v1/merchants/users/:userId
router
  .route('/users/:id')
  .get(authController.restrictTo(), merchantController.getMerchantUserById)
  .patch(
    authController.restrictTo(), // task: 'update-user'
    merchantController.updateMerchantUser
  )
  .delete(
    authController.restrictTo(), // task: 'delete-user'
    merchantController.deleteMerchantUser
  );
router.patch(
  '/users/:id/activate',
  authController.restrictTo(),
  merchantController.activateMerchantUser
);

// ===================================================================
// 4. MERCHANT CRUD (Back-office only)
// ===================================================================

// POST /api/v1/merchants
router.post(
  '/',
  authController.restrictTo(), // task: 'create-merchant'
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia,
  merchantController.createNewMerchant
);

// GET /api/v1/merchants
router.get(
  '/',
  authController.restrictTo(), // task: 'list-merchants'
  merchantController.getAllMerchants
);

// GET /api/v1/merchants/:id
router.get(
  '/:id',
  authController.restrictTo(), // task: 'view-merchant'
  merchantController.getMerchant
);

// PATCH /api/v1/merchants/:id
router.patch(
  '/:id',
  authController.restrictTo(), // task: 'update-merchant'
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia,
  merchantController.updateMerchant
);

// DELETE /api/v1/merchants/:id
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
