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
const healthRoutes = require('../modules/health/health.routes');
const integrityRoutes = require('../modules/integrity/integrity.routes');
const fileRoutes = require('../modules/files/file.routes');

// ── Auth ─────────────────────────────────────────────────────────────────────
const authRoutes = require('../modules/auth/auth.routes');
const legacyAuthRoutes = require('../modules/auth/legacy-auth.routes');

// ── Core Domain ──────────────────────────────────────────────────────────────
const merchantRoutes = require('../modules/merchants/merchants.routes');
const userRoutes = require('../modules/users/users.routes');
const branchRoutes = require('../modules/branches/branches.routes');
const tableRoutes = require('../modules/tables/tables.routes');
const customerRoutes = require('../modules/customers/customers.routes');
const sessionRoutes = require('../modules/sessions/sessions.routes');

// ── Menu Domain ───────────────────────────────────────────────────────────────
const menuRoutes = require('../modules/menu/menus.routes');
const menuGroupRoutes = require('../modules/menu/menu-groups.routes');
const branchMenuGroupRoutes = require('../modules/menu/branch-menu-groups.routes');
const comboRoutes = require('../modules/menu/combos.routes');

// ── Order Domain ──────────────────────────────────────────────────────────────
const orderRoutes = require('../modules/orders/orders.routes');

// ── Kitchen / KDS Domain ─────────────────────────────────────────────────────
const kitchenRoutes = require('../modules/kitchen/kitchen.routes');

// ── Inventory Domain ──────────────────────────────────────────────────────────
const ingredientRoutes = require('../modules/inventory/ingredients.routes');
const inventoryRoutes = require('../modules/inventory/inventory.routes');
const recipeRoutes = require('../modules/inventory/recipes.routes');
const supplierRoutes = require('../modules/inventory/suppliers.routes');
const purchaseOrderRoutes = require('../modules/inventory/purchase-orders.routes');

// ── Staff / RBAC ──────────────────────────────────────────────────────────────
const staffAssignmentRoutes = require('../modules/branches/staff-assignments.routes');
const roleRoutes = require('../modules/roles/roles.routes');
const taskRoutes = require('../modules/roles/tasks.routes');

// ── Feedback / Campaigns ───────────────────────────────────────────────────────
const subscriptionRoutes = require('../modules/subscriptions/subscriptions.routes');
const feedbackRoutes = require('../modules/feedback/feedback.routes');
const campaignRoutes = require('../modules/campaign/campaignRoutes');

// ── Analytics & Reports ───────────────────────────────────────────────────────
const analyticsRoutes = require('../modules/analytics/analytics.routes');
const reportRoutes = require('../modules/reports/reports.routes');

// ── Audit Logging (PHASE 2) ──────────────────────────────────────────────────
const auditRoutes = require('../modules/audit/audit.routes');

// ── Telegram ──────────────────────────────────────────────────────────────────
const telegramWebhookRoutes = require('../modules/telegram/routes/telegramWebhookRoute'); // public
const telegramAdminRoutes = require('../modules/telegram/routes/telegramAdminRoute'); // authenticated
const telegramminiappRoutes = require('../modules/telegram/routes/telegramMiniAppRoute');
// ─────────────────────────────────────────────────────────────────────────────

const router = express.Router();

// ── 1. Public webhooks (no auth — verified via per-merchant secret) ─────────
router.use('/api/v1/telegram', telegramWebhookRoutes); // POST /api/v1/telegram/webhook/:merchantId

// ── 2. Health (public, no auth) ───────────────────────────────────────────────
router.use(healthRoutes);

// ── 3. System (SUPER-ADMIN only) ──────────────────────────────────────────────
router.use('/api/v1/system/integrity', integrityRoutes);

// ── 4. Files ──────────────────────────────────────────────────────────────────
router.use('/api/v1/files', fileRoutes);

// ── 5. Auth ───────────────────────────────────────────────────────────────────
router.use('/api/v1/auth', authRoutes);

// Legacy auth aliases (pre-refactor paths)
router.use('/api/v1/user', legacyAuthRoutes);
router.use('/api/auth', legacyAuthRoutes.legacyApiAuthRouter);

// ── 6. Users ──────────────────────────────────────────────────────────────────
router.use('/api/v1/users', userRoutes);

// ── 7. Merchants ──────────────────────────────────────────────────────────────
router.use('/api/v1/merchant', merchantRoutes);
router.use('/api/v1/merchant', telegramAdminRoutes); // POST /api/v1/merchant/:merchantId/telegram/connect
router.use('/api/v1/telegram', telegramminiappRoutes); // POST /api/v1/telegram/miniapp/verify
// ── 8. Branches ───────────────────────────────────────────────────────────────
router.use('/api/v1/branch', branchRoutes);

// ── 9. Tables ─────────────────────────────────────────────────────────────────
router.use('/api/v1/table', tableRoutes);

// ── 10. Customers ─────────────────────────────────────────────────────────────
router.use('/api/v1/customer', customerRoutes);

// ── 11. Sessions (QR table sessions) ─────────────────────────────────────────
router.use('/api/v1/sessions', sessionRoutes);

// ── 12. Menu ──────────────────────────────────────────────────────────────────
router.use('/api/v1/menu', menuRoutes);
router.use('/api/v1/menu-group', menuGroupRoutes);
router.use('/api/v1/branch-menu-group', branchMenuGroupRoutes);
router.use('/api/v1/combo', comboRoutes);

// ── 13. Orders ────────────────────────────────────────────────────────────────
router.use('/api/v1/order', orderRoutes);

// ── 13.5. Kitchen / KDS ──────────────────────────────────────────────────────
router.use('/api/v1/kitchen', kitchenRoutes);

// ── 14. Inventory ─────────────────────────────────────────────────────────────
router.use('/api/v1/ingredients', ingredientRoutes);
router.use('/api/v1/inventory', inventoryRoutes);
router.use('/api/v1/recipes', recipeRoutes);
router.use('/api/v1/suppliers', supplierRoutes);
router.use('/api/v1/purchase-orders', purchaseOrderRoutes);

// ── 15. Staff Assignments ─────────────────────────────────────────────────────
router.use('/api/v1/staff-assignments', staffAssignmentRoutes);

// ── 16. RBAC (SUPER-ADMIN) ────────────────────────────────────────────────────
router.use('/api/v1/roles', roleRoutes);
router.use('/api/v1/tasks', taskRoutes);

// ── 17. Subscriptions ─────────────────────────────────────────────────────────
router.use('/api/v1/subscriptions', subscriptionRoutes);

// ── 18. Feedback ──────────────────────────────────────────────────────────────
router.use('/api/v1/feedback', feedbackRoutes);

// ── 19. Campaigns ─────────────────────────────────────────────────────────────
router.use('/api/v1/campaigns', campaignRoutes);

// ── 20. Analytics ─────────────────────────────────────────────────────────────
router.use('/api/v1/analytics', analyticsRoutes);

// ── 21. Reports ───────────────────────────────────────────────────────────────
router.use('/api/v1/reports', reportRoutes);

// ── 22. Audit Logs (PHASE 2) ──────────────────────────────────────────────────
router.use('/api/v1/audit-logs', auditRoutes);

module.exports = router;
