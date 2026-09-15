const mongoose = require('mongoose');
const ExportJob = require('../../../../models/ExportJob');
const AppError = require('../../../../utils/appError');
const { FileManagementService } = require('../../files/file-management.service');
const { SalesReportService } = require('./sales-report.service');
const { OrdersReportService } = require('./orders-report.service');
const { ProductsReportService } = require('./products-report.service');
const { CustomersReportService } = require('./customers-report.service');
const { DeliveryReportService } = require('./delivery-report.service');
const { ProfitabilityReportService } = require('./profitability-report.service');
const { StaffReportService } = require('./staff-report.service');
const { InventoryReportService } = require('./inventory-report.service');
const logger = require('../../../../utils/logger');

// Lazy load Socket.IO to avoid circular dependency and allow mocking in tests
let getIo;
try {
  getIo = require('../../../infrastructure/websocket/socket-server').getIo;
} catch (error) {
  // Socket.IO not available (e.g., in tests), notifications will be skipped
  getIo = null;
}

/**
 * Export Service
 * Handles asynchronous export job orchestration for large report datasets
 */
class ExportService {
  /**
   * Supported report types for export jobs
   */
  static SUPPORTED_REPORT_TYPES = [
    'sales',
    'orders',
    'products',
    'customers',
    'delivery',
    'profitability',
    'staff',
    'inventory'
  ];

  /**
   * Map report types to their corresponding service classes
   */
  static REPORT_SERVICE_MAP = {
    sales: SalesReportService,
    orders: OrdersReportService,
    products: ProductsReportService,
    customers: CustomersReportService,
    delivery: DeliveryReportService,
    profitability: ProfitabilityReportService,
    staff: StaffReportService,
    inventory: InventoryReportService
  };

  /**
   * Create a new export job
   * @param {Object} params - Export job parameters
   * @param {string} params.reportType - Type of report (must be one of SUPPORTED_REPORT_TYPES)
   * @param {Date|string} params.dateFrom - Start date for the report
   * @param {Date|string} params.dateTo - End date for the report
   * @param {string} params.branchId - Optional branch ObjectId filter
   * @param {string} params.format - Export format: 'csv', 'xlsx', or 'pdf' (default: 'csv')
   * @param {string} params.requestedBy - User ObjectId who requested the export
   * @param {string} params.merchantId - Merchant ObjectId (required for tenant isolation)
   * @returns {Promise<Object>} Job object with HTTP 202 response envelope
   */
  static async createJob({ reportType, dateFrom, dateTo, branchId, format = 'csv', requestedBy, merchantId }) {
    // Validate required parameters
    if (!merchantId) {
      throw new AppError('merchantId is required', 400);
    }
    if (!requestedBy) {
      throw new AppError('requestedBy is required', 400);
    }
    if (!reportType) {
      throw new AppError('reportType is required', 400);
    }
    if (!dateFrom || !dateTo) {
      throw new AppError('dateFrom and dateTo are required', 400);
    }

    // Validate reportType is one of the supported types
    if (!this.SUPPORTED_REPORT_TYPES.includes(reportType)) {
      throw new AppError(
        `Invalid reportType. Must be one of: ${this.SUPPORTED_REPORT_TYPES.join(', ')}`,
        400
      );
    }

    // Validate format
    const validFormats = ['csv', 'xlsx', 'pdf'];
    if (!validFormats.includes(format)) {
      throw new AppError(
        `Invalid format. Must be one of: ${validFormats.join(', ')}`,
        400
      );
    }

    // Convert dates to Date objects if they are strings
    const dateFromObj = dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
    const dateToObj = dateTo instanceof Date ? dateTo : new Date(dateTo);

    // Validate date range logic
    if (dateFromObj >= dateToObj) {
      throw new AppError('dateFrom must be before dateTo', 400);
    }

    // Create ExportJob document with status 'pending'
    const exportJob = await ExportJob.create({
      merchant: new mongoose.Types.ObjectId(merchantId),
      branch: branchId ? new mongoose.Types.ObjectId(branchId) : null,
      reportType,
      dateFrom: dateFromObj,
      dateTo: dateToObj,
      format,
      status: 'pending',
      requestedBy: new mongoose.Types.ObjectId(requestedBy),
      fileId: null,
      errorMessage: null,
      completedAt: null
    });

    // Return job object with HTTP 202 response envelope structure
    return {
      jobId: exportJob._id.toString(),
      status: exportJob.status,
      reportType: exportJob.reportType,
      format: exportJob.format,
      createdAt: exportJob.createdAt
    };
  }

  /**
   * Process a single export job by jobId (background worker)
   * 
   * This method:
   * 1. Queries for ExportJob document by jobId with status 'pending'
   * 2. Updates status to 'processing'
   * 3. Calls appropriate report service's generate() method (no date range limit)
   * 4. Generates file in requested format (CSV/XLSX/PDF)
   * 5. Saves file via Files module, captures fileId
   * 6. Updates job with fileId, status 'ready', completedAt timestamp
   * 7. On error, sets status to 'failed' and captures error message
   * 
   * @param {string} jobId - The ExportJob ObjectId to process
   * @returns {Promise<Object>} Processing result with job status
   */
  static async processJob(jobId) {
    if (!jobId) {
      throw new AppError('jobId is required', 400);
    }

    try {
      // Query for the specific job with status 'pending'
      const jobData = await ExportJob.findOne({ 
        _id: new mongoose.Types.ObjectId(jobId),
        status: 'pending'
      }).lean();

      if (!jobData) {
        throw new AppError(`Export job ${jobId} not found or not in pending status`, 404);
      }

      logger.info('export.job.starting', {
        jobId: jobData._id.toString(),
        reportType: jobData.reportType,
        format: jobData.format,
        merchantId: jobData.merchant.toString()
      });

      // Process the single job
      await this.processSingleJob(jobData);

      logger.info('export.job.success', {
        jobId: jobData._id.toString()
      });

      return { 
        success: true, 
        jobId: jobData._id.toString(),
        status: 'ready'
      };
    } catch (error) {
      logger.error('export.job.error', {
        jobId: jobId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Process a single export job
   * @param {Object} jobData - Export job document data
   * @private
   */
  static async processSingleJob(jobData) {
    const jobId = jobData._id;

    try {
      // Update status to 'processing'
      await ExportJob.findByIdAndUpdate(jobId, { status: 'processing' });

      logger.info('export.job.started', {
        jobId: jobId.toString(),
        reportType: jobData.reportType,
        format: jobData.format,
        merchantId: jobData.merchant.toString()
      });

      // Get appropriate report service
      const ReportService = this.REPORT_SERVICE_MAP[jobData.reportType];
      if (!ReportService) {
        throw new AppError(`Unsupported report type: ${jobData.reportType}`, 400);
      }

      // Call report service's generate() method with job parameters
      // Note: No date range limit for exports (unlike JSON endpoints)
      const reportData = await ReportService.generate({
        merchantId: jobData.merchant.toString(),
        branchId: jobData.branch ? jobData.branch.toString() : null,
        dateFrom: jobData.dateFrom,
        dateTo: jobData.dateTo,
        groupBy: 'day', // Default groupBy for exports
        page: 1,
        limit: 999999 // Large limit to get all data for export
      });

      // Generate file in requested format
      let fileBuffer;
      let mimeType;
      let fileName;

      switch (jobData.format) {
        case 'csv':
          fileBuffer = await this.generateCSV(reportData, jobData.reportType);
          mimeType = 'text/csv';
          fileName = `${jobData.reportType}_export_${this.formatDate(jobData.dateFrom)}_to_${this.formatDate(jobData.dateTo)}.csv`;
          break;

        case 'xlsx':
          // Stub for XLSX format - requires 'xlsx' library
          throw new AppError('XLSX format is not yet implemented. Please use CSV format.', 501);

        case 'pdf':
          fileBuffer = await this.generatePDF(reportData, jobData.reportType, {
            merchantId: jobData.merchant.toString(),
            branchId: jobData.branch ? jobData.branch.toString() : null,
            dateFrom: jobData.dateFrom,
            dateTo: jobData.dateTo
          });
          mimeType = 'application/pdf';
          fileName = `${jobData.reportType}_export_${this.formatDate(jobData.dateFrom)}_to_${this.formatDate(jobData.dateTo)}.pdf`;
          break;

        default:
          throw new AppError(`Unsupported format: ${jobData.format}`, 400);
      }

      // Save file via Files module
      const file = await FileManagementService.registerUpload({
        merchantId: jobData.merchant,
        branchId: jobData.branch || null,
        buffer: fileBuffer,
        originalName: fileName,
        mimeType: mimeType,
        entityType: 'export_job',
        entityId: jobId,
        purpose: 'export',
        uploadedBy: jobData.requestedBy
      });

      // Update job with fileId, status 'ready', completedAt timestamp
      await ExportJob.findByIdAndUpdate(jobId, {
        fileId: file._id,
        status: 'ready',
        completedAt: new Date(),
        errorMessage: null
      });

      logger.info('export.job.completed', {
        jobId: jobId.toString(),
        fileId: file._id.toString(),
        reportType: jobData.reportType,
        format: jobData.format,
        fileSize: fileBuffer.length
      });

      // Emit Socket.IO event for real-time notification (Task 15.3)
      // Requirement 15.5: Socket.IO notification on export completion
      try {
        if (getIo) {
          const io = getIo();
          if (io) {
            const userId = jobData.requestedBy.toString();
            const roomName = `user:${userId}`;
            
            io.to(roomName).emit('report:export:ready', {
              jobId: jobId.toString(),
              fileId: file._id.toString(),
              reportType: jobData.reportType,
              format: jobData.format,
              completedAt: new Date().toISOString()
            });

            logger.info('export.job.notification.sent', {
              jobId: jobId.toString(),
              userId,
              roomName
            });
          }
        }
      } catch (socketError) {
        // Log socket error but don't fail the job
        logger.warn('export.job.notification.failed', {
          jobId: jobId.toString(),
          error: socketError.message
        });
      }

    } catch (error) {
      // On error, set status to 'failed' and capture error message
      await ExportJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        errorMessage: error.message || 'Unknown error occurred during export processing',
        completedAt: new Date()
      });

      logger.error('export.job.failed', {
        jobId: jobId.toString(),
        reportType: jobData.reportType,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Generate CSV file from report data
   * @param {Object} reportData - Report data with summary and breakdown
   * @param {string} reportType - Type of report
   * @returns {Promise<Buffer>} CSV file as buffer
   * @private
   */
  static async generateCSV(reportData, reportType) {
    const lines = [];

    // Add header with report metadata
    lines.push(`Report Type: ${reportType}`);
    lines.push(`Generated At: ${new Date().toISOString()}`);
    lines.push('');

    // Add summary section
    lines.push('=== SUMMARY ===');
    const summary = reportData.summary || {};
    
    // Convert summary object to CSV rows
    Object.entries(summary).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle nested objects (e.g., ordersByStatus, paymentMethodBreakdown)
        lines.push(`${key}:`);
        Object.entries(value).forEach(([subKey, subValue]) => {
          lines.push(`  ${subKey},${subValue}`);
        });
      } else if (Array.isArray(value)) {
        // Handle arrays (e.g., topItems, topCustomers)
        if (value.length > 0) {
          lines.push(`${key}:`);
          // Add headers for array items
          const headers = Object.keys(value[0]);
          lines.push(`  ${headers.join(',')}`);
          // Add data rows
          value.forEach(item => {
            const row = headers.map(h => {
              const val = item[h];
              // Escape commas and quotes in values
              if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                return `"${val.replace(/"/g, '""')}"`;
              }
              return val;
            });
            lines.push(`  ${row.join(',')}`);
          });
        }
      } else {
        lines.push(`${key},${value}`);
      }
    });

    lines.push('');

    // Add breakdown section
    lines.push('=== BREAKDOWN (Time Series) ===');
    const breakdown = reportData.breakdown || [];

    if (breakdown.length > 0) {
      // Extract headers from first breakdown item
      const headers = Object.keys(breakdown[0]);
      lines.push(headers.join(','));

      // Add data rows
      breakdown.forEach(item => {
        const row = headers.map(header => {
          const value = item[header];
          // Handle nested objects in breakdown
          if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value).replace(/,/g, ';');
          }
          // Escape commas and quotes in string values
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        });
        lines.push(row.join(','));
      });
    } else {
      lines.push('No breakdown data available');
    }

    // Convert to buffer
    const csvContent = lines.join('\n');
    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Get job status by jobId with merchant scoping
   * 
   * @param {string} jobId - The ExportJob ObjectId
   * @param {string} merchantId - Merchant ObjectId for access control
   * @returns {Promise<Object>} Job status object with jobId, status, fileId (if ready), errorMessage (if failed)
   */
  static async getJobStatus(jobId, merchantId) {
    if (!jobId) {
      throw new AppError('jobId is required', 400);
    }
    if (!merchantId) {
      throw new AppError('merchantId is required', 400);
    }

    // Query with merchant scoping to prevent cross-tenant access
    const job = await ExportJob.findOne({
      _id: new mongoose.Types.ObjectId(jobId),
      merchant: new mongoose.Types.ObjectId(merchantId)
    });

    if (!job) {
      throw new AppError('Export job not found or access denied', 403);
    }

    // Return job status object
    const response = {
      jobId: job._id.toString(),
      status: job.status,
      reportType: job.reportType,
      format: job.format,
      dateFrom: job.dateFrom,
      dateTo: job.dateTo,
      branchId: job.branch ? job.branch.toString() : null,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      fileId: null,
      errorMessage: null
    };

    // Include fileId if job is ready
    if (job.status === 'ready' && job.fileId) {
      response.fileId = job.fileId.toString();
    }

    // Include error message if job failed
    if (job.status === 'failed' && job.errorMessage) {
      response.errorMessage = job.errorMessage;
    }

    return response;
  }

  /**
   * Generate PDF file from report data using Puppeteer
   * @param {Object} reportData - Report data with summary and breakdown
   * @param {string} reportType - Type of report
   * @param {Object} metadata - Report metadata (merchantId, branchId, dateFrom, dateTo)
   * @returns {Promise<Buffer>} PDF file as buffer
   * @private
   */
  static async generatePDF(reportData, reportType, metadata) {
    const puppeteer = require('puppeteer');
    
    let browser;
    try {
      // Launch headless browser
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();

      // Generate HTML content for the report
      const htmlContent = this.generateReportHTML(reportData, reportType, metadata);

      // Set content and wait for rendering
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0'
      });

      // Generate PDF with custom options
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      await browser.close();

      return pdfBuffer;
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      logger.error('export.pdf.generation.failed', {
        reportType,
        error: error.message
      });
      throw new AppError(`PDF generation failed: ${error.message}`, 500);
    }
  }

  /**
   * Generate HTML content for PDF report
   * @param {Object} reportData - Report data with summary and breakdown
   * @param {string} reportType - Type of report
   * @param {Object} metadata - Report metadata
   * @returns {string} HTML content
   * @private
   */
  static generateReportHTML(reportData, reportType, metadata) {
    const { dateFrom, dateTo } = metadata;
    const summary = reportData.summary || {};
    const breakdown = reportData.breakdown || [];

    // Format dates
    const dateFromFormatted = this.formatDateFull(dateFrom);
    const dateToFormatted = this.formatDateFull(dateTo);

    // Generate summary HTML based on report type
    const summaryHTML = this.generateSummaryHTML(summary, reportType);

    // Generate breakdown table HTML
    const breakdownHTML = this.generateBreakdownHTML(breakdown, reportType);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.formatReportTitle(reportType)} Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      background: #ffffff;
    }
    .container {
      max-width: 100%;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #2c3e50;
    }
    .header h1 {
      font-size: 28px;
      color: #2c3e50;
      margin-bottom: 10px;
    }
    .header .subtitle {
      font-size: 14px;
      color: #7f8c8d;
      margin-bottom: 5px;
    }
    .meta-info {
      background: #ecf0f1;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 25px;
    }
    .meta-info p {
      margin: 5px 0;
      font-size: 13px;
    }
    .meta-info strong {
      color: #2c3e50;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 18px;
      color: #2c3e50;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #3498db;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .summary-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 5px;
      border-left: 4px solid #3498db;
    }
    .summary-card .label {
      font-size: 11px;
      color: #7f8c8d;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .summary-card .value {
      font-size: 20px;
      font-weight: bold;
      color: #2c3e50;
    }
    .summary-card .sub-value {
      font-size: 12px;
      color: #95a5a6;
      margin-top: 3px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      font-size: 11px;
    }
    thead {
      background: #34495e;
      color: white;
    }
    thead th {
      padding: 12px 8px;
      text-align: left;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
    }
    tbody tr {
      border-bottom: 1px solid #ecf0f1;
    }
    tbody tr:nth-child(even) {
      background: #f8f9fa;
    }
    tbody tr:hover {
      background: #e8f4f8;
    }
    tbody td {
      padding: 10px 8px;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .currency {
      font-weight: 600;
      color: #27ae60;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #ecf0f1;
      text-align: center;
      font-size: 10px;
      color: #95a5a6;
    }
    .nested-table {
      margin: 10px 0;
      font-size: 10px;
    }
    .nested-table td {
      padding: 5px 8px;
    }
    @media print {
      .page-break {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${this.formatReportTitle(reportType)} Report</h1>
      <div class="subtitle">Comprehensive ${reportType} analysis and insights</div>
    </div>

    <div class="meta-info">
      <p><strong>Report Period:</strong> ${dateFromFormatted} to ${dateToFormatted}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' })}</p>
      <p><strong>Report Type:</strong> ${this.formatReportTitle(reportType)}</p>
    </div>

    <div class="section">
      <h2 class="section-title">Summary</h2>
      ${summaryHTML}
    </div>

    ${breakdown.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Detailed Breakdown</h2>
      ${breakdownHTML}
    </div>
    ` : '<p style="color: #95a5a6; font-style: italic;">No detailed breakdown data available for this report.</p>'}

    <div class="footer">
      <p>This report was automatically generated by the Restaurant Management System</p>
      <p>Report ID: ${metadata.merchantId} | Generated at ${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generate summary HTML based on report type
   * @param {Object} summary - Summary data
   * @param {string} reportType - Type of report
   * @returns {string} HTML content
   * @private
   */
  static generateSummaryHTML(summary, reportType) {
    const cards = [];

    // Common metrics across most reports
    if (summary.totalRevenue !== undefined) {
      cards.push(`
        <div class="summary-card">
          <div class="label">Total Revenue</div>
          <div class="value currency">${this.formatCurrency(summary.totalRevenue)}</div>
        </div>
      `);
    }

    if (summary.totalOrders !== undefined) {
      cards.push(`
        <div class="summary-card">
          <div class="label">Total Orders</div>
          <div class="value">${summary.totalOrders.toLocaleString()}</div>
        </div>
      `);
    }

    if (summary.averageOrderValue !== undefined) {
      cards.push(`
        <div class="summary-card">
          <div class="label">Average Order Value</div>
          <div class="value currency">${this.formatCurrency(summary.averageOrderValue)}</div>
        </div>
      `);
    }

    if (summary.totalProfit !== undefined) {
      cards.push(`
        <div class="summary-card">
          <div class="label">Total Profit</div>
          <div class="value currency">${this.formatCurrency(summary.totalProfit)}</div>
          ${summary.profitMargin ? `<div class="sub-value">Margin: ${summary.profitMargin.toFixed(2)}%</div>` : ''}
        </div>
      `);
    }

    if (summary.totalCost !== undefined) {
      cards.push(`
        <div class="summary-card">
          <div class="label">Total Cost</div>
          <div class="value currency">${this.formatCurrency(summary.totalCost)}</div>
        </div>
      `);
    }

    if (summary.totalCustomers !== undefined) {
      cards.push(`
        <div class="summary-card">
          <div class="label">Total Customers</div>
          <div class="value">${summary.totalCustomers.toLocaleString()}</div>
        </div>
      `);
    }

    if (summary.totalDeliveries !== undefined) {
      cards.push(`
        <div class="summary-card">
          <div class="label">Total Deliveries</div>
          <div class="value">${summary.totalDeliveries.toLocaleString()}</div>
        </div>
      `);
    }

    if (summary.totalStaffHours !== undefined) {
      cards.push(`
        <div class="summary-card">
          <div class="label">Total Staff Hours</div>
          <div class="value">${summary.totalStaffHours.toLocaleString()} hrs</div>
        </div>
      `);
    }

    // Handle nested objects
    if (summary.ordersByStatus) {
      const statusHTML = Object.entries(summary.ordersByStatus)
        .map(([status, count]) => `<tr><td>${status}</td><td class="text-right"><strong>${count}</strong></td></tr>`)
        .join('');
      
      cards.push(`
        <div class="summary-card" style="grid-column: span 2;">
          <div class="label">Orders by Status</div>
          <table class="nested-table">
            <tbody>
              ${statusHTML}
            </tbody>
          </table>
        </div>
      `);
    }

    if (summary.paymentMethodBreakdown) {
      const paymentHTML = Object.entries(summary.paymentMethodBreakdown)
        .map(([method, amount]) => `<tr><td>${method}</td><td class="text-right currency">${this.formatCurrency(amount)}</td></tr>`)
        .join('');
      
      cards.push(`
        <div class="summary-card" style="grid-column: span 2;">
          <div class="label">Payment Methods</div>
          <table class="nested-table">
            <tbody>
              ${paymentHTML}
            </tbody>
          </table>
        </div>
      `);
    }

    // Handle top items arrays
    if (summary.topItems && Array.isArray(summary.topItems)) {
      const topItemsHTML = summary.topItems.slice(0, 5)
        .map(item => `<tr><td>${item.name || item.itemName}</td><td class="text-right">${item.quantity || item.count}</td><td class="text-right currency">${this.formatCurrency(item.revenue || item.amount || 0)}</td></tr>`)
        .join('');
      
      cards.push(`
        <div class="summary-card" style="grid-column: span 2;">
          <div class="label">Top 5 Items</div>
          <table class="nested-table">
            <thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Revenue</th></tr></thead>
            <tbody>
              ${topItemsHTML}
            </tbody>
          </table>
        </div>
      `);
    }

    if (summary.topCustomers && Array.isArray(summary.topCustomers)) {
      const topCustomersHTML = summary.topCustomers.slice(0, 5)
        .map(customer => `<tr><td>${customer.name || customer.customerName}</td><td class="text-right">${customer.orders || customer.orderCount}</td><td class="text-right currency">${this.formatCurrency(customer.totalSpent || customer.amount || 0)}</td></tr>`)
        .join('');
      
      cards.push(`
        <div class="summary-card" style="grid-column: span 2;">
          <div class="label">Top 5 Customers</div>
          <table class="nested-table">
            <thead><tr><th>Customer</th><th class="text-right">Orders</th><th class="text-right">Total Spent</th></tr></thead>
            <tbody>
              ${topCustomersHTML}
            </tbody>
          </table>
        </div>
      `);
    }

    return `<div class="summary-grid">${cards.join('')}</div>`;
  }

  /**
   * Generate breakdown table HTML
   * @param {Array} breakdown - Breakdown data array
   * @param {string} reportType - Type of report
   * @returns {string} HTML content
   * @private
   */
  static generateBreakdownHTML(breakdown, reportType) {
    if (!breakdown || breakdown.length === 0) {
      return '<p style="color: #95a5a6; font-style: italic;">No breakdown data available.</p>';
    }

    // Extract headers from first item
    const firstItem = breakdown[0];
    const headers = Object.keys(firstItem);

    // Generate table headers
    const theadHTML = headers.map(header => {
      const displayName = this.formatHeaderName(header);
      const align = this.isNumericField(header) ? 'text-right' : '';
      return `<th class="${align}">${displayName}</th>`;
    }).join('');

    // Generate table rows
    const tbodyHTML = breakdown.map(item => {
      const cells = headers.map(header => {
        const value = item[header];
        const align = this.isNumericField(header) ? 'text-right' : '';
        const formatted = this.formatCellValue(value, header);
        return `<td class="${align}">${formatted}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `
      <table>
        <thead>
          <tr>${theadHTML}</tr>
        </thead>
        <tbody>
          ${tbodyHTML}
        </tbody>
      </table>
    `;
  }

  /**
   * Format header name for display
   * @param {string} header - Header field name
   * @returns {string} Formatted header
   * @private
   */
  static formatHeaderName(header) {
    return header
      .replace(/([A-Z])/g, ' $1') // Add space before capitals
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  }

  /**
   * Check if field is numeric
   * @param {string} fieldName - Field name
   * @returns {boolean} True if numeric field
   * @private
   */
  static isNumericField(fieldName) {
    const numericFields = ['revenue', 'amount', 'total', 'cost', 'profit', 'price', 'value', 'count', 'quantity', 'orders', 'customers', 'hours'];
    return numericFields.some(keyword => fieldName.toLowerCase().includes(keyword));
  }

  /**
   * Format cell value for display
   * @param {*} value - Cell value
   * @param {string} fieldName - Field name
   * @returns {string} Formatted value
   * @private
   */
  static formatCellValue(value, fieldName) {
    if (value === null || value === undefined) {
      return '-';
    }

    // Handle dates
    if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
      return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Handle currency fields
    if (fieldName.toLowerCase().includes('revenue') || fieldName.toLowerCase().includes('amount') || 
        fieldName.toLowerCase().includes('total') || fieldName.toLowerCase().includes('cost') || 
        fieldName.toLowerCase().includes('profit') || fieldName.toLowerCase().includes('price')) {
      return `<span class="currency">${this.formatCurrency(value)}</span>`;
    }

    // Handle numbers
    if (typeof value === 'number') {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }

    // Handle objects
    if (typeof value === 'object' && !Array.isArray(value)) {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Format currency value
   * @param {number} value - Currency value
   * @returns {string} Formatted currency
   * @private
   */
  static formatCurrency(value) {
    if (typeof value !== 'number') {
      value = parseFloat(value) || 0;
    }
    return `ETB ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Format date to full display format
   * @param {Date|string} date - Date to format
   * @returns {string} Formatted date
   * @private
   */
  static formatDateFull(date) {
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  /**
   * Format report title
   * @param {string} reportType - Report type
   * @returns {string} Formatted title
   * @private
   */
  static formatReportTitle(reportType) {
    return reportType.charAt(0).toUpperCase() + reportType.slice(1);
  }

  /**
   * Format date to YYYY-MM-DD
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   * @private
   */
  static formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

module.exports = { ExportService };
