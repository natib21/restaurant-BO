/**
 * Unit Tests for Delivery Report Service
 * 
 * Coverage:
 * - Core report generation with delivery-specific filters
 * - Delivery duration calculation (deliveredAt - dispatchedAt)
 * - Delivery fee aggregation
 * - Pagination logic
 * - Date grouping (day, week, month)
 * - Branch filtering
 * - Edge cases: null timestamps, empty results
 * 
 * Task 8.1: Implement DeliveryReportService.generate() (Advanced Reporting Spec)
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

const mongoose = require('mongoose');
const { DeliveryReportService } = require('../src/modules/reports/service/delivery-report.service');
const Order = require('../models/orderModel');
const AppError = require('../utils/appError');

// Mock the Order model
jest.mock('../models/orderModel');

describe('DeliveryReportService', () => {
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
          DeliveryReportService.generate({
            dateFrom,
            dateTo
          })
        ).rejects.toThrow(AppError);

        await expect(
          DeliveryReportService.generate({
            dateFrom,
            dateTo
          })
        ).rejects.toThrow('merchantId is required for delivery report');
      });

      test('should throw error when dateFrom is missing', async () => {
        await expect(
          DeliveryReportService.generate({
            merchantId: merchantId.toString(),
            dateTo
          })
        ).rejects.toThrow(AppError);

        await expect(
          DeliveryReportService.generate({
            merchantId: merchantId.toString(),
            dateTo
          })
        ).rejects.toThrow('dateFrom and dateTo are required');
      });

      test('should throw error when dateTo is missing', async () => {
        await expect(
          DeliveryReportService.generate({
            merchantId: merchantId.toString(),
            dateFrom
          })
        ).rejects.toThrow(AppError);
      });
    });

    describe('Delivery-Specific Filtering', () => {
      test('should filter orders to delivery type only', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 25,
          totalDeliveryFees: 1250,
          averageDeliveryDuration: 10,
          onTimeDeliveryPercentage: null
        }];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult) // summary
          .mockResolvedValueOnce([]) // breakdown
          .mockResolvedValueOnce([{ total: 0 }]); // count

        await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        // Verify the first aggregate call (summary pipeline)
        const summaryPipeline = Order.aggregate.mock.calls[0][0];
        const matchStage = summaryPipeline[0].$match;

        expect(matchStage.orderType).toBe('delivery');
        expect(matchStage.merchant).toEqual(new mongoose.Types.ObjectId(merchantId));
      });

      test('should include branch filter when branchId provided', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 10,
          totalDeliveryFees: 500,
          averageDeliveryDuration: 10,
          onTimeDeliveryPercentage: null
        }];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ total: 0 }]);

        await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          branchId: branchId.toString(),
          dateFrom,
          dateTo
        });

        const summaryPipeline = Order.aggregate.mock.calls[0][0];
        const matchStage = summaryPipeline[0].$match;

        expect(matchStage.branch).toEqual(new mongoose.Types.ObjectId(branchId));
      });
    });

    describe('Delivery Fee Calculation', () => {
      test('should sum delivery fees from paid orders', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 30,
          totalDeliveryFees: 1500,
          averageDeliveryDuration: 10,
          onTimeDeliveryPercentage: null
        }];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ total: 0 }]);

        const result = await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary.totalDeliveryFees).toBe(1500);
        expect(result.summary.deliveryOrderCount).toBe(30);
      });
    });

    describe('Delivery Duration Calculation', () => {
      test('should calculate average delivery duration correctly', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 25,
          totalDeliveryFees: 1250,
          averageDeliveryDuration: 10,
          onTimeDeliveryPercentage: null
        }];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ total: 0 }]);

        const result = await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary.averageDeliveryDuration).toBe(10);
      });

      test('should return null average duration when no orders have timestamps', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 10,
          totalDeliveryFees: 500,
          averageDeliveryDuration: null,
          onTimeDeliveryPercentage: null
        }];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ total: 0 }]);

        const result = await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary.averageDeliveryDuration).toBeNull();
      });
    });

    describe('Empty Result Handling', () => {
      test('should return empty summary when no delivery orders exist', async () => {
        Order.aggregate = jest.fn()
          .mockResolvedValueOnce([]) // empty summary
          .mockResolvedValueOnce([]) // empty breakdown
          .mockResolvedValueOnce([{ total: 0 }]); // zero count

        const result = await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo
        });

        expect(result.summary).toEqual({
          deliveryOrderCount: 0,
          totalDeliveryFees: 0,
          averageDeliveryDuration: null,
          onTimeDeliveryPercentage: null
        });
        expect(result.breakdown).toEqual([]);
        expect(result.total).toBe(0);
      });
    });

    describe('Breakdown Time-Series', () => {
      test('should generate breakdown grouped by day', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 60,
          totalDeliveryFees: 3000,
          averageDeliveryDuration: 10,
          onTimeDeliveryPercentage: null
        }];

        const mockBreakdownResult = [
          {
            period: '2024-01-15',
            deliveryOrderCount: 20,
            totalDeliveryFees: 1000,
            averageDeliveryDuration: 12
          },
          {
            period: '2024-01-14',
            deliveryOrderCount: 25,
            totalDeliveryFees: 1250,
            averageDeliveryDuration: 8
          },
          {
            period: '2024-01-13',
            deliveryOrderCount: 15,
            totalDeliveryFees: 750,
            averageDeliveryDuration: 15
          }
        ];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce(mockBreakdownResult)
          .mockResolvedValueOnce([{ total: 3 }]);

        const result = await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'day',
          page: 1,
          limit: 50
        });

        expect(result.breakdown).toHaveLength(3);
        expect(result.breakdown[0].period).toBe('2024-01-15');
        expect(result.breakdown[0].deliveryOrderCount).toBe(20);
        expect(result.breakdown[0].totalDeliveryFees).toBe(1000);
      });

      test('should generate breakdown grouped by week', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 100,
          totalDeliveryFees: 5000,
          averageDeliveryDuration: 10,
          onTimeDeliveryPercentage: null
        }];

        const mockBreakdownResult = [
          {
            period: '2024-W03',
            deliveryOrderCount: 60,
            totalDeliveryFees: 3000,
            averageDeliveryDuration: 10
          },
          {
            period: '2024-W02',
            deliveryOrderCount: 40,
            totalDeliveryFees: 2000,
            averageDeliveryDuration: 12
          }
        ];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce(mockBreakdownResult)
          .mockResolvedValueOnce([{ total: 2 }]);

        const result = await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'week',
          page: 1,
          limit: 50
        });

        expect(result.breakdown).toHaveLength(2);
        expect(result.breakdown[0].period).toBe('2024-W03');
      });

      test('should generate breakdown grouped by month', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 500,
          totalDeliveryFees: 25000,
          averageDeliveryDuration: 10,
          onTimeDeliveryPercentage: null
        }];

        const mockBreakdownResult = [
          {
            period: '2024-01',
            deliveryOrderCount: 500,
            totalDeliveryFees: 25000,
            averageDeliveryDuration: 10
          }
        ];

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce(mockBreakdownResult)
          .mockResolvedValueOnce([{ total: 1 }]);

        const result = await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'month',
          page: 1,
          limit: 50
        });

        expect(result.breakdown).toHaveLength(1);
        expect(result.breakdown[0].period).toBe('2024-01');
      });
    });

    describe('Pagination', () => {
      test('should apply pagination to breakdown results', async () => {
        const mockSummaryResult = [{
          deliveryOrderCount: 100,
          totalDeliveryFees: 5000,
          averageDeliveryDuration: 10,
          onTimeDeliveryPercentage: null
        }];

        const mockBreakdownResult = Array.from({ length: 10 }, (_, i) => ({
          period: `2024-01-${String(i + 1).padStart(2, '0')}`,
          deliveryOrderCount: 10,
          totalDeliveryFees: 500,
          averageDeliveryDuration: 10
        }));

        Order.aggregate = jest.fn()
          .mockResolvedValueOnce(mockSummaryResult)
          .mockResolvedValueOnce(mockBreakdownResult)
          .mockResolvedValueOnce([{ total: 31 }]);

        const result = await DeliveryReportService.generate({
          merchantId: merchantId.toString(),
          dateFrom,
          dateTo,
          groupBy: 'day',
          page: 1,
          limit: 10
        });

        expect(result.page).toBe(1);
        expect(result.pages).toBe(4); // ceil(31 / 10)
        expect(result.total).toBe(31);
        expect(result.breakdown).toHaveLength(10);
      });
    });
  });

  describe('Helper Methods', () => {
    describe('buildGroupByExpression()', () => {
      test('should build day expression', () => {
        const expression = DeliveryReportService.buildGroupByExpression('day');
        expect(expression).toHaveProperty('$dateToString');
        expect(expression.$dateToString.format).toBe('%Y-%m-%d');
      });

      test('should build week expression', () => {
        const expression = DeliveryReportService.buildGroupByExpression('week');
        expect(expression).toHaveProperty('$dateToString');
        expect(expression.$dateToString.format).toBe('%Y-W%V');
      });

      test('should build month expression', () => {
        const expression = DeliveryReportService.buildGroupByExpression('month');
        expect(expression).toHaveProperty('$dateToString');
        expect(expression.$dateToString.format).toBe('%Y-%m');
      });

      test('should default to day expression for invalid groupBy', () => {
        const expression = DeliveryReportService.buildGroupByExpression('invalid');
        expect(expression).toHaveProperty('$dateToString');
        expect(expression.$dateToString.format).toBe('%Y-%m-%d');
      });
    });

    describe('getEmptySummary()', () => {
      test('should return empty summary with zero/null values', () => {
        const empty = DeliveryReportService.getEmptySummary();
        
        expect(empty).toEqual({
          deliveryOrderCount: 0,
          totalDeliveryFees: 0,
          averageDeliveryDuration: null,
          onTimeDeliveryPercentage: null
        });
      });
    });
  });
});
