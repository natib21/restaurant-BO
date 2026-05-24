const AppError = require('../../common/errors');

function getKispayConfig() {
  const apiKey = process.env.KISPAY_API_KEY;
  const webhookSecret = process.env.KISPAY_WEBHOOK_SECRET;

  if (!apiKey || !webhookSecret) {
    throw new AppError('Payment provider is not configured', 503);
  }

  return {
    apiKey,
    clientId: process.env.KISPAY_CLIENT_ID,
    apiBaseUrl: process.env.KISPAY_API_BASE_URL || 'https://api.kispay.et',
    webhookSecret,
    webhookUrl:
      process.env.KISPAY_WEBHOOK_URL ||
      `${process.env.APP_URL || 'http://localhost:3000'}/api/v1/subscriptions/webhooks/kispay`,
  };
}

module.exports = { getKispayConfig };
