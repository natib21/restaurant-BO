// tests/exportjob.model.test.js
const mongoose = require('mongoose');
const ExportJob = require('../models/ExportJob');

describe('ExportJob Model', () => {
  beforeAll(async () => {
    // Use test database connection from setup
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  afterAll(async () => {
    // Clean up test data
    await ExportJob.deleteMany({});
  });

  afterEach(async () => {
    // Clean up after each test
    await ExportJob.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid ExportJob with all required fields', async () => {
      const exportJobData = {
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'sales',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-12-31'),
        format: 'csv',
        status: 'pending',
        requestedBy: new mongoose.Types.ObjectId(),
      };

      const exportJob = new ExportJob(exportJobData);
      const savedJob = await exportJob.save();

      expect(savedJob._id).toBeDefined();
      expect(savedJob.merchant.toString()).toBe(exportJobData.merchant.toString());
      expect(savedJob.reportType).toBe('sales');
      expect(savedJob.format).toBe('csv');
      expect(savedJob.status).toBe('pending');
      expect(savedJob.fileId).toBeNull();
      expect(savedJob.errorMessage).toBeNull();
      expect(savedJob.completedAt).toBeNull();
      expect(savedJob.createdAt).toBeDefined();
      expect(savedJob.updatedAt).toBeDefined();
    });

    it('should create ExportJob with optional branch field', async () => {
      const branchId = new mongoose.Types.ObjectId();
      const exportJobData = {
        merchant: new mongoose.Types.ObjectId(),
        branch: branchId,
        reportType: 'orders',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        format: 'xlsx',
        requestedBy: new mongoose.Types.ObjectId(),
      };

      const exportJob = new ExportJob(exportJobData);
      const savedJob = await exportJob.save();

      expect(savedJob.branch.toString()).toBe(branchId.toString());
    });

    it('should fail validation when required fields are missing', async () => {
      const invalidJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        // Missing reportType, dateFrom, dateTo, requestedBy
      });

      await expect(invalidJob.save()).rejects.toThrow();
    });

    it('should enforce reportType enum values', async () => {
      const invalidJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'invalid_type',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        requestedBy: new mongoose.Types.ObjectId(),
      });

      await expect(invalidJob.save()).rejects.toThrow();
    });

    it('should enforce format enum values', async () => {
      const invalidJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'sales',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        format: 'invalid_format',
        requestedBy: new mongoose.Types.ObjectId(),
      });

      await expect(invalidJob.save()).rejects.toThrow();
    });

    it('should enforce status enum values', async () => {
      const invalidJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'sales',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        status: 'invalid_status',
        requestedBy: new mongoose.Types.ObjectId(),
      });

      await expect(invalidJob.save()).rejects.toThrow();
    });

    it('should default format to csv', async () => {
      const exportJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'products',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        requestedBy: new mongoose.Types.ObjectId(),
      });

      const savedJob = await exportJob.save();
      expect(savedJob.format).toBe('csv');
    });

    it('should default status to pending', async () => {
      const exportJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'customers',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        requestedBy: new mongoose.Types.ObjectId(),
      });

      const savedJob = await exportJob.save();
      expect(savedJob.status).toBe('pending');
    });
  });

  describe('Report Type Values', () => {
    const reportTypes = ['sales', 'orders', 'products', 'customers', 'delivery', 'profitability', 'staff', 'inventory'];

    reportTypes.forEach((reportType) => {
      it(`should accept reportType: ${reportType}`, async () => {
        const exportJob = new ExportJob({
          merchant: new mongoose.Types.ObjectId(),
          reportType,
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          requestedBy: new mongoose.Types.ObjectId(),
        });

        const savedJob = await exportJob.save();
        expect(savedJob.reportType).toBe(reportType);
      });
    });
  });

  describe('Format Values', () => {
    const formats = ['csv', 'xlsx', 'pdf'];

    formats.forEach((format) => {
      it(`should accept format: ${format}`, async () => {
        const exportJob = new ExportJob({
          merchant: new mongoose.Types.ObjectId(),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          format,
          requestedBy: new mongoose.Types.ObjectId(),
        });

        const savedJob = await exportJob.save();
        expect(savedJob.format).toBe(format);
      });
    });
  });

  describe('Status Values', () => {
    const statuses = ['pending', 'processing', 'ready', 'failed'];

    statuses.forEach((status) => {
      it(`should accept status: ${status}`, async () => {
        const exportJob = new ExportJob({
          merchant: new mongoose.Types.ObjectId(),
          reportType: 'sales',
          dateFrom: new Date('2024-01-01'),
          dateTo: new Date('2024-01-31'),
          status,
          requestedBy: new mongoose.Types.ObjectId(),
        });

        const savedJob = await exportJob.save();
        expect(savedJob.status).toBe(status);
      });
    });
  });

  describe('Job Lifecycle', () => {
    it('should update status from pending to processing', async () => {
      const exportJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'delivery',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-12-31'),
        requestedBy: new mongoose.Types.ObjectId(),
      });

      const savedJob = await exportJob.save();
      expect(savedJob.status).toBe('pending');

      savedJob.status = 'processing';
      const updatedJob = await savedJob.save();
      expect(updatedJob.status).toBe('processing');
    });

    it('should update status to ready with fileId and completedAt', async () => {
      const exportJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'profitability',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-12-31'),
        status: 'processing',
        requestedBy: new mongoose.Types.ObjectId(),
      });

      const savedJob = await exportJob.save();

      const fileId = new mongoose.Types.ObjectId();
      savedJob.status = 'ready';
      savedJob.fileId = fileId;
      savedJob.completedAt = new Date();

      const completedJob = await savedJob.save();
      expect(completedJob.status).toBe('ready');
      expect(completedJob.fileId.toString()).toBe(fileId.toString());
      expect(completedJob.completedAt).toBeDefined();
    });

    it('should update status to failed with errorMessage', async () => {
      const exportJob = new ExportJob({
        merchant: new mongoose.Types.ObjectId(),
        reportType: 'staff',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-12-31'),
        status: 'processing',
        requestedBy: new mongoose.Types.ObjectId(),
      });

      const savedJob = await exportJob.save();

      savedJob.status = 'failed';
      savedJob.errorMessage = 'Out of memory during large dataset processing';

      const failedJob = await savedJob.save();
      expect(failedJob.status).toBe('failed');
      expect(failedJob.errorMessage).toBe('Out of memory during large dataset processing');
    });
  });

  describe('Indexes', () => {
    it('should have compound index on merchant, status, createdAt', async () => {
      const indexes = ExportJob.schema.indexes();
      const compoundIndex = indexes.find(
        (idx) =>
          idx[0].merchant === 1 &&
          idx[0].status === 1 &&
          idx[0].createdAt === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on requestedBy, createdAt', async () => {
      const indexes = ExportJob.schema.indexes();
      const requestedByIndex = indexes.find(
        (idx) =>
          idx[0].requestedBy === 1 &&
          idx[0].createdAt === -1
      );
      expect(requestedByIndex).toBeDefined();
    });

    it('should have TTL index on createdAt with 7 days expiration', async () => {
      const indexes = ExportJob.schema.indexes();
      const ttlIndex = indexes.find(
        (idx) => idx[0].createdAt === 1 && idx[1].expireAfterSeconds === 604800
      );
      expect(ttlIndex).toBeDefined();
    });
  });
});
