const OutboxEvent = require('../../../models/OutboxEvent');
const logger = require('../../../utils/logger');
const { publishWithLogging } = require('./outbox-publisher');
const { setBackgroundWorkerContext, captureException } = require('../monitoring/sentry');

// ✅ PHASE 1: Domain-specific event handlers registry
const { handleOrderPreparing } = require('./handlers/kds-handler');
const { handleAllTicketsReady } = require('./handlers/order-ready-handler');
const { handleTicketCompleted } = require('./handlers/ticket-completed-handler');

const EVENT_HANDLERS = {
  'order:preparing': handleOrderPreparing,
  'kitchen:all_tickets_ready': handleAllTicketsReady,
  'ticket:completed': handleTicketCompleted,
};

const DEFAULT_POLL_MS = 1000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_LOCK_TIMEOUT_MS = 60 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

function getPollIntervalMs() {
  const v = Number(process.env.OUTBOX_POLL_INTERVAL_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_POLL_MS;
}

function getBatchSize() {
  const v = Number(process.env.OUTBOX_BATCH_SIZE);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_BATCH_SIZE;
}

function getMaxRetries() {
  const v = Number(process.env.OUTBOX_MAX_RETRIES);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_RETRIES;
}

function getLockTimeoutMs() {
  const v = Number(process.env.OUTBOX_LOCK_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_LOCK_TIMEOUT_MS;
}

function computeNextRetryAt(retryCount) {
  const delayMs = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retryCount);
  return new Date(Date.now() + delayMs);
}

class OutboxWorker {
  constructor() {
    this.running = false;
    this.timer = null;
    this.processing = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    logger.info('outbox.worker.started', {
      pollIntervalMs: getPollIntervalMs(),
      batchSize: getBatchSize(),
      maxRetries: getMaxRetries(),
    });
    this.scheduleTick(0);
  }

  scheduleTick(delayMs) {
    if (!this.running) return;
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  async tick() {
    if (!this.running) return;

    if (this.processing) {
      this.scheduleTick(getPollIntervalMs());
      return;
    }

    this.processing = true;

    try {
      await this.releaseStaleLocks();
      const batchSize = getBatchSize();
      for (let i = 0; i < batchSize; i += 1) {
        const claimed = await this.claimNextEvent();
        if (!claimed) break;
        await this.processEvent(claimed);
      }
    } catch (error) {
      logger.error('outbox.worker.tick.error', { error: error.message });
    } finally {
      this.processing = false;
      this.scheduleTick(getPollIntervalMs());
    }
  }

  async releaseStaleLocks() {
    const staleBefore = new Date(Date.now() - getLockTimeoutMs());
    const result = await OutboxEvent.updateMany(
      {
        status: 'processing',
        lockedAt: { $lt: staleBefore },
      },
      {
        $set: { status: 'pending', lockedAt: null },
        $inc: { retryCount: 1 },
      }
    );

    if (result.modifiedCount > 0) {
      logger.warn('outbox.worker.stale_locks_released', { count: result.modifiedCount });
    }
  }

  async claimNextEvent() {
    const now = new Date();
    const maxRetries = getMaxRetries();

    const event = await OutboxEvent.findOneAndUpdate(
      {
        status: 'pending',
        nextRetryAt: { $lte: now },
        retryCount: { $lt: maxRetries },
      },
      {
        $set: {
          status: 'processing',
          lockedAt: now,
        },
      },
      {
        sort: { createdAt: 1 },
        new: true,
      }
    );

    if (event) {
      logger.info('outbox.event.claimed', {
        eventId: event._id.toString(),
        eventType: event.eventType,
        merchantId: event.merchant?.toString(),
        orderId: event.aggregateType === 'order' ? event.aggregateId?.toString() : undefined,
        retryCount: event.retryCount,
      });
    }

    return event;
  }

  async processEvent(event) {
    const meta = {
      eventId: event._id.toString(),
      eventType: event.eventType,
      merchantId: event.merchant?.toString(),
      orderId: event.aggregateType === 'order' ? event.aggregateId?.toString() : undefined,
      retryCount: event.retryCount,
    };

    // Set Sentry context so background worker errors are tagged properly
    setBackgroundWorkerContext({
      worker: 'outbox',
      action: 'process_event',
      event_type: event.eventType,
      event_id: event._id.toString(),
      merchant_id: event.merchant?.toString(),
      retry_count: event.retryCount,
    });

    try {
      // ✅ PHASE 1: Execute domain-specific handler if registered
      const handler = EVENT_HANDLERS[event.eventType];
      if (handler) {
        logger.info('outbox.event.handler.executing', meta);
        await handler(event);
        logger.info('outbox.event.handler.success', meta);
      }

      // Publish to Socket.IO (existing behavior)
      publishWithLogging(event);

      await OutboxEvent.updateOne(
        { _id: event._id, status: 'processing' },
        {
          $set: {
            status: 'published',
            publishedAt: new Date(),
            lockedAt: null,
            lastError: null,
          },
        }
      );
    } catch (error) {
      const nextRetry = event.retryCount + 1;
      const maxRetries = getMaxRetries();
      const isFinal = nextRetry >= maxRetries;

      // Capture to Sentry for monitoring (only on final failure to avoid spam)
      if (isFinal) {
        captureException(error, {
          tags: {
            worker: 'outbox',
            event_type: event.eventType,
            status: 'dead_letter',
          },
          extra: {
            event_id: event._id.toString(),
            retry_count: event.retryCount,
            merchant_id: event.merchant?.toString(),
            order_id: event.aggregateType === 'order' ? event.aggregateId?.toString() : undefined,
          },
        });
      }

      await OutboxEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: isFinal ? 'failed' : 'pending',
            lockedAt: null,
            lastError: error.message,
            nextRetryAt: isFinal ? new Date() : computeNextRetryAt(event.retryCount),
          },
          $inc: { retryCount: 1 },
        }
      );

      if (isFinal) {
        logger.error('outbox.event.dead_letter', { ...meta, error: error.message });
      } else {
        logger.warn('outbox.event.retry_scheduled', {
          ...meta,
          nextRetryCount: nextRetry,
          error: error.message,
        });
      }
    }
  }

  async stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const deadline = Date.now() + 10_000;
    while (this.processing && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50));
    }

    logger.info('outbox.worker.stopped');
  }
}

let singleton = null;

function getOutboxWorker() {
  if (!singleton) singleton = new OutboxWorker();
  return singleton;
}

function startOutboxWorker() {
  const enabled = process.env.OUTBOX_WORKER_ENABLED !== 'false';
  if (!enabled) {
    logger.info('outbox.worker.disabled');
    return null;
  }
  const worker = getOutboxWorker();
  worker.start();
  return worker;
}

module.exports = { OutboxWorker, getOutboxWorker, startOutboxWorker };
