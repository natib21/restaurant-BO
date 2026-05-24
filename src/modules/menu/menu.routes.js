const express = require('express');
const authController = require('../../../controllers/authController');
const menuController = require('./controller/menu.controller');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo());

router.post('/publish', requireCapability(CAPABILITIES.MENU_MANAGE), menuController.publishMenuGroup);
router.patch(
  '/items/:id/archive',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  menuController.archiveMenuItem
);
router.get(
  '/publications/branch/:branchId',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  menuController.getBranchPublications
);

module.exports = router;
