/**
 * SessionService
 * 
 * Centralized service for managing dining sessions (table visits).
 * Used by both QR order flow and staff order flow.
 * 
 * Key Methods:
 * - getOrCreateActiveSession() - Core method used by both QR and staff flows
 * - getActiveSession() - Query active session for a table
 * - endSession() - Close a dining session (staff closes table)
 * - getSessionOrders() - Get all orders for a session
 * - validateTableForOrders() - Pre-check before order creation
 */

const DiningSession = require('../../../../models/DiningSession');
const Table = require('../../../../models/tabelModel');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');
const crypto = require('crypto');
const logger = require('../../../../utils/logger');
const { getIo } = require('../../../infrastructure/websocket/socket-server');

class SessionService {
  /**
   * Get or create active session for a table (CORE METHOD)
   * 
   * This is the central method used by both QR and staff flows.
   * Ensures only one active session exists per table.
   * Handles race conditions with retry logic.
   * 
   * TRANSACTION SAFETY:
   * - If no session param provided, creates its own transaction
   * - Session creation + table status update are atomic (all-or-nothing)
   * - Prevents orphaned sessions if process crashes between writes
   * 
   * CONCURRENCY HANDLING:
   * - Automatically retries on transaction lock timeout (max 5 attempts)
   * - Uses exponential backoff between retries
   * - Falls back to non-transactional read on final retry
   * 
   * @param {Object} params
   * @param {ObjectId} params.tableId - Table ID
   * @param {ObjectId} [params.createdBy] - Staff user ID (null for QR)
   * @param {Object} [params.mongoSession] - Mongoose session for transactions (optional)
   * @param {number} [params._retryCount=0] - Internal retry counter (do not use)
   * @returns {Promise<Object>} { session: DiningSession, isNew: boolean }
   */
  static async getOrCreateActiveSession({ tableId, createdBy = null, mongoSession = null, _retryCount = 0 }) {
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 10;
    
    // Determine if we need to manage transaction lifecycle
    const shouldManageTransaction = !mongoSession;
    let transactionSession = mongoSession;
    
    // Start new transaction if not provided
    if (shouldManageTransaction) {
      transactionSession = await DiningSession.startSession();
      await transactionSession.startTransaction();
    }
    
    try {
      // Validate table
      const table = await Table.findById(tableId).session(transactionSession);
      if (!table) {
        throw new AppError('Table not found', 404);
      }
      
      if (!table.isActive) {
        throw new AppError('Table is not available for use', 400);
      }
      
      // Try to find existing active session
      let existingSession = await DiningSession.findOne({
        table: tableId,
        status: 'active'
      }).session(transactionSession);
      
      if (existingSession) {
        // Commit transaction if we own it
        if (shouldManageTransaction) {
          await transactionSession.commitTransaction();
        }
        
        logger.info('session.reused', {
          sessionId: existingSession._id.toString(),
          tableId: tableId.toString(),
          tableNumber: table.tableNumber
        });
        
        return {
          session: existingSession,
          isNew: false
        };
      }
      
      // Create new session with race condition protection
      try {
        // ✅ TRANSACTION-SAFE: Both writes in same transaction
        const newSession = await DiningSession.create([{
          table: tableId,
          merchant: table.merchant,
          branch: table.branch,
          token: crypto.randomBytes(32).toString('hex'),
          status: 'active',
          startedAt: new Date(),
          createdBy: createdBy || null,
          metadata: {
            guestCount: null,
            notes: createdBy ? 'Staff-initiated session' : 'QR-initiated session'
          }
        }], { session: transactionSession });
        
        // ✅ Mark table as occupied (in same transaction)
        table.status = 'occupied';
        await table.save({ session: transactionSession, validateBeforeSave: false });
        
        // ✅ Commit transaction if we own it
        if (shouldManageTransaction) {
          await transactionSession.commitTransaction();
        }
        
        logger.info('session.created', {
          sessionId: newSession[0]._id.toString(),
          tableId: tableId.toString(),
          tableNumber: table.tableNumber,
          source: createdBy ? 'staff' : 'qr',
          createdBy: createdBy?.toString()
        });
        
        // ✅ Emit Socket.IO event for session creation
        try {
          const io = getIo();
          const branchId = table.branch.toString();
          
          const sessionEvent = {
            sessionId: newSession[0]._id.toString(),
            tableId: tableId.toString(),
            tableNumber: table.tableNumber,
            branchId: branchId,
            source: createdBy ? 'staff' : 'qr',
            startedAt: newSession[0].startedAt,
            createdBy: createdBy?.toString() || null
          };
          
          // Emit to branch staff with ORDER_VIEW permission
          io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('session:created', sessionEvent);
          io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('session:created', sessionEvent);
          
          logger.info('session.socket_emitted', {
            event: 'session:created',
            sessionId: newSession[0]._id.toString(),
            branchId
          });
        } catch (socketError) {
          // Don't fail the request if socket emission fails
          logger.warn('session.socket_emit_failed', {
            event: 'session:created',
            sessionId: newSession[0]._id.toString(),
            error: socketError.message
          });
        }
        
        return {
          session: newSession[0],
          isNew: true
        };
        
      } catch (error) {
        // Handle duplicate key error (race condition)
        if (error.code === 11000 && error.keyPattern && error.keyPattern.table) {
          // Rollback our transaction if we own it
          if (shouldManageTransaction) {
            await transactionSession.abortTransaction();
          }
          
          logger.warn('session.race_condition_detected', {
            tableId: tableId.toString(),
            error: 'Duplicate active session creation attempt'
          });
          
          // Another request created session, fetch it (outside transaction)
          const raceSession = await DiningSession.findOne({
            table: tableId,
            status: 'active'
          });
          
          if (raceSession) {
            logger.info('session.race_condition_resolved', {
              sessionId: raceSession._id.toString(),
              tableId: tableId.toString()
            });
            
            return {
              session: raceSession,
              isNew: false
            };
          }
          
          // Still no session? This shouldn't happen, but throw error
          throw new AppError('Failed to create or retrieve session', 500);
        }
        
        // Other errors, rollback and rethrow
        if (shouldManageTransaction) {
          await transactionSession.abortTransaction();
        }
        throw error;
      }
      
    } catch (error) {
      // Rollback transaction on any error if we own it
      if (shouldManageTransaction && transactionSession.inTransaction()) {
        await transactionSession.abortTransaction();
      }
      
      // ✅ CONCURRENCY FIX: Retry on transaction lock timeout
      const isLockTimeout = error.message && error.message.includes('Unable to acquire');
      const isTransactionConflict = error.message && error.message.includes('Please retry your operation');
      
      if ((isLockTimeout || isTransactionConflict) && _retryCount < MAX_RETRIES) {
        // Clean up current session
        if (shouldManageTransaction) {
          await transactionSession.endSession();
        }
        
        // Calculate exponential backoff delay with jitter
        const delay = BASE_DELAY_MS * Math.pow(2, _retryCount) + Math.random() * 10;
        
        logger.warn('session.transaction_retry', {
          tableId: tableId.toString(),
          retryCount: _retryCount + 1,
          maxRetries: MAX_RETRIES,
          delayMs: Math.round(delay),
          errorType: isLockTimeout ? 'lock_timeout' : 'transaction_conflict'
        });
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry with incremented counter
        return await this.getOrCreateActiveSession({
          tableId,
          createdBy,
          mongoSession: null, // Don't reuse aborted session
          _retryCount: _retryCount + 1
        });
      }
      
      // ✅ FALLBACK: On final retry, try non-transactional read
      if ((isLockTimeout || isTransactionConflict) && _retryCount === MAX_RETRIES) {
        logger.warn('session.final_retry_fallback', {
          tableId: tableId.toString(),
          message: 'Using non-transactional read as last resort'
        });
        
        // Try to fetch existing session without transaction
        const fallbackSession = await DiningSession.findOne({
          table: tableId,
          status: 'active'
        });
        
        if (fallbackSession) {
          logger.info('session.fallback_success', {
            sessionId: fallbackSession._id.toString(),
            tableId: tableId.toString()
          });
          
          return {
            session: fallbackSession,
            isNew: false
          };
        }
        
        // Still no session found - throw original error
        logger.error('session.all_retries_exhausted', {
          tableId: tableId.toString(),
          retries: MAX_RETRIES,
          error: error.message
        });
      }
      
      throw error;
      
    } finally {
      // Clean up session if we created it
      if (shouldManageTransaction) {
        await transactionSession.endSession();
      }
    }
  }
  
  /**
   * Get active session for a table
   * Returns null if no active session exists
   * 
   * @param {ObjectId} tableId
   * @param {Object} [session] - Mongoose session
   * @returns {Promise<DiningSession|null>}
   */
  static async getActiveSession(tableId, session = null) {
    return await DiningSession.findOne({
      table: tableId,
      status: 'active'
    }).session(session);
  }
  
  /**
   * End a dining session (close table)
   * 
   * TRANSACTION SAFETY:
   * - Session end + table status update are atomic
   * - Prevents orphaned states if process crashes
   * 
   * Validates:
   * - All orders are in terminal state (completed/canceled)
   * - OR payment requirements are met
   * 
   * @param {Object} params
   * @param {ObjectId} params.sessionId - Session ID to end
   * @param {ObjectId} params.closedBy - Staff user ID who closed session
   * @param {boolean} [params.force=false] - Force close even with unpaid orders
   * @param {Object} [params.mongoSession] - Mongoose session for transactions (optional)
   * @returns {Promise<DiningSession>}
   */
  static async endSession({ sessionId, closedBy, force = false, mongoSession = null }) {
    // Determine if we need to manage transaction lifecycle
    const shouldManageTransaction = !mongoSession;
    let transactionSession = mongoSession;
    
    // Start new transaction if not provided
    if (shouldManageTransaction) {
      transactionSession = await DiningSession.startSession();
      await transactionSession.startTransaction();
    }
    
    try {
      const diningSession = await DiningSession.findOne({
        _id: sessionId,
        status: 'active'
      }).session(transactionSession);
      
      if (!diningSession) {
        throw new AppError('Active session not found', 404);
      }
      
      // Check for unpaid orders (unless forced)
      if (!force) {
        const unpaidOrders = await Order.find({
          session: sessionId,
          paymentStatus: { $in: ['unpaid', 'partially_paid'] },
          status: { $nin: ['canceled'] }
        }).session(transactionSession);
        
        if (unpaidOrders.length > 0) {
          throw new AppError(
            `Cannot close session: ${unpaidOrders.length} unpaid order(s) remaining`,
            400,
            {
              code: 'UNPAID_ORDERS_EXIST',
              unpaidOrderIds: unpaidOrders.map(o => o._id.toString()),
              unpaidOrderNumbers: unpaidOrders.map(o => o.orderNumber),
              unpaidCount: unpaidOrders.length
            }
          );
        }
      }
      
      // ✅ End session (in transaction)
      diningSession.status = 'ended';
      diningSession.endedAt = new Date();
      await diningSession.save({ session: transactionSession });
      
      // ✅ Update table status (in same transaction)
      const table = await Table.findById(diningSession.table).session(transactionSession);
      if (table) {
        table.status = 'needs-cleaning';
        await table.save({ session: transactionSession, validateBeforeSave: false });
      }
      
      // ✅ Commit transaction if we own it
      if (shouldManageTransaction) {
        await transactionSession.commitTransaction();
      }
      
      logger.info('session.ended', {
        sessionId: diningSession._id.toString(),
        tableId: diningSession.table.toString(),
        closedBy: closedBy.toString(),
        duration: diningSession.getDurationFormatted(),
        forced: force
      });
      
      // ✅ Emit Socket.IO event for session ending
      try {
        const io = getIo();
        const branchId = diningSession.branch.toString();
        
        // Get session summary for the event
        const orders = await Order.find({ session: sessionId });
        
        const sessionEvent = {
          sessionId: diningSession._id.toString(),
          tableId: diningSession.table.toString(),
          branchId: branchId,
          endedAt: diningSession.endedAt,
          duration: diningSession.getDurationFormatted(),
          closedBy: closedBy.toString(),
          forced: force,
          summary: {
            orderCount: orders.length,
            totalAmount: orders.reduce((sum, o) => sum + o.totalAmount, 0),
            paidOrders: orders.filter(o => o.paymentStatus === 'paid').length,
            unpaidOrders: orders.filter(o => o.paymentStatus === 'unpaid').length
          }
        };
        
        // Emit to branch staff with ORDER_VIEW permission
        io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('session:ended', sessionEvent);
        io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('session:ended', sessionEvent);
        
        logger.info('session.socket_emitted', {
          event: 'session:ended',
          sessionId: diningSession._id.toString(),
          branchId
        });
      } catch (socketError) {
        // Don't fail the request if socket emission fails
        logger.warn('session.socket_emit_failed', {
          event: 'session:ended',
          sessionId: diningSession._id.toString(),
          error: socketError.message
        });
      }
      
      return diningSession;
      
    } catch (error) {
      // Rollback transaction on error if we own it
      if (shouldManageTransaction && transactionSession.inTransaction()) {
        await transactionSession.abortTransaction();
      }
      throw error;
      
    } finally {
      // Clean up session if we created it
      if (shouldManageTransaction) {
        await transactionSession.endSession();
      }
    }
  }
  
  /**
   * Get all orders for a session
   * 
   * @param {ObjectId} sessionId
   * @param {Object} [filters={}] - Additional filters (e.g., { status: 'pending' })
   * @param {Object} [options={}] - Query options
   * @param {boolean} [options.populate=false] - Whether to populate menuItem names
   * @returns {Promise<Order[]>}
   */
  static async getSessionOrders(sessionId, filters = {}, options = {}) {
    const query = Order.find({
      session: sessionId,
      ...filters
    }).sort({ createdAt: -1 });
    
    // Only populate if explicitly requested (to avoid test issues with missing Menu model)
    if (options.populate) {
      query.populate('items.menuItem', 'name');
    }
    
    return await query;
  }
  
  /**
   * Get session summary (for analytics/reporting)
   * 
   * @param {ObjectId} sessionId
   * @returns {Promise<Object>}
   */
  static async getSessionSummary(sessionId) {
    const session = await DiningSession.findById(sessionId);
    if (!session) {
      throw new AppError('Session not found', 404);
    }
    
    const orders = await this.getSessionOrders(sessionId);
    
    const summary = {
      sessionId: session._id.toString(),
      tableId: session.table.toString(),
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      duration: session.getDurationFormatted(),
      
      orderCount: orders.length,
      totalAmount: orders.reduce((sum, o) => sum + o.totalAmount, 0),
      
      paidOrders: orders.filter(o => o.paymentStatus === 'paid').length,
      unpaidOrders: orders.filter(o => o.paymentStatus === 'unpaid').length,
      
      qrOrders: orders.filter(o => o.source === 'qr').length,
      staffOrders: orders.filter(o => o.source === 'staff').length,
      
      orders: orders.map(o => ({
        orderId: o._id.toString(),
        orderNumber: o.orderNumber,
        source: o.source,
        totalAmount: o.totalAmount,
        paymentStatus: o.paymentStatus,
        status: o.status,
        placedAt: o.placedAt
      }))
    };
    
    return summary;
  }
  
  /**
   * Validate table can accept orders
   * Used as pre-check before order creation
   * 
   * ✅ DOES NOT check if table is "occupied" - occupied tables can accept orders!
   * 
   * @param {ObjectId} tableId
   * @returns {Promise<Table>}
   */
  static async validateTableForOrders(tableId) {
    const table = await Table.findById(tableId);
    
    if (!table) {
      throw new AppError('Table not found', 404);
    }
    
    if (!table.isActive) {
      throw new AppError('Table is not available', 400);
    }
    
    // ✅ DO NOT check if table.status === 'occupied'
    // Occupied tables should still accept QR orders!
    
    return table;
  }
  
  /**
   * Find all active sessions for a branch
   * Useful for staff dashboards
   * 
   * @param {ObjectId} branchId
   * @returns {Promise<DiningSession[]>}
   */
  static async getActiveSessions(branchId) {
    return await DiningSession.find({
      branch: branchId,
      status: 'active'
    })
    .populate('table', 'tableNumber section')
    .sort({ startedAt: -1 });
  }
  
  /**
   * Check if session has any unpaid orders
   * 
   * @param {ObjectId} sessionId
   * @returns {Promise<boolean>}
   */
  static async hasUnpaidOrders(sessionId) {
    const unpaidCount = await Order.countDocuments({
      session: sessionId,
      paymentStatus: { $in: ['unpaid', 'partially_paid'] },
      status: { $nin: ['canceled'] }
    });
    
    return unpaidCount > 0;
  }
  
  /**
   * Transfer session to another table
   * Useful when customers move tables
   * 
   * @param {ObjectId} sessionId
   * @param {ObjectId} newTableId
   * @param {ObjectId} movedBy - Staff user ID
   * @returns {Promise<DiningSession>}
   */
  static async transferSession(sessionId, newTableId, movedBy) {
    const mongoSession = await DiningSession.startSession();
    
    try {
      let updatedSession;
      
      await mongoSession.withTransaction(async () => {
        const session = await DiningSession.findOne({
          _id: sessionId,
          status: 'active'
        }).session(mongoSession);
        
        if (!session) {
          throw new AppError('Active session not found', 404);
        }
        
        const oldTable = await Table.findById(session.table).session(mongoSession);
        const newTable = await Table.findById(newTableId).session(mongoSession);
        
        if (!newTable) {
          throw new AppError('New table not found', 404);
        }
        
        if (newTable.merchant.toString() !== oldTable.merchant.toString()) {
          throw new AppError('Tables must be in same merchant', 400);
        }
        
        // Update session table reference
        session.table = newTableId;
        session.branch = newTable.branch;
        await session.save({ session: mongoSession });
        
        // Update all orders in session
        await Order.updateMany(
          { session: sessionId },
          { 
            table: newTableId,
            branch: newTable.branch
          },
          { session: mongoSession }
        );
        
        // Update table statuses
        if (oldTable) {
          oldTable.status = 'needs-cleaning';
          await oldTable.save({ session: mongoSession, validateBeforeSave: false });
        }
        
        newTable.status = 'occupied';
        await newTable.save({ session: mongoSession, validateBeforeSave: false });
        
        updatedSession = session;
      });
      
      logger.info('session.transferred', {
        sessionId: sessionId.toString(),
        fromTable: updatedSession.table.toString(),
        toTable: newTableId.toString(),
        movedBy: movedBy.toString()
      });
      
      return updatedSession;
      
    } finally {
      await mongoSession.endSession();
    }
  }
}

module.exports = { SessionService };
