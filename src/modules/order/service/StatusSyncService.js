// src/modules/order/service/StatusSyncService.js
// Status derivation & real-time sync rules implementation
// Implements: "parent status derived from children" + granular socket events

const { getIo } = require('../../../infrastructure/websocket/socket-server');
const { ItemStatusService } = require('./ItemStatusService');
const logger = require('../../../../utils/logger');

/**
 * StatusSyncService
 * 
 * Coordinates status recomputation and socket event emission following the rule:
 * "A parent's status is always derived from its children's statuses."
 * 
 * Two parallel hierarchies:
 * - Order status ← derived from → Order item statuses
 * - Ticket status ← derived from → Ticket item statuses
 * 
 * Socket events:
 * - Item-level events: ALWAYS fire on any item change
 * - Parent-level events: ONLY fire when derived status actually changes
 */
class StatusSyncService {
  /**
   * After an order item status changes
   * 
   * Emits:
   * 1. order:item-status-changed (always)
   * 2. order:status-changed (only if order status actually changed)
   * 
   * @param {Object} order - Order document
   * @param {Object} item - Order item subdocument
   * @param {Object} session - MongoDB session (optional)
   */
  static async afterOrderItemChange(order, item, session = null) {
    const io = getIo();
    if (!io) {
      logger.warn('status-sync.no-socket-io', {
        orderId: order._id.toString(),
        itemId: item._id.toString(),
      });
    }

    // 1. Always emit the granular item-level event
    if (io) {
      io.to(`order:${order._id}`).emit('order:item-status-changed', {
        orderId: order._id.toString(),
        itemId: item._id.toString(),
        newStatus: item.status,
        servedAt: item.servedAt,
        servedVia: item.servedVia,
      });

      logger.debug('status-sync.order-item-event-emitted', {
        orderId: order._id.toString(),
        itemId: item._id.toString(),
        status: item.status,
      });
    }

    // 2. Recompute the parent order status
    const previousOrderStatus = order.status;
    const recomputeResult = await ItemStatusService.recomputeOrderStatus(order, session);

    // 3. Only emit order-level event if the derived status actually changed
    if (recomputeResult.statusChanged && io) {
      io.to(`order:${order._id}`).emit('order:status-changed', {
        orderId: order._id.toString(),
        oldStatus: previousOrderStatus,
        newStatus: order.status,
        timestamp: new Date().toISOString(),
      });

      logger.info('status-sync.order-status-changed', {
        orderId: order._id.toString(),
        oldStatus: previousOrderStatus,
        newStatus: order.status,
      });
    } else {
      logger.debug('status-sync.order-status-unchanged', {
        orderId: order._id.toString(),
        status: order.status,
      });
    }
  }

  /**
   * After a ticket item status changes
   * 
   * This handles the sync from ticket → order when kitchen updates an item.
   * 
   * Emits:
   * 1. ticket:item-updated (always - for KDS UI)
   * 2. ticket:status-changed (only if ticket status changed)
   * 3. order:item-status-changed (always - for POS UI)
   * 4. order:status-changed (only if order status changed)
   * 
   * @param {Object} ticket - Ticket document
   * @param {Object} ticketItem - Ticket item subdocument
   * @param {Object} order - Linked order document
   * @param {Object} orderItem - Linked order item subdocument
   * @param {Object} session - MongoDB session (optional)
   */
  static async afterTicketItemChange(ticket, ticketItem, order, orderItem, session = null) {
    const io = getIo();
    if (!io) {
      logger.warn('status-sync.no-socket-io', {
        ticketId: ticket._id.toString(),
        orderId: order._id.toString(),
      });
    }

    // 1. Emit ticket-level item event (for KDS)
    if (io) {
      io.to(`branch:${order.branch}:station:${ticket.station}`).emit('ticket:item-updated', {
        ticketId: ticket._id.toString(),
        itemId: ticketItem._id.toString(),
        newStatus: ticketItem.status,
        ticketStatus: ticket.status, // Current ticket status (may change next)
      });
    }

    // 2. Recompute ticket status and emit if changed
    const KitchenTicketService = require('../../kitchen/service/KitchenTicketService');
    const previousTicketStatus = ticket.status;
    const ticketRecompute = await KitchenTicketService.recomputeTicketStatus(ticket, session);

    if (ticketRecompute.statusChanged && io) {
      io.to(`branch:${order.branch}:station:${ticket.station}`).emit('ticket:status-changed', {
        ticketId: ticket._id.toString(),
        oldStatus: previousTicketStatus,
        newStatus: ticket.status,
      });

      logger.info('status-sync.ticket-status-changed', {
        ticketId: ticket._id.toString(),
        oldStatus: previousTicketStatus,
        newStatus: ticket.status,
      });
    }

    // 3. Emit order-level item event (for POS waiter view)
    // The waiter sees individual item updates immediately, even if ticket not fully ready
    if (io) {
      io.to(`order:${order._id}`).emit('order:item-status-changed', {
        orderId: order._id.toString(),
        itemId: orderItem._id.toString(),
        newStatus: orderItem.status,
      });
    }

    // 4. Recompute order status and emit if changed
    const previousOrderStatus = order.status;
    const orderRecompute = await ItemStatusService.recomputeOrderStatus(order, session);

    if (orderRecompute.statusChanged && io) {
      io.to(`order:${order._id}`).emit('order:status-changed', {
        orderId: order._id.toString(),
        oldStatus: previousOrderStatus,
        newStatus: order.status,
      });

      logger.info('status-sync.order-status-changed-via-ticket', {
        orderId: order._id.toString(),
        ticketId: ticket._id.toString(),
        oldStatus: previousOrderStatus,
        newStatus: order.status,
      });
    }
  }

  /**
   * Bulk sync after multiple items change (e.g., auto-serve, bulk serve)
   * 
   * Emits individual item events + one order-level event if status changed
   * 
   * @param {Object} order - Order document
   * @param {Array} changedItems - Array of order item subdocuments that changed
   * @param {Object} session - MongoDB session (optional)
   */
  static async afterBulkOrderItemsChange(order, changedItems, session = null) {
    const io = getIo();
    if (!io) return;

    // Emit individual item events
    for (const item of changedItems) {
      io.to(`order:${order._id}`).emit('order:item-status-changed', {
        orderId: order._id.toString(),
        itemId: item._id.toString(),
        newStatus: item.status,
        servedAt: item.servedAt,
        servedVia: item.servedVia,
      });
    }

    // Recompute order status once
    const previousOrderStatus = order.status;
    const recomputeResult = await ItemStatusService.recomputeOrderStatus(order, session);

    // Emit order-level event only if changed
    if (recomputeResult.statusChanged) {
      io.to(`order:${order._id}`).emit('order:status-changed', {
        orderId: order._id.toString(),
        oldStatus: previousOrderStatus,
        newStatus: order.status,
        timestamp: new Date().toISOString(),
      });

      logger.info('status-sync.bulk-order-status-changed', {
        orderId: order._id.toString(),
        oldStatus: previousOrderStatus,
        newStatus: order.status,
        itemsChanged: changedItems.length,
      });
    }
  }

  /**
   * Sync order item 'served' status back to linked ticket item (REVERSE SYNC)
   * Called after item status update, inside transaction
   * 
   * This is the opposite direction of afterTicketItemChange - when the waiter
   * marks an item as served, we need to tell the kitchen that item is done.
   * 
   * @param {Object} order - Mongoose order document
   * @param {String|ObjectId} orderItemId - ID of the served item
   * @param {Object} session - Mongoose session
   */
  static async syncTicketItemCompletion(order, orderItemId, session) {
    const orderItem = order.items.id(orderItemId);
    
    // Only sync if item requires kitchen and is now served
    if (!orderItem || !orderItem.requiresKitchen || orderItem.status !== 'served') {
      return;
    }

    const KitchenTicket = require('../../../../models/KitchenTicket');
    
    const ticket = await KitchenTicket.findOne({
      order: order._id,
      'items.orderItemId': orderItemId,
    }).session(session);

    if (!ticket) {
      // Item might not have a ticket (e.g., manually added after order creation)
      logger.debug('status-sync.no-ticket-for-item', {
        orderId: order._id.toString(),
        orderItemId: orderItemId.toString(),
      });
      return;
    }

    const ticketItem = ticket.items.find(
      ti => ti.orderItemId.toString() === orderItemId.toString()
    );

    if (!ticketItem) {
      logger.warn('status-sync.ticket-item-not-found', {
        orderId: order._id.toString(),
        orderItemId: orderItemId.toString(),
        ticketId: ticket._id.toString(),
      });
      return;
    }

    // Mark ticket item as completed
    const previousTicketItemStatus = ticketItem.status;
    ticketItem.status = 'completed';
    ticketItem.completedServingAt = new Date();

    // Recompute ticket-level status
    await StatusSyncService._recomputeTicketStatus(ticket, session);
    
    await ticket.save({ session });

    logger.info('status-sync.ticket-item-completed', {
      orderId: order._id.toString(),
      orderItemId: orderItemId.toString(),
      ticketId: ticket._id.toString(),
      previousTicketItemStatus,
      newTicketStatus: ticket.status,
    });
  }

  /**
   * Recompute ticket status from ticket items (PRIVATE)
   * Same "single lagging item" derivation principle used for orders
   * 
   * Queues outbox event if ticket transitions to 'completed'
   * 
   * @param {Object} ticket - Mongoose ticket document
   * @param {Object} session - Mongoose session
   * @private
   */
  static async _recomputeTicketStatus(ticket, session) {
    const items = ticket.items;

    const allCompleted = items.every(i => i.status === 'completed');
    const allReady = items.every(i => i.status === 'ready' || i.status === 'completed');
    const anyInProgress = items.some(i => i.status === 'in_progress');

    const previousStatus = ticket.status;
    let newStatus;

    if (allCompleted) {
      newStatus = 'completed';
      if (!ticket.completedAt) {
        ticket.completedAt = new Date();
      }
    } else if (allReady) {
      newStatus = 'ready';
    } else if (anyInProgress) {
      newStatus = 'in_progress';
    } else {
      newStatus = 'pending';
    }

    ticket.status = newStatus;

    // ✅ Queue outbox event if ticket just became completed (real-time update)
    if (previousStatus !== 'completed' && newStatus === 'completed') {
      const OutboxEvent = require('../../../../models/OutboxEvent');
      
      await OutboxEvent.create([{
        aggregateId: ticket.order,
        aggregateType: 'order',  // NOTE: 'ticket' not in OutboxEvent enum; ticket events tracked under parent order
        merchant: ticket.merchant,
        eventType: 'ticket:completed',
        payload: {
          ticketId: ticket._id.toString(),
          stationId: ticket.station.toString(),
          branchId: ticket.branch.toString(),  // ✅ ADD branchId for room name
          orderId: ticket.order.toString(),
          orderNumber: ticket.orderNumber,
          previousStatus,
          newStatus: 'completed',
        },
        status: 'pending',
      }], { session });

      logger.info('status-sync.ticket-completed-event-queued', {
        ticketId: ticket._id.toString(),
        previousStatus,
        newStatus: 'completed',
      });
    }
  }
}

module.exports = { StatusSyncService };
