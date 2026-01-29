const express = require('express');
const menuController = require('../controllers/menuController');
const authController = require('../controllers/authController');
const customerAuthController = require('../controllers/customerSessionController');
const router = express.Router();

// =============================================================
// 1. PUBLIC ROUTES – Customer sees active menu (auto day/time switch)
// =============================================================
// Main public menu (auto detects lunch/dinner/happy hour etc.)
router.get('/public', customerAuthController.protectTableSession, menuController.getPublicMenu);

// FILTERED VERSIONS – All these MUST use SAME :merchantId

router
  .get(
    '/:id/public/beverages',
    customerAuthController.protectTableSession,
    menuController.getAllBeverage,
    menuController.getPublicMenu
  )
  .get(
    '/:id/public/drinks',
    customerAuthController.protectTableSession,
    menuController.getAllBeverage,
    menuController.getPublicMenu
  )
  .get(
    '/:id/public/food',
    customerAuthController.protectTableSession,
    menuController.getFoodOnly,
    menuController.getPublicMenu
  )
  .get(
    '/:id/public/appetizers',
    customerAuthController.protectTableSession,
    menuController.getAppetizers,
    menuController.getPublicMenu
  )
  .get(
    '/:id/public/specials',
    customerAuthController.protectTableSession,
    menuController.getSpecials,
    menuController.getPublicMenu
  )
  .get(
    '/:id/public/search',
    customerAuthController.protectTableSession,
    menuController.searchMenu,
    menuController.getPublicMenu
  ); // ?query=chicken

// Optional: Support old style if you want (less clean)
// router.get('/beverage/:merchantId', menuController.getAllBeverage, menuController.getPublicMenu);

// =============================================================
// 2. MERCHANT PROTECTED ROUTES
// =============================================================
router.use(authController.protect); // All below need login
router.use(authController.restrictTo());

router.route('/staff-menu').get(menuController.getStaffMenu);
// Merchant manages their own menu items
router
  .route('/')
  .get(menuController.getAllMenu)
  .post(
    menuController.uploadMenuPhoto,
    menuController.resizeMenuPhoto,
    menuController.createNewMenu
  );
router.route('/:id/toggle-availability').patch(menuController.toggleMenuItemAvailability);
router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(menuController.uploadMenuPhoto, menuController.resizeMenuPhoto, menuController.updateMenu)
  .delete(menuController.deleteMenu);

// =============================================================
// 3. SUPER ADMIN ONLY
// =============================================================
router.get(
  '/admin/all',
  authController.restrictTo('super-admin'),
  menuController.getAllMenu // gets ALL menus from ALL merchants
);

module.exports = router;
