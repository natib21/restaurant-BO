const mongoose = require('mongoose');
const Ingredient = require('../../../../models/Ingredient');
const StockMovement = require('../../../../models/StockMovement');
const AppError = require('../../../../utils/appError');

/**
 * Inventory Report Service
 * Generates comprehensive inventory analytics through MongoDB aggregation pipelines.
 * Provides insights on stock valuation, low stock items, and stock movements.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */
class InventoryReportService {
  /**
   * Generate inventory report with summary and breakdown data
   * @param {Object} params - Report parameters
   * @param {string} params.merchantId - Merchant ObjectId (required for tenant isolation)
   * @param {string} params.branchId - Optional branch ObjectId filter (Note: Ingredients are merchant-scoped, not branch-scoped)
   * @param {Date} params.dateFrom - Start date (inclusive) - used for stock movements
   * @param {Date} params.dateTo - End date (inclusive) - used for stock movements
   * @param {string} params.groupBy - Time bucket: 'day', 'week', or 'month'
   * @param {number} params.page - Page number for breakdown pagination (default: 1)
   * @param {number} params.limit - Items per page for breakdown (default: 50)
   * @returns {Promise<Object>} Report data with summary, breakdown, and pagination meta
   */
  static async generate({ merchantId, branchId, dateFrom, dateTo, groupBy = 'day', page = 1, limit = 50 }) {
    // Validate required parameters
    if (!merchantId) {
      throw new AppError('merchantId is required for inventory report', 400);
    }
    if (!dateFrom || !dateTo) {
      throw new AppError('dateFrom and dateTo are required', 400);
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

    // Get current stock valuation and low stock items with timeout protection
    let stockValuation, lowStockItems, movements, breakdownResult, totalCount;
    try {
      [stockValuation, lowStockItems, movements] = await Promise.all([
        Promise.race([this.calculateStockValuation(merchantId), createTimeoutPromise()]),
        Promise.race([this.getLowStockItems(merchantId), createTimeoutPromise()]),
        Promise.race([this.getStockMovements(merchantId, dateFrom, dateTo), createTimeoutPromise()])
      ]);
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }

    // Get breakdown over time with timeout protection
    try {
      [breakdownResult, totalCount] = await Promise.all([
        Promise.race([this.getInventoryBreakdown(merchantId, dateFrom, dateTo, groupBy, page, limit), createTimeoutPromise()]),
        Promise.race([this.countBreakdownRows(merchantId, dateFrom, dateTo, groupBy), createTimeoutPromise()])
      ]);
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }

    // Build summary
    const summary = {
      totalStockValue: Math.round(stockValuation.totalValue * 100) / 100,
      totalItems: stockValuation.itemCount,
      lowStockItemCount: lowStockItems.length,
      lowStockItems: lowStockItems.slice(0, 20).map(item => ({
        ingredientId: item._id,
        name: item.name,
        currentStock: item.currentStock,
        minStock: item.minStock,
        unit: item.unit,
        stockValue: Math.round(item.stockValue * 100) / 100
      })),
      movements: {
        totalInbound: Math.round(movements.inbound * 100) / 100,
        totalOutbound: Math.round(movements.outbound * 100) / 100,
        netChange: Math.round((movements.inbound - movements.outbound) * 100) / 100,
        movementCount: movements.count
      },
      categoryBreakdown: stockValuation.byCategory || []
    };

    return {
      summary,
      breakdown: breakdownResult || [],
      page: parseInt(page),
      pages: Math.ceil(totalCount / limit),
      total: totalCount
    };
  }

  /**
   * Calculate total stock valuation
   * @param {string} merchantId - Merchant ObjectId
   * @returns {Promise<Object>} Stock valuation data
   */
  static async calculateStockValuation(merchantId) {
    const pipeline = [
      {
        $match: {
          merchant: new mongoose.Types.ObjectId(merchantId),
          isActive: true
        }
      },
      {
        $group: {
          _id: null,
          totalValue: {
            $sum: {
              $multiply: ['$currentStock', { $ifNull: ['$costPerUnit', 0] }]
            }
          },
          itemCount: { $sum: 1 },
          categories: {
            $push: {
              category: '$category',
              value: {
                $multiply: ['$currentStock', { $ifNull: ['$costPerUnit', 0] }]
              }
            }
          }
        }
      }
    ];

    // Note: Timeout protection is applied at the caller level in generate() method
    const result = await Ingredient.aggregate(pipeline);
    
    if (!result || result.length === 0) {
      return { totalValue: 0, itemCount: 0, byCategory: [] };
    }

    // Calculate category breakdown
    const categoryMap = {};
    result[0].categories.forEach(item => {
      if (!categoryMap[item.category]) {
        categoryMap[item.category] = 0;
      }
      categoryMap[item.category] += item.value;
    });

    const byCategory = Object.entries(categoryMap).map(([category, value]) => ({
      category,
      value: Math.round(value * 100) / 100
    }));

    return {
      totalValue: result[0].totalValue || 0,
      itemCount: result[0].itemCount || 0,
      byCategory
    };
  }

  /**
   * Get low stock items
   * @param {string} merchantId - Merchant ObjectId
   * @returns {Promise<Array>} Low stock items
   */
  static async getLowStockItems(merchantId) {
    // Note: Timeout protection is applied at the caller level in generate() method
    const items = await Ingredient.find({
      merchant: merchantId,
      isActive: true,
      $expr: { $lte: ['$currentStock', '$minStock'] }
    })
    .select('name currentStock minStock unit costPerUnit')
    .lean();

    return items.map(item => ({
      ...item,
      stockValue: (item.currentStock || 0) * (item.costPerUnit || 0)
    }));
  }

  /**
   * Get stock movements for date range
   * @param {string} merchantId - Merchant ObjectId
   * @param {Date} dateFrom - Start date
   * @param {Date} dateTo - End date
   * @returns {Promise<Object>} Movement summary
   */
  static async getStockMovements(merchantId, dateFrom, dateTo) {
    try {
      const pipeline = [
        {
          $match: {
            merchant: new mongoose.Types.ObjectId(merchantId),
            createdAt: {
              $gte: new Date(dateFrom),
              $lte: new Date(dateTo)
            }
          }
        },
        {
          $group: {
            _id: null,
            inbound: {
              $sum: {
                $cond: [
                  { $eq: ['$movementType', 'in'] },
                  { $multiply: ['$quantity', { $ifNull: ['$ingredient.costPerUnit', 0] }] },
                  0
                ]
              }
            },
            outbound: {
              $sum: {
                $cond: [
                  { $eq: ['$movementType', 'out'] },
                  { $multiply: ['$quantity', { $ifNull: ['$ingredient.costPerUnit', 0] }] },
                  0
                ]
              }
            },
            count: { $sum: 1 }
          }
        }
      ];

      // Note: Timeout protection is applied at the caller level in generate() method
      const result = await StockMovement.aggregate(pipeline);
      
      if (!result || result.length === 0) {
        return { inbound: 0, outbound: 0, count: 0 };
      }

      return result[0];
    } catch (error) {
      // If StockMovement collection doesn't exist or has issues, return zeros
      console.warn('StockMovement query failed:', error.message);
      return { inbound: 0, outbound: 0, count: 0 };
    }
  }

  /**
   * Get inventory valuation breakdown over time
   * @param {string} merchantId - Merchant ObjectId
   * @param {Date} dateFrom - Start date
   * @param {Date} dateTo - End date
   * @param {string} groupBy - Time bucket
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} Breakdown data
   */
  static async getInventoryBreakdown(merchantId, dateFrom, dateTo, groupBy, page, limit) {
    try {
      const groupByExpression = this.buildGroupByExpression(groupBy);
      
      const pipeline = [
        {
          $match: {
            merchant: new mongoose.Types.ObjectId(merchantId),
            createdAt: {
              $gte: new Date(dateFrom),
              $lte: new Date(dateTo)
            }
          }
        },
        {
          $group: {
            _id: groupByExpression,
            inboundMovements: {
              $sum: {
                $cond: [{ $eq: ['$movementType', 'in'] }, 1, 0]
              }
            },
            outboundMovements: {
              $sum: {
                $cond: [{ $eq: ['$movementType', 'out'] }, 1, 0]
              }
            },
            inboundValue: {
              $sum: {
                $cond: [
                  { $eq: ['$movementType', 'in'] },
                  { $multiply: ['$quantity', { $ifNull: ['$unitCost', 0] }] },
                  0
                ]
              }
            },
            outboundValue: {
              $sum: {
                $cond: [
                  { $eq: ['$movementType', 'out'] },
                  { $multiply: ['$quantity', { $ifNull: ['$unitCost', 0] }] },
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
            inboundMovements: 1,
            outboundMovements: 1,
            inboundValue: { $round: ['$inboundValue', 2] },
            outboundValue: { $round: ['$outboundValue', 2] },
            netValue: {
              $round: [
                { $subtract: ['$inboundValue', '$outboundValue'] },
                2
              ]
            }
          }
        },
        { $sort: { period: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit }
      ];

      // Note: Timeout protection is applied at the caller level in generate() method
      return await StockMovement.aggregate(pipeline);
    } catch (error) {
      console.warn('StockMovement breakdown failed:', error.message);
      return [];
    }
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
            date: '$createdAt' 
          } 
        };
      case 'week':
        return {
          $dateToString: {
            format: '%Y-W%V',
            date: '$createdAt'
          }
        };
      case 'month':
        return { 
          $dateToString: { 
            format: '%Y-%m', 
            date: '$createdAt' 
          } 
        };
      default:
        return { 
          $dateToString: { 
            format: '%Y-%m-%d', 
            date: '$createdAt' 
          } 
        };
    }
  }

  /**
   * Count total breakdown rows for pagination metadata
   * @param {string} merchantId - Merchant ObjectId
   * @param {Date} dateFrom - Start date
   * @param {Date} dateTo - End date
   * @param {string} groupBy - Time bucket
   * @returns {Promise<number>} Total row count
   */
  static async countBreakdownRows(merchantId, dateFrom, dateTo, groupBy) {
    try {
      const groupByExpression = this.buildGroupByExpression(groupBy);
      const countPipeline = [
        {
          $match: {
            merchant: new mongoose.Types.ObjectId(merchantId),
            createdAt: {
              $gte: new Date(dateFrom),
              $lte: new Date(dateTo)
            }
          }
        },
        { $group: { _id: groupByExpression } },
        { $count: 'total' }
      ];
      
      // Note: Timeout protection is applied at the caller level in generate() method
      const result = await StockMovement.aggregate(countPipeline);
      return result[0]?.total || 0;
    } catch (error) {
      console.warn('StockMovement count failed:', error.message);
      return 0;
    }
  }
}

module.exports = { InventoryReportService };
