// controllers/inventoryController.js

const StockMovement = require('../models/StockMovement');
const InventoryService = require('../services/InventoryService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');




// Adjust stock
exports.adjustStock = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { ingredientId, quantity, type, reason, reference, cost } = req.body;

  const ingredient = await InventoryService.adjustStock(
    merchantId,
    ingredientId,
    quantity,
    type,
    reason,
    reference,
    req.user._id,
    cost
  );

  res.status(200).json({
    status: 'success',
    message: 'Stock adjusted successfully',
    data: { ingredient },
  });
});

// Get stock movements
exports.getStockMovements = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { ingredientId, type, startDate, endDate } = req.query;

  let filter = { merchant: merchantId };

  if (ingredientId) filter.ingredient = ingredientId;
  if (type) filter.type = type;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const movements = await StockMovement.find(filter)
    .populate('ingredient', 'name unit')
    .populate('performedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(100);

  res.status(200).json({
    status: 'success',
    results: movements.length,
    data: { movements },
  });
});

// Get inventory valuation
exports.getInventoryValuation = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const valuation = await InventoryService.getInventoryValuation(merchantId);

  res.status(200).json({
    status: 'success',
    data: { valuation },
  });
});

// Get low stock alerts
exports.getLowStockAlerts = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const alerts = await InventoryService.getLowStockAlerts(merchantId);

  res.status(200).json({
    status: 'success',
    results: alerts.length,
    data: { alerts },
  });
});