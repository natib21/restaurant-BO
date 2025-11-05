const express = require('express');
const merchantController = require('../controllers/merchantController');
const authController = require('../controllers/authController');

const router = express.Router();

// PROTECT ALL ROUTES
// router.use(authController.protect);
// router.use(authController.restrictTo()); // Backoffice role required

// MEDIA UPLOAD
router.post(
  '/KYC',
  authController.protect,
  merchantController.uploadMerchantPhotos,
  merchantController.processMerchantMedia
);

router
  .route('/:id/users')
  .get(merchantController.getMerchantUsers) // Read all users
  .post(merchantController.createMerchantUser); // Create a new user

router
  .route('/:id/users/:userId')
  .patch(merchantController.updateMerchantUser) // Update a user
  .delete(merchantController.deleteMerchantUser);



// CRUD OPERATIONS
router
  .route('/')
  .post(
    authController.protect,
    merchantController.uploadMerchantPhotos,
    merchantController.processMerchantMedia,
    merchantController.createNewMerchant
  )
  .get(merchantController.getAllMerchants);

router
  .route('/:id')
  .get(merchantController.getMerchant)
  .patch(
    authController.protect,
    merchantController.uploadMerchantPhotos,
    merchantController.processMerchantMedia,
    merchantController.updateMerchant
  )
  .delete(merchantController.deleteMerchant);

// WORKFLOW OPERATIONS
router.patch('/:id/approve', merchantController.approveMerchant);
router.patch('/:id/suspend', merchantController.suspendMerchant);
router.patch('/:id/activate', merchantController.activateMerchant);
router.patch('/:id/subscription', merchantController.updateSubscription);

// UTILITY OPERATIONS
router.get('/:id/stats', merchantController.getMerchantStats);


module.exports = router;