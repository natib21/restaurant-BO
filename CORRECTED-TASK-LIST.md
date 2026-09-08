# Corrected Task List (156 tasks)

## Changes Made:
1. ✅ Added `hidden: false` to all tasks
2. ✅ Fixed parameter name: `sessions.getByTable` uses `:tableId` (confirmed in routes)
3. ✅ Set `isMerchant: false` for system-wide merchant operations

---

## Tasks with `isMerchant: false` (System-Wide Operations)

These 9 tasks operate across ALL merchants (not tenant-scoped):

1. **merchants.list** - Lists all merchants across the system
2. **merchants.create** - Creates new merchant (system operation)
3. **merchants.read** - Gets any merchant by ID (system-wide read)
4. **merchants.update** - Updates any merchant (system-wide)
5. **merchants.delete** - Deletes any merchant (system-wide)
6. **merchants.approve** - Approves merchant KYC (system operation)
7. **merchants.suspend** - Suspends merchant (system operation)
8. **merchants.activate** - Activates merchant (system operation)
9. **merchants.updateSubscription** - Updates merchant subscription (system operation)
10. **merchants.getStats** - Gets stats for any merchant (system operation)

**Reasoning**: These operations are found in `merchant.controller.js` and `merchant.service.js`:
- `getAllMerchants()` - No merchant filter
- `getMerchantById(id)` - Takes any merchant ID
- `approveMerchant(id)` - System-level approval workflow
- `suspendMerchant(id)` - System-level suspension
- `activateMerchant(id)` - System-level activation
- `updateSubscription(id, plan)` - System-level subscription management

All other tasks ARE merchant-scoped (`isMerchant: true`).

---

## Complete Corrected Task Array

\`\`\`javascript
const MERCHANT_TASKS = [
  // ========== REPORTS MODULE (10 tasks) ==========
  { name: 'reports.sales.read', endpoint: '/api/v1/reports/sales', method: 'GET', description: 'Read sales report', isMerchant: true, hidden: false },
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
  { name: 'branches.list', endpoint: '/api/v1/branches', method: 'GET', description: 'List all branches', isMerchant: true, hidden: false },
  { name: 'branches.create', endpoint: '/api/v1/branches', method: 'POST', description: 'Create branch', isMerchant: true, hidden: false },
  { name: 'branches.read', endpoint: '/api/v1/branches/:id', method: 'GET', description: 'Get branch by ID', isMerchant: true, hidden: false },
  { name: 'branches.update', endpoint: '/api/v1/branches/:id', method: 'PATCH', description: 'Update branch', isMerchant: true, hidden: false },
  { name: 'branches.delete', endpoint: '/api/v1/branches/:id', method: 'DELETE', description: 'Delete branch', isMerchant: true, hidden: false },
  { name: 'branches.regenerateQr', endpoint: '/api/v1/branches/:id/regenerate-qr', method: 'PATCH', description: 'Regenerate QR codes', isMerchant: true, hidden: false },
  { name: 'branches.suspend', endpoint: '/api/v1/branches/:id/suspend', method: 'PATCH', description: 'Suspend branch', isMerchant: true, hidden: false },
  { name: 'branches.activate', endpoint: '/api/v1/branches/:id/activate', method: 'PATCH', description: 'Activate branch', isMerchant: true, hidden: false },
  { name: 'branches.setFeatures', endpoint: '/api/v1/branches/:id/features', method: 'PATCH', description: 'Set branch features', isMerchant: true, hidden: false },
  { name: 'branches.assignMenuGroup', endpoint: '/api/v1/branches/:id/menu-groups', method: 'POST', description: 'Assign menu group to branch', isMerchant: true, hidden: false },
  { name: 'branches.listStaff', endpoint: '/api/v1/branches/:id/staff', method: 'GET', description: 'List branch staff', isMerchant: true, hidden: false },

  // ========== USERS MODULE (5 tasks - ALL merchant-scoped) ==========
  { name: 'users.list', endpoint: '/api/v1/users', method: 'GET', description: 'List all users', isMerchant: true, hidden: false },
  { name: 'users.create', endpoint: '/api/v1/users', method: 'POST', description: 'Create user', isMerchant: true, hidden: false },
  { name: 'users.read', endpoint: '/api/v1/users/:id', method: 'GET', description: 'Get user by ID', isMerchant: true, hidden: false },
  { name: 'users.update', endpoint: '/api/v1/users/:id', method: 'PATCH', description: 'Update user', isMerchant: true, hidden: false },
  { name: 'users.delete', endpoint: '/api/v1/users/:id', method: 'DELETE', description: 'Delete user', isMerchant: true, hidden: false },

  // ========== TABLES MODULE (9 tasks) ==========
  { name: 'tables.list', endpoint: '/api/v1/tables', method: 'GET', description: 'List all tables', isMerchant: true, hidden: false },
  { name: 'tables.create', endpoint: '/api/v1/tables', method: 'POST', description: 'Create table', isMerchant: true, hidden: false },
  { name: 'tables.read', endpoint: '/api/v1/tables/:id', method: 'GET', description: 'Get table by ID', isMerchant: true, hidden: false },
  { name: 'tables.update', endpoint: '/api/v1/tables/:id', method: 'PATCH', description: 'Update table', isMerchant: true, hidden: false },
  { name: 'tables.delete', endpoint: '/api/v1/tables/:id', method: 'DELETE', description: 'Delete table', isMerchant: true, hidden: false },
  { name: 'tables.changeTable', endpoint: '/api/v1/tables/change', method: 'POST', description: 'Change table assignment', isMerchant: true, hidden: false },
  { name: 'tables.regenerateQr', endpoint: '/api/v1/tables/:id/regenerate-qr', method: 'POST', description: 'Regenerate table QR code', isMerchant: true, hidden: false },
  { name: 'tables.transitionStatus', endpoint: '/api/v1/tables/:id/status', method: 'PATCH', description: 'Transition table status', isMerchant: true, hidden: false },
  { name: 'tables.listByBranch', endpoint: '/api/v1/tables/branch/:id', method: 'GET', description: 'List tables by branch', isMerchant: true, hidden: false },

  // ========== SESSIONS MODULE (3 tasks) ==========
  { name: 'sessions.freeTable', endpoint: '/api/v1/sessions/:id/free', method: 'PATCH', description: 'Free table session', isMerchant: true, hidden: false },
  { name: 'sessions.list', endpoint: '/api/v1/sessions', method: 'GET', description: 'List all sessions', isMerchant: true, hidden: false },
  { name: 'sessions.getByTable', endpoint: '/api/v1/sessions/table/:tableId', method: 'GET', description: 'Get session by table ID', isMerchant: true, hidden: false },

  // ========== MENU ITEMS MODULE (13 tasks) ==========
  { name: 'menus.list', endpoint: '/api/v1/menus', method: 'GET', description: 'List all menu items', isMerchant: true, hidden: false },
  { name: 'menus.create', endpoint: '/api/v1/menus', method: 'POST', description: 'Create menu item', isMerchant: true, hidden: false },
  { name: 'menus.read', endpoint: '/api/v1/menus/:id', method: 'GET', description: 'Get menu item by ID', isMerchant: true, hidden: false },
  { name: 'menus.update', endpoint: '/api/v1/menus/:id', method: 'PATCH', description: 'Update menu item', isMerchant: true, hidden: false },
  { name: 'menus.delete', endpoint: '/api/v1/menus/:id', method: 'DELETE', description: 'Delete menu item', isMerchant: true, hidden: false },
  { name: 'menus.getStaff', endpoint: '/api/v1/menus/staff', method: 'GET', description: 'Get staff menu view', isMerchant: true, hidden: false },
  { name: 'menus.toggleAvailability', endpoint: '/api/v1/menus/:id/toggle-availability', method: 'PATCH', description: 'Toggle menu item availability', isMerchant: true, hidden: false },
  { name: 'menus.publish', endpoint: '/api/v1/menus/publish', method: 'POST', description: 'Publish menu group', isMerchant: true, hidden: false },
  { name: 'menus.archive', endpoint: '/api/v1/menus/:id/archive', method: 'PATCH', description: 'Archive menu item', isMerchant: true, hidden: false },
  { name: 'menus.getBranchPublications', endpoint: '/api/v1/menus/publications/branch/:branchId', method: 'GET', description: 'Get branch menu publications', isMerchant: true, hidden: false },
  { name: 'menu.publish', endpoint: '/api/v1/menu/publish', method: 'POST', description: 'Publish menu (alt route)', isMerchant: true, hidden: false },
  { name: 'menu.archiveItem', endpoint: '/api/v1/menu/items/:id/archive', method: 'PATCH', description: 'Archive menu item (alt route)', isMerchant: true, hidden: false },
  { name: 'menu.getBranchPublications', endpoint: '/api/v1/menu/publications/branch/:branchId', method: 'GET', description: 'Get branch publications (alt route)', isMerchant: true, hidden: false },

  // ========== MENU GROUPS MODULE (9 tasks) ==========
  { name: 'menuGroups.listLight', endpoint: '/api/v1/menu-groups/light', method: 'GET', description: 'List menu groups (light)', isMerchant: true, hidden: false },
  { name: 'menuGroups.list', endpoint: '/api/v1/menu-groups', method: 'GET', description: 'List all menu groups', isMerchant: true, hidden: false },
  { name: 'menuGroups.create', endpoint: '/api/v1/menu-groups', method: 'POST', description: 'Create menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.read', endpoint: '/api/v1/menu-groups/:id', method: 'GET', description: 'Get menu group by ID', isMerchant: true, hidden: false },
  { name: 'menuGroups.update', endpoint: '/api/v1/menu-groups/:id', method: 'PATCH', description: 'Update menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.delete', endpoint: '/api/v1/menu-groups/:id', method: 'DELETE', description: 'Delete menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.addItem', endpoint: '/api/v1/menu-groups/:id/add-item', method: 'PATCH', description: 'Add item to menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.removeItem', endpoint: '/api/v1/menu-groups/:id/remove-item', method: 'PATCH', description: 'Remove item from menu group', isMerchant: true, hidden: false },
  { name: 'menuGroups.reorder', endpoint: '/api/v1/menu-groups/:id/reorder', method: 'PATCH', description: 'Reorder menu group items', isMerchant: true, hidden: false },

  // ========== BRANCH MENU GROUPS MODULE (8 tasks) ==========
  { name: 'branchMenuGroups.list', endpoint: '/api/v1/branch-menu-groups', method: 'GET', description: 'List branch menu groups', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.create', endpoint: '/api/v1/branch-menu-groups', method: 'POST', description: 'Create branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.read', endpoint: '/api/v1/branch-menu-groups/:id', method: 'GET', description: 'Get branch menu group by ID', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.update', endpoint: '/api/v1/branch-menu-groups/:id', method: 'PATCH', description: 'Update branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.delete', endpoint: '/api/v1/branch-menu-groups/:id', method: 'DELETE', description: 'Delete branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.addItem', endpoint: '/api/v1/branch-menu-groups/:id/add-item', method: 'PATCH', description: 'Add item to branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.removeItem', endpoint: '/api/v1/branch-menu-groups/:id/remove-item', method: 'PATCH', description: 'Remove item from branch menu group', isMerchant: true, hidden: false },
  { name: 'branchMenuGroups.reorder', endpoint: '/api/v1/branch-menu-groups/:id/reorder', method: 'PATCH', description: 'Reorder branch menu group items', isMerchant: true, hidden: false },

  // ========== COMBOS MODULE (9 tasks) ==========
  { name: 'combos.list', endpoint: '/api/v1/combos', method: 'GET', description: 'List all combos', isMerchant: true, hidden: false },
  { name: 'combos.create', endpoint: '/api/v1/combos', method: 'POST', description: 'Create combo', isMerchant: true, hidden: false },
  { name: 'combos.read', endpoint: '/api/v1/combos/:id', method: 'GET', description: 'Get combo by ID', isMerchant: true, hidden: false },
  { name: 'combos.update', endpoint: '/api/v1/combos/:id', method: 'PATCH', description: 'Update combo', isMerchant: true, hidden: false },
  { name: 'combos.delete', endpoint: '/api/v1/combos/:id', method: 'DELETE', description: 'Delete combo', isMerchant: true, hidden: false },
  { name: 'combos.toggleActive', endpoint: '/api/v1/combos/:id/toggle-active', method: 'PATCH', description: 'Toggle combo active status', isMerchant: true, hidden: false },
  { name: 'combos.toggleBranch', endpoint: '/api/v1/combos/:comboId/branch-toggle', method: 'PATCH', description: 'Toggle combo for branch', isMerchant: true, hidden: false },
  { name: 'combos.updateBranchOverride', endpoint: '/api/v1/combos/:comboId/branch-override', method: 'PATCH', description: 'Update branch combo override', isMerchant: true, hidden: false },
  { name: 'combos.incrementSold', endpoint: '/api/v1/combos/increment-sold', method: 'POST', description: 'Increment combo sold count', isMerchant: true, hidden: false },

  // ========== MERCHANTS MODULE (26 tasks - 10 system-wide, 16 merchant-scoped) ==========
  { name: 'merchants.createKyc', endpoint: '/api/v1/merchants/kyc', method: 'POST', description: 'Submit KYC documents', isMerchant: true, hidden: false },
  { name: 'merchants.roles.list', endpoint: '/api/v1/merchants/roles', method: 'GET', description: 'List merchant roles', isMerchant: true, hidden: false },
  { name: 'merchants.roles.create', endpoint: '/api/v1/merchants/roles', method: 'POST', description: 'Create merchant role', isMerchant: true, hidden: false },
  { name: 'merchants.roles.read', endpoint: '/api/v1/merchants/roles/:id', method: 'GET', description: 'Get merchant role by ID', isMerchant: true, hidden: false },
  { name: 'merchants.roles.update', endpoint: '/api/v1/merchants/roles/:id', method: 'PATCH', description: 'Update merchant role', isMerchant: true, hidden: false },
  { name: 'merchants.roles.delete', endpoint: '/api/v1/merchants/roles/:id', method: 'DELETE', description: 'Delete merchant role', isMerchant: true, hidden: false },
  { name: 'merchants.roles.activate', endpoint: '/api/v1/merchants/roles/:id/activate', method: 'PATCH', description: 'Activate merchant role', isMerchant: true, hidden: false },
  { name: 'merchants.users.list', endpoint: '/api/v1/merchants/users', method: 'GET', description: 'List merchant users', isMerchant: true, hidden: false },
  { name: 'merchants.users.create', endpoint: '/api/v1/merchants/users', method: 'POST', description: 'Create merchant user', isMerchant: true, hidden: false },
  { name: 'merchants.users.read', endpoint: '/api/v1/merchants/users/:id', method: 'GET', description: 'Get merchant user by ID', isMerchant: true, hidden: false },
  { name: 'merchants.users.update', endpoint: '/api/v1/merchants/users/:id', method: 'PATCH', description: 'Update merchant user', isMerchant: true, hidden: false },
  { name: 'merchants.users.delete', endpoint: '/api/v1/merchants/users/:id', method: 'DELETE', description: 'Delete merchant user', isMerchant: true, hidden: false },
  { name: 'merchants.users.activate', endpoint: '/api/v1/merchants/users/:id/activate', method: 'PATCH', description: 'Activate merchant user', isMerchant: true, hidden: false },
  { name: 'merchants.users.listByBranch', endpoint: '/api/v1/merchants/users/branch/:id', method: 'GET', description: 'List users by branch', isMerchant: true, hidden: false },
  { name: 'merchants.me.read', endpoint: '/api/v1/merchants/me', method: 'GET', description: 'Get own merchant profile', isMerchant: true, hidden: false },
  { name: 'merchants.me.update', endpoint: '/api/v1/merchants/me', method: 'PATCH', description: 'Update own merchant profile', isMerchant: true, hidden: false },
  
  // SYSTEM-WIDE MERCHANT OPERATIONS (isMerchant: false)
  { name: 'merchants.list', endpoint: '/api/v1/merchants', method: 'GET', description: 'List all merchants (system-wide)', isMerchant: false, hidden: false },
  { name: 'merchants.create', endpoint: '/api/v1/merchants', method: 'POST', description: 'Create merchant (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.read', endpoint: '/api/v1/merchants/:id', method: 'GET', description: 'Get any merchant by ID (system-wide)', isMerchant: false, hidden: false },
  { name: 'merchants.update', endpoint: '/api/v1/merchants/:id', method: 'PATCH', description: 'Update any merchant (system-wide)', isMerchant: false, hidden: false },
  { name: 'merchants.delete', endpoint: '/api/v1/merchants/:id', method: 'DELETE', description: 'Delete any merchant (system-wide)', isMerchant: false, hidden: false },
  { name: 'merchants.approve', endpoint: '/api/v1/merchants/:id/approve', method: 'PATCH', description: 'Approve merchant KYC (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.suspend', endpoint: '/api/v1/merchants/:id/suspend', method: 'PATCH', description: 'Suspend merchant (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.activate', endpoint: '/api/v1/merchants/:id/activate', method: 'PATCH', description: 'Activate merchant (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.updateSubscription', endpoint: '/api/v1/merchants/:id/subscription', method: 'PATCH', description: 'Update merchant subscription (system operation)', isMerchant: false, hidden: false },
  { name: 'merchants.getStats', endpoint: '/api/v1/merchants/:id/stats', method: 'GET', description: 'Get merchant stats (system-wide)', isMerchant: false, hidden: false },

  // ========== ORDERS MODULE (15 tasks) ==========
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
  { name: 'orders.markPaid', endpoint: '/api/v1/orders/:id/pay', method: 'POST', description: 'Mark order as paid', isMerchant: true, hidden: false },
  { name: 'orders.updateStatus', endpoint: '/api/v1/orders/:id/status', method: 'PATCH', description: 'Update order status', isMerchant: true, hidden: false },
  { name: 'orders.addItems', endpoint: '/api/v1/orders/:id/add-items', method: 'PATCH', description: 'Add items to order', isMerchant: true, hidden: false },
  { name: 'orders.read', endpoint: '/api/v1/orders/:id', method: 'GET', description: 'Get order by ID', isMerchant: true, hidden: false },
  { name: 'orders.listActiveDeliveries', endpoint: '/api/v1/orders/deliveries/active', method: 'GET', description: 'List active deliveries', isMerchant: true, hidden: false },

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
];
\`\`\`

---

## Summary

- **Total tasks**: 156
- **Merchant-scoped (isMerchant: true)**: 146 tasks
- **System-wide (isMerchant: false)**: 10 tasks
- **All tasks have**: `hidden: false`
- **Parameter name fix**: `sessions.getByTable` uses `:tableId` (confirmed)
