const OutboxEvent = require('../../../models/OutboxEvent');
const logger = require('../../../utils/logger');

/**
 * @typedef {Object} OutboxEventInput
 * @property {string} eventType
 * @property {'order'|'inventory'|'notification'} aggregateType
 * @property {import('mongoose').Types.ObjectId|string} aggregateId
 * @property {import('mongoose').Types.ObjectId|string} merchant
 * @property {import('mongoose').Types.ObjectId|string|null} [branch]
 * @property {{ target: 'room'|'broadcast', room?: string, data: object }} payload
 */

class OutboxService {
  /**
   * @param {OutboxEventInput} input
   */
  static buildEvent(input) {
    return {
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      merchant: input.merchant,
      branch: input.branch ?? null,
      payload: input.payload,
      status: 'pending',
      retryCount: 0,
      nextRetryAt: new Date(),
    };
  }

  /**
   * Persist outbox rows (optionally inside a MongoDB transaction session).
   * @param {OutboxEventInput[]} events
   * @param {import('mongoose').ClientSession|null} [session]
   */
  static async insertEvents(events, session = null) {
    if (!events?.length) return [];

    const docs = events.map(e => OutboxService.buildEvent(e));
    const options = session ? { session } : {};

    const created = await OutboxEvent.insertMany(docs, options);

    logger.info('outbox.event.created', {
      count: created.length,
      eventTypes: [...new Set(created.map(d => d.eventType))],
      merchantId: String(docs[0].merchant),
      aggregateType: docs[0].aggregateType,
      orderId: docs[0].aggregateType === 'order' ? String(docs[0].aggregateId) : undefined,
    });

    return created;
  }
}

module.exports = { OutboxService };
