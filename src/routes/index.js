/**
 * @file src/routes/index.js
 * @description Global router aggregator — single source of truth for ALL API routes.
 *
 * Rules enforced here:
 *  - Every route lives under /api/v1/*
 *  - Every route is served by a module in src/modules/*
 *  - No business logic here — only mounting
 *  - Middleware order: CORS/Helmet/RateLimit (in create-app) → RequestContext → Auth → Route
 *
 * Mount order matters:
 *  1. Public / webhook routes (no auth)
 *  2. Health (no auth)
 *  3. Auth routes
 *  4. All protected domain routes
 */

const express = require('express');

// ── Infrastructure / System ──────────────────────────────────────────────────
const healthRoutes        = require('../modules/health/health.routes');
const integrityRoutes     = require('../modules/integrity/integrity.routes');
const fileRoutes          = require('../modules/files/file.routes');

// ── Auth ─────────────────────────────────────────────────────────────────────
const authRoutes          = require('../modules/auth/auth.routes');

// ── Core Domain ──────────────────────────────────────────────────────────────
const merchantRoutes      = require('../modules/merchants/merchants.routes');
const userRoutes          = require('../modules/users/users.routes');
const branchRoutes        = require('../modules/branches/branches.routes');
const tableRoutes         = require('../modules/tables/tables.routes');
const customerRoutes      = require('../modules/customers/customers.routes');
const sessionRoutes       = require('../modules/sessions/sessions.routes');

// ── Menu Domain ───────────────────────────────────────────────────────────────
const menuRoutes          = require('../modules/menu/menus.routes');
const menuGroupRoutes     = require('../modules/menu/menu-groups.routes');
const branchMenuGroupRoutes = require('../modules/menu/branch-menu-groups.routes');
const comboRoutes         = require('../modules/menu/combos.routes');

// ── Order Domain ──────────────────────────────────────────────────────────────
const orderRoutes         = require('../modules/orders/orders.routes');

// ── Inventory Domain ──────────────────────────────────────────────────────────
const ingredientRoutes    = require('../modules/inventory/ingredients.routes');
const inventoryRoutes     = require('../modules/inventory/inventory.routes');
const recipeRoutes        = require('../modules/inventory/recipes.routes');
const supplierRoutes      = require('../modules/inventory/suppliers.routes');
const purchaseOrderRoutes = require('../modules/inventory/purchase-orders.routes');

// ── Staff / RBAC ──────────────────────────────────────────────────────────────
const staffAssignmentRoutes = require('../modules/branches/staff-assignments.routes');
const roleRoutes          = require('../modules/roles/roles.routes');
const taskRoutes          = require('../modules/roles/tasks.routes');

// ── Subscriptions ─────────────────────────────────────────────────────────────
const subscriptionRoutes  = require('../modules/subscriptions/subscriptions.routes');

// ── Analytics ─────────────────────────────────────────────────────────────────
const analyticsRoutes     = require('../modules/analytics/analytics.routes');

// ─────────────────────────────────────────────────────────────────────────────

const router = express.Router();

// ── 1. Health (public, no auth) ───────────────────────────────────────────────
router.use(healthRoutes);

// ── 2. System (SUPER-ADMIN only) ──────────────────────────────────────────────
router.use('/api/v1/system/integrity', integrityRoutes);

// ── 3. Files ──────────────────────────────────────────────────────────────────
router.use('/api/v1/files', fileRoutes);

// ── 4. Auth ───────────────────────────────────────────────────────────────────
router.use('/api/v1/auth', authRoutes);

// ── 5. Users ──────────────────────────────────────────────────────────────────
router.use('/api/v1/users', userRoutes);

// ── 6. Merchants ──────────────────────────────────────────────────────────────
router.use('/api/v1/merchants', merchantRoutes);

// ── 7. Branches ───────────────────────────────────────────────────────────────
router.use('/api/v1/branches', branchRoutes);

// ── 8. Tables ─────────────────────────────────────────────────────────────────
router.use('/api/v1/tables', tableRoutes);

// ── 9. Customers ──────────────────────────────────────────────────────────────
router.use('/api/v1/customers', customerRoutes);

// ── 10. Sessions (QR table sessions) ─────────────────────────────────────────
router.use('/api/v1/sessions', sessionRoutes);

// ── 11. Menu ──────────────────────────────────────────────────────────────────
router.use('/api/v1/menus', menuRoutes);
router.use('/api/v1/menu-groups', menuGroupRoutes);
router.use('/api/v1/branch-menu-groups', branchMenuGroupRoutes);
router.use('/api/v1/combos', comboRoutes);

// ── 12. Orders ────────────────────────────────────────────────────────────────
router.use('/api/v1/orders', orderRoutes);

// ── 13. Inventory ─────────────────────────────────────────────────────────────
router.use('/api/v1/ingredients', ingredientRoutes);
router.use('/api/v1/inventory', inventoryRoutes);
router.use('/api/v1/recipes', recipeRoutes);
router.use('/api/v1/suppliers', supplierRoutes);
router.use('/api/v1/purchase-orders', purchaseOrderRoutes);

// ── 14. Staff Assignments ─────────────────────────────────────────────────────
router.use('/api/v1/staff-assignments', staffAssignmentRoutes);

// ── 15. RBAC (SUPER-ADMIN) ────────────────────────────────────────────────────
router.use('/api/v1/roles', roleRoutes);
router.use('/api/v1/tasks', taskRoutes);

// ── 16. Subscriptions ─────────────────────────────────────────────────────────
router.use('/api/v1/subscriptions', subscriptionRoutes);

// ── 17. Analytics ─────────────────────────────────────────────────────────────
router.use('/api/v1/analytics', analyticsRoutes);

module.exports = router;
