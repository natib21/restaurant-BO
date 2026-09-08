const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const tableController = require('./table.controller');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

router.post(
  '/:id/close',
  requireCapability(CAPABILITIES.TABLE_MANAGE),
  tableController.closeTable
);

router.post(
  '/:id/qr/regenerate',
  requireCapability(CAPABILITIES.TABLE_MANAGE),
  tableController.regenerateQr
);
router.patch(
  '/:id/status',
  requireCapability(CAPABILITIES.TABLE_MANAGE),
  tableController.transitionStatus
);

module.exports = router;
