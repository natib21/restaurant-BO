// controllers/purchaseOrderController.js
const PurchaseOrder = require('../models/PurchaseOrder');
const { InventoryService } = require('../src/modules/inventory');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all purchase orders
exports.getAllPurchaseOrders = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const purchaseOrders = await PurchaseOrder.find({ merchant: merchantId })
    .populate('supplier', 'name')
    .populate('createdBy', 'firstName lastName')
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: purchaseOrders.length,
    data: { purchaseOrders },
  });
});

// Get single purchase order
exports.getPurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const purchaseOrder = await PurchaseOrder.findOne({
    _id: req.params.id,
    merchant: merchantId,
  })
    .populate('supplier', 'name contactPerson phone')
    .populate('createdBy', 'firstName lastName')
    .populate('approvedBy', 'firstName lastName')
    .populate('items.ingredient', 'name unit');

  if (!purchaseOrder) {
    return next(new AppError('Purchase order not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { purchaseOrder },
  });
});

// Create purchase order
exports.createPurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const poData = {
    ...req.body,
    merchant: merchantId,
    createdBy: req.user._id,
  };

  const purchaseOrder = await PurchaseOrder.create(poData);

  res.status(201).json({
    status: 'success',
    data: { purchaseOrder },
  });
});

// Update purchase order
exports.updatePurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const purchaseOrder = await PurchaseOrder.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!purchaseOrder) {
    return next(new AppError('Purchase order not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { purchaseOrder },
  });
});

// Delete purchase order
exports.deletePurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const purchaseOrder = await PurchaseOrder.findOneAndDelete({
    _id: req.params.id,
    merchant: merchantId,
  });

  if (!purchaseOrder) {
    return next(new AppError('Purchase order not found', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Receive purchase order (update stock)
exports.receivePurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;
  const { receivedItems } = req.body; // Array of { ingredientId, receivedQuantity }

  const purchaseOrder = await PurchaseOrder.findOne({
    _id: id,
    merchant: merchantId,
  });

  if (!purchaseOrder) {
    return next(new AppError('Purchase order not found', 404));
  }

  if (purchaseOrder.status === 'received') {
    return next(new AppError('Purchase order already received', 400));
  }

  // Update stock for each received item
  for (const receivedItem of receivedItems) {
    const poItem = purchaseOrder.items.find(item =>
      item.ingredient.toString() === receivedItem.ingredientId
    );

    if (poItem) {
      await InventoryService.adjustStock(
        merchantId,
        receivedItem.ingredientId,
        receivedItem.receivedQuantity,
        'in',
        'purchase',
        purchaseOrder.poNumber,
        req.user._id,
        poItem.unitPrice
      );
    }
  }

  // Update PO status
  purchaseOrder.status = 'received';
  purchaseOrder.actualDeliveryDate = new Date();
  await purchaseOrder.save();

  res.status(200).json({
    status: 'success',
    message: 'Purchase order received and stock updated',
    data: { purchaseOrder },
  });
});