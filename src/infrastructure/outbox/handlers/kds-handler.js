// src/infrastructure/outbox/handlers/kds-handler.js
// ✅ PHASE 1: Handle order:preparing event → create kitchen tickets
const KitchenTicketService = require('../../../modules/kitchen/service/KitchenTicketService');
const logger = require('../../../../utils/logger');

/**
 * Outbox event handler for creating kitchen tickets when order enters 'preparing' status
 * 
 * Event: order:preparing
 * Triggered by: OrderStateMachineService when order transitions to 'preparing'
 * Action: Create kitchen tickets (one per station)
 * 
 * @param {Object} outboxEvent - Outbox event document
 */
async function handleOrderPreparing(outboxEvent) {
  const { orderId } = outboxEvent.payload.data || {};

  if (!orderId) {
    logger.error('kds.handler.order-preparing.missing-order-id', {
      eventId: outboxEvent._id,
    });
    throw new Error('Missing orderId in outbox event payload');
  }

  logger.info('kds.handler.order-preparing.start', { orderId });

  try {
    const tickets = await KitchenTicketService.createTicketsForOrder(orderId);

    logger.info('kds.handler.order-preparing.success', {
      orderId,
      ticketCount: tickets.length,
      ticketIds: tickets.map(t => t._id),
    });

    return {
      success: true,
      ticketCount: tickets.length,
    };
  } catch (error) {
    logger.error('kds.handler.order-preparing.failed', {
      orderId,
      error: error.message,
      stack: error.stack,
    });

    throw error; // Will trigger retry via outbox processor
  }
}

module.exports = { handleOrderPreparing };
