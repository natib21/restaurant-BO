const { OutboxService } = require('../../infrastructure/outbox/outbox.service');
const {
  buildCustomerPlaceOrderEvents,
  buildStaffPlaceOrderEvents,
  buildOrderStatusUpdatedEvents,
  buildOrderPaidEvents,
  buildOrderCanceledEvents,
  buildOrderUpdatedEvents,
  buildInventoryStockUpdatedEvent,
  buildInventoryLowStockEvent,
} = require('./events/order-realtime-events');
const logger = require('../../../utils/logger');

/**
 * Facade over transactional outbox — NO direct socket.emit.
 * Categories: order | kitchen | inventory | system
 */
class NotificationService {
  static CATEGORIES = ['order', 'kitchen', 'inventory', 'system'];

  static async queueEvents(events, { session, category } = {}) {
    if (!events?.length) return [];
    const created = await OutboxService.insertEvents(events, session || null);
    logger.info('notification.queued', {
      category: category || 'order',
      count: created.length,
    });
    return created;
  }

  static async notifyOrderPlaced(ctx, session) {
    return NotificationService.queueEvents(buildCustomerPlaceOrderEvents(ctx), {
      session,
      category: 'order',
    });
  }

  static async notifyStaffOrderPlaced(ctx, session) {
    return NotificationService.queueEvents(buildStaffPlaceOrderEvents(ctx), {
      session,
      category: 'order',
    });
  }

  static async notifyOrderStatusUpdated(ctx, session) {
    return NotificationService.queueEvents(buildOrderStatusUpdatedEvents(ctx), {
      session,
      category: 'order',
    });
  }

  static async notifyOrderPaid(ctx, session) {
    return NotificationService.queueEvents(buildOrderPaidEvents(ctx), {
      session,
      category: 'order',
    });
  }

  static async notifyOrderCanceled(ctx, session) {
    return NotificationService.queueEvents(buildOrderCanceledEvents(ctx), {
      session,
      category: 'order',
    });
  }

  static async notifyOrderUpdated(ctx, session) {
    return NotificationService.queueEvents(buildOrderUpdatedEvents(ctx), {
      session,
      category: 'order',
    });
  }

  static async notifyInventoryStockUpdated(merchantId, ingredient, session) {
    return NotificationService.queueEvents(
      buildInventoryStockUpdatedEvent(merchantId, ingredient),
      { session, category: 'inventory' }
    );
  }

  static async notifyLowStock(merchantId, ingredient, session) {
    return NotificationService.queueEvents(buildInventoryLowStockEvent(merchantId, ingredient), {
      session,
      category: 'inventory',
    });
  }

  /**
   * Kitchen alert wrapper (notification event type on KITCHEN_VIEW rooms).
   */
  static async notifyKitchenAlert({ order, branchId, merchantId, title, message }, session) {
    const branchIdStr = branchId.toString();
    const events = [
      {
        eventType: 'notification',
        aggregateType: 'notification',
        aggregateId: order._id,
        merchant: merchantId,
        branch: branchId,
        payload: {
          target: 'room',
          room: `branch:${branchIdStr}:perm:KITCHEN_VIEW`,
          data: {
            title,
            message,
            type: 'info',
            sound: true,
            orderId: order._id,
          },
        },
      },
    ].map(e => OutboxService.buildEvent(e));

    return NotificationService.queueEvents(events, { session, category: 'kitchen' });
  }
}

module.exports = { NotificationService };
