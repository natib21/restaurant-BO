const express = require('express');
const menuController = require('../controllers/menuController');
const authController = require('../controllers/authController');

const router = express.Router();

// =============================================================
// 1. PUBLIC ROUTES – Customer sees active menu (auto day/time switch)
// =============================================================

// Main public menu (auto detects lunch/dinner/happy hour etc.)
router.get('/:id/public', menuController.getPublicMenu);

// FILTERED VERSIONS – All these MUST use SAME :merchantId

router
  .get('/:id/public/beverages',   menuController.getAllBeverage, menuController.getPublicMenu)
  .get('/:id/public/drinks',      menuController.getAllBeverage, menuController.getPublicMenu)
  .get('/:id/public/food',        menuController.getFoodOnly,    menuController.getPublicMenu)
  .get('/:id/public/appetizers',  menuController.getAppetizers,   menuController.getPublicMenu)
  .get('/:id/public/specials',    menuController.getSpecials,     menuController.getPublicMenu)
  .get('/:id/public/search',      menuController.searchMenu,    menuController.getPublicMenu); // ?query=chicken

// Optional: Support old style if you want (less clean)
// router.get('/beverage/:merchantId', menuController.getAllBeverage, menuController.getPublicMenu);

// =============================================================
// 2. MERCHANT PROTECTED ROUTES
// =============================================================
router.use(authController.protect); // All below need login

// Merchant manages their own menu items
router
  .route('/')
  .get(menuController.getAllMenu)
  .post(
    menuController.uploadMenuPhoto,
    menuController.resizeMenuPhoto,
    menuController.createNewMenu
  );

router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(
    menuController.uploadMenuPhoto,
    menuController.resizeMenuPhoto,
    menuController.updateMenu
  )
  .delete(menuController.deleteMenu);

// =============================================================
// 3. SUPER ADMIN ONLY
// =============================================================
router.get('/admin/all', 
  authController.restrictTo('super-admin'), 
  menuController.getAllMenu // gets ALL menus from ALL merchants
);

module.exports = router;