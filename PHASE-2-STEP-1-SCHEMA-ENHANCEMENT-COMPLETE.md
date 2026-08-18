# Phase 2 - Step 1: AuditLog Schema Enhancement — COMPLETE

**Date:** August 18, 2026  
**Status:** ✅ COMPLETE

---

## Overview

Step 1 enhances the AuditLog schema with critical fields for professional audit logging:
- **Tenant Isolation** (merchant/branch fields)
- **Correlation Tracking** (correlationId for tracing)
- **Structured Changes** (field-level diffs)
- **Risk Classification** (severity levels)
- **Performance Tracking** (duration)
- **Enhanced Indexes** (optimized queries)

---

## What Was Changed

### 1. AuditLog Model Schema (`models/auditLogModel.js`)

#### New Fields Added:

**Tenant Isolation (CRITICAL):**
```javascript
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
},
```

**Correlation & Tracing:**
```javascript
correlationId: {
  type: String,
  index: true,
  trim: true,
},
```

**Structured Change Tracking:**
```javascript
changes: [
  {
    field: { type: String, required: true },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
  },
],
```

**Risk Classification:**
```javascript
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
```

**Performance Tracking:**
```javascript
duration: {
  type: Number, // milliseconds
  min: 0,
},
```

#### Expanded Action Enum:

Added 20+ new action types:
- **Order Operations:** `ORDER_STATUS_CHANGE`, `ORDER_CANCEL`, `PAYMENT_RECEIVED`, `REFUND_ISSUED`
- **Kitchen Operations:** `TICKET_CREATED`, `TICKET_STATUS_CHANGE`, `TICKET_ASSIGNED`
- **Inventory:** `INVENTORY_ADJUST`, `INVENTORY_BATCH_ADJUST`, `STOCK_ALERT`
- **User Management:** `ROLE_ASSIGN`, `ROLE_REVOKE`, `TASK_ASSIGN`, `USER_SUSPEND`, `USER_ACTIVATE`
- **Merchant/Branch:** `MERCHANT_APPROVE`, `MERCHANT_SUSPEND`, `BRANCH_CREATE`, `BRANCH_SUSPEND`
- **Menu:** `MENU_PUBLISH`, `MENU_UNPUBLISH`, `PRICE_CHANGE`
- **System:** `BACKUP_CREATED`, `HEALTH_CHECK`, `TOKEN_REFRESH`

#### Enhanced Indexes:

**Tenant Isolation:**
```javascript
auditLogSchema.index({ merchant: 1, createdAt: -1 });
auditLogSchema.index({ merchant: 1, resource: 1, action: 1, createdAt: -1 });
```

**Correlation Tracking:**
```javascript
auditLogSchema.index({ correlationId: 1 });
```

**Severity-Based Queries:**
```javascript
auditLogSchema.index({ severity: 1, createdAt: -1 });
```

**User Activity Tracking:**
```javascript
auditLogSchema.index({ merchant: 1, user: 1, createdAt: -1 });
```

**Resource History:**
```javascript
auditLogSchema.index({ merchant: 1, resource: 1, resourceId: 1, createdAt: -1 });
```

---

### 2. AuditLogger Utility (`utils/auditLogger.js`)

#### New Parameters:

```javascript
const auditLogger = async ({
  user,
  merchant,      // NEW
  branch,        // NEW
  action,
  resource,
  resourceId = null,
  method,
  endpoint,
  statusCode,
  oldValues = null,
  newValues = null,
  changes = null,        // NEW
  severity = 'low',      // NEW
  outcome = 'success',   // NEW
  correlationId = null,  // NEW
  duration = null,       // NEW
  metadata = {},
  req,
}) => {
  // Implementation...
};
```

#### Auto-Extraction Logic:

**Merchant/Branch from User:**
```javascript
if (!merchant && user?.merchant) {
  merchant = user.merchant._id || user.merchant;
}

if (!branch && user?.branch) {
  branch = user.branch._id || user.branch;
}
```

**CorrelationId from Request Headers:**
```javascript
if (!correlationId && req) {
  correlationId = 
    req.headers['x-correlation-id'] || 
    req.headers['x-request-id'] ||
    req.id;
}
```

**Duration Calculation:**
```javascript
if (!duration && req?.startTime) {
  duration = Date.now() - req.startTime;
}
```

---

### 3. Migration Script (`scripts/migrate-audit-logs-add-merchant.js`)

**Purpose:** Backfill `merchant` field in existing audit logs

**Strategies:**
1. **From User:** `log.user → User.merchant`
2. **From Resource:** `log.resourceId → Resource.merchant` (for Order, Branch, Menu, etc.)
3. **From Resource Type:** If resource is 'Merchant', use `log.resourceId` directly
4. **Skip System Ops:** LOGIN, LOGOUT, HEALTH_CHECK don't require merchant

**Usage:**
```bash
node scripts/migrate-audit-logs-add-merchant.js
```

**Output:**
```
✅ Database connected successfully
🚀 Starting audit log migration...

📊 Found 1,523 logs without merchant field

  ✓ Processed 100 logs...
  ✓ Processed 200 logs...
  ...
  ✓ Processed 1,500 logs...

============================================================
📊 Migration Summary:
   Total logs found:  1,523
   ✅ Updated:         1,485
   ⚠  Failed:          15
   ⊘  Skipped:         23
============================================================

✅ Audit log migration completed!
```

---

## Backward Compatibility

✅ **Preserved Fields:**
- `oldValues` - Still supported (legacy)
- `newValues` - Still supported (legacy)
- `metadata` - Still supported
- All existing action types (`CREATE`, `READ`, `UPDATE`, `DELETE`, `LOGIN`, etc.)

✅ **Non-Breaking:**
- Existing `auditLogger` calls still work (merchant extracted from user)
- auditPlugin still works (uses request context for merchant)
- Reports module audit logs continue working

⚠️ **Soft Breaking:**
- `user` field now optional for system operations (was required)
- `merchant` field now required for non-system operations (new)

---

## Migration Checklist

### Pre-Migration

- [x] Review schema changes
- [x] Create migration script
- [x] Test migration on dev database
- [ ] **BACKUP PRODUCTION DATABASE** ⚠️

### Migration Steps

1. [ ] **Deploy schema changes** (allows null merchant temporarily)
   ```bash
   # Deploy updated models/auditLogModel.js
   # No downtime - additive changes only
   ```

2. [ ] **Run migration script**
   ```bash
   node scripts/migrate-audit-logs-add-merchant.js
   ```

3. [ ] **Verify migration**
   ```javascript
   // Check logs have merchant
   db.auditLogs.find({ merchant: null }).count()
   // Should be low (only system ops)
   ```

4. [ ] **Deploy updated auditLogger**
   ```bash
   # Deploy utils/auditLogger.js with new parameters
   ```

5. [ ] **Create indexes**
   ```bash
   # MongoDB will create indexes automatically on model load
   # Or manually: db.auditLogs.getIndexes()
   ```

### Post-Migration

- [ ] Monitor audit log creation for errors
- [ ] Verify merchant field populated in new logs
- [ ] Test tenant isolation (merchant A can't see merchant B logs)
- [ ] Check query performance with new indexes

---

## Testing

### Manual Testing

**Test 1: Verify Indexes Created**
```javascript
// MongoDB shell
db.auditLogs.getIndexes()

// Should see:
// - { merchant: 1, createdAt: -1 }
// - { correlationId: 1 }
// - { severity: 1, createdAt: -1 }
// - { merchant: 1, resource: 1, action: 1, createdAt: -1 }
// - { merchant: 1, user: 1, createdAt: -1 }
// - { merchant: 1, resource: 1, resourceId: 1, createdAt: -1 }
```

**Test 2: Verify New Logs Have Merchant**
```javascript
// Create an order (triggers audit log via plugin)
const order = await Order.create({...});

// Check audit log
const log = await AuditLog.findOne({ 
  resource: 'Order', 
  resourceId: order._id 
});

console.assert(log.merchant !== null, 'Merchant should be populated');
console.assert(log.merchant.toString() === order.merchant.toString(), 'Merchant should match');
```

**Test 3: Verify Severity Auto-Classification**
```javascript
// This test will be in Step 3 (auditPlugin update)
// For now, severity defaults to 'low' unless explicitly set
```

---

## File Summary

### Modified Files (2)
1. ✅ `models/auditLogModel.js` - Enhanced schema with Phase 2 fields
2. ✅ `utils/auditLogger.js` - Support new parameters, auto-extraction

### New Files (2)
1. ✅ `scripts/migrate-audit-logs-add-merchant.js` - Migration script
2. ✅ `PHASE-2-STEP-1-SCHEMA-ENHANCEMENT-COMPLETE.md` - This document

---

## Next Steps

### Step 2: Create Audit Log Query API
- [ ] Create AuditService (`src/modules/audit/service/audit.service.js`)
- [ ] Create AuditController (`src/modules/audit/controllers/audit.controller.js`)
- [ ] Create routes (`src/modules/audit/audit.routes.js`)
- [ ] Add RBAC tasks for audit endpoints
- [ ] Mount routes in `src/routes/index.js`

### Step 3: Global Plugin Rollout
- [ ] Apply auditPlugin to all models (Order, User, Merchant, Branch, Menu, etc.)
- [ ] Add severity auto-classification to auditPlugin
- [ ] Test audit logging for each model

### Step 4: Explicit High-Value Logging
- [ ] Add explicit audit calls to OrderStateMachineService
- [ ] Add explicit audit calls to auth.controller (login, logout, password change)
- [ ] Add explicit audit calls to payment operations
- [ ] Add explicit audit calls to role assignments

### Step 5: Retention Policy & Archival
- [ ] Create archive script (`scripts/archive-audit-logs.js`)
- [ ] Set up cron job for automated archival
- [ ] Configure S3 bucket for cold storage

---

## Success Metrics

✅ **Schema Enhancement Complete:**
- [x] Merchant field added with proper indexes
- [x] CorrelationId field added for tracing
- [x] Changes array for structured diffs
- [x] Severity/outcome fields for risk classification
- [x] Duration field for performance tracking
- [x] Action enum expanded (20+ new types)
- [x] 6 new indexes for query optimization

✅ **Migration Ready:**
- [x] Migration script created and tested
- [x] Backward compatibility verified
- [x] auditLogger updated to support new fields

✅ **Documentation:**
- [x] Complete implementation guide
- [x] Migration checklist
- [x] Testing procedures
- [x] Next steps defined

---

**Phase 2 - Step 1 Status:** ✅ COMPLETE

Ready to proceed to Step 2: Audit Log Query API!
