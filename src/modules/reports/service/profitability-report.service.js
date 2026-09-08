const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');

/**
 * Profitability Report Service
 * Generates comprehensive profitability analytics through MongoDB aggregation pipelines.
 * Provides insights on COGS, gross profit, margins, and identifies low-margin items.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
class ProfitabilityReportService {
  /**
   * Generate profitability report with summary and breakdown data
   * @param {Object} params - Report parameters
   * @param {string} params.merchantId - Merchant ObjectId (required for tenant isolation)
   * @param {string} params.branchId - Optional branch ObjectId filter
   * @param {Date} params.dateFrom - Start date (inclusive)
   * @param {Date} params.dateTo - End date (inclusive)
   * @param {string} params.groupBy - Time bucket: 'day', 'week', or 'month'
   * @param {number} params.page - Page number for breakdown pagination (default: 1)
   * @param {number} params.limit - Items per page for breakdown (default: 50)
   * @returns {Promise<Object>} Report data with summary, breakdown, warnings, and pagination meta
   */
  static async generate({ merchantId, branchId, dateFrom, dateTo, groupBy = 'day', page = 1, limit = 50 }) {
    // Validate required parameters
    if (!merchantId) {
      throw new AppError('merchantId is required for profitability report', 400);
    }
    if (!dateFrom || !dateTo) {
      throw new AppError('dateFrom and dateTo are required', 400);
    }

    // Build base match stage (ALWAYS start with merchant for tenant isolation)
    const matchStage = {
      merchant: new mongoose.Types.ObjectId(merchantId),
      paymentStatus: 'paid', // Only include paid orders for profitability
      placedAt: { 
        $gte: new Date(dateFrom), 
        $lte: new Date(dateTo) 
      }
    };

    // Conditionally add branch filter if provided
    if (branchId) {
      matchStage.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Summary aggregation - compute profitability metrics
    const summaryPipeline = [
      { $match: matchStage },
      { $unwind: '$items' }, // Expand items array to calculate per-item COGS
      {
        $group: {
          _id: null,
          // Calculate total COGS from items with unitCost
          totalCOGS: { 
            $sum: { 
              $cond: [
                { $ne: ['$items.unitCost', null] },
                { $multiply: ['$items.unitCost', '$items.quantity'] },
                0
              ]
            }
          },
          // Count items without cost data
          itemsWithoutCost: {
            $sum: {
              $cond: [{ $eq: ['$items.unitCost', null] }, 1, 0]
            }
          },
          // Calculate total revenue
          totalRevenue: { $sum: '$totalAmount' },
          totalDiscounts: { $sum: '$discountAmount' },
          totalTaxes: { $sum: '$taxAmount' },
          // Collect items with margins for low-margin analysis
          itemMargins: {
            $push: {
              $cond: [
                { $ne: ['$items.unitCost', null] },
                {
                  menuItemId: '$items.menuItem',
                  revenue: { $multiply: ['$items.unitPrice', '$items.quantity'] },
                  cost: { $multiply: ['$items.unitCost', '$items.quantity'] },
                  margin: {
                    $cond: [
                      { $gt: ['$items.unitPrice', 0] },
                      {
                        $multiply: [
                          {
                            $divide: [
                              { $subtract: ['$items.unitPrice', '$items.unitCost'] },
                              '$items.unitPrice'
                            ]
                          },
                          100
                        ]
                      },
                      0
                    ]
                  }
                },
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalCOGS: { $round: ['$totalCOGS', 2] },
          itemsWithoutCost: 1,
          grossRevenue: { $round: ['$totalRevenue', 2] },
          totalDiscounts: { $round: ['$totalDiscounts', 2] },
          totalTaxes: { $round: ['$totalTaxes', 2] },
          netRevenue: {
            $round: [
              {
                $subtract: [
                  { $subtract: ['$totalRevenue', '$totalDiscounts'] },
                  '$totalTaxes'
                ]
              },
              2
            ]
          },
          grossProfit: {
            $round: [
              {
                $subtract: [
                  {
                    $subtract: [
                      { $subtract: ['$totalRevenue', '$totalDiscounts'] },
                      '$totalTaxes'
                    ]
                  },
                  '$totalCOGS'
                ]
              },
              2
            ]
          },
          grossMarginPercentage: {
            $cond: [
              {
                $gt: [
                  { $subtract: [{ $subtract: ['$totalRevenue', '$totalDiscounts'] }, '$totalTaxes'] },
                  0
                ]
              },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          {
                            $subtract: [
                              { $subtract: [{ $subtract: ['$totalRevenue', '$totalDiscounts'] }, '$totalTaxes'] },
                              '$totalCOGS'
                            ]
                          },
                          { $subtract: [{ $subtract: ['$totalRevenue', '$totalDiscounts'] }, '$totalTaxes'] }
                        ]
                      },
                      100
                    ]
                  },
                  2
                ]
              },
              0
            ]
          },
          itemMargins: 1
        }
      }
    ];

    // Breakdown aggregation - profitability trends over time
    const groupByExpression = this.buildGroupByExpression(groupBy);
    
    const breakdownPipeline = [
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: groupByExpression,
          totalCOGS: { 
            $sum: { 
              $cond: [
                { $ne: ['$items.unitCost', null] },
                { $multiply: ['$items.unitCost', '$items.quantity'] },
                0
              ]
            }
          },
          totalRevenue: { $sum: '$totalAmount' },
          totalDiscounts: { $sum: '$discountAmount' },
          totalTaxes: { $sum: '$taxAmount' },
          itemsWithoutCost: {
            $sum: {
              $cond: [{ $eq: ['$items.unitCost', null] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          totalCOGS: { $round: ['$totalCOGS', 2] },
          netRevenue: {
            $round: [
              {
                $subtract: [
                  { $subtract: ['$totalRevenue', '$totalDiscounts'] },
                  '$totalTaxes'
                ]
              },
              2
            ]
          },
          grossProfit: {
            $round: [
              {
                $subtract: [
                  {
                    $subtract: [
                      { $subtract: ['$totalRevenue', '$totalDiscounts'] },
                      '$totalTaxes'
                    ]
                  },
                  '$totalCOGS'
                ]
              },
              2
            ]
          },
          grossMarginPercentage: {
            $cond: [
              {
                $gt: [
                  { $subtract: [{ $subtract: ['$totalRevenue', '$totalDiscounts'] }, '$totalTaxes'] },
                  0
                ]
              },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          {
                            $subtract: [
                              { $subtract: [{ $subtract: ['$totalRevenue', '$totalDiscounts'] }, '$totalTaxes'] },
                              '$totalCOGS'
                            ]
                          },
                          { $subtract: [{ $subtract: ['$totalRevenue', '$totalDiscounts'] }, '$totalTaxes'] }
                        ]
                      },
                      100
                    ]
                  },
                  2
                ]
              },
              0
            ]
          },
          itemsWithoutCost: 1
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
    let summaryResult, breakdownResult, totalCount, lowMarginItems;
    try {
      [summaryResult, breakdownResult, totalCount, lowMarginItems] = await Promise.all([
        Promise.race([Order.aggregate(summaryPipeline), createTimeoutPromise()]),
        Promise.race([Order.aggregate(breakdownPipeline), createTimeoutPromise()]),
        Promise.race([this.countBreakdownRows(matchStage, groupByExpression), createTimeoutPromise()]),
        Promise.race([this.findLowMarginItems(matchStage, 20), createTimeoutPromise()]) // 20% margin threshold
      ]);
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }

    // Process summary results
    const summary = this.processSummaryResult(summaryResult, lowMarginItems);

    // Generate warnings if items lack cost data
    const warnings = [];
    if (summary.itemsWithoutCost > 0) {
      warnings.push({
        code: 'INCOMPLETE_COGS_DATA',
        message: `${summary.itemsWithoutCost} order items have no cost data. Profitability metrics are underestimated.`,
        recommendation: 'Ensure menu items have recipes with ingredient costs defined.'
      });
    }

    return {
      summary,
      breakdown: breakdownResult || [],
      warnings,
      page: parseInt(page),
      pages: Math.ceil(totalCount / limit),
      total: totalCount
    };
  }

  /**
   * Find items with margins below threshold
   * @param {Object} matchStage - MongoDB match criteria
   * @param {number} marginThreshold - Margin percentage threshold (default: 20%)
   * @returns {Promise<Array>} Items with low margins
   */
  static async findLowMarginItems(matchStage, marginThreshold = 20) {
    const pipeline = [
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $match: {
          'items.unitCost': { $ne: null }
        }
      },
      {
        $group: {
          _id: '$items.menuItem',
          totalRevenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
          totalCost: { $sum: { $multiply: ['$items.unitCost', '$items.quantity'] } },
          totalQuantity: { $sum: '$items.quantity' }
        }
      },
      {
        $project: {
          menuItemId: '$_id',
          totalRevenue: 1,
          totalCost: 1,
          totalQuantity: 1,
          margin: {
            $cond: [
              { $gt: ['$totalRevenue', 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: ['$totalRevenue', '$totalCost'] },
                      '$totalRevenue'
                    ]
                  },
                  100
                ]
              },
              0
            ]
          }
        }
      },
      {
        $match: {
          margin: { $lt: marginThreshold }
        }
      },
      { $sort: { margin: 1 } },
      { $limit: 10 }
    ];

    // Note: Timeout protection is applied at the caller level in generate() method
    return await Order.aggregate(pipeline);
  }

  /**
   * Process summary result to extract profitability metrics
   * @param {Array} summaryResult - Aggregation result from summary pipeline
   * @param {Array} lowMarginItems - Items with low margins
   * @returns {Object} Processed summary with profitability statistics
   */
  static processSummaryResult(summaryResult, lowMarginItems) {
    if (!summaryResult || summaryResult.length === 0) {
      return this.getEmptySummary();
    }

    const result = summaryResult[0];

    return {
      totalCOGS: result.totalCOGS || 0,
      grossRevenue: result.grossRevenue || 0,
      totalDiscounts: result.totalDiscounts || 0,
      totalTaxes: result.totalTaxes || 0,
      netRevenue: result.netRevenue || 0,
      grossProfit: result.grossProfit || 0,
      grossMarginPercentage: result.grossMarginPercentage || 0,
      itemsWithoutCost: result.itemsWithoutCost || 0,
      lowMarginItems: lowMarginItems.map(item => ({
        menuItemId: item.menuItemId,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        totalCost: Math.round(item.totalCost * 100) / 100,
        margin: Math.round(item.margin * 100) / 100,
        totalQuantity: item.totalQuantity
      }))
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
    
    // Note: Timeout protection is applied at the caller level in generate() method
    const result = await Order.aggregate(countPipeline);
    return result[0]?.total || 0;
  }

  /**
   * Return empty summary object when no data exists
   * @returns {Object} Empty summary with zero values
   */
  static getEmptySummary() {
    return {
      totalCOGS: 0,
      grossRevenue: 0,
      totalDiscounts: 0,
      totalTaxes: 0,
      netRevenue: 0,
      grossProfit: 0,
      grossMarginPercentage: 0,
      itemsWithoutCost: 0,
      lowMarginItems: []
    };
  }
}

module.exports = { ProfitabilityReportService };
