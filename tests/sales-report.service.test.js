/**
 * Comprehensive Unit Tests for Sales Report Service
 * 
 * Coverage:
 * - Core report generation with various parameters
 * - Pagination logic
 * - Date grouping (day, week, month)
 * - Branch filtering
 * - Payment method breakdown
 * - Edge cases and error handling
 * - Empty data scenarios
 * 
 * Task 4.2: Unit tests for sales report service (Advanced Reporting Spec)
 */

const mongoose = require('mongoose');
const { SalesReportService } = require('../src/modules/reports/service/sales-report.service');
const Order = require('../models/orderModel');
const AppError = require('../utils/appError');

// Mock the Order model
jest.mock('../models/orderModel');

describe('SalesReportService', () => {
  const merchantId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  const dateFrom = new Date('2024-01-01');
  const dateTo = new Date('2024-01-31');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generate()', () => {
    describe('Parameter Validation', () => {
      test('should throw error when merchantId is missing', async () => {
        await expect(
          SalesReportService.generate({
            dateFrom,
            dateTo
          })
        ).rejects.toThrow(AppError);

        await expect(
          SalesReportService.generate({
            dateFrom,
            dateTo
          })
        ).rejects.toThrow('merchantId is required for sales report');
      });

      test('should throw error when dateFrom is missing', async () => {
        await expect(
          SalesReportService.generate({
            merchantId: merchantId.toString(),
            dateTo
          })
        ).rejects.toThrow(AppError);

        await expect(
          SalesReportService.generate({
            merchantId: merchantId.toString(),
            dateTo
          })
        ).rejects.toThrow('dateFrom and dateTo are required');
      });

      test('should throw error when dateTo is missing', async () => {
        await expect(
          SalesReportService.generate({
            merchantId: merchantId.toString(),
            dateFrom
          })
        ).rejects.toThrow(AppError);
      });

      test('should accept valid required parameters', async () => {
        const mockSummaryResult = [{
          grossRevenue: 10000,
          totalDiscounts: 500,
          totalTaxes: 750,
          totalDeliveryFees: 200,
          orderCount: 50,
          totalRefunds: 0,
          netRevenue: 8750,
          averageOrderValue: 200,
          paymentMethods: []
        }];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result).toBeDefined();
        expect(Order.aggregate).toHaveBeenCalled();
      });
    });

    describe('Tenant Isolation', () => {
      test('should always include merchant filter in aggregation', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        // Check all aggregate calls have merchant filter
        const calls = Order.aggregate.mock.calls;
        calls.forEach(call => {
          const pipeline = call[0];
          const matchStage = pipeline[0];
          expect(matchStage.$match).toHaveProperty('merchant');
          expect(matchStage.$match.merchant.toString()).toBe(merchantId.toString());
        });
      });

      test('should include branch filter when branchId is provided', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          branchId: branchId.toString(),
          dateFrom,
          dateTo
        });

        // Check that branch filter is present
        const calls = Order.aggregate.mock.calls;
        calls.forEach(call => {
          const pipeline = call[0];
          const matchStage = pipeline[0];
          expect(matchStage.$match).toHaveProperty('branch');
          expect(matchStage.$match.branch.toString()).toBe(branchId.toString());
        });
      });

      test('should not include branch filter when branchId is not provided', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        // Check that branch filter is NOT present
        const calls = Order.aggregate.mock.calls;
        calls.forEach(call => {
          const pipeline = call[0];
          const matchStage = pipeline[0];
          expect(matchStage.$match).not.toHaveProperty('branch');
        });
      });
    });

    describe('Payment Status Filter', () => {
      test('should only include paid orders in aggregation', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        // Check all aggregate calls filter by paymentStatus: 'paid'
        const calls = Order.aggregate.mock.calls;
        calls.forEach(call => {
          const pipeline = call[0];
          const matchStage = pipeline[0];
          expect(matchStage.$match.paymentStatus).toBe('paid');
        });
      });
    });

    describe('Date Range Filter', () => {
      test('should include orders within date range', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const customDateFrom = new Date('2024-06-01');
        const customDateTo = new Date('2024-06-30');

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom: customDateFrom,
          dateTo: customDateTo
        });

        // Check date filter is correctly applied
        const calls = Order.aggregate.mock.calls;
        calls.forEach(call => {
          const pipeline = call[0];
          const matchStage = pipeline[0];
          expect(matchStage.$match.placedAt.$gte).toEqual(customDateFrom);
          expect(matchStage.$match.placedAt.$lte).toEqual(customDateTo);
        });
      });
    });

    describe('Summary Calculation', () => {
      test('should calculate correct summary totals', async () => {
        const mockSummaryResult = [{
          grossRevenue: 25000,
          totalDiscounts: 2500,
          totalTaxes: 2250,
          totalDeliveryFees: 500,
          orderCount: 100,
          totalRefunds: 0,
          netRevenue: 20250,
          averageOrderValue: 250,
          paymentMethods: ['cash', 'card']
        }];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary.grossRevenue).toBe(25000);
        expect(result.summary.totalDiscounts).toBe(2500);
        expect(result.summary.totalTaxes).toBe(2250);
        expect(result.summary.totalDeliveryFees).toBe(500);
        expect(result.summary.orderCount).toBe(100);
        expect(result.summary.netRevenue).toBe(20250);
        expect(result.summary.averageOrderValue).toBe(250);
      });

      test('should return empty summary when no orders exist', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // empty summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary).toEqual(SalesReportService.getEmptySummary());
        expect(result.summary.grossRevenue).toBe(0);
        expect(result.summary.orderCount).toBe(0);
        expect(result.summary.paymentMethodBreakdown).toEqual({});
      });
    });

    describe('Breakdown Calculation', () => {
      test('should return breakdown data grouped by period', async () => {
        const mockBreakdownResult = [
          {
            period: '2024-01-31',
            grossRevenue: 5000,
            totalDiscounts: 250,
            totalTaxes: 450,
            totalDeliveryFees: 100,
            netRevenue: 4300,
            orderCount: 20,
            averageOrderValue: 250
          },
          {
            period: '2024-01-30',
            grossRevenue: 4500,
            totalDiscounts: 200,
            totalTaxes: 405,
            totalDeliveryFees: 80,
            netRevenue: 3895,
            orderCount: 18,
            averageOrderValue: 250
          }
        ];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce(mockBreakdownResult) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 2 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'day'
        });

        expect(result.breakdown).toHaveLength(2);
        expect(result.breakdown[0].period).toBe('2024-01-31');
        expect(result.breakdown[0].grossRevenue).toBe(5000);
        expect(result.breakdown[1].period).toBe('2024-01-30');
      });

      test('should return empty breakdown when no orders exist', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // empty breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.breakdown).toEqual([]);
        expect(result.breakdown).toHaveLength(0);
      });
    });

    describe('Pagination', () => {
      test('should apply default pagination (page 1, limit 50)', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 100 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.page).toBe(1);
        expect(result.total).toBe(100);
        expect(result.pages).toBe(2); // 100 / 50 = 2 pages
      });

      test('should apply custom pagination', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 150 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          page: 2,
          limit: 25
        });

        expect(result.page).toBe(2);
        expect(result.total).toBe(150);
        expect(result.pages).toBe(6); // 150 / 25 = 6 pages

        // Verify skip was calculated correctly: (2-1) * 25 = 25
        const breakdownCall = Order.aggregate.mock.calls[1][0];
        const skipStage = breakdownCall.find(stage => stage.$skip !== undefined);
        expect(skipStage.$skip).toBe(25);
      });

      test('should handle page beyond available data', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown (empty)
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 50 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          page: 10, // Only 1 page exists
          limit: 50
        });

        expect(result.page).toBe(10);
        expect(result.pages).toBe(1);
        expect(result.breakdown).toEqual([]);
      });

      test('should calculate correct pagination with remainder', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 127 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          limit: 25
        });

        expect(result.total).toBe(127);
        expect(result.pages).toBe(6); // Math.ceil(127 / 25) = 6
      });
    });

    describe('GroupBy Functionality', () => {
      test('should group by day when groupBy is "day"', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'day'
        });

        const breakdownCall = Order.aggregate.mock.calls[1][0];
        const groupStage = breakdownCall.find(stage => stage.$group);
        
        expect(groupStage.$group._id).toHaveProperty('$dateToString');
        expect(groupStage.$group._id.$dateToString.format).toBe('%Y-%m-%d');
      });

      test('should group by week when groupBy is "week"', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'week'
        });

        const breakdownCall = Order.aggregate.mock.calls[1][0];
        const groupStage = breakdownCall.find(stage => stage.$group);
        
        expect(groupStage.$group._id).toHaveProperty('$dateToString');
        expect(groupStage.$group._id.$dateToString.format).toBe('%Y-W%V');
      });

      test('should group by month when groupBy is "month"', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'month'
        });

        const breakdownCall = Order.aggregate.mock.calls[1][0];
        const groupStage = breakdownCall.find(stage => stage.$group);
        
        expect(groupStage.$group._id).toHaveProperty('$dateToString');
        expect(groupStage.$group._id.$dateToString.format).toBe('%Y-%m');
      });

      test('should default to day grouping for invalid groupBy value', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'invalid'
        });

        const breakdownCall = Order.aggregate.mock.calls[1][0];
        const groupStage = breakdownCall.find(stage => stage.$group);
        
        expect(groupStage.$group._id.$dateToString.format).toBe('%Y-%m-%d');
      });
    });

    describe('Payment Method Breakdown', () => {
      test('should include payment method breakdown in summary', async () => {
        const mockPaymentMethodResult = [
          { method: 'cash', count: 30 },
          { method: 'card', count: 45 },
          { method: 'mobile_banking', count: 25 }
        ];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([{ grossRevenue: 0, orderCount: 0, paymentMethods: [] }])
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce(mockPaymentMethodResult) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary.paymentMethodBreakdown).toEqual({
          cash: 30,
          card: 45,
          mobile_banking: 25
        });
      });

      test('should handle null payment methods as unspecified', async () => {
        const mockPaymentMethodResult = [
          { method: 'cash', count: 20 },
          { method: null, count: 5 },
          { method: 'card', count: 15 }
        ];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([{ grossRevenue: 0, orderCount: 0, paymentMethods: [] }])
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce(mockPaymentMethodResult) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary.paymentMethodBreakdown).toEqual({
          cash: 20,
          unspecified: 5,
          card: 15
        });
      });

      test('should return empty payment breakdown when no orders exist', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods (empty)
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary.paymentMethodBreakdown).toEqual({});
      });

      test('should not include paymentMethods array in final summary', async () => {
        const mockSummaryResult = [{
          grossRevenue: 10000,
          orderCount: 50,
          paymentMethods: ['cash', 'card', 'mobile_banking']
        }];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([]) // payment methods
          .mockResolvedValueOnce([{ total: 0 }]); // count

        const result = await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary).not.toHaveProperty('paymentMethods');
        expect(result.summary).toHaveProperty('paymentMethodBreakdown');
      });
    });

    describe('Concurrent Pipeline Execution', () => {
      test('should execute all pipelines concurrently', async () => {
        const aggregatePromises = [
          Promise.resolve([]), // summary
          Promise.resolve([]), // breakdown
          Promise.resolve([]), // payment methods
          Promise.resolve([{ total: 0 }]) // count
        ];

        let callIndex = 0;
        Order.aggregate = jest.fn(() => aggregatePromises[callIndex++]);

        await SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        // Verify all 4 aggregations were called
        expect(Order.aggregate).toHaveBeenCalledTimes(4);
      });
    });
  });

  describe('buildGroupByExpression()', () => {
    test('should return day format expression for "day"', () => {
      const expression = SalesReportService.buildGroupByExpression('day');
      
      expect(expression).toHaveProperty('$dateToString');
      expect(expression.$dateToString.format).toBe('%Y-%m-%d');
      expect(expression.$dateToString.date).toBe('$placedAt');
    });

    test('should return week format expression for "week"', () => {
      const expression = SalesReportService.buildGroupByExpression('week');
      
      expect(expression).toHaveProperty('$dateToString');
      expect(expression.$dateToString.format).toBe('%Y-W%V');
      expect(expression.$dateToString.date).toBe('$placedAt');
    });

    test('should return month format expression for "month"', () => {
      const expression = SalesReportService.buildGroupByExpression('month');
      
      expect(expression).toHaveProperty('$dateToString');
      expect(expression.$dateToString.format).toBe('%Y-%m');
      expect(expression.$dateToString.date).toBe('$placedAt');
    });

    test('should default to day format for invalid groupBy', () => {
      const expression = SalesReportService.buildGroupByExpression('invalid');
      
      expect(expression.$dateToString.format).toBe('%Y-%m-%d');
    });

    test('should default to day format for null groupBy', () => {
      const expression = SalesReportService.buildGroupByExpression(null);
      
      expect(expression.$dateToString.format).toBe('%Y-%m-%d');
    });

    test('should default to day format for undefined groupBy', () => {
      const expression = SalesReportService.buildGroupByExpression(undefined);
      
      expect(expression.$dateToString.format).toBe('%Y-%m-%d');
    });
  });

  describe('countBreakdownRows()', () => {
    test('should return correct count when data exists', async () => {
      const mockCountResult = [{ total: 150 }];
      Order.aggregate = jest.fn().mockResolvedValue(mockCountResult);

      const matchStage = {
        merchant: new mongoose.Types.ObjectId(merchantId),
        paymentStatus: 'paid'
      };
      const groupByExpression = { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } };

      const count = await SalesReportService.countBreakdownRows(matchStage, groupByExpression);

      expect(count).toBe(150);
      expect(Order.aggregate).toHaveBeenCalledTimes(1);
    });

    test('should return 0 when no data exists', async () => {
      Order.aggregate = jest.fn().mockResolvedValue([]);

      const matchStage = {
        merchant: new mongoose.Types.ObjectId(merchantId),
        paymentStatus: 'paid'
      };
      const groupByExpression = { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } };

      const count = await SalesReportService.countBreakdownRows(matchStage, groupByExpression);

      expect(count).toBe(0);
    });

    test('should handle aggregation with correct pipeline structure', async () => {
      Order.aggregate = jest.fn().mockResolvedValue([{ total: 50 }]);

      const matchStage = {
        merchant: new mongoose.Types.ObjectId(merchantId),
        paymentStatus: 'paid',
        placedAt: { $gte: dateFrom, $lte: dateTo }
      };
      const groupByExpression = { $dateToString: { format: '%Y-%m', date: '$placedAt' } };

      await SalesReportService.countBreakdownRows(matchStage, groupByExpression);

      const pipeline = Order.aggregate.mock.calls[0][0];
      
      expect(pipeline).toHaveLength(3);
      expect(pipeline[0]).toEqual({ $match: matchStage });
      expect(pipeline[1]).toEqual({ $group: { _id: groupByExpression } });
      expect(pipeline[2]).toEqual({ $count: 'total' });
    });
  });

  describe('getEmptySummary()', () => {
    test('should return summary object with all fields set to 0', () => {
      const emptySummary = SalesReportService.getEmptySummary();

      expect(emptySummary).toEqual({
        grossRevenue: 0,
        totalDiscounts: 0,
        totalTaxes: 0,
        totalRefunds: 0,
        totalDeliveryFees: 0,
        netRevenue: 0,
        orderCount: 0,
        averageOrderValue: 0,
        paymentMethodBreakdown: {}
      });
    });

    test('should include empty paymentMethodBreakdown', () => {
      const emptySummary = SalesReportService.getEmptySummary();

      expect(emptySummary).toHaveProperty('paymentMethodBreakdown');
      expect(emptySummary.paymentMethodBreakdown).toEqual({});
    });

    test('should return a new object each time (not cached)', () => {
      const summary1 = SalesReportService.getEmptySummary();
      const summary2 = SalesReportService.getEmptySummary();

      expect(summary1).toEqual(summary2);
      expect(summary1).not.toBe(summary2); // Different object references
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should throw error for malformed ObjectId strings', async () => {
      // MongoDB throws BSONError for invalid ObjectId format
      await expect(
        SalesReportService.generate({
          merchantId: 'invalid-id-format',
          dateFrom,
          dateTo
        })
      ).rejects.toThrow();
    });

    test('should handle zero order count without division errors', async () => {
      const mockSummaryResult = [{
        grossRevenue: 0,
        totalDiscounts: 0,
        totalTaxes: 0,
        totalDeliveryFees: 0,
        orderCount: 0,
        totalRefunds: 0,
        netRevenue: 0,
        averageOrderValue: 0,
        paymentMethods: []
      }];

      Order.aggregate = jest.fn()
        .mockResolvedValueOnce(mockSummaryResult)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        dateFrom,
        dateTo
      });

      expect(result.summary.averageOrderValue).toBe(0);
      expect(result.summary.orderCount).toBe(0);
    });

    test('should handle aggregation failures gracefully', async () => {
      Order.aggregate = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await expect(
        SalesReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        })
      ).rejects.toThrow('Database connection failed');
    });

    test('should handle large page numbers', async () => {
      Order.aggregate = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 10 }]);

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        dateFrom,
        dateTo,
        page: 999999,
        limit: 50
      });

      expect(result.page).toBe(999999);
      expect(result.breakdown).toEqual([]);
    });

    test('should handle string page and limit parameters', async () => {
      Order.aggregate = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 100 }]);

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        dateFrom,
        dateTo,
        page: '3',
        limit: '25'
      });

      expect(result.page).toBe(3);
      expect(result.pages).toBe(4);
    });
  });

  describe('Real-world Scenarios', () => {
    test('should handle complete report with all features', async () => {
      const mockSummaryResult = [{
        grossRevenue: 50000,
        totalDiscounts: 5000,
        totalTaxes: 4500,
        totalDeliveryFees: 1000,
        orderCount: 200,
        totalRefunds: 0,
        netRevenue: 40500,
        averageOrderValue: 250,
        paymentMethods: []
      }];

      const mockBreakdownResult = [
        {
          period: '2024-01-31',
          grossRevenue: 5000,
          totalDiscounts: 500,
          totalTaxes: 450,
          totalDeliveryFees: 100,
          netRevenue: 4050,
          orderCount: 20,
          averageOrderValue: 250
        },
        {
          period: '2024-01-30',
          grossRevenue: 4800,
          totalDiscounts: 480,
          totalTaxes: 432,
          totalDeliveryFees: 96,
          netRevenue: 3888,
          orderCount: 19,
          averageOrderValue: 252.63
        }
      ];

      const mockPaymentMethodResult = [
        { method: 'cash', count: 80 },
        { method: 'card', count: 90 },
        { method: 'mobile_banking', count: 30 }
      ];

      Order.aggregate = jest.fn()
        .mockResolvedValueOnce(mockSummaryResult)
        .mockResolvedValueOnce(mockBreakdownResult)
        .mockResolvedValueOnce(mockPaymentMethodResult)
        .mockResolvedValueOnce([{ total: 31 }]);

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        branchId: branchId.toString(),
        dateFrom,
        dateTo,
        groupBy: 'day',
        page: 1,
        limit: 50
      });

      // Verify complete structure
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pages');
      expect(result).toHaveProperty('total');

      // Verify summary
      expect(result.summary.grossRevenue).toBe(50000);
      expect(result.summary.netRevenue).toBe(40500);
      expect(result.summary.orderCount).toBe(200);
      expect(result.summary.paymentMethodBreakdown).toEqual({
        cash: 80,
        card: 90,
        mobile_banking: 30
      });

      // Verify breakdown
      expect(result.breakdown).toHaveLength(2);
      expect(result.breakdown[0].period).toBe('2024-01-31');

      // Verify pagination
      expect(result.page).toBe(1);
      expect(result.total).toBe(31);
      expect(result.pages).toBe(1);
    });

    test('should handle report for merchant with no branch filter', async () => {
      const mockSummaryResult = [{
        grossRevenue: 100000,
        totalDiscounts: 10000,
        totalTaxes: 9000,
        totalDeliveryFees: 2000,
        orderCount: 400,
        totalRefunds: 0,
        netRevenue: 81000,
        averageOrderValue: 250,
        paymentMethods: []
      }];

      Order.aggregate = jest.fn()
        .mockResolvedValueOnce(mockSummaryResult)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ method: 'cash', count: 400 }])
        .mockResolvedValueOnce([{ total: 0 }]);

      const result = await SalesReportService.generate({
        merchantId: merchantId.toString(),
        // No branchId - should aggregate across all branches
        dateFrom,
        dateTo
      });

      expect(result.summary.orderCount).toBe(400);
      
      // Verify branch filter was NOT included
      const calls = Order.aggregate.mock.calls;
      calls.forEach(call => {
        const pipeline = call[0];
        const matchStage = pipeline[0];
        expect(matchStage.$match).not.toHaveProperty('branch');
      });
    });
  });
});
