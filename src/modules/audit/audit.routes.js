// src/modules/audit/audit.routes.js
// ✅ PHASE 2 - STEP 2: Audit Log Query Routes
const express = require('express');
const auditController = require('./controllers/audit.controller');
const { protect, restrictTo } = require('../../common/guards/auth.guard');

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * GET /api/v1/audit-logs/stats
 * Get aggregated audit statistics
 * Access: Requires RBAC task audit.logs.stats
 */
router.get('/stats', restrictTo(), auditController.getAuditStats);

/**
 * GET /api/v1/audit-logs/export
 * Export audit logs to CSV
 * Access: Requires RBAC task audit.logs.export
 */
router.get('/export', restrictTo(), auditController.exportAuditLogs);

/**
 * GET /api/v1/audit-logs/correlation/:correlationId
 * Get correlated logs (trace related operations)
 * Access: Requires RBAC task audit.logs.correlation
 */
router.get('/correlation/:correlationId', restrictTo(), auditController.getCorrelatedLogs);

/**
 * GET /api/v1/audit-logs/resource/:resource/:id
 * Get audit history for specific resource
 * Access: Requires RBAC task audit.logs.resource-history
 */
router.get('/resource/:resource/:id', restrictTo(), auditController.getResourceHistory);

/**
 * GET /api/v1/audit-logs/:id
 * Get single audit log details
 * Access: Requires RBAC task audit.logs.view
 */
router.get('/:id', restrictTo(), auditController.getAuditLog);

/**
 * GET /api/v1/audit-logs
 * Query audit logs with filters
 * Access: Requires RBAC task audit.logs.list
 */
router.get('/', restrictTo(), auditController.queryAuditLogs);

module.exports = router;
