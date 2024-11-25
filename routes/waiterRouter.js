const express = require('express');
const waiterController = require('../controllers/waiterController');
const router = express.Router();

router
  .route('/')
  .get(waiterController.getAllWaiters)
  .post(waiterController.createNewWaiters);

router
  .route('/:id')
  .get(waiterController.getWaiters)
  .patch(waiterController.updateWaiters)
  .delete(waiterController.deleteWaiters);

module.exports = router;
