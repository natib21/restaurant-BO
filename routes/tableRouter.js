// routes/tableRoutes.js
const express = require('express');
const tableController = require('../controllers/tableController');
const authController = require('../controllers/authController'); // your protect + restrictTo

const router = express.Router();

// ====================================================================
// PROTECT ALL TABLE ROUTES – Only logged-in authenticated users
// ====================================================================
router.use(authController.protect);
router.use(authController.restrictTo()); // Adjust roles as needed

// ====================================================================
// MAIN TABLE ROUTES
// ====================================================================

// Change table (transfer orders)
router.route('/change').post(tableController.changeTable);

// List & Create tables
router
  .route('/')
  .get(tableController.getAllTables) // GET    /api/v1/tables
  .post(tableController.createTable); // POST   /api/v1/tables → creates table + secure QR

// Individual table operations
router
  .route('/:id')
  .get(tableController.getTable) // GET    /api/v1/tables/:id
  .patch(tableController.updateTable) // PATCH  /api/v1/tables/:id → updates + auto-regenerates QR
  .delete(tableController.deleteTable); // DELETE /api/v1/tables/:id (soft delete)

// ====================================================================
// NEW: Dedicated endpoint to REGENERATE QR CODE for existing table
// ====================================================================
// POST /api/v1/tables/:id/regenerate-qr
// Useful for: refreshing QR, new print batch, security rotation
router.route('/:id/regenerate-qr').post(tableController.regenerateQR);

router.route('/branch/:id').get(tableController.getTablesByBranch);
// Optional bonus: Download QR as PNG (great for printing)
// GET /api/v1/tables/:id/qrcode → returns image
// router.get('/:id/qrcode', tableController.downloadQRImage);

module.exports = router;
