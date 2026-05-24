// routes/purchaseOrderRoutes.js
const express = require('express');
const purchaseOrderController = require('../controllers/purchaseOrderController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect all routes
router.use(authController.protect);
router.use(authController.restrictTo());

router
  .route('/')
  .get(purchaseOrderController.getAllPurchaseOrders)
  .post(purchaseOrderController.createPurchaseOrder);

router
  .route('/:id')
  .get(purchaseOrderController.getPurchaseOrder)
  .patch(purchaseOrderController.updatePurchaseOrder)
  .delete(purchaseOrderController.deletePurchaseOrder);

// Receive purchase order
router.post('/:id/receive', purchaseOrderController.receivePurchaseOrder);

module.exports = router;