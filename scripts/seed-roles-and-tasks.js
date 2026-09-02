/**
 * Seed RBAC: Create SUPER-ADMIN and SUPER-MERCHANT-ADMIN roles with required tasks
 * 
 * Based on RBAC-SYSTEM-ANALYSIS.md and verified controller/route implementations:
 * - SUPER-ADMIN: isSystemRole=true, no tasks (relies on bypass)
 * - SUPER-MERCHANT-ADMIN: isSystemRole=false, all merchant-scoped tasks (isMerchant: true)
 * 
 * Total: 224 fine-grained tasks
 * - 199 merchant-scoped (isMerchant: true) - assigned to SUPER-MERCHANT-ADMIN
 * - 25 system-wide (isMerchant: false) - SUPER-ADMIN only (accessed via bypass)
 * 
 * Phase 1 KDS: Added 16 kitchen display system tasks (all merchant-scoped)
 *   - 5 station management (CRUD)
 *   - 1 menu-station assignment
 *   - 10 ticket operations (including item status update + ticket history)
 * 
 * Phase 2 Audit: Added 6 audit logging tasks (all merchant-scoped)
 *   - Query, view, resource history, correlation, export, stats
 * 
 * Phase 3 Categories: Added 7 category management tasks (all merchant-scoped)
 *   - List active, CRUD operations, soft delete, restore
 * 
 * Phase 4 Item Status: Added 3 item-level status tasks (all merchant-scoped)
 *   - Update item status, bulk serve ready items, void with replacement
 * 
 * Phase 5 Order Flow: Added 4 order flow configuration tasks (all merchant-scoped)
 *   - Get config, update channel, update settings, reset to defaults
 * 
 * Phase 6 Payment Verification: Added 6 Ethiopian mobile payment verification tasks (all merchant-scoped)
 *   - Initiate verification (Telebirr/CBE), confirm, reject, list, read, upload receipt photo
 * 
 * Idempotent: Safe to re-run (uses upsert)
 * Target: Production database only (not test)
 * 
 * Usage: node scripts/seed-roles-and-tasks.js
 */

const mongoose = require('mongoose');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');

/**
 * All 217 tasks with verified fields:
 * - hidden: false (required Task schema field)
 * - isMerchant: true/false (verified from actual controller/service implementations)
 * - Correct endpoint paths (verified against src/routes/index.js)
 * - Correct parameter names (verified against route definitions)
 */
const ALL_TASKS = [
  // ========== REPORTS MODULE (10 tasks) ==========
  {
     name: 'reports.sales.read',
     endpoint: '/api/v1/reports/sales',
     method: 'GET',
     description: 'Read sales report', 
     isMerchant: true, 
     hidden: false
  },
  { name: 'reports.orders.read', endpoint: '/api/v1/reports/orders', method: 'GET', description: 'Read orders report', isMerchant: true, hidden: false },
  { name: 'reports.products.read', endpoint: '/api/v1/reports/products', method: 'GET', description: 'Read products report', isMerchant: true, hidden: false },
  { name: 'reports.customers.read', endpoint: '/api/v1/reports/customers', method: 'GET', description: 'Read customers report', isMerchant: true, hidden: false },
  { name: 'reports.delivery.read', endpoint: '/api/v1/reports/delivery', method: 'GET', description: 'Read delivery report', isMerchant: true, hidden: false },
  { name: 'reports.profitability.read', endpoint: '/api/v1/reports/profitability', method: 'GET', description: 'Read profitability report', isMerchant: true, hidden: false },
  { name: 'reports.staff.read', endpoint: '/api/v1/reports/staff', method: 'GET', description: 'Read staff report', isMerchant: true, hidden: false },
  { name: 'reports.inventory.read', endpoint: '/api/v1/reports/inventory', method: 'GET', description: 'Read inventory report', isMerchant: true, hidden: false },
  { name: 'reports.exports.create', endpoint: '/api/v1/reports/exports', method: 'POST', description: 'Create export job', isMerchant: true, hidden: false },
  { name: 'reports.exports.status', endpoint: '/api/v1/reports/exports/:jobId', method: 'GET', description: 'Get export job status', isMerchant: true, hidden: false },

  // ========== BRANCHES MODULE (11 tasks) ==========
  { name: 'branches.list', endpoint: '/api/v1/branch', method: 'GET', description: 'List all branches', isMerchant: true, hidden: false },
  { name: 'branches.create', endpoint: '/api/v1/branch', method: 'POST', description: 'Create branch', isMerchant: true, hidden: false },
  { name: 'branches.read', endpoint: '/api/v1/branch/:id', method: 'GET', description: 'Get branch by ID', isMerchant: true, hidden: false },
  { name: 'branches.update', endpoint: '/api/v1/branch/:id', method: 'PATCH', description: 'Update branch', isMerchant: true, hidden: false },
  { name: 'branches.delete', endpoint: '/api/v1/branch/:id', method: 'DELETE', description: 'Delete branch', isMerchant: true, hidden: false },
  { name: 'branches.regenerateQr', endpoint: '/api/v1/branch/:id/regenerate-qr', method: 'PATCH', description: 'Regenerate QR codes', isMerchant: true, hidden: false },
  { name: 'branches.suspend', endpoint: '/api/v1/branch/:id/suspend', method: 'PATCH', description: 'Suspend branch', isMerchant: true, hidden: false },
  { name: 'branches.activate', endpoint: '/api/v1/branch/:id/activate', method: 'PATCH', description: 'Activate branch', isMerchant: true, hidden: false },
  { name: 'branches.setFeatures', endpoint: '/api/v1/branch/:id/features', method: 'PATCH', description: 'Set branch features', isMerchant: true, hidden: false },
  { name: 'branches.assignMenuGroup', endpoint: '/api/v1/branch/:id/menu-groups', method: 'POST', description: 'Assign menu group to branch', isMerchant: true, hidden: false },
  { name: 'branches.listStaff', endpoint: '/api/v1/branch/:id/staff', method: 'GET', description: 'List branch staff', isMerchant: true, hidden: false },

  // ========== CUSTOMERS MODULE (7 tasks - ALL merchant-scoped CRM) ==========
  { name: 'customers.list', endpoint: '/api/v1/customer', method: 'GET', description: 'List all customers', isMerchant: true, hidden: false },
  { name: 'customers.listCrm', endpoint: '/api/v1/customer/crm', method: 'GET', description: 'List customers (CRM view)', isMerchant: true, hidden: false },
  { name: 'customers.read', endpoint: '/api/v1/customer/:id', method: 'GET', description: 'Get customer by ID', isMerchant: true, hidden: false },
  { name: 'customers.readCrm', endpoint: '/api/v1/customer/:id/crm', method: 'GET', description: 'Get customer (CRM view)', isMerchant: true, hidden: false },
  { name: 'customers.update', endpoint: '/api/v1/customer/:id', method: 'PATCH', description: 'Update customer', isMerchant: true, hidden: false },
  { name: 'customers.delete', endpoint: '/api/v1/customer/:id', method: 'DELETE', description: 'Delete customer', isMerchant: true, hidden: false },
  { name: 'customers.giveGift', endpoint: '/api/v1/customer/:id/gift', method: 'POST', description: 'Give gift to customer', isMerchant: true, hidden: false },
  { name: 'customers.addTagOrNote', endpoint: '/api/v1/customer/:id/tag', method: 'PATCH', description: 'Add tag or note to customer', isMerchant: true, hidden: false },

  // ========== USERS MODULE (5 tasks - ALL merchant-scoped) ==========
  { name: 'users.list', endpoint: '/api/v1/users', method: 'GET', description: 'List all users', isMerchant: true, hidden: false },
  { name: 'users.create', endpoint: '/api/v1/users', method: 'POST', description: 'Create user', isMerchant: true, hidden: false },
  { name: 'users.read', endpoint: '/api/v1/users/:id', method: 'GET', description: 'Get user by ID', isMerchant: true, hidden: false },
  { name: 'users.update', endpoint: '/api/v1/users/:id', method: 'PATCH', description: 'Update user', isMerchant: true, hidden: false },
  { name: 'users.delete', endpoint: '/api/v1/users/:id', method: 'DELETE', description: 'Delete user', isMerchant: true, hidden: false },

  // ========== TABLES MODULE (9 tasks) ==========
  { name: 'tables.list', endpoint: '/api/v1/table', method: 'GET', description: 'List all tables', isMerchant: true, hidden: false },
  { name: 'tables.create', endpoint: '/api/v1/table', method: 'POST', description: 'Create table', isMerchant: true, hidden: false },
  { name: 'tables.read', endpoint: '/api/v1/table/:id', method: 'GET', description: 'Get table by ID', isMerchant: true, hidden: false },
  { name: 'tables.update', endpoint: '/api/v1/table/:id', method: 'PATCH', description: 'Update table', isMerchant: true, hidden: false },
  { name: 'tables.delete', endpoint: '/api/v1/table/:id', method: 'DELETE', description: 'Delete table', isMerchant: true, hidden: false },
  { name: 'tables.changeTable', endpoint: '/api/v1/table/change', method: 'POST', description: 'Change table assignment', isMerchant: true, hidden: false },
  { name: 'tables.regenerateQr', endpoint: '/api/v1/table/:id/regenerate-qr', method: 'POST', description: 'Regenerate table QR code', isMerchant: true, hidden: false },
  { name: 'tables.transitionStatus', endpoint: '/api/v1/table/:id/status', method: 'PATCH', description: 'Transition table status', isMerchant: true, hidden: false },
  { name: 'tables.listByBranch', endpoint: '/api/v1/table/branch/:id', method: 'GET', description: 'List tables by branch', isMerchant: true, hidden: false },

  // ========== SESSIONS MODULE (3 tasks) ==========
  { name: 'sessions.freeTable', endpoint: '/api/v1/sessions/:id/free', method: 'PATCH', description: 'Free table session', isMerchant: true, hidden: false },
  { name: 'sessions.list', endpoint: '/api/v1/sessions', method: 'GET', description: 'List all sessions', isMerchant: true, hidden: false },
  { name: 'sessions.getByTable', endpoint: '/api/v1/sessions/table/:tableId', method: 'GET', description: 'Get session by table ID', isMerchant: true, hidden: false },

  // ========== MENU ITEMS MODULE (13 tasks) ==========
  { name: 'menus.list', endpoint: '/api/v1/menu', method: 'GET', description: 'List all menu items', isMerchant: true, hidden: false },
  { name: 'menus.create', endpoint: '/api/v1/menu', method: 'POST', description: 'Create menu item', isMerchant: true, hidden: false },
  { name: 'menus.read', endpoint: '/api/v1/menu/:id', method: 'GET', description: 'Get menu item by ID', isMerchant: true, hidden: false },
  { name: 'menus.update', endpoint: '/api/v1/menu/:id', method: 'PATCH', description: 'Update menu item', isMerchant: true, hidden: false },
  { name: 'menus.delete', endpoint: '/api/v1/menu/:id', method: 'DELETE', description: 'Delete menu item', isMerchant: true, hidden: false },
  { name: 'menus.getStaff', endpoint: '/api/v1/menu/staff', method: 'GET', description: 'Get staff menu view', isMerchant: true, hidden: false },
  { name: 'menus.toggleAvailability', endpoint: '/api/v1/menu/:id/toggle-availability', method: 'PATCH', description: 'Toggle menu item availability', isMerchant: true, hidden: false },
  { name: 'menus.publish', endpoint: '/api/v1/menu/publish', method: 'POST', description: 'Publish menu group', isMerchant: true, hidden: false },
  { name: 'menus.archive', endpoint: '/api/v1/menu/:id/archive', method: 'PATCH', description: 'Archive menu item', isMerchant: true, hidden: false },
  { name: 'menus.getBranchPublications', endpoint: '/api/v1/menu/publications/branch/:branchId', method: 'GET', description: 'Get branch menu publications', isMerchant: true, hidden: false },
  { name: 'menu.publish', endpoint: '/api/v1/menu/publish', method: 'POST', description: 'Publish menu (alt route)', isMerchant: true, hidden: false },
  { name: 'menu.archiveItem', endpoint: '/api/v1/menu/items/:id/archive', method: 'PATCH', description: 'Archive menu item (alt route)', isMerchant: true, hidden: false },
  { name: 'menu.getBranchPublications', endpoint: '/api/v1/menu/publications/branch/:branchId', method: 'GET', description: 'Get branch publications (alt route)', isMerchant: true, hidden: false },

  // ========== MENU GROUPS MODULE (9 tasks) ==========
  { name: 'menuGroups.listLight', endpoint: '/api/v1/menu-group/light', method: 'GET', description: 'List menu groups (light)', isMerchant: true, hidden: false },
  { name: 'menuGroups.list', endpoint: '/api/v1/menu-group', method: 'GET', description: 'List all menu groups', isMerchant: true, hidden: false },
  { name: 'menuGroups.create', endpoint: '/api/v1/menu-group', method: 'POST', description: 'Create menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.read', endpoint: '/api/v1/menu-group/:id', method: 'GET', description: 'Get menu group by ID', isMerchant: true, hidden: false },
  { name: 'menuGroups.update', endpoint: '/api/v1/menu-group/:id', method: 'PATCH', description: 'Update menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.delete', endpoint: '/api/v1/menu-group/:id', method: 'DELETE', description: 'Delete menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.addItem', endpoint: '/api/v1/menu-group/:id/add-item', method: 'PATCH', description: 'Add item to menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.removeItem', endpoint: '/api/v1/menu-group/:id/remove-item', method: 'PATCH', description: 'Remove item from menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.reorder', endpoint: '/api/v1/menu-group/:id/reorder', method: 'PATCH', description: 'Reorder menu group items', isMerchant: true, hidden: false },

  // ========== BRANCH MENU GROUPS MODULE (8 tasks) ==========
  { name: 'branchMenuGroups.list', endpoint: '/api/v1/branch-menu-group', method: 'GET', description: 'List branch menu groups', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.create', endpoint: '/api/v1/branch-menu-group', method: 'POST', description: 'Create branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.read', endpoint: '/api/v1/branch-menu-group/:id', method: 'GET', description: 'Get branch menu group by ID', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.update', endpoint: '/api/v1/branch-menu-group/:id', method: 'PATCH', description: 'Update branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.delete', endpoint: '/api/v1/branch-menu-group/:id', method: 'DELETE', description: 'Delete branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.addItem', endpoint: '/api/v1/branch-menu-group/:id/add-item', method: 'PATCH', description: 'Add item to branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.removeItem', endpoint: '/api/v1/branch-menu-group/:id/remove-item', method: 'PATCH', description: 'Remove item from branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.reorder', endpoint: '/api/v1/branch-menu-group/:id/reorder', method: 'PATCH', description: 'Reorder branch menu group items', isMerchant: true, hidden: false },

  // ========== COMBOS MODULE (9 tasks) ==========
  { name: 'combos.list', endpoint: '/api/v1/combo', method: 'GET', description: 'List all combos', isMerchant: true, hidden: false },
  { name: 'combos.create', endpoint: '/api/v1/combo', method: 'POST', description: 'Create combo', isMerchant: true, hidden: false },
  { name: 'combos.read', endpoint: '/api/v1/combo/:id', method: 'GET', description: 'Get combo by ID', isMerchant: true, hidden: false },
  { name: 'combos.update', endpoint: '/api/v1/combo/:id', method: 'PATCH', description: 'Update combo', isMerchant: true, hidden: false },
  { name: 'combos.delete', endpoint: '/api/v1/combo/:id', method: 'DELETE', description: 'Delete combo', isMerchant: true, hidden: false },
  { name: 'combos.toggleActive', endpoint: '/api/v1/combo/:id/toggle-active', method: 'PATCH', description: 'Toggle combo active status', isMerchant: true, hidden: false },
  { name: 'combos.toggleBranch', endpoint: '/api/v1/combo/:comboId/branch-toggle', method: 'PATCH', description: 'Toggle combo for branch', isMerchant: true, hidden: false },
  { name: 'combos.updateBranchOverride', endpoint: '/api/v1/combo/:comboId/branch-override', method: 'PATCH', description: 'Update branch combo override', isMerchant: true, hidden: false },
  { name: 'combos.incrementSold', endpoint: '/api/v1/combo/increment-sold', method: 'POST', description: 'Increment combo sold count', isMerchant: true, hidden: false },

  // ========== CATEGORIES MODULE (7 tasks) ==========
  { name: 'categories.listActive', endpoint: '/api/v1/categories/active', method: 'GET', description: 'List active categories', isMerchant: true, hidden: false },
  { name: 'categories.list', endpoint: '/api/v1/categories', method: 'GET', description: 'List all categories', isMerchant: true, hidden: false },
  { name: 'categories.create', endpoint: '/api/v1/categories', method: 'POST', description: 'Create category', isMerchant: true, hidden: false },
  { name: 'categories.read', endpoint: '/api/v1/categories/:id', method: 'GET', description: 'Get category by ID', isMerchant: true, hidden: false },
  { name: 'categories.update', endpoint: '/api/v1/categories/:id', method: 'PATCH', description: 'Update category', isMerchant: true, hidden: false },
  { name: 'categories.delete', endpoint: '/api/v1/categories/:id', method: 'DELETE', description: 'Soft delete category', isMerchant: true, hidden: false },
  { name: 'categories.restore', endpoint: '/api/v1/categories/:id/restore', method: 'PATCH', description: 'Restore deleted category', isMerchant: true, hidden: false },

  // ========== MERCHANTS MODULE (26 tasks - 10 system-wide, 16 merchant-scoped) ==========
  { name: 'merchants.createKyc', endpoint: '/api/v1/merchant/kyc', method: 'POST', description: 'Submit KYC documents', isMerchant: true, hidden: false },
  { name: 'merchants.roles.list', endpoint: '/api/v1/merchant/roles', method: 'GET', description: 'List merchant roles', isMerchant: true, hidden: false },
  { name: 'merchants.roles.create', endpoint: '/api/v1/merchant/roles', method: 'POST', description: 'Create merchant role', isMerchant: true, hidden: false },
  { name: 'merchants.roles.read', endpoint: '/api/v1/merchant/roles/:id', method: 'GET', description: 'Get merchant role by ID', isMerchant: true, hidden: false },
  { name: 'merchants.roles.update', endpoint: '/api/v1/merchant/roles/:id', method: 'PATCH', description: 'Update merchant role', isMerchant: true, hidden: false },
  { name: 'merchants.roles.delete', endpoint: '/api/v1/merchant/roles/:id', method: 'DELETE', description: 'Delete merchant role', isMerchant: true, hidden: false },
  { name: 'merchants.roles.activate', endpoint: '/api/v1/merchant/roles/:id/activate', method: 'PATCH', description: 'Activate merchant role', isMerchant: true, hidden: false },
  { name: 'merchants.users.list', endpoint: '/api/v1/merchant/users', method: 'GET', description: 'List merchant users', isMerchant: true, hidden: false },
  { name: 'merchants.users.create', endpoint: '/api/v1/merchant/users', method: 'POST', description: 'Create merchant user', isMerchant: true, hidden: false },
  { name: 'merchants.users.read', endpoint: '/api/v1/merchant/users/:id', method: 'GET', description: 'Get merchant user by ID', isMerchant: true, hidden: false },
  { name: 'merchants.users.update', endpoint: '/api/v1/merchant/users/:id', method: 'PATCH', description: 'Update merchant user', isMerchant: true, hidden: false },
  { name: 'merchants.users.delete', endpoint: '/api/v1/merchant/users/:id', method: 'DELETE', description: 'Delete merchant user', isMerchant: true, hidden: false },
  { name: 'merchants.users.activate', endpoint: '/api/v1/merchant/users/:id/activate', method: 'PATCH', description: 'Activate merchant user', isMerchant: true, hidden: false },
  { name: 'merchants.users.listByBranch', endpoint: '/api/v1/merchant/users/branch/:id', method: 'GET', description: 'List users by branch', isMerchant: true, hidden: false },
  { name: 'merchants.me.read', endpoint: '/api/v1/merchant/me', method: 'GET', description: 'Get own merchant profile', isMerchant: true, hidden: false },
  { name: 'merchants.me.update', endpoint: '/api/v1/merchant/me', method: 'PATCH', description: 'Update own merchant profile', isMerchant: true, hidden: false },
  
  // SYSTEM-WIDE MERCHANT OPERATIONS (isMerchant: false) - SUPER-ADMIN only
  { name: 'merchants.list', endpoint: '/api/v1/merchant', method: 'GET', description: 'List all merchants (system-wide)', isMerchant: false, hidden: false },
  { name: 'merchants.create', endpoint: '/api/v1/merchant', method: 'POST', description: 'Create merchant (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.read', endpoint: '/api/v1/merchant/:id', method: 'GET', description: 'Get any merchant by ID (system-wide)', isMerchant: false, hidden: false },
  { name: 'merchants.update', endpoint: '/api/v1/merchant/:id', method: 'PATCH', description: 'Update any merchant (system-wide)', isMerchant: false, hidden: false },
  { name: 'merchants.delete', endpoint: '/api/v1/merchant/:id', method: 'DELETE', description: 'Delete any merchant (system-wide)', isMerchant: false, hidden: false },
  { name: 'merchants.approve', endpoint: '/api/v1/merchant/:id/approve', method: 'PATCH', description: 'Approve merchant KYC (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.suspend', endpoint: '/api/v1/merchant/:id/suspend', method: 'PATCH', description: 'Suspend merchant (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.activate', endpoint: '/api/v1/merchant/:id/activate', method: 'PATCH', description: 'Activate merchant (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.updateSubscription', endpoint: '/api/v1/merchant/:id/subscription', method: 'PATCH', description: 'Update merchant subscription (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.getStats', endpoint: '/api/v1/merchant/:id/stats', method: 'GET', description: 'Get merchant stats (system-wide)', isMerchant: false, hidden: false },

  // ========== ORDERS MODULE (18 tasks) ==========
  { name: 'orders.placeStaff', endpoint: '/api/v1/orders/staff', method: 'POST', description: 'Place order (staff)', isMerchant: true, hidden: false },
  { name: 'orders.listActive', endpoint: '/api/v1/orders/active', method: 'GET', description: 'List active orders', isMerchant: true, hidden: false },
  { name: 'orders.listCompleted', endpoint: '/api/v1/orders/completed', method: 'GET', description: 'List completed orders', isMerchant: true, hidden: false },
  { name: 'orders.listPending', endpoint: '/api/v1/orders/pending', method: 'GET', description: 'List pending orders', isMerchant: true, hidden: false },
  { name: 'orders.listAccepted', endpoint: '/api/v1/orders/accepted', method: 'GET', description: 'List accepted orders', isMerchant: true, hidden: false },
  { name: 'orders.listPreparing', endpoint: '/api/v1/orders/preparing', method: 'GET', description: 'List preparing orders', isMerchant: true, hidden: false },
  { name: 'orders.listReady', endpoint: '/api/v1/orders/ready', method: 'GET', description: 'List ready orders', isMerchant: true, hidden: false },
  { name: 'orders.listServed', endpoint: '/api/v1/orders/served', method: 'GET', description: 'List served orders', isMerchant: true, hidden: false },
  { name: 'orders.listCanceled', endpoint: '/api/v1/orders/canceled', method: 'GET', description: 'List canceled orders', isMerchant: true, hidden: false },
  { name: 'orders.getByNumber', endpoint: '/api/v1/orders/number/:orderNumber', method: 'GET', description: 'Get order by number', isMerchant: true, hidden: false },
  { name: 'orders.getReviewQueue', endpoint: '/api/v1/orders/review-queue', method: 'GET', description: 'Get review queue (pending orders requiring manual review)', isMerchant: true, hidden: false },
  { name: 'orders.markPaid', endpoint: '/api/v1/orders/:id/pay', method: 'POST', description: 'Mark order as paid', isMerchant: true, hidden: false },
  { name: 'orders.updateStatus', endpoint: '/api/v1/orders/:id/status', method: 'PATCH', description: 'Update order status', isMerchant: true, hidden: false },
  { name: 'orders.addItems', endpoint: '/api/v1/orders/:id/add-items', method: 'PATCH', description: 'Add items to order', isMerchant: true, hidden: false },
  { name: 'orders.cancel', endpoint: '/api/v1/orders/:id/cancel', method: 'PATCH', description: 'Cancel order', isMerchant: true, hidden: false },
  { name: 'orders.read', endpoint: '/api/v1/orders/:id', method: 'GET', description: 'Get order by ID', isMerchant: true, hidden: false },
  { name: 'orders.listActiveDeliveries', endpoint: '/api/v1/orders/deliveries/active', method: 'GET', description: 'List active deliveries', isMerchant: true, hidden: false },
  { name: 'orders.history', endpoint: '/api/v1/orders/:id/history', method: 'GET', description: 'Get order status history', isMerchant: true, hidden: false },

  // ========== PAYMENT VERIFICATION MODULE (6 tasks - Ethiopian mobile payment verification) ==========
  { name: 'paymentVerification.initiate', endpoint: '/api/v1/payment-verification/initiate', method: 'POST', description: 'Initiate payment verification (Telebirr/CBE)', isMerchant: true, hidden: false },
  { name: 'paymentVerification.confirm', endpoint: '/api/v1/payment-verification/:id/confirm', method: 'POST', description: 'Confirm/approve payment verification', isMerchant: true, hidden: false },
  { name: 'paymentVerification.reject', endpoint: '/api/v1/payment-verification/:id/reject', method: 'POST', description: 'Reject payment verification', isMerchant: true, hidden: false },
  { name: 'paymentVerification.list', endpoint: '/api/v1/payment-verification', method: 'GET', description: 'List payment verifications (with filters)', isMerchant: true, hidden: false },
  { name: 'paymentVerification.read', endpoint: '/api/v1/payment-verification/:id', method: 'GET', description: 'Get payment verification details', isMerchant: true, hidden: false },
  { name: 'files.upload', endpoint: '/api/v1/files/upload', method: 'POST', description: 'Upload receipt photo', isMerchant: true, hidden: false },

  // ========== ITEM STATUS WORKFLOW (3 tasks - Item-level status management) ==========
  { name: 'orders.items.updateStatus', endpoint: '/api/v1/orders/:orderId/items/:itemId/status', method: 'PATCH', description: 'Update individual item status (manual override)', isMerchant: true, hidden: false },
  { name: 'orders.items.serveReady', endpoint: '/api/v1/orders/:orderId/items/serve-ready', method: 'POST', description: 'Bulk serve all ready items (waiter picks up multiple dishes)', isMerchant: true, hidden: false },
  { name: 'orders.items.void', endpoint: '/api/v1/orders/:orderId/items/:itemId/void', method: 'PATCH', description: 'Void item with reason (optional replacement)', isMerchant: true, hidden: false },

  // ========== ORDER FLOW CONFIGURATION (4 tasks - Channel routing rules) ==========
  { name: 'orderFlow.getConfig', endpoint: '/api/v1/order-flow-config', method: 'GET', description: 'Get current order flow configuration', isMerchant: true, hidden: false },
  { name: 'orderFlow.updateChannel', endpoint: '/api/v1/order-flow-config/channels/:channel', method: 'PATCH', description: 'Update channel routing rules', isMerchant: true, hidden: false },
  { name: 'orderFlow.updateGlobalSettings', endpoint: '/api/v1/order-flow-config/settings', method: 'PATCH', description: 'Update global order flow settings', isMerchant: true, hidden: false },
  { name: 'orderFlow.reset', endpoint: '/api/v1/order-flow-config/reset', method: 'POST', description: 'Reset order flow config to defaults', isMerchant: true, hidden: false },

  // ========== INGREDIENTS MODULE (5 tasks) ==========
  { name: 'ingredients.list', endpoint: '/api/v1/ingredients', method: 'GET', description: 'List all ingredients', isMerchant: true, hidden: false },
  { name: 'ingredients.create', endpoint: '/api/v1/ingredients', method: 'POST', description: 'Create ingredient', isMerchant: true, hidden: false },
  { name: 'ingredients.read', endpoint: '/api/v1/ingredients/:id', method: 'GET', description: 'Get ingredient by ID', isMerchant: true, hidden: false },
  { name: 'ingredients.update', endpoint: '/api/v1/ingredients/:id', method: 'PATCH', description: 'Update ingredient', isMerchant: true, hidden: false },
  { name: 'ingredients.delete', endpoint: '/api/v1/ingredients/:id', method: 'DELETE', description: 'Delete ingredient', isMerchant: true, hidden: false },

  // ========== INVENTORY MODULE (7 tasks) ==========
  { name: 'inventory.adjustStock', endpoint: '/api/v1/inventory/adjust', method: 'POST', description: 'Adjust stock levels', isMerchant: true, hidden: false },
  { name: 'inventory.batchAdjust', endpoint: '/api/v1/inventory/batch-adjust', method: 'POST', description: 'Batch adjust stock', isMerchant: true, hidden: false },
  { name: 'inventory.listMovements', endpoint: '/api/v1/inventory/movements', method: 'GET', description: 'List stock movements', isMerchant: true, hidden: false },
  { name: 'inventory.getValuation', endpoint: '/api/v1/inventory/valuation', method: 'GET', description: 'Get inventory valuation', isMerchant: true, hidden: false },
  { name: 'inventory.getLowStock', endpoint: '/api/v1/inventory/low-stock', method: 'GET', description: 'Get low stock items', isMerchant: true, hidden: false },
  { name: 'inventory.setThresholds', endpoint: '/api/v1/inventory/:ingredientId/thresholds', method: 'PATCH', description: 'Set stock thresholds', isMerchant: true, hidden: false },
  { name: 'inventory.validateOrder', endpoint: '/api/v1/inventory/validate-order', method: 'POST', description: 'Validate order stock availability', isMerchant: true, hidden: false },

  // ========== SUPPLIERS MODULE (5 tasks) ==========
  { name: 'suppliers.list', endpoint: '/api/v1/suppliers', method: 'GET', description: 'List all suppliers', isMerchant: true, hidden: false },
  { name: 'suppliers.create', endpoint: '/api/v1/suppliers', method: 'POST', description: 'Create supplier', isMerchant: true, hidden: false },
  { name: 'suppliers.read', endpoint: '/api/v1/suppliers/:id', method: 'GET', description: 'Get supplier by ID', isMerchant: true, hidden: false },
  { name: 'suppliers.update', endpoint: '/api/v1/suppliers/:id', method: 'PATCH', description: 'Update supplier', isMerchant: true, hidden: false },
  { name: 'suppliers.delete', endpoint: '/api/v1/suppliers/:id', method: 'DELETE', description: 'Delete supplier', isMerchant: true, hidden: false },

  // ========== RECIPES MODULE (5 tasks) ==========
  { name: 'recipes.list', endpoint: '/api/v1/recipes', method: 'GET', description: 'List all recipes', isMerchant: true, hidden: false },
  { name: 'recipes.create', endpoint: '/api/v1/recipes', method: 'POST', description: 'Create recipe', isMerchant: true, hidden: false },
  { name: 'recipes.read', endpoint: '/api/v1/recipes/:id', method: 'GET', description: 'Get recipe by ID', isMerchant: true, hidden: false },
  { name: 'recipes.update', endpoint: '/api/v1/recipes/:id', method: 'PATCH', description: 'Update recipe', isMerchant: true, hidden: false },
  { name: 'recipes.delete', endpoint: '/api/v1/recipes/:id', method: 'DELETE', description: 'Delete recipe', isMerchant: true, hidden: false },

  // ========== PURCHASE ORDERS MODULE (6 tasks) ==========
  { name: 'purchaseOrders.list', endpoint: '/api/v1/purchase-orders', method: 'GET', description: 'List all purchase orders', isMerchant: true, hidden: false },
  { name: 'purchaseOrders.create', endpoint: '/api/v1/purchase-orders', method: 'POST', description: 'Create purchase order', isMerchant: true, hidden: false },
  { name: 'purchaseOrders.read', endpoint: '/api/v1/purchase-orders/:id', method: 'GET', description: 'Get purchase order by ID', isMerchant: true, hidden: false },
  { name: 'purchaseOrders.update', endpoint: '/api/v1/purchase-orders/:id', method: 'PATCH', description: 'Update purchase order', isMerchant: true, hidden: false },
  { name: 'purchaseOrders.delete', endpoint: '/api/v1/purchase-orders/:id', method: 'DELETE', description: 'Delete purchase order', isMerchant: true, hidden: false },
  { name: 'purchaseOrders.receive', endpoint: '/api/v1/purchase-orders/:id/receive', method: 'POST', description: 'Receive purchase order', isMerchant: true, hidden: false },

  // ========== ANALYTICS MODULE (2 tasks) ==========
  { name: 'analytics.getDashboard', endpoint: '/api/v1/analytics/dashboard', method: 'GET', description: 'Get analytics dashboard', isMerchant: true, hidden: false },
  { name: 'analytics.sendMessage', endpoint: '/api/v1/analytics/messages', method: 'POST', description: 'Send direct message', isMerchant: true, hidden: false },

  // ========== FEEDBACK MODULE (4 tasks) ==========
  { name: 'feedback.listAll', endpoint: '/api/v1/feedback', method: 'GET', description: 'List all feedback', isMerchant: true, hidden: false },
  { name: 'feedback.getStats', endpoint: '/api/v1/feedback/stats', method: 'GET', description: 'Get feedback stats', isMerchant: true, hidden: false },
  { name: 'feedback.read', endpoint: '/api/v1/feedback/:id', method: 'GET', description: 'Get feedback by ID', isMerchant: true, hidden: false },
  { name: 'feedback.respond', endpoint: '/api/v1/feedback/:id/response', method: 'PATCH', description: 'Respond to feedback', isMerchant: true, hidden: false },

  // ========== FILES MODULE (3 tasks) ==========
  { name: 'files.upload', endpoint: '/api/v1/files/upload', method: 'POST', description: 'Upload file', isMerchant: true, hidden: false },
  { name: 'files.listEntity', endpoint: '/api/v1/files/entity', method: 'GET', description: 'List files for entity', isMerchant: true, hidden: false },
  { name: 'files.delete', endpoint: '/api/v1/files/:id', method: 'DELETE', description: 'Delete file', isMerchant: true, hidden: false },

  // ========== RBAC MANAGEMENT - TASKS (7 tasks - 1 merchant-scoped, 6 system-wide) ==========
  { name: 'tasks.getMerchantTasks', endpoint: '/api/v1/tasks/merchant-tasks', method: 'GET', description: 'Get merchant tasks (for UI)', isMerchant: true, hidden: false },
  { name: 'tasks.list', endpoint: '/api/v1/tasks', method: 'GET', description: 'List all tasks (system-wide)', isMerchant: false, hidden: false },
  { name: 'tasks.create', endpoint: '/api/v1/tasks', method: 'POST', description: 'Create task (system operation)', isMerchant: false, hidden: false },
  { name: 'tasks.sync', endpoint: '/api/v1/tasks/sync', method: 'POST', description: 'Sync tasks from code (system operation)', isMerchant: false, hidden: false },
  { name: 'tasks.deleteAll', endpoint: '/api/v1/tasks/delete-all', method: 'DELETE', description: 'Delete all tasks (system operation)', isMerchant: false, hidden: false },
  { name: 'tasks.update', endpoint: '/api/v1/tasks/:id', method: 'PATCH', description: 'Update task (system operation)', isMerchant: false, hidden: false },
  { name: 'tasks.delete', endpoint: '/api/v1/tasks/:id', method: 'DELETE', description: 'Delete task (system operation)', isMerchant: false, hidden: false },

  // ========== RBAC MANAGEMENT - ROLES (5 tasks - ALL system-wide) ==========
  { name: 'roles.list', endpoint: '/api/v1/roles', method: 'GET', description: 'List all roles (system-wide)', isMerchant: false, hidden: false },
  { name: 'roles.create', endpoint: '/api/v1/roles', method: 'POST', description: 'Create role (system operation)', isMerchant: false, hidden: false },
  { name: 'roles.read', endpoint: '/api/v1/roles/:id', method: 'GET', description: 'Get role by ID (system-wide)', isMerchant: false, hidden: false },
  { name: 'roles.update', endpoint: '/api/v1/roles/:id', method: 'PATCH', description: 'Update role (system operation)', isMerchant: false, hidden: false },
  { name: 'roles.delete', endpoint: '/api/v1/roles/:id', method: 'DELETE', description: 'Delete role (system operation)', isMerchant: false, hidden: false },

  // ========== KITCHEN DISPLAY SYSTEM (KDS) - PHASE 1 (16 tasks - ALL merchant-scoped) ==========
  // Station Management (CRUD)
  { name: 'kitchen.stations.list', endpoint: '/api/v1/kitchen/stations', method: 'GET', description: 'Get all kitchen stations for branch', isMerchant: true, hidden: false },
  { name: 'kitchen.stations.read', endpoint: '/api/v1/kitchen/stations/:id', method: 'GET', description: 'Get single kitchen station', isMerchant: true, hidden: false },
  { name: 'kitchen.stations.create', endpoint: '/api/v1/kitchen/stations', method: 'POST', description: 'Create new kitchen station', isMerchant: true, hidden: false },
  { name: 'kitchen.stations.update', endpoint: '/api/v1/kitchen/stations/:id', method: 'PATCH', description: 'Update kitchen station', isMerchant: true, hidden: false },
  { name: 'kitchen.stations.delete', endpoint: '/api/v1/kitchen/stations/:id', method: 'DELETE', description: 'Delete (deactivate) kitchen station', isMerchant: true, hidden: false },
  
  // Menu Item → Station Assignment
  { name: 'kitchen.menuItems.assignStation', endpoint: '/api/v1/kitchen/menu-items/:menuItemId/station', method: 'PATCH', description: 'Assign/remove kitchen station for menu item', isMerchant: true, hidden: false },
  
  // Ticket Operations
  { name: 'kitchen.tickets.list', endpoint: '/api/v1/kitchen/tickets', method: 'GET', description: 'Get all tickets with optional filters (cross-station view)', isMerchant: true, hidden: false },
  { name: 'kitchen.tickets.history', endpoint: '/api/v1/kitchen/tickets/history', method: 'GET', description: 'Get completed tickets (history view)', isMerchant: true, hidden: false },
  { name: 'kitchen.stations.tickets', endpoint: '/api/v1/kitchen/stations/:id/tickets', method: 'GET', description: 'Get active tickets for a station (KDS dashboard)', isMerchant: true, hidden: false },
  { name: 'kitchen.orders.tickets', endpoint: '/api/v1/kitchen/orders/:id/tickets', method: 'GET', description: 'Get all tickets for an order', isMerchant: true, hidden: false },
  { name: 'kitchen.tickets.updateStatus', endpoint: '/api/v1/kitchen/tickets/:id/status', method: 'PATCH', description: 'Update ticket status (generic)', isMerchant: true, hidden: false },
  { name: 'kitchen.tickets.accept', endpoint: '/api/v1/kitchen/tickets/:id/accept', method: 'PATCH', description: 'Accept ticket (explicit button - Option 1)', isMerchant: true, hidden: false },
  { name: 'kitchen.tickets.start', endpoint: '/api/v1/kitchen/tickets/:id/start', method: 'PATCH', description: 'Start working on ticket', isMerchant: true, hidden: false },
  { name: 'kitchen.tickets.ready', endpoint: '/api/v1/kitchen/tickets/:id/ready', method: 'PATCH', description: 'Mark ticket as ready', isMerchant: true, hidden: false },
  { name: 'kitchen.tickets.cancel', endpoint: '/api/v1/kitchen/tickets/:id/cancel', method: 'PATCH', description: 'Cancel ticket', isMerchant: true, hidden: false },
  { name: 'kitchen.tickets.updateItemStatus', endpoint: '/api/v1/kitchen/tickets/:ticketId/item/:itemId', method: 'PATCH', description: 'Update status of specific item within ticket', isMerchant: true, hidden: false },

  // ========== AUDIT LOGGING - PHASE 2 (6 tasks - ALL merchant-scoped) ==========
  { name: 'audit.logs.list', endpoint: '/api/v1/audit-logs', method: 'GET', description: 'Query audit logs with filters', isMerchant: true, hidden: false },
  { name: 'audit.logs.view', endpoint: '/api/v1/audit-logs/:id', method: 'GET', description: 'Get single audit log details', isMerchant: true, hidden: false },
  { name: 'audit.logs.resource-history', endpoint: '/api/v1/audit-logs/resource/:resource/:id', method: 'GET', description: 'Get audit history for specific resource', isMerchant: true, hidden: false },
  { name: 'audit.logs.correlation', endpoint: '/api/v1/audit-logs/correlation/:id', method: 'GET', description: 'Get correlated logs (trace operations)', isMerchant: true, hidden: false },
  { name: 'audit.logs.export', endpoint: '/api/v1/audit-logs/export', method: 'GET', description: 'Export audit logs to CSV', isMerchant: true, hidden: false },
  { name: 'audit.logs.stats', endpoint: '/api/v1/audit-logs/stats', method: 'GET', description: 'Get aggregated audit statistics', isMerchant: true, hidden: false },
];

async function seedRolesAndTasks() {
  try {
    // Connect to production database
    const dbUri ='mongodb://127.0.0.1:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('✅ Connected to database:', mongoose.connection.name);

    // Verify not running against test database
    if (mongoose.connection.name.toLowerCase().includes('test')) {
      throw new Error('❌ Refusing to run against test database. Use production DB only.');
    }

    console.log('\n=== STEP 1: Create All Tasks ===');
    console.log(`Creating ${ALL_TASKS.length} tasks...`);
    
    const allTaskIds = [];
    const merchantScopedTaskIds = [];
    
    for (const taskDef of ALL_TASKS) {
      const task = await Task.findOneAndUpdate(
        { name: taskDef.name }, // Match by name
        {
          $set: {
            name: taskDef.name,
            endpoint: taskDef.endpoint,
            method: taskDef.method,
            description: taskDef.description,
            isMerchant: taskDef.isMerchant,
            hidden: taskDef.hidden
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
      
      allTaskIds.push(task._id);
      
      // Collect merchant-scoped tasks for SUPER-MERCHANT-ADMIN role
      if (taskDef.isMerchant === true) {
        merchantScopedTaskIds.push(task._id);
      }
      
      console.log(`  ✓ ${task.name} (${task.method} ${task.endpoint}) [isMerchant: ${task.isMerchant}]`);
    }

    console.log(`\n✅ ${allTaskIds.length} tasks created/updated`);
    console.log(`   - Merchant-scoped (isMerchant: true): ${merchantScopedTaskIds.length}`);
    console.log(`   - System-wide (isMerchant: false): ${allTaskIds.length - merchantScopedTaskIds.length}`);

    console.log('\n=== STEP 2: Create SUPER-ADMIN Role ===');
    
    const superAdminRole = await Role.findOneAndUpdate(
      { name: 'SUPER-ADMIN' },
      {
        $set: {
          name: 'SUPER-ADMIN',
          description: 'System administrator with universal access (bypasses task checking)',
          isSystemRole: true,
          tasks: [] // Empty - relies on bypass in auth.guard.js
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`  ✓ ${superAdminRole.name}`);
    console.log(`    _id: ${superAdminRole._id}`);
    console.log(`    isSystemRole: ${superAdminRole.isSystemRole}`);
    console.log(`    tasks: ${superAdminRole.tasks.length} (empty - uses bypass for all operations)`);

    console.log('\n=== STEP 3: Create SUPER-MERCHANT-ADMIN Role ===');
    
    const merchantAdminRole = await Role.findOneAndUpdate(
      { name: 'SUPER-MERCHANT-ADMIN' },
      {
        $set: {
          name: 'SUPER-MERCHANT-ADMIN',
          description: 'Merchant administrator with full access to merchant-scoped operations',
          isSystemRole: false,
          tasks: merchantScopedTaskIds // Only merchant-scoped tasks (isMerchant: true)
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`  ✓ ${merchantAdminRole.name}`);
    console.log(`    _id: ${merchantAdminRole._id}`);
    console.log(`    isSystemRole: ${merchantAdminRole.isSystemRole}`);
    console.log(`    tasks: ${merchantAdminRole.tasks.length} merchant-scoped tasks assigned`);

    console.log('\n=== Summary ===');
    console.log(`✅ Created/updated ${allTaskIds.length} tasks total`);
    console.log(`   - ${merchantScopedTaskIds.length} merchant-scoped tasks (isMerchant: true)`);
    console.log(`   - ${allTaskIds.length - merchantScopedTaskIds.length} system-wide tasks (isMerchant: false)`);
    console.log(`✅ Created/updated 2 roles:`);
    console.log(`   - SUPER-ADMIN: isSystemRole=true, 0 tasks (bypasses all checks)`);
    console.log(`   - SUPER-MERCHANT-ADMIN: isSystemRole=false, ${merchantScopedTaskIds.length} tasks`);
    console.log('\nNext steps:');
    console.log('1. Run: node scripts/inspect-rbac-data.js');
    console.log('2. Assign roles to users');
    console.log('3. Test protected endpoints');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  seedRolesAndTasks();
}

module.exports = { seedRolesAndTasks, ALL_TASKS };
