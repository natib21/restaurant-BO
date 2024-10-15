const express = require('express');

const menuController = require('../controllers/menuController');

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

module.exports = router;
