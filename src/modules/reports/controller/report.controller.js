/**
 * Reports Controller - Base Handler Pattern and Helper Utilities
 * 
 * This controller provides HTTP handlers for report endpoints with:
 * - Base controller handler pattern for consistent structure across all report endpoints
 * - Shared helper utilities for common validation, security, and response formatting tasks
 * - Template function that follows design pattern for merchant scoping, validation, and envelope structure
 * 
 * Requirements covered:
 * - 2.5: Merchant scoping using getMerchantId(req)
 * - 3.1: Shared controller helper utilities and base handler pattern
 * - 4.2: Date range validation with 366-day limit
 * - 4.3: Branch ownership verification
 * - 13.1, 13.2, 13.3, 13.4, 13.5: Consistent response envelope structure
 * - 19.4: Error handling for invalid date ranges
 * - 19.5: Error handling for unauthorized branch access
 */

const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const Branch = require('../../../../models/branchModel');
const auditLogger = require('../../../../utils/auditLogger');

// Import report services
const { SalesReportService } = require('../service/sales-report.service');
const { OrdersReportService } = require('../service/orders-report.service');
const { ProductsReportService } = require('../service/products-report.service');
const { CustomersReportService } = require('../service/customers-report.service');
const { DeliveryReportService } = require('../service/delivery-report.service');
const { ProfitabilityReportService } = require('../service/profitability-report.service');
const { StaffReportService } = require('../service/staff-report.service');
const { InventoryReportService } = require('../service/inventory-report.service');
const { ExportService } = require('../service/export.service');

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Validates date range does not exceed 366 days for JSON format
 * 
 * @param {string} dateFrom - ISO date string for start date
 * @param {string} dateTo - ISO date string for end date  
 * @param {string} format - Response format ('json' or 'csv')
 * @throws {AppError} HTTP 400 if date range exceeds 366 days for JSON format
 * 
 * Requirements: 4.2, 19.4
 */
function validateDateRange(dateFrom, dateTo, format) {
  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);
  
  // Calculate difference in days
  const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
  
  // Only enforce 366-day limit for JSON format (CSV and exports can handle larger ranges)
  if (daysDiff > 366 && format === 'json') {
    throw new AppError(
      'Date range exceeds maximum of 366 days. Use export for larger ranges.',
      400
    );
  }
}

/**
 * Verifies that the specified branch belongs to the merchant
 * 
 * @param {string} branchId - ObjectId string for the branch
 * @param {string} merchantId - ObjectId string for the merchant
 * @throws {AppError} HTTP 403 if branch not found or doesn't belong to merchant
 * 
 * Requirements: 4.3, 19.5
 */
async function verifyBranchOwnership(branchId, merchantId) {
  if (!branchId) return; // Skip if no branchId provided
  
  const branch = await Branch.findOne({ 
    _id: branchId, 
    merchant: merchantId 
  });
  
  if (!branch) {
    throw new AppError('Access denied to specified branch', 403);
  }
}

/**
 * Converts a summary object to CSV format with headers
 * 
 * @param {Object} summaryObject - The summary data object to convert
 * @returns {string} CSV formatted string with headers and data
 * 
 * Requirements: 3.1, 14.2, 14.3
 */
function convertToCSV(summaryObject) {
  if (!summaryObject || typeof summaryObject !== 'object') {
    return '';
  }
  
  // Extract keys (headers) and values from the summary object
  const headers = Object.keys(summaryObject);
  const values = Object.values(summaryObject);
  
  // Create CSV header row
  const csvHeaders = headers.join(',');
  
  // Create CSV data row, handling various data types
  const csvData = values.map(value => {
    // Handle null/undefined values
    if (value === null || value === undefined) {
      return '';
    }
    
    // Handle strings that might contain commas or quotes
    if (typeof value === 'string') {
      // Escape quotes by doubling them and wrap in quotes if contains comma or quote
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }
    
    // Handle numbers, booleans, and other primitives
    return String(value);
  }).join(',');
  
  // Combine headers and data
  return `${csvHeaders}\n${csvData}`;
}

// ============================================================
// BASE CONTROLLER HANDLER PATTERN
// ============================================================

/**
 * Template handler function following design pattern for all report endpoints
 * 
 * This function provides a consistent pattern for:
 * - Extracting merchantId from getMerchantId(req) (never from params)
 * - Validating date range constraints
 * - Verifying branch ownership if branchId provided
 * - Delegating to service layer
 * - Handling CSV vs JSON format routing
 * - Returning consistent envelope structure
 * - Audit logging for report access (Requirement 17.6)
 * 
 * @param {Function} serviceMethod - The service method to call (e.g., SalesReportService.generate)
 * @param {Object} options - Configuration options
 * @param {string} options.reportType - Type of report for CSV filename generation
 * 
 * Requirements: 2.5, 3.1, 13.1, 13.2, 13.3, 13.4, 13.5, 17.6
 */
function createReportHandler(serviceMethod, options = {}) {
  const { reportType = 'report' } = options;
  
  return catchAsync(async (req, res, next) => {
    // 1. Extract tenant context (never trust client-provided merchantId)
    const merchantId = getMerchantId(req);
    if (!merchantId) {
      throw new AppError('Merchant context required', 401);
    }

    // 2. Extract and validate query parameters
    const { 
      dateFrom, 
      dateTo, 
      branchId, 
      groupBy = 'day', 
      page = 1, 
      limit = 50, 
      format = 'json' 
    } = req.query;

    // 3. Validate date range constraints
    validateDateRange(dateFrom, dateTo, format);

    // 4. Verify branch ownership if branchId provided
    await verifyBranchOwnership(branchId, merchantId);

    // 5. Delegate to service layer
    const result = await serviceMethod({
      merchantId,
      branchId,
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      groupBy,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // 6. Audit logging for report access (Requirement 17.6)
    try {
      await auditLogger({
        user: req.user,
        action: 'REPORT_ACCESS',
        resource: 'Report',
        method: req.method,
        endpoint: req.originalUrl,
        statusCode: 200,
        metadata: {
          reportType,
          dateFrom,
          dateTo,
          branchId: branchId || null,
          format,
          groupBy
        },
        req
      });
    } catch (auditError) {
      // Log audit failure but don't block report generation
      console.error('Audit log failed for report access:', auditError.message);
    }

    // 7. Handle format routing - CSV vs JSON
    if (format === 'csv') {
      const filename = `${reportType}_${dateFrom}_${dateTo}.csv`;
      return res
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(convertToCSV(result.summary));
    }

    // 8. Return consistent envelope structure for JSON
    // Add X-Cache-Status header (Requirement 18.3, 20.1)
    // Current implementation: No caching (always MISS)
    // Future optimization: Implement Redis caching with TTL based on query parameters
    // Cache strategy:
    // - Cache key pattern: `report:${reportType}:${merchantId}:${branchId}:${dateFrom}:${dateTo}:${groupBy}:${page}:${limit}`
    // - TTL: 5-15 minutes for frequently accessed reports
    // - Invalidation: On new order creation or status updates
    // - Consider cache warming for common date ranges (today, yesterday, last 7 days)
    res.header('X-Cache-Status', 'MISS');
    
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
        page: result.page || parseInt(page),
        pages: result.pages || 1,
        total: result.total || 0
      }
    });
  });
}

// ============================================================
// SPECIFIC REPORT HANDLERS
// ============================================================

/**
 * Sales Report Handler
 * 
 * Generates comprehensive sales analytics including revenue, discounts, taxes,
 * delivery fees, order counts, and average order value with time-series breakdown.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.7, 5.8, 14.1, 14.2, 14.3, 14.4
 */
const getSalesReport = createReportHandler(
  (params) => SalesReportService.generate(params),
  { reportType: 'sales' }
);

/**
 * Orders Report Handler
 * 
 * Generates order volume and timing analytics including order counts by status,
 * cancellation rates, and average preparation times with time-series breakdown.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
const getOrdersReport = createReportHandler(
  (params) => OrdersReportService.generate(params),
  { reportType: 'orders' }
);

/**
 * Products Report Handler
 * 
 * Generates product performance analytics including top sellers, low performers,
 * category breakdown, and item revenue trends with time-series breakdown.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
const getProductsReport = createReportHandler(
  (params) => ProductsReportService.generate(params),
  { reportType: 'products' }
);

/**
 * Customers Report Handler
 * 
 * Generates customer analytics including new vs returning customer classification,
 * spend distribution percentiles, top customers by spend, and acquisition trends.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
const getCustomersReport = createReportHandler(
  (params) => CustomersReportService.generate(params),
  { reportType: 'customers' }
);

/**
 * Delivery Report Handler
 * 
 * Generates delivery-specific analytics including delivery order volume, total delivery fees,
 * average delivery duration, and on-time delivery percentage with time-series breakdown.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */
const getDeliveryReport = createReportHandler(
  (params) => DeliveryReportService.generate(params),
  { reportType: 'delivery' }
);

/**
 * Profitability Report Handler
 * 
 * Generates profitability analytics including COGS, gross profit, margins,
 * and identifies low-margin items with warnings for incomplete cost data.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
const getProfitabilityReport = catchAsync(async (req, res, next) => {
  // 1. Extract tenant context (never trust client-provided merchantId)
  const merchantId = getMerchantId(req);
  if (!merchantId) {
    throw new AppError('Merchant context required', 401);
  }

  // 2. Extract and validate query parameters
  const { 
    dateFrom, 
    dateTo, 
    branchId, 
    groupBy = 'day', 
    page = 1, 
    limit = 50, 
    format = 'json' 
  } = req.query;

  // 3. Validate date range constraints
  validateDateRange(dateFrom, dateTo, format);

  // 4. Verify branch ownership if branchId provided
  await verifyBranchOwnership(branchId, merchantId);

  // 5. Delegate to service layer
  const result = await ProfitabilityReportService.generate({
    merchantId,
    branchId,
    dateFrom: new Date(dateFrom),
    dateTo: new Date(dateTo),
    groupBy,
    page: parseInt(page),
    limit: parseInt(limit)
  });

  // 6. Audit logging for report access (Requirement 17.6)
  try {
    await auditLogger({
      user: req.user,
      action: 'REPORT_ACCESS',
      resource: 'Report',
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: 200,
      metadata: {
        reportType: 'profitability',
        dateFrom,
        dateTo,
        branchId: branchId || null,
        format,
        groupBy
      },
      req
    });
  } catch (auditError) {
    // Log audit failure but don't block report generation
    console.error('Audit log failed for report access:', auditError.message);
  }

  // 7. Handle format routing - CSV vs JSON
  if (format === 'csv') {
    const filename = `profitability_${dateFrom}_${dateTo}.csv`;
    return res
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(convertToCSV(result.summary));
  }

  // 8. Return consistent envelope structure for JSON with warnings
  // Add X-Cache-Status header (Requirement 18.3, 20.1)
  // Current implementation: No caching (always MISS)
  // Profitability reports should have shorter cache TTL due to dynamic cost data
  res.header('X-Cache-Status', 'MISS');
  
  res.status(200).json({
    status: 'success',
    data: {
      summary: result.summary,
      breakdown: result.breakdown
    },
    warnings: result.warnings || [],
    meta: {
      dateFrom,
      dateTo,
      branchId: branchId || null,
      page: result.page || parseInt(page),
      pages: result.pages || 1,
      total: result.total || 0
    }
  });
});

/**
 * Staff Report Handler
 * 
 * Generates staff performance analytics including order volume per staff member,
 * turnaround times, and productivity metrics for waiters and kitchen staff.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
const getStaffReport = createReportHandler(
  (params) => StaffReportService.generate(params),
  { reportType: 'staff' }
);

/**
 * Inventory Report Handler
 * 
 * Generates inventory analytics including stock valuation, low stock items,
 * stock movements, and category breakdown.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */
const getInventoryReport = createReportHandler(
  (params) => InventoryReportService.generate(params),
  { reportType: 'inventory' }
);

// ============================================================
// EXPORT JOB HANDLERS
// ============================================================

/**
 * Create Export Job Handler
 * 
 * Creates an asynchronous export job for large report datasets that exceed
 * the 366-day limit or require bulk export functionality.
 * 
 * POST /api/v1/reports/exports
 * 
 * Request Body:
 * - reportType: string (required) - One of the 8 supported report types
 * - dateFrom: string (required) - ISO date string
 * - dateTo: string (required) - ISO date string
 * - branchId: string (optional) - Branch ObjectId filter
 * - format: string (optional) - 'csv', 'xlsx', or 'pdf' (default: 'csv')
 * 
 * Response: HTTP 202 Accepted
 * {
 *   status: 'success',
 *   data: {
 *     jobId: string,
 *     status: 'pending',
 *     reportType: string,
 *     format: string,
 *     createdAt: Date
 *   }
 * }
 * 
 * Requirements: 15.1, 15.2
 */
const createExportJob = catchAsync(async (req, res, next) => {
  // 1. Extract tenant context (never trust client-provided merchantId)
  const merchantId = getMerchantId(req);
  if (!merchantId) {
    throw new AppError('Merchant context required', 401);
  }

  // 2. Extract and validate request body
  const { reportType, dateFrom, dateTo, branchId, format = 'csv' } = req.body;

  // Validate required fields
  if (!reportType) {
    throw new AppError('reportType is required', 400);
  }
  if (!dateFrom) {
    throw new AppError('dateFrom is required', 400);
  }
  if (!dateTo) {
    throw new AppError('dateTo is required', 400);
  }

  // 3. Verify branch ownership if branchId provided
  await verifyBranchOwnership(branchId, merchantId);

  // 4. Extract user context for requestedBy field
  const requestedBy = req.user._id.toString();

  // 5. Create export job via service
  const job = await ExportService.createJob({
    reportType,
    dateFrom,
    dateTo,
    branchId,
    format,
    requestedBy,
    merchantId
  });

  // 6. Audit logging for report export (Requirement 17.6)
  try {
    await auditLogger({
      user: req.user,
      action: 'REPORT_EXPORT',
      resource: 'Report',
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: 202,
      metadata: {
        reportType,
        dateFrom,
        dateTo,
        branchId: branchId || null,
        format
      },
      req
    });
  } catch (auditError) {
    // Log audit failure but don't block export job creation
    console.error('Audit log failed for report export:', auditError.message);
  }

  // 7. Return HTTP 202 Accepted with job details
  res.status(202).json({
    status: 'success',
    data: job
  });
});

/**
 * Get Export Job Status Handler
 * 
 * Retrieves the status of an export job with merchant scoping to ensure
 * users can only access their own export jobs.
 * 
 * GET /api/v1/reports/exports/:jobId
 * 
 * Response:
 * {
 *   status: 'success',
 *   data: {
 *     jobId: string,
 *     status: 'pending' | 'processing' | 'ready' | 'failed',
 *     reportType: string,
 *     format: string,
 *     dateFrom: Date,
 *     dateTo: Date,
 *     branchId: string | null,
 *     createdAt: Date,
 *     completedAt: Date | null,
 *     fileId: string | null (present if status='ready'),
 *     errorMessage: string | null (present if status='failed')
 *   }
 * }
 * 
 * Requirements: 15.6
 */
const getExportJobStatus = catchAsync(async (req, res, next) => {
  // 1. Extract tenant context for merchant scoping
  const merchantId = getMerchantId(req);
  if (!merchantId) {
    throw new AppError('Merchant context required', 401);
  }

  // 2. Extract jobId from route params
  const { jobId } = req.params;

  if (!jobId) {
    throw new AppError('jobId is required', 400);
  }

  // 3. Get job status with merchant scoping
  const jobStatus = await ExportService.getJobStatus(jobId, merchantId);

  // 4. Audit logging for report access (Requirement 17.6)
  try {
    await auditLogger({
      user: req.user,
      action: 'REPORT_ACCESS',
      resource: 'Report',
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: 200,
      metadata: {
        reportType: jobStatus.reportType,
        dateFrom: jobStatus.dateFrom,
        dateTo: jobStatus.dateTo,
        branchId: jobStatus.branchId || null,
        format: jobStatus.format,
        jobId: jobStatus.jobId,
        jobStatus: jobStatus.status
      },
      req
    });
  } catch (auditError) {
    // Log audit failure but don't block status check
    console.error('Audit log failed for report access:', auditError.message);
  }

  // 5. Return job status object
  res.status(200).json({
    status: 'success',
    data: jobStatus
  });
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Helper functions
  validateDateRange,
  verifyBranchOwnership,
  convertToCSV,
  
  // Base handler pattern
  createReportHandler,
  
  // Specific report handlers
  getSalesReport,
  getOrdersReport,
  getProductsReport,
  getCustomersReport,
  getDeliveryReport,
  getProfitabilityReport,
  getStaffReport,
  getInventoryReport,
  
  // Export job handlers
  createExportJob,
  getExportJobStatus,
  
  // Wrapped catchAsync for reuse across handlers
  catchAsync
};
