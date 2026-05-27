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
  /**
   * Create subscription record
   */
  static createSubscription(data, options = {}) {
    const { session } = options;
    if (session) {
      return Subscription.create([data], { session }).then(docs => docs[0]);
    }
    return Subscription.create(data);
  }

  /**
   * Find subscription by transaction reference
   */
  static findByTransactionReference(tx_ref, options = {}) {
    const { session } = options;
    let query = Subscription.findOne({ transactionReference: tx_ref });
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Find subscription by merchant
   */
  static findByMerchant(merchantId, options = {}) {
    const { session } = options;
    let query = Subscription.findOne({
      merchant: merchantId,
      status: 'active',
    }).sort({ createdAt: -1 });
    
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Find all subscriptions for merchant
   */
  static findAllByMerchant(merchantId, options = {}) {
    const { session } = options;
    let query = Subscription.find({ merchant: merchantId }).sort({ createdAt: -1 });
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Update subscription status
   */
  static updateSubscription(filter, update, options = {}) {
    const { session } = options;
    let query = Subscription.findOneAndUpdate(filter, update, { new: true, session });
    return query.exec();
  }

  /**
   * Update subscription by ID
   */
  static updateSubscriptionById(subscriptionId, update, options = {}) {
    const { session } = options;
    let query = Subscription.findByIdAndUpdate(subscriptionId, update, { new: true, session });
    return query.exec();
  }

  /**
   * Find subscription by ID
   */
  static findSubscriptionById(subscriptionId, options = {}) {
    const { session } = options;
    let query = Subscription.findById(subscriptionId);
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Check if subscription is active
   */
  static async isSubscriptionActive(subscriptionId, options = {}) {
    const sub = await this.findSubscriptionById(subscriptionId, options);
    if (!sub) return false;
    return sub.status === 'active' && new Date() < sub.endDate;
  }

  /**
   * Get expired subscriptions (status active but past end date)
   */
  static getExpiredSubscriptions(options = {}) {
    const { session } = options;
    let query = Subscription.find({
      status: 'active',
      endDate: { $lt: new Date() },
    });
    
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Get subscriptions expiring soon (within 7 days)
   */
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
   * Update merchant subscription info
   */
  static updateMerchantSubscription(merchantId, data, options = {}) {
    const { session } = options;
    let query = Merchant.findByIdAndUpdate(merchantId, data, { new: true, session });
    return query.exec();
  }

  /**
   * Get merchant subscription details
   */
  static getMerchantWithSubscription(merchantId, options = {}) {
    const { session } = options;
    let query = Merchant.findById(merchantId).select(
      'subscriptionPlan isSubscriptionActive status mode'
    );
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Record webhook event (idempotency)
   */
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

  /**
   * Check if webhook already processed (idempotency)
   */
  static async isWebhookProcessed(eventId, options = {}) {
    const { session } = options;
    let query = Subscription.findOne({ webhookEventId: eventId });
    if (session) query = query.session(session);
    const result = await query.exec();
    return !!result;
  }

  /**
   * Create audit log entry for subscription changes
   */
  static createAuditLog(data, options = {}) {
    const { session } = options;
    // Assuming you have AuditLog model
    const AuditLog = require('../../../../models/auditLogModel');
    
    if (session) {
      return AuditLog.create([data], { session }).then(docs => docs[0]);
    }
    return AuditLog.create(data);
  }

  /**
   * Get subscription statistics
   */
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
