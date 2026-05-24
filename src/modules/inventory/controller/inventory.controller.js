const { InventoryService } = require('../service/InventoryService');
const catchAsync = require('../../../../utils/catchAsync');

exports.adjustStock = catchAsync(async (req, res) => {
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

exports.getStockMovements = catchAsync(async (req, res) => {
  const merchantId = req.user.merchant._id;
  const movements = await InventoryService.getStockMovements(merchantId, req.query);

  res.status(200).json({
    status: 'success',
    results: movements.length,
    data: { movements },
  });
});

exports.getInventoryValuation = catchAsync(async (req, res) => {
  const merchantId = req.user.merchant._id;
  const valuation = await InventoryService.getInventoryValuation(merchantId);

  res.status(200).json({
    status: 'success',
    data: { valuation },
  });
});

exports.getLowStockAlerts = catchAsync(async (req, res) => {
  const merchantId = req.user.merchant._id;
  const alerts = await InventoryService.getLowStockAlerts(merchantId);

  res.status(200).json({
    status: 'success',
    results: alerts.length,
    data: { alerts },
  });
});
