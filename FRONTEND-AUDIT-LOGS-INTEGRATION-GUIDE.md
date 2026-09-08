# 📊 Audit Logs Frontend Integration Guide

**Version:** 1.0  
**Last Updated:** 2026-08-18  
**Target:** Merchant App (Restaurant Management Dashboard)

---

## 🎯 Overview

This guide provides complete API documentation for integrating audit log functionality into your merchant app frontend. The audit system tracks all critical business operations across 16 models including Orders, Users, Payments, Inventory, and more.

---

## 🔐 Authentication

All audit endpoints require authentication. Include the JWT token in the request header:

```http
Authorization: Bearer <your-jwt-token>
```

**Base URL:** `https://your-api-domain.com/api/v1`

---

## 📋 Table of Contents

1. [Query Audit Logs (List View)](#1-query-audit-logs)
2. [Get Single Audit Log (Detail View)](#2-get-single-audit-log)
3. [Get Resource History](#3-get-resource-history)
4. [Get Correlated Logs (Request Tracing)](#4-get-correlated-logs)
5. [Export Audit Logs (CSV)](#5-export-audit-logs)
6. [Get Audit Statistics](#6-get-audit-statistics)
7. [Data Models](#7-data-models)
8. [UI Components Guide](#8-ui-components-guide)
9. [Common Use Cases](#9-common-use-cases)

---

## 1. Query Audit Logs

**Endpoint:** `GET /api/v1/audit-logs`  
**RBAC Task Required:** `audit.logs.list`  
**Description:** Get paginated list of audit logs with filters

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 50, max: 100) |
| `branchId` | ObjectId | No | Filter by branch |
| `userId` | ObjectId | No | Filter by user who performed action |
| `resource` | string | No | Filter by resource type (e.g., "Order", "User", "Payment") |
| `action` | string | No | Filter by action (e.g., "CREATE", "UPDATE", "DELETE") |
| `severity` | string | No | Filter by severity: `low`, `medium`, `high`, `critical` |
| `outcome` | string | No | Filter by outcome: `success`, `failure`, `partial` |
| `startDate` | ISO8601 | No | Filter by date range start |
| `endDate` | ISO8601 | No | Filter by date range end |
| `correlationId` | string | No | Filter by correlation ID |
| `sortBy` | string | No | Sort field (default: `-createdAt`) |

### Example Request

```javascript
// Fetch recent order changes
const response = await fetch(
  `${API_BASE}/audit-logs?` + new URLSearchParams({
    resource: 'Order',
    action: 'UPDATE',
    startDate: '2026-08-01T00:00:00Z',
    endDate: '2026-08-18T23:59:59Z',
    page: '1',
    limit: '20',
    sortBy: '-createdAt'
  }), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);

const data = await response.json();
```

### Response Schema

```json
{
  "status": "success",
  "data": {
    "logs": [
      {
        "_id": "64f7c8e9a1b2c3d4e5f6g7h8",
        "user": {
          "_id": "64f7c8e9a1b2c3d4e5f6g7h9",
          "name": "John Doe",
          "email": "john@restaurant.com"
        },
        "merchant": "64f7c8e9a1b2c3d4e5f6g7ha",
        "branch": "64f7c8e9a1b2c3d4e5f6g7hb",
        "action": "UPDATE",
        "resource": "Order",
        "resourceId": "64f7c8e9a1b2c3d4e5f6g7hc",
        "method": "PATCH",
        "endpoint": "/api/v1/orders/64f7c8e9a1b2c3d4e5f6g7hc",
        "statusCode": 200,
        "correlationId": "req-123e4567-e89b-12d3-a456-426614174000",
        "severity": "medium",
        "outcome": "success",
        "duration": 145,
        "changes": [
          {
            "field": "status",
            "oldValue": "pending",
            "newValue": "confirmed"
          }
        ],
        "ip": "192.168.1.100",
        "userAgent": "Mozilla/5.0...",
        "createdAt": "2026-08-18T10:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 487,
      "page": 1,
      "limit": 20,
      "totalPages": 25
    }
  }
}
```

---

## 2. Get Single Audit Log

**Endpoint:** `GET /api/v1/audit-logs/:id`  
**RBAC Task Required:** `audit.logs.view`  
**Description:** Get detailed information about a specific audit log entry

### Example Request

```javascript
const response = await fetch(
  `${API_BASE}/audit-logs/64f7c8e9a1b2c3d4e5f6g7h8`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
```

### Response Schema

```json
{
  "status": "success",
  "data": {
    "log": {
      "_id": "64f7c8e9a1b2c3d4e5f6g7h8",
      "user": {
        "_id": "64f7c8e9a1b2c3d4e5f6g7h9",
        "name": "John Doe",
        "email": "john@restaurant.com",
        "role": {
          "name": "BRANCH-MANAGER"
        }
      },
      "merchant": {
        "_id": "64f7c8e9a1b2c3d4e5f6g7ha",
        "name": "Pizza Palace"
      },
      "branch": {
        "_id": "64f7c8e9a1b2c3d4e5f6g7hb",
        "name": "Downtown Branch"
      },
      "action": "UPDATE",
      "resource": "Order",
      "resourceId": "64f7c8e9a1b2c3d4e5f6g7hc",
      "method": "PATCH",
      "endpoint": "/api/v1/orders/64f7c8e9a1b2c3d4e5f6g7hc",
      "statusCode": 200,
      "correlationId": "req-123e4567-e89b-12d3-a456-426614174000",
      "severity": "medium",
      "outcome": "success",
      "duration": 145,
      "changes": [
        {
          "field": "status",
          "oldValue": "pending",
          "newValue": "confirmed"
        },
        {
          "field": "totalPrice",
          "oldValue": 25.50,
          "newValue": 28.00
        }
      ],
      "oldValues": {
        "status": "pending",
        "totalPrice": 25.50,
        "isPaid": false
      },
      "newValues": {
        "status": "confirmed",
        "totalPrice": 28.00,
        "isPaid": false
      },
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
      "metadata": {
        "wasNew": false,
        "changedFields": ["status", "totalPrice"]
      },
      "createdAt": "2026-08-18T10:30:00.000Z",
      "updatedAt": "2026-08-18T10:30:00.000Z"
    }
  }
}
```

---

## 3. Get Resource History

**Endpoint:** `GET /api/v1/audit-logs/resource/:resource/:id`  
**RBAC Task Required:** `audit.logs.resource-history`  
**Description:** Get complete audit trail for a specific resource (e.g., all changes to Order #123)

### Parameters

- `resource`: Resource type (e.g., "Order", "User", "Payment", "Menu")
- `id`: Resource ID (ObjectId)

### Example Request

```javascript
// Get all changes to a specific order
const response = await fetch(
  `${API_BASE}/audit-logs/resource/Order/64f7c8e9a1b2c3d4e5f6g7hc`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
```

### Response Schema

```json
{
  "status": "success",
  "results": 5,
  "data": {
    "logs": [
      {
        "_id": "64f7c8e9a1b2c3d4e5f6g7h8",
        "action": "CREATE",
        "user": { "name": "John Doe" },
        "changes": [],
        "createdAt": "2026-08-18T09:00:00.000Z"
      },
      {
        "_id": "64f7c8e9a1b2c3d4e5f6g7h9",
        "action": "UPDATE",
        "user": { "name": "Jane Smith" },
        "changes": [
          { "field": "status", "oldValue": "pending", "newValue": "confirmed" }
        ],
        "createdAt": "2026-08-18T09:15:00.000Z"
      },
      {
        "_id": "64f7c8e9a1b2c3d4e5f6g7ha",
        "action": "UPDATE",
        "user": { "name": "Kitchen Staff" },
        "changes": [
          { "field": "status", "oldValue": "confirmed", "newValue": "preparing" }
        ],
        "createdAt": "2026-08-18T09:30:00.000Z"
      }
    ]
  }
}
```

**Use Case:** Display "Change History" timeline in order detail page

---

## 4. Get Correlated Logs

**Endpoint:** `GET /api/v1/audit-logs/correlation/:correlationId`  
**RBAC Task Required:** `audit.logs.correlation`  
**Description:** Get all logs related to a single request (distributed tracing)

### Example Request

```javascript
// Trace all operations from a single order placement request
const response = await fetch(
  `${API_BASE}/audit-logs/correlation/req-123e4567-e89b-12d3-a456-426614174000`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
```

### Response Schema

```json
{
  "status": "success",
  "results": 4,
  "data": {
    "logs": [
      {
        "action": "CREATE",
        "resource": "Order",
        "createdAt": "2026-08-18T09:00:00.000Z"
      },
      {
        "action": "CREATE",
        "resource": "Payment",
        "createdAt": "2026-08-18T09:00:01.000Z"
      },
      {
        "action": "CREATE",
        "resource": "KitchenTicket",
        "createdAt": "2026-08-18T09:00:02.000Z"
      },
      {
        "action": "CREATE",
        "resource": "OutboxEvent",
        "metadata": { "eventType": "order.created" },
        "createdAt": "2026-08-18T09:00:03.000Z"
      }
    ]
  }
}
```

**Use Case:** Debug complex workflows, trace order creation → payment → kitchen ticket flow

---

## 5. Export Audit Logs

**Endpoint:** `GET /api/v1/audit-logs/export`  
**RBAC Task Required:** `audit.logs.export`  
**Description:** Export filtered audit logs as CSV file

### Query Parameters

Accepts same filters as [Query Audit Logs](#1-query-audit-logs)

### Example Request

```javascript
// Export order changes for last 30 days
const response = await fetch(
  `${API_BASE}/audit-logs/export?` + new URLSearchParams({
    resource: 'Order',
    startDate: '2026-07-18T00:00:00Z',
    endDate: '2026-08-18T23:59:59Z'
  }),
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

// Response is CSV file
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `audit-logs-${new Date().toISOString()}.csv`;
a.click();
```

### Response

```
Content-Type: text/csv
Content-Disposition: attachment; filename="audit-logs-2026-08-18.csv"

ID,User,Action,Resource,Resource ID,Status,Changes,IP,Created At
64f7c8...,john@restaurant.com,UPDATE,Order,64f7c8...,200,"status: pending → confirmed",192.168.1.100,2026-08-18T09:00:00Z
...
```

**Use Case:** Compliance reporting, export for Excel analysis

---

## 6. Get Audit Statistics

**Endpoint:** `GET /api/v1/audit-logs/stats`  
**RBAC Task Required:** `audit.logs.stats`  
**Description:** Get aggregated statistics for dashboard widgets

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | ISO8601 | No | Stats period start |
| `endDate` | ISO8601 | No | Stats period end |

### Example Request

```javascript
// Get stats for last 7 days
const endDate = new Date().toISOString();
const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const response = await fetch(
  `${API_BASE}/audit-logs/stats?` + new URLSearchParams({
    startDate,
    endDate
  }),
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
```

### Response Schema

```json
{
  "status": "success",
  "data": {
    "stats": {
      "totalLogs": 1247,
      "byAction": {
        "CREATE": 423,
        "UPDATE": 612,
        "DELETE": 89,
        "LOGIN": 123
      },
      "byResource": {
        "Order": 534,
        "Menu": 189,
        "User": 234,
        "Payment": 178,
        "KitchenTicket": 112
      },
      "bySeverity": {
        "low": 1050,
        "medium": 145,
        "high": 42,
        "critical": 10
      },
      "byOutcome": {
        "success": 1198,
        "failure": 37,
        "partial": 12
      },
      "topUsers": [
        {
          "_id": "64f7c8e9a1b2c3d4e5f6g7h9",
          "name": "John Doe",
          "email": "john@restaurant.com",
          "actionCount": 234
        },
        {
          "_id": "64f7c8e9a1b2c3d4e5f6g7ha",
          "name": "Jane Smith",
          "email": "jane@restaurant.com",
          "actionCount": 198
        }
      ],
      "recentCritical": [
        {
          "_id": "64f7c8e9a1b2c3d4e5f6g7hb",
          "action": "USER_SUSPEND",
          "resource": "User",
          "user": { "name": "Admin User" },
          "createdAt": "2026-08-18T08:00:00.000Z"
        }
      ]
    }
  }
}
```

**Use Case:** Dashboard overview, security monitoring, activity heatmaps

---

## 7. Data Models

### Audit Log Object

```typescript
interface AuditLog {
  _id: string;
  user: {
    _id: string;
    name: string;
    email: string;
    role?: {
      name: string;
      isSystemRole: boolean;
    };
  } | null; // Null for system operations
  
  merchant: string; // ObjectId
  branch?: string; // ObjectId (optional)
  
  action: AuditAction;
  resource: ResourceType;
  resourceId: string | null;
  
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  endpoint: string;
  statusCode: number;
  
  correlationId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  outcome: 'success' | 'failure' | 'partial';
  duration?: number; // milliseconds
  
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  
  ip?: string;
  userAgent?: string;
  
  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
}
```

### Audit Actions

```typescript
type AuditAction =
  // CRUD
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  
  // Auth
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'TOKEN_REFRESH'
  
  // Order
  | 'ORDER_STATUS_CHANGE'
  | 'ORDER_CANCEL'
  | 'PAYMENT_RECEIVED'
  | 'REFUND_ISSUED'
  
  // Kitchen
  | 'TICKET_CREATED'
  | 'TICKET_STATUS_CHANGE'
  | 'TICKET_ASSIGNED'
  
  // Inventory
  | 'INVENTORY_ADJUST'
  | 'INVENTORY_BATCH_ADJUST'
  | 'STOCK_ALERT'
  
  // User Management
  | 'ROLE_ASSIGN'
  | 'ROLE_REVOKE'
  | 'TASK_ASSIGN'
  | 'USER_SUSPEND'
  | 'USER_ACTIVATE'
  
  // Merchant/Branch
  | 'MERCHANT_APPROVE'
  | 'MERCHANT_SUSPEND'
  | 'BRANCH_CREATE'
  | 'BRANCH_SUSPEND'
  
  // Menu
  | 'MENU_PUBLISH'
  | 'MENU_UNPUBLISH'
  | 'PRICE_CHANGE'
  
  // Reports
  | 'REPORT_ACCESS'
  | 'REPORT_EXPORT';
```

### Resource Types

```typescript
type ResourceType =
  // Core
  | 'User'
  | 'Role'
  | 'Merchant'
  | 'Branch'
  
  // Operations
  | 'Order'
  | 'Menu'
  | 'Table'
  | 'Payment'
  | 'Subscription'
  
  // Kitchen
  | 'KitchenTicket'
  | 'KitchenStation'
  
  // Inventory
  | 'Ingredient'
  | 'Supplier'
  | 'Recipe'
  | 'PurchaseOrder'
  
  // Other
  | 'Invitation'
  | 'AuditLog'
  | 'ExportJob';
```

---

## 8. UI Components Guide

### 8.1 Audit Logs Table Component

**Recommended Features:**
- Sortable columns
- Filterable by resource, action, user, date range
- Pagination
- Severity badge colors
- Row click → detail modal

**Sample React Component Structure:**

```jsx
<AuditLogsTable
  filters={{
    resource: selectedResource,
    action: selectedAction,
    startDate: dateRange.start,
    endDate: dateRange.end,
    severity: selectedSeverity
  }}
  page={currentPage}
  limit={20}
  onRowClick={(log) => setSelectedLog(log)}
/>
```

### 8.2 Severity Badge

```jsx
const SeverityBadge = ({ severity }) => {
  const colors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-blue-100 text-blue-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800'
  };
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[severity]}`}>
      {severity.toUpperCase()}
    </span>
  );
};
```

### 8.3 Change History Timeline

Display resource history as a vertical timeline:

```jsx
<Timeline>
  {history.map(log => (
    <TimelineItem key={log._id}>
      <TimelineMarker color={getActionColor(log.action)} />
      <TimelineContent>
        <div className="font-medium">{log.action}</div>
        <div className="text-sm text-gray-500">
          by {log.user.name} • {formatDate(log.createdAt)}
        </div>
        {log.changes.map(change => (
          <div className="text-sm mt-1" key={change.field}>
            <span className="font-mono">{change.field}</span>:
            <span className="line-through text-red-500"> {change.oldValue}</span>
            → <span className="text-green-500">{change.newValue}</span>
          </div>
        ))}
      </TimelineContent>
    </TimelineItem>
  ))}
</Timeline>
```

### 8.4 Dashboard Statistics Widgets

```jsx
<div className="grid grid-cols-4 gap-4">
  <StatCard
    title="Total Logs Today"
    value={stats.totalLogs}
    trend="+12%"
  />
  <StatCard
    title="Critical Events"
    value={stats.bySeverity.critical}
    alert={stats.bySeverity.critical > 5}
  />
  <StatCard
    title="Failed Operations"
    value={stats.byOutcome.failure}
    alert={stats.byOutcome.failure > 10}
  />
  <StatCard
    title="Most Active User"
    value={stats.topUsers[0].name}
    subtitle={`${stats.topUsers[0].actionCount} actions`}
  />
</div>
```

---

## 9. Common Use Cases

### 9.1 Order Change History (Order Detail Page)

```javascript
// Fetch all changes to this order
const response = await fetch(
  `${API_BASE}/audit-logs/resource/Order/${orderId}`,
  { headers: { 'Authorization': `Bearer ${token}` }}
);

const { data } = await response.json();

// Display as timeline in order detail page
<OrderChangeHistory logs={data.logs} />
```

### 9.2 User Activity Report

```javascript
// Fetch all actions by specific user in date range
const response = await fetch(
  `${API_BASE}/audit-logs?` + new URLSearchParams({
    userId: selectedUserId,
    startDate: '2026-08-01T00:00:00Z',
    endDate: '2026-08-18T23:59:59Z',
    limit: '100'
  }),
  { headers: { 'Authorization': `Bearer ${token}` }}
);
```

### 9.3 Security Dashboard - Failed Logins

```javascript
// Monitor failed login attempts
const response = await fetch(
  `${API_BASE}/audit-logs?` + new URLSearchParams({
    action: 'LOGIN',
    outcome: 'failure',
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    severity: 'high'
  }),
  { headers: { 'Authorization': `Bearer ${token}` }}
);

// Alert if > 10 failed attempts
if (data.data.pagination.total > 10) {
  showSecurityAlert();
}
```

### 9.4 Inventory Change Tracking

```javascript
// Track who adjusted inventory
const response = await fetch(
  `${API_BASE}/audit-logs?` + new URLSearchParams({
    resource: 'Ingredient',
    action: 'UPDATE',
    startDate: todayStart.toISOString(),
    endDate: todayEnd.toISOString()
  }),
  { headers: { 'Authorization': `Bearer ${token}` }}
);

// Show in inventory management dashboard
<InventoryAuditTable logs={data.data.logs} />
```

### 9.5 Payment Verification

```javascript
// Verify payment was processed correctly
const response = await fetch(
  `${API_BASE}/audit-logs/resource/Payment/${paymentId}`,
  { headers: { 'Authorization': `Bearer ${token}` }}
);

// Check for status changes
const statusChanges = data.data.logs
  .flatMap(log => log.changes)
  .filter(change => change.field === 'status');

console.log('Payment status history:', statusChanges);
```

### 9.6 Compliance Report Export

```javascript
// Export all critical events for compliance audit
const response = await fetch(
  `${API_BASE}/audit-logs/export?` + new URLSearchParams({
    severity: 'critical',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z'
  }),
  { headers: { 'Authorization': `Bearer ${token}` }}
);

const blob = await response.blob();
// Save as compliance-report-2026.csv
```

---

## 🔒 RBAC Tasks Reference

Your users need these RBAC tasks assigned to access audit endpoints:

| Task Name | Endpoint | Description |
|-----------|----------|-------------|
| `audit.logs.list` | `GET /audit-logs` | View audit logs list |
| `audit.logs.view` | `GET /audit-logs/:id` | View single log detail |
| `audit.logs.resource-history` | `GET /audit-logs/resource/:resource/:id` | View resource history |
| `audit.logs.correlation` | `GET /audit-logs/correlation/:correlationId` | View correlated logs |
| `audit.logs.export` | `GET /audit-logs/export` | Export logs to CSV |
| `audit.logs.stats` | `GET /audit-logs/stats` | View statistics |

**Super Admin** automatically has access to all audit endpoints.

---

## 🎨 Recommended UI Pages

### 1. **Audit Logs Dashboard** (`/audit-logs`)
- Statistics cards (total logs, critical events, etc.)
- Recent activity table
- Filters sidebar (resource, action, user, date range)
- Export button

### 2. **Resource History Modal**
- Triggered from detail pages (Order detail, User profile, etc.)
- Shows timeline of all changes
- "View in Audit Logs" link

### 3. **Security Monitoring** (`/security/audit`)
- Failed login attempts
- Suspicious activity alerts
- User activity heatmap
- Real-time log streaming (WebSocket)

### 4. **Compliance Reports** (`/compliance/audit`)
- Date range selector
- Filter by severity/resource
- Export to CSV for regulators
- Summary statistics

---

## 🚀 Quick Start Checklist

- [ ] Set up API client with authentication
- [ ] Create `AuditLogsTable` component with filters
- [ ] Add "View History" button to Order/User detail pages
- [ ] Implement `ResourceHistoryModal` component
- [ ] Add audit statistics to dashboard
- [ ] Create export functionality for CSV downloads
- [ ] Set up RBAC tasks for your roles
- [ ] Test all endpoints with Postman/Insomnia
- [ ] Add error handling for 401/403/404 responses
- [ ] Implement pagination UI

---

## 📞 Support

For API issues or questions:
- Check backend logs: `logs/combined.log`
- Verify RBAC tasks are assigned
- Confirm JWT token is valid
- Check merchant context in token payload

---

**Happy Integrating! 🎉**
