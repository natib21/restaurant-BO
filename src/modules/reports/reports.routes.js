const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const { requireFeature } = require('../../common/guards/feature.guard');
const validate = require('../../common/middleware/validate.middleware');
const { reportQuerySchema, exportJobRequestSchema } = require('./validators/report.validators');
const { 
  getSalesReport, 
  getOrdersReport, 
  getProductsReport, 
  getCustomersReport, 
  getDeliveryReport, 
  getProfitabilityReport, 
  getStaffReport, 
  getInventoryReport,
  createExportJob,
  getExportJobStatus
} = require('./controller/report.controller');

const router = express.Router();

// ============================================================
// MIDDLEWARE CHAIN
// ============================================================

// Apply authentication and feature gating to all report routes
router.use(protect); // JWT authentication (existing)
router.use(requireFeature('reports')); // Subscription feature gate (existing)

// ============================================================
// REPORT ROUTES
// ============================================================

/**
 * GET /api/v1/reports/sales
 * 
 * Sales Report Endpoint - Revenue, discounts, taxes, delivery fees, AOV
 * 
 * Query Parameters:
 * - dateFrom: ISO date string (required)
 * - dateTo: ISO date string (required) 
 * - branchId: ObjectId string (optional)
 * - groupBy: 'day'|'week'|'month' (default: 'day')
 * - page: number (default: 1)
 * - limit: number (default: 50, max: 100)
 * - format: 'json'|'csv' (default: 'json')
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.7, 5.8, 14.1, 14.2, 14.3, 14.4
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.get('/sales',
  validate(reportQuerySchema, 'query'), // Zod validation (existing pattern)
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'), // Role authorization (existing)
  getSalesReport // Controller handler
);

/**
 * GET /api/v1/reports/orders
 * 
 * Order Analytics Report - Volume, timing metrics, cancellation rates
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.get('/orders',
  validate(reportQuerySchema, 'query'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  getOrdersReport // Controller handler
);

/**
 * GET /api/v1/reports/products
 * 
 * Product Performance Report - Top sellers, low performers, category breakdown
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.get('/products',
  validate(reportQuerySchema, 'query'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  getProductsReport // Controller handler
);

/**
 * GET /api/v1/reports/customers
 * 
 * Customer Analytics Report - New vs returning, spend distribution
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.get('/customers',
  validate(reportQuerySchema, 'query'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  getCustomersReport // Controller handler
);

/**
 * GET /api/v1/reports/delivery
 * 
 * Delivery Operations Report - Fees, duration, on-time delivery percentage
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.get('/delivery',
  validate(reportQuerySchema, 'query'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  getDeliveryReport // Controller handler
);

/**
 * GET /api/v1/reports/profitability
 * 
 * Profitability Report - COGS, gross profit, margins, low-margin items
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.get('/profitability',
  validate(reportQuerySchema, 'query'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  getProfitabilityReport // Controller handler
);

/**
 * GET /api/v1/reports/staff
 * 
 * Staff Performance Report - Order volume per staff, turnaround times
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.get('/staff',
  validate(reportQuerySchema, 'query'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  getStaffReport // Controller handler
);

/**
 * GET /api/v1/reports/inventory
 * 
 * Inventory Valuation Report - Stock valuation, low stock items, movements
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.get('/inventory',
  validate(reportQuerySchema, 'query'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  getInventoryReport // Controller handler
);

// ============================================================
// EXPORT JOB ROUTES
// ============================================================

/**
 * POST /api/v1/reports/exports
 * 
 * Create Export Job - Asynchronous export for large datasets
 * 
 * Request Body:
 * - reportType: string (required) - One of 8 report types
 * - dateFrom: ISO date string (required)
 * - dateTo: ISO date string (required)
 * - branchId: ObjectId string (optional)
 * - format: 'csv'|'xlsx'|'pdf' (default: 'csv')
 * 
 * Response: HTTP 202 Accepted
 * 
 * Requirements: 15.1, 15.2
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3
 */
router.post('/exports',
  validate(exportJobRequestSchema, 'body'),
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  createExportJob
);

/**
 * GET /api/v1/reports/exports/:jobId
 * 
 * Get Export Job Status - Check status of asynchronous export job
 * 
 * Response includes:
 * - jobId, status, reportType, format, dates, branchId
 * - fileId (if status='ready')
 * - errorMessage (if status='failed')
 * 
 * Requirements: 15.6
 * Security: 2.4, 2.5, 17.1, 17.2, 17.3, 17.4 (merchant scoping)
 */
router.get('/exports/:jobId',
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),
  getExportJobStatus
);

module.exports = router;
