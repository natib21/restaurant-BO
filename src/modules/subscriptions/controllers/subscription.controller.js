/**
 * Subscriptions Controller
 * 
 * HTTP request/response handling only.
 * All business logic delegated to SubscriptionService.
 * All data validation via Zod schemas in middleware.
 */

const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { SubscriptionService } = require('../services/subscription.service');

/**
 * POST /api/v1/subscriptions/initiate
 * 
 * Initiate subscription payment via Kispay
 * 
 * Body: { plan, durationMonths, phone? }
 * Response: { checkout_url, tx_ref }
 */
exports.initiateSubscription = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const { plan, durationMonths = 1, phone } = req.body;

  // Get merchant data for payment payload
  const Merchant = require('../../../../models/merchantModel');
  const merchant = await Merchant.findById(merchantId);

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  // Initiate subscription
  const result = await SubscriptionService.initiateSubscription(
    merchantId,
    plan,
    durationMonths,
    {
      email: merchant.email,
      phone: phone || merchant.phone,
      businessName: merchant.businessName,
      fullName: req.user?.fullName,
    }
  );

  res.status(200).json({
    status: 'success',
    data: {
      tx_ref: result.tx_ref,
      checkout_url: result.checkout_url,
    },
  });
});

/**
 * POST /api/v1/subscriptions/verify
 * 
 * Verify payment completion after redirect
 * 
 * Body: { tx_ref }
 * Response: { message, subscription }
 */
exports.verifySubscription = catchAsync(async (req, res, next) => {
  const { tx_ref } = req.body;

  try {
    const subscription = await SubscriptionService.verifySubscription(tx_ref);

    res.status(200).json({
      status: 'success',
      message: 'Subscription activated successfully!',
      data: {
        subscription: {
          _id: subscription._id,
          plan: subscription.plan,
          status: subscription.status,
          endDate: subscription.endDate,
        },
      },
    });
  } catch (error) {
    return next(new AppError(error.message || 'Payment verification failed', 400));
  }
});

/**
 * GET /api/v1/subscriptions/status
 * 
 * Get current subscription status for merchant
 * 
 * Response: { plan, status, endDate, isActive, daysRemaining }
 */
exports.getSubscriptionStatus = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);

  try {
    const status = await SubscriptionService.getSubscriptionStatus(merchantId);

    res.status(200).json({
      status: 'success',
      data: {
        subscription: status,
      },
    });
  } catch (error) {
    return next(new AppError(error.message, 404));
  }
});

/**
 * POST /api/v1/subscriptions/check-feature
 * 
 * Check if merchant has access to a feature
 * 
 * Body: { feature }
 * Response: { hasAccess, reason? }
 */
exports.checkFeatureAccess = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { feature } = req.body;

  const result = await SubscriptionService.checkFeatureAccess(merchantId, feature);

  res.status(200).json({
    status: 'success',
    data: {
      feature,
      hasAccess: result.hasAccess,
      ...(result.reason && { reason: result.reason }),
    },
  });
});

/**
 * POST /api/v1/subscriptions/webhook
 * 
 * Kispay webhook handler (real-time payment updates)
 * 
 * Headers: x-kispay-signature, x-kispay-event-id
 * Body: Kispay webhook payload
 */
exports.handleKispayWebhook = catchAsync(async (req, res, next) => {
  const signature = req.headers['x-kispay-signature'];
  const eventId = req.headers['x-kispay-event-id'];

  if (!signature) {
    return res.status(400).json({ error: 'Missing x-kispay-signature header' });
  }

  // Verify webhook signature
  try {
    const isValid = SubscriptionService.verifyWebhookSignature(req.body, signature);

    if (!isValid) {
      console.error('[Subscription Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('[Subscription Webhook] Signature verification failed:', error.message);
    return res.status(400).json({ error: 'Signature verification failed' });
  }

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf-8'));
  } catch (err) {
    console.error('[Subscription Webhook] Invalid JSON');
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log('[Subscription Webhook] Verified event:', payload);

  // Process webhook event
  try {
    const result = await SubscriptionService.handleWebhookEvent(payload, eventId);

    if (result.status === 'duplicate') {
      console.log('[Subscription Webhook] Duplicate event ignored');
      return res.status(200).json({ status: 'duplicate' });
    }

    if (result.status === 'ignored') {
      console.log('[Subscription Webhook] Event ignored:', result.reason);
      return res.status(200).json({ status: 'ignored', reason: result.reason });
    }

    console.log('[Subscription Webhook] Event processed successfully');
    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('[Subscription Webhook] Processing failed:', error.message);
    // Return 200 to avoid retry, but log the error
    return res.status(200).json({ status: 'processed_with_error', error: error.message });
  }
});

/**
 * GET /api/v1/subscriptions/expiring-soon
 * 
 * Get subscriptions expiring in next 7 days (admin/monitoring)
 * 
 * Response: { subscriptions: [...] }
 */
exports.getExpiringSubscriptions = catchAsync(async (req, res) => {
  const daysAhead = parseInt(req.query.days) || 7;

  const subscriptions = await SubscriptionService.getExpiringSubscriptions(daysAhead);

  res.status(200).json({
    status: 'success',
    count: subscriptions.length,
    data: {
      subscriptions: subscriptions.map(sub => ({
        _id: sub._id,
        merchant: sub.merchant,
        plan: sub.plan,
        endDate: sub.endDate,
        daysRemaining: SubscriptionService.calculateDaysRemaining(sub.endDate),
      })),
    },
  });
});

/**
 * POST /api/v1/subscriptions/renew
 * 
 * Renew an existing subscription
 * 
 * Body: { durationMonths }
 * Response: { subscription }
 */
exports.renewSubscription = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const { durationMonths = 1 } = req.body;

  try {
    const renewal = await SubscriptionService.renewSubscription(merchantId, durationMonths);

    res.status(200).json({
      status: 'success',
      message: 'Subscription renewed successfully',
      data: {
        subscription: {
          _id: renewal._id,
          plan: renewal.plan,
          endDate: renewal.endDate,
        },
      },
    });
  } catch (error) {
    return next(new AppError(error.message, 400));
  }
});

/**
 * GET /api/v1/subscriptions/stats (admin only)
 * 
 * Get subscription statistics
 * 
 * Response: { stats: [...] }
 */
exports.getSubscriptionStats = catchAsync(async (req, res) => {
  const stats = await SubscriptionService.getSubscriptionStats();

  res.status(200).json({
    status: 'success',
    data: {
      stats,
    },
  });
});
