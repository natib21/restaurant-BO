const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Transactional outbox for at-least-once Socket.IO delivery.
 * Written in the same MongoDB transaction as domain changes; published asynchronously by OutboxWorker.
 */
const outboxEventSchema = new Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    aggregateType: {
      type: String,
      required: true,
      trim: true,
      enum: ['order', 'inventory', 'notification'],
    },
    aggregateId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    /**
     * Socket delivery descriptor:
     * { target: 'room'|'broadcast', room?: string, data: object }
     */
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'published', 'failed'],
      default: 'pending',
      required: true,
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextRetryAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

outboxEventSchema.index({ status: 1, nextRetryAt: 1, createdAt: 1 });
outboxEventSchema.index({ merchant: 1, status: 1, createdAt: -1 });
outboxEventSchema.index({ createdAt: 1 });

module.exports = mongoose.model('OutboxEvent', outboxEventSchema);
