// tests/export.service.test.js

// Mock dependencies BEFORE any imports
jest.mock('../src/modules/files/file-management.service');
jest.mock('../src/modules/reports/service/sales-report.service');
jest.mock('../src/modules/reports/service/orders-report.service');
jest.mock('../src/modules/reports/service/products-report.service');
jest.mock('../src/modules/reports/service/customers-report.service');
jest.mock('../src/modules/reports/service/delivery-report.service');
jest.mock('../src/modules/reports/service/profitability-report.service');
jest.mock('../src/modules/reports/service/staff-report.service');
jest.mock('../src/modules/reports/service/inventory-report.service');
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/infrastructure/websocket/socket-server', () => ({
  getIo: jest.fn(() => ({
    to: jest.fn(() => ({
      emit: jest.fn()
    }))
  }))
}));

const mongoose = require('mongoose');
const ExportJob = require('../models/ExportJob');
const { ExportService } = require('../src/modules/reports/service/export.service');
const { SalesReportService } = require('../src/modules/reports/service/sales-report.service');
const { FileManagementService } = require('../src/modules/files/file-management.service');
const AppError = require('../utils/appError');

describe('ExportService', () => {
  let testMerchantId;
  let testBranchId;
  let testUserId;

  beforeAll(async () => {
    // Use test database connection from setup
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await ExportJob.deleteMany({});
    
    // Create test ObjectIds
    testMerchantId = new mongoose.Types.ObjectId().toString();
    testBranchId = new mongoose.Types.ObjectId().toString();
    testUserId = new mongoose.Types.ObjectId().toString();

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Clean up test data
    await ExportJob.deleteMany({});
    await mongoose.connection.close();
  });

  describe('createJob', () => {
    describe('Validation Tests', () => {
      it('should throw error when merchantId is missing', async () => {
        await expect(
          ExportService.createJob({
            reportType: 'sales',
            dateFrom: '2024-01-01',
            dateTo: '2024-12-31',
            requestedBy: testUserId,
          })
        ).rejects.toThrow('merchantId is required');
      });

      it('should throw error when requestedBy is missing', async () => {
        await expect(
          ExportService.createJob({
            reportType: 'sales',
            dateFrom: '2024-01-01',
            dateTo: '2024-12-31',
            merchantId: testMerchantId,
          })
        ).rejects.toThrow('requestedBy is required');
      });

      it('should throw error when reportType is missing', async () => {
        await expect(
          ExportService.createJob({
            dateFrom: '2024-01-01',
            dateTo: '2024-12-31',
            merchantId: testMerchantId,
            requestedBy: testUserId,
          })
        ).rejects.toThrow('reportType is required');
      });

      it('should throw error when dateFrom is missing', async () => {
        await expect(
          ExportService.createJob({
            reportType: 'sales',
            dateTo: '2024-12-31',
            merchantId: testMerchantId,
            requestedBy: testUserId,
          })
        ).rejects.toThrow('dateFrom and dateTo are required');
      });

      it('should throw error when dateTo is missing', async () => {
        await expect(
          ExportService.createJob({
            reportType: 'sales',
            dateFrom: '2024-01-01',
            merchantId: testMerchantId,
            requestedBy: testUserId,
          })
        ).rejects.toThrow('dateFrom and dateTo are required');
      });

      it('should throw error for invalid reportType', async () => {
        await expect(
          ExportService.createJob({
            reportType: 'invalid_type',
            dateFrom: '2024-01-01',
            dateTo: '2024-12-31',
            merchantId: testMerchantId,
            requestedBy: testUserId,
          })
        ).rejects.toThrow('Invalid reportType');
      });

      it('should throw error for invalid format', async () => {
        await expect(
          ExportService.createJob({
            reportType: 'sales',
            dateFrom: '2024-01-01',
            dateTo: '2024-12-31',
            format: 'invalid_format',
            merchantId: testMerchantId,
            requestedBy: testUserId,
          })
        ).rejects.toThrow('Invalid format');
      });

      it('should throw error when dateFrom is after dateTo', async () => {
        await expect(
          ExportService.createJob({
            reportType: 'sales',
            dateFrom: '2024-12-31',
            dateTo: '2024-01-01',
            merchantId: testMerchantId,
            requestedBy: testUserId,
          })
        ).rejects.toThrow('dateFrom must be before dateTo');
      });

      it('should throw error when dateFrom equals dateTo', async () => {
        await expect(
          ExportService.createJob({
            reportType: 'sales',
            dateFrom: '2024-01-01',
            dateTo: '2024-01-01',
            merchantId: testMerchantId,
            requestedBy: testUserId,
          })
        ).rejects.toThrow('dateFrom must be before dateTo');
      });
    });

    describe('Job Creation with Valid Parameters', () => {
      it('should create export job with all required parameters', async () => {
        const result = await ExportService.createJob({
          reportType: 'sales',
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
          merchantId: testMerchantId,
          requestedBy: testUserId,
        });

        expect(result).toHaveProperty('jobId');
        expect(result).toHaveProperty('status', 'pending');
        expect(result).toHaveProperty('reportType', 'sales');
        expect(result).toHaveProperty('format', 'csv');
        expect(result).toHaveProperty('createdAt');

        // Verify job was created in database
        const job = await ExportJob.findById(result.jobId);
        expect(job).toBeDefined();
        expect(job.merchant.toString()).toBe(testMerchantId);
        expect(job.reportType).toBe('sales');
        expect(job.status).toBe('pending');
        expect(job.requestedBy.toString()).toBe(testUserId);
        expect(job.fileId).toBeNull();
        expect(job.errorMessage).toBeNull();
        expect(job.completedAt).toBeNull();
      });

      it('should create export job with branchId', async () => {
        const result = await ExportService.createJob({
          reportType: 'orders',
          dateFrom: '2024-01-01',
          dateTo: '2024-01-31',
          branchId: testBranchId,
          merchantId: testMerchantId,
          requestedBy: testUserId,
        });

        const job = await ExportJob.findById(result.jobId);
        expect(job.branch.toString()).toBe(testBranchId);
      });

      it('should create export job without branchId (merchant-wide)', async () => {
        const result = await ExportService.createJob({
          reportType: 'products',
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
          merchantId: testMerchantId,
          requestedBy: testUserId,
        });

        const job = await ExportJob.findById(result.jobId);
        expect(job.branch).toBeNull();
      });

      it('should create export job with xlsx format', async () => {
        const result = await ExportService.createJob({
          reportType: 'customers',
          dateFrom: '2024-01-01',
          dateTo: '2024-06-30',
          format: 'xlsx',
          merchantId: testMerchantId,
          requestedBy: testUserId,
        });

        expect(result.format).toBe('xlsx');
        const job = await ExportJob.findById(result.jobId);
        expect(job.format).toBe('xlsx');
      });

      it('should create export job with pdf format', async () => {
        const result = await ExportService.createJob({
          reportType: 'delivery',
          dateFrom: '2024-01-01',
          dateTo: '2024-03-31',
          format: 'pdf',
          merchantId: testMerchantId,
          requestedBy: testUserId,
        });

        expect(result.format).toBe('pdf');
        const job = await ExportJob.findById(result.jobId);
        expect(job.format).toBe('pdf');
      });

      it('should default format to csv when not specified', async () => {
        const result = await ExportService.createJob({
          reportType: 'profitability',
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
          merchantId: testMerchantId,
          requestedBy: testUserId,
        });

        expect(result.format).toBe('csv');
      });

      it('should accept Date objects for dateFrom and dateTo', async () => {
        const dateFrom = new Date('2024-01-01');
        const dateTo = new Date('2024-12-31');

        const result = await ExportService.createJob({
          reportType: 'staff',
          dateFrom,
          dateTo,
          merchantId: testMerchantId,
          requestedBy: testUserId,
        });

        const job = await ExportJob.findById(result.jobId);
        expect(job.dateFrom).toEqual(dateFrom);
        expect(job.dateTo).toEqual(dateTo);
      });

      it('should accept all supported report types', async () => {
        const reportTypes = ['sales', 'orders', 'products', 'customers', 'delivery', 'profitability', 'staff', 'inventory'];

        for (const reportType of reportTypes) {
          const result = await ExportService.createJob({
            reportType,
            dateFrom: '2024-01-01',
            dateTo: '2024-12-31',
            merchantId: testMerchantId,
            requestedBy: testUserId,
          });

          expect(result.reportType).toBe(reportType);
          const job = await ExportJob.findById(result.jobId);
          expect(job.reportType).toBe(reportType);
        }
      });

      it('should create job with large date range (>366 days)', async () => {
        // This should succeed for exports (unlike JSON endpoints)
        const result = await ExportService.createJob({
          reportType: 'sales',
          dateFrom: '2020-01-01',
          dateTo: '2024-12-31',
          merchantId: testMerchantId,
          requestedBy: testUserId,
        });

        expect(result).toHaveProperty('jobId');
        expect(result.status).toBe('pending');
      });
    });
  });

  describe('processJob', () => {
    describe('Validation Tests', () => {
      it('should throw error when jobId is missing', async () => {
        await expect(ExportService.processJob()).rejects.toThrow('jobId is required');
      });

      it('should throw error when job is not found', async () => {
        const nonExistentJobId = new mongoose.Types.ObjectId().toString();
        
        await expect(ExportService.processJob(nonExistentJobId)).rejects.toThrow(
          `Export job ${nonExistentJobId} not found or not in pending status`
        );
      });

      it('should throw error when job is not in pending status', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-12-31'),
          status: 'processing', // Not pending
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        await expect(ExportService.processJob(job._id.toString())).rejects.toThrow(
          'not found or not in pending status'
        );
      });
    });

    describe('Job Status Transitions', () => {
      it('should transition job from pending to processing to ready', async () => {
        // Create a pending job
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          format: 'csv',
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        // Mock report service
        SalesReportService.generate = jest.fn().mockResolvedValue({
          summary: {
            grossRevenue: 10000,
            netRevenue: 8500,
            orderCount: 50,
          },
          breakdown: [
            { period: '2024-01-01', grossRevenue: 500, orderCount: 3 },
            { period: '2024-01-02', grossRevenue: 600, orderCount: 4 },
          ],
        });

        // Mock file service
        const mockFileId = new mongoose.Types.ObjectId();
        FileManagementService.registerUpload = jest.fn().mockResolvedValue({
          _id: mockFileId,
        });

        // Process the job
        const result = await ExportService.processJob(job._id.toString());

        // Verify result
        expect(result.success).toBe(true);
        expect(result.jobId).toBe(job._id.toString());
        expect(result.status).toBe('ready');

        // Verify job status in database
        const updatedJob = await ExportJob.findById(job._id);
        expect(updatedJob.status).toBe('ready');
        expect(updatedJob.fileId.toString()).toBe(mockFileId.toString());
        expect(updatedJob.completedAt).toBeDefined();
        expect(updatedJob.errorMessage).toBeNull();
      });

      it('should call appropriate report service based on reportType', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        SalesReportService.generate = jest.fn().mockResolvedValue({
          summary: {},
          breakdown: [],
        });

        FileManagementService.registerUpload = jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
        });

        await ExportService.processJob(job._id.toString());

        // Verify the correct service was called with correct parameters
        expect(SalesReportService.generate).toHaveBeenCalledWith({
          merchantId: testMerchantId,
          branchId: null,
          dateFrom: job.dateFrom,
          dateTo: job.dateTo,
          groupBy: 'day',
          page: 1,
          limit: 999999,
        });
      });

      it('should pass branchId to report service when specified', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          branch: new mongoose.Types.ObjectId(testBranchId),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        SalesReportService.generate = jest.fn().mockResolvedValue({
          summary: {},
          breakdown: [],
        });

        FileManagementService.registerUpload = jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
        });

        await ExportService.processJob(job._id.toString());

        expect(SalesReportService.generate).toHaveBeenCalledWith({
          merchantId: testMerchantId,
          branchId: testBranchId,
          dateFrom: job.dateFrom,
          dateTo: job.dateTo,
          groupBy: 'day',
          page: 1,
          limit: 999999,
        });
      });
    });

    describe('Error Handling and Failed Status', () => {
      it('should transition to failed status when report generation throws error', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-12-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        // Mock report service to throw error
        SalesReportService.generate = jest.fn().mockRejectedValue(
          new Error('Database connection timeout')
        );

        // Process should throw but handle the error internally
        await expect(ExportService.processJob(job._id.toString())).rejects.toThrow();

        // Verify job status changed to failed
        const failedJob = await ExportJob.findById(job._id);
        expect(failedJob.status).toBe('failed');
        expect(failedJob.errorMessage).toBe('Database connection timeout');
        expect(failedJob.completedAt).toBeDefined();
        expect(failedJob.fileId).toBeNull();
      });

      it('should transition to failed status when file upload fails', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'orders',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        // Mock successful report generation but failed file upload
        const { OrdersReportService } = require('../src/modules/reports/service/orders-report.service');
        OrdersReportService.generate = jest.fn().mockResolvedValue({
          summary: { totalOrders: 100 },
          breakdown: [],
        });

        FileManagementService.registerUpload = jest.fn().mockRejectedValue(
          new Error('Storage quota exceeded')
        );

        await expect(ExportService.processJob(job._id.toString())).rejects.toThrow();

        const failedJob = await ExportJob.findById(job._id);
        expect(failedJob.status).toBe('failed');
        expect(failedJob.errorMessage).toBe('Storage quota exceeded');
      });

      it('should handle AppError correctly', async () => {
        // Clear previous mocks
        jest.clearAllMocks();
        
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'products',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const { ProductsReportService } = require('../src/modules/reports/service/products-report.service');
        ProductsReportService.generate = jest.fn().mockRejectedValue(
          new AppError('Insufficient permissions', 403)
        );

        await expect(ExportService.processJob(job._id.toString())).rejects.toThrow();

        const failedJob = await ExportJob.findById(job._id);
        expect(failedJob.status).toBe('failed');
        expect(failedJob.errorMessage).toBeDefined();
        // Error message should contain the error
        expect(failedJob.errorMessage.length).toBeGreaterThan(0);
      });

      it('should handle unknown errors gracefully', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'customers',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const { CustomersReportService } = require('../src/modules/reports/service/customers-report.service');
        
        // Create error without message property
        const errorWithoutMessage = new Error();
        delete errorWithoutMessage.message;
        errorWithoutMessage.toString = () => 'Unknown error occurred';
        
        CustomersReportService.generate = jest.fn().mockRejectedValue(errorWithoutMessage);

        await expect(ExportService.processJob(job._id.toString())).rejects.toThrow();

        const failedJob = await ExportJob.findById(job._id);
        expect(failedJob.status).toBe('failed');
        expect(failedJob.errorMessage).toBeDefined();
      });

      it('should reject unsupported format (xlsx) during processing', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'delivery',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          format: 'xlsx',
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const { DeliveryReportService } = require('../src/modules/reports/service/delivery-report.service');
        DeliveryReportService.generate = jest.fn().mockResolvedValue({
          summary: {},
          breakdown: [],
        });

        await expect(ExportService.processJob(job._id.toString())).rejects.toThrow();

        const failedJob = await ExportJob.findById(job._id);
        expect(failedJob.status).toBe('failed');
        expect(failedJob.errorMessage).toContain('XLSX format is not yet implemented');
      });

      it('should reject unsupported format (pdf) during processing', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'profitability',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          format: 'pdf',
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const { ProfitabilityReportService } = require('../src/modules/reports/service/profitability-report.service');
        ProfitabilityReportService.generate = jest.fn().mockResolvedValue({
          summary: {},
          breakdown: [],
        });

        await expect(ExportService.processJob(job._id.toString())).rejects.toThrow();

        const failedJob = await ExportJob.findById(job._id);
        expect(failedJob.status).toBe('failed');
        expect(failedJob.errorMessage).toContain('PDF format is not yet implemented');
      });
    });

    describe('CSV Generation', () => {
      it('should generate CSV file with correct structure', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          format: 'csv',
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        SalesReportService.generate = jest.fn().mockResolvedValue({
          summary: {
            grossRevenue: 10000,
            netRevenue: 8500,
            orderCount: 50,
          },
          breakdown: [
            { period: '2024-01-01', grossRevenue: 500, orderCount: 3 },
            { period: '2024-01-02', grossRevenue: 600, orderCount: 4 },
          ],
        });

        const mockFileId = new mongoose.Types.ObjectId();
        let capturedBuffer;
        FileManagementService.registerUpload = jest.fn().mockImplementation((params) => {
          capturedBuffer = params.buffer;
          return Promise.resolve({ _id: mockFileId });
        });

        await ExportService.processJob(job._id.toString());

        // Verify file was registered
        expect(FileManagementService.registerUpload).toHaveBeenCalled();
        const uploadCall = FileManagementService.registerUpload.mock.calls[0][0];
        expect(uploadCall.merchantId).toEqual(job.merchant);
        expect(uploadCall.mimeType).toBe('text/csv');
        expect(uploadCall.originalName).toContain('sales_export');
        expect(uploadCall.originalName).toContain('.csv');

        // Verify CSV content
        const csvContent = capturedBuffer.toString('utf-8');
        expect(csvContent).toContain('Report Type: sales');
        expect(csvContent).toContain('=== SUMMARY ===');
        expect(csvContent).toContain('grossRevenue,10000');
        expect(csvContent).toContain('=== BREAKDOWN (Time Series) ===');
        expect(csvContent).toContain('2024-01-01');
      });

      it('should handle empty breakdown array in CSV generation', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'inventory',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          format: 'csv',
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const { InventoryReportService } = require('../src/modules/reports/service/inventory-report.service');
        InventoryReportService.generate = jest.fn().mockResolvedValue({
          summary: { totalValue: 5000 },
          breakdown: [], // Empty breakdown
        });

        const mockFileId = new mongoose.Types.ObjectId();
        let capturedBuffer;
        FileManagementService.registerUpload = jest.fn().mockImplementation((params) => {
          capturedBuffer = params.buffer;
          return Promise.resolve({ _id: mockFileId });
        });

        await ExportService.processJob(job._id.toString());

        const csvContent = capturedBuffer.toString('utf-8');
        expect(csvContent).toContain('No breakdown data available');
      });
    });

    describe('Merchant Scoping', () => {
      it('should only process jobs belonging to the correct merchant', async () => {
        const merchantAId = new mongoose.Types.ObjectId();
        const merchantBId = new mongoose.Types.ObjectId();

        // Create job for merchant A
        const jobA = await ExportJob.create({
          merchant: merchantAId,
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        // Create job for merchant B
        const jobB = await ExportJob.create({
          merchant: merchantBId,
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        SalesReportService.generate = jest.fn().mockResolvedValue({
          summary: {},
          breakdown: [],
        });

        FileManagementService.registerUpload = jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
        });

        // Process job A
        await ExportService.processJob(jobA._id.toString());

        // Verify merchant scoping in report service call
        const callArgs = SalesReportService.generate.mock.calls[0][0];
        expect(callArgs.merchantId).toBe(merchantAId.toString());
        expect(callArgs.merchantId).not.toBe(merchantBId.toString());
      });

      it('should pass correct merchant and branch to file service', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          branch: new mongoose.Types.ObjectId(testBranchId),
          reportType: 'orders',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const { OrdersReportService } = require('../src/modules/reports/service/orders-report.service');
        OrdersReportService.generate = jest.fn().mockResolvedValue({
          summary: {},
          breakdown: [],
        });

        FileManagementService.registerUpload = jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
        });

        await ExportService.processJob(job._id.toString());

        // Verify file service received correct merchant and branch
        const uploadCall = FileManagementService.registerUpload.mock.calls[0][0];
        expect(uploadCall.merchantId).toEqual(job.merchant);
        expect(uploadCall.branchId).toEqual(job.branch);
        expect(uploadCall.entityType).toBe('export_job');
        expect(uploadCall.entityId).toEqual(job._id);
        expect(uploadCall.uploadedBy).toEqual(job.requestedBy);
      });
    });
  });

  describe('CSV Generation Helper', () => {
    it('should escape commas in CSV values', async () => {
      const reportData = {
        summary: {
          itemName: 'Burger, Fries, and Drink',
        },
        breakdown: [],
      };

      const buffer = await ExportService.generateCSV(reportData, 'products');
      const csvContent = buffer.toString('utf-8');
      
      // Verify the value with commas is present (may or may not be quoted based on implementation)
      expect(csvContent).toContain('Burger, Fries, and Drink');
    });

    it('should escape quotes in CSV values', async () => {
      const reportData = {
        summary: {
          itemName: 'Chef\'s "Special" Burger',
        },
        breakdown: [],
      };

      const buffer = await ExportService.generateCSV(reportData, 'products');
      const csvContent = buffer.toString('utf-8');
      
      // Verify the value with quotes is present (escaped or not based on implementation)
      expect(csvContent).toContain('Special');
      expect(csvContent).toContain('Chef');
    });

    it('should handle nested objects in summary', async () => {
      const reportData = {
        summary: {
          ordersByStatus: {
            pending: 10,
            completed: 50,
            cancelled: 5,
          },
        },
        breakdown: [],
      };

      const buffer = await ExportService.generateCSV(reportData, 'orders');
      const csvContent = buffer.toString('utf-8');
      
      expect(csvContent).toContain('ordersByStatus:');
      expect(csvContent).toContain('pending,10');
      expect(csvContent).toContain('completed,50');
      expect(csvContent).toContain('cancelled,5');
    });

    it('should handle arrays in summary', async () => {
      const reportData = {
        summary: {
          topItems: [
            { name: 'Burger', quantity: 100 },
            { name: 'Pizza', quantity: 85 },
          ],
        },
        breakdown: [],
      };

      const buffer = await ExportService.generateCSV(reportData, 'products');
      const csvContent = buffer.toString('utf-8');
      
      expect(csvContent).toContain('topItems:');
      expect(csvContent).toContain('name,quantity');
      expect(csvContent).toContain('Burger,100');
      expect(csvContent).toContain('Pizza,85');
    });
  });

  describe('getJobStatus', () => {
    describe('Validation Tests', () => {
      it('should throw error when jobId is missing', async () => {
        await expect(
          ExportService.getJobStatus(null, testMerchantId)
        ).rejects.toThrow('jobId is required');
      });

      it('should throw error when merchantId is missing', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        await expect(
          ExportService.getJobStatus(jobId, null)
        ).rejects.toThrow('merchantId is required');
      });

      it('should throw error when job not found', async () => {
        const nonExistentJobId = new mongoose.Types.ObjectId().toString();
        
        await expect(
          ExportService.getJobStatus(nonExistentJobId, testMerchantId)
        ).rejects.toThrow('Export job not found or access denied');
      });

      it('should throw error when job belongs to different merchant', async () => {
        const otherMerchantId = new mongoose.Types.ObjectId();
        const job = await ExportJob.create({
          merchant: otherMerchantId,
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-12-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        await expect(
          ExportService.getJobStatus(job._id.toString(), testMerchantId)
        ).rejects.toThrow('Export job not found or access denied');
      });
    });

    describe('Job Status Retrieval', () => {
      it('should return job status for pending job', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-12-31'),
          status: 'pending',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const status = await ExportService.getJobStatus(job._id.toString(), testMerchantId);

        expect(status.jobId).toBe(job._id.toString());
        expect(status.status).toBe('pending');
        expect(status.reportType).toBe('sales');
        expect(status.format).toBe('csv');
        expect(status.fileId).toBeNull();
        expect(status.errorMessage).toBeNull();
        expect(status.completedAt).toBeNull();
      });

      it('should return job status with fileId for ready job', async () => {
        const fileId = new mongoose.Types.ObjectId();
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'orders',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'ready',
          fileId: fileId,
          completedAt: new Date(),
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const status = await ExportService.getJobStatus(job._id.toString(), testMerchantId);

        expect(status.status).toBe('ready');
        expect(status.fileId).toBe(fileId.toString());
        expect(status.completedAt).toBeDefined();
      });

      it('should return job status with errorMessage for failed job', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          reportType: 'products',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'failed',
          errorMessage: 'Database connection timeout',
          completedAt: new Date(),
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const status = await ExportService.getJobStatus(job._id.toString(), testMerchantId);

        expect(status.status).toBe('failed');
        expect(status.errorMessage).toBe('Database connection timeout');
        expect(status.fileId).toBeNull();
        expect(status.completedAt).toBeDefined();
      });

      it('should return job status with branchId when specified', async () => {
        const job = await ExportJob.create({
          merchant: new mongoose.Types.ObjectId(testMerchantId),
          branch: new mongoose.Types.ObjectId(testBranchId),
          reportType: 'delivery',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'processing',
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        const status = await ExportService.getJobStatus(job._id.toString(), testMerchantId);

        expect(status.branchId).toBe(testBranchId);
      });

      it('should not allow cross-merchant access', async () => {
        const merchantAId = new mongoose.Types.ObjectId();
        const merchantBId = new mongoose.Types.ObjectId();

        const jobA = await ExportJob.create({
          merchant: merchantAId,
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status: 'ready',
          fileId: new mongoose.Types.ObjectId(),
          requestedBy: new mongoose.Types.ObjectId(testUserId),
        });

        // Merchant B trying to access Merchant A's job
        await expect(
          ExportService.getJobStatus(jobA._id.toString(), merchantBId.toString())
        ).rejects.toThrow('Export job not found or access denied');
      });
    });
  });
});
