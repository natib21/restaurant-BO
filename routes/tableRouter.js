const express = require('express');
const tableController = require('../controllers/tableController');
const router = express.Router();

router
  .route('/')
  .get(tableController.getAllTables)
  .post(tableController.createNewTables);

router
  .route('/:id')
  .get(tableController.getTables)
  .patch(tableController.updateTables)
  .delete(tableController.deleteTables);

module.exports = router;
