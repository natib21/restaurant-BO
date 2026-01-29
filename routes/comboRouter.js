const express = require('express');
const comboController = require('../controllers/comboController');
const authController = require('../controllers/authController');

const router = express.Router({ mergeParams: true });

// ====================== PUBLIC ======================
router.get('/active', comboController.getActiveCombos);

// ====================== PROTECTED ======================
router.use(authController.protect, authController.restrictTo());

// ====================== COMBO CRUD ======================
router
  .route('/')
  .get(comboController.getAllCombos)
  .post(
    comboController.uploadComboPhoto,
    comboController.resizeComboPhoto,
    comboController.createCombo
  );

router
  .route('/:id')
  .get(authController.restrictTo(), comboController.getCombo)
  .patch(
    comboController.uploadComboPhoto,
    comboController.resizeComboPhoto,
    comboController.updateCombo
  )
  .delete(authController.restrictTo(), comboController.deleteCombo);

// ====================== STATE TOGGLES ======================
router.patch('/:id/toggle-active', authController.restrictTo(), comboController.toggleComboActive);

router.patch(
  '/:comboId/branch-toggle',
  authController.restrictTo(),
  comboController.toggleBranchActive
);

// ====================== BRANCH OVERRIDES ======================
router.patch(
  '/:comboId/branch-override',
  authController.restrictTo(),
  comboController.updateBranchOverride
);

// ====================== INTERNAL ======================
router.post('/increment-sold', authController.restrictTo(), comboController.incrementComboSold);

module.exports = router;
