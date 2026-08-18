// models/auditLogModel.js
// ✅ PHASE 2: Enhanced schema with tenant isolation, correlation tracking, severity classification
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: function() {
        // Allow null for system-level ops (login failures, health checks, cron jobs)
        return !['LOGIN', 'LOGOUT', 'HEALTH_CHECK', 'BACKUP_CREATED'].includes(this.action);
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Tenant Isolation (CRITICAL)
    // ══════════════════════════════════════════════════════════════════════════
    merchant: {
      type: mongoose.Schema.ObjectId,
      ref: 'Merchant',
      index: true,
      required: function() {
        // Allow null for system-level ops
        return !['LOGIN', 'LOGOUT', 'HEALTH_CHECK'].includes(this.action);
      },
    },

    branch: {
      type: mongoose.Schema.ObjectId,
      ref: 'Branch',
      index: true,
      // Optional — branch-level filtering for reports
    },

    action: {
      type: String,
      required: true,
      enum: [
        // CRUD Operations
        'CREATE',
        'READ',
        'UPDATE',
        'DELETE',

        // Auth Events
        'LOGIN',
        'LOGOUT',
        'PASSWORD_CHANGE',
        'TOKEN_REFRESH',

        // Order Operations
        'ORDER_STATUS_CHANGE',
        'ORDER_CANCEL',
        'PAYMENT_RECEIVED',
        'REFUND_ISSUED',

        // Kitchen Operations
        'TICKET_CREATED',
        'TICKET_STATUS_CHANGE',
        'TICKET_ASSIGNED',

        // Inventory
        'INVENTORY_ADJUST',
        'INVENTORY_BATCH_ADJUST',
        'STOCK_ALERT',

        // User Management
        'ROLE_ASSIGN',
        'ROLE_REVOKE',
        'TASK_ASSIGN',
        'USER_SUSPEND',
        'USER_ACTIVATE',

        // Merchant/Branch
        'MERCHANT_APPROVE',
        'MERCHANT_SUSPEND',
        'BRANCH_CREATE',
        'BRANCH_SUSPEND',

        // Menu
        'MENU_PUBLISH',
        'MENU_UNPUBLISH',
        'PRICE_CHANGE',

        // Reports & Exports
        'REPORT_ACCESS',
        'REPORT_EXPORT',

        // System
        'BACKUP_CREATED',
        'HEALTH_CHECK',

        // Legacy (keeping for backward compatibility)
        'TASK_CREATE',
      ],
    },

    resource: {
      type: String,
      required: true, // e.g., 'Task', 'User', 'Merchant', 'Order'
    },

    resourceId: {
      type: mongoose.Schema.ObjectId,
      default: null,
    },

    method: {
      type: String,
      enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
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

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Correlation & Tracing
    // ══════════════════════════════════════════════════════════════════════════
    correlationId: {
      type: String,
      index: true,
      trim: true,
      // Trace related operations (order → payment → email → ticket)
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Structured Change Tracking
    // ══════════════════════════════════════════════════════════════════════════
    changes: [
      {
        field: {
          type: String,
          required: true,
        },
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
      },
    ],

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Risk Classification
    // ══════════════════════════════════════════════════════════════════════════
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
      index: true,
    },

    outcome: {
      type: String,
      enum: ['success', 'failure', 'partial'],
      default: 'success',
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Performance Tracking
    // ══════════════════════════════════════════════════════════════════════════
    duration: {
      type: Number, // milliseconds
      min: 0,
    },

    // ══════════════════════════════════════════════════════════════════════════
    // Request Context
    // ══════════════════════════════════════════════════════════════════════════
    ip: String,
    userAgent: String,

    // ══════════════════════════════════════════════════════════════════════════
    // Legacy Fields (Keep for backward compatibility)
    // ══════════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════════
// PHASE 2: Enhanced Indexes for Query Performance
// ══════════════════════════════════════════════════════════════════════════

// Legacy indexes (keep)
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resource: 1 });

// CRITICAL: Tenant isolation
auditLogSchema.index({ merchant: 1, createdAt: -1 });
auditLogSchema.index({ merchant: 1, resource: 1, action: 1, createdAt: -1 });

// Correlation tracking
auditLogSchema.index({ correlationId: 1 });

// Severity-based queries (for alerts/monitoring)
auditLogSchema.index({ severity: 1, createdAt: -1 });

// User activity tracking per merchant
auditLogSchema.index({ merchant: 1, user: 1, createdAt: -1 });

// Resource history tracking
auditLogSchema.index({ merchant: 1, resource: 1, resourceId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
