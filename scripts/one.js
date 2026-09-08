// scripts/one.js
const mongoose = require('mongoose');
const { loadEnv, getMongoUri } = require('../src/config/env');
const {
  SubscriptionRepository,
} = require('../src/modules/subscriptions/repositories/subscription.repository');
const {
  SubscriptionService,
} = require('../src/modules/subscriptions/services/subscription.service');
const Merchant = require('../models/merchantModel');

(async () => {
  loadEnv(); // loads config.env via dotenv internally
  const uri = getMongoUri();

  if (!uri) {
    console.error(
      'getMongoUri() returned nothing — check config.env for DATABASE_LOCAL / DATABASE / DATABASE_SECOND.'
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const merchants = await Merchant.find({ isSubscriptionActive: true });
  console.log(`Found ${merchants.length} active merchant(s) to sync`);

  for (const m of merchants) {
    const sub = await SubscriptionRepository.findByMerchant(m._id);
    if (!sub) {
      console.log(`skipped ${m.businessName} — no active subscription record`);
      continue;
    }
    await SubscriptionRepository.updateMerchantSubscription(m._id, {
      ...SubscriptionService.buildFeatureUpdateFields(sub.features),
    });
    console.log(`synced ${m.businessName}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
