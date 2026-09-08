const logger = require('../../../utils/logger');
const { BranchService } = require('./service/BranchService');
const Table = require('../../../models/tabelModel');
const Order = require('../../../models/orderModel');

let timer = null;

/**
 * Stuck Table Detection Scheduler
 * 
 * Safety net for the post-transaction table-freeing pattern.
 * Finds tables where:
 *   - status = 'occupied'
 *   - associated order has paymentStatus = 'paid' AND status = 'completed'
 * 
 * This indicates the post-transaction transitionTableStatus() call failed,
 * leaving the table stuck in 'occupied' even though the order is fully paid/complete.
 * 
 * Action: Auto-retry transitionTableStatus() to free the table.
 */
async function detectAndFixStuckTables() {
  try {
    // Find all occupied tables
    const occupiedTables = await Table.find({ status: 'occupied', isActive: true })
      .populate('merchant', '_id')
      .select('_id tableNumber status branch merchant')
      .lean();

    if (!occupiedTables.length) {
      logger.debug('stuck-tables.check.completed', { found: 0 });
      return { checked: 0, fixed: 0, failed: 0 };
    }

    let fixed = 0;
    let failed = 0;

    // For each occupied table, check if it's truly stuck:
    // 1. Table has an active dining session
    // 2. That session contains only paid+completed orders (no newer unpaid orders)
    // 3. No newer session has been created (current customer left, new one not seated yet)
    for (const table of occupiedTables) {
      try {
        const DiningSession = require('../../../models/DiningSession');
        
        // Step 1: Find the CURRENT (most recent) active session on this table
        const currentSession = await DiningSession.findOne({
          table: table._id,
          merchant: table.merchant._id,
          status: 'active'  // Session is still marked active (not closed by transitionTableStatus)
        })
          .sort({ createdAt: -1 })  // Most recent session first
          .select('_id createdAt')
          .lean();

        if (!currentSession) {
          // No active session for this occupied table - likely a data inconsistency
          logger.warn('stuck-tables.occupied_without_session', {
            tableId: table._id.toString(),
            tableNumber: table.tableNumber,
          });
          continue;
        }

        // Step 2: Find the MOST RECENT paid+completed order in this SPECIFIC session
        // (for multi-round sessions, grace period measures time since last activity)
        const completeOrder = await Order.findOne({
          session: currentSession._id,      // Must belong to THIS session
          paymentStatus: 'paid',
          status: 'completed'
        })
          .select('_id orderNumber completedAt')
          .sort({ completedAt: -1 })  // MOST RECENT first (not oldest)
          .lean();

        if (!completeOrder) {
          // This session has no paid+completed orders yet
          // (customer is still ordering or waiting for bill)
          continue;
        }

        // Step 3: Check if there are NEWER unpaid orders in this session
        // If there are, the table isn't stuck — current customer is still ordering
        const newerUnpaidOrder = await Order.findOne({
          session: currentSession._id,
          _id: { $ne: completeOrder._id },
          paymentStatus: { $nin: ['paid'] }  // Not yet paid (unpaid or refunded)
        })
          .select('_id')
          .lean();

        if (newerUnpaidOrder) {
          // Not stuck: newer unpaid order exists (current customer still here)
          continue;
        }

        // Step 4: Check if the completed order is old enough (not just completed)
        // Give it 5 minutes grace period before auto-freeing
        const completedMinutesAgo = (Date.now() - completeOrder.completedAt.getTime()) / (1000 * 60);
        if (completedMinutesAgo < 5) {
          // Order completed very recently, give it grace period before retrying
          continue;
        }

        // STUCK TABLE CONFIRMED: Occupied table with old paid+completed order, 
        // no newer unpaid orders, session still active (session close failed)
        logger.warn('stuck-tables.detected', {
          tableId: table._id.toString(),
          tableNumber: table.tableNumber,
          sessionId: currentSession._id.toString(),
          orderId: completeOrder._id.toString(),
          orderNumber: completeOrder.orderNumber,
          completedMinutesAgo: Math.round(completedMinutesAgo),
        });

        try {
          await BranchService.transitionTableStatus({
            tableId: table._id,
            merchantId: table.merchant._id,
            branchId: table.branch,
            toStatus: 'available'
          });

          fixed++;

          logger.info('stuck-tables.auto_fixed', {
            tableId: table._id.toString(),
            tableNumber: table.tableNumber,
            sessionId: currentSession._id.toString(),
            orderId: completeOrder._id.toString(),
          });
        } catch (transitionError) {
          failed++;

          logger.error('stuck-tables.auto_fix_failed', {
            tableId: table._id.toString(),
            tableNumber: table.tableNumber,
            sessionId: currentSession._id.toString(),
            orderId: completeOrder._id.toString(),
            error: transitionError.message,
          });
        }
      } catch (checkError) {
        logger.error('stuck-tables.check_failed', {
          tableId: table._id.toString(),
          error: checkError.message,
        });
      }
    }

    const logLevel = failed > 0 ? 'warn' : 'info';
    logger[logLevel]('stuck-tables.check.completed', {
      checked: occupiedTables.length,
      fixed,
      failed,
    });

    return { checked: occupiedTables.length, fixed, failed };
  } catch (error) {
    logger.error('stuck-tables.cron.failed', { error: error.message });
    return { checked: 0, fixed: 0, failed: 0 };
  }
}

function startStuckTableScheduler() {
  if (process.env.STUCK_TABLE_CRON_ENABLED !== 'true') {
    logger.debug('stuck-tables.scheduler.disabled');
    return null;
  }

  // Default to every 5 minutes
  const intervalMs = Number(process.env.STUCK_TABLE_CRON_INTERVAL_MS) || 5 * 60 * 1000;

  const run = async () => {
    try {
      await detectAndFixStuckTables();
    } catch (error) {
      logger.error('stuck-tables.cron.error', { error: error.message });
    }
  };

  timer = setInterval(run, intervalMs);
  
  // Allow process to exit even if this timer is still running
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  logger.info('stuck-tables.scheduler.started', { intervalMs });
  return { stop: () => clearInterval(timer) };
}

function stopStuckTableScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  logger.debug('stuck-tables.scheduler.stopped');
}

/**
 * Get current stuck table status for health checks or monitoring
 * Called by staff dashboard or health check endpoint
 * 
 * Returns tables that are occupied with old completed orders but no newer unpaid orders
 */
async function getStuckTableStatus() {
  try {
    const DiningSession = require('../../../models/DiningSession');
    
    const occupiedTables = await Table.countDocuments({ status: 'occupied', isActive: true });
    
    if (occupiedTables === 0) {
      return {
        totalOccupied: 0,
        stuckCount: 0,
        stuckTables: [],
      };
    }
    
    // Find stuck tables: occupied tables with active sessions that have old paid+completed orders
    // but no newer unpaid orders (indicating session close failed)
    const stuckTables = [];
    
    const tables = await Table.find({ status: 'occupied', isActive: true })
      .select('_id tableNumber merchant branch')
      .lean();
    
    for (const table of tables) {
      try {
        // Find the current active session for this table
        const currentSession = await DiningSession.findOne({
          table: table._id,
          status: 'active'
        })
          .sort({ createdAt: -1 })
          .select('_id')
          .lean();
        
        if (!currentSession) continue;
        
        // Find the most recent paid+completed order in this session
        // (grace period measures time since last activity, not first order)
        const completedOrder = await Order.findOne({
          session: currentSession._id,
          paymentStatus: 'paid',
          status: 'completed'
        })
          .select('_id orderNumber completedAt')
          .sort({ completedAt: -1 })  // MOST RECENT first
          .lean();
        
        if (!completedOrder) continue;
        
        // Check if there are newer unpaid orders
        const newerUnpaidOrder = await Order.findOne({
          session: currentSession._id,
          _id: { $ne: completedOrder._id },
          paymentStatus: { $nin: ['paid'] }
        })
          .select('_id')
          .lean();
        
        if (newerUnpaidOrder) continue;  // Not stuck, current customer still ordering
        
        // Check if completed order is old enough (grace period)
        const completedMinutesAgo = (Date.now() - completedOrder.completedAt.getTime()) / (1000 * 60);
        if (completedMinutesAgo < 5) continue;  // Too recent, skip
        
        // This is a stuck table
        stuckTables.push({
          tableId: table._id.toString(),
          tableNumber: table.tableNumber,
          orderId: completedOrder._id.toString(),
          orderNumber: completedOrder.orderNumber,
          completedMinutesAgo: Math.round(completedMinutesAgo),
        });
      } catch (err) {
        // Log but don't fail the entire status check
        logger.warn('stuck-tables.status_check_table_failed', {
          tableId: table._id.toString(),
          error: err.message,
        });
      }
    }

    return {
      totalOccupied: occupiedTables,
      stuckCount: stuckTables.length,
      stuckTables,
    };
  } catch (error) {
    logger.error('stuck-tables.status.failed', { error: error.message });
    return {
      totalOccupied: 0,
      stuckCount: 0,
      stuckTables: [],
      error: error.message,
    };
  }
}

module.exports = {
  startStuckTableScheduler,
  stopStuckTableScheduler,
  detectAndFixStuckTables,
  getStuckTableStatus,
};
