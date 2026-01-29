// routes/menuGroupRoutes.js

const express = require('express');
const menuGroupController = require('../controllers/menuGroupController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect all routes (merchant login required)
router.use(authController.protect);
// Optional: restrict to specific roles
// router.use(authController.restrictTo('admin', 'manager'));

// Lightweight list – useful for customer-facing menus (only IDs)
router.get('/light', menuGroupController.getAllMenuGroupsLight);

// Main CRUD routes
router
  .route('/')
  .get(menuGroupController.getAllMenuGroups) // Full data with populated items
  .post(menuGroupController.createMenuGroup); // Create new menu group

router
  .route('/:id')
  .get(menuGroupController.getMenuGroup) // Get single group (populated)
  .patch(menuGroupController.updateMenuGroup) // Update name, visibility, items array, etc.
  .delete(menuGroupController.deleteMenuGroup); // Delete group

// Item management endpoints (these use PATCH on the group)
router.patch('/:id/add-item', menuGroupController.addItemToGroup);
router.patch('/:id/remove-item', menuGroupController.removeItemFromGroup);
router.patch('/:id/reorder', menuGroupController.reorderItems);

module.exports = router;
