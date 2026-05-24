const express = require('express');
const authController = require('../../../controllers/authController');
const branchController = require('./controller/branch.controller');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo());

router.patch('/:id/suspend', requireCapability(CAPABILITIES.BRANCH_MANAGE), branchController.suspendBranch);
router.patch('/:id/activate', requireCapability(CAPABILITIES.BRANCH_MANAGE), branchController.activateBranch);
router.patch('/:id/features', requireCapability(CAPABILITIES.BRANCH_MANAGE), branchController.setFeatures);
router.post(
  '/:id/menu-groups',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  branchController.assignMenuGroup
);
router.get('/:id/staff', requireCapability(CAPABILITIES.BRANCH_MANAGE), branchController.listStaff);

module.exports = router;
