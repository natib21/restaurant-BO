/**
 * @file src/modules/menu/combos.routes.js
 * @description Combo meal management — CRUD, branch toggles, overrides.
 *
 * Public  : GET /active (no auth — customer-facing)
 * Protected: all others (protect + restrictTo)
 *
 * Middleware pipeline (protected):
 *   protect → restrictTo() → [upload] → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../../common/guards/auth.guard');
const comboController = require('../controller/combo.controller');

const router = express.Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/active', comboController.getActiveCombos);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect);
router.use(restrictTo());

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
  .get(comboController.getCombo)
  .patch(
    comboController.uploadComboPhoto,
    comboController.resizeComboPhoto,
    comboController.updateCombo
  )
  .delete(comboController.deleteCombo);

router.patch('/:id/toggle-active', comboController.toggleComboActive);
router.patch('/:comboId/branch-toggle', comboController.toggleBranchActive);
router.patch('/:comboId/branch-override', comboController.updateBranchOverride);

// Internal (service-to-service, still RBAC protected)
router.post('/increment-sold', comboController.incrementComboSold);

module.exports = router;
