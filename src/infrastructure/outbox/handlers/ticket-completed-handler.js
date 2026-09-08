// src/infrastructure/outbox/handlers/ticket-completed-handler.js

const logger = require('../../../../utils/logger');

/**
 * Handle ticket:completed event
 * Emits Socket.IO event to remove ticket from active KDS board
 * 
 * @param {Object} event - Outbox event document
 * @param {Object} io - Optional Socket.IO instance (for testing)
 */
async function handleTicketCompleted(event, io = null) {
  const { ticketId, stationId, branchId, orderId, orderNumber, previousStatus, newStatus } = event.payload;

  try {
    // Get Socket.IO instance (use provided or fetch from server)
    if (!io) {
      const { getIo } = require('../../websocket/socket-server');
      io = getIo();
    }

    if (!io) {
      logger.warn('ticket-completed.handler.no-socket-io', { ticketId });
      return { success: false, reason: 'Socket.IO not available' };
    }

    // Emit to station room (correct pattern: branch:X:station:Y)
    io.to(`branch:${branchId}:station:${stationId}`).emit('ticket:completed', {
      ticketId,
      stationId,
      branchId,
      orderId,
      orderNumber,
      previousStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    });

    logger.info('ticket-completed.handler.success', {
      ticketId,
      stationId,
      branchId,
    });

    return { success: true };
  } catch (error) {
    logger.error('ticket-completed.handler.failed', {
      ticketId,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
}

module.exports = { handleTicketCompleted };
