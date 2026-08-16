// models/auditLogModel.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'CREATE',
        'READ',
        'UPDATE',
        'DELETE',
        'LOGIN',
        'LOGOUT',
        'PASSWORD_CHANGE',
        'TASK_CREATE',
        'ROLE_ASSIGN',
        'REPORT_ACCESS',
        'REPORT_EXPORT',
      ],
    },
    resource: {
      type: String,
      required: true, // e.g., 'Task', 'User', 'Merchant'
    },
    resourceId: {
      type: mongoose.Schema.ObjectId,
      default: null,
    },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PATCH', 'DELETE'],
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    statusCode: {
      type: Number,
      required: true,
    },
    ip: String,
    userAgent: String,
    oldValues: mongoose.Schema.Types.Mixed,
    newValues: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for fast queries
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resource: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
