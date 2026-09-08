const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');

/**
 * Products Report Service
 * Generates product performance analytics through MongoDB aggregation pipelines.
 * Unwinding order items to analyze menu item sales, revenue, and performance trends.
 */
class ProductsReportService {
  /**
   * Generate products report with summary and breakdown data
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
      throw new AppError('merchantId is required for products report', 400);
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

    // Summary aggregation pipeline (item performance metrics)
    const summaryPipeline = [
      { $match: matchStage },
      { $unwind: '$items' }, // Expand items array to individual documents
      {
        $group: {
          _id: '$items.menuItem',
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.totalPrice' },
          orderCount: { $sum: 1 } // Count how many orders this item appeared in
        }
      },
      {
        $lookup: {
          from: 'menus', // Menu collection name
          localField: '_id',
          foreignField: '_id',
          as: 'menuDetails'
        }
      },
      { $unwind: { path: '$menuDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          menuItemId: '$_id',
          menuItemName: '$menuDetails.name',
          category: '$menuDetails.category',
          quantitySold: 1,
          revenue: 1,
          orderCount: 1
        }
      },
      { $sort: { quantitySold: -1 } } // Sort by quantity for top sellers
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

    // Execute summary pipeline with timeout protection
    let itemsResult;
    try {
      itemsResult = await Promise.race([
        Order.aggregate(summaryPipeline),
        createTimeoutPromise()
      ]);
    } catch (error) {
      if (error.statusCode === 503) {
        throw error; // Re-throw timeout errors as-is
      }
      throw error;
    }

    // Compute summary metrics from items result
    const summary = this.computeSummary(itemsResult);

    // Build groupBy expression for time-series aggregation
    const groupByExpression = this.buildGroupByExpression(groupBy);

    // Breakdown aggregation pipeline (item performance trends over time)
    const breakdownPipeline = [
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            period: groupByExpression,
            menuItem: '$items.menuItem'
          },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.totalPrice' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'menus',
          localField: '_id.menuItem',
          foreignField: '_id',
          as: 'menuDetails'
        }
      },
      { $unwind: { path: '$menuDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          menuItemId: '$_id.menuItem',
          menuItemName: '$menuDetails.name',
          category: '$menuDetails.category',
          quantitySold: 1,
          revenue: 1,
          orderCount: 1
        }
      },
      { $sort: { period: -1, quantitySold: -1 } }, // Most recent periods first, top sellers within each period
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];

    // Execute breakdown and count pipelines concurrently with timeout protection
    let breakdownResult, totalCount;
    try {
      [breakdownResult, totalCount] = await Promise.all([
        Promise.race([Order.aggregate(breakdownPipeline), createTimeoutPromise()]),
        Promise.race([this.countBreakdownRows(matchStage, groupByExpression), createTimeoutPromise()])
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
   * Compute summary metrics from aggregated items data
   * @param {Array} itemsResult - Array of item performance objects
   * @returns {Object} Summary object with computed metrics
   */
  static computeSummary(itemsResult) {
    if (!itemsResult || itemsResult.length === 0) {
      return this.getEmptySummary();
    }

    // Calculate total metrics
    const totalItemsSold = itemsResult.reduce((sum, item) => sum + item.quantitySold, 0);
    const totalItemRevenue = itemsResult.reduce((sum, item) => sum + item.revenue, 0);

    // Identify top sellers (top 10)
    const topItems = itemsResult.slice(0, 10).map(item => ({
      menuItemId: item.menuItemId,
      name: item.menuItemName || 'Unknown Item',
      category: item.category || 'Uncategorized',
      quantitySold: item.quantitySold,
      revenue: item.revenue
    }));

    // Identify low performers (bottom 10)
    // Note: Bottom performers are the last items when sorted by quantity descending
    const lowPerformers = itemsResult.slice(-10).reverse().map(item => ({
      menuItemId: item.menuItemId,
      name: item.menuItemName || 'Unknown Item',
      category: item.category || 'Uncategorized',
      quantitySold: item.quantitySold,
      revenue: item.revenue
    }));

    // Aggregate by category
    const categoryBreakdown = {};
    itemsResult.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = {
          quantitySold: 0,
          revenue: 0,
          itemCount: 0
        };
      }
      categoryBreakdown[category].quantitySold += item.quantitySold;
      categoryBreakdown[category].revenue += item.revenue;
      categoryBreakdown[category].itemCount += 1;
    });

    // Calculate low performer threshold (bottom 20% by quantity)
    const sortedQuantities = itemsResult.map(item => item.quantitySold).sort((a, b) => a - b);
    const threshold20Percent = Math.ceil(sortedQuantities.length * 0.2);
    const lowPerformerThreshold = threshold20Percent > 0 
      ? sortedQuantities[threshold20Percent - 1] 
      : 0;

    return {
      totalItemsSold,
      totalItemRevenue,
      uniqueItemsCount: itemsResult.length,
      topItems,
      lowPerformers,
      lowPerformerThreshold,
      categoryBreakdown
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
      { $unwind: '$items' },
      { 
        $group: { 
          _id: {
            period: groupByExpression,
            menuItem: '$items.menuItem'
          }
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
      totalItemsSold: 0,
      totalItemRevenue: 0,
      uniqueItemsCount: 0,
      topItems: [],
      lowPerformers: [],
      lowPerformerThreshold: 0,
      categoryBreakdown: {}
    };
  }
}

module.exports = { ProductsReportService };
