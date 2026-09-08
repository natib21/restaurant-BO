/**
 * Unit Tests for Sales Report Payment Method Breakdown
 * 
 * Tests the payment method breakdown functionality added to the sales report service.
 * Requirement 5.4: Payment method breakdown grouping by `paymentDetails.method`
 */

const mongoose = require('mongoose');
const { SalesReportService } = require('../src/modules/reports/service/sales-report.service');
const Order = require('../models/orderModel');

// Mock the Order model
jest.mock('../models/orderModel');

describe('SalesReportService - Payment Method Breakdown', () => {
  const merchantId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Payment Method Breakdown in Summary', () => {
    test('should include payment method breakdown in summary object', async () => {
      // Mock aggregation results
      const mockSummaryResult = [{
        grossRevenue: 10000,
        totalDiscounts: 500,
        totalTaxes: 750,
        totalDeliveryFees: 200,
        orderCount: 50,
        totalRefunds: 0,
        netRevenue: 8750,
        averageOrderValue: 200,
        paymentMethods: ['cash', 'card', 'mobile_banking', 'cash', 'card']
      }];

      const mockPaymentMethodResult = [
        { method: 'cash', count: 20 },
        { method: 'card', count: 25 },
        { method: 'mobile_banking', count: 5 }
      ];

      const mockBreakdownResult = [];
      const mockCountResult = [{ total: 0 }];

      // Mock Order.aggregate to return different results based on pipeline
      Order.aggregate = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockSummaryResult))  // summaryPipeline
        .mockImplementationOnce(() => Promise.resolve(mockBreakdownResult)) // breakdownPipeline
        .mockImplementationOnce(() => Promise.resolve(mockPaymentMethodResult)) // paymentMethodPipeline
        .mockImplementationOnce(() => Promise.resolve(mockCountResult)); // countPipeline

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        branchId: branchId.toString(),
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31'),
        groupBy: 'day',
        page: 1,
        limit: 50
      });

      // Verify summary includes payment method breakdown
      expect(result.summary).toHaveProperty('paymentMethodBreakdown');
      expect(result.summary.paymentMethodBreakdown).toEqual({
        cash: 20,
        card: 25,
        mobile_banking: 5
      });

      // Verify paymentMethods array was removed from summary
      expect(result.summary).not.toHaveProperty('paymentMethods');

      // Verify aggregate was called 4 times (summary, breakdown, payment methods, count)
      expect(Order.aggregate).toHaveBeenCalledTimes(4);
    });

    test('should handle null payment methods as unspecified', async () => {
      const mockSummaryResult = [{
        grossRevenue: 5000,
        totalDiscounts: 0,
        totalTaxes: 500,
        totalDeliveryFees: 0,
        orderCount: 10,
        totalRefunds: 0,
        netRevenue: 4500,
        averageOrderValue: 500,
        paymentMethods: ['cash', null, 'card']
      }];

      const mockPaymentMethodResult = [
        { method: 'cash', count: 5 },
        { method: null, count: 3 },
        { method: 'card', count: 2 }
      ];

      const mockBreakdownResult = [];
      const mockCountResult = [{ total: 0 }];

      Order.aggregate = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockSummaryResult))
        .mockImplementationOnce(() => Promise.resolve(mockBreakdownResult))
        .mockImplementationOnce(() => Promise.resolve(mockPaymentMethodResult))
        .mockImplementationOnce(() => Promise.resolve(mockCountResult));

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31')
      });

      expect(result.summary.paymentMethodBreakdown).toEqual({
        cash: 5,
        unspecified: 3,
        card: 2
      });
    });

    test('should return empty payment method breakdown when no orders exist', async () => {
      const mockSummaryResult = [];
      const mockPaymentMethodResult = [];
      const mockBreakdownResult = [];
      const mockCountResult = [{ total: 0 }];

      Order.aggregate = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockSummaryResult))
        .mockImplementationOnce(() => Promise.resolve(mockBreakdownResult))
        .mockImplementationOnce(() => Promise.resolve(mockPaymentMethodResult))
        .mockImplementationOnce(() => Promise.resolve(mockCountResult));

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-31')
      });

      expect(result.summary).toEqual(SalesReportService.getEmptySummary());
      expect(result.summary.paymentMethodBreakdown).toEqual({});
    });

    test('should handle all payment method types correctly', async () => {
      const mockSummaryResult = [{
        grossRevenue: 20000,
        totalDiscounts: 1000,
        totalTaxes: 1500,
        totalDeliveryFees: 500,
        orderCount: 100,
        totalRefunds: 0,
        netRevenue: 17500,
        averageOrderValue: 200,
        paymentMethods: []
      }];

      const mockPaymentMethodResult = [
        { method: 'cash', count: 40 },
        { method: 'card', count: 35 },
        { method: 'mobile_banking', count: 20 },
        { method: 'unspecified', count: 5 }
      ];

      const mockBreakdownResult = [];
      const mockCountResult = [{ total: 0 }];

      Order.aggregate = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockSummaryResult))
        .mockImplementationOnce(() => Promise.resolve(mockBreakdownResult))
        .mockImplementationOnce(() => Promise.resolve(mockPaymentMethodResult))
        .mockImplementationOnce(() => Promise.resolve(mockCountResult));

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-12-31')
      });

      expect(result.summary.paymentMethodBreakdown).toEqual({
        cash: 40,
        card: 35,
        mobile_banking: 20,
        unspecified: 5
      });

      // Verify total count matches sum of payment methods
      const totalPaymentMethodCount = Object.values(result.summary.paymentMethodBreakdown)
        .reduce((sum, count) => sum + count, 0);
      expect(totalPaymentMethodCount).toBe(100);
    });
  });

  describe('Empty Summary Structure', () => {
    test('getEmptySummary should include empty paymentMethodBreakdown', () => {
      const emptySummary = SalesReportService.getEmptySummary();
      
      expect(emptySummary).toHaveProperty('paymentMethodBreakdown');
      expect(emptySummary.paymentMethodBreakdown).toEqual({});
      expect(emptySummary.grossRevenue).toBe(0);
      expect(emptySummary.orderCount).toBe(0);
    });
  });
});
