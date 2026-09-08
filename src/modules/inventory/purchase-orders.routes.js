/**
 * @file src/modules/inventory/purchase-orders.routes.js
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const purchaseOrderController = require('./controller/purchase-order.controller');
const { requireFeature } = require('../../common/guards/feature.guard');
const router = express.Router();

router.use(protect);
router.use(restrictTo());
router.use(requireFeature('inventory'));

router
  .route('/')
  .get(purchaseOrderController.getAllPurchaseOrders)
  .post(purchaseOrderController.createPurchaseOrder);

router
  .route('/:id')
  .get(purchaseOrderController.getPurchaseOrder)
  .patch(purchaseOrderController.updatePurchaseOrder)
  .delete(purchaseOrderController.deletePurchaseOrder);

router.post('/:id/receive', purchaseOrderController.receivePurchaseOrder);

module.exports = router;
