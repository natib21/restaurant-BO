# Requirements Document — Advanced Reporting

## Introduction

The Advanced Reporting module provides comprehensive real-time analytics and insights for restaurant operations. It enables merchants to analyze sales performance, order trends, product popularity, customer behavior, delivery operations, profitability metrics, staff performance, and inventory valuation. The module is read-only, querying existing data through MongoDB aggregation pipelines, with support for both synchronous dashboard reports and asynchronous bulk exports.

This feature addresses the critical business need for data-driven decision-making by transforming transactional data into actionable insights, supporting both day-to-day operational monitoring and strategic business planning.

## Glossary

- **Report_Module**: The new `src/modules/reports/` system that generates analytics by querying existing collections
- **Order_Collection**: The existing MongoDB collection storing order transaction data with snapshotted financial fields
- **Aggregation_Pipeline**: MongoDB aggregation queries that compute report metrics in real-time
- **Export_Service**: The subsystem handling asynchronous generation of large report files
- **Merchant**: The top-level tenant entity owning all branch and operational data
- **Branch**: A physical restaurant location within a merchant's organization
- **COGS**: Cost of Goods Sold, computed from recipe ingredient costs
- **MenuItem_Recipe**: The list of ingredients and quantities required to prepare a menu item
- **Snapshot**: Financial values captured at order-placement time, immune to later price changes
- **Date_Range**: The time period filter for report queries, bounded by `dateFrom` and `dateTo`
- **GroupBy_Bucket**: The time aggregation unit (day, week, or month) for breakdown data
- **Summary_Object**: Single-row aggregated totals across the entire date range
- **Breakdown_Array**: Per-bucket detailed rows showing trends over time
- **Sync_Export**: Immediate CSV generation for small summary data
- **Async_Export**: Background job for large row-level data exports
- **Files_Module**: The existing file storage system reused for export file management
- **Payment_Status**: Order payment state (unpaid, paid, partially_refunded, refunded)
- **AOV**: Average Order Value, computed as total revenue divided by order count
- **Net_Revenue**: Gross sales minus discounts, refunds, and taxes
- **Stock_Valuation**: Total value of inventory computed as sum of (quantity × costPerUnit)

## Requirements

### Requirement 1: Report Data Model Extensions

**User Story:** As a system architect, I want order items and menu items to capture cost data, so that profitability reports can accurately compute COGS.

#### Acceptance Criteria

1. THE MenuItem_Schema SHALL include a `recipe` field containing an array of ingredient references with quantities
2. WHEN a MenuItem has a recipe, EACH recipe entry SHALL reference an Ingredient document and specify a quantity value
3. THE OrderItem_Schema SHALL include a `unitCost` field storing the snapshotted COGS per unit
4. WHEN an order is placed, THE Order_Service SHALL compute unitCost as the sum of (recipe ingredient quantity × ingredient costPerUnit) for each item with a recipe
5. WHEN an order is placed, THE Order_Service SHALL snapshot the computed unitCost onto the order item document
6. WHEN a MenuItem has no recipe, THE unitCost field SHALL be set to null
7. THE unitCost snapshot SHALL remain immutable after order placement regardless of subsequent ingredient price changes

### Requirement 2: Report Module Architecture

**User Story:** As a developer, I want a dedicated reports module following existing architectural patterns, so that analytics functionality is maintainable and consistent with the codebase.

#### Acceptance Criteria

1. THE Report_Module SHALL exist at path `src/modules/reports/` following the established module structure
2. THE Report_Module SHALL be read-only and own no persistent data except optional export job metadata
3. THE Report_Module SHALL query Order_Collection, Inventory, Customer, User, and MenuItem collections via aggregation pipelines
4. THE Report_Module routes SHALL apply middleware chain `protect → restrictTo() → requireFeature('reports')` following existing RBAC patterns
5. THE Report_Module SHALL use `getMerchantId(req)` for tenant isolation identical to existing modules
6. THE Report_Module SHALL reuse existing Files_Module for export file storage without introducing new storage mechanisms

### Requirement 3: Multi-Tenant and Multi-Branch Scoping

**User Story:** As a merchant, I want to view reports for specific branches or all branches combined, so that I can analyze performance at different organizational levels.

#### Acceptance Criteria

1. WHEN a branchId is provided in the query, THE Report_Module SHALL filter all aggregations to that single branch
2. WHEN branchId is omitted, THE Report_Module SHALL aggregate data across all branches owned by the authenticated merchant
3. THE Report_Module SHALL always scope queries by merchantId extracted from JWT context
4. THE Report_Module SHALL never trust merchantId values from query parameters or request body
5. EVERY aggregation pipeline `$match` stage SHALL begin with merchant filtering before applying branch or date filters

### Requirement 4: Date Range Handling

**User Story:** As a merchant, I want to query reports for specific time periods, so that I can analyze trends and compare performance across different timeframes.

#### Acceptance Criteria

1. EVERY report endpoint SHALL accept `dateFrom` and `dateTo` as required ISO date string parameters
2. WHEN the date range exceeds 366 days, THE Report_Module SHALL reject JSON/dashboard requests with HTTP 400 error
3. WHEN the date range exceeds 366 days, THE Export_Service SHALL accept the request for asynchronous processing
4. THE Report_Module SHALL support `groupBy` parameter with values 'day', 'week', or 'month', defaulting to 'day'
5. THE aggregation pipeline SHALL group breakdown data according to the specified groupBy bucket size

### Requirement 5: Sales Report

**User Story:** As a merchant, I want detailed sales analytics, so that I can understand revenue trends, payment methods, and average transaction values.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/sales` is called, THE Report_Module SHALL return gross revenue computed from all orders with paymentStatus 'paid'
2. THE Sales_Report SHALL compute net revenue as gross revenue minus discountAmount minus taxAmount
3. THE Sales_Report SHALL aggregate refund amounts separately and subtract from net revenue
4. THE Sales_Report SHALL provide payment method breakdown grouping by `paymentDetails.method`
5. THE Sales_Report SHALL compute AOV as total revenue divided by count of paid orders
6. THE Sales_Report SHALL separate deliveryFee revenue from item sales revenue
7. THE Sales_Report summary SHALL include: gross revenue, total discounts, total taxes, total refunds, net revenue, AOV, order count
8. THE Sales_Report breakdown SHALL provide per-bucket metrics grouped by the requested groupBy period

### Requirement 6: Order Analytics Report

**User Story:** As an operations manager, I want order volume and timing metrics, so that I can optimize kitchen staffing and identify bottlenecks.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/orders` is called, THE Report_Module SHALL count orders grouped by status
2. THE Order_Report SHALL compute cancellation rate as canceled orders divided by total orders
3. THE Order_Report SHALL compute average time-to-ready as mean difference between placedAt and readyAt timestamps
4. THE Order_Report SHALL exclude orders with null readyAt from time-to-ready calculations
5. THE Order_Report summary SHALL include: total orders, orders by status, cancellation rate, average preparation time
6. THE Order_Report breakdown SHALL show order volume trends over the groupBy period

### Requirement 7: Product Performance Report

**User Story:** As a menu manager, I want to identify top-selling and underperforming items, so that I can optimize the menu and manage inventory.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/products` is called, THE Report_Module SHALL unwind order items and group by menuItem reference
2. THE Product_Report SHALL compute total quantity sold per menu item
3. THE Product_Report SHALL compute total revenue per menu item as sum of (quantity × unitPrice)
4. THE Product_Report SHALL rank items by quantity sold in descending order for top-sellers
5. THE Product_Report SHALL identify low-performing items as those below a computed threshold (bottom 20% by quantity)
6. THE Product_Report SHALL aggregate performance by menu category
7. THE Product_Report summary SHALL include: total items sold, total item revenue, top 10 items, bottom 10 items, category breakdown
8. THE Product_Report breakdown SHALL show item performance trends over the groupBy period

### Requirement 8: Customer Analytics Report

**User Story:** As a marketing manager, I want customer behavior insights, so that I can design retention campaigns and identify high-value customers.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/customers` is called, THE Report_Module SHALL group orders by customer reference
2. THE Customer_Report SHALL classify customers as new when their first order falls within the date range
3. THE Customer_Report SHALL classify customers as returning when they have orders before the date range start
4. THE Customer_Report SHALL compute total spend per customer as sum of totalAmount from paid orders
5. THE Customer_Report SHALL rank customers by total spend in descending order
6. THE Customer_Report summary SHALL include: new customer count, returning customer count, spend distribution percentiles, top 20 customers
7. THE Customer_Report breakdown SHALL show customer acquisition trends over the groupBy period

### Requirement 9: Delivery Operations Report

**User Story:** As a delivery manager, I want delivery-specific metrics, so that I can monitor service quality and fee revenue.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/delivery` is called, THE Report_Module SHALL filter orders to orderType 'delivery' only
2. THE Delivery_Report SHALL count total delivery orders in the date range
3. THE Delivery_Report SHALL compute total delivery fee revenue as sum of deliveryFee from paid orders
4. WHEN orders have dispatchedAt and deliveredAt timestamps, THE Delivery_Report SHALL compute average delivery duration
5. THE Delivery_Report SHALL exclude orders with null timestamps from duration calculations
6. THE Delivery_Report summary SHALL include: delivery order count, total delivery fees, average delivery time, on-time delivery percentage
7. THE Delivery_Report breakdown SHALL show delivery volume and fee trends over the groupBy period

### Requirement 10: Profitability Report

**User Story:** As a financial manager, I want cost and profit analysis, so that I can understand margins and identify unprofitable items.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/profitability` is called, THE Report_Module SHALL compute COGS as sum of (unitCost × quantity) across all order items
2. THE Profitability_Report SHALL only include items with non-null unitCost in COGS calculations
3. THE Profitability_Report SHALL compute gross profit as net revenue minus COGS
4. THE Profitability_Report SHALL compute gross margin percentage as (gross profit / net revenue) × 100
5. THE Profitability_Report SHALL identify items with negative or low margins (below configurable threshold)
6. THE Profitability_Report summary SHALL include: total COGS, gross profit, gross margin percentage, net margin, items without COGS data count
7. THE Profitability_Report breakdown SHALL show profitability trends over the groupBy period

### Requirement 11: Staff Performance Report

**User Story:** As a restaurant manager, I want staff productivity metrics, so that I can optimize scheduling and recognize high performers.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/staff` is called, THE Report_Module SHALL group orders by assignedWaiter and assignedKitchenStaff
2. THE Staff_Report SHALL compute order count per staff member
3. THE Staff_Report SHALL compute average turnaround time per staff member as mean time from order acceptance to ready
4. THE Staff_Report SHALL rank staff by order volume in descending order
5. THE Staff_Report summary SHALL include: orders per waiter, orders per kitchen staff, average turnaround by staff member, top performers
6. THE Staff_Report breakdown SHALL show staff performance trends over the groupBy period

### Requirement 12: Inventory Valuation Report

**User Story:** As an inventory manager, I want stock valuation and movement summaries, so that I can track inventory investment and usage.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/inventory` is called, THE Report_Module SHALL query Ingredient collection for current stock levels
2. THE Inventory_Report SHALL compute total stock valuation as sum of (currentStock × costPerUnit)
3. THE Inventory_Report SHALL aggregate StockMovement records within the date range
4. THE Inventory_Report SHALL summarize inbound and outbound movements by ingredient
5. THE Inventory_Report summary SHALL include: total inventory value, low stock item count, movement summary
6. THE Inventory_Report breakdown SHALL show inventory valuation changes over the groupBy period

### Requirement 13: Report Response Format

**User Story:** As a frontend developer, I want consistent response structures across all reports, so that I can build a unified dashboard interface.

#### Acceptance Criteria

1. EVERY report endpoint SHALL return responses in the format `{ status, data: { summary, breakdown }, meta }`
2. THE summary object SHALL contain single-row aggregated totals across the entire date range
3. THE breakdown array SHALL contain per-groupBy-bucket detailed rows showing trends
4. THE meta object SHALL include: dateFrom, dateTo, branchId (if provided), page number, total pages
5. THE breakdown array SHALL support pagination via `page` and `limit` query parameters with defaults page=1, limit=50
6. WHEN no data exists for the date range, THE Report_Module SHALL return empty arrays with HTTP 200 status

### Requirement 14: Synchronous CSV Export

**User Story:** As a merchant, I want to download small summary reports as CSV files, so that I can analyze data in spreadsheet tools.

#### Acceptance Criteria

1. WHEN a report endpoint receives `format=csv` query parameter, THE Report_Module SHALL generate CSV output synchronously
2. THE CSV export SHALL include the summary object data only, not the full breakdown array
3. THE Report_Module SHALL stream the CSV response with `Content-Disposition: attachment` header
4. THE CSV file name SHALL include report type and date range in format `{reportType}_{dateFrom}_{dateTo}.csv`
5. THE synchronous export SHALL complete within 5 seconds or return HTTP 503 error

### Requirement 15: Asynchronous Export Jobs

**User Story:** As a merchant, I want to export large row-level report data without browser timeouts, so that I can access complete datasets for external analysis.

#### Acceptance Criteria

1. WHEN `/api/v1/reports/exports` receives a POST request, THE Export_Service SHALL create an export job and return HTTP 202 with jobId
2. THE export job request SHALL accept: reportType, dateFrom, dateTo, branchId (optional), format (csv, xlsx, pdf)
3. THE Export_Service SHALL process the export job asynchronously in a background worker
4. WHEN the export completes, THE Export_Service SHALL save the file via Files_Module and store the fileId reference
5. WHEN the export completes, THE Export_Service SHALL emit `report:export:ready` Socket.IO event to the user's `user:{userId}` room
6. WHEN `/api/v1/reports/exports/:jobId` is called, THE Export_Service SHALL return job status ('pending', 'ready', 'failed') and fileId if ready
7. THE export job SHALL support date ranges exceeding 366 days without validation errors
8. WHEN an export job fails, THE Export_Service SHALL store error details and return them in the status endpoint

### Requirement 16: Email Receipt Notifications

**User Story:** As a customer, I want to receive order confirmation and status update emails, so that I have a record of my transaction and can track my order.

#### Acceptance Criteria

1. THE Report_Module SHALL extend the existing mailer service without introducing new email infrastructure
2. WHEN an order reaches paymentStatus 'paid', THE Notification_Service SHALL send an order receipt email if customer email exists
3. THE receipt email SHALL include: order number, items, prices, taxes, discounts, total amount, payment method, timestamp
4. WHEN an order transitions to 'ready' status, THE Notification_Service SHALL send a status update email if customer email exists
5. WHEN an order is refunded, THE Notification_Service SHALL send a refund confirmation email with refund amount and reason
6. THE Notification_Service SHALL log all email send attempts to aid troubleshooting
7. WHEN email sending fails, THE system SHALL log the error but SHALL NOT block order processing

### Requirement 17: Security and Access Control

**User Story:** As a security administrator, I want reports to follow existing RBAC patterns, so that sensitive financial data is only accessible to authorized users.

#### Acceptance Criteria

1. EVERY report endpoint SHALL enforce authentication via the `protect` middleware
2. EVERY report endpoint SHALL enforce role authorization via `restrictTo()` middleware
3. EVERY report endpoint SHALL enforce feature subscription gating via `requireFeature('reports')` middleware
4. THE Report_Module SHALL use existing `merchantScopedQuery` pattern to prevent cross-tenant data leakage
5. THE Report_Module SHALL never expose raw customer PII (phone, email) in breakdown arrays without explicit permission check
6. THE Report_Module SHALL log all report access attempts to AuditLog for compliance

### Requirement 18: Performance and Scalability

**User Story:** As a system administrator, I want reports to execute efficiently, so that dashboard responsiveness is acceptable even with large data volumes.

#### Acceptance Criteria

1. EVERY aggregation pipeline SHALL use indexed fields for $match stages (merchant, branch, placedAt, status)
2. THE Report_Module SHALL leverage existing compound indexes on Order_Collection
3. WHEN an aggregation exceeds 10 seconds execution time, THE Report_Module SHALL return HTTP 503 with retry-after header
4. THE Report_Module SHALL compute breakdown pagination server-side using $skip and $limit aggregation stages
5. THE Report_Module SHALL NOT load entire result sets into memory before pagination
6. THE Report_Module SHALL suggest using async export when query complexity or date range may cause timeout

### Requirement 19: Error Handling and Validation

**User Story:** As a frontend developer, I want clear error messages for invalid report queries, so that I can guide users to correct their input.

#### Acceptance Criteria

1. WHEN dateFrom is missing, THE Report_Module SHALL return HTTP 400 with message "dateFrom is required"
2. WHEN dateTo is missing, THE Report_Module SHALL return HTTP 400 with message "dateTo is required"
3. WHEN dateFrom is after dateTo, THE Report_Module SHALL return HTTP 400 with message "dateFrom must be before dateTo"
4. WHEN date range exceeds 366 days for JSON endpoints, THE Report_Module SHALL return HTTP 400 with message "Date range exceeds maximum of 366 days. Use export for larger ranges."
5. WHEN branchId is provided but does not belong to merchant, THE Report_Module SHALL return HTTP 403 with message "Access denied to specified branch"
6. WHEN groupBy has invalid value, THE Report_Module SHALL return HTTP 400 with message "groupBy must be one of: day, week, month"
7. WHEN format parameter has unsupported value, THE Report_Module SHALL return HTTP 400 with message "format must be one of: json, csv, xlsx, pdf"

### Requirement 20: Report Caching Strategy

**User Story:** As a system architect, I want to minimize redundant aggregation queries, so that system resources are used efficiently during repeated dashboard loads.

#### Acceptance Criteria

1. THE Report_Module SHALL NOT implement pre-aggregation or caching in version 1
2. THE Report_Module SHALL execute all queries in real-time against Order_Collection
3. THE Report_Module SHALL document recommended caching strategy for future optimization (Redis with 5-minute TTL keyed by query parameters)
4. WHEN date range is in the past (dateTo < current date), THE Report_Module MAY cache results as historical data is immutable
5. THE Report_Module SHALL include `X-Cache-Status` response header indicating 'MISS' for all v1 responses
