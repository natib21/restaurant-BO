const express = require('express');
const subscriptionController = require('../controllers/subscriptionController');
const authController = require('../controllers/authController');
const router = express.Router({ mergeParams: true });

// 1. INITIATE PAYMENT (Protected - merchant must be logged in)
// POST /api/v1/subscriptions/subscribe   (or /api/subscriptions/subscribe)
router.post('/subscribe', authController.protect, subscriptionController.initiateSubscription);

// 2. KISPAY WEBHOOK (Public - Kispay server → your server)
// POST /api/v1/subscriptions/webhooks/kispay
// Note: No auth middleware! Kispay doesn't send auth tokens.
// Alternative in subscriptionRoutes.js
/* router.post(
  '/webhooks/kispay',
  express.raw({ type: 'application/json' }),
  subscriptionController.kispayWebhook
);
 */
// 3. MANUAL VERIFICATION / FALLBACK (Protected - frontend calls after redirect)
// POST /api/v1/subscriptions/verify
// Note: This is the polling/redirect fallback — keep protected
router.post('/verify', authController.protect, subscriptionController.verifySubscription);

// 4. GET CURRENT SUBSCRIPTION STATUS (Protected)
// GET /api/v1/subscriptions/status
router.get('/status', authController.protect, subscriptionController.getSubscriptionStatus);

module.exports = router;