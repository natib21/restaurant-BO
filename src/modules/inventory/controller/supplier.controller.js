/**
 * @file src/modules/inventory/controller/supplier.controller.js
 * @description Supplier CRUD — no legacy dependency.
 */

const Supplier   = require('../../../../models/Supplier');
const catchAsync = require('../../../../utils/catchAsync');
const AppError   = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');

exports.getAllSuppliers = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const suppliers = await Supplier.find({ merchant: merchantId, isActive: true }).sort({ name: 1 });
  res.status(200).json({ status: 'success', results: suppliers.length, data: { suppliers } });
});

exports.getSupplier = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const supplier = await Supplier.findOne({ _id: req.params.id, merchant: merchantId });
  if (!supplier) return next(new AppError('Supplier not found', 404));
  res.status(200).json({ status: 'success', data: { supplier } });
});

exports.createSupplier = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const supplier = await Supplier.create({ ...req.body, merchant: merchantId });
  res.status(201).json({ status: 'success', data: { supplier } });
});

exports.updateSupplier = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!supplier) return next(new AppError('Supplier not found', 404));
  res.status(200).json({ status: 'success', data: { supplier } });
});

exports.deleteSupplier = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { isActive: false },
    { new: true }
  );
  if (!supplier) return next(new AppError('Supplier not found', 404));
  res.status(204).json({ status: 'success', data: null });
});
