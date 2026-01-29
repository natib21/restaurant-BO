// routes/branchMenuGroupRoutes.js
const express = require('express');
const branchMenuGroupController = require('../controllers/branchMenuGroupController');
const authController = require('../controllers/authController');

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo());

router
  .route('/')
  .post(branchMenuGroupController.createBranchMenuGroup)
  .get(branchMenuGroupController.getAllBranchMenuGroups);

router
  .route('/:id')
  .get(branchMenuGroupController.getBranchMenuGroup)
  .patch(branchMenuGroupController.updateBranchMenuGroup)
  .delete(branchMenuGroupController.deleteBranchMenuGroup);

router.patch('/:id/add-item', branchMenuGroupController.addItemToGroup);
router.patch('/:id/remove-item', branchMenuGroupController.removeItemFromGroup);
router.patch('/:id/reorder', branchMenuGroupController.reorderBranchMenuGroupItems);

module.exports = router;
