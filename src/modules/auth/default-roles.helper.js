/**
 * @file src/modules/auth/default-roles.helper.js
 * @description Helper to seed three default merchant roles (MANAGER, WAITER, KITCHEN) during signup.
 * 
 * These are system-created defaults (isSystemDefault: true) that merchants can fully customize or delete.
 * Roles are created within the signup transaction to ensure atomicity.
 */

const Role = require('../../../models/roleModel');
const Task = require('../../../models/taskModel');
const AppError = require('../../../utils/appError');

/**
 * Task name lists for each default role.
 * Names are looked up against the Task collection by name field.
 */
const DEFAULT_ROLE_TASKS = {
  MANAGER: [
    // Merchant staff/role management
    'merchants.roles.list',
    'merchants.roles.read',
    'merchants.users.list',
    'merchants.users.create',
    'merchants.users.read',
    'merchants.users.update',
    'merchants.users.listByBranch',
    'merchants.users.activate',
    'merchants.users.changeRole',
    'merchants.me.read',
    'merchants.me.update',

    // Menu management
    'menus.list',
    'menus.create',
    'menus.read',
    'menus.update',
    'menus.delete',
    'menus.toggleAvailability',
    'menus.publish',
    'menus.archive',
    'menus.getBranchPublications',
    'menu.publish',
    'menu.archiveItem',
    'menu.getBranchPublications',

    // Menu groups
    'menuGroups.listLight',
    'menuGroups.list',
    'menuGroups.create',
    'menuGroups.read',
    'menuGroups.update',
    'menuGroups.delete',
    'menuGroups.addItem',
    'menuGroups.removeItem',
    'menuGroups.reorder',

    // Branch menu groups
    'branchMenuGroups.list',
    'branchMenuGroups.create',
    'branchMenuGroups.read',
    'branchMenuGroups.update',
    'branchMenuGroups.delete',
    'branchMenuGroups.addItem',
    'branchMenuGroups.removeItem',
    'branchMenuGroups.reorder',

    // Combos
    'combos.list',
    'combos.create',
    'combos.read',
    'combos.update',
    'combos.delete',
    'combos.toggleActive',
    'combos.toggleBranch',
    'combos.updateBranchOverride',
    'combos.incrementSold',

    // Categories
    'categories.listActive',
    'categories.list',
    'categories.create',
    'categories.read',
    'categories.update',
    'categories.delete',
    'categories.restore',

    // Orders management
    'orders.placeStaff',
    'orders.listActive',
    'orders.listCompleted',
    'orders.listPending',
    'orders.listAccepted',
    'orders.listPreparing',
    'orders.listReady',
    'orders.listServed',
    'orders.listCanceled',
    'orders.getByNumber',
    'orders.getReviewQueue',
    'orders.markPaid',
    'orders.updateStatus',
    'orders.addItems',
    'orders.cancel',
    'orders.read',
    'orders.listActiveDeliveries',
    'orders.history',

    // Reports
    'reports.sales.read',
    'reports.orders.read',
    'reports.products.read',
    'reports.customers.read',
    'reports.delivery.read',
    'reports.profitability.read',
    'reports.staff.read',
    'reports.inventory.read',
    'reports.exports.create',
    'reports.exports.status',

    // Analytics
    'analytics.getDashboard',
    'analytics.sendMessage',

    // Audit logging
    'audit.logs.list',
    'audit.logs.view',
    'audit.logs.resource-history',
    'audit.logs.correlation',
    'audit.logs.export',
    'audit.logs.stats',

    // Tables
    'tables.list',
    'tables.create',
    'tables.read',
    'tables.update',
    'tables.delete',
    'tables.changeTable',
    'tables.regenerateQr',
    'tables.transitionStatus',
    'tables.listByBranch',

    // Sessions
    'sessions.freeTable',
    'sessions.list',
    'sessions.getByTable',

    // Inventory
    'inventory.adjustStock',
    'inventory.batchAdjust',
    'inventory.listMovements',
    'inventory.getValuation',
    'inventory.getLowStock',
    'inventory.setThresholds',
    'inventory.validateOrder',

    // Suppliers
    'suppliers.list',
    'suppliers.create',
    'suppliers.read',
    'suppliers.update',
    'suppliers.delete',

    // Recipes
    'recipes.list',
    'recipes.create',
    'recipes.read',
    'recipes.update',
    'recipes.delete',

    // Purchase Orders
    'purchaseOrders.list',
    'purchaseOrders.create',
    'purchaseOrders.read',
    'purchaseOrders.update',
    'purchaseOrders.delete',
    'purchaseOrders.receive',

    // Ingredients
    'ingredients.list',
    'ingredients.create',
    'ingredients.read',
    'ingredients.update',
    'ingredients.delete',

    // Payment Verification
    'paymentVerification.initiate',
    'paymentVerification.confirm',
    'paymentVerification.reject',
    'paymentVerification.list',
    'paymentVerification.read',
    'files.upload',

    // Customers
    'customers.list',
    'customers.listCrm',
    'customers.read',
    'customers.readCrm',
    'customers.update',
    'customers.delete',
    'customers.giveGift',
    'customers.addTagOrNote',

    // Feedback
    'feedback.listAll',
    'feedback.getStats',
    'feedback.read',
    'feedback.respond',
  ],

  WAITER: [
    // Menu (view-only for ordering)
    'menus.list',
    'menus.read',
    'menus.getStaff',

    // Menu groups (view-only for ordering)
    'menuGroups.listLight',
    'menuGroups.list',
    'menuGroups.read',

    // Branch menu groups (view-only for ordering)
    'branchMenuGroups.list',
    'branchMenuGroups.read',

    // Categories (view-only for ordering)
    'categories.listActive',
    'categories.list',
    'categories.read',

    // Orders (20 tasks)
    'orders.placeStaff',
    'orders.listActive',
    'orders.listCompleted',
    'orders.listPending',
    'orders.listAccepted',
    'orders.listPreparing',
    'orders.listReady',
    'orders.listServed',
    'orders.listCanceled',
    'orders.getByNumber',
    'orders.getReviewQueue',
    'orders.markPaid',
    'orders.updateStatus',
    'orders.addItems',
    'orders.cancel',
    'orders.read',
    'orders.listActiveDeliveries',
    'orders.history',
    'orders.items.serveReady',
    'orders.items.void',

    // Tables
    'tables.list',
    'tables.read',
    'tables.changeTable',
    'tables.transitionStatus',
    'tables.listByBranch',

    // Sessions
    'sessions.list',
    'sessions.getByTable',

    // Payment Verification (view only)
    'paymentVerification.list',
    'paymentVerification.read',

    // Customers (view only)
    'customers.list',
    'customers.read',
    'customers.listCrm',
    'customers.readCrm',
  ],

  KITCHEN: [
    // Kitchen Display System
    'kitchen.stations.list',
    'kitchen.stations.read',
    'kitchen.stations.create',
    'kitchen.stations.update',
    'kitchen.stations.delete',
    'kitchen.menuItems.assignStation',
    'kitchen.tickets.list',
    'kitchen.tickets.history',
    'kitchen.stations.tickets',
    'kitchen.orders.tickets',
    'kitchen.tickets.updateStatus',
    'kitchen.tickets.accept',
    'kitchen.tickets.start',
    'kitchen.tickets.ready',
    'kitchen.tickets.cancel',
    'kitchen.tickets.updateItemStatus',

    // Item Status Workflow
    'orders.items.updateStatus',
    'orders.items.serveReady',
    'orders.items.void',

    // Orders (view only)
    'orders.listActive',
    'orders.listPreparing',
    'orders.listReady',
    'orders.getByNumber',
    'orders.read',
    'orders.history',
  ],
};

/**
 * Seed three default roles (MANAGER, WAITER, KITCHEN) for a new merchant.
 * 
 * @param {ObjectId} merchantId - The merchant ID to create roles for
 * @param {ClientSession} session - MongoDB session for transactionality
 * @returns {Promise<Object>} Object with keys 'MANAGER', 'WAITER', 'KITCHEN', each a Role document
 * @throws {AppError} If any tasks are not found or role creation fails
 */
async function seedDefaultMerchantRoles(merchantId, session) {
  // Collect all unique task names across all three roles
  const allTaskNames = new Set();
  Object.values(DEFAULT_ROLE_TASKS).forEach(tasks => {
    tasks.forEach(task => allTaskNames.add(task));
  });

  // Look up all tasks by name in a single query
  const tasks = await Task.find({
    name: { $in: Array.from(allTaskNames) },
  }).session(session);

  // Build a map of taskName -> taskId for quick lookup
  const taskMap = new Map();
  tasks.forEach(task => {
    taskMap.set(task.name, task._id);
  });

  // Verify all required tasks were found
  const missingTasks = Array.from(allTaskNames).filter(name => !taskMap.has(name));
  if (missingTasks.length > 0) {
    throw new AppError(
      `Unable to seed default roles: tasks not found: ${missingTasks.join(', ')}. ` +
      'Run seed-roles-and-tasks.js first.',
      500
    );
  }

  // Create the three default roles
  const rolesToCreate = [
    {
      name: 'MANAGER',
      description: 'Manager role with full operational oversight (system default)',
      merchant: merchantId,
      isSystemDefault: true,
      isActive: true,
      tasks: DEFAULT_ROLE_TASKS.MANAGER.map(name => taskMap.get(name)),
    },
    {
      name: 'WAITER',
      description: 'Waiter/Server role for table and order management (system default)',
      merchant: merchantId,
      isSystemDefault: true,
      isActive: true,
      tasks: DEFAULT_ROLE_TASKS.WAITER.map(name => taskMap.get(name)),
    },
    {
      name: 'KITCHEN',
      description: 'Kitchen staff role for order preparation and KDS (system default)',
      merchant: merchantId,
      isSystemDefault: true,
      isActive: true,
      tasks: DEFAULT_ROLE_TASKS.KITCHEN.map(name => taskMap.get(name)),
    },
  ];

  const createdRoles = await Role.create(rolesToCreate, { session, ordered: true });

  // Return a map for easy reference: { MANAGER: Role, WAITER: Role, KITCHEN: Role }
  const roleMap = {};
  createdRoles.forEach(role => {
    roleMap[role.name] = role;
  });

  return roleMap;
}

module.exports = { seedDefaultMerchantRoles };
