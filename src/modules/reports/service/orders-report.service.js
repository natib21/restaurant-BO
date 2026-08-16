const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');

/**
 * Orders Report Service
 * Generates order volume and timing analytics through MongoDB aggregation pipelines.
 * Provides metrics on order counts by status, cancellation rates, and average preparation times.
 */
class OrdersReportService {
  /**
   * Generate orders report with summary and breakdown data
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
      throw new AppError('merchantId is required for orders report', 400);
    }
    if (!dateFrom || !dateTo) {
      throw new AppError('dateFrom and dateTo are required', 400);
    }

    // Build base match stage (ALWAYS start with merchant for tenant isolation)
    const matchStage = {
      merchant: new mongoose.Types.ObjectId(merchantId),
      placedAt: { 
        $gte: new Date(dateFrom), 
        $lte: new Date(dateTo) 
      }
    };

    // Conditionally add branch filter if provided
    if (branchId) {
      matchStage.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Summary aggregation pipeline (order counts by status and timing metrics)
    const summaryPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          // Count orders by status
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          acceptedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
          },
          preparingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'preparing'] }, 1, 0] }
          },
          readyOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] }
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          canceledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] }
          },
          // Collect timing data for orders with readyAt timestamp
          preparationTimes: {
            $push: {
              $cond: [
                { $ne: ['$readyAt', null] },
                { $subtract: ['$readyAt', '$placedAt'] },
                '$$REMOVE'
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          ordersByStatus: {
            pending: '$pendingOrders',
            accepted: '$acceptedOrders',
            preparing: '$preparingOrders',
            ready: '$readyOrders',
            completed: '$completedOrders',
            canceled: '$canceledOrders'
          },
          cancellationRate: {
            $cond: [
              { $gt: ['$totalOrders', 0] },
              { 
                $multiply: [
                  { $divide: ['$canceledOrders', '$totalOrders'] },
                  100
                ]
              },
              0
            ]
          },
          averagePreparationTime: {
            $cond: [
              { $gt: [{ $size: '$preparationTimes' }, 0] },
              { $avg: '$preparationTimes' },
              null
            ]
          },
          ordersWithPreparationTime: { $size: '$preparationTimes' }
        }
      }
    ];

    // Build groupBy expression for time-series aggregation
    const groupByExpression = this.buildGroupByExpression(groupBy);

    // Breakdown aggregation pipeline (order volume trends by period)
    const breakdownPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: groupByExpression,
          orderCount: { $sum: 1 },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          acceptedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
          },
          preparingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'preparing'] }, 1, 0] }
          },
          readyCount: {
            $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] }
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          canceledCount: {
            $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          orderCount: 1,
          ordersByStatus: {
            pending: '$pendingCount',
            accepted: '$acceptedCount',
            preparing: '$preparingCount',
            ready: '$readyCount',
            completed: '$completedCount',
            canceled: '$canceledCount'
          },
          cancellationRate: {
            $cond: [
              { $gt: ['$orderCount', 0] },
              { 
                $multiply: [
                  { $divide: ['$canceledCount', '$orderCount'] },
                  100
                ]
              },
              0
            ]
          }
        }
      },
      { $sort: { period: -1 } }, // Most recent periods first
      { $skip: (page - 1) * limit },
      { $limit: limit }
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
    let summaryResult, breakdownResult, totalCount;
    try {
      [summaryResult, breakdownResult, totalCount] = await Promise.all([
        Promise.race([Order.aggregate(summaryPipeline), createTimeoutPromise()]),
        Promise.race([Order.aggregate(breakdownPipeline), createTimeoutPromise()]),
        Promise.race([this.countBreakdownRows(matchStage, groupByExpression), createTimeoutPromise()])
      ]);
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }

    // Use summary result or empty summary
    const summary = summaryResult[0] || this.getEmptySummary();

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
      totalOrders: 0,
      ordersByStatus: {
        pending: 0,
        accepted: 0,
        preparing: 0,
        ready: 0,
        completed: 0,
        canceled: 0
      },
      cancellationRate: 0,
      averagePreparationTime: null,
      ordersWithPreparationTime: 0
    };
  }
}

module.exports = { OrdersReportService };
