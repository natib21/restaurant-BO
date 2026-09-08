// src/modules/audit/service/audit.service.js
// ✅ PHASE 2 - STEP 2: Audit Log Query Service
const AuditLog = require('../../../../models/auditLogModel');
const AppError = require('../../../../utils/appError');

class AuditService {
  /**
   * Query audit logs with filters and pagination
   * Enforces tenant isolation via merchant filter
   */
  static async queryLogs({
    merchantId,
    branchId,
    userId,
    resource,
    action,
    severity,
    outcome,
    startDate,
    endDate,
    correlationId,
    page = 1,
    limit = 50,
    sortBy = '-createdAt',
  }) {
    // Build query with CRITICAL tenant isolation
    const query = { merchant: merchantId };

    // Optional filters
    if (branchId) query.branch = branchId;
    if (userId) query.user = userId;
    if (resource) query.resource = resource;
    if (action) query.action = action;
    if (severity) query.severity = severity;
    if (outcome) query.outcome = outcome;
    if (correlationId) query.correlationId = correlationId;

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Pagination
    const skip = (page - 1) * limit;
    const maxLimit = 100; // Prevent excessive queries
    const safeLimit = Math.min(limit, maxLimit);

    // Execute query with population
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('user', 'name email')
        .populate('merchant', 'businessName')
        .populate('branch', 'name')
        .sort(sortBy)
        .skip(skip)
        .limit(safeLimit)
        .lean(),

      AuditLog.countDocuments(query),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    };
  }

  /**
   * Get single audit log with full details
   * Enforces tenant isolation
   */
  static async getLogById(logId, merchantId) {
    const log = await AuditLog.findOne({
      _id: logId,
      merchant: merchantId, // CRITICAL: Tenant isolation
    })
      .populate('user', 'name email role')
      .populate('merchant', 'businessName')
      .populate('branch', 'name')
      .lean();

    if (!log) {
      throw new AppError('Audit log not found', 404);
    }

    return log;
  }

  /**
   * Get audit trail for a specific resource
   * Returns chronological history of all operations on a resource
   */
  static async getResourceHistory(resourceType, resourceId, merchantId) {
    const logs = await AuditLog.find({
      merchant: merchantId,
      resource: resourceType,
      resourceId,
    })
      .populate('user', 'name email')
      .sort('-createdAt') // Most recent first
      .lean();

    return logs;
  }

  /**
   * Get correlated logs (trace related operations)
   * Useful for tracing: order → payment → email → ticket
   */
  static async getCorrelatedLogs(correlationId, merchantId) {
    const logs = await AuditLog.find({
      merchant: merchantId,
      correlationId,
    })
      .populate('user', 'name email')
      .sort('createdAt') // Chronological order for tracing
      .lean();

    return logs;
  }

  /**
   * Export logs to CSV format
   * Limited to 10,000 rows to prevent memory issues
   */
  static async exportLogsToCSV(filters, merchantId) {
    const { logs } = await this.queryLogs({
      ...filters,
      merchantId,
      limit: 10000, // Max export size
      page: 1,
    });

    // Convert to CSV format
    const csv = this._convertToCSV(logs);
    return csv;
  }

  /**
   * Convert audit logs to CSV format
   * @private
   */
  static _convertToCSV(logs) {
    const headers = [
      'Timestamp',
      'User',
      'Action',
      'Resource',
      'Resource ID',
      'Severity',
      'Outcome',
      'IP Address',
      'Method',
      'Endpoint',
      'Status Code',
      'Duration (ms)',
      'Details',
    ];

    const rows = logs.map(log => [
      log.createdAt ? new Date(log.createdAt).toISOString() : '',
      log.user?.name || 'System',
      log.action || '',
      log.resource || '',
      log.resourceId || '',
      log.severity || '',
      log.outcome || '',
      log.ip || '',
      log.method || '',
      log.endpoint || '',
      log.statusCode || '',
      log.duration || '',
      JSON.stringify(log.metadata || {}),
    ]);

    // Escape CSV values (handle quotes and commas)
    const escapeCsvValue = value => {
      const str = String(value);
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    return [
      headers.map(escapeCsvValue).join(','),
      ...rows.map(row => row.map(escapeCsvValue).join(',')),
    ].join('\n');
  }

  /**
   * Get aggregated stats for dashboard
   * Returns severity distribution, action counts, etc.
   */
  static async getAuditStats(merchantId, startDate, endDate) {
    const matchStage = { merchant: merchantId };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const [severityStats, actionStats, outcomeStats, totalCount] = await Promise.all([
      // Severity distribution
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Top actions
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Outcome distribution
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
      ]),

      // Total count
      AuditLog.countDocuments(matchStage),
    ]);

    return {
      totalLogs: totalCount,
      bySeverity: severityStats.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {}),
      byAction: actionStats.map(item => ({
        action: item._id,
        count: item.count,
      })),
      byOutcome: outcomeStats.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {}),
    };
  }
}

module.exports = AuditService;
