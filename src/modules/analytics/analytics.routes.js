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
const { requireFeature } = require('../../common/guards/feature.guard'); // ← was subscriptions/middleware/feature-access.middleware

const analyticsController = require('./analytics.controller');

const featureMiddleware =
  process.env.NODE_ENV === 'development' ? (req, res, next) => next() : requireFeature('reports');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

router.get('/dashboard', featureMiddleware, analyticsController.getDashboard);
router.post('/messages', featureMiddleware, analyticsController.sendDirectMessage);

module.exports = router;
