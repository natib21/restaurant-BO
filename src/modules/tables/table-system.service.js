const Table = require('../../../models/tabelModel');
const CustomerSession = require('../../../models/customerSessionModule');
const AppError = require('../../../utils/appError');
const { QrTokenService } = require('./qr-token.service');
const logger = require('../../../utils/logger');

const TABLE_TRANSITIONS = {
  available: ['occupied', 'reserved', 'disabled'],
  occupied: ['available', 'needs-cleaning'],
  reserved: ['occupied', 'available'],
  'needs-cleaning': ['available'],
  disabled: ['available'],
};

class TableSystemService {
  static validateTransition(from, to) {
    if (from === to) return { noop: true };
    const allowed = TABLE_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw new AppError(`Invalid table status transition ${from} → ${to}`, 400);
    }
    return { noop: false };
  }

  static async transitionStatus({ tableId, merchantId, branchId, toStatus }) {
    const table = await Table.findOne({ _id: tableId, merchant: merchantId, branch: branchId });
    if (!table) throw new AppError('Table not found', 404);

    TableSystemService.validateTransition(table.status, toStatus);
    const previous = table.status;
    table.status = toStatus;
    await table.save({ validateBeforeSave: false });

    logger.info('table.status.transition', {
      tableId: String(tableId),
      from: previous,
      to: toStatus,
    });

    return { table, previous };
  }

  static async generateSignedQr(tableId, merchantId) {
    const table = await Table.findById(tableId).select('+qrSecret');
    if (!table || table.merchant.toString() !== String(merchantId)) {
      throw new AppError('Table not found', 404);
    }

    const token = await QrTokenService.sign({
      merchantId: table.merchant,
      branchId: table.branch,
      tableId: table._id,
    });

    table.qrUrl = token.url;
    table.qrGeneratedAt = new Date();
    await table.save({ validateBeforeSave: false });

    return { table, ...token };
  }

  static async validateTableForSession({ tableId, branchId, merchantId }) {
    const table = await Table.findOne({
      _id: tableId,
      branch: branchId,
      merchant: merchantId,
      isActive: true,
    });

    if (!table) throw new AppError('Table not found', 404);
    if (table.status === 'disabled') {
      throw new AppError('Table is disabled', 403);
    }

    return table;
  }

  static async getActiveSession(tableId) {
    return CustomerSession.findOne({
      table: tableId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
  }

  static verifyQrScan(query) {
    return QrTokenService.verify({
      data: query.data,
      signature: query.s,
    });
  }
}

module.exports = { TableSystemService };
