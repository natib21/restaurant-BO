const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');

/**
 * Sales Report Service
 * Generates comprehensive sales analytics through MongoDB aggregation pipelines.
 * Provides both summary totals and time-series breakdown data.
 */
class SalesReportService {
  /**
   * Generate sales report with summary and breakdown data
   * @param {Object} params - Report parameters
   * @param {string} params.merchantId - Merchant ObjectId (required for tenant isolation)
   * @param {string} params.branchId - Optional branch ObjectId filter
   * @param {Date} params.dateFrom - Start date (inclusive)
   * @param {Date} params.dateTo - End date (inclusive)
   * @param {string} params.groupBy - Time bucket: 'day', 'week', or 'month'
   * @param {number} params.page - Page number for breakdown pagination (default: 1)
   * @param {number} params.limit - Items per page for breakdown (default: 50)
   * @returns {Promise<Object>} Report data with summary, breakdown, and pagination meta
   */
  static async generate({ merchantId, branchId, dateFrom, dateTo, groupBy = 'day', page = 1, limit = 50 }) {
    // Validate required parameters
    if (!merchantId) {
      throw new AppError('merchantId is required for sales report', 400);
    }
    if (!dateFrom || !dateTo) {
      throw new AppError('dateFrom and dateTo are required', 400);
    }

    // Build base match stage (ALWAYS start with merchant for tenant isolation)
    const matchStage = {
      merchant: new mongoose.Types.ObjectId(merchantId),
      paymentStatus: 'paid', // Only include paid orders for revenue calculation
      placedAt: { 
        $gte: new Date(dateFrom), 
        $lte: new Date(dateTo) 
      }
    };

    // Conditionally add branch filter if provided
    if (branchId) {
      matchStage.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Summary aggregation pipeline (single-row totals)
    const summaryPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: '$totalAmount' },
          totalDiscounts: { $sum: '$discountAmount' },
          totalTaxes: { $sum: '$taxAmount' },
          totalDeliveryFees: { $sum: '$deliveryFee' },
          orderCount: { $sum: 1 },
          // Collect all payment methods for breakdown
          paymentMethods: { $push: '$paymentDetails.method' }
        }
      },
      {
        $project: {
          _id: 0,
          grossRevenue: 1,
          totalDiscounts: 1,
          totalTaxes: 1,
          // Refunds stub (Phase 3 will replace with actual refund join)
          totalRefunds: { $literal: 0 },
          totalDeliveryFees: 1,
          netRevenue: {
            $subtract: [
              { $subtract: [
                { $subtract: ['$grossRevenue', '$totalDiscounts'] },
                '$totalTaxes'
              ]},
              '$totalRefunds'
            ]
          },
          orderCount: 1,
          averageOrderValue: {
            $cond: [
              { $gt: ['$orderCount', 0] },
              { $divide: ['$grossRevenue', '$orderCount'] },
              0
            ]
          },
          paymentMethods: 1
        }
      }
    ];

    // Build groupBy expression for time-series aggregation
    const groupByExpression = this.buildGroupByExpression(groupBy);

    // Breakdown aggregation pipeline (time-series by groupBy bucket)
    const breakdownPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: groupByExpression,
          grossRevenue: { $sum: '$totalAmount' },
          totalDiscounts: { $sum: '$discountAmount' },
          totalTaxes: { $sum: '$taxAmount' },
          totalDeliveryFees: { $sum: '$deliveryFee' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          grossRevenue: 1,
          totalDiscounts: 1,
          totalTaxes: 1,
          totalDeliveryFees: 1,
          netRevenue: {
            $subtract: [
              { $subtract: ['$grossRevenue', '$totalDiscounts'] },
              '$totalTaxes'
            ]
          },
          orderCount: 1,
          averageOrderValue: {
            $cond: [
              { $gt: ['$orderCount', 0] },
              { $divide: ['$grossRevenue', '$orderCount'] },
              0
            ]
          }
        }
      },
      { $sort: { period: -1 } }, // Most recent periods first
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];

    // Payment method breakdown aggregation pipeline
    const paymentMethodPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$paymentDetails.method',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          method: '$_id',
          count: 1
        }
      }
    ];

    // Create timeout promise for aggregation queries (Requirement 18.3)
    const createTimeoutPromise = () => new Promise((_, reject) => {
      setTimeout(() => {
        const error = new AppError(
          'Report query timed out. Try narrowing the date range or use the export endpoint for large datasets.',
          503
        );
        error.retryAfter = 60; // Suggest retry after 60 seconds (Requirement 18.6)
        reject(error);
      }, 10000); // 10 seconds
    });

    // Execute all pipelines concurrently with timeout protection
    let summaryResult, breakdownResult, paymentMethodResult, totalCount;
    try {
      [summaryResult, breakdownResult, paymentMethodResult, totalCount] = await Promise.all([
        Promise.race([Order.aggregate(summaryPipeline), createTimeoutPromise()]),
        Promise.race([Order.aggregate(breakdownPipeline), createTimeoutPromise()]),
        Promise.race([Order.aggregate(paymentMethodPipeline), createTimeoutPromise()]),
        Promise.race([this.countBreakdownRows(matchStage, groupByExpression), createTimeoutPromise()])
      ]);
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }

    // Build payment method breakdown object from array result
    const paymentMethodBreakdown = {};
    if (paymentMethodResult && paymentMethodResult.length > 0) {
      paymentMethodResult.forEach(item => {
        // Handle null/undefined methods as 'unspecified'
        const method = item.method || 'unspecified';
        paymentMethodBreakdown[method] = item.count;
      });
    }

    // Combine summary with payment method breakdown
    const summary = summaryResult[0] || this.getEmptySummary();
    // Remove the paymentMethods array (it was only used for tracking)
    delete summary.paymentMethods;
    // Add the payment method breakdown
    summary.paymentMethodBreakdown = paymentMethodBreakdown;

    return {
      summary,
      breakdown: breakdownResult || [],
      page: parseInt(page),
      pages: Math.ceil(totalCount / limit),
      total: totalCount
    };
  }

  /**
   * Build MongoDB date aggregation expression based on groupBy parameter
   * @param {string} groupBy - 'day', 'week', or 'month'
   * @returns {Object} MongoDB aggregation expression
   */
  static buildGroupByExpression(groupBy) {
    switch (groupBy) {
      case 'day':
        return { 
          $dateToString: { 
            format: '%Y-%m-%d', 
            date: '$placedAt' 
          } 
        };
      case 'week':
        return {
          $dateToString: {
            format: '%Y-W%V', // ISO week format (e.g., "2024-W15")
            date: '$placedAt'
          }
        };
      case 'month':
        return { 
          $dateToString: { 
            format: '%Y-%m', 
            date: '$placedAt' 
          } 
        };
      default:
        return { 
          $dateToString: { 
            format: '%Y-%m-%d', 
            date: '$placedAt' 
          } 
        };
    }
  }

  /**
   * Count total breakdown rows for pagination metadata
   * @param {Object} matchStage - MongoDB match criteria
   * @param {Object} groupByExpression - MongoDB grouping expression
   * @returns {Promise<number>} Total row count
   */
  static async countBreakdownRows(matchStage, groupByExpression) {
    const countPipeline = [
      { $match: matchStage },
      { $group: { _id: groupByExpression } },
      { $count: 'total' }
    ];
    
    // Timeout protection for count aggregation (Requirement 18.3)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const error = new AppError(
          'Report query timed out. Try narrowing the date range or use the export endpoint for large datasets.',
          503
        );
        error.retryAfter = 60;
        reject(error);
      }, 10000);
    });

    try {
      const result = await Promise.race([
        Order.aggregate(countPipeline),
        timeoutPromise
      ]);
      return result[0]?.total || 0;
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }
  }

  /**
   * Return empty summary object when no data exists
   * @returns {Object} Empty summary with zero values
   */
  static getEmptySummary() {
    return {
      grossRevenue: 0,
      totalDiscounts: 0,
      totalTaxes: 0,
      totalRefunds: 0,
      totalDeliveryFees: 0,
      netRevenue: 0,
      orderCount: 0,
      averageOrderValue: 0,
      paymentMethodBreakdown: {}
    };
  }
}

module.exports = { SalesReportService };
