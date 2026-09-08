// src/infrastructure/outbox/handlers/order-ready-handler.js
// ✅ PHASE 1: Handle kitchen:all_tickets_ready event → transition order to 'ready'
const {OrderStateMachineService} = require('../../../modules/order/service/OrderStateMachineService');
const KitchenTicket = require('../../../../models/KitchenTicket');
const logger = require('../../../../utils/logger');

/**
 * Outbox event handler for transitioning order to 'ready' when all kitchen tickets are ready
 * 
 * Event: kitchen:all_tickets_ready
 * Triggered by: KitchenTicketService when last ticket for an order becomes 'ready'
 * Action: Transition order from 'preparing' → 'ready'
 * 
 * @param {Object} outboxEvent - Outbox event document
 */
async function handleAllTicketsReady(outboxEvent) {
  const { orderId, ticketIds } = outboxEvent.payload.data || {};

  if (!orderId) {
    logger.error('order-ready.handler.missing-order-id', {
      eventId: outboxEvent._id,
    });
    throw new Error('Missing orderId in outbox event payload');
  }

  logger.info('order-ready.handler.start', { orderId, ticketIds });

  try {
    // Double-check all tickets are still ready (idempotency check)
    const tickets = await KitchenTicket.find({
      order: orderId,
      status: { $ne: 'canceled' },
    });

    const allReady = tickets.length > 0 && tickets.every(t => t.status === 'ready');

    if (!allReady) {
      logger.warn('order-ready.handler.not-all-ready', {
        orderId,
        ticketStatuses: tickets.map(t => ({ id: t._id, status: t.status })),
      });
      // Don't fail — this is expected in race conditions (idempotent)
      return { success: true, skipped: true };
    }

    // Fetch a ticket to get merchant context for the query
    const sampleTicket = tickets[0];

    // Transition order to 'ready' using system actor
    const result = await OrderStateMachineService.transitionOrderStatus({
      orderId,
      toStatus: 'ready',
      merchantQuery: { merchant: sampleTicket.merchant },
      user: null, // System actor - no user
      actorType: 'system', // Explicit system actor type
      reason: 'All kitchen tickets ready',
    });

    logger.info('order-ready.handler.success', {
      orderId,
      previousStatus: result.previousStatus,
      noop: result.noop,
    });

    return {
      success: true,
      transitioned: !result.noop,
    };
  } catch (error) {
    logger.error('order-ready.handler.failed', {
      orderId,
      error: error.message,
      stack: error.stack,
    });

    throw error; // Will trigger retry via outbox processor
  }
}

module.exports = { handleAllTicketsReady };
