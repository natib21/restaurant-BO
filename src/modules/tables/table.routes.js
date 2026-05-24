const express = require('express');
const authController = require('../../../controllers/authController');
const tableController = require('./table.controller');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo());

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
