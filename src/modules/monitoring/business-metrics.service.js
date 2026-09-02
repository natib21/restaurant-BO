/**
 * @file src/modules/monitoring/business-metrics.service.js
 * @description Business metrics tracking - restaurant KPIs and analytics
 * 
 * Metrics tracked:
 * - Orders: count, revenue, average order value
 * - Customers: active, new, retention
 * - Inventory: stock levels, low stock alerts
 * - Tables: occupancy rate, turnover time
 * - Staff: active users, order processing time
 * - Payment: success rate, failed transactions
 */

const Order = require('../../../models/orderModel');
const Merchant = require('../../../models/merchantModel');
const Table = require('../../../models/tabelModel');
const CustomerSession = require('../../../models/customerSessionModule');
const logger = require('../../../utils/logger');

class BusinessMetricsService {
  /**
   * Get real-time dashboard metrics for a merchant
   * @param {string} merchantId - Merchant ID
   * @param {string} branchId - Optional branch filter
   * @returns {Promise<Object>} Dashboard metrics
   */
  static async getDashboardMetrics(merchantId, branchId = null) {
    try {
      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0));
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(todayStart);
      monthStart.setMonth(monthStart.getMonth() - 1);

      const baseQuery = branchId 
        ? { merchant: merchantId, branch: branchId }
        : { merchant: merchantId };

      // Orders metrics
      const [todayOrders, yesterdayOrders, weekOrders, monthOrders] = await Promise.all([
        Order.countDocuments({ ...baseQuery, createdAt: { $gte: todayStart } }),
        Order.countDocuments({ ...baseQuery, createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
        Order.countDocuments({ ...baseQuery, createdAt: { $gte: weekStart } }),
        Order.countDocuments({ ...baseQuery, createdAt: { $gte: monthStart } }),
      ]);

      // Revenue metrics
      const [todayRevenue, weekRevenue, monthRevenue] = await Promise.all([
        Order.aggregate([
          { $match: { ...baseQuery, createdAt: { $gte: todayStart }, paymentStatus: 'completed' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]),
        Order.aggregate([
          { $match: { ...baseQuery, createdAt: { $gte: weekStart }, paymentStatus: 'completed' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]),
        Order.aggregate([
          { $match: { ...baseQuery, createdAt: { $gte: monthStart }, paymentStatus: 'completed' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]),
      ]);

      // Active sessions (customers currently dining)
      const activeSessions = await CustomerSession.countDocuments({
        merchant: merchantId,
        ...(branchId && { branch: branchId }),
        isActive: true,
        expiresAt: { $gt: now },
      });

      // Table occupancy
      const tables = await Table.find({
        merchant: merchantId,
        ...(branchId && { branch: branchId }),
        isActive: true,
      }).select('status');

      const occupiedTables = tables.filter(t => t.status === 'occupied').length;
      const occupancyRate = tables.length > 0 
        ? ((occupiedTables / tables.length) * 100).toFixed(1)
        : 0;

      // Order status breakdown (today)
      const orderStatusBreakdown = await Order.aggregate([
        { $match: { ...baseQuery, createdAt: { $gte: todayStart } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      // Average order value
      const avgOrderValue = todayOrders > 0 && todayRevenue[0]
        ? (todayRevenue[0].total / todayOrders).toFixed(2)
        : 0;

      // Order trends (last 7 days)
      const orderTrends = await Order.aggregate([
        {
          $match: {
            ...baseQuery,
            createdAt: { $gte: weekStart },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
            revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'completed'] }, '$totalAmount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return {
        timestamp: new Date().toISOString(),
        period: {
          today: todayStart.toISOString(),
          week: weekStart.toISOString(),
          month: monthStart.toISOString(),
        },
        orders: {
          today: todayOrders,
          yesterday: yesterdayOrders,
          week: weekOrders,
          month: monthOrders,
          change_from_yesterday: yesterdayOrders > 0
            ? (((todayOrders - yesterdayOrders) / yesterdayOrders) * 100).toFixed(1) + '%'
            : 'N/A',
          by_status: orderStatusBreakdown.reduce((acc, { _id, count }) => {
            acc[_id] = count;
            return acc;
          }, {}),
        },
        revenue: {
          today: todayRevenue[0]?.total || 0,
          week: weekRevenue[0]?.total || 0,
          month: monthRevenue[0]?.total || 0,
          average_order_value: avgOrderValue,
        },
        customers: {
          active_sessions: activeSessions,
        },
        tables: {
          total: tables.length,
          occupied: occupiedTables,
          available: tables.length - occupiedTables,
          occupancy_rate: occupancyRate + '%',
        },
        trends: {
          daily_orders: orderTrends,
        },
      };
    } catch (error) {
      logger.error('business_metrics.dashboard.failed', {
        merchantId,
        branchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get system-wide metrics (for admin/platform monitoring)
   * @returns {Promise<Object>} Platform metrics
   */
  static async getPlatformMetrics() {
    try {
      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0));

      const [
        totalMerchants,
        activeMerchants,
        totalOrders,
        todayOrders,
        totalRevenue,
      ] = await Promise.all([
        Merchant.countDocuments(),
        Merchant.countDocuments({ isActive: true }),
        Order.countDocuments(),
        Order.countDocuments({ createdAt: { $gte: todayStart } }),
        Order.aggregate([
          { $match: { paymentStatus: 'completed' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]),
      ]);

      // Top merchants by order volume (today)
      const topMerchants = await Order.aggregate([
        { $match: { createdAt: { $gte: todayStart } } },
        { $group: { _id: '$merchant', orders: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
        { $sort: { orders: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'merchants',
            localField: '_id',
            foreignField: '_id',
            as: 'merchant',
          },
        },
        { $unwind: '$merchant' },
        {
          $project: {
            merchant_name: '$merchant.businessName',
            orders: 1,
            revenue: 1,
          },
        },
      ]);

      return {
        timestamp: new Date().toISOString(),
        merchants: {
          total: totalMerchants,
          active: activeMerchants,
          inactive: totalMerchants - activeMerchants,
        },
        orders: {
          total: totalOrders,
          today: todayOrders,
        },
        revenue: {
          total: totalRevenue[0]?.total || 0,
        },
        top_merchants_today: topMerchants,
      };
    } catch (error) {
      logger.error('business_metrics.platform.failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get performance metrics for specific time range
   * @param {string} merchantId - Merchant ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Performance metrics
   */
  static async getPerformanceMetrics(merchantId, startDate, endDate) {
    try {
      const baseQuery = {
        merchant: merchantId,
        createdAt: { $gte: startDate, $lte: endDate },
      };

      // Order processing time (created → completed)
      const processingTimes = await Order.aggregate([
        {
          $match: {
            ...baseQuery,
            status: 'completed',
            completedAt: { $exists: true },
          },
        },
        {
          $project: {
            processing_time_minutes: {
              $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 60000],
            },
          },
        },
        {
          $group: {
            _id: null,
            avg: { $avg: '$processing_time_minutes' },
            min: { $min: '$processing_time_minutes' },
            max: { $max: '$processing_time_minutes' },
          },
        },
      ]);

      // Payment success rate
      const paymentStats = await Order.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: '$paymentStatus',
            count: { $sum: 1 },
          },
        },
      ]);

      const totalPayments = paymentStats.reduce((sum, s) => sum + s.count, 0);
      const successfulPayments = paymentStats.find(s => s._id === 'completed')?.count || 0;
      const paymentSuccessRate = totalPayments > 0
        ? ((successfulPayments / totalPayments) * 100).toFixed(2)
        : 0;

      // Peak hours (order distribution by hour)
      const peakHours = await Order.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { orders: -1 } },
        { $limit: 5 },
      ]);

      return {
        timestamp: new Date().toISOString(),
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        order_processing: {
          avg_minutes: processingTimes[0]?.avg?.toFixed(1) || 0,
          min_minutes: processingTimes[0]?.min?.toFixed(1) || 0,
          max_minutes: processingTimes[0]?.max?.toFixed(1) || 0,
        },
        payment: {
          success_rate: paymentSuccessRate + '%',
          breakdown: paymentStats,
        },
        peak_hours: peakHours.map(h => ({
          hour: `${h._id}:00`,
          orders: h.orders,
        })),
      };
    } catch (error) {
      logger.error('business_metrics.performance.failed', {
        merchantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get alerts for critical business conditions
   * @param {string} merchantId - Merchant ID
   * @returns {Promise<Object>} Alerts
   */
  static async getAlerts(merchantId) {
    const alerts = [];

    try {
      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0));

      // Check for low order volume
      const todayOrders = await Order.countDocuments({
        merchant: merchantId,
        createdAt: { $gte: todayStart },
      });

      if (todayOrders < 5 && new Date().getHours() > 12) {
        alerts.push({
          severity: 'warning',
          type: 'low_order_volume',
          message: `Only ${todayOrders} orders today (expected >5 by noon)`,
          timestamp: new Date().toISOString(),
        });
      }

      // Check for high error rate in orders
      const failedOrders = await Order.countDocuments({
        merchant: merchantId,
        createdAt: { $gte: todayStart },
        status: 'failed',
      });

      if (failedOrders > 0 && todayOrders > 0) {
        const errorRate = (failedOrders / todayOrders) * 100;
        if (errorRate > 10) {
          alerts.push({
            severity: 'critical',
            type: 'high_order_failure_rate',
            message: `${errorRate.toFixed(1)}% of orders failed today`,
            details: { failed: failedOrders, total: todayOrders },
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Check for pending payment verifications
      const pendingPayments = await Order.countDocuments({
        merchant: merchantId,
        paymentStatus: 'pending',
        createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) }, // Older than 30 min
      });

      if (pendingPayments > 0) {
        alerts.push({
          severity: 'warning',
          type: 'pending_payments',
          message: `${pendingPayments} payments pending for >30 minutes`,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        timestamp: new Date().toISOString(),
        alerts,
        alert_count: alerts.length,
      };
    } catch (error) {
      logger.error('business_metrics.alerts.failed', {
        merchantId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = BusinessMetricsService;
