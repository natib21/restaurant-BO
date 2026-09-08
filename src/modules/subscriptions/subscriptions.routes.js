/**
 * Subscriptions Module Routes
 *
 * Routing for subscription management:
 * - Initiate payment
 * - Verify payment
 * - Check subscription status
 * - Feature access gating
 * - Webhook handling
 */

const express = require('express');
const router = express.Router({ mergeParams: true });

const subscriptionController = require('./controllers/subscription.controller');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const validate = require('../../common/middleware/validate.middleware');

const {
  initiateSubscriptionSchema,
  verifySubscriptionSchema,
  checkFeatureAccessSchema,
} = require('./dto/subscription.dto');

// ============================================================
// PUBLIC ROUTES (before auth)
// ============================================================

/**
 * POST /api/v1/subscriptions/webhook/:provider
 * Payment provider webhook handler - raw body for signature verification
 */
router.post(
  '/webhook/:provider',
  express.raw({ type: 'application/json' }), // Raw body for signature verification
  subscriptionController.handlePaymentWebhook
);

router.get('/catalog', subscriptionController.getFeatureCatalog);
// ============================================================
// AUTHENTICATED ROUTES (require JWT)
// ============================================================

router.use(protect);

/**
 * POST /api/v1/subscriptions/initiate
 * Start subscription payment process
 */
router.post(
  '/initiate',
  validate(initiateSubscriptionSchema, 'body'),
  subscriptionController.initiateSubscription
);

/**
 * POST /api/v1/subscriptions/verify
 * Verify payment completion and activate subscription
 */
router.post(
  '/verify',
  validate(verifySubscriptionSchema, 'body'),
  subscriptionController.verifySubscription
);

/**
 * POST /api/v1/subscriptions/trial
 * Activate a 3-month free trial with full feature access
 */
router.post('/trial', subscriptionController.createTrialSubscription);

/**
 * GET /api/v1/subscriptions/status
 * Get current subscription status
 */
router.get('/status', subscriptionController.getSubscriptionStatus);

/**
 * POST /api/v1/subscriptions/check-feature
 * Check feature access for merchant's plan
 */
router.post(
  '/check-feature',
  validate(checkFeatureAccessSchema, 'body'),
  subscriptionController.checkFeatureAccess
);

/**
 * POST /api/v1/subscriptions/renew
 * Renew existing subscription
 */
router.post('/renew', subscriptionController.renewSubscription);

// ============================================================
// ADMIN ROUTES (require admin role)
// ============================================================

/**
 * GET /api/v1/subscriptions/expiring-soon
 * Get subscriptions expiring soon (admin monitoring)
 */
router.get(
  '/expiring-soon',
  restrictTo('admin', 'superadmin'),
  subscriptionController.getExpiringSubscriptions
);

/**
 * GET /api/v1/subscriptions/stats
 * Get subscription statistics (admin only)
 */
router.get(
  '/stats',
  restrictTo('admin', 'superadmin'),
  subscriptionController.getSubscriptionStats
);

module.exports = router;
