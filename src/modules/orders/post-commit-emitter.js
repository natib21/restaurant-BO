/**
 * @deprecated Replaced by transactional outbox (models/OutboxEvent + OutboxWorker).
 * Kept temporarily for reference; do not use in new code.
 */
const { getIo } = require('../../../socket');
const logger = require('../../../utils/logger');

/**
 * In-memory queue of Socket.IO events to emit only after a successful transaction commit.
 */
class PostCommitEventQueue {
  constructor() {
    this.events = [];
  }

  /** @param {string} room */
  enqueue(room, event, payload) {
    this.events.push({ room, event, payload });
  }

  enqueueBroadcast(event, payload) {
    this.events.push({ broadcast: true, event, payload });
  }
}

/**
 * @param {PostCommitEventQueue} queue
 */
function flushPostCommitQueue(queue) {
  if (!queue?.events?.length) return;

  const io = getIo();
  if (!io) {
    logger.warn('Post-commit socket flush skipped: Socket.IO not initialized');
    return;
  }

  for (const entry of queue.events) {
    try {
      if (entry.broadcast) {
        io.emit(entry.event, entry.payload);
      } else {
        io.to(entry.room).emit(entry.event, entry.payload);
      }
    } catch (err) {
      logger.error('Post-commit socket emit failed', {
        event: entry.event,
        room: entry.room,
        error: err.message,
      });
    }
  }
}

module.exports = { PostCommitEventQueue, flushPostCommitQueue };
