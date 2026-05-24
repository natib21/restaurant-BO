const crypto = require('crypto');
const AppError = require('../../../utils/appError');
const { BranchRepository } = require('./repository/BranchRepository');

/**
 * Canonical signed QR payload using branch qrSecretKey (HMAC).
 * Format matches customerSessionController verification.
 */
class QrTokenService {
  static buildPayload({ merchantId, branchId, tableId }) {
    return {
      m: String(merchantId),
      b: String(branchId),
      t: String(tableId),
    };
  }

  static serializePayload(payload) {
    return JSON.stringify(payload);
  }

  static async sign({ merchantId, branchId, tableId }) {
    const branch = await BranchRepository.findBranchById(branchId).select('+qrSecretKey');
    if (!branch?.qrSecretKey) {
      throw new AppError('Branch QR secret key missing', 404);
    }

    const payload = QrTokenService.buildPayload({ merchantId, branchId, tableId });
    const payloadString = QrTokenService.serializePayload(payload);
    const data = Buffer.from(payloadString).toString('base64url');
    const signature = crypto
      .createHmac('sha256', branch.qrSecretKey)
      .update(payloadString)
      .digest('hex');

    const baseUrl = process.env.CUSTOMER_APP_URL || process.env.APP_URL || '';
    const url = `${baseUrl}/qr?data=${data}&s=${signature}`;

    return { data, signature, url, payload };
  }

  static async verify({ data, signature }) {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    } catch {
      throw new AppError('Corrupted QR code', 400);
    }

    const { m: merchantId, b: branchId, t: tableId } = payload;
    if (!merchantId || !branchId || !tableId) {
      throw new AppError('QR missing data', 400);
    }

    const branch = await BranchRepository.findBranchById(branchId).select('+qrSecretKey');
    if (!branch?.qrSecretKey) {
      throw new AppError('Branch QR secret key missing', 404);
    }

    const payloadString = QrTokenService.serializePayload({ merchantId, branchId, tableId });
    const expected = crypto
      .createHmac('sha256', branch.qrSecretKey)
      .update(payloadString)
      .digest('hex');

    if (expected !== signature) {
      throw new AppError('Invalid QR signature', 403);
    }

    return { merchantId, branchId, tableId, payload };
  }
}

module.exports = { QrTokenService };
