const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Idempotency ledger for POST /order.
 * Unique (merchant + idempotencyKey) prevents duplicate orders under concurrent retries.
 * TTL on expiresAt removes stale processing locks and aged completed records.
 */
const orderIdempotencySchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
      required: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    /** SHA-256 of normalized request body — detects key reuse with different payloads */
    requestHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

orderIdempotencySchema.index({ merchant: 1, idempotencyKey: 1 }, { unique: true });
orderIdempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OrderIdempotency', orderIdempotencySchema);
