const mongoose = require('mongoose');
const Table = require('../../../../models/tabelModel');
const Branch = require('../../../../models/branchModel');
const CustomerSession = require('../../../../models/customerSessionModule');
const { createIssue, capIssues } = require('../integrity-report');
const { INTEGRITY_SAMPLE_LIMIT } = require('../integrity.constants');

function merchantFilter(merchantId) {
  return merchantId ? { merchant: new mongoose.Types.ObjectId(merchantId) } : {};
}

async function auditTables({ merchantId } = {}) {
  const issues = [];
  const base = merchantFilter(merchantId);

  const tables = await Table.find(base)
    .select('_id tableNumber branch merchant qrUrl isActive status')
    .limit(INTEGRITY_SAMPLE_LIMIT)
    .lean();

  const branches = await Branch.find(base).select('_id merchant').lean();
  const branchMerchant = new Map(branches.map(b => [b._id.toString(), b.merchant?.toString()]));

  const byBranchNumber = new Map();

  for (const table of tables) {
    const branchId = table.branch?.toString();
    const branchKey = `${branchId}:${table.tableNumber}`;

    if (byBranchNumber.has(branchKey)) {
      issues.push(
        createIssue({
          module: 'table',
          type: 'mismatch',
          severity: 'critical',
          entityId: table._id,
          message: `Duplicate tableNumber "${table.tableNumber}" within branch ${branchId}`,
          suggestion: 'Rename table or remove duplicate.',
          production_best_practice:
            'Enforce unique compound index { branch, tableNumber } at schema level.',
        })
      );
    } else {
      byBranchNumber.set(branchKey, table._id);
    }

    const expectedMerchant = branchMerchant.get(branchId);
    if (expectedMerchant && table.merchant?.toString() !== expectedMerchant) {
      issues.push(
        createIssue({
          module: 'table',
          type: 'mismatch',
          severity: 'critical',
          entityId: table._id,
          message: `Table ${table.tableNumber} merchant ${table.merchant} does not match branch merchant ${expectedMerchant}`,
          suggestion: 'Fix table.merchant to match branch tenant.',
          production_best_practice:
            'Derive merchantId from branch on write; never accept merchant from client for table CRUD.',
        })
      );
    }

    if (table.isActive && !table.qrUrl) {
      issues.push(
        createIssue({
          module: 'table',
          type: 'missing',
          severity: 'warning',
          entityId: table._id,
          message: `Active table ${table.tableNumber} has no qrUrl generated`,
          suggestion: 'Regenerate QR via table management endpoint.',
          production_best_practice:
            'Use signed QR tokens (HMAC) with branch qrSecretKey; store only token URL not raw table id.',
        })
      );
    }

    if (!table.isActive && table.status === 'occupied') {
      issues.push(
        createIssue({
          module: 'table',
          type: 'invalid_state',
          severity: 'warning',
          entityId: table._id,
          message: `Disabled table ${table.tableNumber} is still marked occupied`,
          suggestion: 'Free table or reactivate before service.',
          production_best_practice:
            'Table status should sync with CustomerSession lifecycle (end session → available).',
        })
      );
    }
  }

  const activeSessions = await CustomerSession.find({
    ...base,
    isActive: true,
  })
    .select('_id tableId branch merchant')
    .limit(INTEGRITY_SAMPLE_LIMIT)
    .lean();

  const tableIds = new Set(tables.map(t => t._id.toString()));

  for (const session of activeSessions) {
    const tid = session.tableId?.toString();
    if (tid && !tableIds.has(tid)) {
      issues.push(
        createIssue({
          module: 'table',
          type: 'orphan_reference',
          severity: 'critical',
          entityId: session._id,
          message: `Active customer session references missing table ${tid}`,
          suggestion: 'End session or restore table record.',
          production_best_practice:
            'Foreign-key validation on session start; TTL sessions to auto-expire orphaned state.',
        })
      );
    }
  }

  return capIssues(issues);
}

module.exports = { auditTables };
