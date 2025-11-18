const express = require('express');
const menuController = require('../controllers/menuController');
const authController = require('../controllers/authController');

const router = express.Router();

// PUBLIC ROUTES (no auth needed)
router.get('/:id/public', menuController.getPublicMenu); // Customer view active menu

// PUBLIC FILTERS & SEARCH (for customers)
router.get('/beverage', menuController.getAllBeverage, menuController.getPublicMenu); // All drinks
router.get('/appetizers', menuController.getAppetizers, menuController.getPublicMenu); // Appetizers
router.get('/specials', menuController.getSpecials, menuController.getPublicMenu); // Special combos
router.get('/food', menuController.getFoodOnly, menuController.getPublicMenu); // All food
router.get('/search', menuController.searchMenu, menuController.getPublicMenu); // Search

// PROTECTED ROUTES (merchant & admin)
router.use(authController.protect, authController.restrictTo());

// Merchant: Get all their own menus
router.get('/', menuController.getAllMenu);

// Create new menu item (with image)
router.post(
  '/',
  menuController.uploadMenuPhoto,
  menuController.resizeMenuPhoto,
  menuController.createNewMenu
);

// Get/update/delete single menu item
router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(menuController.uploadMenuPhoto, menuController.resizeMenuPhoto, menuController.updateMenu)
  .delete(menuController.deleteMenu);

// SUPER-ADMIN ONLY (all menus across merchants)
router.get('/admin/all', authController.restrictTo(), menuController.getAllMenu);

module.exports = router;
