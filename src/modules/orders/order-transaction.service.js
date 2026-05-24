const mongoose = require('mongoose');
const Order = require('../../../models/orderModel');
const Table = require('../../../models/tabelModel');
const Counter = require('../../../models/CounterModel.js');
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');
const { OrderService } = require('./service/OrderService');
const { InventoryService } = require('../inventory');
const { IdempotencyService } = require('./idempotency.service');
const { NotificationService } = require('../notifications');

/**
 * @typedef {Object} PlaceOrderCommand
 * @property {import('mongoose').Types.ObjectId} merchantId
 * @property {import('mongoose').Types.ObjectId} branchId
 * @property {import('mongoose').Types.ObjectId} tableId
 * @property {import('mongoose').Types.ObjectId} [customerId]
 * @property {import('mongoose').Document} [customer]
 * @property {string} customerName
 * @property {string|null} [customerPhone]
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
    const { orderItems, subtotal } = await OrderService.buildOrderItems(items, merchantId);
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
            orderType: 'dine_in',
            tableNumber: table.tableNumber,
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

      if (useIdempotency && idempotencyKey) {
        await IdempotencyService.markCompleted(merchantId, idempotencyKey, createdOrder._id);
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

      logger.error('order.place.failed', {
        merchantId: merchantId.toString(),
        error: error.message,
      });
      throw new AppError('Failed to create order', 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Assign order number inside the transaction (avoids un-sessioned pre-validate hook).
   */
  static async generateOrderNumber({ merchant, branch, orderType, tableNumber }, session) {
    const today = new Date().toISOString().split('T')[0];
    let prefix = 'POS';

    if (orderType === 'dine_in' && tableNumber) {
      prefix = tableNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'POS';
    } else if (orderType === 'delivery') {
      prefix = 'DEL';
    } else if (orderType === 'takeaway') {
      prefix = 'TAKE';
    }

    const counter = await Counter.findOneAndUpdate(
      { merchantId: merchant, branchId: branch, date: today, prefix },
      { $inc: { seq: 1 }, $setOnInsert: { prefix } },
      { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );

    const millis = Date.now() % 1000;
    return `#${prefix}-${counter.seq}-${millis}`;
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
