const express = require('express');

const menuController = require('../controllers/menuController');

const router = express.Router();

router.param('id', menuController.checkId);

router
  .route('/')
  .get(menuController.getAllMenu)
  .post(menuController.checkBody, menuController.createNewMenu);

router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(menuController.updateMenu)
  .delete(menuController.deleteMenu);

module.exports = router;
