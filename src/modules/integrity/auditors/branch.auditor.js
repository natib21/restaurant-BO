const mongoose = require('mongoose');
const Branch = require('../../../../models/branchModel');
const Order = require('../../../../models/orderModel');
const Table = require('../../../../models/tabelModel');
const { createIssue, capIssues } = require('../integrity-report');
const { INTEGRITY_SAMPLE_LIMIT } = require('../integrity.constants');

function merchantFilter(merchantId) {
  return merchantId ? { merchant: new mongoose.Types.ObjectId(merchantId) } : {};
}

async function auditBranches({ merchantId } = {}) {
  const issues = [];
  const base = merchantFilter(merchantId);

  const branches = await Branch.find(base).select('_id merchant isActive').lean();
  const branchIds = new Set(branches.map(b => b._id.toString()));
  const branchMap = new Map(branches.map(b => [b._id.toString(), b]));

  if (merchantId && branches.length === 0) {
    issues.push(
      createIssue({
        module: 'branch',
        type: 'missing',
        severity: 'warning',
        entityId: merchantId,
        message: 'Merchant has no branches configured',
        suggestion: 'Create at least one branch before enabling dine-in ordering.',
        production_best_practice:
          'Seed main branch on merchant signup; enforce branchId on all operational documents at write time.',
      })
    );
  }

  if (branchIds.size > 0) {
    const orphanOrders = await Order.find({
      ...base,
      branch: { $nin: [...branchIds].map(id => new mongoose.Types.ObjectId(id)) },
    })
      .select('_id orderNumber branch merchant')
      .limit(INTEGRITY_SAMPLE_LIMIT)
      .lean();

    for (const order of orphanOrders) {
      issues.push(
        createIssue({
          module: 'branch',
          type: 'orphan_reference',
          severity: 'critical',
          entityId: order._id,
          message: `Order ${order.orderNumber} references missing or cross-tenant branch ${order.branch}`,
          suggestion: 'Reassign order to valid branch or archive invalid order.',
          production_best_practice:
            'Enforce FK-like validation in OrderTransactionService; use compound index { merchant, branch } on queries.',
        })
      );
    }
  }

  const tables = await Table.find(base).select('_id tableNumber branch merchant isActive').lean();
  for (const table of tables) {
    if (!branchIds.has(table.branch?.toString())) {
      issues.push(
        createIssue({
          module: 'branch',
          type: 'orphan_reference',
          severity: 'critical',
          entityId: table._id,
          message: `Table ${table.tableNumber} references invalid branch ${table.branch}`,
          suggestion: 'Delete orphan table or attach to existing branch.',
          production_best_practice:
            'Cascade soft-delete tables when branch deactivates; block QR generation for invalid branches.',
        })
      );
    }
  }

  for (const branch of branches.filter(b => !b.isActive)) {
    const activeTables = await Table.countDocuments({
      branch: branch._id,
      isActive: true,
      status: { $in: ['available', 'occupied'] },
    });
    if (activeTables > 0) {
      issues.push(
        createIssue({
          module: 'branch',
          type: 'invalid_state',
          severity: 'warning',
          entityId: branch._id,
          message: `Inactive branch ${branch._id} still has ${activeTables} active table(s) in use`,
          suggestion: 'Deactivate tables or reactivate branch.',
          production_best_practice:
            'Branch lifecycle hooks should disable child resources (tables, sessions) atomically.',
        })
      );
    }
  }

  void branchMap;

  return capIssues(issues);
}

module.exports = { auditBranches };
