# Technical Design Document — Advanced Reporting

## Overview

The Advanced Reporting module provides comprehensive real-time analytics for restaurant operations through MongoDB aggregation pipelines. It transforms transactional data from existing collections (Orders, Inventory, Users, Customers, MenuItems) into actionable business intelligence without owning persistent data.

### Key Design Principles

1. **Read-Only Architecture**: No persistent data ownership except optional export job metadata
2. **Real-Time Aggregation**: Direct MongoDB aggregation pipelines for ≤366 day ranges
3. **Multi-Tenant Isolation**: Strict `merchantId` scoping following existing patterns
4. **Consistent Response Format**: Unified envelope structure across all endpoints
5. **Dual Export Strategy**: Synchronous CSV for summaries, asynchronous jobs for large datasets
6. **Cost Tracking Foundation**: COGS calculation via snapshotted `unitCost` on order items

### System Context

```
┌─────────────────────────────────────────────────────────────┐
│                    Report Module (New)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐       │
│  │ Sales Report│  │Order Report │  │Product Report│  ...   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘       │
│         │                │                 │                │
└─────────┼────────────────┼─────────────────┼────────────────┘
          │                │                 │
          ▼                ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Existing Collections (Queried)                 │
│  Order │ MenuItem │ Ingredient │ Customer │ User │ Inventory│
└─────────────────────────────────────────────────────────────┘
```

## Architecture

### Module Structure

```
src/modules/reports/
├── reports.routes.js                    # Route definitions with middleware chain
├── controller/
│   └── report.controller.js             # HTTP handlers with consistent envelope
├── service/
│   ├── sales-report.service.js          # Revenue, discounts, taxes, AOV
│   ├── orders-report.service.js         # Volume, cancellation, time-to-ready
│   ├── products-report.service.js       # Top sellers, low performers, category
│   ├── customers-report.service.js      # New vs returning, spend distribution
│   ├── delivery-report.service.js       # Delivery metrics, fees, duration
│   ├── profitability-report.service.js  # COGS, gross profit, margins
│   ├── staff-report.service.js          # Staff productivity, turnaround time
│   ├── inventory-report.service.js      # Stock valuation, movements
│   └── export.service.js                # Async export job orchestration
└── validators/
    └── report.validators.js             # Shared Zod schemas
```

### Data Flow

```
┌──────────┐
│ Frontend │
│ Dashboard│
└────┬─────┘
     │ GET /api/v1/reports/sales?dateFrom=...&dateTo=...&branchId=...
     ▼
┌────────────────────────────────────────────────────────────┐
│  Middleware Chain                                          │
│  protect → restrictTo() → requireFeature('reports')        │
│  → validate(reportQuerySchema)                             │
└────┬───────────────────────────────────────────────────────┘
     ▼
┌────────────────────────────────────────────────────────────┐
│  Controller                                                │
│  - Extract merchantId from JWT (never from params)         │
│  - Validate date range (≤366 days for JSON)               │
│  - Delegate to service layer                               │
└────┬───────────────────────────────────────────────────────┘
     ▼
┌────────────────────────────────────────────────────────────┐
│  Service Layer                                             │
│  - Build aggregation pipeline with tenant $match           │
│  - Execute against Order/Ingredient/Customer collections   │
│  - Compute summary + paginated breakdown                   │
└────┬───────────────────────────────────────────────────────┘
     ▼
┌────────────────────────────────────────────────────────────┐
│  MongoDB Aggregation Pipeline                              │
│  $match (merchant + branch + dateRange)                    │
│  → $group (by groupBy bucket: day/week/month)             │
│  → $project (computed fields: AOV, margins, etc.)         │
│  → $sort → $skip → $limit (pagination)                    │
└────┬───────────────────────────────────────────────────────┘
     ▼
┌────────────────────────────────────────────────────────────┐
│  Response Envelope                                         │
│  {                                                         │
│    status: 'success',                                      │
│    data: { summary: {...}, breakdown: [...] },            │
│    meta: { dateFrom, dateTo, branchId, page, pages }      │
│  }                                                         │
└────────────────────────────────────────────────────────────┘
```

### Middleware Chain Pattern

Following existing authentication and authorization patterns:

```javascript
// reports.routes.js
router.use(protect);                          // JWT authentication (existing)
router.use(requireFeature('reports'));        // Subscription feature gate (existing)

router.get('/sales',
  validate(reportQuerySchema, 'query'),       // Zod validation (existing pattern)
  restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN'),// Role authorization (existing)
  getSalesReport                               // Controller handler
);
```

**Security Layers**:
1. `protect`: Validates JWT, attaches `req.user`, extracts merchant context
2. `requireFeature('reports')`: Checks merchant subscription includes reports feature
3. `restrictTo()`: Validates user role has required permissions
4. `validate()`: Validates query parameters against Zod schema
5. **Tenant Isolation**: `getMerchantId(req)` in controller, never trust client-provided merchantId

## Components and Interfaces

### 1. Query Validation Schema

**Shared Zod Schema** (validators/report.validators.js):

```javascript
const reportQuerySchema = z.object({
  dateFrom: z.string().datetime().describe('Start date (ISO 8601)'),
  dateTo: z.string().datetime().describe('End date (ISO 8601)'),
  branchId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  format: z.enum(['json', 'csv']).default('json')
});
```

**Validation Logic**:
- Date range calculation and 366-day limit check
- Branch ownership verification (branchId must belong to merchant)
- Format-specific validations (CSV only supports summary, not breakdown pagination)

### 2. Controller Pattern

**Consistent Handler Structure** (controller/report.controller.js):

```javascript
exports.getSalesReport = catchAsync(async (req, res, next) => {
  // 1. Extract tenant context (never trust client)
  const merchantId = getMerchantId(req);
  if (!merchantId) throw new AppError('Merchant context required', 401);

  // 2. Validate date range
  const { dateFrom, dateTo, branchId, groupBy, page, limit, format } = req.query;
  const daysDiff = (new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24);
  
  if (daysDiff > 366 && format === 'json') {
    throw new AppError(
      'Date range exceeds 366 days. Use export endpoint for larger ranges.',
      400
    );
  }

  // 3. Verify branch ownership if provided
  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, merchant: merchantId });
    if (!branch) throw new AppError('Branch not found or access denied', 403);
  }

  // 4. Delegate to service
  const result = await SalesReportService.generate({
    merchantId,
    branchId,
    dateFrom: new Date(dateFrom),
    dateTo: new Date(dateTo),
    groupBy,
    page,
    limit
  });

  // 5. Handle format routing
  if (format === 'csv') {
    return res
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="sales_${dateFrom}_${dateTo}.csv"`)
      .send(convertToCSV(result.summary));
  }

  // 6. Return consistent envelope
  res.status(200).json({
    status: 'success',
    data: {
      summary: result.summary,
      breakdown: result.breakdown
    },
    meta: {
      dateFrom,
      dateTo,
      branchId: branchId || null,
      page: result.page,
      pages: result.pages,
      total: result.total
    }
  });
});
```

### 3. Service Layer Aggregation Pattern

**Sales Report Example** (service/sales-report.service.js):

```javascript
class SalesReportService {
  static async generate({ merchantId, branchId, dateFrom, dateTo, groupBy, page, limit }) {
    // Build base match stage (ALWAYS start with merchant)
    const matchStage = {
      merchant: new ObjectId(merchantId),
      paymentStatus: 'paid',
      placedAt: { $gte: dateFrom, $lte: dateTo }
    };
    
    if (branchId) {
      matchStage.branch = new ObjectId(branchId);
    }

    // Summary aggregation (single-row totals)
    const summaryPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: '$totalAmount' },
          totalDiscounts: { $sum: '$discountAmount' },
          totalTaxes: { $sum: '$taxAmount' },
          totalDeliveryFees: { $sum: '$deliveryFee' },
          orderCount: { $sum: 1 },
          // Refunds stub (Phase 3 will replace with actual refund join)
          totalRefunds: { $literal: 0 }
        }
      },
      {
        $project: {
          _id: 0,
          grossRevenue: 1,
          totalDiscounts: 1,
          totalTaxes: 1,
          totalRefunds: 1,
          totalDeliveryFees: 1,
          netRevenue: {
            $subtract: [
              { $subtract: [
                { $subtract: ['$grossRevenue', '$totalDiscounts'] },
                '$totalTaxes'
              ]},
              '$totalRefunds'
            ]
          },
          orderCount: 1,
          averageOrderValue: {
            $cond: [
              { $gt: ['$orderCount', 0] },
              { $divide: ['$grossRevenue', '$orderCount'] },
              0
            ]
          }
        }
      }
    ];

    // Breakdown aggregation (time-series by groupBy bucket)
    const groupByExpression = this.buildGroupByExpression(groupBy);
    
    const breakdownPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: groupByExpression,
          grossRevenue: { $sum: '$totalAmount' },
          totalDiscounts: { $sum: '$discountAmount' },
          totalTaxes: { $sum: '$taxAmount' },
          totalDeliveryFees: { $sum: '$deliveryFee' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          grossRevenue: 1,
          netRevenue: {
            $subtract: [
              { $subtract: ['$grossRevenue', '$totalDiscounts'] },
              '$totalTaxes'
            ]
          },
          orderCount: 1,
          averageOrderValue: {
            $cond: [
              { $gt: ['$orderCount', 0] },
              { $divide: ['$grossRevenue', '$orderCount'] },
              0
            ]
          }
        }
      },
      { $sort: { period: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];

    // Execute both pipelines
    const [summaryResult, breakdownResult, totalCount] = await Promise.all([
      Order.aggregate(summaryPipeline),
      Order.aggregate(breakdownPipeline),
      this.countBreakdownRows(matchStage, groupByExpression)
    ]);

    return {
      summary: summaryResult[0] || this.getEmptySummary(),
      breakdown: breakdownResult,
      page,
      pages: Math.ceil(totalCount / limit),
      total: totalCount
    };
  }

  static buildGroupByExpression(groupBy) {
    switch (groupBy) {
      case 'day':
        return { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } };
      case 'week':
        return {
          $dateToString: {
            format: '%Y-W%V',
            date: '$placedAt'
          }
        };
      case 'month':
        return { $dateToString: { format: '%Y-%m', date: '$placedAt' } };
      default:
        return { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } };
    }
  }

  static async countBreakdownRows(matchStage, groupByExpression) {
    const countPipeline = [
      { $match: matchStage },
      { $group: { _id: groupByExpression } },
      { $count: 'total' }
    ];
    const result = await Order.aggregate(countPipeline);
    return result[0]?.total || 0;
  }

  static getEmptySummary() {
    return {
      grossRevenue: 0,
      totalDiscounts: 0,
      totalTaxes: 0,
      totalRefunds: 0,
      totalDeliveryFees: 0,
      netRevenue: 0,
      orderCount: 0,
      averageOrderValue: 0
    };
  }
}
```

## Data Models

### Schema Changes Required

The Advanced Reporting module queries existing collections but requires three schema modifications to support COGS calculation and asynchronous exports.

#### 1. MenuItem Model Extension (`models/menuModel.js`)

**Current State**: The `Menu` model already contains a `recipe` field with nested `ingredients` array:

```javascript
const menuIngredientSchema = new mongoose.Schema({
  ingredient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ingredient',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  unit: {
    type: String,
    enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'boxes', 'cans'],
    required: true,
  },
}, { _id: false });

const menuSchema = new mongoose.Schema({
  // ... existing fields
  recipe: {
    ingredients: {
      type: [menuIngredientSchema],
      default: [],
    },
  },
  // ... remaining fields
});
```

**Required Changes**: **None**. The existing `recipe.ingredients` structure already provides the necessary ingredient references and quantities for COGS calculation.

**Relationship**: Each `menuIngredientSchema.ingredient` references the `Ingredient` model, which contains `costPerUnit` used for profitability calculations.

#### 2. OrderItem Schema Extension (`models/orderModelItem.js`)

**Current State**: The `OrderItem` schema contains basic pricing but no cost tracking:

```javascript
const orderItemSchema = new Schema({
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
});
```

**Required Addition**: Add `unitCost` field for snapshotted COGS tracking:

```javascript
const orderItemSchema = new Schema({
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
  // NEW FIELD
  unitCost: {
    type: Number,
    default: null,
    min: 0,
    comment: 'Snapshotted COGS per unit at order placement time. Null if menu item has no recipe.'
  },
});
```

**Computation Logic**: When an order is placed, `OrderService.staffPlaceOrder` or `OrderService.customerPlaceOrder` must:

1. For each order item, look up the referenced `menuItemId`
2. If `menuItem.recipe.ingredients` exists and is non-empty:
   ```javascript
   let unitCost = 0;
   for (const recipeIngredient of menuItem.recipe.ingredients) {
     const ingredient = await Ingredient.findById(recipeIngredient.ingredient);
     if (ingredient && ingredient.costPerUnit) {
       unitCost += recipeIngredient.quantity * ingredient.costPerUnit;
     }
   }
   orderItem.unitCost = unitCost;
   ```
3. If no recipe exists, set `orderItem.unitCost = null`

**Immutability Requirement**: The `unitCost` value must be set once at order creation and never modified, even if ingredient prices change later. This preserves historical profitability accuracy.

**Alternative Approach**: If the existing `Recipe` model's pre-save hook already computes `totalCost`, that value could be reused:

```javascript
// In Recipe model pre-save hook (already exists)
this.totalCost = totalCost / this.yield; // Cost per serving

// In OrderService when placing order
const recipe = await Recipe.findOne({ menuItem: menuItemId, merchant: merchantId });
orderItem.unitCost = recipe ? recipe.totalCost : null;
```

This approach is simpler but requires the Recipe model to be kept up-to-date as a prerequisite.

#### 3. ExportJob Model (New Collection)

**Purpose**: Track asynchronous export job status for date ranges exceeding 366 days.

**Schema Definition**:

```javascript
// models/ExportJob.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const exportJobSchema = new Schema({
  merchant: {
    type: Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true,
    index: true
  },
  branch: {
    type: Schema.Types.ObjectId,
    ref: 'Branch',
    default: null,
    index: true
  },
  reportType: {
    type: String,
    enum: ['sales', 'orders', 'products', 'customers', 'delivery', 'profitability', 'staff', 'inventory'],
    required: true
  },
  dateFrom: {
    type: Date,
    required: true
  },
  dateTo: {
    type: Date,
    required: true
  },
  format: {
    type: String,
    enum: ['csv', 'xlsx', 'pdf'],
    default: 'csv'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'failed'],
    default: 'pending',
    index: true
  },
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'FileAsset',
    default: null,
    comment: 'References Files module after successful generation'
  },
  errorMessage: {
    type: String,
    default: null
  },
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes for query performance
exportJobSchema.index({ merchant: 1, status: 1, createdAt: -1 });
exportJobSchema.index({ requestedBy: 1, createdAt: -1 });

// Automatic cleanup: mark jobs older than 7 days as expired
exportJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 }); // 7 days

module.exports = mongoose.model('ExportJob', exportJobSchema);
```

**Lifecycle**:
1. User requests export → `ExportJob` created with status `'pending'`
2. Background worker picks job → status `'processing'`
3. Report generated and saved via Files module → `fileId` populated, status `'ready'`, Socket.IO event emitted
4. User downloads file via `/api/v1/files/:fileId/content` (existing Files module endpoint)
5. After 7 days, MongoDB TTL index automatically deletes the `ExportJob` document (file remains in Files module storage)

**Data Ownership**: This is the only persistent data the Reports module owns. All other report data is computed on-demand from existing collections.

### Data Flow for COGS Calculation

```
Order Placement Flow:
┌─────────────────────────────────────────────────────────────┐
│ 1. OrderService receives order with items                  │
│    items: [{ menuItemId, quantity, price }]                │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. For each item, look up MenuItem with populated recipe   │
│    MenuItem.findById(menuItemId).populate('recipe.ingredients.ingredient')
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Compute unitCost from recipe ingredients                │
│    unitCost = Σ(ingredient.quantity × ingredient.costPerUnit)
│    If no recipe → unitCost = null                          │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Snapshot unitCost onto OrderItem                        │
│    orderItem.unitCost = computedUnitCost                   │
│    (immutable, never updated after order creation)         │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Save Order with snapshotted costs                       │
└─────────────────────────────────────────────────────────────┘

Profitability Report Flow:
┌─────────────────────────────────────────────────────────────┐
│ 1. Query Orders in date range with paymentStatus: 'paid'   │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Aggregation pipeline unwinds items array                │
│    $unwind: '$items'                                        │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Compute COGS from snapshotted unitCost                  │
│    totalCOGS: { $sum: { $multiply: ['$items.unitCost', '$items.quantity'] } }
│    (only items with non-null unitCost contribute)          │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Compute gross profit = netRevenue - totalCOGS           │
│    grossMargin = (grossProfit / netRevenue) × 100          │
└─────────────────────────────────────────────────────────────┘
```

### Schema Migration Strategy

**Phase 1 (Backward Compatible):**
- Add `unitCost` field to OrderItem schema with `default: null`
- No migration script required — existing orders remain valid with null unitCost
- New orders will populate unitCost going forward

**Phase 2 (Optional Historical Backfill):**
- For merchants who need historical profitability data, run a one-time migration:
  ```javascript
  // For each Order with items that have menuItemId references still in database
  // Compute unitCost from MenuItem.recipe at time of migration
  // Mark with flag: unitCost_backfilled: true (to distinguish from actual snapshots)
  ```
- This is optional and merchant-specific, not required for system functionality

**Phase 3 (ExportJob Collection):**
- Create new collection via normal model definition
- No migration required — collection starts empty

## Error Handling

### Error Categories and Recovery Strategies

#### 1. Validation Errors (HTTP 400)

**Scenarios:**
- Missing required parameters (`dateFrom`, `dateTo`)
- Invalid date format (non-ISO 8601 strings)
- Date logic errors (`dateFrom` after `dateTo`)
- Date range exceeds limits (>366 days for JSON endpoints)
- Invalid enum values (`groupBy`, `format`, `reportType`)
- Invalid ObjectId format for `branchId`

**Handler Pattern:**

```javascript
// validators/report.validators.js
const reportQuerySchema = z.object({
  dateFrom: z.string().datetime({ message: 'dateFrom must be ISO 8601 format' }),
  dateTo: z.string().datetime({ message: 'dateTo must be ISO 8601 format' }),
  branchId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid branch ID format').optional(),
  groupBy: z.enum(['day', 'week', 'month'], { 
    errorMap: () => ({ message: 'groupBy must be one of: day, week, month' })
  }).default('day'),
  format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).refine(data => {
  const from = new Date(data.dateFrom);
  const to = new Date(data.dateTo);
  return from < to;
}, {
  message: 'dateFrom must be before dateTo',
  path: ['dateFrom']
});
```

**Response Format:**

```json
{
  "status": "fail",
  "message": "Validation error",
  "errors": [
    {
      "field": "dateFrom",
      "message": "dateFrom must be before dateTo"
    }
  ]
}
```

**Client Recovery**: Fix query parameters and retry immediately. No state change on server.

#### 2. Authorization Errors (HTTP 403)

**Scenarios:**
- Branch does not belong to authenticated merchant
- User role lacks required permissions (not `MERCHANT_ADMIN` or `SUPER_ADMIN`)
- Merchant subscription does not include `reports` feature

**Handler Pattern:**

```javascript
// controller/report.controller.js
exports.getSalesReport = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const { branchId } = req.query;

  // Branch ownership verification
  if (branchId) {
    const branch = await Branch.findOne({ 
      _id: branchId, 
      merchant: merchantId 
    });
    
    if (!branch) {
      return next(new AppError(
        'Access denied to specified branch', 
        403
      ));
    }
  }

  // Proceed with report generation...
});
```

**Response Format:**

```json
{
  "status": "fail",
  "message": "Access denied to specified branch"
}
```

**Client Recovery**: Do not retry. User must request access to the branch or select a different branch.

#### 3. Performance Timeout Errors (HTTP 503)

**Scenarios:**
- Aggregation pipeline exceeds 10-second execution limit
- Large date range with high order volume
- Complex breakdown queries with many groupBy buckets

**Handler Pattern:**

```javascript
// service/sales-report.service.js
class SalesReportService {
  static async generate(params) {
    const timeoutMs = 10000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AGGREGATION_TIMEOUT')), timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.executeAggregation(params),
        timeoutPromise
      ]);
      return result;
    } catch (error) {
      if (error.message === 'AGGREGATION_TIMEOUT') {
        throw new AppError(
          'Report query timed out. Try narrowing the date range or use the export endpoint for large datasets.',
          503,
          { retryAfter: 60 }
        );
      }
      throw error;
    }
  }
}
```

**Response Format:**

```json
{
  "status": "error",
  "message": "Report query timed out. Try narrowing the date range or use the export endpoint for large datasets.",
  "retryAfter": 60
}
```

**Client Recovery**: 
- Narrow date range and retry
- Switch to asynchronous export endpoint (`POST /api/v1/reports/exports`)
- Wait for `retryAfter` seconds before retrying original query

#### 4. Data Consistency Errors

**Scenarios:**
- Order references deleted MenuItem (orphaned reference)
- Order items have null `unitCost` when profitability report expected costs
- Missing required fields due to schema evolution

**Handler Pattern:**

```javascript
// service/profitability-report.service.js
static async generate({ merchantId, dateFrom, dateTo, branchId }) {
  const pipeline = [
    { $match: this.buildMatchStage(merchantId, branchId, dateFrom, dateTo) },
    { $unwind: '$items' },
    {
      $group: {
        _id: null,
        totalCOGS: { 
          $sum: { 
            $cond: [
              { $ne: ['$items.unitCost', null] },
              { $multiply: ['$items.unitCost', '$items.quantity'] },
              0
            ]
          }
        },
        itemsWithoutCost: {
          $sum: {
            $cond: [{ $eq: ['$items.unitCost', null] }, 1, 0]
          }
        },
        totalRevenue: { $sum: '$totalAmount' }
      }
    }
  ];

  const result = await Order.aggregate(pipeline);
  const data = result[0] || { totalCOGS: 0, itemsWithoutCost: 0, totalRevenue: 0 };

  // Include warning in response if data incomplete
  const warnings = [];
  if (data.itemsWithoutCost > 0) {
    warnings.push({
      code: 'INCOMPLETE_COGS_DATA',
      message: `${data.itemsWithoutCost} order items have no cost data. Profitability metrics are underestimated.`,
      recommendation: 'Ensure menu items have recipes with ingredient costs defined.'
    });
  }

  return {
    summary: {
      totalCOGS: data.totalCOGS,
      totalRevenue: data.totalRevenue,
      grossProfit: data.totalRevenue - data.totalCOGS,
      itemsWithoutCostData: data.itemsWithoutCost
    },
    warnings
  };
}
```

**Response Format:**

```json
{
  "status": "success",
  "data": {
    "summary": {
      "totalCOGS": 12450.00,
      "totalRevenue": 25000.00,
      "grossProfit": 12550.00,
      "itemsWithoutCostData": 15
    }
  },
  "warnings": [
    {
      "code": "INCOMPLETE_COGS_DATA",
      "message": "15 order items have no cost data. Profitability metrics are underestimated.",
      "recommendation": "Ensure menu items have recipes with ingredient costs defined."
    }
  ]
}
```

**Client Recovery**: Display warning to user. Profitability data is partial but still useful.

#### 5. Export Job Failures

**Scenarios:**
- File generation crashes mid-process
- Out of memory during large dataset processing
- Network failure writing to Files module storage

**Handler Pattern:**

```javascript
// service/export.service.js
class ExportService {
  static async processJob(jobId) {
    const job = await ExportJob.findById(jobId);
    if (!job) return;

    try {
      await ExportJob.findByIdAndUpdate(jobId, { 
        status: 'processing' 
      });

      // Generate report data in chunks
      const reportData = await this.generateReportInChunks(job);
      
      // Save file via Files module
      const file = await FileAsset.create({
        merchant: job.merchant,
        filename: `${job.reportType}_${job.dateFrom}_${job.dateTo}.${job.format}`,
        mimetype: this.getMimeType(job.format),
        size: reportData.length,
        data: reportData
      });

      // Update job with success
      await ExportJob.findByIdAndUpdate(jobId, {
        status: 'ready',
        fileId: file._id,
        completedAt: new Date()
      });

      // Emit Socket.IO event
      this.notifyUser(job.requestedBy, jobId, file._id);

    } catch (error) {
      // Log detailed error for debugging
      logger.error('Export job failed', {
        jobId,
        merchantId: job.merchant,
        reportType: job.reportType,
        error: error.message,
        stack: error.stack
      });

      // Update job with failure
      await ExportJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        errorMessage: 'Report generation failed. Please try again or contact support if the issue persists.',
        completedAt: new Date()
      });

      // Emit failure event
      this.notifyUserOfFailure(job.requestedBy, jobId, error.message);
    }
  }

  static async generateReportInChunks(job) {
    // Process in chunks to avoid memory exhaustion
    const chunkSize = 1000; // orders per chunk
    let skip = 0;
    const results = [];

    while (true) {
      const chunk = await Order.find(this.buildFilter(job))
        .skip(skip)
        .limit(chunkSize)
        .lean();
      
      if (chunk.length === 0) break;
      
      results.push(...chunk);
      skip += chunkSize;
      
      // Memory pressure check
      if (results.length > 50000) {
        throw new Error('Dataset too large for single export. Contact support for batch export options.');
      }
    }

    return this.formatAsCSV(results);
  }
}
```

**Status Endpoint Response (Failed Job):**

```json
{
  "status": "success",
  "data": {
    "jobId": "507f1f77bcf86cd799439011",
    "status": "failed",
    "reportType": "sales",
    "dateFrom": "2023-01-01T00:00:00.000Z",
    "dateTo": "2023-12-31T23:59:59.999Z",
    "errorMessage": "Report generation failed. Please try again or contact support if the issue persists.",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "completedAt": "2024-01-15T10:35:22.000Z"
  }
}
```

**Client Recovery**: 
- User can retry by creating a new export job
- If repeated failures occur, suggest narrowing date range or filtering by branch
- Escalate to support if issue persists

#### 6. Database Connection Errors (HTTP 503)

**Scenarios:**
- MongoDB connection pool exhausted
- Network partition between app and database
- Database instance down

**Handler Pattern:**

```javascript
// middleware/errorHandler.js (existing global handler)
const handleDatabaseError = (err) => {
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    return new AppError(
      'Database temporarily unavailable. Please try again in a moment.',
      503,
      { retryAfter: 30 }
    );
  }
  return err;
};

module.exports = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Database-specific errors
  error = handleDatabaseError(error);

  // ... existing error handlers
  
  res.status(error.statusCode || 500).json({
    status: error.status || 'error',
    message: error.message,
    ...(error.retryAfter && { retryAfter: error.retryAfter })
  });
};
```

**Client Recovery**: Retry after `retryAfter` seconds with exponential backoff.

### Error Logging Strategy

**Audit Log Integration**: All report access attempts (success or failure) are logged to `AuditLog` collection:

```javascript
// After report generation or on error
await AuditLogService.log({
  merchant: merchantId,
  branch: branchId,
  actorId: req.user._id,
  actorType: 'user',
  actorRoleName: req.user.roleName,
  action: 'REPORT_ACCESS',
  entityType: 'Report',
  entityId: null,
  metadata: {
    reportType: 'sales',
    dateFrom,
    dateTo,
    success: true,
    executionTimeMs: 1234
  },
  ip: req.ip,
  userAgent: req.get('user-agent')
});
```

**Application Logging**: Use existing Winston logger with structured context:

```javascript
logger.info('Report generated', {
  merchantId,
  branchId,
  reportType: 'sales',
  dateFrom,
  dateTo,
  executionTimeMs: Date.now() - startTime,
  resultCount: breakdown.length
});

logger.error('Report generation failed', {
  merchantId,
  reportType: 'profitability',
  error: error.message,
  stack: error.stack
});
```

### Graceful Degradation

**Partial Data Availability**: When some data is missing (e.g., orders without `unitCost`), reports return:
1. Complete data for available records
2. Warning messages explaining gaps
3. Recommendations for improving data completeness

**Example**: Profitability report with incomplete recipe data still shows revenue, discounts, and order volume — only COGS and margin calculations are marked incomplete.

**No Hard Failures**: Missing optional data (like `deliveredAt` timestamps for delivery duration) results in that specific metric being null, not entire report failure.

## Testing Strategy

### Testing Approach Assessment

**Property-Based Testing Applicability**: The Advanced Reporting module is **NOT suitable for comprehensive property-based testing** for the following reasons:

1. **Infrastructure Behavior Testing**: The module primarily tests MongoDB aggregation pipeline behavior and query correctness against external data, not pure function logic
2. **External Service Dependency**: Reports query existing collections (`Order`, `Ingredient`, `Customer`) — behavior depends on database state, not just input parameters
3. **Statistical Aggregations**: Many metrics (AOV, margins, percentages) are statistical computations over datasets where "correctness" is validated by example cases, not universal properties
4. **Integration-Heavy**: The core value is in correct data retrieval and aggregation pipeline construction, which are integration concerns

**Testing Strategy**: Use a **dual approach** focused on unit tests with example-based assertions and integration tests with real MongoDB aggregations.

### 1. Unit Tests (Service Layer Logic)

**Scope**: Test business logic in service classes that doesn't require database execution.

**Framework**: Jest with mocked MongoDB models

**Example Test Cases**:

```javascript
// service/__tests__/sales-report.service.test.js
describe('SalesReportService', () => {
  describe('buildGroupByExpression', () => {
    it('should return daily date format for day grouping', () => {
      const expr = SalesReportService.buildGroupByExpression('day');
      expect(expr).toEqual({
        $dateToString: { format: '%Y-%m-%d', date: '$placedAt' }
      });
    });

    it('should return weekly date format for week grouping', () => {
      const expr = SalesReportService.buildGroupByExpression('week');
      expect(expr).toEqual({
        $dateToString: { format: '%Y-W%V', date: '$placedAt' }
      });
    });

    it('should return monthly date format for month grouping', () => {
      const expr = SalesReportService.buildGroupByExpression('month');
      expect(expr).toEqual({
        $dateToString: { format: '%Y-%m', date: '$placedAt' }
      });
    });

    it('should default to daily format for invalid groupBy', () => {
      const expr = SalesReportService.buildGroupByExpression('invalid');
      expect(expr).toEqual({
        $dateToString: { format: '%Y-%m-%d', date: '$placedAt' }
      });
    });
  });

  describe('getEmptySummary', () => {
    it('should return zero-initialized summary object', () => {
      const summary = SalesReportService.getEmptySummary();
      expect(summary).toEqual({
        grossRevenue: 0,
        totalDiscounts: 0,
        totalTaxes: 0,
        totalRefunds: 0,
        totalDeliveryFees: 0,
        netRevenue: 0,
        orderCount: 0,
        averageOrderValue: 0
      });
    });
  });

  describe('buildMatchStage', () => {
    const merchantId = new ObjectId('507f1f77bcf86cd799439011');
    const branchId = new ObjectId('507f1f77bcf86cd799439012');
    const dateFrom = new Date('2024-01-01');
    const dateTo = new Date('2024-01-31');

    it('should build match stage with merchant and date filters', () => {
      const match = SalesReportService.buildMatchStage(
        merchantId,
        null,
        dateFrom,
        dateTo
      );

      expect(match).toEqual({
        merchant: merchantId,
        paymentStatus: 'paid',
        placedAt: { $gte: dateFrom, $lte: dateTo }
      });
    });

    it('should include branch filter when branchId provided', () => {
      const match = SalesReportService.buildMatchStage(
        merchantId,
        branchId,
        dateFrom,
        dateTo
      );

      expect(match).toEqual({
        merchant: merchantId,
        branch: branchId,
        paymentStatus: 'paid',
        placedAt: { $gte: dateFrom, $lte: dateTo }
      });
    });
  });
});
```

**Coverage Target**: 80% line coverage for service layer methods

### 2. Integration Tests (MongoDB Aggregation Pipelines)

**Scope**: Test actual aggregation pipeline execution against test database with known data.

**Framework**: Jest with real MongoDB instance (in-memory MongoDB or Docker container)

**Test Data Setup**: Seed test database with deterministic order data for predictable assertions.

**Example Test Cases**:

```javascript
// service/__tests__/sales-report.integration.test.js
describe('SalesReportService Integration', () => {
  let testMerchantId;
  let testBranchId;

  beforeAll(async () => {
    await connectTestDB();
    testMerchantId = new ObjectId();
    testBranchId = new ObjectId();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await Order.deleteMany({});
  });

  describe('generate', () => {
    it('should calculate correct gross revenue from paid orders', async () => {
      // Seed test data
      await Order.create([
        {
          merchant: testMerchantId,
          branch: testBranchId,
          totalAmount: 100,
          discountAmount: 10,
          taxAmount: 5,
          paymentStatus: 'paid',
          placedAt: new Date('2024-01-15')
        },
        {
          merchant: testMerchantId,
          branch: testBranchId,
          totalAmount: 200,
          discountAmount: 20,
          taxAmount: 10,
          paymentStatus: 'paid',
          placedAt: new Date('2024-01-16')
        },
        {
          merchant: testMerchantId,
          branch: testBranchId,
          totalAmount: 50,
          discountAmount: 0,
          taxAmount: 0,
          paymentStatus: 'unpaid',
          placedAt: new Date('2024-01-17')
        }
      ]);

      // Execute report
      const result = await SalesReportService.generate({
        merchantId: testMerchantId,
        branchId: testBranchId,
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        groupBy: 'day',
        page: 1,
        limit: 50
      });

      // Assertions
      expect(result.summary.grossRevenue).toBe(300); // Only paid orders
      expect(result.summary.totalDiscounts).toBe(30);
      expect(result.summary.totalTaxes).toBe(15);
      expect(result.summary.netRevenue).toBe(255); // 300 - 30 - 15
      expect(result.summary.orderCount).toBe(2);
      expect(result.summary.averageOrderValue).toBe(150); // 300 / 2
    });

    it('should filter by branch when branchId provided', async () => {
      const otherBranchId = new ObjectId();

      await Order.create([
        {
          merchant: testMerchantId,
          branch: testBranchId,
          totalAmount: 100,
          paymentStatus: 'paid',
          placedAt: new Date('2024-01-15')
        },
        {
          merchant: testMerchantId,
          branch: otherBranchId,
          totalAmount: 200,
          paymentStatus: 'paid',
          placedAt: new Date('2024-01-16')
        }
      ]);

      const result = await SalesReportService.generate({
        merchantId: testMerchantId,
        branchId: testBranchId,
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        groupBy: 'day',
        page: 1,
        limit: 50
      });

      expect(result.summary.grossRevenue).toBe(100); // Only testBranchId
      expect(result.summary.orderCount).toBe(1);
    });

    it('should group breakdown by day correctly', async () => {
      await Order.create([
        {
          merchant: testMerchantId,
          totalAmount: 100,
          paymentStatus: 'paid',
          placedAt: new Date('2024-01-15T10:00:00Z')
        },
        {
          merchant: testMerchantId,
          totalAmount: 150,
          paymentStatus: 'paid',
          placedAt: new Date('2024-01-15T14:00:00Z')
        },
        {
          merchant: testMerchantId,
          totalAmount: 200,
          paymentStatus: 'paid',
          placedAt: new Date('2024-01-16T10:00:00Z')
        }
      ]);

      const result = await SalesReportService.generate({
        merchantId: testMerchantId,
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        groupBy: 'day',
        page: 1,
        limit: 50
      });

      expect(result.breakdown).toHaveLength(2);
      expect(result.breakdown[0].period).toBe('2024-01-16');
      expect(result.breakdown[0].grossRevenue).toBe(200);
      expect(result.breakdown[1].period).toBe('2024-01-15');
      expect(result.breakdown[1].grossRevenue).toBe(250);
    });

    it('should paginate breakdown results', async () => {
      // Create 5 days of orders
      for (let day = 1; day <= 5; day++) {
        await Order.create({
          merchant: testMerchantId,
          totalAmount: 100,
          paymentStatus: 'paid',
          placedAt: new Date(`2024-01-${day.toString().padStart(2, '0')}`)
        });
      }

      const page1 = await SalesReportService.generate({
        merchantId: testMerchantId,
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        groupBy: 'day',
        page: 1,
        limit: 2
      });

      const page2 = await SalesReportService.generate({
        merchantId: testMerchantId,
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        groupBy: 'day',
        page: 2,
        limit: 2
      });

      expect(page1.breakdown).toHaveLength(2);
      expect(page2.breakdown).toHaveLength(2);
      expect(page1.pages).toBe(3); // 5 days / 2 per page = 3 pages
      expect(page1.breakdown[0].period).not.toBe(page2.breakdown[0].period);
    });

    it('should return empty summary when no data exists', async () => {
      const result = await SalesReportService.generate({
        merchantId: testMerchantId,
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        groupBy: 'day',
        page: 1,
        limit: 50
      });

      expect(result.summary).toEqual(SalesReportService.getEmptySummary());
      expect(result.breakdown).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
```

**Coverage Target**: Test each report type (sales, orders, products, customers, delivery, profitability, staff, inventory) with at least 3 scenarios:
1. Happy path with typical data
2. Edge case with empty result set
3. Branch filtering correctness

### 3. Controller Tests (HTTP Layer)

**Scope**: Test request validation, authorization, error handling, response formatting.

**Framework**: Jest with supertest for HTTP request mocking

**Example Test Cases**:

```javascript
// controller/__tests__/report.controller.test.js
describe('GET /api/v1/reports/sales', () => {
  let authToken;
  let merchantId;

  beforeAll(async () => {
    // Setup authenticated user and get JWT token
    const user = await createTestUser({ role: 'MERCHANT_ADMIN' });
    authToken = generateJWT(user);
    merchantId = user.merchant;
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .get('/api/v1/reports/sales')
      .query({
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z'
      });

    expect(response.status).toBe(401);
  });

  it('should require dateFrom parameter', async () => {
    const response = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        dateTo: '2024-01-31T23:59:59.999Z'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('dateFrom');
  });

  it('should require dateTo parameter', async () => {
    const response = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        dateFrom: '2024-01-01T00:00:00.000Z'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('dateTo');
  });

  it('should reject dateFrom after dateTo', async () => {
    const response = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        dateFrom: '2024-01-31T00:00:00.000Z',
        dateTo: '2024-01-01T23:59:59.999Z'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('before');
  });

  it('should reject date range exceeding 366 days for JSON format', async () => {
    const response = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        dateFrom: '2023-01-01T00:00:00.000Z',
        dateTo: '2024-12-31T23:59:59.999Z'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('366 days');
  });

  it('should reject access to branch not owned by merchant', async () => {
    const otherMerchantBranch = await createTestBranch({ 
      merchant: new ObjectId() 
    });

    const response = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        branchId: otherMerchantBranch._id.toString()
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('Access denied');
  });

  it('should return consistent response envelope', async () => {
    const response = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z'
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'success');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('summary');
    expect(response.body.data).toHaveProperty('breakdown');
    expect(response.body).toHaveProperty('meta');
    expect(response.body.meta).toHaveProperty('dateFrom');
    expect(response.body.meta).toHaveProperty('dateTo');
    expect(response.body.meta).toHaveProperty('page');
    expect(response.body.meta).toHaveProperty('pages');
  });

  it('should return CSV format when requested', async () => {
    const response = await request(app)
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-31T23:59:59.999Z',
        format: 'csv'
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('sales_');
  });
});
```

**Coverage Target**: 90% line coverage for controller methods, focusing on error paths and validation

### 4. Export Job Tests

**Scope**: Test asynchronous export job lifecycle, file generation, status updates.

**Example Test Cases**:

```javascript
// service/__tests__/export.service.test.js
describe('ExportService', () => {
  it('should create export job with pending status', async () => {
    const jobParams = {
      merchantId: new ObjectId(),
      reportType: 'sales',
      dateFrom: new Date('2023-01-01'),
      dateTo: new Date('2023-12-31'),
      format: 'csv',
      requestedBy: new ObjectId()
    };

    const job = await ExportService.createJob(jobParams);

    expect(job.status).toBe('pending');
    expect(job.reportType).toBe('sales');
    expect(job.fileId).toBeNull();
  });

  it('should update job status to ready after successful generation', async () => {
    const job = await ExportJob.create({
      merchant: new ObjectId(),
      reportType: 'sales',
      dateFrom: new Date('2024-01-01'),
      dateTo: new Date('2024-01-31'),
      format: 'csv',
      status: 'pending',
      requestedBy: new ObjectId()
    });

    await ExportService.processJob(job._id);

    const updatedJob = await ExportJob.findById(job._id);
    expect(updatedJob.status).toBe('ready');
    expect(updatedJob.fileId).not.toBeNull();
    expect(updatedJob.completedAt).not.toBeNull();
  });

  it('should update job status to failed on error', async () => {
    const job = await ExportJob.create({
      merchant: new ObjectId(),
      reportType: 'invalid_type',
      dateFrom: new Date('2024-01-01'),
      dateTo: new Date('2024-01-31'),
      format: 'csv',
      status: 'pending',
      requestedBy: new ObjectId()
    });

    await ExportService.processJob(job._id);

    const updatedJob = await ExportJob.findById(job._id);
    expect(updatedJob.status).toBe('failed');
    expect(updatedJob.errorMessage).not.toBeNull();
    expect(updatedJob.fileId).toBeNull();
  });
});
```

### 5. End-to-End Smoke Tests

**Scope**: Verify complete request-response flow through all layers with real database and authentication.

**Execution**: Run against staging environment before production deployment.

**Test Cases**:
1. Authenticated merchant generates sales report for last 30 days → receives 200 response with data
2. Authenticated merchant requests CSV export → receives 202 with jobId → polls status endpoint → receives ready status with fileId → downloads file successfully
3. Unauthenticated request → receives 401 error
4. Request for branch not owned by merchant → receives 403 error

### 6. Performance Tests

**Scope**: Validate aggregation pipeline performance under realistic load.

**Tools**: Apache JMeter or k6 for load testing

**Test Scenarios**:
1. **Baseline**: Single merchant, 10,000 orders, 30-day range → aggregation completes in <3 seconds
2. **Branch Filtering**: Same as baseline but with branchId filter → <2 seconds
3. **Large Date Range**: Single merchant, 100,000 orders, 366-day range → <10 seconds or returns timeout error
4. **Concurrent Requests**: 50 concurrent report requests from different merchants → all complete within timeout, no database connection pool exhaustion

**Acceptance Criteria**: 95th percentile response time <5 seconds for typical queries (≤90 days, <50,000 orders)

### Test Execution Strategy

**Development Phase**:
- Unit tests run on every commit (pre-commit hook)
- Integration tests run on pull request creation
- Coverage reports generated and reviewed before merge

**CI/CD Pipeline**:
```yaml
# .github/workflows/reports-module-tests.yml
name: Reports Module Tests
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:6.0
        ports:
          - 27017:27017
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit -- src/modules/reports
      - run: npm run test:integration -- src/modules/reports
      - run: npm run test:coverage -- src/modules/reports
```

**Regression Testing**: Re-run full test suite after:
- Schema changes to Order, MenuItem, or Ingredient models
- Aggregation pipeline modifications
- Date range validation logic changes

### Manual Testing Checklist

Before considering the Reports module complete, manually verify:

- [ ] Each report type returns correct calculations for known test data
- [ ] CSV export downloads with correct filename and format
- [ ] Async export job progresses through pending → processing → ready states
- [ ] Socket.IO event fires when export completes
- [ ] Audit log entries created for report access
- [ ] Error messages are user-friendly and actionable
- [ ] Date range validation prevents excessive queries
- [ ] Branch filtering correctly isolates data
- [ ] Multi-tenant isolation: Merchant A cannot see Merchant B's data
- [ ] Performance acceptable on staging with production-like data volume

## Correctness Properties

**Property-Based Testing Not Applicable**: This module does not include correctness properties for property-based testing because:

1. **Infrastructure Testing Focus**: The core functionality tests MongoDB aggregation pipeline correctness, which is integration testing rather than pure function testing. Aggregation behavior depends on external database state, not deterministic input-output mappings.

2. **No Universal Properties**: Report calculations (revenue sums, averages, percentages) are validated against specific example datasets with known expected results. There are no meaningful universal properties of the form "for all input datasets X, property P(X) holds" — correctness is defined by example, not by algebraic laws.

3. **External Service Dependency**: The module queries existing collections (`Order`, `Ingredient`, `Customer`) that it doesn't own. Testing correctness requires seeding known data and asserting expected aggregation results, which is integration testing methodology.

4. **Statistical Aggregations**: Metrics like Average Order Value, gross margin percentage, and cancellation rates are statistical computations where correctness is verified through concrete examples (e.g., "given 3 orders with amounts [100, 200, 150], AOV should be 150") rather than general properties.

**Alternative Testing Strategy**: As detailed in the Testing Strategy section, this module uses:
- **Unit tests** for business logic methods (date formatting, empty summary generation, match stage construction)
- **Integration tests** for aggregation pipeline execution with known test data
- **Controller tests** for request validation and error handling
- **End-to-end tests** for complete workflow verification

This approach provides comprehensive coverage appropriate for an analytics/reporting module querying external data sources.

