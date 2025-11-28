// utils/secureQR.js
/**
 * Secure QR Code Generator (Reusable Forever – No Sticker Replacement)
 *
 *
 * Features:
 * - Reusable QR: Print once → use forever
 * - HMAC-SHA256 signed payload → impossible to forge
 * - Deep link embedded directly in QR
 * - No nonce → no database bloat, no replacement needed
 */
const crypto = require('crypto');
const Merchant = require('../models/merchantModel');
const QRCode = require('qrcode');
/**
 * Generate a permanent, secure, reusable QR code for a table
 * @param {String|ObjectId} merchantId - Merchant ID
 * @param {String|ObjectId} tableId    - Table ID
 * @returns {Object} { qrImage, data, signature, url }
 */

const generateSecureQR = async (merchantId, tableId) => {
  // 1. Fetch merchant with secret key (hidden by default)
  const merchant = await Merchant.findById(merchantId).select('+qr_secret_key');
  if (!merchant || !merchant.qr_secret_key) {
    throw new Error('Merchant QR secret key not configured. Run merchant creation again.');
  }

  // 2. Payload — only merchant + table (no nonce = reusable forever)
  const payload = {
    m: merchantId.toString(), // merchant ID
    t: tableId.toString(), // table ID
    // No 'n' (nonce) → QR never expires or gets invalidated
  };

  // 3. Serialize & encode payload
  const payloadString = JSON.stringify(payload);
  const data = Buffer.from(payloadString).toString('base64url'); // URL-safe base64

  // 4. Sign with merchant's secret key (HMAC-SHA256)
  const signature = crypto
    .createHmac('sha256', merchant.qr_secret_key)
    .update(payloadString)
    .digest('hex');

  // 5. Full deep link URL (this is what goes into the QR code)
  const url = `${process.env.CUSTOMER_APP_URL}/api/v1/customerSession/start-session?data=${data}&s=${signature}`;
  // Example: myapp://table?data=eyJtIjoiNjc...&s=a1b2c3d4e5...

  // 6. Generate high-quality QR code
  const qrImage = await QRCode.toDataURL(url, {
    width: 500,
    margin: 4,
    errorCorrectionLevel: 'H', // Highest error correction (survives damage)
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  // 7. Return everything needed
  return {
    qrImage, // base64 PNG → save directly to DB or send to frontend
    data, // encoded payload (for regeneration or logging)
    signature, // HMAC signature (for verification)
    url, // full deep link (great for preview/debugging)
  };
};

module.exports = { generateSecureQR };
