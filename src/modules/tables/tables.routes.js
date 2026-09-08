/**
 * @file src/modules/tables/tables.routes.js
 * @description Table CRUD + QR management + status transitions.
 *
 * All routes require JWT auth + task RBAC.
 *
 * Middleware pipeline:
 *   protect → restrictTo() → [requireCapability] → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');
const tableController = require('../branch/controller/table.controller');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.post('/change', tableController.changeTable);

router.route('/').get(tableController.getAllTables).post(tableController.createTable);

router
  .route('/:id')
  .get(tableController.getTable)
  .patch(tableController.updateTable)
  .delete(tableController.deleteTable);

// ── QR & Status (capability-gated) ────────────────────────────────────────────
router.post(
  '/:id/regenerate-qr',
  requireCapability(CAPABILITIES.TABLE_MANAGE),
  tableController.regenerateQr
);

router.patch(
  '/:id/status',
  requireCapability(CAPABILITIES.TABLE_MANAGE),
  tableController.transitionStatus
);

// ── Branch-scoped list ────────────────────────────────────────────────────────
router.get('/branch/:id', tableController.getTablesByBranch);

module.exports = router;
