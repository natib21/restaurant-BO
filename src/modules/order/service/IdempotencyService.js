const crypto = require('crypto');
const Order = require('../../../../models/orderModel');
const OrderIdempotency = require('../../../../models/OrderIdempotency');
const AppError = require('../../../../utils/appError');

const DEFAULT_PROCESSING_TTL_MS = 5 * 60 * 1000;
const DEFAULT_COMPLETED_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 1000;
const DEFAULT_POLL_MS = 200;

function getProcessingTtlMs() {
  const minutes = Number(process.env.ORDER_IDEMPOTENCY_PROCESSING_TTL_MINUTES);
  if (Number.isFinite(minutes) && minutes > 0) return minutes * 60 * 1000;
  return DEFAULT_PROCESSING_TTL_MS;
}

function getCompletedRetentionMs() {
  const hours = Number(process.env.ORDER_IDEMPOTENCY_RETENTION_HOURS);
  if (Number.isFinite(hours) && hours > 0) return hours * 60 * 60 * 1000;
  return DEFAULT_COMPLETED_RETENTION_MS;
}

function getWaitTimeoutMs() {
  const seconds = Number(process.env.ORDER_IDEMPOTENCY_WAIT_TIMEOUT_SEC);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return DEFAULT_WAIT_TIMEOUT_MS;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class IdempotencyService {
  /**
   * @param {string|undefined|null} rawKey
   * @returns {string|null}
   */
  static normalizeKey(rawKey) {
    if (rawKey == null || rawKey === '') return null;

    const key = String(rawKey).trim();
    if (!key) return null;

    if (key.length < 8 || key.length > 128) {
      throw new AppError('Idempotency-Key must be between 8 and 128 characters', 400);
    }

    if (!/^[\w.-]+$/.test(key)) {
      throw new AppError(
        'Idempotency-Key may only contain letters, numbers, underscore, hyphen, and period',
        400
      );
    }

    return key;
  }

  /**
   * Stable fingerprint for place-order payload (same key + different cart → 422).
   */
  static buildRequestHash(command) {
    const payload = {
      branchId: String(command.branchId),
      tableId: String(command.tableId),
      customerId: command.customerId ? String(command.customerId) : null,
      items: (command.items || []).map(item => ({
        menuItemId: String(item.menuItemId),
        quantity: Number(item.quantity) || 1,
        notes: item.notes || '',
      })),
    };

    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  static processingExpiresAt() {
    return new Date(Date.now() + getProcessingTtlMs());
  }

  static completedExpiresAt() {
    return new Date(Date.now() + getCompletedRetentionMs());
  }

  /**
   * Claim idempotency slot or resolve an existing completed / in-flight request.
   *
   * @returns {Promise<
   *   | { action: 'claimed' }
   *   | { action: 'replay', order: import('mongoose').Document }
   *   | { action: 'in_progress' }
   *   | { action: 'hash_mismatch' }
   * >}
   */
  static async acquire(merchantId, idempotencyKey, requestHash) {
    try {
      await OrderIdempotency.create({
        merchant: merchantId,
        idempotencyKey,
        status: 'processing',
        requestHash,
        expiresAt: IdempotencyService.processingExpiresAt(),
      });
      return { action: 'claimed' };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return IdempotencyService.resolveExisting(merchantId, idempotencyKey, requestHash);
    }
  }

  static async resolveExisting(merchantId, idempotencyKey, requestHash) {
    const existing = await OrderIdempotency.findOne({ merchant: merchantId, idempotencyKey });

    if (!existing) {
      return IdempotencyService.acquire(merchantId, idempotencyKey, requestHash);
    }

    if (existing.requestHash !== requestHash) {
      return { action: 'hash_mismatch' };
    }

    if (existing.status === 'completed' && existing.order) {
      const order = await Order.findById(existing.order);
      if (order) return { action: 'replay', order };
      await OrderIdempotency.deleteOne({ _id: existing._id });
      return IdempotencyService.acquire(merchantId, idempotencyKey, requestHash);
    }

    const now = new Date();

    if (existing.status === 'processing' && existing.expiresAt > now) {
      return { action: 'in_progress' };
    }

    if (existing.status === 'failed' || existing.expiresAt <= now) {
      const reclaimed = await OrderIdempotency.findOneAndUpdate(
        {
          _id: existing._id,
          requestHash,
          $or: [{ status: 'failed' }, { status: 'processing', expiresAt: { $lte: now } }],
        },
        {
          $set: {
            status: 'processing',
            order: null,
            expiresAt: IdempotencyService.processingExpiresAt(),
            completedAt: null,
          },
        },
        { new: true }
      );

      if (reclaimed) return { action: 'claimed' };

      return IdempotencyService.acquire(merchantId, idempotencyKey, requestHash);
    }

    return { action: 'in_progress' };
  }

  /**
   * Wait for a concurrent in-flight request to finish.
   */
  static async waitForCompletion(merchantId, idempotencyKey, requestHash) {
    const timeoutMs = getWaitTimeoutMs();
    const pollMs = DEFAULT_POLL_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const doc = await OrderIdempotency.findOne({ merchant: merchantId, idempotencyKey });

      if (!doc) {
        return { action: 'abandoned' };
      }

      if (doc.requestHash !== requestHash) {
        return { action: 'hash_mismatch' };
      }

      if (doc.status === 'completed' && doc.order) {
        const order = await Order.findById(doc.order);
        if (order) return { action: 'replay', order };
      }

      if (doc.status === 'failed') {
        return { action: 'abandoned' };
      }

      if (doc.status === 'processing' && doc.expiresAt <= new Date()) {
        return { action: 'abandoned' };
      }

      await sleep(pollMs);
    }

    return { action: 'timeout' };
  }

  static async markCompleted(merchantId, idempotencyKey, orderId) {
    await OrderIdempotency.findOneAndUpdate(
      { merchant: merchantId, idempotencyKey, status: 'processing' },
      {
        $set: {
          status: 'completed',
          order: orderId,
          completedAt: new Date(),
          expiresAt: IdempotencyService.completedExpiresAt(),
        },
      }
    );
  }

  /** Release processing lock after a failed transaction so the client can retry. */
  static async releaseClaim(merchantId, idempotencyKey) {
    await OrderIdempotency.findOneAndUpdate(
      { merchant: merchantId, idempotencyKey, status: 'processing' },
      {
        $set: {
          status: 'failed',
          expiresAt: new Date(Date.now() + 60 * 1000),
        },
      }
    );
  }

  /**
   * Gatekeeper used by OrderTransactionService before starting the Mongo transaction.
   */
  static async beginPlaceOrder(merchantId, idempotencyKey, requestHash) {
    if (!idempotencyKey) {
      return { proceed: true, replayed: false };
    }

    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const gate = await IdempotencyService.acquire(merchantId, idempotencyKey, requestHash);

      if (gate.action === 'replay') {
        return { proceed: false, replayed: true, order: gate.order };
      }

      if (gate.action === 'hash_mismatch') {
        throw new AppError('Idempotency-Key was already used with a different order payload', 422);
      }

      if (gate.action === 'claimed') {
        return { proceed: true, replayed: false, useIdempotency: true };
      }

      const wait = await IdempotencyService.waitForCompletion(
        merchantId,
        idempotencyKey,
        requestHash
      );

      if (wait.action === 'replay') {
        return { proceed: false, replayed: true, order: wait.order };
      }

      if (wait.action === 'hash_mismatch') {
        throw new AppError('Idempotency-Key was already used with a different order payload', 422);
      }

      if (wait.action === 'timeout') {
        throw new AppError(
          'An identical order request is already being processed. Retry shortly.',
          409
        );
      }

      // abandoned / failed lock — retry acquire
    }

    throw new AppError('Could not acquire idempotency lock for order', 409);
  }
}

module.exports = { IdempotencyService };
