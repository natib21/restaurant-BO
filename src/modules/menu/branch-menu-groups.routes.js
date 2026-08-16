/**
 * @file src/modules/menu/branch-menu-groups.routes.js
 * @description Branch-level menu group overrides (price, visibility, item order).
 *
 * All routes require JWT auth + task RBAC.
 *
 * Middleware pipeline:
 *   protect → restrictTo() → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const branchMenuGroupController = require('./controller/branch-menu-group.controller');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

router
  .route('/')
  .get(branchMenuGroupController.getAllBranchMenuGroups)
  .post(branchMenuGroupController.createBranchMenuGroup);

router
  .route('/:id')
  .get(branchMenuGroupController.getBranchMenuGroup)
  .patch(branchMenuGroupController.updateBranchMenuGroup)
  .delete(branchMenuGroupController.deleteBranchMenuGroup);

router.patch('/:id/add-item', branchMenuGroupController.addItemToGroup);
router.patch('/:id/remove-item', branchMenuGroupController.removeItemFromGroup);
router.patch('/:id/reorder', branchMenuGroupController.reorderBranchMenuGroupItems);

module.exports = router;
