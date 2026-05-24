const axios = require('axios');
const crypto = require('crypto');
const Subscription = require('../models/subscriptionModel');
const Merchant = require('../models/merchantModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { getKispayConfig } = require('../src/infrastructure/payments/kispay.config'); 

const calculateEndDate = (months = 1) => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
};


const verifySignature = (rawBody, signatureHeader) => {
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

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(sig, 'hex')
  );
};


exports.initiateSubscription = catchAsync(async (req, res, next) => {
  const { plan, durationMonths = 1 } = req.body;
  const merchantId = req.user.merchant._id;

  const merchant = await Merchant.findById(merchantId);

  if (!merchant) {
    return next(new AppError('Merchant account not found. Please log in again.', 404));
  }

  const phoneNumber = merchant.phone || req.body.phone;

  if (!phoneNumber) {
    return next(new AppError('Phone number is required for payment initialization.', 400));
  }

  const pricing = { basic: 1, pro: 1, enterprise: 1 };

  if (!pricing[plan]) {
    return next(new AppError('Invalid subscription plan selected.', 400));
  }

  const amount = pricing[plan] * durationMonths;
  const tx_ref = `tx-${merchantId}-${Date.now()}`;

  const payload = {
    amount: amount.toString(),
    email: merchant.email || req.user.email,
    description: "samsung",
    fullName: merchant.businessName || req.user.fullName?.split(' ')[0] || 'Merchant',
    phone: phoneNumber,
    orderNo: tx_ref,
    successUrl: 'https://tirusolutions.et/payment-success',
    cancelUrl: 'https://tirusolutions.et/payment-cancel',
    errorUrl: 'https://tirusolutions.et/payment-error',
    redirectUrl: 'https://tirusolutions.et/payment-success',
  };

  const kispay = getKispayConfig();

  const response = await axios.post(
    `${kispay.apiBaseUrl}/api/checkout/create_checkout_session`,
    payload,
    {
      headers: { 'Content-Type': 'application/json', 'x-api-key': kispay.apiKey },
    }
  );

  const session = response.data.body;

  await Subscription.create({
    merchant: merchantId,
    plan,
    amount,
    transactionReference: tx_ref,
    status: 'pending',                    // ← changed from 'expired' to 'pending'
    paymentProvider: 'kispay',
    endDate: calculateEndDate(durationMonths),
  });

  res.status(200).json({
    status: 'success',
    data: {
      session, 
      checkout_url: session.checkout_url,
      tx_ref,
    },
  });
});


exports.verifySubscription = catchAsync(async (req, res, next) => {
  const { tx_ref } = req.body;

  if (!tx_ref) {
    return next(new AppError('Transaction reference is missing.', 400));
  }

  const kispay = getKispayConfig();

  const response = await axios.get(
    `${kispay.apiBaseUrl}/api/checkout/verify_transaction/${tx_ref}`,
    { headers: { 'x-api-key': kispay.apiKey } }
  );

  const paymentData = response.data.body;

  // More flexible status check
  if (
    response.data.status !== 'success' ||
    !['COMPLETED', 'SUCCESS', 'completed'].includes(paymentData.status?.toUpperCase?.())
  ) {
    return next(new AppError('Payment not completed yet or failed.', 400));
  }

  const subscription = await Subscription.findOneAndUpdate(
    { transactionReference: tx_ref },
    {
      status: 'active',
      verifiedAt: Date.now(),
    },
    { new: true }
  );

  if (!subscription) {
    return next(new AppError('Subscription record not found.', 404));
  }

  await Merchant.findByIdAndUpdate(subscription.merchant, {
    subscriptionPlan: subscription.plan,
    isSubscriptionActive: true,
    status: 'approved',
    mode: 'Live',
  });

  res.status(200).json({
    status: 'success',
    message: 'Subscription activated successfully!',
  });
});

// ──────────────────────────────────────────────────────────────
// 3. Get current active subscription status
// ──────────────────────────────────────────────────────────────
exports.getSubscriptionStatus = catchAsync(async (req, res, next) => {
  const sub = await Subscription.findOne({
    merchant: req.user.merchant._id,
    status: 'active',
  }).sort({ createdAt: -1 });

  if (!sub) {
    return next(new AppError('No active subscription found for this merchant.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: sub,
  });
});

// ──────────────────────────────────────────────────────────────
// 4. Kispay Webhook Handler (real-time update – most important)
// ──────────────────────────────────────────────────────────────
exports.kispayWebhook = catchAsync(async (req, res, next) => {
  // 1. Verify signature
  const signature = req.headers['x-kispay-signature'];
  const eventId = req.headers['x-kispay-event-id'] || null;


    const signature2 = req.headers['x-kispay-signature']; // Lowercase, hex
    const eventIdHeader = req.headers['x-kispay-event-id']; // Lowercase, for payment webhooks
    const timestamp = req.headers['x-kispay-timestamp']; // Optional
    const apiVersionHeader = req.headers['x-kispay-api-version'];
   const receivedAt = new Date().toISOString();
  console.log(`[${receivedAt}] 🔍 Headers: signature=${signature2?.substring(0, 16)}..., eventId=${eventIdHeader}, apiVersion=${apiVersionHeader}, timestamp=${timestamp}`);
  if (!signature) {
        console.log(`[${receivedAt}] ❌ Missing x-kispay-signature`);
        return res.status(400).json({ error: 'Missing x-kispay-signature header' });
    }
  const isValid = verifySignature(req.body, signature);

   

  if (!isValid) {
    console.error('[Kispay Webhook] Invalid signature', {
      signature: signature?.substring(0, 16) + '...' || 'missing',
      receivedAt: new Date().toISOString(),
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 2. Parse payload
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf-8'));
   } catch (err) {
    console.error('[Kispay Webhook] Invalid JSON', err.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }
 console.log(payload)
  const eventType = (payload.event || payload.eventType || 'unknown').toLowerCase();
  const kispayRef = payload.txn_ref; // 'K2WGUP5R4Z'
  const kispayOrderId = payload.orderId;

  console.log(`[Kispay Webhook] Verified → ${eventType} | tx_ref: ${kispayRef || 'missing'} | event_id: ${eventId || 'none'}`);

  if (!kispayRef) {
    return res.status(200).json({ status: 'received', note: 'no tx_ref' });
  }

  // Optional: simple idempotency (prevents double activation)
  if (eventId) {
    const alreadyProcessed = await Subscription.findOne({ webhookEventId: eventId });
    if (alreadyProcessed) {
      console.log(`[Kispay Webhook] Duplicate event ignored → ${eventId}`);
      return res.status(200).json({ status: 'duplicate' });
    }
  }

  // 3. Find subscription
  const subscription = await Subscription.findOne({ transactionReference: kispayRef });

  if (!subscription) {
    console.warn(`[Kispay Webhook] No subscription found for tx_ref: ${tx_ref}`);
    return res.status(200).json({ status: 'ignored' });
  }

  let newStatus = subscription.status;
  let shouldActivateMerchant = false;

  // Updated event mapping – prefer documented Kispay names + fallbacks
 if (eventType === 'PAYMENT_COMPLETED' || payload.status === 'COMPLETED') {
    newStatus = 'active';
    shouldActivateMerchant = true;
  } else if (eventType === 'PAYMENT_FAILED') {
    newStatus = 'canceled';
  }

  // 4. Update subscription
  const updateFields = {
    status: newStatus,
    verifiedAt: new Date(),
    gatewayResponse: payload,
    webhookReceivedAt: new Date(),
  };

  if (eventId) {
    updateFields.webhookEventId = eventId;
  }

  await Subscription.findByIdAndUpdate(subscription._id, updateFields);

  // 5. Activate merchant on success
  if (shouldActivateMerchant) {
    await Merchant.findByIdAndUpdate(subscription.merchant, {
      subscriptionPlan: subscription.plan,
      isSubscriptionActive: true,
      status: 'approved',
      mode: 'Live',
    });

    console.log(`[Kispay Webhook] Merchant activated → ${subscription.merchant}`);
  }

  res.status(200).json({ status: 'success' });
});