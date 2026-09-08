const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');

/**
 * Customers Report Service
 * Generates comprehensive customer analytics through MongoDB aggregation pipelines.
 * Provides insights on new vs returning customers, spend distribution, and top customers.
 */
class CustomersReportService {
  /**
   * Generate customers report with summary and breakdown data
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
      throw new AppError('merchantId is required for customers report', 400);
    }
    if (!dateFrom || !dateTo) {
      throw new AppError('dateFrom and dateTo are required', 400);
    }

    // Build base match stage (ALWAYS start with merchant for tenant isolation)
    const matchStage = {
      merchant: new mongoose.Types.ObjectId(merchantId),
      customer: { $ne: null }, // Only include orders with customer references
      placedAt: { 
        $gte: new Date(dateFrom), 
        $lte: new Date(dateTo) 
      }
    };

    // Conditionally add branch filter if provided
    if (branchId) {
      matchStage.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Summary aggregation - compute customer metrics
    const summaryPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$customer',
          firstOrderInRange: { $min: '$placedAt' },
          totalSpend: {
            $sum: {
              $cond: [
                { $eq: ['$paymentStatus', 'paid'] },
                '$totalAmount',
                0
              ]
            }
          },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'orders',
          let: { customerId: '$_id', rangeStart: new Date(dateFrom) },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$customer', '$$customerId'] },
                    { $lt: ['$placedAt', '$$rangeStart'] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: 'ordersBeforeRange'
        }
      },
      {
        $project: {
          customer: '$_id',
          firstOrderInRange: 1,
          totalSpend: 1,
          orderCount: 1,
          isReturning: { 
            $gt: [{ $size: '$ordersBeforeRange' }, 0] 
          }
        }
      },
      {
        $facet: {
          customerStats: [
            {
              $group: {
                _id: null,
                newCustomerCount: {
                  $sum: {
                    $cond: [{ $eq: ['$isReturning', false] }, 1, 0]
                  }
                },
                returningCustomerCount: {
                  $sum: {
                    $cond: [{ $eq: ['$isReturning', true] }, 1, 0]
                  }
                },
                totalCustomers: { $sum: 1 },
                allSpends: { $push: '$totalSpend' }
              }
            }
          ],
          topCustomers: [
            { $sort: { totalSpend: -1 } },
            { $limit: 20 },
            {
              $lookup: {
                from: 'customers',
                localField: 'customer',
                foreignField: '_id',
                as: 'customerDetails'
              }
            },
            {
              $project: {
                customerId: '$customer',
                customerName: { 
                  $ifNull: [
                    { $arrayElemAt: ['$customerDetails.name', 0] },
                    'Unknown'
                  ]
                },
                totalSpend: 1,
                orderCount: 1,
                isReturning: 1
              }
            }
          ]
        }
      }
    ];

    // Breakdown aggregation - new vs returning customers over time
    const groupByExpression = this.buildGroupByExpression(groupBy);
    
    const breakdownPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            period: groupByExpression,
            customer: '$customer'
          },
          firstOrderInPeriod: { $min: '$placedAt' }
        }
      },
      {
        $lookup: {
          from: 'orders',
          let: { 
            customerId: '$_id.customer', 
            firstOrder: '$firstOrderInPeriod' 
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$customer', '$$customerId'] },
                    { $lt: ['$placedAt', '$$firstOrder'] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: 'previousOrders'
        }
      },
      {
        $project: {
          period: '$_id.period',
          customer: '$_id.customer',
          isReturning: { 
            $gt: [{ $size: '$previousOrders' }, 0] 
          }
        }
      },
      {
        $group: {
          _id: '$period',
          newCustomers: {
            $sum: {
              $cond: [{ $eq: ['$isReturning', false] }, 1, 0]
            }
          },
          returningCustomers: {
            $sum: {
              $cond: [{ $eq: ['$isReturning', true] }, 1, 0]
            }
          },
          totalCustomers: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          newCustomers: 1,
          returningCustomers: 1,
          totalCustomers: 1
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
      pages: Math.ceil((totalCount || 0) / limit),
      total: totalCount || 0
    };
  }

  /**
   * Process summary result to extract customer statistics and percentiles
   * @param {Array} summaryResult - Aggregation result from summary pipeline
   * @returns {Object} Processed summary with statistics and top customers
   */
  static processSummaryResult(summaryResult) {
    if (!summaryResult || summaryResult.length === 0) {
      return this.getEmptySummary();
    }

    const result = summaryResult[0];
    const stats = result.customerStats[0] || {};
    const topCustomers = result.topCustomers || [];

    // Calculate spend distribution percentiles
    const allSpends = stats.allSpends || [];
    const sortedSpends = allSpends.filter(spend => spend > 0).sort((a, b) => a - b);
    
    const percentiles = this.calculatePercentiles(sortedSpends);

    return {
      newCustomerCount: stats.newCustomerCount || 0,
      returningCustomerCount: stats.returningCustomerCount || 0,
      totalCustomers: stats.totalCustomers || 0,
      spendDistribution: {
        percentile25th: percentiles.p25,
        percentile50th: percentiles.p50,
        percentile75th: percentiles.p75,
        percentile90th: percentiles.p90
      },
      topCustomers: topCustomers.map(customer => ({
        customerId: customer.customerId,
        customerName: customer.customerName,
        totalSpend: customer.totalSpend,
        orderCount: customer.orderCount,
        customerType: customer.isReturning ? 'returning' : 'new'
      }))
    };
  }

  /**
   * Calculate percentiles from sorted spend array
   * @param {Array<number>} sortedSpends - Sorted array of customer spend values
   * @returns {Object} Percentile values (25th, 50th, 75th, 90th)
   */
  static calculatePercentiles(sortedSpends) {
    if (!sortedSpends || sortedSpends.length === 0) {
      return { p25: 0, p50: 0, p75: 0, p90: 0 };
    }

    const getPercentile = (arr, percentile) => {
      const index = Math.ceil((percentile / 100) * arr.length) - 1;
      return arr[Math.max(0, index)] || 0;
    };

    return {
      p25: getPercentile(sortedSpends, 25),
      p50: getPercentile(sortedSpends, 50), // Median
      p75: getPercentile(sortedSpends, 75),
      p90: getPercentile(sortedSpends, 90)
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
      {
        $group: {
          _id: {
            period: groupByExpression,
            customer: '$customer'
          }
        }
      },
      {
        $group: {
          _id: '$_id.period'
        }
      },
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
      newCustomerCount: 0,
      returningCustomerCount: 0,
      totalCustomers: 0,
      spendDistribution: {
        percentile25th: 0,
        percentile50th: 0,
        percentile75th: 0,
        percentile90th: 0
      },
      topCustomers: []
    };
  }
}

module.exports = { CustomersReportService };
