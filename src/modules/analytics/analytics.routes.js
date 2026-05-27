/**
 * @file src/modules/analytics/analytics.routes.js
 * @description Merchant analytics — dashboard stats and direct messaging.
 *
 * All routes require JWT auth + task RBAC.
 *
 * Middleware pipeline:
 *   protect → restrictTo() → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const analyticsController     = require('./analytics.controller');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

router.get('/dashboard',   analyticsController.getDashboard);
router.post('/messages',   analyticsController.sendDirectMessage);

module.exports = router;
