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
const crypto = require('crypto');
const { SubscriptionRepository } = require('../repositories/subscription.repository');
const { getKispayConfig } = require('../../../infrastructure/payments/kispay.config');
const {
  planPricingConfig,
  featureAccessMatrix,
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
   * @param {string} plan - Plan tier (basic, pro, enterprise)
   * @param {number} durationMonths - Duration in months
   * @param {Object} merchantData - Merchant object with email, phone, businessName
   * @returns {Object} { tx_ref, checkout_url, session }
   */
  static async initiateSubscription(merchantId, plan, durationMonths, merchantData) {
    // Validate plan
    if (!planPricingConfig[plan]) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    // Calculate amount and create transaction reference
    const amount = planPricingConfig[plan] * durationMonths;
    const tx_ref = `tx-${merchantId}-${Date.now()}`;

    // Build Kispay payload
    const payload = {
      amount: amount.toString(),
      email: merchantData.email,
      description: `${plan.toUpperCase()} Plan - ${durationMonths} month(s)`,
      fullName: merchantData.businessName || merchantData.fullName || 'Merchant',
      phone: merchantData.phone,
      orderNo: tx_ref,
      successUrl: 'https://tirusolutions.et/payment-success',
      cancelUrl: 'https://tirusolutions.et/payment-cancel',
      errorUrl: 'https://tirusolutions.et/payment-error',
      redirectUrl: 'https://tirusolutions.et/payment-success',
    };

    // Call Kispay API
    const kispay = getKispayConfig();
    const response = await axios.post(
      `${kispay.apiBaseUrl}/api/checkout/create_checkout_session`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': kispay.apiKey,
        },
      }
    );

    const session = response.data.body;

    // Create subscription record with pending status
    const subscription = await SubscriptionRepository.createSubscription({
      merchant: merchantId,
      plan,
      amount,
      transactionReference: tx_ref,
      status: 'pending',
      paymentProvider: 'kispay',
      endDate: this.calculateEndDate(durationMonths),
    });

    return {
      tx_ref,
      checkout_url: session.checkout_url,
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
    const kispay = getKispayConfig();

    // Call Kispay to verify transaction
    const response = await axios.get(
      `${kispay.apiBaseUrl}/api/checkout/verify_transaction/${tx_ref}`,
      { headers: { 'x-api-key': kispay.apiKey } }
    );

    const paymentData = response.data.body;

    // Check if payment completed
    if (
      response.data.status !== 'success' ||
      !['COMPLETED', 'SUCCESS', 'completed'].includes(paymentData.status?.toUpperCase?.())
    ) {
      throw new Error('Payment not completed or failed');
    }

    // Find and update subscription
    const subscription = await SubscriptionRepository.findByTransactionReference(tx_ref);

    if (!subscription) {
      throw new Error('Subscription record not found');
    }

    // Update subscription to active
    const updated = await SubscriptionRepository.updateSubscriptionById(
      subscription._id,
      {
        status: 'active',
        verifiedAt: new Date(),
        gatewayResponse: paymentData,
      }
    );

    // Update merchant subscription info
    await SubscriptionRepository.updateMerchantSubscription(subscription.merchant, {
      subscriptionPlan: subscription.plan,
      isSubscriptionActive: true,
      status: 'approved',
      mode: 'Live',
    });

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
      status: subscription.status,
      endDate: subscription.endDate,
      isActive: this.isSubscriptionCurrentlyActive(subscription),
      daysRemaining: this.calculateDaysRemaining(subscription.endDate),
    };
  }

  /**
   * Check if merchant has feature access
   * 
   * Validates if merchant's plan includes requested feature
   */
  static async checkFeatureAccess(merchantId, feature) {
    const subscription = await SubscriptionRepository.findByMerchant(merchantId);

    if (!subscription || !this.isSubscriptionCurrentlyActive(subscription)) {
      return { hasAccess: false, reason: 'No active subscription' };
    }

    const planFeatures = featureAccessMatrix[subscription.plan];

    if (!planFeatures || !(feature in planFeatures)) {
      return { hasAccess: false, reason: 'Feature not found in plan' };
    }

    const featureValue = planFeatures[feature];

    // Handle boolean features
    if (typeof featureValue === 'boolean') {
      return { hasAccess: featureValue };
    }

    // Handle unlimited or numeric features
    return { hasAccess: featureValue !== false };
  }

  /**
   * Verify webhook signature from Kispay
   * 
   * Ensures webhook is authentic from Kispay
   */
  static verifyWebhookSignature(rawBody, signatureHeader) {
    if (!signatureHeader) {
      throw new Error('Missing x-kispay-signature header');
    }

    let sig = signatureHeader;
    if (sig.startsWith('sha256=')) {
      sig = sig.slice(7);
    }

    const { webhookSecret } = getKispayConfig();
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(rawBody);
    const expected = hmac.digest('hex');

    const valid = crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(sig, 'hex')
    );

    return valid;
  }

  /**
   * Handle Kispay webhook event
   * 
   * Processes payment events from Kispay (payment completed, failed, etc.)
   */
  static async handleWebhookEvent(payload, eventId) {
    // Check for duplicate (idempotency)
    if (eventId) {
      const alreadyProcessed = await SubscriptionRepository.isWebhookProcessed(eventId);
      if (alreadyProcessed) {
        return { status: 'duplicate', processed: false };
      }
    }

    const kispayRef = payload.txn_ref;
    const eventType = (payload.event || payload.eventType || '').toLowerCase();

    if (!kispayRef) {
      return { status: 'ignored', reason: 'No txn_ref' };
    }

    // Find subscription
    const subscription = await SubscriptionRepository.findByTransactionReference(kispayRef);

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

    // Calculate new end date
    const newEndDate = new Date(currentSub.endDate);
    newEndDate.setMonth(newEndDate.getMonth() + durationMonths);

    // Create new subscription record for renewal
    const renewal = await SubscriptionRepository.createSubscription({
      merchant: merchantId,
      plan: currentSub.plan,
      amount: planPricingConfig[currentSub.plan] * durationMonths,
      transactionReference: `renewal-${merchantId}-${Date.now()}`,
      status: 'active',
      paymentProvider: currentSub.paymentProvider,
      endDate: newEndDate,
    });

    return renewal;
  }

  /**
   * Get subscription statistics
   */
  static async getSubscriptionStats() {
    return SubscriptionRepository.getSubscriptionStats();
  }
}

module.exports = { SubscriptionService };
