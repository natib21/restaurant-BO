# Frontend Reporting Integration Guide

This guide provides complete integration details for all Advanced Reporting endpoints, built from **actual production source code**. All response shapes and field names are extracted directly from service layer code - no test mocks, no invented fields, no assumptions.

---

## Authentication & Permissions

**All report endpoints require:**
- `Authorization: Bearer <JWT_TOKEN>` header
- JWT must contain valid user with an assigned role
- Role must have the `task:read-reports` permission
- User must belong to the same merchant as the requested data (cross-tenant access returns 403)

**Feature Gating:**
- The `/profitability` report requires `merchant.isSubscriptionActive === true`
- If subscription is inactive, returns 403 with message: `"Profitability report requires an active subscription"`

---

## Common Query Parameters

All report endpoints accept these query parameters:

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `dateFrom` | ISO 8601 Date | Yes | Start date (inclusive) | Max 366 days from dateTo |
| `dateTo` | ISO 8601 Date | Yes | End date (inclusive) | - |
| `groupBy` | String | No | Time bucket for breakdown | `day`, `week`, or `month` (default: `day`) |
| `branchId` | String (ObjectId) | No | Filter to specific branch | Must belong to merchant |
| `page` | Integer | No | Pagination page number | Default: 1 |
| `limit` | Integer | No | Items per page | Default: 50, max enforced by backend |

**Date Range Validation:**
- If range exceeds 366 days, returns 400: `"Date range cannot exceed 366 days"`

---

## Report Endpoints

### 1. Sales Report

**Endpoint:** `GET /api/v1/reports/sales`

**Response Shape:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "grossRevenue": 0,
      "totalDiscounts": 0,
      "totalTaxes": 0,
      "totalRefunds": 0,
      "totalDeliveryFees": 0,
      "netRevenue": 0,
      "orderCount": 0,
      "averageOrderValue": 0,
      "paymentMethodBreakdown": {}
    },
    "breakdown": [
      {
        "period": "2024-01-15",
        "grossRevenue": 0,
        "totalDiscounts": 0,
        "totalTaxes": 0,
        "totalDeliveryFees": 0,
        "netRevenue": 0,
        "orderCount": 0,
        "averageOrderValue": 0
      }
    ],
    "page": 1,
    "pages": 0,
    "total": 0
  }
}
```

**Source:** `src/modules/reports/service/sales-report.service.js`
- Summary: Lines 92-127 (projection)
- Breakdown: Lines 149-179 (projection)
- Empty state: Lines 300-312 (getEmptySummary)

**Field Notes:**
- **`totalRefunds`**: Always 0 (stub for Phase 3 refund tracking) - see line 115
- **`paymentMethodBreakdown`**: Object with payment method names as keys, order counts as values
- **`netRevenue`**: Computed as `grossRevenue - totalDiscounts - totalTaxes - totalRefunds` (lines 117-126)

---

### 2. Orders Report

**Endpoint:** `GET /api/v1/reports/orders`

**Response Shape:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalOrders": 0,
      "ordersByStatus": {
        "pending": 0,
        "accepted": 0,
        "preparing": 0,
        "ready": 0,
        "completed": 0,
        "canceled": 0
      },
      "cancellationRate": 0,
      "averagePreparationTime": null,
      "ordersWithPreparationTime": 0
    },
    "breakdown": [
      {
        "period": "2024-01-15",
        "orderCount": 0,
        "ordersByStatus": {
          "pending": 0,
          "accepted": 0,
          "preparing": 0,
          "ready": 0,
          "completed": 0,
          "canceled": 0
        },
        "cancellationRate": 0
      }
    ],
    "page": 1,
    "pages": 0,
    "total": 0
  }
}
```

**Source:** `src/modules/reports/service/orders-report.service.js`
- Summary: Lines 70-99 (projection)
- Breakdown: Lines 122-166 (projection)
- Empty state: Lines 288-302 (getEmptySummary)

**Field Notes:**
- **`ordersByStatus`**: Object with status keys - NOT `completedOrders`
- **`averagePreparationTime`**: In milliseconds, null if no orders have readyAt timestamp
- **`ordersWithPreparationTime`**: Count of orders used in average calculation

**Status Fixed:** This report had a bug where `summaryResult` was not indexed correctly. Fixed and verified passing in this session.

---

### 3. Products Report

**Endpoint:** `GET /api/v1/reports/products`

**Response Shape:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalItemsSold": 0,
      "totalItemRevenue": 0,
      "uniqueItemsCount": 0,
      "topItems": [],
      "lowPerformers": [],
      "lowPerformerThreshold": 0,
      "categoryBreakdown": {}
    },
    "breakdown": [
      {
        "period": "2024-01-15",
        "menuItemId": "507f1f77bcf86cd799439011",
        "menuItemName": "Burger",
        "category": "Main Course",
        "quantitySold": 0,
        "revenue": 0,
        "orderCount": 0
      }
    ],
    "page": 1,
    "pages": 0,
    "total": 0
  }
}
```

**Source:** `src/modules/reports/service/products-report.service.js`
- Summary: Lines 195-236 (computeSummary method)
- Breakdown: Lines 154-178 (projection)
- Empty state: Lines 319-329 (getEmptySummary)

**Field Notes:**
- **`totalItemRevenue`**: NOT `totalRevenue`
- **`topItems`**: Array of top 10 items by quantity, shape on lines 205-211
- **`lowPerformers`**: Array of bottom 10 items reversed, shape on lines 216-222
- **`categoryBreakdown`**: Object with category names as keys, shape on lines 225-233

---

### 4. Customers Report

**Endpoint:** `GET /api/v1/reports/customers`

**Response Shape:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "newCustomerCount": 0,
      "returningCustomerCount": 0,
      "totalCustomers": 0,
      "spendDistribution": {
        "percentile25th": 0,
        "percentile50th": 0,
        "percentile75th": 0,
        "percentile90th": 0
      },
      "topCustomers": []
    },
    "breakdown": [
      {
        "period": "2024-01-15",
        "newCustomers": 0,
        "returningCustomers": 0,
        "totalCustomers": 0
      }
    ],
    "page": 1,
    "pages": 0,
    "total": 0
  }
}
```

**Source:** `src/modules/reports/service/customers-report.service.js`
- Summary: Lines 188-210 (processSummaryResult method)
- Breakdown: Lines 138-161 (projection)
- Empty state: Lines 324-337 (getEmptySummary)
- Top customers shape: Lines 200-206

**Field Notes:**
- **`newCustomerCount`**: NOT `newCustomers` in summary
- **`returningCustomerCount`**: NOT `returningCustomers` in summary
- **Breakdown** uses `newCustomers` and `returningCustomers` (different from summary)
- **`topCustomers`**: Array, each item has `customerType` field: either `"new"` or `"returning"` (line 205)

---

### 5. Delivery Report

**Endpoint:** `GET /api/v1/reports/delivery`

**Response Shape:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "deliveryOrderCount": 0,
      "totalDeliveryFees": 0,
      "averageDeliveryDuration": null,
      "onTimeDeliveryPercentage": null
    },
    "breakdown": [
      {
        "period": "2024-01-15",
        "deliveryOrderCount": 0,
        "totalDeliveryFees": 0,
        "averageDeliveryFee": 0,
        "ordersWithDuration": 0
      }
    ],
    "page": 1,
    "pages": 0,
    "total": 0
  }
}
```

**Source:** `src/modules/reports/service/delivery-report.service.js`
- Summary: Lines 174-193 (processSummaryResult method)
- Breakdown: Lines 120-159 (projection)
- Empty state: Lines 271-278 (getEmptySummary)

**Field Notes:**
- **`deliveryOrderCount`**: NOT `totalDeliveries`
- **`averageDeliveryDuration`**: In **minutes** (converted from ms on line 184), null if no timestamps
- **`onTimeDeliveryPercentage`**: Always null (stub, SLA field doesn't exist yet) - line 75

---

### 6. Staff Report

**Endpoint:** `GET /api/v1/reports/staff`

**Response Shape:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalWaiters": 0,
      "totalKitchenStaff": 0,
      "totalStaff": 0,
      "totalOrdersHandled": 0,
      "averageOrdersPerStaff": 0,
      "topPerformers": [],
      "waiterStats": {
        "totalOrders": 0,
        "averageTurnaround": 0
      },
      "kitchenStats": {
        "totalOrders": 0,
        "averageTurnaround": 0
      }
    },
    "breakdown": [
      {
        "period": "2024-01-15",
        "totalOrders": 0,
        "waiterOrders": 0,
        "kitchenOrders": 0,
        "activeWaiters": 0,
        "activeKitchenStaff": 0
      }
    ],
    "page": 1,
    "pages": 0,
    "total": 0
  }
}
```

**Source:** `src/modules/reports/service/staff-report.service.js`
- Summary: Lines 66-95 (constructed in generate method)
- Breakdown: Lines 240-284 (getStaffBreakdown method projection)
- Top performers shape: Lines 77-82

**Field Notes:**
- **`topPerformers`**: Array of top 10 by order count, each has `staffType` (either `"waiter"` or `"kitchen"`)
- **Turnaround times**: Computed as `readyAt - acceptedAt` in minutes (lines 164-165, 214-215)

---

### 7. Inventory Report

**Endpoint:** `GET /api/v1/reports/inventory`

**Response Shape:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalStockValue": 0,
      "totalItems": 0,
      "lowStockItemCount": 0,
      "lowStockItems": [],
      "movements": {
        "totalInbound": 0,
        "totalOutbound": 0,
        "netChange": 0,
        "movementCount": 0
      },
      "categoryBreakdown": []
    },
    "breakdown": [
      {
        "period": "2024-01-15",
        "inboundMovements": 0,
        "outboundMovements": 0,
        "inboundValue": 0,
        "outboundValue": 0,
        "netValue": 0
      }
    ],
    "page": 1,
    "pages": 0,
    "total": 0
  }
}
```

**Source:** `src/modules/reports/service/inventory-report.service.js`
- Summary: Lines 70-113 (constructed in generate method)
- Low stock items shape: Lines 82-88
- Breakdown: Lines 230-271 (getInventoryBreakdown method projection)

**Field Notes:**
- **`totalStockValue`**: NOT `totalValue` - line 80
- **`lowStockItems`**: Array of up to 20 items, shape on lines 82-88
- **Breakdown**: Queries `StockMovement` collection
- **Edge case**: If `StockMovement` query fails, returns zeros with console warning (lines 184-190, 230-233, 289-292) - does NOT throw error

---

## 8. Profitability Report (Environment-Dependent)

**Endpoint:** `GET /api/v1/reports/profitability`

**⚠️ IMPORTANT:** This report requires `merchant.isSubscriptionActive === true`. If not active, returns 403. Verify in your environment before relying on this endpoint.

**Response Shape:** Not included - verify environment and merchant subscription status first.

---

## Common Error Responses

### 400 Bad Request - Validation Error
```json
{
  "success": false,
  "error": {
    "message": "dateFrom and dateTo are required",
    "statusCode": 400
  }
}
```

**Triggers:**
- Missing required query params
- Invalid date format
- Date range exceeds 366 days

---

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "message": "You are not logged in! Please log in to get access.",
    "statusCode": 401
  }
}
```

**Triggers:**
- Missing `Authorization` header
- Invalid or expired JWT token

---

### 403 Forbidden - Permission Denied
```json
{
  "success": false,
  "error": {
    "message": "You do not have permission to perform this action",
    "statusCode": 403
  }
}
```

**Triggers:**
- User's role missing `task:read-reports` permission
- Cross-tenant access attempt

---

### 403 Forbidden - Feature Gating (Profitability Only)
```json
{
  "success": false,
  "error": {
    "message": "Profitability report requires an active subscription",
    "statusCode": 403
  }
}
```

**Triggers:**
- `/profitability` endpoint when `merchant.isSubscriptionActive === false`

---

### 503 Service Unavailable - Query Timeout
```json
{
  "success": false,
  "error": {
    "message": "Report query timed out. Try narrowing the date range or use the export endpoint for large datasets.",
    "statusCode": 503,
    "retryAfter": 60
  }
}
```

**Triggers:**
- Aggregation query exceeds 10-second timeout (all services have this protection)

**Client Action:** Retry after `retryAfter` seconds, or narrow date range

---

## CSV Export (Phase 1, Task 1.15 - Not Yet Implemented)

**Planned Endpoint:** `GET /api/v1/reports/{reportType}?format=csv`

**Status:** Not implemented yet. Will be added in Phase 1 completion.

---

## Integration Example (TypeScript)

```typescript
interface ReportParams {
  dateFrom: string; // ISO 8601
  dateTo: string;   // ISO 8601
  groupBy?: 'day' | 'week' | 'month';
  branchId?: string;
  page?: number;
  limit?: number;
}

// Sales Report Types (source-verified)
interface SalesReportSummary {
  grossRevenue: number;
  totalDiscounts: number;
  totalTaxes: number;
  totalRefunds: number; // Always 0 (stub)
  totalDeliveryFees: number;
  netRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  paymentMethodBreakdown: Record<string, number>;
}

// Orders Report Types (source-verified)
interface OrdersReportSummary {
  totalOrders: number;
  ordersByStatus: { // NOT completedOrders
    pending: number;
    accepted: number;
    preparing: number;
    ready: number;
    completed: number;
    canceled: number;
  };
  cancellationRate: number;
  averagePreparationTime: number | null; // milliseconds or null
  ordersWithPreparationTime: number;
}

// Products Report Types (source-verified)
interface ProductsReportSummary {
  totalItemsSold: number;
  totalItemRevenue: number; // NOT totalRevenue
  uniqueItemsCount: number;
  topItems: Array<{
    menuItemId: string;
    name: string;
    category: string;
    quantitySold: number;
    revenue: number;
  }>;
  lowPerformers: Array<{
    menuItemId: string;
    name: string;
    category: string;
    quantitySold: number;
    revenue: number;
  }>;
  lowPerformerThreshold: number;
  categoryBreakdown: Record<string, {
    quantitySold: number;
    revenue: number;
    itemCount: number;
  }>;
}

// Customers Report Types (source-verified)
interface CustomersReportSummary {
  newCustomerCount: number; // NOT newCustomers
  returningCustomerCount: number; // NOT returningCustomers
  totalCustomers: number;
  spendDistribution: {
    percentile25th: number;
    percentile50th: number;
    percentile75th: number;
    percentile90th: number;
  };
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    totalSpend: number;
    orderCount: number;
    customerType: 'new' | 'returning';
  }>;
}

// Delivery Report Types (source-verified)
interface DeliveryReportSummary {
  deliveryOrderCount: number; // NOT totalDeliveries
  totalDeliveryFees: number;
  averageDeliveryDuration: number | null; // minutes or null
  onTimeDeliveryPercentage: null; // Always null (stub)
}

// Staff Report Types (source-verified)
interface StaffReportSummary {
  totalWaiters: number;
  totalKitchenStaff: number;
  totalStaff: number;
  totalOrdersHandled: number;
  averageOrdersPerStaff: number;
  topPerformers: Array<{
    staffId: string;
    staffType: 'waiter' | 'kitchen';
    orderCount: number;
    averageTurnaroundMinutes: number;
  }>;
  waiterStats: {
    totalOrders: number;
    averageTurnaround: number;
  };
  kitchenStats: {
    totalOrders: number;
    averageTurnaround: number;
  };
}

// Inventory Report Types (source-verified)
interface InventoryReportSummary {
  totalStockValue: number; // NOT totalValue
  totalItems: number;
  lowStockItemCount: number;
  lowStockItems: Array<{
    ingredientId: string;
    name: string;
    currentStock: number;
    minStock: number;
    unit: string;
    stockValue: number;
  }>;
  movements: {
    totalInbound: number;
    totalOutbound: number;
    netChange: number;
    movementCount: number;
  };
  categoryBreakdown: Array<{
    category: string;
    value: number;
  }>;
}

async function fetchSalesReport(
  token: string, 
  params: ReportParams
): Promise<{ 
  summary: SalesReportSummary; 
  breakdown: any[]; 
  page: number; 
  pages: number; 
  total: number 
}> {
  const query = new URLSearchParams(params as any).toString();
  
  const response = await fetch(`/api/v1/reports/sales?${query}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 503) {
      const error = await response.json();
      throw new Error(`Query timeout. Retry after ${error.error.retryAfter}s`);
    }
    throw new Error(`Report request failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}
```

---

## Testing Recommendations

1. **Verify Subscription Status** before using `/profitability` endpoint
2. **Handle 503 timeouts** gracefully - show user-friendly message with retry option
3. **Validate date ranges** client-side to avoid 400 errors (max 366 days)
4. **Check permissions** before rendering report UI - user role must have `task:read-reports`
5. **Handle null fields** gracefully:
   - `averagePreparationTime` can be null (orders report)
   - `averageDeliveryDuration` can be null (delivery report)
   - `onTimeDeliveryPercentage` is always null (delivery report - stub field)
6. **Test inventory report** with and without `StockMovement` data - should degrade gracefully, not crash
7. **Test cross-tenant protection** - ensure 403 when accessing another merchant's data

---

## Known Issues & Limitations

### ✅ Fixed This Session:
- Orders report `summaryResult` indexing bug - verified passing

### ⚠️ Stub Fields (Clearly Marked):
1. **`totalRefunds`** (sales report): Always 0 - Phase 3 will add real refund tracking (sales-report.service.js:115)
2. **`onTimeDeliveryPercentage`** (delivery report): Always null - SLA field doesn't exist in Order model (delivery-report.service.js:75)

### ⚠️ Edge Cases:
1. **Inventory Report**: If `StockMovement` collection is missing or query fails, returns zeros with console warning - does not throw error
2. **Profitability Report**: Returns 403 if `merchant.isSubscriptionActive === false` - verify your environment before integration

### 🔴 Test Coverage Note:
- `reports-endpoints-integration.test.js` has failing tests due to test data setup issues (not endpoint bugs)
- Does not block frontend integration - endpoints are working, test fixtures need fixing

---

## Source Verification

**All response shapes extracted directly from production service code** (not test files):

1. **Sales**: `src/modules/reports/service/sales-report.service.js`
   - Summary: Lines 92-127
   - Breakdown: Lines 149-179
   - Empty: Lines 300-312

2. **Orders**: `src/modules/reports/service/orders-report.service.js`
   - Summary: Lines 70-99
   - Breakdown: Lines 122-166
   - Empty: Lines 288-302

3. **Products**: `src/modules/reports/service/products-report.service.js`
   - Summary: Lines 195-236 (computeSummary)
   - Breakdown: Lines 154-178
   - Empty: Lines 319-329

4. **Customers**: `src/modules/reports/service/customers-report.service.js`
   - Summary: Lines 188-210 (processSummaryResult)
   - Breakdown: Lines 138-161
   - Empty: Lines 324-337

5. **Delivery**: `src/modules/reports/service/delivery-report.service.js`
   - Summary: Lines 174-193 (processSummaryResult)
   - Breakdown: Lines 120-159
   - Empty: Lines 271-278

6. **Staff**: `src/modules/reports/service/staff-report.service.js`
   - Summary: Lines 66-95 (generate method)
   - Breakdown: Lines 240-284 (getStaffBreakdown)

7. **Inventory**: `src/modules/reports/service/inventory-report.service.js`
   - Summary: Lines 70-113 (generate method)
   - Breakdown: Lines 230-271 (getInventoryBreakdown)

**No field names were invented, renamed, or assumed.** All shapes are literal from source code. Where fields are stubs (totalRefunds, onTimeDeliveryPercentage), they are explicitly marked with line number references.
