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
          // Stub for PDF format - requires 'pdfkit' library
          throw new AppError('PDF format is not yet implemented. Please use CSV format.', 501);

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
