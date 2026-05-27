/**
 * @file src/modules/inventory/inventory.routes.js
 * @description Inventory operations — stock adjustments, movements, valuation, alerts.
 *
 * All routes require JWT auth + task RBAC.
 *
 * Middleware pipeline:
 *   protect → restrictTo() → validate → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const validate                = require('../../common/middleware/validate.middleware');
const inventoryController     = require('./controller/inventory.controller');
const {
  adjustStockSchema,
  batchAdjustStockSchema,
  getStockMovementsSchema,
  setStockThresholdsSchema,
  deductStockSchema,
} = require('./validators/inventory.validator');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

// ── Stock adjustments ─────────────────────────────────────────────────────────
router.post('/adjust',       validate(adjustStockSchema, 'body'),      inventoryController.adjustStock);
router.post('/batch-adjust', validate(batchAdjustStockSchema, 'body'), inventoryController.batchAdjustStock);

// ── Stock movements (audit log) ───────────────────────────────────────────────
router.get('/movements', validate(getStockMovementsSchema, 'query'), inventoryController.getStockMovements);

// ── Valuation & alerts ────────────────────────────────────────────────────────
router.get('/valuation',  inventoryController.getInventoryValuation);
router.get('/low-stock',  inventoryController.getLowStockItems);

// ── Thresholds ────────────────────────────────────────────────────────────────
router.patch('/:ingredientId/thresholds',
  validate(setStockThresholdsSchema, 'body'),
  inventoryController.setStockThresholds
);

// ── Pre-order stock validation ────────────────────────────────────────────────
router.post('/validate-order',
  validate(deductStockSchema, 'body'),
  inventoryController.validateOrderStock
);

module.exports = router;
