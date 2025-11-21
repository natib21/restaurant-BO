
const express = require('express');
const comboController = require('../controllers/comboController');
const authController = require('../controllers/authController');

const router = express.Router({ mergeParams: true }); // Important if nested

// ====================== PUBLIC / CUSTOMER ROUTES ======================
// Anyone can view active combos (no auth needed for customer view)
router
  .route('/active/:id') // :id = merchantId (for public menu)
  .get(comboController.getActiveCombos);

// If you want public access without merchantId in params (optional)
// router.route('/active').get(comboController.getActiveCombos);

// ====================== PROTECT ALL BELOW ======================
router.use(authController.protect,authController.restrictTo()); // ← Login required from here

// ====================== MERCHANT ADMIN ROUTES ======================
router
  .route('/')
  .get(comboController.getAllCombos)        // Admin: See all combos (active + inactive)
  .post(comboController.createCombo);       // Create new combo

router
  .route('/:id')
  .get(comboController.getCombo)            // Get single combo (for editing)
  .patch(comboController.updateCombo)       // Update combo
  .delete(comboController.deleteCombo);     // Delete combo

// ====================== ORDER WEBHOOK (Protected but accessible by order service) ======================
// Only authenticated services/users can increment sold count
router
  .route('/increment-sold')
  .post(comboController.incrementComboSold);

module.exports = router;