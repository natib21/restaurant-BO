/**
 * Subscriptions Repository
 *
 * Pure MongoDB data access layer.
 * No business logic, no service calls, no Express dependencies.
 * All methods accept optional `session` for transaction support.
 */

const Subscription = require('../../../../models/subscriptionModel');
const Merchant = require('../../../../models/merchantModel');

class SubscriptionRepository {
  static createSubscription(data, options = {}) {
    const { session } = options;
    if (session) {
      return Subscription.create([data], { session, ordered: true }).then(docs => docs[0]);
    }
    return Subscription.create(data);
  }

  static findByTransactionReference(tx_ref, options = {}) {
    const { session } = options;
    let query = Subscription.findOne({ transactionReference: tx_ref });
    if (session) query = query.session(session);
    return query.exec();
  }

  static findByMerchant(merchantId, options = {}) {
    const { session } = options;
    let query = Subscription.findOne({
      merchant: merchantId,
      status: 'active',
    }).sort({ createdAt: -1 });

    if (session) query = query.session(session);
    return query.exec();
  }

  static findAllByMerchant(merchantId, options = {}) {
    const { session } = options;
    let query = Subscription.find({ merchant: merchantId }).sort({ createdAt: -1 });
    if (session) query = query.session(session);
    return query.exec();
  }

  static updateSubscription(filter, update, options = {}) {
    const { session } = options;
    let query = Subscription.findOneAndUpdate(filter, update, { new: true, session });
    return query.exec();
  }

  static updateSubscriptionById(subscriptionId, update, options = {}) {
    const { session } = options;
    let query = Subscription.findByIdAndUpdate(subscriptionId, update, { new: true, session });
    return query.exec();
  }

  static findSubscriptionById(subscriptionId, options = {}) {
    const { session } = options;
    let query = Subscription.findById(subscriptionId);
    if (session) query = query.session(session);
    return query.exec();
  }

  static async isSubscriptionActive(subscriptionId, options = {}) {
    const sub = await this.findSubscriptionById(subscriptionId, options);
    if (!sub) return false;
    return sub.status === 'active' && new Date() < sub.endDate;
  }

  static getExpiredSubscriptions(options = {}) {
    const { session } = options;
    let query = Subscription.find({
      status: 'active',
      endDate: { $lt: new Date() },
    });

    if (session) query = query.session(session);
    return query.exec();
  }

  static getExpiringSubscriptions(daysAhead = 7, options = {}) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { session } = options;
    let query = Subscription.find({
      status: 'active',
      endDate: {
        $gte: new Date(),
        $lte: futureDate,
      },
    });

    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Update merchant subscription info AND/OR feature flags.
   *
   * FIX: previously called `Merchant.findByIdAndUpdate(merchantId, data, ...)`
   * with `data` as a raw plain object. That works fine for simple top-level
   * fields (isSubscriptionActive, mode, ...) because Mongoose auto-wraps them,
   * but it can't safely carry dot-path keys like
   * 'features.optional.orders.enabled' alongside other fields in the same
   * call. Wrapping everything in $set explicitly makes both cases work
   * identically and lets callers pass feature-flag updates in the same
   * object as status updates.
   */
  static updateMerchantSubscription(merchantId, data, options = {}) {
    const { session } = options;
    let query = Merchant.findByIdAndUpdate(merchantId, { $set: data }, { new: true, session });
    return query.exec();
  }

  static getMerchantWithSubscription(merchantId, options = {}) {
    const { session } = options;
    let query = Merchant.findById(merchantId).select(
      'subscriptionPlan isSubscriptionActive status mode'
    );
    if (session) query = query.session(session);
    return query.exec();
  }

  static markWebhookProcessed(subscriptionId, eventId, options = {}) {
    const { session } = options;
    let query = Subscription.findByIdAndUpdate(
      subscriptionId,
      {
        $set: { webhookEventId: eventId, webhookReceivedAt: new Date() },
      },
      { new: true, session }
    );
    return query.exec();
  }

  static async isWebhookProcessed(eventId, options = {}) {
    const { session } = options;
    let query = Subscription.findOne({ webhookEventId: eventId });
    if (session) query = query.session(session);
    const result = await query.exec();
    return !!result;
  }

  static createAuditLog(data, options = {}) {
    const { session } = options;
    const AuditLog = require('../../../../models/auditLogModel');

    if (session) {
      return AuditLog.create([data], { session, ordered: true }).then(docs => docs[0]);
    }
    return AuditLog.create(data);
  }

  static async getSubscriptionStats(options = {}) {
    const { session } = options;
    let query = Subscription.aggregate([
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          totalRevenue: { $sum: '$amount' },
        },
      },
    ]);

    if (session) query = query.session(session);
    return query.exec();
  }
}

module.exports = { SubscriptionRepository };
