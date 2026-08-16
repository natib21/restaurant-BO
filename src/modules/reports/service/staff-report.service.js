const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');

/**
 * Staff Report Service
 * Generates comprehensive staff performance analytics through MongoDB aggregation pipelines.
 * Provides insights on order volume per staff member, turnaround times, and productivity metrics.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
class StaffReportService {
  /**
   * Generate staff performance report with summary and breakdown data
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
      throw new AppError('merchantId is required for staff report', 400);
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

    // Get waiter performance with timeout protection
    let waiterPerformance, kitchenPerformance;
    try {
      [waiterPerformance, kitchenPerformance] = await Promise.all([
        Promise.race([this.getWaiterPerformance(matchStage), createTimeoutPromise()]),
        Promise.race([this.getKitchenPerformance(matchStage), createTimeoutPromise()])
      ]);
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }

    // Combine and rank staff by order volume
    const allStaff = [...waiterPerformance, ...kitchenPerformance]
      .sort((a, b) => b.orderCount - a.orderCount);

    // Summary aggregation - compute staff metrics
    const summary = {
      totalWaiters: waiterPerformance.length,
      totalKitchenStaff: kitchenPerformance.length,
      totalStaff: allStaff.length,
      totalOrdersHandled: allStaff.reduce((sum, staff) => sum + staff.orderCount, 0),
      averageOrdersPerStaff: allStaff.length > 0 
        ? Math.round(allStaff.reduce((sum, staff) => sum + staff.orderCount, 0) / allStaff.length)
        : 0,
      topPerformers: allStaff.slice(0, 10).map(staff => ({
        staffId: staff.staffId,
        staffType: staff.staffType,
        orderCount: staff.orderCount,
        averageTurnaroundMinutes: staff.averageTurnaroundMinutes
      })),
      waiterStats: {
        totalOrders: waiterPerformance.reduce((sum, w) => sum + w.orderCount, 0),
        averageTurnaround: waiterPerformance.length > 0
          ? Math.round(waiterPerformance.reduce((sum, w) => sum + w.averageTurnaroundMinutes, 0) / waiterPerformance.length)
          : 0
      },
      kitchenStats: {
        totalOrders: kitchenPerformance.reduce((sum, k) => sum + k.orderCount, 0),
        averageTurnaround: kitchenPerformance.length > 0
          ? Math.round(kitchenPerformance.reduce((sum, k) => sum + k.averageTurnaroundMinutes, 0) / kitchenPerformance.length)
          : 0
      }
    };

    // Breakdown aggregation - staff performance trends over time
    let breakdownResult, totalCount;
    try {
      [breakdownResult, totalCount] = await Promise.all([
        Promise.race([this.getStaffBreakdown(matchStage, groupBy, page, limit), createTimeoutPromise()]),
        Promise.race([this.countBreakdownRows(matchStage, groupBy), createTimeoutPromise()])
      ]);
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }

    return {
      summary,
      breakdown: breakdownResult || [],
      page: parseInt(page),
      pages: Math.ceil(totalCount / limit),
      total: totalCount
    };
  }

  /**
   * Get waiter performance metrics
   * @param {Object} matchStage - MongoDB match criteria
   * @returns {Promise<Array>} Waiter performance data
   */
  static async getWaiterPerformance(matchStage) {
    const pipeline = [
      { 
        $match: {
          ...matchStage,
          assignedWaiter: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedWaiter',
          orderCount: { $sum: 1 },
          turnaroundTimes: {
            $push: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$acceptedAt', null] },
                    { $ne: ['$readyAt', null] }
                  ]
                },
                {
                  $subtract: ['$readyAt', '$acceptedAt']
                },
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          staffId: '$_id',
          staffType: { $literal: 'waiter' },
          orderCount: 1,
          averageTurnaroundMinutes: {
            $cond: [
              { $gt: [{ $size: { $filter: { input: '$turnaroundTimes', cond: { $ne: ['$$this', null] } } } }, 0] },
              {
                $divide: [
                  {
                    $divide: [
                      {
                        $reduce: {
                          input: '$turnaroundTimes',
                          initialValue: 0,
                          in: {
                            $add: [
                              '$$value',
                              { $ifNull: ['$$this', 0] }
                            ]
                          }
                        }
                      },
                      { $size: { $filter: { input: '$turnaroundTimes', cond: { $ne: ['$$this', null] } } } }
                    ]
                  },
                  60000 // Convert ms to minutes
                ]
              },
              0
            ]
          }
        }
      },
      { $sort: { orderCount: -1 } }
    ];

    // Note: Timeout protection is applied at the caller level in generate() method
    return await Order.aggregate(pipeline);
  }

  /**
   * Get kitchen staff performance metrics
   * @param {Object} matchStage - MongoDB match criteria
   * @returns {Promise<Array>} Kitchen staff performance data
   */
  static async getKitchenPerformance(matchStage) {
    const pipeline = [
      { 
        $match: {
          ...matchStage,
          assignedKitchenStaff: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedKitchenStaff',
          orderCount: { $sum: 1 },
          turnaroundTimes: {
            $push: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$acceptedAt', null] },
                    { $ne: ['$readyAt', null] }
                  ]
                },
                {
                  $subtract: ['$readyAt', '$acceptedAt']
                },
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          staffId: '$_id',
          staffType: { $literal: 'kitchen' },
          orderCount: 1,
          averageTurnaroundMinutes: {
            $cond: [
              { $gt: [{ $size: { $filter: { input: '$turnaroundTimes', cond: { $ne: ['$$this', null] } } } }, 0] },
              {
                $divide: [
                  {
                    $divide: [
                      {
                        $reduce: {
                          input: '$turnaroundTimes',
                          initialValue: 0,
                          in: {
                            $add: [
                              '$$value',
                              { $ifNull: ['$$this', 0] }
                            ]
                          }
                        }
                      },
                      { $size: { $filter: { input: '$turnaroundTimes', cond: { $ne: ['$$this', null] } } } }
                    ]
                  },
                  60000 // Convert ms to minutes
                ]
              },
              0
            ]
          }
        }
      },
      { $sort: { orderCount: -1 } }
    ];

    // Note: Timeout protection is applied at the caller level in generate() method
    return await Order.aggregate(pipeline);
  }

  /**
   * Get staff performance breakdown over time
   * @param {Object} matchStage - MongoDB match criteria
   * @param {string} groupBy - Time bucket
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} Breakdown data
   */
  static async getStaffBreakdown(matchStage, groupBy, page, limit) {
    const groupByExpression = this.buildGroupByExpression(groupBy);
    
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: groupByExpression,
          totalOrders: { $sum: 1 },
          waiterOrders: {
            $sum: {
              $cond: [{ $ne: ['$assignedWaiter', null] }, 1, 0]
            }
          },
          kitchenOrders: {
            $sum: {
              $cond: [{ $ne: ['$assignedKitchenStaff', null] }, 1, 0]
            }
          },
          uniqueWaiters: {
            $addToSet: {
              $cond: [{ $ne: ['$assignedWaiter', null] }, '$assignedWaiter', null]
            }
          },
          uniqueKitchen: {
            $addToSet: {
              $cond: [{ $ne: ['$assignedKitchenStaff', null] }, '$assignedKitchenStaff', null]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          totalOrders: 1,
          waiterOrders: 1,
          kitchenOrders: 1,
          activeWaiters: {
            $size: {
              $filter: {
                input: '$uniqueWaiters',
                cond: { $ne: ['$$this', null] }
              }
            }
          },
          activeKitchenStaff: {
            $size: {
              $filter: {
                input: '$uniqueKitchen',
                cond: { $ne: ['$$this', null] }
              }
            }
          }
        }
      },
      { $sort: { period: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];

    // Note: Timeout protection is applied at the caller level in generate() method
    return await Order.aggregate(pipeline);
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
            format: '%Y-W%V',
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
   * @param {string} groupBy - Time bucket
   * @returns {Promise<number>} Total row count
   */
  static async countBreakdownRows(matchStage, groupBy) {
    const groupByExpression = this.buildGroupByExpression(groupBy);
    const countPipeline = [
      { $match: matchStage },
      { $group: { _id: groupByExpression } },
      { $count: 'total' }
    ];
    
    // Note: Timeout protection is applied at the caller level in generate() method
    const result = await Order.aggregate(countPipeline);
    return result[0]?.total || 0;
  }
}

module.exports = { StaffReportService };
