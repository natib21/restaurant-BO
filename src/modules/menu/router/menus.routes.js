/**
 * @file src/modules/menu/menus.routes.js
 * @description Menu item CRUD + public browsing + publish lifecycle.
 *
 * Public (table session): GET /public, GET /public/*
 * Staff (JWT + RBAC)    : full CRUD, publish, archive
 *
 * Middleware pipeline (public):
 *   protectTableSession → handler
 *
 * Middleware pipeline (staff):
 *   protect → restrictTo() → [requireCapability] → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../../common/guards/auth.guard');
const { requireCapability } = require('../../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../../common/capabilities/capabilities');
const { protectTableSession } = require('../../customers/customer-session.guard');
const menuController = require('../controller/menu.controller');
const menuMgmtController = menuController; // same file handles both CRUD and publish lifecycle

const router = express.Router();

// ── 1. Public (table session) ─────────────────────────────────────────────────
router.get('/public', protectTableSession, menuController.getPublicMenu);
router.get(
  '/public/beverages',
  protectTableSession,
  menuController.getAllBeverage,
  menuController.getPublicMenu
);
router.get(
  '/public/drinks',
  protectTableSession,
  menuController.getAllBeverage,
  menuController.getPublicMenu
);
router.get(
  '/public/food',
  protectTableSession,
  menuController.getFoodOnly,
  menuController.getPublicMenu
);

// ── 2. Staff (JWT + RBAC) ─────────────────────────────────────────────────────
router.use(protect);
router.use(restrictTo());

router.get('/staff', menuController.getStaffMenu);

router.route('/').get(menuController.getAllMenu).post(
  menuController.uploadMenuPhoto, // Single or multiple images
  menuController.resizeAndProcessImages, // Saves as FileAsset (ObjectId)
  menuController.createNewMenu
);

router.patch('/:id/toggle-availability', menuController.toggleMenuItemAvailability);

// ── 3. Publish lifecycle (capability-gated) ───────────────────────────────────
router.post(
  '/publish',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  menuMgmtController.publishMenuGroup
);

router.patch(
  '/:id/archive',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  menuMgmtController.archiveMenuItem
);

router.get(
  '/publications/branch/:branchId',
  requireCapability(CAPABILITIES.MENU_MANAGE),
  menuMgmtController.getBranchPublications
);

router
  .route('/:id')
  .get(menuController.getMenu)
  .patch(
    menuController.uploadMenuPhoto,
    menuController.resizeAndProcessImages,  // ✅ Consistent with CREATE
    menuController.updateMenu
  )
  .delete(menuController.deleteMenu);

module.exports = router;
