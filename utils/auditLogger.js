// utils/auditLogger.js
// ✅ PHASE 2: Enhanced audit logger with tenant isolation, correlation, severity
const AuditLog = require('../models/auditLogModel');
const logger = require('./logger');

const auditLogger = async ({
  user,
  merchant,      // NEW: explicit merchant param
  branch,        // NEW: explicit branch param
  action,
  resource,
  resourceId = null,
  method,
  endpoint,
  statusCode,
  oldValues = null,
  newValues = null,
  changes = null,        // NEW: structured changes array
  severity = 'low',      // NEW: risk classification
  outcome = 'success',   // NEW: operation outcome
  correlationId = null,  // NEW: trace related operations
  duration = null,       // NEW: performance tracking
  metadata = {},
  req,
}) => {
  try {
    const { getRequestContext } = require('../src/common/middleware/request-context');

    // Fall back to async context if req not provided
    if (!req) {
      const context = getRequestContext();
      req = context?.req;
      user = user || context?.user;
    }

    // Extract merchant from user if not provided
    if (!merchant && user?.merchant) {
      merchant = user.merchant._id || user.merchant;
    }

    // Extract branch from user if not provided
    if (!branch && user?.branch) {
      branch = user.branch._id || user.branch;
    }

    // Extract correlationId from request headers if not provided
    if (!correlationId && req) {
      correlationId = 
        req.headers['x-correlation-id'] || 
        req.headers['x-request-id'] ||
        req.id;  // If using express-request-id middleware
    }

    // Calculate duration if available
    if (!duration && req?.startTime) {
      duration = Date.now() - req.startTime;
    }

    await AuditLog.create({
      user: user?._id || user || null,
      merchant,
      branch,
      action,
      resource,
      resourceId,
      method,
      endpoint,
      statusCode,
      correlationId,
      severity,
      outcome,
      duration,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent'),
      oldValues,
      newValues,
      changes,
      metadata,
    });
  } catch (err) {
    // ✅ PHASE 0: Structured error logging with severity
    logger.error('audit.write.failed', {
      error: err.message,
      stack: err.stack,
      userId: user?._id?.toString() || user?.toString(),
      action,
      resource,
      resourceId: resourceId?.toString(),
      endpoint,
      // Critical severity flag for monitoring/alerting integration
      severity: 'CRITICAL',
      impact: 'audit_trail_gap',
    });
    // Don't crash the app - audit failure shouldn't block business operations
  }
};

module.exports = auditLogger;
