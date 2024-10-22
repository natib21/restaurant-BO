const express = require('express');

const menuController = require('../controllers/menuController');
const authController = require('../controllers/authController');
const router = express.Router();

router
  .route('/search')
  .get(menuController.searchMenu, menuController.getAllMenu);

router
  .route('/beverage')
  .get(menuController.getAllBeverage, menuController.getAllMenu);

router
  .route('/Appetizers')
  .get(menuController.getAppetizers, menuController.getAllMenu);

router
  .route('/specials')
  .get(menuController.getSpecials, menuController.getAllMenu);
router
  .route('/')
  .get(menuController.getAllMenu)
  .post(
    authController.protect,
    menuController.uploadMenuPhoto,
    menuController.resizeMenuPhoto,
    menuController.createNewMenu
  );

router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(
    authController.protect,
    menuController.uploadMenuPhoto,
    menuController.resizeMenuPhoto,
    menuController.updateMenu
  )
  .delete(authController.protect, menuController.deleteMenu);

module.exports = router;
