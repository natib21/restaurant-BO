/**
 * Subscriptions Service
 * 
 * Pure business logic layer — NO Express dependencies (req, res).
 * Handles:
 * - Subscription lifecycle (initiate, verify, expire, renew)
 * - Feature access gating
 * - Payment processing integration
 * - Webhook handling
 */

const axios = require('axios');
const { SubscriptionRepository } = require('../repositories/subscription.repository');
const { getPaymentProvider } = require('../../../infrastructure/payments/payment-provider.interface');
const {
  featureCatalog,
  trialFeatureSet,
  trialDurationMonths,
} = require('../dto/subscription.dto');

class SubscriptionService {
  /**
   * Calculate subscription end date
   */
  static calculateEndDate(months = 1) {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date;
  }

  /**
   * Calculate days remaining in subscription
   */
  static calculateDaysRemaining(endDate) {
    const now = new Date();
    const timeRemaining = endDate - now;
    const daysRemaining = Math.ceil(timeRemaining / (1000 * 3600 * 24));
    return Math.max(0, daysRemaining);
  }

  /**
   * Validate requested feature list
   */
  static validateFeatures(features) {
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error('At least one feature must be selected');
    }

    const invalid = features.filter(feature => !featureCatalog[feature]);
    if (invalid.length > 0) {
      throw new Error(`Invalid features: ${invalid.join(', ')}`);
    }

    return Array.from(new Set(features));
  }

  /**
   * Calculate total amount for chosen features
   */
  static calculateSubscriptionAmount(features, durationMonths) {
    const normalized = this.validateFeatures(features);
    return normalized.reduce((sum, feature) => {
      const price = featureCatalog[feature]?.pricePerMonth || 0;
      return sum + price * durationMonths;
    }, 0);
  }

  /**
   * Find the latest active subscription for merchant
   */
  static async getActiveSubscription(merchantId) {
    return SubscriptionRepository.findByMerchant(merchantId);
  }

  /**
   * Check if subscription is currently active
   */
  static isSubscriptionCurrentlyActive(subscription) {
    if (!subscription) return false;
    return subscription.status === 'active' && new Date() < subscription.endDate;
  }

  /**
   * Initiate subscription payment
   * 
   * @param {string} merchantId - Merchant requesting subscription
   * @param {string[]} features - Feature keys to purchase
   * @param {number} durationMonths - Duration in months
   * @param {Object} merchantData - Merchant object with email, phone, businessName
   * @returns {Object} { tx_ref, checkout_url, session, subscription }
   */
  static async initiateSubscription(merchantId, features, durationMonths, merchantData) {
    const normalizedFeatures = this.validateFeatures(features);
    const amount = this.calculateSubscriptionAmount(normalizedFeatures, durationMonths);
    const tx_ref = `tx-${merchantId}-${Date.now()}`;
    const provider = process.env.PAYMENT_PROVIDER || 'manual';
    const paymentProvider = getPaymentProvider(provider);

    const subscription = await SubscriptionRepository.createSubscription({
      merchant: merchantId,
      plan: 'feature',
      features: normalizedFeatures,
      amount,
      currency: 'ETB',
      transactionReference: tx_ref,
      status: 'pending',
      paymentProvider: provider,
      startDate: new Date(),
      endDate: this.calculateEndDate(durationMonths),
    });

    let session = null;
    let checkout_url = null;

    if (provider !== 'manual' && typeof paymentProvider.createCheckoutSession === 'function') {
      const result = await paymentProvider.createCheckoutSession({
        amount,
        merchantData,
        features: normalizedFeatures,
        durationMonths,
        tx_ref,
        subscription,
      });
      session = result || null;
      checkout_url = session?.checkout_url || null;
    }

    return {
      tx_ref,
      checkout_url,
      session,
      subscription,
    };
  }

  /**
   * Verify subscription payment completion
   * 
   * Called after customer returns from payment gateway
   */
  static async verifySubscription(tx_ref) {
    const provider = process.env.PAYMENT_PROVIDER || 'manual';
    const paymentProvider = getPaymentProvider(provider);

    if (typeof paymentProvider.verifyTransaction !== 'function') {
      throw new Error('Payment provider is not configured');
    }

    const paymentData = await paymentProvider.verifyTransaction(tx_ref);

    if (
      !paymentData ||
      !['COMPLETED', 'SUCCESS', 'completed'].includes(paymentData.status?.toUpperCase?.())
    ) {
      throw new Error('Payment not completed or failed');
    }

    const subscription = await SubscriptionRepository.findByTransactionReference(tx_ref);

    if (!subscription) {
      throw new Error('Subscription record not found');
    }

    const updated = await SubscriptionRepository.updateSubscriptionById(
      subscription._id,
      {
        status: 'active',
        verifiedAt: new Date(),
        gatewayResponse: paymentData,
      }
    );

    const merchantUpdate = {
      currentSubscription: subscription._id,
      isSubscriptionActive: true,
      status: 'approved',
      mode: 'Live',
    };

    if (subscription.plan) {
      merchantUpdate.subscriptionPlan = subscription.plan;
    } else {
      merchantUpdate.subscriptionPlan = 'feature';
    }

    await SubscriptionRepository.updateMerchantSubscription(subscription.merchant, merchantUpdate);
    return updated;
  }

  /**
   * Get current active subscription for merchant
   */
  static async getSubscriptionStatus(merchantId) {
    const subscription = await SubscriptionRepository.findByMerchant(merchantId);

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    return {
      _id: subscription._id,
      plan: subscription.plan,
      features: subscription.features || [],
      isTrial: Boolean(subscription.isTrial),
      status: subscription.status,
      endDate: subscription.endDate,
      trialEndDate: subscription.isTrial ? subscription.endDate : undefined,
      isActive: this.isSubscriptionCurrentlyActive(subscription),
      daysRemaining: this.calculateDaysRemaining(subscription.endDate),
    };
  }

  /**
   * Check if merchant has feature access
   * 
   * Validates if merchant's subscription includes requested feature
   */
  static async checkFeatureAccess(merchantId, feature) {
    const subscription = await this.getActiveSubscription(merchantId);

    if (!subscription || !this.isSubscriptionCurrentlyActive(subscription)) {
      return { hasAccess: false, reason: 'No active subscription or trial' };
    }

    if (subscription.isTrial) {
      return { hasAccess: true };
    }

    const activeFeatures = Array.isArray(subscription.features) ? subscription.features : [];
    if (!activeFeatures.includes(feature)) {
      return { hasAccess: false, reason: 'Feature not included in purchased subscription' };
    }

    return { hasAccess: true };
  }

  /**
   * Verify webhook signature from the configured payment provider
   * 
   * Ensures webhook events are authentic for the given provider
   */
  static verifyWebhookSignature(provider, rawBody, signatureHeader) {
    if (!signatureHeader) {
      throw new Error(`Missing x-${provider}-signature header`);
    }

    const paymentProvider = getPaymentProvider(provider);
    if (typeof paymentProvider.verifyWebhookSignature !== 'function') {
      throw new Error(`Webhook verification is not supported for provider "${provider}"`);
    }

    return paymentProvider.verifyWebhookSignature(rawBody, signatureHeader);
  }

  /**
   * Handle webhook event from a payment provider
   * 
   * Processes provider-specific payment events and updates subscription state
   */
  static async handleWebhookEvent(provider, payload, eventId) {
    // Check for duplicate (idempotency)
    if (eventId) {
      const alreadyProcessed = await SubscriptionRepository.isWebhookProcessed(eventId);
      if (alreadyProcessed) {
        return { status: 'duplicate', processed: false };
      }
    }

    const transactionReference =
      payload.txn_ref || payload.tx_ref || payload.reference || payload.orderNo || payload.txRef;
    const eventType = (payload.event || payload.eventType || payload.type || '').toLowerCase();

    if (!transactionReference) {
      return { status: 'ignored', reason: 'No transaction reference' };
    }

    // Find subscription
    const subscription = await SubscriptionRepository.findByTransactionReference(transactionReference);

    if (!subscription) {
      return { status: 'ignored', reason: 'Subscription not found' };
    }

    // Determine new status based on event
    let newStatus = subscription.status;
    let shouldActivateMerchant = false;

    if (eventType === 'payment_completed' || payload.status === 'COMPLETED') {
      newStatus = 'active';
      shouldActivateMerchant = true;
    } else if (eventType === 'payment_failed') {
      newStatus = 'canceled';
    }

    // Update subscription
    const updateFields = {
      status: newStatus,
      verifiedAt: new Date(),
      gatewayResponse: payload,
      webhookReceivedAt: new Date(),
    };

    if (eventId) {
      updateFields.webhookEventId = eventId;
    }

    const updated = await SubscriptionRepository.updateSubscriptionById(
      subscription._id,
      updateFields
    );

    // Activate merchant if payment succeeded
    if (shouldActivateMerchant) {
      await SubscriptionRepository.updateMerchantSubscription(subscription.merchant, {
        subscriptionPlan: subscription.plan,
        isSubscriptionActive: true,
        status: 'approved',
        mode: 'Live',
      });
    }

    return {
      status: 'processed',
      subscription: updated,
      merchantActivated: shouldActivateMerchant,
    };
  }

  /**
   * Check and expire old subscriptions
   * 
   * Called periodically to update expired subscriptions
   */
  static async expireOldSubscriptions() {
    const expired = await SubscriptionRepository.getExpiredSubscriptions();

    for (const sub of expired) {
      await SubscriptionRepository.updateSubscriptionById(sub._id, {
        status: 'expired',
      });

      await SubscriptionRepository.updateMerchantSubscription(sub.merchant, {
        isSubscriptionActive: false,
      });
    }

    return { expired: expired.length };
  }

  /**
   * Get subscriptions expiring soon (for notifications)
   */
  static async getExpiringSubscriptions(daysAhead = 7) {
    return SubscriptionRepository.getExpiringSubscriptions(daysAhead);
  }

  /**
   * Renew subscription
   * 
   * Called to extend an existing subscription
   */
  static async renewSubscription(merchantId, durationMonths = 1) {
    const currentSub = await SubscriptionRepository.findByMerchant(merchantId);

    if (!currentSub) {
      throw new Error('No active subscription to renew');
    }

    const activeFeatures = Array.isArray(currentSub.features) ? currentSub.features : [];
    const amount = activeFeatures.length
      ? this.calculateSubscriptionAmount(activeFeatures, durationMonths)
      : 0;

    const newEndDate = new Date(currentSub.endDate);
    newEndDate.setMonth(newEndDate.getMonth() + durationMonths);

    const renewal = await SubscriptionRepository.createSubscription({
      merchant: merchantId,
      plan: currentSub.plan || 'feature',
      features: activeFeatures,
      amount,
      currency: currentSub.currency || 'ETB',
      transactionReference: `renewal-${merchantId}-${Date.now()}`,
      status: 'active',
      paymentProvider: currentSub.paymentProvider,
      startDate: new Date(),
      endDate: newEndDate,
    });

    await SubscriptionRepository.updateMerchantSubscription(merchantId, {
      currentSubscription: renewal._id,
      isSubscriptionActive: true,
      status: 'approved',
      mode: 'Live',
      subscriptionPlan: renewal.plan,
    });

    return renewal;
  }

  /**
   * Get subscription statistics
   */
  static async createTrialSubscription(merchantId) {
    const existing = await this.getActiveSubscription(merchantId);
    if (existing && this.isSubscriptionCurrentlyActive(existing)) {
      throw new Error('An active subscription or trial already exists for this merchant');
    }

    const tx_ref = `trial-${merchantId}-${Date.now()}`;
    const startDate = new Date();
    const endDate = this.calculateEndDate(trialDurationMonths);

    const subscription = await SubscriptionRepository.createSubscription({
      merchant: merchantId,
      plan: 'trial',
      features: trialFeatureSet,
      amount: 0,
      currency: 'ETB',
      transactionReference: tx_ref,
      status: 'active',
      isTrial: true,
      trialStartDate: startDate,
      trialEndDate: endDate,
      startDate,
      endDate,
      paymentProvider: 'manual',
    });

    await SubscriptionRepository.updateMerchantSubscription(merchantId, {
      currentSubscription: subscription._id,
      isSubscriptionActive: true,
      status: 'approved',
      mode: 'Trial',
      subscriptionPlan: 'trial',
    });

    return subscription;
  }

  static async getSubscriptionStats() {
    return SubscriptionRepository.getSubscriptionStats();
  }
}

module.exports = { SubscriptionService };
