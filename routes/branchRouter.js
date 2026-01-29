// routes/branchRoutes.js
const express = require('express');
const branchController = require('../controllers/branchController');
const authController = require('../controllers/authController');

const router = express.Router();

// Public routes
router.get('/nearby', branchController.getNearbyBranches);
router.get('/:id', branchController.getBranch);

// Protected (merchant admin only)
router.use(authController.protect);
router.use(authController.restrictTo());

router.route('/').post(branchController.createBranch).get(branchController.getAllBranches);

router.route('/:id').patch(branchController.updateBranch).delete(branchController.deleteBranch);

router.patch('/:id/regenerate-qr', branchController.regenerateQRCodes);

module.exports = router;
