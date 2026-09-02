const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const Table = require('../../../../models/tabelModel');
const Counter = require('../../../../models/CounterModel.js');
const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');
// ✅ Lazy load to avoid circular dependency (OrderService also imports this file)
let OrderService;
const getOrderService = () => {
  if (!OrderService) {
    OrderService = require('./OrderService').OrderService;
  }
  return OrderService;
};
const { InventoryService } = require('../../inventory');
const { IdempotencyService } = require('./IdempotencyService');
const { NotificationService } = require('../../notifications');

/**
 * @typedef {Object} PlaceOrderCommand
 * @property {import('mongoose').Types.ObjectId} merchantId
 * @property {import('mongoose').Types.ObjectId} branchId
 * @property {import('mongoose').Types.ObjectId} tableId
 * @property {import('mongoose').Types.ObjectId} [customerId]
 * @property {import('mongoose').Document} [customer]
 * @property {string} customerName
 * @property {string|null} [customerPhone]
 * @property {string|null} [sessionToken] - QR session token for customer notifications
 * @property {Array} items
 * @property {import('mongoose').Types.ObjectId|null} [performedBy]
 * @property {string|null} [idempotencyKey]
 */

class OrderTransactionService {
  /**
   * Atomic customer dine-in order: order + customer stats + inventory in one MongoDB transaction.
   * Realtime events are written to the outbox in the same transaction (published by OutboxWorker).
   *
   * @param {PlaceOrderCommand} command
   */
  static async executePlaceOrder(command) {
    const {
      merchantId,
      branchId,
      tableId,
      customerId,
      customer,
      customerName,
      customerPhone,
      sessionToken, // ✅ Session token from authenticated request
      items,
      performedBy,
      idempotencyKey,
    } = command;

    const requestHash = IdempotencyService.buildRequestHash(command);
    const idempotencyGate = await IdempotencyService.beginPlaceOrder(
      merchantId,
      idempotencyKey,
      requestHash
    );

    if (!idempotencyGate.proceed) {
      logger.info('order.place.idempotent_replay', {
        orderId: idempotencyGate.order._id.toString(),
        merchantId: merchantId.toString(),
        idempotencyKey,
      });
      return { order: idempotencyGate.order, replayed: true };
    }

    const useIdempotency = Boolean(idempotencyGate.useIdempotency);

    // Phase 0 — pre-transaction validation (read-only)
    const { orderItems, subtotal } = await getOrderService().buildOrderItems(items, merchantId);
    const deductionPlan = await InventoryService.resolveDeductionPlan(orderItems, merchantId);

    const session = await mongoose.startSession();
    let createdOrder;
    let table;

    try {
      await session.withTransaction(async () => {
        table = await Table.findOne({ _id: tableId, merchant: merchantId }).session(session);
        if (!table) {
          throw new AppError('Table not found', 404);
        }

        const orderNumber = await OrderTransactionService.generateOrderNumber(
          {
            merchant: merchantId,
            branch: branchId,
            orderType: 'dine_in', // ✅ Pass order type for prefix determination
          },
          session
        );

        const [order] = await Order.create(
          [
            {
              merchant: merchantId,
              branch: branchId,
              customer: customerId,
              customerName,
              customerPhone: customerPhone || null,
              table: tableId,
              tableNumber: table.tableNumber,
              orderType: 'dine_in',
              orderNumber,
              source: 'web', // explicit source for customer QR orders
              items: orderItems,
              subtotal,
              totalAmount: subtotal,
              paymentStatus: 'unpaid',
              placedAt: new Date(),
            },
          ],
          { session }
        );

        createdOrder = order;

        if (customer) {
          customer.stats.totalOrders += 1;
          customer.stats.totalSpent += subtotal;
          customer.stats.lastOrderAt = new Date();
          customer.history.push({
            action: 'place_order',
            details: `Placed order ${orderNumber}`,
            order: createdOrder._id,
            addedAt: new Date(),
          });
          await customer.save({ validateBeforeSave: false, session });
        }

        const { ingredients } = await InventoryService.deductForOrder(
          {
            merchantId,
            orderId: createdOrder._id,
            orderNumber,
            plan: deductionPlan,
            performedBy,
          },
          session
        );

        await NotificationService.notifyOrderPlaced(
          {
            order: createdOrder,
            table,
            orderItems,
            branchId,
            merchantId,
            ingredients,
          },
          session
        );
      });

      // ──────────────────────────────────────────────────────────────────
      // Step 3: Auto-routing based on OrderFlowConfig
      // (Must happen AFTER transaction commits, since transitionOrderStatus
      // creates its own transaction)
      // ──────────────────────────────────────────────────────────────────
      const { OrderFlowConfigService } = require('../../order-flow-config');
      const { OrderStateMachineService } = require('./OrderStateMachineService');

      const channelConfig = await OrderFlowConfigService.getChannelConfig(
        merchantId,
        createdOrder.source
      );

      if (channelConfig.requiresReview === false) {
        // Auto-route: pending → accepted → preparing
        // Use actorType: 'system' for automated transitions

        // Transition 1: pending → accepted
        await OrderStateMachineService.transitionOrderStatus({
          orderId: createdOrder._id,
          toStatus: 'accepted',
          merchantQuery: { merchant: merchantId },
          user: null,
          actorType: 'system',
          reason: 'Auto-accepted: channel requires no review',
        });

        // Transition 2: accepted → preparing
        await OrderStateMachineService.transitionOrderStatus({
          orderId: createdOrder._id,
          toStatus: 'preparing',
          merchantQuery: { merchant: merchantId },
          user: null,
          actorType: 'system',
          reason: 'Auto-sent to kitchen: channel requires no review',
        });

        // Refresh order to get updated status
        await createdOrder.reload();

        logger.info('order.auto-routed', {
          orderId: createdOrder._id.toString(),
          source: createdOrder.source,
          finalStatus: createdOrder.status,
        });
      }

      if (useIdempotency && idempotencyKey) {
        await IdempotencyService.markCompleted(merchantId, idempotencyKey, createdOrder._id);
      }

      // ✅ Emit real-time socket event to staff (after DB transaction committed)
      try {
        const { getIo } = require('../../../infrastructure/websocket/socket-server');
        const io = getIo();
        
        // Broadcast to branch staff with ORDER_VIEW and ORDER_MANAGE permissions
        io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', {
          _id: createdOrder._id,
          orderNumber: createdOrder.orderNumber,
          status: createdOrder.status,
          source: createdOrder.source,
          tableNumber: table.tableNumber,
          customerName,
          totalAmount: createdOrder.totalAmount,
          placedAt: createdOrder.placedAt,
          branchId,
        });
        
        io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', {
          _id: createdOrder._id,
          orderNumber: createdOrder.orderNumber,
          status: createdOrder.status,
          source: createdOrder.source,
          tableNumber: table.tableNumber,
          customerName,
          totalAmount: createdOrder.totalAmount,
          placedAt: createdOrder.placedAt,
          branchId,
        });
        
        // ✅ Notify customer if they're connected via socket
        // Emit to the order room so customer receives status updates
        io.to(`order:${createdOrder._id}`).emit('order:created', {
          _id: createdOrder._id,
          orderNumber: createdOrder.orderNumber,
          status: createdOrder.status,
          totalAmount: createdOrder.totalAmount,
          placedAt: createdOrder.placedAt,
          items: orderItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
          })),
        });
        
        // Also emit to session-specific room if this is a session-based order
        if (customerId || tableId) {
          // ✅ Use sessionToken from authenticated request instead of re-querying
          if (sessionToken) {
            io.to(`session:${sessionToken}`).emit('order:created', {
              _id: createdOrder._id,
              orderNumber: createdOrder.orderNumber,
              status: createdOrder.status,
              totalAmount: createdOrder.totalAmount,
              placedAt: createdOrder.placedAt,
            });
            
            // Tell all sockets in that session to join the order room
            io.to(`session:${sessionToken}`).socketsJoin(`order:${createdOrder._id}`);
            
            logger.info('order.customer_notified', {
              orderId: createdOrder._id.toString(),
              sessionToken: sessionToken.substring(0, 8) + '...',
            });
          } else {
            // ⚠️ Fallback: For staff orders or if sessionToken not provided
            // This path queries by table (may notify wrong customer if multiple active sessions)
            const CustomerSession = require('../../../../models/customerSessionModule');
            const session = await CustomerSession.findOne({
              table: tableId,
              merchant: merchantId,
              isActive: true,
              expiresAt: { $gt: new Date() },
            }).select('token').lean();
            
            if (session) {
              io.to(`session:${session.token}`).emit('order:created', {
                _id: createdOrder._id,
                orderNumber: createdOrder.orderNumber,
                status: createdOrder.status,
                totalAmount: createdOrder.totalAmount,
                placedAt: createdOrder.placedAt,
              });
              
              // Tell all sockets in that session to join the order room
              io.to(`session:${session.token}`).socketsJoin(`order:${createdOrder._id}`);
              
              logger.info('order.customer_notified_fallback', {
                orderId: createdOrder._id.toString(),
                sessionToken: session.token.substring(0, 8) + '...',
                warning: 'Used table lookup - may be inaccurate if multiple sessions exist',
              });
            }
          }
        }
      } catch (socketError) {
        // Don't fail the order if socket broadcast fails
        logger.warn('order.place.socket_emit_failed', {
          orderId: createdOrder._id.toString(),
          error: socketError.message,
        });
      }

      logger.info('order.place.success', {
        orderId: createdOrder._id.toString(),
        merchantId: merchantId.toString(),
        branchId: branchId.toString(),
        idempotencyKey: idempotencyKey || undefined,
      });

      return { order: createdOrder, orderItems, table, replayed: false };
    } catch (error) {
      if (useIdempotency && idempotencyKey) {
        await IdempotencyService.releaseClaim(merchantId, idempotencyKey);
      }

      if (error instanceof AppError) throw error;

      if (OrderTransactionService.isInventoryError(error)) {
        logger.warn('order.place.inventory_failed', {
          merchantId: merchantId.toString(),
          message: error.message,
        });
        throw new AppError('Insufficient inventory for this order', 400);
      }

      // ✅ Log the actual error before throwing generic message
      logger.error('order.place.failed', {
        merchantId: merchantId.toString(),
        error: error.message,
        stack: error.stack,
        errorName: error.name,
      });
      console.error('OrderTransactionService.executePlaceOrder ERROR:', error);
      throw new AppError(`Failed to create order: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Generate branch-specific order number with order type prefix
   * Each order type (dine_in, takeaway, delivery) has independent sequences
   * 
   * Features:
   * - Branch-scoped (each branch has independent sequences)
   * - Order type-specific prefixes (DI, TA, DL)
   * - Continuous sequence per branch + order type (not daily reset)
   * - 6-digit zero-padded format
   * - Respects branch starting number configuration
   * - Thread-safe atomic increment
   * 
   * @param {Object} params - Order generation parameters
   * @param {ObjectId} params.merchant - Merchant ID
   * @param {ObjectId} params.branch - Branch ID
   * @param {string} params.orderType - Order type (dine_in, takeaway, delivery)
   * @param {Session} session - MongoDB transaction session
   * @returns {Promise<string>} Order number (e.g., "#DI-000001", "#TA-000001", "#DL-000001")
   */
  static async generateOrderNumber({ merchant, branch, orderType }, session) {
    const { getOrderTypePrefix, formatOrderNumber, isValidOrderType } = require('../utils/orderTypePrefix');
    
    // ✅ Validate orderType before processing
    if (!isValidOrderType(orderType)) {
      throw new AppError(
        `Invalid order type: "${orderType}". Valid types: dine_in, takeaway, delivery`,
        400
      );
    }
    
    // ✅ Get prefix based on order type (DI, TA, DL)
    const prefix = getOrderTypePrefix(orderType);

    // ✅ Check if counter exists for this branch + order type
    let counter = await Counter.findOne(
      { merchantId: merchant, branchId: branch, prefix, date: null },
      null,
      { session }
    );

    if (!counter) {
      // ✅ First order of this type for this branch - initialize with configured starting number
      const Branch = require('../../../../models/branchModel');
      const branchDoc = await Branch.findById(branch)
        .select('config.orderNumberStart')
        .session(session);
      
      const startingNumber = branchDoc?.config?.orderNumberStart || 1;

      // ✅ Create counter starting at (startingNumber - 1) so first increment gives startingNumber
      counter = await Counter.findOneAndUpdate(
        { merchantId: merchant, branchId: branch, prefix, date: null },
        { 
          $setOnInsert: { 
            seq: startingNumber - 1,
            startingNumber,
            prefix,
            startedAt: new Date()
          } 
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, session }
      );
    }

    // ✅ Atomically increment sequence
    counter = await Counter.findOneAndUpdate(
      { _id: counter._id },
      { $inc: { seq: 1 } },
      { new: true, session }
    );

    // ✅ Format: #DI-000001, #TA-000001, #DL-000001 (6-digit zero-padded)
    return formatOrderNumber(prefix, counter.seq);
  }

  static isInventoryError(error) {
    const msg = error?.message || '';
    return (
      msg.includes('Insufficient stock') ||
      msg.includes('Ingredient not found') ||
      msg.includes('No active recipe found') ||
      msg.includes('Cannot place order without recipe')
    );
  }
}

module.exports = { OrderTransactionService };
