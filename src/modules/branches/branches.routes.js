/**
 * @file src/modules/branches/branches.routes.js
 * @description Branch CRUD + lifecycle management (suspend/activate/features).
 *
 * Public  : GET /nearby, GET /:id
 * Protected: all others (protect + restrictTo)
 *
 * Middleware pipeline:
 *   [protect → restrictTo()] → [requireCapability] → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');
const branchController = require('../branch/controller/branch.controller');

const router = express.Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/nearby', branchController.getNearbyBranches);
router.get('/:id', branchController.getBranch);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect);
router.use(restrictTo());

router.route('/').get(branchController.getAllBranches).post(branchController.createBranch);

router.route('/:id').patch(branchController.updateBranch).delete(branchController.deleteBranch);

router.patch('/:id/regenerate-qr', branchController.regenerateQRCodes);

// ── Business-layer lifecycle (capability-gated) ───────────────────────────────
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

// ── Branch-scoped sub-resources ───────────────────────────────────────────────
router.post(
  '/:id/menu-groups',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  branchController.assignMenuGroup
);
router.get('/:id/staff', requireCapability(CAPABILITIES.BRANCH_MANAGE), branchController.listStaff);

module.exports = router;
