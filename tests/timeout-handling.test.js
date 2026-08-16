/**
 * Test suite for aggregation timeout handling
 * Tests timeout behavior across all report services
 * 
 * Requirements: 18.3, 18.6
 */

const mongoose = require('mongoose');
const { SalesReportService } = require('../src/modules/reports/service/sales-report.service');
const { OrdersReportService } = require('../src/modules/reports/service/orders-report.service');
const { ProductsReportService } = require('../src/modules/reports/service/products-report.service');
const { CustomersReportService } = require('../src/modules/reports/service/customers-report.service');
const { DeliveryReportService } = require('../src/modules/reports/service/delivery-report.service');
const { ProfitabilityReportService } = require('../src/modules/reports/service/profitability-report.service');
const { StaffReportService } = require('../src/modules/reports/service/staff-report.service');
const { InventoryReportService } = require('../src/modules/reports/service/inventory-report.service');
const Order = require('../models/orderModel');
const Ingredient = require('../models/Ingredient');
const AppError = require('../utils/appError');

describe('Report Service Timeout Handling', () => {
  const mockMerchantId = new mongoose.Types.ObjectId().toString();
  const testParams = {
    merchantId: mockMerchantId,
    dateFrom: new Date('2024-01-01'),
    dateTo: new Date('2024-12-31'),
    groupBy: 'day',
    page: 1,
    limit: 50
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SalesReportService timeout handling', () => {
    it('should timeout after 10 seconds and throw 503 error', async () => {
      // Mock Order.aggregate to hang indefinitely
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(SalesReportService.generate(testParams))
        .rejects
        .toThrow(expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('timed out'),
          retryAfter: 60
        }));
    }, 12000); // Test timeout slightly longer than aggregation timeout
  });

  describe('OrdersReportService timeout handling', () => {
    it('should timeout after 10 seconds and throw 503 error', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(OrdersReportService.generate(testParams))
        .rejects
        .toThrow(expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('timed out'),
          retryAfter: 60
        }));
    }, 12000);
  });

  describe('ProductsReportService timeout handling', () => {
    it('should timeout after 10 seconds and throw 503 error', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(ProductsReportService.generate(testParams))
        .rejects
        .toThrow(expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('timed out'),
          retryAfter: 60
        }));
    }, 12000);
  });

  describe('CustomersReportService timeout handling', () => {
    it('should timeout after 10 seconds and throw 503 error', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(CustomersReportService.generate(testParams))
        .rejects
        .toThrow(expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('timed out'),
          retryAfter: 60
        }));
    }, 12000);
  });

  describe('DeliveryReportService timeout handling', () => {
    it('should timeout after 10 seconds and throw 503 error', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(DeliveryReportService.generate(testParams))
        .rejects
        .toThrow(expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('timed out'),
          retryAfter: 60
        }));
    }, 12000);
  });

  describe('ProfitabilityReportService timeout handling', () => {
    it('should timeout after 10 seconds and throw 503 error', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(ProfitabilityReportService.generate(testParams))
        .rejects
        .toThrow(expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('timed out'),
          retryAfter: 60
        }));
    }, 12000);
  });

  describe('StaffReportService timeout handling', () => {
    it('should timeout after 10 seconds and throw 503 error', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(StaffReportService.generate(testParams))
        .rejects
        .toThrow(expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('timed out'),
          retryAfter: 60
        }));
    }, 12000);
  });

  describe('InventoryReportService timeout handling', () => {
    it('should timeout after 10 seconds and throw 503 error', async () => {
      // Mock Ingredient.aggregate to hang
      jest.spyOn(Ingredient, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      await expect(InventoryReportService.generate(testParams))
        .rejects
        .toThrow(expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('timed out'),
          retryAfter: 60
        }));
    }, 12000);
  });

  describe('Error message validation', () => {
    it('should include helpful suggestions in timeout message', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      try {
        await SalesReportService.generate(testParams);
        fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.message).toContain('narrowing the date range');
        expect(error.message).toContain('export endpoint');
        expect(error.message).toContain('large datasets');
      }
    }, 12000);
  });

  describe('Timeout configuration', () => {
    it('should timeout at 10 seconds', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      const startTime = Date.now();
      
      try {
        await SalesReportService.generate(testParams);
        fail('Should have thrown timeout error');
      } catch (error) {
        const duration = Date.now() - startTime;
        // Verify timeout occurs around 10 seconds (with some tolerance)
        expect(duration).toBeGreaterThan(9500);
        expect(duration).toBeLessThan(11000);
      }
    }, 12000);

    it('should set retryAfter to 60 seconds', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      try {
        await SalesReportService.generate(testParams);
        fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.retryAfter).toBe(60);
      }
    }, 12000);

    it('should return HTTP 503 status', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      try {
        await SalesReportService.generate(testParams);
        fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.statusCode).toBe(503);
      }
    }, 12000);
  });

  describe('Successful query completion', () => {
    it('should complete normally when query finishes within timeout', async () => {
      // Mock fast aggregation
      jest.spyOn(Order, 'aggregate').mockResolvedValue([
        {
          grossRevenue: 1000,
          totalDiscounts: 100,
          totalTaxes: 50,
          totalDeliveryFees: 20,
          orderCount: 10,
          totalRefunds: 0,
          netRevenue: 850,
          averageOrderValue: 100,
          paymentMethods: []
        }
      ]);

      const result = await SalesReportService.generate(testParams);
      
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.breakdown).toBeDefined();
    });

    it('should not timeout when query completes in 5 seconds', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([]), 5000))
      );

      // Should not throw - query completes before timeout
      await expect(SalesReportService.generate(testParams))
        .resolves
        .toBeDefined();
    }, 7000);
  });

  describe('Error propagation', () => {
    it('should propagate non-timeout errors', async () => {
      const customError = new Error('Database connection failed');
      jest.spyOn(Order, 'aggregate').mockRejectedValue(customError);

      await expect(SalesReportService.generate(testParams))
        .rejects
        .toThrow('Database connection failed');
    });

    it('should re-throw timeout errors without modification', async () => {
      jest.spyOn(Order, 'aggregate').mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      try {
        await SalesReportService.generate(testParams);
        fail('Should have thrown timeout error');
      } catch (error) {
        expect(error instanceof AppError).toBe(true);
        expect(error.statusCode).toBe(503);
        expect(error.retryAfter).toBe(60);
        expect(error.message).toContain('timed out');
      }
    }, 12000);
  });
});
