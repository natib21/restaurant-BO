// controllers/supplierController.js
const Supplier = require('../models/Supplier');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all suppliers
exports.getAllSuppliers = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const suppliers = await Supplier.find({ merchant: merchantId, isActive: true })
    .sort({ name: 1 });

  res.status(200).json({
    status: 'success',
    results: suppliers.length,
    data: { suppliers },
  });
});

// Get single supplier
exports.getSupplier = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const supplier = await Supplier.findOne({
    _id: req.params.id,
    merchant: merchantId,
  });

  if (!supplier) {
    return next(new AppError('Supplier not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { supplier },
  });
});

// Create supplier
exports.createSupplier = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const supplierData = {
    ...req.body,
    merchant: merchantId,
  };

  const supplier = await Supplier.create(supplierData);

  res.status(201).json({
    status: 'success',
    data: { supplier },
  });
});

// Update supplier
exports.updateSupplier = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!supplier) {
    return next(new AppError('Supplier not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { supplier },
  });
});

// Delete supplier (soft delete)
exports.deleteSupplier = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { isActive: false },
    { new: true }
  );

  if (!supplier) {
    return next(new AppError('Supplier not found', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});