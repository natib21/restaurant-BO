/**
 * ❌ DEPRECATED: Chapa payment integration
 * 
 * This file is kept for future reference but is not currently used.
 * Manual payment only is supported at this time.
 * 
 * To re-enable:
 * 1. Uncomment Chapa case in payment-provider.interface.js
 * 2. Uncomment webhook route in subscriptions.routes.js
 * 3. Implement real Chapa API calls below (currently placeholders)
 * 4. Add Chapa environment variables
 * 5. Re-add 'chapa' to PAYMENT_PROVIDER enum in env.js
 */

const axios = require('axios');

function getChapaProvider() {
  return {
    name: 'chapa',
    createCheckoutSession: async ({ amount, merchantData, plan, durationMonths, tx_ref }) => {
      // Placeholder implementation for Chapa checkout session.
      // Replace with actual Chapa API integration when ready.
      return {
        checkout_url: null,
        payment_instructions: `Chapa checkout would be created for ${merchantData.email || merchantData.phone} with amount ${amount}.`,
        tx_ref,
        plan,
        durationMonths,
      };
    },
    verifyTransaction: async tx_ref => {
      // Placeholder verification for Chapa.
      // Replace with real Chapa transaction lookup when ready.
      return {
        status: 'PENDING',
        tx_ref,
      };
    },
    verifyWebhookSignature: (rawBody, signatureHeader) => {
      // Placeholder webhook verification for Chapa.
      // Implement HMAC or signature verification when the Chapa webhook spec is available.
      if (!signatureHeader) {
        throw new Error('Missing Chapa webhook signature header');
      }
      return true;
    },
  };
}

module.exports = { getChapaProvider };
