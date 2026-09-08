const express = require('express');
const router = express.Router();
const paymentVerificationController = require('./controller/payment-verification.controller');
const { protect } = require('../../common/guards/auth.guard');

/**
 * Payment Verification Routes
 * 
 * All routes require authentication and merchant context
 */

// Initiate verification from QR code (enhanced CBE workflow with PDF download)
router.post(
  '/initiate-from-qr',
  protect,
  paymentVerificationController.initiateVerificationFromQR
);

// Initiate verification (manual entry with auto-lookup)
router.post(
  '/initiate',
  protect,
  paymentVerificationController.initiateVerification
);

// Confirm/approve verification
router.post(
  '/:id/confirm',
  protect,
  paymentVerificationController.confirmVerification
);

// Reject verification
router.post(
  '/:id/reject',
  protect,
  paymentVerificationController.rejectVerification
);

// List verifications
router.get(
  '/',
  protect,
  paymentVerificationController.listVerifications
);

// Get single verification
router.get(
  '/:id',
  protect,
  paymentVerificationController.getVerification
);

module.exports = router;
