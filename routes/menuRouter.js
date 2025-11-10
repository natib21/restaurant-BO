const express = require('express');
const menuController = require('../controllers/menuController');
const authController = require('../controllers/authController');

const router = express.Router();

// Get a public menu by ID (e.g., via QR code)

// Search/filter menus (beverage, appetizers, specials, etc.)
router.get('/search', menuController.searchMenu, menuController.getAllMenu);
router.get('/beverage', menuController.getAllBeverage, menuController.getAllMenu);
router.get('/appetizers', menuController.getAppetizers, menuController.getAllMenu);
router.get('/specials', menuController.getSpecials, menuController.getAllMenu);


router.get('/:id/public', menuController.getPublicMenu);

// -------------------
// PROTECTED ROUTES (MERCHANT & ADMIN)
// -------------------
router.use(authController.protect);

// Merchant: get all menus for their merchant
// router.get('/',  menuController.getAllMenusForMerchant);

// Create a new menu (merchant or admin)
router.post(
  '/',
 
  menuController.uploadMenuPhoto,
  menuController.resizeMenuPhoto,
  menuController.createNewMenu
);

// Get/update/delete a single menu
router
  .route('/:id')
  .get( menuController.getMenu)
  .patch(
    
    menuController.uploadMenuPhoto,
    menuController.resizeMenuPhoto,
    menuController.updateMenu
  )
  .delete( menuController.deleteMenu);

// -------------------
// SUPER ADMIN ROUTES
// -------------------

// Get all menus across all merchants
router.get('/admin/all',  menuController.getAllMenu);

module.exports = router;
