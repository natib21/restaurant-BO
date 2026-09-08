const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');

/**
 * Delivery Report Service
 * Generates comprehensive delivery operations analytics through MongoDB aggregation pipelines.
 * Provides insights on delivery volumes, fees, durations, and on-time delivery metrics.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */
class DeliveryReportService {
  /**
   * Generate delivery report with summary and breakdown data
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
      throw new AppError('merchantId is required for delivery report', 400);
    }
    if (!dateFrom || !dateTo) {
      throw new AppError('dateFrom and dateTo are required', 400);
    }

    // Build base match stage (ALWAYS start with merchant for tenant isolation)
    const matchStage = {
      merchant: new mongoose.Types.ObjectId(merchantId),
      orderType: 'delivery', // Filter for delivery orders only
      placedAt: { 
        $gte: new Date(dateFrom), 
        $lte: new Date(dateTo) 
      }
    };

    // Conditionally add branch filter if provided
    if (branchId) {
      matchStage.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Summary aggregation - compute delivery metrics
    const summaryPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalDeliveryOrders: { $sum: 1 },
          totalDeliveryFees: {
            $sum: {
              $cond: [
                { $eq: ['$paymentStatus', 'paid'] },
                { $ifNull: ['$deliveryFee', 0] },
                0
              ]
            }
          },
          // Calculate average delivery duration (deliveredAt - dispatchedAt)
          deliveryDurations: {
            $push: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$delivery.dispatchedAt', null] },
                    { $ne: ['$delivery.deliveredAt', null] }
                  ]
                },
                {
                  $subtract: ['$delivery.deliveredAt', '$delivery.dispatchedAt']
                },
                null
              ]
            }
          },
          ordersWithTimestamps: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$delivery.dispatchedAt', null] },
                    { $ne: ['$delivery.deliveredAt', null] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalDeliveryOrders: 1,
          totalDeliveryFees: 1,
          averageDeliveryDuration: {
            $cond: [
              { $gt: ['$ordersWithTimestamps', 0] },
              {
                $divide: [
                  {
                    $reduce: {
                      input: '$deliveryDurations',
                      initialValue: 0,
                      in: {
                        $add: [
                          '$$value',
                          { $ifNull: ['$$this', 0] }
                        ]
                      }
                    }
                  },
                  '$ordersWithTimestamps'
                ]
              },
              0
            ]
          },
          ordersWithTimestamps: 1,
          // Stub on-time delivery percentage as null (SLA field doesn't exist yet)
          onTimeDeliveryPercentage: { $literal: null }
        }
      }
    ];

    // Breakdown aggregation - delivery volume and fee trends over time
    const groupByExpression = this.buildGroupByExpression(groupBy);
    
    const breakdownPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: groupByExpression,
          deliveryOrderCount: { $sum: 1 },
          totalDeliveryFees: {
            $sum: {
              $cond: [
                { $eq: ['$paymentStatus', 'paid'] },
                { $ifNull: ['$deliveryFee', 0] },
                0
              ]
            }
          },
          averageDeliveryFee: {
            $avg: { $ifNull: ['$deliveryFee', 0] }
          },
          // Count orders with complete delivery timestamps
          ordersWithDuration: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$delivery.dispatchedAt', null] },
                    { $ne: ['$delivery.deliveredAt', null] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          deliveryOrderCount: 1,
          totalDeliveryFees: 1,
          averageDeliveryFee: { 
            $round: ['$averageDeliveryFee', 2] 
          },
          ordersWithDuration: 1
        }
      },
      { $sort: { period: -1 } },
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

    // Process summary results
    const summary = this.processSummaryResult(summaryResult);

    return {
      summary,
      breakdown: breakdownResult || [],
      page: parseInt(page),
      pages: Math.ceil(totalCount / limit),
      total: totalCount
    };
  }

  /**
   * Process summary result to extract delivery metrics
   * @param {Array} summaryResult - Aggregation result from summary pipeline
   * @returns {Object} Processed summary with delivery statistics
   */
  static processSummaryResult(summaryResult) {
    if (!summaryResult || summaryResult.length === 0) {
      return this.getEmptySummary();
    }

    const result = summaryResult[0];

    // Convert average delivery duration from milliseconds to minutes
    const averageDurationMs = result.averageDeliveryDuration || 0;
    const averageDurationMinutes = averageDurationMs > 0 
      ? Math.round(averageDurationMs / (1000 * 60)) 
      : null;

    return {
      deliveryOrderCount: result.totalDeliveryOrders || 0,
      totalDeliveryFees: Math.round((result.totalDeliveryFees || 0) * 100) / 100,
      averageDeliveryDuration: averageDurationMinutes, // in minutes or null
      onTimeDeliveryPercentage: result.onTimeDeliveryPercentage // null until SLA tracking implemented
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
      deliveryOrderCount: 0,
      totalDeliveryFees: 0,
      averageDeliveryDuration: null,
      onTimeDeliveryPercentage: null
    };
  }
}

module.exports = { DeliveryReportService };
