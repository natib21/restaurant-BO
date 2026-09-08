/**
 * @file src/modules/inventory/suppliers.routes.js
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const supplierController = require('./controller/supplier.controller');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

router.route('/').get(supplierController.getAllSuppliers).post(supplierController.createSupplier);

router
  .route('/:id')
  .get(supplierController.getSupplier)
  .patch(supplierController.updateSupplier)
  .delete(supplierController.deleteSupplier);

module.exports = router;
