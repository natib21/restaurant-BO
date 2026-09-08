/**
 * @file src/modules/monitoring/monitoring.routes.js
 * @description Monitoring and metrics endpoints
 */

const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const {
  metricsEndpoint,
  prometheusMetricsEndpoint,
} = require('../../common/middleware/metrics.middleware');
const BusinessMetricsService = require('./business-metrics.service');
const catchAsync = require('../../../utils/catchAsync');

/**
 * GET /api/v1/monitoring/metrics
 * @description System performance metrics (JSON)
 * @access Protected - Admin only
 */
router.get(
  '/metrics',
  protect,
  restrictTo('admin'),
  metricsEndpoint
);

/**
 * GET /api/v1/monitoring/metrics/prometheus
 * @description Prometheus-compatible metrics (text format)
 * @access Public (can be restricted via API key or IP whitelist in production)
 */
router.get('/metrics/prometheus', prometheusMetricsEndpoint);

/**
 * GET /api/v1/monitoring/dashboard
 * @description Business dashboard metrics for merchant
 * @access Protected - Merchant/Admin
 */
router.get(
  '/dashboard',
  protect,
  catchAsync(async (req, res) => {
    const merchantId = req.user.merchant._id || req.user.merchant;
    const branchId = req.query.branchId || null;

    const metrics = await BusinessMetricsService.getDashboardMetrics(
      merchantId,
      branchId
    );

    res.status(200).json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * GET /api/v1/monitoring/platform
 * @description Platform-wide metrics
 * @access Protected - Admin only
 */
router.get(
  '/platform',
  protect,
  restrictTo('admin'),
  catchAsync(async (req, res) => {
    const metrics = await BusinessMetricsService.getPlatformMetrics();

    res.status(200).json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * GET /api/v1/monitoring/performance
 * @description Performance metrics for date range
 * @access Protected - Merchant/Admin
 * @query startDate - ISO date string
 * @query endDate - ISO date string
 */
router.get(
  '/performance',
  protect,
  catchAsync(async (req, res) => {
    const merchantId = req.user.merchant._id || req.user.merchant;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    const metrics = await BusinessMetricsService.getPerformanceMetrics(
      merchantId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * GET /api/v1/monitoring/alerts
 * @description Get business alerts
 * @access Protected - Merchant/Admin
 */
router.get(
  '/alerts',
  protect,
  catchAsync(async (req, res) => {
    const merchantId = req.user.merchant._id || req.user.merchant;

    const alerts = await BusinessMetricsService.getAlerts(merchantId);

    res.status(200).json({
      success: true,
      data: alerts,
    });
  })
);

module.exports = router;
