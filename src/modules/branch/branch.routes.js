const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const branchController = require('./controller/branch.controller');
const diningSessionController = require('../sessions/dining-session.controller');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

router.patch(
  '/:id/suspend',
  requireCapability(CAPABILITIES.BRANCH_MANAGE),
  branchController.suspendBranch
);
router.patch(
  '/:id/activate',
  requireCapability(CAPABILITIES.BRANCH_MANAGE),
  branchController.activateBranch
);
router.patch(
  '/:id/features',
  requireCapability(CAPABILITIES.BRANCH_MANAGE),
  branchController.setFeatures
);
router.post(
  '/:id/menu-groups',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  branchController.assignMenuGroup
);
router.get(
  '/:id/staff', 
  requireCapability(CAPABILITIES.BRANCH_MANAGE), 
  branchController.listStaff
);

// ── Dining Sessions (Staff Dashboard) ────────────────────────────────────────
router.get(
  '/:branchId/active-sessions',
  requireCapability(CAPABILITIES.ORDER_VIEW),
  diningSessionController.getActiveSessions
);

// ── Table Health Check (Staff Dashboard) ──────────────────────────────────────
// Check for stuck tables (occupied but order is paid+completed)
router.get(
  '/health/stuck-tables',
  requireCapability(CAPABILITIES.ORDER_VIEW),
  branchController.checkStuckTables
);

module.exports = router;
