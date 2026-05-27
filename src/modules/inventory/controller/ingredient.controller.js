/**
 * @file src/modules/inventory/controller/ingredient.controller.js
 * @description Ingredient CRUD — raw material catalog.
 * All business logic is inline; no legacy dependency.
 */

const Ingredient = require('../../../../models/Ingredient');
const catchAsync = require('../../../../utils/catchAsync');
const AppError   = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');

// GET /api/v1/ingredients
exports.getAllIngredients = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const ingredients = await Ingredient.find({ merchant: merchantId, isActive: true })
    .populate('supplier', 'name')
    .sort({ name: 1 });

  res.status(200).json({ status: 'success', results: ingredients.length, data: { ingredients } });
});

// GET /api/v1/ingredients/:id
exports.getIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOne({ _id: req.params.id, merchant: merchantId })
    .populate('supplier', 'name');

  if (!ingredient) return next(new AppError('Ingredient not found', 404));
  res.status(200).json({ status: 'success', data: { ingredient } });
});

// POST /api/v1/ingredients
exports.createIngredient = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.create({ ...req.body, merchant: merchantId });
  res.status(201).json({ status: 'success', data: { ingredient } });
});

// PATCH /api/v1/ingredients/:id
exports.updateIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!ingredient) return next(new AppError('Ingredient not found', 404));
  res.status(200).json({ status: 'success', data: { ingredient } });
});

// DELETE /api/v1/ingredients/:id  (soft delete)
exports.deleteIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { isActive: false },
    { new: true }
  );
  if (!ingredient) return next(new AppError('Ingredient not found', 404));
  res.status(204).json({ status: 'success', data: null });
});
