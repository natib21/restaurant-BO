// scripts/test-telegram-link.js
// One-off manual test script — not part of the app, just for trying the
// Telegram integration with a single merchant/customer before the
// link-token API endpoint exists.
//
// Usage: node scripts/test-telegram-link.js <merchantId> <customerId>
require('dotenv').config({ path: 'config.env' });
const mongoose = require('mongoose');
const { createLinkToken, buildDeepLink } = require('../src/modules/telegram/service/telegramService');
const Merchant = require('../models/merchantModel');

async function main() {
  const [merchantId, customerId] = process.argv.slice(2);
  if (!merchantId || !customerId) {
    console.error('Usage: node scripts/test-telegram-link.js <merchantId> <customerId>');
    process.exit(1);
  }

  await mongoose.connect(process.env.DATABASE_LOCAL);

  const merchant = await Merchant.findById(merchantId);
  if (!merchant) throw new Error('Merchant not found');
  if (!merchant.telegramBotUsername) throw new Error('Merchant has no connected Telegram bot yet — run /telegram/connect first');

  const token = await createLinkToken({ merchantId, customerId });
  const deepLink = buildDeepLink(merchant.telegramBotUsername, token);

  console.log('\nOpen this link in Telegram to test:\n');
  console.log(deepLink);
  console.log('\nToken expires in 24 hours.\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

// 8657325383:AAHbCP9_Z6i4m1TmzDywNQyWFI9i-i_lgAg