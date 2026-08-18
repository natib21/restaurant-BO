# Phase 2: Global Audit Logging API — Implementation Plan

**Date:** August 17, 2026  
**Status:** 📋 PLANNING  
**Dependencies:** Phase 0 (auditPlugin, request-context) + Phase 1 (KDS complete)

---

## Overview

Phase 2 builds a **professional-grade audit logging query API** on top of the existing audit infrastructure from Phase 0/1.

### What Already Exists (Phase 0/1)

✅ **`utils/auditPlugin.js`** — Mongoose plugin for auto-audit CRUD  
✅ **`utils/auditLogger.js`** — Manual audit logging function  
✅ **`utils/request-context.js`** — AsyncLocalStorage for context propagation  
✅ **`models/auditLogModel.js`** — AuditLog schema (basic fields)  
✅ **Audit logging active in:** Reports module (explicit calls)

### What Phase 2 Adds

1. **Enhanced AuditLog Schema** (merchant, correlationId, severity, changes array)
2. **Audit Log Query API** (HTTP endpoints for viewing/exporting logs)
3. **Global Rollout** (apply auditPlugin to all models)
4. **Explicit High-Value Logging** (order transitions, payments, auth events)
5. **Retention Policy** (archive old logs)

---

## Goals

### Primary Objectives

1. **Complete Tenant Isolation** — Add `merchant` field to all audit logs
2. **Professional Query Interface** — Filterable, paginated audit log API
3. **Comprehensive Coverage** — Audit all CRUD operations across all models
4. **Rich Context for Critical Ops** — Detailed metadata for payments, order transitions, auth
5. **Compliance Ready** — Retention policy, export capability, immutability

### Non-Goals (Future Phases)

- ❌ Real-time audit log streaming (WebSocket)
- ❌ Advanced analytics dashboard (Phase 3)
- ❌ Log tampering detection (cryptographic signatures)
- ❌ External SIEM integration (Splunk, DataDog APM)

---

## Step-by-Step Implementation Plan

### Step 1: Enhance AuditLog Schema ✅ CRITICAL

**Goal:** Add missing fields for professional audit logging

#### 1.1 Schema Changes

**File:** `models/auditLogModel.js`

**Add Fields:**

```javascript
// CRITICAL: Tenant isolation
merchant: {
  type: mongoose.Schema.ObjectId,
  ref: 'Merchant',
  index: true,
  required: function() { 
    // Allow null for system-level ops (login, health checks)
    return !['LOGIN', 'LOGOUT', 'HEALTH_CHECK'].includes(this.action);
  }
},

branch: {
  type: mongoose.Schema.ObjectId,
  ref: 'Branch',
  index: true
  // Optional — branch-level filtering for reports
},

// Trace related operations (order → payment → email)
correlationId: {
  type: String,
  index: true,
  trim: true
},

// Structured change tracking (better than oldValues/newValues)
changes: [{
  field: { type: String, required: true },
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed
}],

// Risk classification
severity: {
  type: String,
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'low',
  index: true
},

// Operation outcome
outcome: {
  type: String,
  enum: ['success', 'failure', 'partial'],
  default: 'success'
},

// Performance tracking
duration: {
  type: Number,  // milliseconds
  min: 0
},

// Additional context (keep existing)
// oldValues, newValues, metadata remain for backward compatibility
```

**Add Indexes:**

```javascript
// Existing
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resource: 1 });

// NEW (CRITICAL)
auditLogSchema.index({ merchant: 1, createdAt: -1 });
auditLogSchema.index({ merchant: 1, resource: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ correlationId: 1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ merchant: 1, user: 1, createdAt: -1 });
```

**Expand Action Enum:**

```javascript
action: {
  type: String,
  required: true,
  enum: [
    // CRUD Operations
    'CREATE', 'READ', 'UPDATE', 'DELETE',
    
    // Auth Events
    'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'TOKEN_REFRESH',
    
    // Order Operations
    'ORDER_STATUS_CHANGE', 'ORDER_CANCEL', 'PAYMENT_RECEIVED', 'REFUND_ISSUED',
    
    // Kitchen Operations
    'TICKET_CREATED', 'TICKET_STATUS_CHANGE', 'TICKET_ASSIGNED',
    
    // Inventory
    'INVENTORY_ADJUST', 'INVENTORY_BATCH_ADJUST', 'STOCK_ALERT',
    
    // User Management
    'ROLE_ASSIGN', 'ROLE_REVOKE', 'TASK_ASSIGN', 'USER_SUSPEND', 'USER_ACTIVATE',
    
    // Merchant/Branch
    'MERCHANT_APPROVE', 'MERCHANT_SUSPEND', 'BRANCH_CREATE', 'BRANCH_SUSPEND',
    
    // Menu
    'MENU_PUBLISH', 'MENU_UNPUBLISH', 'PRICE_CHANGE',
    
    // Reports & Exports
    'REPORT_ACCESS', 'REPORT_EXPORT',
    
    // System
    'BACKUP_CREATED', 'HEALTH_CHECK'
  ]
}
```

#### 1.2 Migration Script

**File:** `scripts/migrate-audit-logs-add-merchant.js`

**Purpose:** Backfill `merchant` field in existing audit logs

```javascript
const mongoose = require('mongoose');
const AuditLog = require('../models/auditLogModel');
const User = require('../models/userModel');
const Order = require('../models/orderModel');
const { connectDB } = require('../config/database');

async function migrateAuditLogs() {
  await connectDB();
  
  console.log('Starting audit log migration...');
  
  const logsWithoutMerchant = await AuditLog.find({ merchant: null });
  console.log(`Found ${logsWithoutMerchant.length} logs without merchant field`);
  
  let updated = 0;
  let failed = 0;
  
  for (const log of logsWithoutMerchant) {
    try {
      let merchantId = null;
      
      // Strategy 1: Get from user
      if (log.user) {
        const user = await User.findById(log.user).select('merchant');
        merchantId = user?.merchant;
      }
      
      // Strategy 2: Get from resource (if Order, Merchant, Branch, etc.)
      if (!merchantId && log.resourceId) {
        if (log.resource === 'Order') {
          const order = await Order.findById(log.resourceId).select('merchant');
          merchantId = order?.merchant;
        }
        // Add other resource types as needed
      }
      
      if (merchantId) {
        await AuditLog.updateOne(
          { _id: log._id },
          { $set: { merchant: merchantId } }
        );
        updated++;
      } else {
        console.warn(`Could not determine merchant for log ${log._id}`);
        failed++;
      }
      
    } catch (error) {
      console.error(`Error processing log ${log._id}:`, error.message);
      failed++;
    }
  }
  
  console.log(`Migration complete: ${updated} updated, ${failed} failed`);
  process.exit(0);
}

migrateAuditLogs();
```

**Run Migration:**

```bash
node scripts/migrate-audit-logs-add-merchant.js
```

#### 1.3 Update auditLogger Utility

**File:** `utils/auditLogger.js`

**Changes:**

```javascript
const auditLogger = async ({
  user,
  merchant,  // NEW: explicit merchant param
  branch,    // NEW: explicit branch param
  action,
  resource,
  resourceId = null,
  method,
  endpoint,
  statusCode,
  oldValues = null,
  newValues = null,
  changes = null,  // NEW: structured changes array
  severity = 'low',  // NEW
  outcome = 'success',  // NEW
  correlationId = null,  // NEW
  duration = null,  // NEW
  metadata = {},
  req
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
    
    // Extract correlationId from request
    if (!correlationId && req) {
      correlationId = req.headers['x-correlation-id'] || 
                      req.headers['x-request-id'] ||
                      req.id;  // If using express-request-id middleware
    }
    
    // Calculate duration if available
    if (!duration && req?.startTime) {
      duration = Date.now() - req.startTime;
    }
    
    await AuditLog.create({
      user: user?._id || user,
      merchant,
      branch,
      action,
      resource,
      resourceId,
      method,
      endpoint,
      statusCode,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent'),
      oldValues,
      newValues,
      changes,
      severity,
      outcome,
      correlationId,
      duration,
      metadata
    });
    
  } catch (err) {
    console.error('Audit log failed:', err.message);
    // Non-blocking — don't crash application
  }
};

module.exports = auditLogger;
```

#### 1.4 Update auditPlugin

**File:** `utils/auditPlugin.js`

**Changes:**

```javascript
// Add merchant/branch extraction
const merchant = this.merchant || this.constructor.schema.paths.merchant?.instance;
const branch = this.branch || this.constructor.schema.paths.branch?.instance;

// Generate structured changes array
const changes = [];
if (Array.isArray(modifiedPaths)) {
  modifiedPaths.forEach(path => {
    if (options.auditedFields.includes(path)) {
      changes.push({
        field: path,
        oldValue: originalDoc?.[path],
        newValue: this[path]
      });
    }
  });
}

// Auto-determine severity
const severity = determineSeverity(resource, action, modifiedPaths);

// Call auditLogger with new fields
await auditLogger({
  user,
  merchant,
  branch,
  action,
  resource,
  resourceId: this._id,
  changes,
  severity,
  // ... rest of fields
});
```

**Add Severity Auto-Classification:**

```javascript
function determineSeverity(resource, action, modifiedFields = []) {
  // CRITICAL: Financial operations, auth changes, role assignments
  if (
    resource === 'Payment' ||
    resource === 'Refund' ||
    (resource === 'Order' && modifiedFields.includes('isPaid')) ||
    (resource === 'User' && modifiedFields.includes('role')) ||
    action === 'MERCHANT_SUSPEND' ||
    action === 'PASSWORD_CHANGE'
  ) {
    return 'critical';
  }
  
  // HIGH: Order status changes, inventory adjustments, merchant operations
  if (
    (resource === 'Order' && modifiedFields.includes('status')) ||
    resource === 'Inventory' ||
    resource === 'Merchant' ||
    action === 'ORDER_CANCEL'
  ) {
    return 'high';
  }
  
  // MEDIUM: Menu updates, user updates, branch operations
  if (
    resource === 'Menu' ||
    resource === 'User' ||
    resource === 'Branch'
  ) {
    return 'medium';
  }
  
  // LOW: Everything else
  return 'low';
}
```

---

### Step 2: Create Audit Log Query API

**Goal:** HTTP endpoints for querying and exporting audit logs

#### 2.1 Audit Service

**File:** `src/modules/audit/service/audit.service.js`

```javascript
const AuditLog = require('../../../../models/auditLogModel');
const AppError = require('../../../../utils/appError');

class AuditService {
  /**
   * Query audit logs with filters and pagination
   */
  static async queryLogs({
    merchantId,
    branchId,
    userId,
    resource,
    action,
    severity,
    startDate,
    endDate,
    page = 1,
    limit = 50,
    sortBy = '-createdAt'
  }) {
    // Build query
    const query = { merchant: merchantId };  // CRITICAL: Tenant isolation
    
    if (branchId) query.branch = branchId;
    if (userId) query.user = userId;
    if (resource) query.resource = resource;
    if (action) query.action = action;
    if (severity) query.severity = severity;
    
    // Date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Execute query
    const skip = (page - 1) * limit;
    
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('user', 'name email')
        .populate('merchant', 'businessName')
        .populate('branch', 'name')
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      AuditLog.countDocuments(query)
    ]);
    
    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  /**
   * Get single audit log with full details
   */
  static async getLogById(logId, merchantId) {
    const log = await AuditLog.findOne({
      _id: logId,
      merchant: merchantId  // Tenant isolation
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
   */
  static async getResourceHistory(resourceType, resourceId, merchantId) {
    const logs = await AuditLog.find({
      merchant: merchantId,
      resource: resourceType,
      resourceId
    })
      .populate('user', 'name email')
      .sort('-createdAt')
      .lean();
    
    return logs;
  }
  
  /**
   * Get correlated logs (trace related operations)
   */
  static async getCorrelatedLogs(correlationId, merchantId) {
    const logs = await AuditLog.find({
      merchant: merchantId,
      correlationId
    })
      .populate('user', 'name email')
      .sort('createdAt')  // Chronological order
      .lean();
    
    return logs;
  }
  
  /**
   * Export logs to CSV
   */
  static async exportLogsToCSV(filters, merchantId) {
    const { logs } = await this.queryLogs({
      ...filters,
      merchantId,
      limit: 10000  // Max export size
    });
    
    // Convert to CSV format
    const csv = this._convertToCSV(logs);
    return csv;
  }
  
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
      'Details'
    ];
    
    const rows = logs.map(log => [
      log.createdAt,
      log.user?.name || 'System',
      log.action,
      log.resource,
      log.resourceId || '',
      log.severity,
      log.outcome,
      log.ip || '',
      JSON.stringify(log.metadata)
    ]);
    
    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }
}

module.exports = AuditService;
```

#### 2.2 Audit Controller

**File:** `src/modules/audit/controllers/audit.controller.js`

```javascript
const AuditService = require('../service/audit.service');
const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');

/**
 * GET /api/v1/audit-logs
 * Query audit logs with filters
 */
exports.queryAuditLogs = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id || req.user.merchant;
  
  // Super admin can query any merchant
  let queryMerchantId = merchantId;
  if (req.user.role?.isSystemRole && req.query.merchantId) {
    queryMerchantId = req.query.merchantId;
  }
  
  const {
    branchId,
    userId,
    resource,
    action,
    severity,
    startDate,
    endDate,
    page,
    limit,
    sortBy
  } = req.query;
  
  const result = await AuditService.queryLogs({
    merchantId: queryMerchantId,
    branchId,
    userId,
    resource,
    action,
    severity,
    startDate,
    endDate,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50,
    sortBy
  });
  
  res.status(200).json({
    status: 'success',
    data: result
  });
});

/**
 * GET /api/v1/audit-logs/:id
 * Get single audit log details
 */
exports.getAuditLog = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const merchantId = req.user.merchant._id || req.user.merchant;
  
  const log = await AuditService.getLogById(id, merchantId);
  
  res.status(200).json({
    status: 'success',
    data: { log }
  });
});

/**
 * GET /api/v1/audit-logs/resource/:resource/:id
 * Get audit trail for specific resource
 */
exports.getResourceHistory = catchAsync(async (req, res, next) => {
  const { resource, id } = req.params;
  const merchantId = req.user.merchant._id || req.user.merchant;
  
  const logs = await AuditService.getResourceHistory(
    resource,
    id,
    merchantId
  );
  
  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: { logs }
  });
});

/**
 * GET /api/v1/audit-logs/correlation/:correlationId
 * Get correlated logs (trace related operations)
 */
exports.getCorrelatedLogs = catchAsync(async (req, res, next) => {
  const { correlationId } = req.params;
  const merchantId = req.user.merchant._id || req.user.merchant;
  
  const logs = await AuditService.getCorrelatedLogs(
    correlationId,
    merchantId
  );
  
  res.status(200).json({
    status: 'success',
    results: logs.length,
    data: { logs }
  });
});

/**
 * GET /api/v1/audit-logs/export
 * Export audit logs to CSV
 */
exports.exportAuditLogs = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id || req.user.merchant;
  
  const csv = await AuditService.exportLogsToCSV(
    req.query,
    merchantId
  );
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
  res.send(csv);
});

module.exports = exports;
```

#### 2.3 Audit Routes

**File:** `src/modules/audit/audit.routes.js`

```javascript
const express = require('express');
const auditController = require('./controllers/audit.controller');
const { protect, restrictTo } = require('../../common/guards/auth.guard');

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * GET /api/v1/audit-logs
 * Query audit logs with filters
 * Access: admin, superAdmin
 */
router.get(
  '/',
  restrictTo('admin', 'superAdmin'),
  auditController.queryAuditLogs
);

/**
 * GET /api/v1/audit-logs/:id
 * Get single audit log
 * Access: admin, superAdmin
 */
router.get(
  '/:id',
  restrictTo('admin', 'superAdmin'),
  auditController.getAuditLog
);

/**
 * GET /api/v1/audit-logs/resource/:resource/:id
 * Get audit history for specific resource
 * Access: admin, superAdmin
 */
router.get(
  '/resource/:resource/:id',
  restrictTo('admin', 'superAdmin'),
  auditController.getResourceHistory
);

/**
 * GET /api/v1/audit-logs/correlation/:correlationId
 * Get correlated logs
 * Access: admin, superAdmin
 */
router.get(
  '/correlation/:correlationId',
  restrictTo('admin', 'superAdmin'),
  auditController.getCorrelatedLogs
);

/**
 * GET /api/v1/audit-logs/export
 * Export audit logs to CSV
 * Access: admin, superAdmin
 */
router.get(
  '/export',
  restrictTo('admin', 'superAdmin'),
  auditController.exportAuditLogs
);

module.exports = router;
```

#### 2.4 Mount Routes

**File:** `src/routes/index.js`

```javascript
// Add import
const auditRoutes = require('../modules/audit/audit.routes');

// Mount routes (around line 154)
router.use('/api/v1/audit-logs', auditRoutes);
```

---

### Step 3: Global Audit Plugin Rollout

**Goal:** Apply auditPlugin to all critical models

#### 3.1 Models to Audit

**Priority 1: Financial & Orders**
- ✅ `models/orderModel.js`
- ✅ `models/paymentModel.js` (if exists)
- ✅ `models/Ingredient.js` (inventory valuation)

**Priority 2: User & Auth**
- ✅ `models/userModel.js`
- ✅ `models/roleModel.js`
- ✅ `models/merchantModel.js`

**Priority 3: Operations**
- ✅ `models/branchModel.js`
- ✅ `models/menuModel.js`
- ✅ `models/tableModel.js`
- ✅ `models/taskModel.js`

**Priority 4: KDS (Already has outbox)**
- ⚠️ `models/KitchenTicket.js` — Consider if needed (already tracked via outbox)
- ⚠️ `models/KitchenStation.js` — Low priority

#### 3.2 Application Pattern

**Example:** `models/orderModel.js`

```javascript
const auditPlugin = require('../utils/auditPlugin');

// At end of schema definition
orderSchema.plugin(auditPlugin, {
  resource: 'Order',
  auditedFields: [
    'status',
    'orderType',
    'totalPrice',
    'isPaid',
    'canceledBy',
    'canceledReason',
    'items',
    'assignedWaiter',
    'assignedKitchenStaff'
  ]
});

module.exports = mongoose.model('Order', orderSchema);
```

**Example:** `models/userModel.js`

```javascript
userSchema.plugin(auditPlugin, {
  resource: 'User',
  auditedFields: [
    'name',
    'email',
    'role',
    'branch',
    'isActive',
    'merchant'
  ]
});
```

**Example:** `models/merchantModel.js`

```javascript
merchantSchema.plugin(auditPlugin, {
  resource: 'Merchant',
  auditedFields: [
    'businessName',
    'status',
    'owner',
    'subscription.plan',
    'subscription.status'
  ]
});
```

---

### Step 4: Explicit High-Value Audit Logging

**Goal:** Add rich context to critical operations using explicit `auditLogger()` calls

#### 4.1 Order Status Transitions

**File:** `src/modules/order/service/OrderStateMachineService.js`

**Location:** After transaction commit (line ~583)

```javascript
// EXISTING (line 583):
if (!result.noop) {
  logger.info('order.status.transition', {...});
  
  // NEW: Add explicit audit log
  const { getRequestContext } = require('../../../../utils/request-context');
  const context = getRequestContext();
  
  await auditLogger({
    user,
    merchant: result.order.merchant,
    branch: result.order.branch,
    action: 'ORDER_STATUS_CHANGE',
    resource: 'Order',
    resourceId: orderId,
    method: 'PATCH',
    endpoint: context?.req?.originalUrl || '/api/v1/order/:id/status',
    statusCode: 200,
    oldValues: { status: result.previousStatus },
    newValues: { status: toStatus },
    changes: [{
      field: 'status',
      oldValue: result.previousStatus,
      newValue: toStatus
    }],
    severity: toStatus === 'canceled' ? 'high' : 'medium',
    outcome: 'success',
    correlationId: context?.req?.id,
    metadata: {
      roleCategory,
      orderType: result.order?.orderType,
      reason,
      assignedWaiter,
      assignedKitchenStaff,
      isDelivery: result.order?.orderType === 'delivery'
    },
    req: context?.req
  });
}
```

#### 4.2 Payment Operations

**File:** `src/modules/order/controller/order.controller.js` (or wherever payments handled)

**Example:**

```javascript
// After successful payment
await auditLogger({
  user: req.user,
  merchant: order.merchant,
  branch: order.branch,
  action: 'PAYMENT_RECEIVED',
  resource: 'Order',
  resourceId: order._id,
  method: 'POST',
  endpoint: req.originalUrl,
  statusCode: 200,
  severity: 'critical',  // Financial operation
  outcome: 'success',
  metadata: {
    paymentMethod,
    amount: order.totalPrice,
    transactionId
  },
  req
});
```

#### 4.3 Auth Events

**File:** `src/modules/auth/auth.controller.js`

**Login Success:**

```javascript
// After successful login
await auditLogger({
  user: user._id,
  merchant: user.merchant,
  branch: user.branch,
  action: 'LOGIN',
  resource: 'User',
  resourceId: user._id,
  method: 'POST',
  endpoint: req.originalUrl,
  statusCode: 200,
  severity: 'medium',
  outcome: 'success',
  metadata: {
    email: user.email,
    role: user.role?.name
  },
  req
});
```

**Password Change:**

```javascript
// After password change
await auditLogger({
  user: req.user._id,
  merchant: req.user.merchant,
  action: 'PASSWORD_CHANGE',
  resource: 'User',
  resourceId: req.user._id,
  method: 'PATCH',
  endpoint: req.originalUrl,
  statusCode: 200,
  severity: 'critical',  // Security event
  outcome: 'success',
  req
});
```

#### 4.4 Role Assignments

**File:** `src/modules/users/user.controller.js` (or wherever role assignments happen)

```javascript
// After role assignment
await auditLogger({
  user: req.user._id,
  merchant: req.user.merchant,
  action: 'ROLE_ASSIGN',
  resource: 'User',
  resourceId: targetUser._id,
  method: 'PATCH',
  endpoint: req.originalUrl,
  statusCode: 200,
  severity: 'critical',  // Permission change
  outcome: 'success',
  oldValues: { role: targetUser.role },
  newValues: { role: newRole },
  metadata: {
    targetUserEmail: targetUser.email,
    newRoleName: newRole.name
  },
  req
});
```

---

### Step 5: Retention Policy & Archival

**Goal:** Archive old logs to cold storage, delete after retention period

#### 5.1 Archive Script

**File:** `scripts/archive-audit-logs.js`

```javascript
const mongoose = require('mongoose');
const AuditLog = require('../models/auditLogModel');
const { connectDB } = require('../config/database');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const RETENTION_DAYS = 90;  // Hot storage retention
const ARCHIVE_BUCKET = process.env.AUDIT_ARCHIVE_BUCKET || 'audit-logs-archive';

async function archiveOldLogs() {
  await connectDB();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  console.log(`Archiving logs older than ${cutoffDate.toISOString()}`);
  
  // Find old logs
  const oldLogs = await AuditLog.find({
    createdAt: { $lt: cutoffDate }
  }).lean();
  
  if (oldLogs.length === 0) {
    console.log('No logs to archive');
    return;
  }
  
  console.log(`Found ${oldLogs.length} logs to archive`);
  
  // Group by merchant and month
  const logsByMerchantMonth = {};
  oldLogs.forEach(log => {
    const merchantId = log.merchant?.toString() || 'system';
    const month = log.createdAt.toISOString().slice(0, 7);  // YYYY-MM
    const key = `${merchantId}/${month}`;
    
    if (!logsByMerchantMonth[key]) {
      logsByMerchantMonth[key] = [];
    }
    logsByMerchantMonth[key].push(log);
  });
  
  // Upload to S3
  const s3Client = new S3Client({ region: process.env.AWS_REGION });
  
  for (const [key, logs] of Object.entries(logsByMerchantMonth)) {
    const jsonData = JSON.stringify(logs, null, 2);
    const gzipped = zlib.gzipSync(jsonData);
    
    const s3Key = `${key}/audit-logs.json.gz`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: s3Key,
      Body: gzipped,
      ContentType: 'application/gzip',
      ContentEncoding: 'gzip'
    }));
    
    console.log(`Uploaded ${logs.length} logs to s3://${ARCHIVE_BUCKET}/${s3Key}`);
  }
  
  // Delete from MongoDB
  const result = await AuditLog.deleteMany({
    createdAt: { $lt: cutoffDate }
  });
  
  console.log(`Deleted ${result.deletedCount} logs from MongoDB`);
  
  process.exit(0);
}

archiveOldLogs().catch(err => {
  console.error('Archive failed:', err);
  process.exit(1);
});
```

#### 5.2 Cron Job Setup

**File:** `src/infrastructure/cron/audit-archival.cron.js`

```javascript
const cron = require('node-cron');
const { exec } = require('child_process');
const logger = require('../../../utils/logger');

/**
 * Run audit log archival every Sunday at 2 AM
 */
function setupAuditArchivalCron() {
  cron.schedule('0 2 * * 0', () => {
    logger.info('Starting audit log archival cron job');
    
    exec('node scripts/archive-audit-logs.js', (error, stdout, stderr) => {
      if (error) {
        logger.error('Audit archival failed', { error: error.message, stderr });
      } else {
        logger.info('Audit archival complete', { stdout });
      }
    });
  });
  
  logger.info('Audit archival cron job scheduled (Sundays at 2 AM)');
}

module.exports = { setupAuditArchivalCron };
```

**Wire into app:**

```javascript
// src/app/create-app.js or server.js
const { setupAuditArchivalCron } = require('./infrastructure/cron/audit-archival.cron');

// After app initialization
if (process.env.NODE_ENV === 'production') {
  setupAuditArchivalCron();
}
```

---

## Testing Strategy

### Unit Tests

**AuditService Tests:**

```javascript
// tests/audit-service.test.js
describe('AuditService.queryLogs', () => {
  it('enforces tenant isolation', async () => {
    // Create logs for merchant A and B
    // Query as merchant A
    // Should only return merchant A logs
  });
  
  it('filters by resource type', async () => {
    // Create logs for Order and User resources
    // Query with resource='Order'
    // Should only return Order logs
  });
  
  it('paginates results', async () => {
    // Create 100 logs
    // Query page 1, limit 20
    // Expect 20 results
    // Expect pagination.total = 100
  });
});

describe('AuditService.getResourceHistory', () => {
  it('returns chronological history for resource', async () => {
    // Create order
    // Update order 3 times
    // Query resource history
    // Expect 4 logs (CREATE + 3 UPDATEs)
  });
});

describe('AuditService.getCorrelatedLogs', () => {
  it('traces related operations', async () => {
    // Create order with correlationId = 'abc'
    // Payment with same correlationId
    // Email with same correlationId
    // Query correlated logs
    // Expect 3 logs in chronological order
  });
});
```

**Severity Auto-Classification Tests:**

```javascript
// tests/audit-plugin-severity.test.js
describe('Severity auto-classification', () => {
  it('marks payment operations as critical', async () => {
    const order = await Order.create({...});
    order.isPaid = true;
    await order.save();
    
    const log = await AuditLog.findOne({ 
      resource: 'Order', 
      resourceId: order._id,
      action: 'UPDATE'
    });
    
    expect(log.severity).toBe('critical');
  });
  
  it('marks order status changes as high', async () => {
    order.status = 'canceled';
    await order.save();
    
    const log = await AuditLog.findOne({ 
      resource: 'Order', 
      resourceId: order._id,
      action: 'UPDATE'
    }).sort('-createdAt');
    
    expect(log.severity).toBe('high');
  });
});
```

### Integration Tests

```javascript
// tests/audit-api-integration.test.js
describe('Audit Log API', () => {
  it('GET /api/v1/audit-logs requires admin role', async () => {
    const waiterToken = await getAuthToken('waiter@test.com');
    
    const response = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${waiterToken}`);
    
    expect(response.status).toBe(403);
  });
  
  it('GET /api/v1/audit-logs filters by date range', async () => {
    // Create logs spanning 3 months
    // Query with startDate=2 months ago, endDate=1 month ago
    // Expect only middle month logs
  });
  
  it('GET /api/v1/audit-logs/export generates CSV', async () => {
    const response = await request(app)
      .get('/api/v1/audit-logs/export')
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv');
    expect(response.text).toContain('Timestamp,User,Action');
  });
});
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] **Run migration:** `node scripts/migrate-audit-logs-add-merchant.js`
- [ ] **Verify indexes created:** Check `db.auditLogs.getIndexes()`
- [ ] **Test audit plugin on staging:** Apply to one model, verify logs
- [ ] **Test audit API on staging:** Query logs, export CSV
- [ ] **Configure S3 bucket:** Create audit-logs-archive bucket with lifecycle policy
- [ ] **Set environment variables:**
  ```
  AUDIT_ARCHIVE_BUCKET=audit-logs-archive
  AWS_REGION=us-east-1
  ```

### Deployment Steps

1. **Deploy schema changes**
   - Deploy `models/auditLogModel.js` with new fields
   - Verify no errors in logs

2. **Run migration**
   - Backfill merchant field in existing logs
   - Monitor for errors

3. **Deploy audit API**
   - Deploy audit service, controller, routes
   - Mount routes in `src/routes/index.js`

4. **Deploy audit plugin rollout**
   - Deploy models with `auditPlugin` applied
   - Start with low-risk models (Table, Menu)
   - Monitor audit log volume

5. **Deploy explicit audit calls**
   - Deploy `OrderStateMachineService` with audit call
   - Deploy auth controller with audit calls
   - Monitor for errors

6. **Enable archival cron**
   - Deploy cron job configuration
   - Verify first run (dry-run mode)

### Post-Deployment

- [ ] **Monitor audit log volume:** Check daily log count
- [ ] **Test audit API:** Query logs via Postman/frontend
- [ ] **Verify tenant isolation:** Merchant A cannot see merchant B logs
- [ ] **Check archival:** Run manual archival, verify S3 upload
- [ ] **Performance check:** Monitor query times, add indexes if needed

---

## File Inventory

### New Files

1. ✅ `src/modules/audit/service/audit.service.js`
2. ✅ `src/modules/audit/controllers/audit.controller.js`
3. ✅ `src/modules/audit/audit.routes.js`
4. ✅ `scripts/migrate-audit-logs-add-merchant.js`
5. ✅ `scripts/archive-audit-logs.js`
6. ✅ `src/infrastructure/cron/audit-archival.cron.js`
7. ✅ `tests/audit-service.test.js`
8. ✅ `tests/audit-api-integration.test.js`

### Modified Files

1. ✅ `models/auditLogModel.js` — Add fields, indexes, enum values
2. ✅ `utils/auditLogger.js` — Add new parameters (merchant, correlationId, etc.)
3. ✅ `utils/auditPlugin.js` — Add severity auto-classification, structured changes
4. ✅ `src/routes/index.js` — Mount audit routes
5. ✅ `src/modules/order/service/OrderStateMachineService.js` — Add explicit audit call
6. ✅ `src/modules/auth/auth.controller.js` — Add login/logout audit calls
7. ✅ `models/orderModel.js` — Apply auditPlugin
8. ✅ `models/userModel.js` — Apply auditPlugin
9. ✅ `models/merchantModel.js` — Apply auditPlugin
10. ✅ `models/branchModel.js` — Apply auditPlugin
11. ✅ `models/menuModel.js` — Apply auditPlugin
12. ✅ `models/tableModel.js` — Apply auditPlugin

---

## Success Criteria

### Functional

- ✅ All CRUD operations auto-audited via plugin
- ✅ Critical operations have rich context (order transitions, payments, auth)
- ✅ Audit API enforces tenant isolation
- ✅ Export to CSV works
- ✅ Archival cron runs successfully
- ✅ Correlation ID tracing works

### Non-Functional

- ✅ Audit logging doesn't block operations (non-blocking)
- ✅ Query performance <500ms for paginated queries
- ✅ Tenant isolation verified (no cross-merchant leaks)
- ✅ Storage growth managed (archival working)

### Compliance

- ✅ Immutable audit logs (no UPDATE/DELETE operations on AuditLog model)
- ✅ Complete audit trail for financial operations
- ✅ Retention policy enforced (90-day hot storage)
- ✅ Export capability for compliance audits

---

## Phase 2 Timeline

| Step | Estimated Time | Dependencies |
|------|---------------|--------------|
| 1. Schema Enhancement | 4 hours | Phase 0 complete |
| 2. Audit API | 8 hours | Step 1 complete |
| 3. Plugin Rollout | 4 hours | Step 1 complete |
| 4. Explicit Logging | 6 hours | Step 3 complete |
| 5. Retention Policy | 4 hours | Step 2 complete |
| Testing | 6 hours | All steps complete |
| **Total** | **32 hours** | **~4 days** |

---

## Next Steps

1. **Review and approve this plan**
2. **Start with Step 1: Schema enhancement**
3. **Run migration script on staging**
4. **Deploy audit API**
5. **Incremental plugin rollout**
6. **Test and verify**

---

**Phase 2 Status:** 📋 READY FOR IMPLEMENTATION

All dependencies met (Phase 0/1 complete). Clear scope, testable components, phased rollout strategy. Ready to proceed!
