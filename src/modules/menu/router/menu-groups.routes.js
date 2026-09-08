/**
 * @file src/modules/menu/menu-groups.routes.js
 * @description Menu group CRUD + item management.
 *
 * All routes require JWT auth + task RBAC.
 *
 * Middleware pipeline:
 *   protect → restrictTo() → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../../common/guards/auth.guard');
const menuGroupController = require('../controller/menu-group.controller');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

router.get('/light', menuGroupController.getAllMenuGroupsLight);

router
  .route('/')
  .get(menuGroupController.getAllMenuGroups)
  .post(menuGroupController.createMenuGroup);

router
  .route('/:id')
  .get(menuGroupController.getMenuGroup)
  .patch(menuGroupController.updateMenuGroup)
  .delete(menuGroupController.deleteMenuGroup);

router.patch('/:id/add-item', menuGroupController.addItemToGroup);
router.patch('/:id/remove-item', menuGroupController.removeItemFromGroup);
router.patch('/:id/reorder', menuGroupController.reorderItems);

module.exports = router;
