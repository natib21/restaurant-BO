const { getIo } = require('../websocket/socket-server');
const logger = require('../../../utils/logger');

/**
 * Delivers a single outbox record to Socket.IO (at-least-once; consumers must be idempotent).
 * @param {import('mongoose').Document} outboxEvent
 */
function publishOutboxEvent(outboxEvent) {
  const io = getIo();
  if (!io) {
    throw new Error('Socket.IO is not initialized');
  }

  const { payload } = outboxEvent;
  if (!payload || !payload.target) {
    throw new Error('Invalid outbox payload: missing target');
  }

  const eventName = outboxEvent.eventType;
  const data = payload.data ?? payload;

  if (payload.target === 'broadcast') {
    io.emit(eventName, data);
    return;
  }

  if (payload.target === 'room') {
    if (!payload.room) {
      throw new Error('Invalid outbox payload: room target requires room');
    }
    io.to(payload.room).emit(eventName, data);
    return;
  }

  throw new Error(`Unknown outbox target: ${payload.target}`);
}

/**
 * @param {import('mongoose').Document} outboxEvent
 */
function publishWithLogging(outboxEvent) {
  const meta = {
    eventId: outboxEvent._id.toString(),
    eventType: outboxEvent.eventType,
    merchantId: outboxEvent.merchant?.toString(),
    orderId:
      outboxEvent.aggregateType === 'order' ? outboxEvent.aggregateId?.toString() : undefined,
    retryCount: outboxEvent.retryCount,
  };

  try {
    publishOutboxEvent(outboxEvent);
    logger.info('outbox.event.emit.success', meta);
  } catch (error) {
    logger.error('outbox.event.emit.failure', { ...meta, error: error.message });
    throw error;
  }
}

module.exports = { publishOutboxEvent, publishWithLogging };
