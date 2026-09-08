const mongoose = require('mongoose');
const { ExportService } = require('../src/modules/reports/service/export.service');
const ExportJob = require('../models/ExportJob');
const { FileManagementService } = require('../src/modules/files/file-management.service');
const { SalesReportService } = require('../src/modules/reports/service/sales-report.service');
const { OrdersReportService } = require('../src/modules/reports/service/orders-report.service');
const AppError = require('../utils/appError');

// Mock logger first before any other imports
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('ExportService.processJob()', () => {
  let mockJobData;
  let mockMerchantId;
  let mockUserId;
  let mockJobId;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMerchantId = new mongoose.Types.ObjectId();
    mockUserId = new mongoose.Types.ObjectId();
    mockJobId = new mongoose.Types.ObjectId();

    mockJobData = {
      _id: mockJobId,
      merchant: mockMerchantId,
      branch: null,
      reportType: 'sales',
      dateFrom: new Date('2024-01-01'),
      dateTo: new Date('2024-12-31'),
      format: 'csv',
      status: 'pending',
      requestedBy: mockUserId,
      fileId: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date()
    };

    // Mock ExportJob methods
    ExportJob.findOne = jest.fn();
    ExportJob.findByIdAndUpdate = jest.fn();

    // Mock FileManagementService
    FileManagementService.registerUpload = jest.fn();

    // Mock report services
    SalesReportService.generate = jest.fn();
    OrdersReportService.generate = jest.fn();
  });

  describe('Input Validation', () => {
    it('should throw error when jobId is not provided', async () => {
      await expect(ExportService.processJob()).rejects.toThrow(AppError);
      await expect(ExportService.processJob()).rejects.toThrow('jobId is required');
    });

    it('should throw error when job is not found', async () => {
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });

      await expect(ExportService.processJob(mockJobId.toString())).rejects.toThrow(AppError);
      await expect(ExportService.processJob(mockJobId.toString())).rejects.toThrow('not found or not in pending status');
    });

    it('should throw error when job status is not pending', async () => {
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });

      await expect(ExportService.processJob(mockJobId.toString())).rejects.toThrow(AppError);
    });
  });

  describe('Successful Job Processing', () => {
    beforeEach(() => {
      // Mock ExportJob.findOne for getting the job
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });

      // Mock ExportJob.findByIdAndUpdate for status updates
      ExportJob.findByIdAndUpdate.mockResolvedValue(mockJobData);

      // Mock SalesReportService.generate
      SalesReportService.generate.mockResolvedValue({
        summary: {
          grossRevenue: 10000,
          totalDiscounts: 500,
          totalTaxes: 800,
          netRevenue: 8700,
          orderCount: 50,
          averageOrderValue: 200
        },
        breakdown: [
          { period: '2024-01-01', grossRevenue: 200, orderCount: 1 },
          { period: '2024-01-02', grossRevenue: 300, orderCount: 2 }
        ],
        page: 1,
        pages: 1,
        total: 2
      });

      // Mock FileManagementService.registerUpload
      FileManagementService.registerUpload.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        storageKey: 'some-key',
        originalName: 'export.csv'
      });
    });

    it('should update job status to processing at start', async () => {
      await ExportService.processJob(mockJobId.toString());

      expect(ExportJob.findByIdAndUpdate).toHaveBeenCalledWith(
        mockJobId,
        { status: 'processing' }
      );
    });

    it('should call appropriate report service with correct parameters', async () => {
      await ExportService.processJob(mockJobId.toString());

      expect(SalesReportService.generate).toHaveBeenCalledWith({
        merchantId: mockMerchantId.toString(),
        branchId: null,
        dateFrom: mockJobData.dateFrom,
        dateTo: mockJobData.dateTo,
        groupBy: 'day',
        page: 1,
        limit: 999999
      });
    });

    it('should generate CSV file with correct format', async () => {
      await ExportService.processJob(mockJobId.toString());

      expect(FileManagementService.registerUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: mockMerchantId,
          branchId: null,
          buffer: expect.any(Buffer),
          originalName: expect.stringContaining('sales_export'),
          mimeType: 'text/csv',
          entityType: 'export_job',
          entityId: mockJobId,
          purpose: 'export',
          uploadedBy: mockUserId
        })
      );
    });

    it('should update job status to ready with fileId and completedAt', async () => {
      const mockFileId = new mongoose.Types.ObjectId();
      FileManagementService.registerUpload.mockResolvedValue({
        _id: mockFileId
      });

      await ExportService.processJob(mockJobId.toString());

      // Find the call that updates to 'ready' status
      const readyUpdateCall = ExportJob.findByIdAndUpdate.mock.calls.find(
        call => call[1].status === 'ready'
      );

      expect(readyUpdateCall).toBeDefined();
      expect(readyUpdateCall[0]).toEqual(mockJobId);
      expect(readyUpdateCall[1]).toMatchObject({
        fileId: mockFileId,
        status: 'ready',
        completedAt: expect.any(Date),
        errorMessage: null
      });
    });

    it('should return success result with jobId and status', async () => {
      const result = await ExportService.processJob(mockJobId.toString());

      expect(result).toEqual({
        success: true,
        jobId: mockJobId.toString(),
        status: 'ready'
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });
      ExportJob.findByIdAndUpdate.mockResolvedValue(mockJobData);
    });

    it('should update job status to failed on report generation error', async () => {
      const errorMessage = 'Report generation failed';
      SalesReportService.generate.mockRejectedValue(new Error(errorMessage));

      await expect(ExportService.processJob(mockJobId.toString())).rejects.toThrow(errorMessage);

      // Find the call that updates to 'failed' status
      const failedUpdateCall = ExportJob.findByIdAndUpdate.mock.calls.find(
        call => call[1].status === 'failed'
      );

      expect(failedUpdateCall).toBeDefined();
      expect(failedUpdateCall[1]).toMatchObject({
        status: 'failed',
        errorMessage: errorMessage,
        completedAt: expect.any(Date)
      });
    });

    it('should update job status to failed on file save error', async () => {
      SalesReportService.generate.mockResolvedValue({
        summary: { grossRevenue: 1000 },
        breakdown: []
      });

      const errorMessage = 'File save failed';
      FileManagementService.registerUpload.mockRejectedValue(new Error(errorMessage));

      await expect(ExportService.processJob(mockJobId.toString())).rejects.toThrow(errorMessage);

      const failedUpdateCall = ExportJob.findByIdAndUpdate.mock.calls.find(
        call => call[1].status === 'failed'
      );

      expect(failedUpdateCall).toBeDefined();
      expect(failedUpdateCall[1]).toMatchObject({
        status: 'failed',
        errorMessage: errorMessage
      });
    });

    it('should throw error for unsupported XLSX format', async () => {
      mockJobData.format = 'xlsx';
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });

      SalesReportService.generate.mockResolvedValue({
        summary: {},
        breakdown: []
      });

      await expect(ExportService.processJob(mockJobId.toString())).rejects.toThrow('XLSX format is not yet implemented');
    });

    it('should throw error for unsupported PDF format', async () => {
      mockJobData.format = 'pdf';
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });

      SalesReportService.generate.mockResolvedValue({
        summary: {},
        breakdown: []
      });

      await expect(ExportService.processJob(mockJobId.toString())).rejects.toThrow('PDF format is not yet implemented');
    });
  });

  describe('Report Type Mapping', () => {
    beforeEach(() => {
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });
      ExportJob.findByIdAndUpdate.mockResolvedValue(mockJobData);
      FileManagementService.registerUpload.mockResolvedValue({
        _id: new mongoose.Types.ObjectId()
      });
    });

    it('should process orders report type', async () => {
      OrdersReportService.generate.mockResolvedValue({
        summary: { orderCount: 100 },
        breakdown: []
      });

      mockJobData.reportType = 'orders';
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });

      await ExportService.processJob(mockJobId.toString());

      expect(OrdersReportService.generate).toHaveBeenCalled();
    });

    it('should throw error for invalid report type', async () => {
      mockJobData.reportType = 'invalid_type';
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });

      await expect(ExportService.processJob(mockJobId.toString())).rejects.toThrow('Unsupported report type');
    });
  });

  describe('Branch Scoping', () => {
    beforeEach(() => {
      ExportJob.findByIdAndUpdate.mockResolvedValue(mockJobData);
      SalesReportService.generate.mockResolvedValue({
        summary: {},
        breakdown: []
      });
      FileManagementService.registerUpload.mockResolvedValue({
        _id: new mongoose.Types.ObjectId()
      });
    });

    it('should pass branchId to report service when branch is specified', async () => {
      const mockBranchId = new mongoose.Types.ObjectId();
      mockJobData.branch = mockBranchId;
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });

      await ExportService.processJob(mockJobId.toString());

      expect(SalesReportService.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: mockBranchId.toString()
        })
      );
    });

    it('should pass null branchId when branch is not specified', async () => {
      mockJobData.branch = null;
      ExportJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockJobData)
      });

      await ExportService.processJob(mockJobId.toString());

      expect(SalesReportService.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: null
        })
      );
    });
  });
});
