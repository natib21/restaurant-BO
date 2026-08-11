const manualProvider = {
  name: 'manual',
  createCheckoutSession: async ({ amount, merchantData, plan, durationMonths, tx_ref }) => {
    return {
      checkout_url: null,
      payment_instructions: `Manual payment selected. Create a manual invoice for ${merchantData.email || merchantData.phone} with amount ${amount}.`,
      tx_ref,
      plan,
      durationMonths,
    };
  },
  verifyTransaction: async () => {
    throw new Error('Manual payment verification is not supported');
  },
  verifyWebhookSignature: () => {
    throw new Error('Webhook verification is not supported for manual payment provider');
  },
};

const { getChapaProvider } = require('./chapa.provider');

function getPaymentProvider(provider) {
  const normalized = String(provider || 'manual').toLowerCase();

  switch (normalized) {
    case 'manual':
      return manualProvider;
    case 'chapa':
      return getChapaProvider();
    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
}

module.exports = { getPaymentProvider };
