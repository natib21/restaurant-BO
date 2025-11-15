// utils/auditLogger.js
const AuditLog = require('../models/auditLogModel');

const auditLogger = async ({
  user,
  action,
  resource,
  resourceId = null,
  method,
  endpoint,
  statusCode,
  oldValues = null,
  newValues = null,
  metadata = {},
  req,
}) => {
  try {
    await AuditLog.create({
      user: user._id,
      action,
      resource,
      resourceId,
      method,
      endpoint,
      statusCode,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      oldValues,
      newValues,
      metadata,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
    // Don't crash the app
  }
};

module.exports = auditLogger;
