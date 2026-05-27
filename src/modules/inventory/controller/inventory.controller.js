/**
 * Inventory Controller
 * 
 * HTTP request/response handling only.
 * All business logic delegated to InventoryService.
 * All data validation via Zod schemas in middleware.
 */

const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { InventoryService } = require('../service/inventory.service');

/**
 * GET /api/v1/inventory/valuation
 * 
 * Get total inventory value and statistics
 */
exports.getInventoryValuation = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  const valuation = await InventoryService.getInventoryValuation(merchantId);

  res.status(200).json({
    status: 'success',
    data: {
      inventory: {
        totalValue: valuation.totalValue,
        itemCount: valuation.itemCount,
        lowStockCount: valuation.lowStockCount,
      },
    },
  });
});

/**
 * POST /api/v1/inventory/adjust
 * 
 * Adjust stock for a single ingredient
 * 
 * Body: { ingredientId, quantity, type, reason, reference, cost }
 */
exports.adjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { ingredientId, quantity, type, reason, reference, cost } = req.body;
  const performedBy = req.user._id;

  const ingredient = await InventoryService.adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    performedBy,
    cost
  );

  res.status(200).json({
    status: 'success',
    message: `Stock adjusted successfully`,
    data: {
      ingredient: {
        _id: ingredient._id,
        name: ingredient.name,
        currentStock: ingredient.currentStock,
        unit: ingredient.unit,
      },
    },
  });
});

/**
 * POST /api/v1/inventory/batch-adjust
 * 
 * Batch adjust stock for multiple ingredients
 * 
 * Body: { adjustments: [{ ingredientId, quantity, type, reason, cost }, ...] }
 */
exports.batchAdjustStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { adjustments } = req.body;
  const performedBy = req.user._id;

  const results = await InventoryService.batchAdjustStock(
    merchantId,
    adjustments,
    performedBy
  );

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  res.status(200).json({
    status: 'success',
    message: `${successful} adjustments succeeded, ${failed} failed`,
    data: {
      results,
    },
  });
});

/**
 * GET /api/v1/inventory/low-stock
 * 
 * Get all items with low stock (currentStock <= minStock)
 */
exports.getLowStockItems = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  const items = await InventoryService.getLowStockItems(merchantId);

  res.status(200).json({
    status: 'success',
    count: items.length,
    data: {
      items: items.map(item => ({
        _id: item._id,
        name: item.name,
        currentStock: item.currentStock,
        minStock: item.minStock,
        unit: item.unit,
        status: item.stockStatus,
      })),
    },
  });
});

/**
 * GET /api/v1/inventory/stock-movements
 * 
 * Get stock movement history (audit log)
 * 
 * Query: { ingredientId?, type?, startDate?, endDate?, limit, offset }
 */
exports.getStockMovements = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { ingredientId, type, startDate, endDate, limit, offset } = req.query;

  const movements = await InventoryService.getStockMovements(
    merchantId,
    { ingredientId, type, startDate, endDate },
    { limit: parseInt(limit) || 20, offset: parseInt(offset) || 0 }
  );

  res.status(200).json({
    status: 'success',
    count: movements.length,
    data: {
      movements: movements.map(m => ({
        _id: m._id,
        ingredient: m.ingredient,
        type: m.type,
        quantity: m.quantity,
        previousStock: m.previousStock,
        newStock: m.newStock,
        reason: m.reason,
        reference: m.reference,
        performedBy: m.performedBy,
        createdAt: m.createdAt,
      })),
    },
  });
});

/**
 * PATCH /api/v1/inventory/:ingredientId/thresholds
 * 
 * Set min/max stock thresholds
 * 
 * Body: { minStock, maxStock }
 */
exports.setStockThresholds = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { ingredientId } = req.params;
  const { minStock, maxStock } = req.body;

  const ingredient = await InventoryService.setStockThresholds(
    merchantId,
    ingredientId,
    minStock,
    maxStock
  );

  res.status(200).json({
    status: 'success',
    data: {
      ingredient: {
        _id: ingredient._id,
        name: ingredient.name,
        minStock: ingredient.minStock,
        maxStock: ingredient.maxStock,
      },
    },
  });
});

/**
 * POST /api/v1/inventory/validate-order
 * 
 * Validate stock availability for order items BEFORE placement
 * 
 * Body: { items: [{ ingredientId, quantity }, ...] }
 * Response: { available, shortages: [...] }
 */
exports.validateOrderStock = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { items } = req.body;

  const validation = await InventoryService.validateStockAvailability(items);

  res.status(200).json({
    status: 'success',
    data: {
      available: validation.available,
      shortages: validation.shortages,
    },
  });
});
