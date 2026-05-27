/**
 * @file src/modules/inventory/controller/purchase-order.controller.js
 * @description Purchase order CRUD + goods receipt — no legacy dependency.
 */

const PurchaseOrder = require('../../../../models/PurchaseOrder');
const catchAsync    = require('../../../../utils/catchAsync');
const AppError      = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { InventoryService } = require('../service/inventory.service');

exports.getAllPurchaseOrders = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const purchaseOrders = await PurchaseOrder.find({ merchant: merchantId })
    .populate('supplier', 'name')
    .populate('createdBy', 'firstName lastName')
    .sort({ createdAt: -1 });
  res.status(200).json({ status: 'success', results: purchaseOrders.length, data: { purchaseOrders } });
});

exports.getPurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const purchaseOrder = await PurchaseOrder.findOne({ _id: req.params.id, merchant: merchantId })
    .populate('supplier', 'name contactPerson phone')
    .populate('createdBy', 'firstName lastName')
    .populate('approvedBy', 'firstName lastName')
    .populate('items.ingredient', 'name unit');
  if (!purchaseOrder) return next(new AppError('Purchase order not found', 404));
  res.status(200).json({ status: 'success', data: { purchaseOrder } });
});

exports.createPurchaseOrder = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const purchaseOrder = await PurchaseOrder.create({
    ...req.body,
    merchant: merchantId,
    createdBy: req.user._id,
  });
  res.status(201).json({ status: 'success', data: { purchaseOrder } });
});

exports.updatePurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const purchaseOrder = await PurchaseOrder.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!purchaseOrder) return next(new AppError('Purchase order not found', 404));
  res.status(200).json({ status: 'success', data: { purchaseOrder } });
});

exports.deletePurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const purchaseOrder = await PurchaseOrder.findOneAndDelete({ _id: req.params.id, merchant: merchantId });
  if (!purchaseOrder) return next(new AppError('Purchase order not found', 404));
  res.status(204).json({ status: 'success', data: null });
});

// POST /purchase-orders/:id/receive — triggers InventoryService.adjustStock
exports.receivePurchaseOrder = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const purchaseOrder = await PurchaseOrder.findOne({ _id: req.params.id, merchant: merchantId });
  if (!purchaseOrder) return next(new AppError('Purchase order not found', 404));
  if (purchaseOrder.status === 'received') return next(new AppError('Purchase order already received', 400));

  const { receivedItems } = req.body; // [{ ingredientId, receivedQuantity }]

  for (const item of receivedItems) {
    const poItem = purchaseOrder.items.find(i => i.ingredient.toString() === item.ingredientId);
    if (poItem) {
      await InventoryService.adjustStock(
        merchantId,
        item.ingredientId,
        item.receivedQuantity,
        'in',
        'purchase',
        purchaseOrder.poNumber,
        req.user._id,
        poItem.unitPrice
      );
    }
  }

  purchaseOrder.status = 'received';
  purchaseOrder.actualDeliveryDate = new Date();
  await purchaseOrder.save();

  res.status(200).json({
    status: 'success',
    message: 'Purchase order received and stock updated',
    data: { purchaseOrder },
  });
});
