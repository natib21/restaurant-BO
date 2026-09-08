const mongoose = require('mongoose');
const Role = require('../../../../models/roleModel');
const Task = require('../../../../models/taskModel');
const { createIssue, capIssues } = require('../integrity-report');
const { INTEGRITY_SAMPLE_LIMIT } = require('../integrity.constants');

const ORDER_STATUS_TASK_HINT = '/api/v1/order';
const KITCHEN_ROLE_PATTERN = /KITCHEN/i;
const WAITER_ROLE_PATTERN = /WAITER/i;

function merchantFilter(merchantId) {
  const filter = merchantId ? { merchant: new mongoose.Types.ObjectId(merchantId) } : {};
  return filter;
}

function inferRoleCategory(roleName) {
  const name = (roleName || '').toUpperCase();
  if (name === 'SUPER-ADMIN' || name.includes('SUPER-ADMIN')) return 'superAdmin';
  if (KITCHEN_ROLE_PATTERN.test(name)) return 'kitchen';
  if (WAITER_ROLE_PATTERN.test(name)) return 'waiter';
  if (name.includes('ADMIN')) return 'admin';
  return 'unknown';
}

async function auditRoles({ merchantId } = {}) {
  const issues = [];
  const roleFilter = merchantId
    ? { $or: [{ merchant: merchantId }, { merchant: null }, { isSystemRole: true }] }
    : {};

  const [roles, tasks] = await Promise.all([
    Role.find(roleFilter).populate('tasks', 'endpoint method name').limit(INTEGRITY_SAMPLE_LIMIT),
    Task.find().select('_id endpoint method name').lean(),
  ]);

  const taskIds = new Set(tasks.map(t => t._id.toString()));

  for (const role of roles) {
    for (const task of role.tasks || []) {
      const tid = task?._id?.toString() || task?.toString();
      if (tid && !taskIds.has(tid)) {
        issues.push(
          createIssue({
            module: 'rbac',
            type: 'orphan_reference',
            severity: 'critical',
            entityId: role._id,
            message: `Role "${role.name}" references missing task ${tid}`,
            suggestion: 'Remove orphan task id from role or restore Task document.',
            production_best_practice:
              'Central permission registry with DB constraints; periodic RBAC sync job like this audit.',
          })
        );
      }
    }

    const category = inferRoleCategory(role.name);
    if (category === 'unknown' && !role.isSystemRole) {
      issues.push(
        createIssue({
          module: 'rbac',
          type: 'mismatch',
          severity: 'warning',
          entityId: role._id,
          message: `Role "${role.name}" does not match kitchen/waiter/admin naming — state machine may treat it as admin`,
          suggestion: 'Rename role to include KITCHEN, WAITER, or ADMIN for predictable guards.',
          production_best_practice:
            'Use role capability flags (canManageKitchen, canAcceptOrders) instead of string matching in production.',
        })
      );
    }

    const orderTasks = (role.tasks || []).filter(
      t => t.endpoint && t.endpoint.includes(ORDER_STATUS_TASK_HINT)
    );
    if (!role.isSystemRole && role.name !== 'SUPER-ADMIN' && orderTasks.length === 0) {
      issues.push(
        createIssue({
          module: 'rbac',
          type: 'missing',
          severity: 'warning',
          entityId: role._id,
          message: `Role "${role.name}" has no order-related task permissions`,
          suggestion: 'Assign order view/manage tasks if this role operates on orders.',
          production_best_practice:
            'RBAC at API layer (tasks) + domain layer (state machine) should share a permission matrix document.',
        })
      );
    }
  }

  const usedTaskIds = new Set();
  roles.forEach(r => (r.tasks || []).forEach(t => usedTaskIds.add((t._id || t).toString())));

  const orphanTasks = tasks.filter(
    t => t.endpoint?.includes('/order') && !usedTaskIds.has(t._id.toString())
  );
  if (orphanTasks.length > 5) {
    issues.push(
      createIssue({
        module: 'rbac',
        type: 'orphan_reference',
        severity: 'warning',
        entityId: 'tasks',
        message: `${orphanTasks.length} order-related tasks are not assigned to any role`,
        suggestion: 'Run seeder assignMissingTasks or assign to appropriate roles.',
        production_best_practice:
          'Treat tasks as permission catalog; roles are groupings — audit unused permissions quarterly.',
      })
    );
  }

  return capIssues(issues);
}

module.exports = { auditRoles };
