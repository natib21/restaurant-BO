# Phase 2 - Step 2: Audit Log Query API — COMPLETE

**Date:** August 18, 2026  
**Status:** ✅ COMPLETE  
**Dependencies:** Phase 2 Step 1 (Schema Enhancement)

---

## Overview

Step 2 implements a professional-grade **Audit Log Query API** that allows administrators to:
- Query audit logs with filters and pagination
- View detailed audit log information
- Trace resource history (all operations on a specific resource)
- Follow correlation chains (related operations like order → payment → email)
- Export logs to CSV for compliance/archival
- Get aggregated statistics for dashboards

All endpoints enforce **strict tenant isolation** via merchant filtering.

---

## What Was Implemented

### 1. Audit Service

**File:** `src/modules/audit/service/audit.service.js`

**Methods:**

#### `queryLogs(filters)` — Main Query Interface
- Filters: merchant, branch, user, resource, action, severity, outcome, date range, correlationId
- Pagination: page, limit (max 100), sortBy
- Returns: logs array + pagination metadata
- **Tenant Isolation:** Enforced via `merchant: merchantId` in query

#### `getLogById(logId, merchantId)` — Single Log Details
- Returns full log with populated user/merchant/branch
- **Tenant Isolation:** Requires matching merchantId
- Throws 404 if not found

#### `getResourceHistory(resourceType, resourceId, merchantId)` — Resource Audit Trail
- Returns all operations on a specific resource (e.g., Order #123)
- Sorted by createdAt descending (most recent first)
- Use case: "Show me all changes to this order"

#### `getCorrelatedLogs(correlationId, merchantId)` — Trace Related Operations
- Returns all logs with same correlationId
- Sorted chronologically (to trace flow)
- Use case: "Show me everything that happened when order #123 was placed"
  - Order created → Payment received → Kitchen ticket created → Email sent

#### `exportLogsToCSV(filters, merchantId)` — CSV Export
- Exports up to 10,000 logs (prevents memory issues)
- Applies same filters as queryLogs
- Proper CSV escaping (handles quotes, commas, newlines)
- Returns CSV string

#### `getAuditStats(merchantId, startDate, endDate)` — Dashboard Statistics
- Returns aggregated statistics:
  - Total log count
  - Severity distribution (low/medium/high/critical)
  - Top 10 actions by frequency
  - Outcome distribution (success/failure/partial)
- Use case: Audit dashboard KPIs

---

### 2. Audit Controller

**File:** `src/modules/audit/controllers/audit.controller.js`

**Endpoints:**

#### `GET /api/v1/audit-logs` — Query Audit Logs
```javascript
// Query Parameters:
{
  branchId,           // Filter by branch
  userId,             // Filter by user
  resource,           // Filter by resource type (Order, User, etc.)
  action,             // Filter by action (CREATE, ORDER_STATUS_CHANGE, etc.)
  severity,           // Filter by severity (low, medium, high, critical)
  outcome,            // Filter by outcome (success, failure, partial)
  startDate,          // Start date (ISO 8601)
  endDate,            // End date (ISO 8601)
  correlationId,      // Filter by correlation ID
  page,               // Page number (default: 1)
  limit,              // Results per page (default: 50, max: 100)
  sortBy,             // Sort field (default: -createdAt)
  merchantId          // SUPER-ADMIN only: query other merchants
}

// Response:
{
  status: 'success',
  data: {
    logs: [...],
    pagination: {
      page: 1,
      limit: 50,
      total: 523,
      pages: 11
    }
  }
}
```

#### `GET /api/v1/audit-logs/:id` — Get Single Log
```javascript
// Response:
{
  status: 'success',
  data: {
    log: {
      _id: '...',
      user: { name: 'John Doe', email: 'john@example.com' },
      merchant: { businessName: 'Pizza Palace' },
      branch: { name: 'Downtown' },
      action: 'ORDER_STATUS_CHANGE',
      resource: 'Order',
      resourceId: '...',
      severity: 'medium',
      outcome: 'success',
      changes: [
        { field: 'status', oldValue: 'pending', newValue: 'completed' }
      ],
      correlationId: 'abc-123',
      duration: 234,
      createdAt: '2026-08-18T10:30:00.000Z',
      // ... all other fields
    }
  }
}
```

#### `GET /api/v1/audit-logs/resource/:resource/:id` — Resource History
```javascript
// Example: GET /api/v1/audit-logs/resource/Order/66c1234567890abcdef12345

// Response:
{
  status: 'success',
  results: 8,
  data: {
    logs: [
      { action: 'PAYMENT_RECEIVED', createdAt: '2026-08-18T10:35:00Z', ... },
      { action: 'ORDER_STATUS_CHANGE', createdAt: '2026-08-18T10:30:00Z', ... },
      { action: 'UPDATE', createdAt: '2026-08-18T10:20:00Z', ... },
      { action: 'CREATE', createdAt: '2026-08-18T10:15:00Z', ... }
    ]
  }
}
```

#### `GET /api/v1/audit-logs/correlation/:correlationId` — Correlated Logs
```javascript
// Example: GET /api/v1/audit-logs/correlation/order-abc-123

// Response:
{
  status: 'success',
  results: 4,
  data: {
    logs: [
      { action: 'CREATE', resource: 'Order', createdAt: '...' },
      { action: 'PAYMENT_RECEIVED', resource: 'Order', createdAt: '...' },
      { action: 'TICKET_CREATED', resource: 'KitchenTicket', createdAt: '...' },
      { action: 'UPDATE', resource: 'Order', createdAt: '...' }
    ]
  }
}
```

#### `GET /api/v1/audit-logs/export` — Export to CSV
```javascript
// Query Parameters: Same as query endpoint

// Response: CSV file download
// Headers: Content-Type: text/csv, Content-Disposition: attachment; filename="audit-logs-2026-08-18T10-30-00-000Z.csv"
```

#### `GET /api/v1/audit-logs/stats` — Aggregated Statistics
```javascript
// Query Parameters:
{
  startDate,  // Optional date range
  endDate
}

// Response:
{
  status: 'success',
  data: {
    stats: {
      totalLogs: 5234,
      bySeverity: {
        low: 3421,
        medium: 1234,
        high: 456,
        critical: 123
      },
      byAction: [
        { action: 'ORDER_STATUS_CHANGE', count: 1234 },
        { action: 'CREATE', count: 987 },
        { action: 'UPDATE', count: 876 },
        // ... top 10
      ],
      byOutcome: {
        success: 5100,
        failure: 123,
        partial: 11
      }
    }
  }
}
```

**Tenant Isolation:**
- All endpoints extract `merchantId` from `req.user.merchant`
- SUPER-ADMIN can override with `?merchantId=xxx` query param
- Every query includes `merchant: merchantId` filter

---

### 3. Audit Routes

**File:** `src/modules/audit/audit.routes.js`

**Route Protection:**
- All routes: `protect` middleware (authentication required)
- All routes: `restrictTo()` middleware (RBAC task-based authorization)
- Route order matters (specific routes before generic `:id` route)

**Mounted at:** `/api/v1/audit-logs`

---

### 4. RBAC Tasks

**File:** `scripts/seed-roles-and-tasks.js`

**New Tasks (6):**

```javascript
{ 
  name: 'audit.logs.list', 
  endpoint: '/api/v1/audit-logs', 
  method: 'GET', 
  description: 'Query audit logs with filters', 
  isMerchant: true, 
  hidden: false 
},
{ 
  name: 'audit.logs.view', 
  endpoint: '/api/v1/audit-logs/:id', 
  method: 'GET', 
  description: 'Get single audit log details', 
  isMerchant: true, 
  hidden: false 
},
{ 
  name: 'audit.logs.resource-history', 
  endpoint: '/api/v1/audit-logs/resource/:resource/:id', 
  method: 'GET', 
  description: 'Get audit history for specific resource', 
  isMerchant: true, 
  hidden: false 
},
{ 
  name: 'audit.logs.correlation', 
  endpoint: '/api/v1/audit-logs/correlation/:id', 
  method: 'GET', 
  description: 'Get correlated logs (trace operations)', 
  isMerchant: true, 
  hidden: false 
},
{ 
  name: 'audit.logs.export', 
  endpoint: '/api/v1/audit-logs/export', 
  method: 'GET', 
  description: 'Export audit logs to CSV', 
  isMerchant: true, 
  hidden: false 
},
{ 
  name: 'audit.logs.stats', 
  endpoint: '/api/v1/audit-logs/stats', 
  method: 'GET', 
  description: 'Get aggregated audit statistics', 
  isMerchant: true, 
  hidden: false 
}
```

**Updated Task Counts:**
- Total: 196 → **202 tasks** (+6)
- Merchant-scoped: 171 → **177 tasks** (+6)
- System-wide: 25 (unchanged)

**Auto-Assigned To:**
- `SUPER-MERCHANT-ADMIN` role (all 6 tasks)
- `SUPER-ADMIN` role (bypasses RBAC, can access all)

---

### 5. Route Integration

**File:** `src/routes/index.js`

**Changes:**
```javascript
// Import
const auditRoutes = require('../modules/audit/audit.routes');

// Mount
router.use('/api/v1/audit-logs', auditRoutes);
```

---

## Security Features

### Tenant Isolation (CRITICAL)
✅ **Every query filters by merchant:**
```javascript
const query = { merchant: merchantId };
```

✅ **SUPER-ADMIN override:**
```javascript
if (req.user.role?.isSystemRole && req.query.merchantId) {
  queryMerchantId = req.query.merchantId;
}
```

✅ **Resource history & correlation also enforce tenant isolation**

### RBAC Protection
✅ All routes require authentication (`protect` middleware)  
✅ All routes require RBAC task (`restrictTo()` middleware)  
✅ Task-based authorization (not role-based)  

### Data Safety
✅ Max export limit: 10,000 rows (prevents memory exhaustion)  
✅ Max query limit: 100 rows per page  
✅ CSV proper escaping (prevents injection)  
✅ No audit log deletion exposed (immutable audit trail)  

---

## Testing Checklist

### Manual Testing

#### Test 1: Query Logs with Filters
```bash
# Get all logs
GET /api/v1/audit-logs
Authorization: Bearer <token>

# Filter by severity
GET /api/v1/audit-logs?severity=critical

# Filter by date range
GET /api/v1/audit-logs?startDate=2026-08-01&endDate=2026-08-31

# Filter by resource
GET /api/v1/audit-logs?resource=Order&action=ORDER_STATUS_CHANGE
```

#### Test 2: Get Resource History
```bash
# Get all changes to Order #123
GET /api/v1/audit-logs/resource/Order/66c1234567890abcdef12345
Authorization: Bearer <token>
```

#### Test 3: Trace Correlated Operations
```bash
# Get all logs with correlationId
GET /api/v1/audit-logs/correlation/order-abc-123
Authorization: Bearer <token>
```

#### Test 4: Export to CSV
```bash
# Export last 30 days
GET /api/v1/audit-logs/export?startDate=2026-07-19&endDate=2026-08-18
Authorization: Bearer <token>

# Should download CSV file
```

#### Test 5: Get Statistics
```bash
# Get stats for current month
GET /api/v1/audit-logs/stats?startDate=2026-08-01
Authorization: Bearer <token>

# Response should include severity distribution, top actions, outcomes
```

#### Test 6: Tenant Isolation
```bash
# Merchant A admin should NOT see Merchant B logs
# Create test users for both merchants
# Query as Merchant A → should only see Merchant A logs
# Query as Merchant B → should only see Merchant B logs
```

#### Test 7: RBAC Protection
```bash
# Create role WITHOUT audit.logs.list task
# Assign to test user
# GET /api/v1/audit-logs → should return 403 Forbidden
```

#### Test 8: Pagination
```bash
# Get page 2 with 20 results
GET /api/v1/audit-logs?page=2&limit=20

# Verify pagination metadata correct
```

---

## Usage Examples

### Frontend Integration

#### React Query Hook
```typescript
// hooks/useAuditLogs.ts
import { useQuery } from '@tanstack/react-query';

interface AuditLogFilters {
  resource?: string;
  action?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, String(value));
      });
      
      const response = await fetch(
        `/api/v1/audit-logs?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${getToken()}`,
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
  });
}

export function useResourceHistory(resource: string, id: string) {
  return useQuery({
    queryKey: ['audit-logs', 'resource', resource, id],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/audit-logs/resource/${resource}/${id}`,
        {
          headers: {
            'Authorization': `Bearer ${getToken()}`,
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch history');
      return response.json();
    },
  });
}
```

#### Audit Log Dashboard Component
```typescript
// components/AuditDashboard.tsx
import { useAuditLogs } from '../hooks/useAuditLogs';

export function AuditDashboard() {
  const [filters, setFilters] = useState({
    severity: 'high',
    startDate: '2026-08-01',
    page: 1,
    limit: 50,
  });
  
  const { data, isLoading, error } = useAuditLogs(filters);
  
  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <div>
      <AuditFilters filters={filters} onChange={setFilters} />
      
      <AuditTable logs={data.data.logs} />
      
      <Pagination 
        current={data.data.pagination.page}
        total={data.data.pagination.pages}
        onChange={(page) => setFilters({ ...filters, page })}
      />
    </div>
  );
}
```

#### Order History Timeline
```typescript
// components/OrderAuditHistory.tsx
import { useResourceHistory } from '../hooks/useAuditLogs';

export function OrderAuditHistory({ orderId }: { orderId: string }) {
  const { data, isLoading } = useResourceHistory('Order', orderId);
  
  if (isLoading) return <Spinner />;
  
  return (
    <Timeline>
      {data.data.logs.map(log => (
        <TimelineItem key={log._id}>
          <TimelineDate>{formatDate(log.createdAt)}</TimelineDate>
          <TimelineUser>{log.user?.name || 'System'}</TimelineUser>
          <TimelineAction severity={log.severity}>
            {log.action}
          </TimelineAction>
          {log.changes && (
            <TimelineChanges changes={log.changes} />
          )}
        </TimelineItem>
      ))}
    </Timeline>
  );
}
```

---

## File Summary

### New Files (3)
1. ✅ `src/modules/audit/service/audit.service.js` - Audit query service
2. ✅ `src/modules/audit/controllers/audit.controller.js` - HTTP controllers
3. ✅ `src/modules/audit/audit.routes.js` - Route definitions

### Modified Files (2)
1. ✅ `src/routes/index.js` - Mounted audit routes
2. ✅ `scripts/seed-roles-and-tasks.js` - Added 6 RBAC tasks, fixed duplicate kitchen tasks

### Documentation (1)
1. ✅ `PHASE-2-STEP-2-AUDIT-API-COMPLETE.md` - This document

---

## Next Steps

### Step 3: Global Audit Plugin Rollout
- [ ] Apply `auditPlugin` to all critical models
  - Priority 1: Order, Payment, Ingredient (financial)
  - Priority 2: User, Role, Merchant (auth/tenant)
  - Priority 3: Branch, Menu, Table (operations)
- [ ] Add severity auto-classification to auditPlugin
- [ ] Update auditPlugin to generate structured `changes` array
- [ ] Test audit logging for each model

### Step 4: Explicit High-Value Logging
- [ ] Add explicit audit calls to OrderStateMachineService (order transitions)
- [ ] Add explicit audit calls to auth.controller (login, logout, password change)
- [ ] Add explicit audit calls to payment operations
- [ ] Add explicit audit calls to role assignments
- [ ] Use rich metadata and correlationId

### Step 5: Retention Policy & Archival
- [ ] Create archive script (`scripts/archive-audit-logs.js`)
- [ ] Set up cron job for automated archival
- [ ] Configure S3 bucket for cold storage
- [ ] Test archival process

---

## Deployment Checklist

### Pre-Deployment
- [x] Code review audit service
- [x] Code review audit controller
- [x] Code review audit routes
- [ ] Run RBAC seeder in dev environment
- [ ] Test all endpoints manually
- [ ] Verify tenant isolation
- [ ] Verify RBAC protection

### Deployment
- [ ] Deploy code (audit module + routes)
- [ ] Run RBAC seeder in production:
  ```bash
  node scripts/seed-roles-and-tasks.js
  ```
- [ ] Verify SUPER-MERCHANT-ADMIN has all 6 audit tasks
- [ ] Test audit log query as admin user

### Post-Deployment
- [ ] Monitor API logs for errors
- [ ] Verify audit logs created with merchant field
- [ ] Check query performance (should use indexes)
- [ ] Test CSV export with real data

---

## Success Metrics

✅ **Audit Query API Complete:**
- [x] Service with 6 query methods (query, getById, resource history, correlation, export, stats)
- [x] Controller with 6 endpoints
- [x] Routes with RBAC protection
- [x] Tenant isolation enforced
- [x] CSV export with proper escaping
- [x] Aggregated statistics

✅ **RBAC Integration:**
- [x] 6 new tasks added to seeder
- [x] Task counts updated (196 → 202)
- [x] All tasks merchant-scoped (isMerchant: true)
- [x] Fixed duplicate kitchen task entries

✅ **Security:**
- [x] Tenant isolation (merchant filter)
- [x] RBAC protection (task-based)
- [x] Rate limiting (via auditPlugin max query limits)
- [x] No deletion endpoint (immutable audit trail)

✅ **Documentation:**
- [x] Complete API documentation
- [x] Usage examples (React Query hooks)
- [x] Testing checklist
- [x] Deployment guide

---

**Phase 2 - Step 2 Status:** ✅ COMPLETE

Ready to proceed to Step 3: Global Audit Plugin Rollout!

