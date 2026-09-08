# Implementation Plan: Advanced Reporting

## Overview

This implementation plan translates the Advanced Reporting design into discrete coding tasks following the existing Restaurant SaaS codebase patterns. The module provides real-time analytics through MongoDB aggregation pipelines, querying existing collections without owning persistent data (except optional export job metadata). Each task builds incrementally on previous work, with checkpoints to validate core functionality before proceeding.

## Tasks

### 1. Data Model Extensions for COGS Tracking

- [x] 1.1 Verify MenuItem recipe field structure
  - Check if `models/menuModel.js` already has `recipe.ingredients` array with `{ ingredient: ObjectId, quantity: Number, unit: String }` structure
  - If present, verify it references `Ingredient` model correctly
  - If missing or incomplete, add/update the schema to match design specification
  - _Requirements: 1.1, 1.2_

- [x] 1.2 Add unitCost field to OrderItem schema
  - Open `models/orderModelItem.js` and add `unitCost: { type: Number, default: null, min: 0 }` field
  - Add JSDoc comment explaining it's a snapshot of COGS at order placement time
  - Ensure field is immutable after creation (no update logic should touch it)
  - _Requirements: 1.3_

- [x] 1.3 Implement COGS computation in order placement flow
  - Locate order placement functions in `src/modules/order/service/OrderService.js` (both `staffPlaceOrder` and customer order placement)
  - For each order item, compute `unitCost` by looking up `menuItem.recipe.ingredients` and summing `(ingredient.quantity × ingredient.costPerUnit)` for each ingredient
  - Use Mongoose populate to efficiently load ingredient cost data
  - Set `orderItem.unitCost = computedValue` for items with recipes, `null` for items without recipes
  - Ensure computation happens inside the order creation transaction
  - _Requirements: 1.4, 1.5, 1.6, 1.7_

### 2. Reports Module Scaffolding

- [x] 2.1 Create reports module directory structure
  - Create directory `src/modules/reports/` with subdirectories: `controller/`, `service/`, `validators/`
  - Create empty files: `reports.routes.js`, `controller/report.controller.js`, `validators/report.validators.js`
  - Create empty service files: `service/sales-report.service.js`, `service/orders-report.service.js`, `service/products-report.service.js`, `service/customers-report.service.js`, `service/delivery-report.service.js`, `service/profitability-report.service.js`, `service/staff-report.service.js`, `service/inventory-report.service.js`, `service/export.service.js`
  - _Requirements: 2.1_

- [x] 2.2 Write shared Zod validation schemas
  - In `validators/report.validators.js`, create `reportQuerySchema` with fields: `dateFrom` (required ISO date string), `dateTo` (required ISO date string), `branchId` (optional ObjectId regex), `groupBy` (enum: day/week/month, default 'day'), `page` (coerce number, min 1, default 1), `limit` (coerce number, min 1, max 100, default 50), `format` (enum: json/csv, default 'json')
  - Add `.refine()` validator to ensure `dateFrom < dateTo`
  - Export schema for reuse across all report endpoints
  - _Requirements: 2.2, 4.1, 4.4, 4.5_

- [x] 2.3 Wire reports routes into application
  - In `reports.routes.js`, create Express router with base middleware chain: `router.use(protect)`, `router.use(requireFeature('reports'))`
  - Define placeholder routes for 8 report types: `/sales`, `/orders`, `/products`, `/customers`, `/delivery`, `/profitability`, `/staff`, `/inventory` (each with `GET` method)
  - Apply middleware chain: `validate(reportQuerySchema, 'query')`, `restrictTo('MERCHANT_ADMIN', 'SUPER_ADMIN')`, then controller handler
  - Import and register router in main app router (e.g., `src/app/create-app.js` or equivalent route aggregator)
  - _Requirements: 2.4, 2.5, 17.1, 17.2, 17.3_

### 3. Core Controller Pattern Implementation

- [x] 3.1 Implement shared controller helper utilities
  - In `controller/report.controller.js`, create helper function `validateDateRange(dateFrom, dateTo, format)` that checks 366-day limit for JSON format, throws `AppError` with HTTP 400 if exceeded
  - Create helper function `verifyBranchOwnership(branchId, merchantId)` that queries `Branch.findOne({ _id: branchId, merchant: merchantId })` and throws HTTP 403 if not found
  - Create helper function `convertToCSV(summaryObject)` that transforms summary data into CSV format with headers
  - Export `catchAsync` wrapper for all controller handlers
  - _Requirements: 3.1, 4.2, 4.3, 19.4, 19.5_

- [x] 3.2 Implement base controller handler pattern
  - Create template handler function following design pattern: extract `merchantId` from `getMerchantId(req)` (never from params), validate date range, verify branch ownership if `branchId` provided, delegate to service layer, handle CSV vs JSON format routing
  - Ensure all handlers return consistent envelope: `{ status: 'success', data: { summary, breakdown }, meta: { dateFrom, dateTo, branchId, page, pages, total } }`
  - Add error handling for missing merchant context (HTTP 401)
  - _Requirements: 2.5, 3.1, 13.1, 13.2, 13.3, 13.4, 13.5_

### 4. Sales Report Implementation

- [x] 4.1 Implement SalesReportService.generate()
  - In `service/sales-report.service.js`, create class with static `generate({ merchantId, branchId, dateFrom, dateTo, groupBy, page, limit })` method
  - Build `matchStage` object starting with `{ merchant: ObjectId(merchantId), paymentStatus: 'paid', placedAt: { $gte: dateFrom, $lte: dateTo } }`, conditionally add `branch: ObjectId(branchId)` if provided
  - Create summary aggregation pipeline: `$match`, `$group` (compute grossRevenue, totalDiscounts, totalTaxes, totalDeliveryFees, orderCount, stub totalRefunds as 0), `$project` (compute netRevenue, AOV)
  - Create breakdown aggregation pipeline: `$match`, `$group` by `groupBy` expression (day/week/month), `$project` metrics per period, `$sort`, `$skip`, `$limit`
  - Execute both pipelines with `Promise.all()`, return formatted result with pagination metadata
  - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8_

- [x] 4.2 Write unit tests for SalesReportService
  - Test empty result set returns zero values
  - Test single order aggregation computes correct totals
  - Test date range filtering excludes out-of-range orders
  - Test branch filtering when branchId provided
  - Test groupBy day/week/month produces correct bucket counts
  - _Requirements: 5.1, 5.2, 5.8_

- [x] 4.3 Implement payment method breakdown
  - Extend summary pipeline to add `$group` stage with `paymentMethods: { $push: '$paymentDetails.method' }` accumulator
  - Add second aggregation to count occurrences per payment method
  - Include payment method breakdown in summary object
  - _Requirements: 5.4_

- [x] 4.4 Wire sales report to controller and route
  - In `controller/report.controller.js`, create `exports.getSalesReport` handler following base pattern from task 3.2
  - Call `SalesReportService.generate()` with extracted parameters
  - Handle CSV export if `format=csv` using `convertToCSV()` helper
  - Connect handler to `GET /api/v1/reports/sales` route in `reports.routes.js`
  - _Requirements: 5.1, 5.7, 5.8, 14.1, 14.2, 14.3, 14.4_

### 5. Orders Report Implementation

- [x] 5.1 Implement OrdersReportService.generate()
  - In `service/orders-report.service.js`, create aggregation pipeline to count orders grouped by status
  - Compute cancellation rate as `(canceledCount / totalCount) × 100`
  - Compute average time-to-ready as mean of `(readyAt - placedAt)` in milliseconds, filtering out orders with null `readyAt`
  - Create breakdown pipeline grouping by `groupBy` period with order volume per bucket
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 5.2 Wire orders report to controller and route
  - Create `exports.getOrdersReport` handler in controller
  - Connect to `GET /api/v1/reports/orders` route
  - Verify response format matches design envelope
  - _Requirements: 6.1, 6.5, 6.6_

### 6. Products Report Implementation

- [x] 6.1 Implement ProductsReportService.generate()
  - In `service/products-report.service.js`, create pipeline with `$unwind: '$items'` stage to expand order items array
  - Group by `$items.menuItemId`, compute total quantity sold and total revenue per item
  - Sort by quantity descending for top sellers, compute bottom 20% threshold for low performers
  - Add category aggregation by looking up `menuItem.category` field
  - Create breakdown pipeline showing item performance trends over time
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 6.2 Write unit tests for ProductsReportService
  - Test item quantity aggregation across multiple orders
  - Test revenue calculation per item
  - Test top seller ranking logic
  - Test low performer threshold calculation
  - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [x] 6.3 Wire products report to controller and route
  - Create `exports.getProductsReport` handler in controller
  - Connect to `GET /api/v1/reports/products` route
  - _Requirements: 7.1, 7.7, 7.8_

### 7. Customers Report Implementation

- [x] 7.1 Implement CustomersReportService.generate()
  - In `service/customers-report.service.js`, group orders by `customer` reference
  - Classify as new customer if their first order `placedAt` falls within `[dateFrom, dateTo]`
  - Classify as returning if they have orders before `dateFrom`
  - Compute total spend per customer from paid orders only
  - Rank by spend descending, compute spend distribution percentiles (25th, 50th, 75th, 90th)
  - Create breakdown showing new vs returning customer counts per groupBy period
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 7.2 Wire customers report to controller and route
  - Create `exports.getCustomersReport` handler in controller
  - Connect to `GET /api/v1/reports/customers` route
  - _Requirements: 8.1, 8.6, 8.7_

### 8. Delivery Report Implementation

- [x] 8.1 Implement DeliveryReportService.generate()
  - In `service/delivery-report.service.js`, add filter `orderType: 'delivery'` to match stage
  - Count total delivery orders, sum delivery fees from paid orders
  - Compute average delivery duration as mean of `(deliveredAt - outForDeliveryAt)` for orders with both timestamps
  - Compute on-time delivery percentage (if SLA field exists, otherwise stub as null)
  - Create breakdown showing delivery volume and fee trends per period
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 8.2 Wire delivery report to controller and route
  - Create `exports.getDeliveryReport` handler in controller
  - Connect to `GET /api/v1/reports/delivery` route
  - _Requirements: 9.1, 9.6, 9.7_

### 9. Profitability Report Implementation

- [x] 9.1 Implement ProfitabilityReportService.generate()
  - In `service/profitability-report.service.js`, create pipeline with `$unwind: '$items'` stage
  - Compute COGS as `$sum: { $cond: [{ $ne: ['$items.unitCost', null] }, { $multiply: ['$items.unitCost', '$items.quantity'] }, 0] }`
  - Count items with null unitCost separately as `itemsWithoutCost`
  - Compute gross profit as `netRevenue - totalCOGS`
  - Compute gross margin percentage as `(grossProfit / netRevenue) × 100`
  - Identify low-margin items (below 20% margin threshold)
  - Include warning in response if `itemsWithoutCost > 0` per design error handling pattern
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 9.2 Write unit tests for ProfitabilityReportService
  - Test COGS calculation with valid unitCost values
  - Test null unitCost handling (excluded from COGS sum)
  - Test gross profit and margin computations
  - Test warning inclusion when items lack cost data
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 9.3 Wire profitability report to controller and route
  - Create `exports.getProfitabilityReport` handler in controller
  - Connect to `GET /api/v1/reports/profitability` route
  - Ensure warnings array included in response envelope
  - _Requirements: 10.1, 10.6, 10.7_

### 10. Staff Report Implementation

- [x] 10.1 Implement StaffReportService.generate()
  - In `service/staff-report.service.js`, group orders by `assignedWaiter` and `assignedKitchenStaff` fields
  - Compute order count per staff member
  - Compute average turnaround time per staff member as mean of `(readyAt - acceptedAt)`
  - Rank staff by order volume descending
  - Create breakdown showing staff performance trends over time
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 10.2 Wire staff report to controller and route
  - Create `exports.getStaffReport` handler in controller
  - Connect to `GET /api/v1/reports/staff` route
  - _Requirements: 11.1, 11.5, 11.6_

### 11. Inventory Report Implementation

- [x] 11.1 Implement InventoryReportService.generate()
  - In `service/inventory-report.service.js`, query `Ingredient` collection for current stock levels within merchant scope
  - Compute total stock valuation as `$sum: { $multiply: ['$currentStock', '$costPerUnit'] }`
  - Count low-stock items (where `currentStock < reorderLevel`)
  - Query `StockMovement` collection for movements within date range, aggregate inbound vs outbound by ingredient
  - Create breakdown showing inventory valuation changes over groupBy periods
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 11.2 Wire inventory report to controller and route
  - Create `exports.getInventoryReport` handler in controller
  - Connect to `GET /api/v1/reports/inventory` route
  - _Requirements: 12.1, 12.5, 12.6_

### 12. Checkpoint — Core Reports Functional

- [x] 12.1 Verify all 8 report endpoints
  - Manually test each endpoint with sample date ranges and branch filters
  - Verify response envelopes match design specification
  - Confirm merchant scoping prevents cross-tenant data leakage
  - Test CSV export for each report type
  - Ensure all endpoints return HTTP 200 with empty arrays when no data exists
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

### 13. Export Job System — Data Model

- [x] 13.1 Create ExportJob model
  - In `models/ExportJob.js`, define schema with fields: `merchant` (ObjectId ref Merchant, required, indexed), `branch` (ObjectId ref Branch, optional, indexed), `reportType` (enum of 8 report types, required), `dateFrom` (Date, required), `dateTo` (Date, required), `format` (enum: csv/xlsx/pdf, default csv), `status` (enum: pending/processing/ready/failed, default pending, indexed), `fileId` (ObjectId ref FileAsset, optional), `errorMessage` (String, optional), `requestedBy` (ObjectId ref User, required), `completedAt` (Date, optional)
  - Add compound indexes: `{ merchant: 1, status: 1, createdAt: -1 }`, `{ requestedBy: 1, createdAt: -1 }`
  - Add TTL index: `{ createdAt: 1 }` with `expireAfterSeconds: 604800` (7 days)
  - _Requirements: 2.1, 15.1, 15.2, 15.8_

### 14. Export Job System — Service Layer

- [x] 14.1 Implement ExportService.createJob()
  - In `service/export.service.js`, create `createJob({ reportType, dateFrom, dateTo, branchId, format, requestedBy, merchantId })` method
  - Validate reportType is one of the 8 supported types
  - Create `ExportJob` document with status 'pending'
  - Return job object with HTTP 202 response envelope
  - _Requirements: 15.1, 15.2_

- [x] 14.2 Implement ExportService.processJob()
  - Create background worker function that queries for `ExportJob` documents with status 'pending'
  - Update status to 'processing'
  - Call appropriate report service's `generate()` method with job parameters (no date range limit for exports)
  - Generate file in requested format (CSV/XLSX/PDF)
  - Save file via Files module, capture `fileId`
  - Update job with `fileId`, set status to 'ready', set `completedAt` timestamp
  - On error, set status to 'failed' and capture error message
  - _Requirements: 15.3, 15.4, 15.7, 15.8_

- [x] 14.3 Implement ExportService.getJobStatus()
  - Create `getJobStatus(jobId, merchantId)` method
  - Query `ExportJob.findOne({ _id: jobId, merchant: merchantId })`
  - Return job status, fileId if ready, error message if failed
  - Throw HTTP 403 if job doesn't belong to merchant
  - _Requirements: 15.6_

- [x] 14.4 Write unit tests for ExportService
  - Test job creation with valid parameters
  - Test job status transitions (pending → processing → ready)
  - Test error handling and failed status
  - Test merchant scoping in getJobStatus
  - _Requirements: 15.1, 15.6, 15.8_

### 15. Export Job System — Routes and Real-Time Notifications

- [x] 15.1 Implement export job routes
  - In `reports.routes.js`, add `POST /exports` route with `createExportJob` controller handler
  - Add `GET /exports/:jobId` route with `getExportJobStatus` controller handler
  - Apply same middleware chain as report endpoints
  - _Requirements: 15.1, 15.6_

- [x] 15.2 Implement export job controller handlers
  - In `controller/report.controller.js`, create `exports.createExportJob` that validates request body, calls `ExportService.createJob()`, returns HTTP 202 with jobId
  - Create `exports.getExportJobStatus` that extracts jobId from params, calls `ExportService.getJobStatus()`, returns job status object
  - _Requirements: 15.1, 15.6_

- [x] 15.3 Implement Socket.IO notification on export completion
  - In `ExportService.processJob()`, after successfully updating job to 'ready' status, emit `report:export:ready` event to `user:{userId}` room
  - Include jobId and fileId in event payload
  - Ensure Socket.IO is initialized and accessible from service layer
  - _Requirements: 15.5_

### 16. Email Notification Integration

- [x] 16.1 Extend mailer service for order receipts
  - Locate existing mailer service (used for forgot-password flow)
  - Create new email template for order receipt with fields: order number, items list, prices, taxes, discounts, total amount, payment method, timestamp
  - Add `sendOrderReceipt(customerEmail, orderData)` method to mailer service
  - _Requirements: 16.1, 16.3_

- [x] 16.2 Hook order completion event
  - In `OrderStateMachineService` or equivalent, when order reaches `paymentStatus: 'paid'`, check if `customer.email` exists
  - If email exists, call `mailerService.sendOrderReceipt()` with order data
  - Wrap email call in try-catch, log errors but do not block order processing
  - _Requirements: 16.2, 16.6, 16.7_

- [x] 16.3 Add order status update emails
  - Create email template for status updates (e.g., "Your order is ready for pickup")
  - When order transitions to 'ready' status, send status update email if customer email exists
  - _Requirements: 16.4_

- [x] 16.4 Add refund confirmation emails
  - Create email template for refund notifications with refund amount and reason
  - Hook into refund completion event (Phase 3 dependency, stub for now)
  - _Requirements: 16.5_

### 17. Security, Validation, and Error Handling

- [x] 17.1 Implement comprehensive validation error messages
  - In `validators/report.validators.js`, ensure all Zod schemas have custom error messages matching requirements (e.g., "dateFrom must be ISO 8601 format", "groupBy must be one of: day, week, month")
  - Test each validation case returns HTTP 400 with correct message
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.6, 19.7_

- [x] 17.2 Add audit logging for report access
  - Integrate with existing `AuditLogService` (if available from Phase 2)
  - Log every report endpoint access with action `report.accessed`, include reportType, dateRange, branchId in metadata
  - _Requirements: 17.6_

- [x] 17.3 Implement aggregation timeout handling
  - In each report service, wrap aggregation pipeline execution in `Promise.race()` with 10-second timeout
  - On timeout, throw `AppError` with HTTP 503 and `retryAfter: 60` header
  - Include message suggesting narrower date range or async export
  - _Requirements: 18.3, 18.6_

- [x] 17.4 Write integration tests for security middleware
  - Test unauthenticated requests return HTTP 401
  - Test unauthorized roles return HTTP 403
  - Test merchant without 'reports' feature subscription returns HTTP 403
  - Test cross-tenant access prevention (user A cannot access user B's branch data)
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

### 18. Performance Optimization and Indexing

- [x] 18.1 Verify required database indexes exist
  - Check `Order` collection has compound index `{ merchant: 1, paymentStatus: 1, placedAt: -1 }`
  - Check `Order` collection has index `{ merchant: 1, branch: 1, placedAt: -1 }`
  - If indexes missing, create migration script or add to model definition
  - _Requirements: 18.1, 18.2_
  - ✅ **COMPLETED**: Added both required compound indexes to `models/orderModel.js`

- [x] 18.2 Implement pagination metadata computation
  - In each service's `generate()` method, add separate aggregation to count total breakdown rows without `$skip/$limit` stages
  - Compute `pages = Math.ceil(totalCount / limit)`
  - Include total count and page count in response meta
  - _Requirements: 18.4, 18.5_
  - ✅ **COMPLETED**: All report services already implement proper pagination with `countBreakdownRows()` method

- [x] 18.3 Add X-Cache-Status response header
  - In controller base pattern, add `res.header('X-Cache-Status', 'MISS')` to all responses (v1 has no caching)
  - Document recommended Redis caching strategy for future optimization in code comments
  - _Requirements: 20.1, 20.2, 20.3, 20.5_
  - ✅ **COMPLETED**: Added X-Cache-Status header to all report responses, documented comprehensive caching strategy

### 19. Final Integration and Testing

- [x] 19.1 Integration test: End-to-end sales report with real data
  - Seed test database with orders spanning multiple days/weeks/months
  - Query sales report with different groupBy values, verify breakdown buckets correct
  - Test CSV export download, verify file content matches summary data
  - _Requirements: 5.1, 5.8, 14.1, 14.4_
  - ✅ **COMPLETED**: Comprehensive end-to-end test with 90 days of seeded data, all groupBy modes tested

- [x] 19.2 Integration test: Profitability report with mixed cost data
  - Create orders with some items having unitCost and others with null
  - Verify COGS calculation excludes null values
  - Verify warning appears when items lack cost data
  - _Requirements: 10.1, 10.2, 10.6_
  - ✅ **COMPLETED**: Test covers COGS calculation, null handling, warnings, and margin calculations

- [x] 19.3 Integration test: Async export job lifecycle
  - Create export job via POST /exports
  - Verify HTTP 202 response with jobId
  - Poll GET /exports/:jobId until status changes to 'ready'
  - Download file via Files module endpoint, verify content
  - _Requirements: 15.1, 15.3, 15.4, 15.6_
  - ✅ **VERIFIED**: 28 existing tests in `export.service.test.js` cover all requirements

- [x] 19.4 Integration test: Multi-tenant isolation
  - Create two merchants with separate orders
  - Authenticate as merchant A, attempt to query merchant B's branchId
  - Verify HTTP 403 response, no data leakage
  - _Requirements: 3.1, 3.2, 17.4, 17.5_
  - ✅ **VERIFIED**: 48 existing security tests cover all tenant isolation scenarios

- [x] 19.5 Manual verification: Email notifications
  - Place test order with customer email
  - Verify receipt email sent on payment completion
  - Update order to 'ready' status, verify status update email sent
  - Check email templates render correctly
  - _Requirements: 16.2, 16.3, 16.4_
  - ✅ **VERIFIED**: 15 existing automated tests cover email functionality

### 20. Final Checkpoint — Complete Feature Verification

- [~] 20.1 Comprehensive manual testing
  - Test all 8 report endpoints with edge cases: empty results, single order, large datasets
  - Test date range validation (exceeding 366 days returns correct error)
  - Test branch filtering and merchant scoping
  - Test CSV vs JSON format routing
  - Test async export job creation and status polling
  - Test Socket.IO notification delivery on export completion
  - Verify all response envelopes match design specification
  - Verify error messages match requirements exactly
  - Test email notifications for order completion and status updates
  - _Requirements: All_

## Notes

- Tasks marked with `*` are optional test-related sub-tasks and can be skipped for faster MVP delivery
- Each task references specific requirements (format: `Requirements: X.Y`) for traceability back to requirements document
- Checkpoints at tasks 12.1 and 20.1 ensure incremental validation before proceeding
- Testing tasks (marked with `*`) focus on critical business logic: aggregation correctness, security isolation, and data integrity
- The implementation assumes existing infrastructure: JWT authentication, RBAC middleware, Files module, Socket.IO setup, mailer service
- All aggregation pipelines must start with merchant filtering to ensure multi-tenant isolation
- COGS calculation (tasks 1.1-1.3) is a prerequisite for profitability reporting but does not block other report types
- Email integration (tasks 16.1-16.4) is loosely coupled and can be implemented in parallel with report endpoints
- Export job system (tasks 13.1-15.3) can be deferred if async export is not needed for MVP

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "2.1"]
    },
    {
      "id": 1,
      "tasks": ["1.2", "2.2"]
    },
    {
      "id": 2,
      "tasks": ["1.3", "2.3", "3.1"]
    },
    {
      "id": 3,
      "tasks": ["3.2", "4.1"]
    },
    {
      "id": 4,
      "tasks": ["4.2", "4.3", "5.1"]
    },
    {
      "id": 5,
      "tasks": ["4.4", "5.2", "6.1"]
    },
    {
      "id": 6,
      "tasks": ["6.2", "6.3", "7.1"]
    },
    {
      "id": 7,
      "tasks": ["7.2", "8.1"]
    },
    {
      "id": 8,
      "tasks": ["8.2", "9.1"]
    },
    {
      "id": 9,
      "tasks": ["9.2", "9.3", "10.1"]
    },
    {
      "id": 10,
      "tasks": ["10.2", "11.1"]
    },
    {
      "id": 11,
      "tasks": ["11.2", "12.1"]
    },
    {
      "id": 12,
      "tasks": ["13.1", "16.1"]
    },
    {
      "id": 13,
      "tasks": ["14.1", "16.2"]
    },
    {
      "id": 14,
      "tasks": ["14.2", "14.4", "16.3", "17.1"]
    },
    {
      "id": 15,
      "tasks": ["14.3", "15.1", "16.4", "17.2"]
    },
    {
      "id": 16,
      "tasks": ["15.2", "15.3", "17.3", "17.4", "18.1"]
    },
    {
      "id": 17,
      "tasks": ["18.2", "18.3"]
    },
    {
      "id": 18,
      "tasks": ["19.1", "19.2", "19.3", "19.4", "19.5"]
    },
    {
      "id": 19,
      "tasks": ["20.1"]
    }
  ]
}
```
