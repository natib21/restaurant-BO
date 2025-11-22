// routes/tableRoutes.js
const express = require('express');
const tableController = require('../controllers/tableController');
const authController = require('../controllers/authController'); // your protect + restrictTo

const router = express.Router();

// ====================================================================
// PROTECT ALL TABLE ROUTES – Only logged-in merchant admins/managers
// ====================================================================
router.use(authController.protect);
router.use(authController.restrictTo()); // adjust roles as needed

// ====================================================================
// MAIN TABLE ROUTES
// ====================================================================
router
  .route('/')
  .get(tableController.getAllTables)      // GET /api/v1/tables
  .post(tableController.createTable);     // POST /api/v1/tables → creates table + QR

router
  .route('/:id')
  .get(tableController.getTable)          // GET /api/v1/tables/66f9a1b2...
  .patch(tableController.updateTable)     // PATCH /api/v1/tables/66f9a1b2...
  .delete(tableController.deleteTable);   // DELETE /api/v1/tables/66f9a1b2... (soft delete)

// Optional: Add a route to download QR code as image (very useful for printing)
// router.get('/:id/qrcode', tableController.getTableQRCode);

module.exports = router;