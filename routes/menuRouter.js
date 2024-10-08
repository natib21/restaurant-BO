const express = require('express');

const menuController = require('../controllers/menuController');

const router = express.Router();

router
  .route('/beverage')
  .get(menuController.getAllBeverage, menuController.getAllMenu);

router
  .route('/')
  .get(menuController.getAllMenu)
  .post(menuController.createNewMenu);

router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(menuController.updateMenu)
  .delete(menuController.deleteMenu);

module.exports = router;
