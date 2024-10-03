const express = require('express');
const orderController = require('../controllers/orderController');
const router = express.Router();
router
  .route('/')
  .get(orderController.getAllOrder)
  .post(orderController.createNewOrder);

router
  .route('/:id')
  .get(orderController.getOrder)
  .patch(orderController.updateOrder)
  .delete(orderController.deleteOrder);

module.exports = router;
