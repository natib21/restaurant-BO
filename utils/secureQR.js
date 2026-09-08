// utils/secureQR.js

const crypto = require('crypto');
const Branch = require('../models/branchModel');
const QRCode = require('qrcode');

// utils/secureQR.js

const generateSecureQR = async (merchantId, branchId, tableId = null) => {
  // ✅ P0-001: IDOR Fix - Verify branch belongs to the merchant
  // Prevents tenant A from accessing tenant B's qrSecretKey
  const query = {
    _id: branchId,
    merchant: merchantId._id || merchantId,
    isActive: true
  };
  
  const branch = await Branch.findOne(query).select('+qrSecretKey');
  if (!branch || !branch.qrSecretKey) {
    throw new Error('Branch QR secret key missing. Contact support.');
  }

  const secretKey = branch.qrSecretKey;

  // Payload — tableId is optional
  const payload = {
    m: (merchantId._id || merchantId).toString(),
    b: (branchId._id || branchId).toString(),
    t: tableId ? (tableId._id || tableId).toString() : null,
  };
  const payloadString = JSON.stringify(payload);
  const data = Buffer.from(payloadString).toString('base64url');

  const signature = crypto.createHmac('sha256', secretKey).update(payloadString).digest('hex');

  const url = `${process.env.CUSTOMER_APP_URL}/qr?data=${data}&s=${signature}`;

  const qrImage = await QRCode.toDataURL(url, {
    width: 600,
    margin: 2, // Smaller margin looks more modern
    errorCorrectionLevel: 'Q', // 'Q' is a good balance between 'M' and 'H'
    color: {
      dark: '#0F172A', // Soft off-black/charcoal
      light: '#FFFFFF', // Pure white
    },
  });
  return {
    qrImage,
    data,
    signature,
    url,
  };
};

module.exports = { generateSecureQR };
