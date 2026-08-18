// src/modules/audit/controllers/audit.controller.js
// ✅ PHASE 2 - STEP 2: Audit Log Query Controller
const AuditService = require('../service/audit.service');
const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');

/**
 * GET /api/v1/audit-logs
 * Query audit logs with filters and pagination
 * Access: admin, superAdmin
 */
exports.queryAuditLogs = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant?._id || req.user.merchant;

  // Super admin can query any merchant
  let queryMerchantId = merchantId;
  if (req.user.role?.isSystemRole && req.query.merchantId) {
    queryMerchantId = req.query.merchantId;
  }

  if (!queryMerchantId) {
    return next(new AppError('Merchant context required', 400));
  }

  const {
    branchId,
    userId,
    resource,
    action,
    severity,
    outcome,
    startDate,
    endDate,
    correlationId,
    page,
    limit,
    sortBy,
  } = req.query;

  const result = await AuditService.queryLogs({
    merchantId: queryMerchantId,
    branchId,
    userId,
    resource,
    action,
    severity,
    outcome,
    startDate,
    endDate,
    correlationId,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50,
    sortBy,
  });

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

/**
 * GET /api/v1/audit-logs/:id
 * Get single audit log with full details
 * Access: admin, superAdmin
 */
exports.getAuditLog = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const merchantId = req.user.merchant?._id || req.user.merchant;

  if (!merchantId) {
    return next(new AppError('Merchant context required', 400));
  }

  const log = await AuditService.getLogById(id, merchantId);

  res.status(200).json({
    status: 'success',
    data: { log },
  });
});

/**
 * GET /api/v1/audit-logs/resource/:resource/:id
 * Get audit history for a specific resource
 * Access: admin, superAdmin
 */
exports.getResourceHistory = catchAsync(async (req, res, next) => {
  const { resource, id } = req.params;
  const merchantId = req.user.merchant?._id || req.user.merchant;

  if (!merchantId) {
    return next(new AppError('Merchant context required', 400));
  }

  const logs = await AuditService.getResourceHistory(resource, id, merchantId);

  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: { logs },
  });
});

/**
 * GET /api/v1/audit-logs/correlation/:correlationId
 * Get correlated logs (trace related operations)
 * Access: admin, superAdmin
 */
exports.getCorrelatedLogs = catchAsync(async (req, res, next) => {
  const { correlationId } = req.params;
  const merchantId = req.user.merchant?._id || req.user.merchant;

  if (!merchantId) {
    return next(new AppError('Merchant context required', 400));
  }

  const logs = await AuditService.getCorrelatedLogs(correlationId, merchantId);

  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: { logs },
  });
});

/**
 * GET /api/v1/audit-logs/export
 * Export audit logs to CSV
 * Access: admin, superAdmin
 */
exports.exportAuditLogs = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant?._id || req.user.merchant;

  if (!merchantId) {
    return next(new AppError('Merchant context required', 400));
  }

  const csv = await AuditService.exportLogsToCSV(req.query, merchantId);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `audit-logs-${timestamp}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

/**
 * GET /api/v1/audit-logs/stats
 * Get aggregated audit statistics
 * Access: admin, superAdmin
 */
exports.getAuditStats = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant?._id || req.user.merchant;

  if (!merchantId) {
    return next(new AppError('Merchant context required', 400));
  }

  const { startDate, endDate } = req.query;

  const stats = await AuditService.getAuditStats(merchantId, startDate, endDate);

  res.status(200).json({
    status: 'success',
    data: { stats },
  });
});

module.exports = exports;
