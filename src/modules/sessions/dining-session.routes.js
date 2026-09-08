/**
 * Dining Session Routes
 * 
 * Routes for managing dining sessions (staff dashboard).
 * All routes require authentication and appropriate capabilities.
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');
const diningSessionController = require('./dining-session.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(restrictTo());

// ── Get session summary (staff views session details) ────────────────────────
router.get(
  '/:sessionId/summary',
  requireCapability(CAPABILITIES.ORDER_VIEW),
  diningSessionController.getSessionSummary
);

// ── Get session orders (staff views orders in session) ───────────────────────
router.get(
  '/:sessionId/orders',
  requireCapability(CAPABILITIES.ORDER_VIEW),
  diningSessionController.getSessionOrders
);

// ── Close dining session (staff closes table) ──────────────────────────────────
// SECURITY FIX: Explicitly close sessions to prevent fixation
router.post(
  '/:sessionId/close',
  requireCapability(CAPABILITIES.ORDER_MANAGE),
  diningSessionController.closeSession
);

module.exports = router;
