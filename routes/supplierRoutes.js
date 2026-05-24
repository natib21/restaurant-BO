// routes/supplierRoutes.js
const express = require('express');
const supplierController = require('../controllers/supplierController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect all routes
router.use(authController.protect);
router.use(authController.restrictTo());

router
  .route('/')
  .get(supplierController.getAllSuppliers)
  .post(supplierController.createSupplier);

router
  .route('/:id')
  .get(supplierController.getSupplier)
  .patch(supplierController.updateSupplier)
  .delete(supplierController.deleteSupplier);

module.exports = router;