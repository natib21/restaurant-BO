/**
 * @file src/modules/inventory/controller/ingredient.controller.js
 * @description Ingredient CRUD — raw material catalog.
 * All business logic is inline; no legacy dependency.
 */

const Ingredient = require('../../../../models/Ingredient');
const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');

// GET /api/v1/ingredients
exports.getAllIngredients = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { branch } = req.query;  // ← Optional: filter by branch if provided

  const query = { merchant: merchantId, isActive: true };
  if (branch) {
    query.branch = branch;  // ← Filter by branch if requested
  }

  const ingredients = await Ingredient.find(query)
    .populate('supplier', 'name')
    .sort({ name: 1 });

  res.status(200).json({ status: 'success', results: ingredients.length, data: { ingredients } });
});

// GET /api/v1/ingredients/:id
exports.getIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const ingredient = await Ingredient.findOne({
    _id: req.params.id,
    merchant: merchantId,
  }).populate('supplier', 'name');

  if (!ingredient) return next(new AppError('Ingredient not found', 404));
  res.status(200).json({ status: 'success', data: { ingredient } });
});

// POST /api/v1/ingredients
exports.createIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const { branch } = req.body;

  // ✅ NEW: Require branch for per-branch ingredient isolation
  if (!branch) {
    return next(new AppError('Branch is required when creating an ingredient', 400));
  }

  const ingredient = await Ingredient.create({ 
    ...req.body, 
    merchant: merchantId,
    branch  // ← Explicitly set from request
  });

  res.status(201).json({ status: 'success', data: { ingredient } });
});

// PATCH /api/v1/ingredients/:id
exports.updateIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const branchId = req.query.branchId || req.body.branch;

  if (!branchId) {
    return next(new AppError('Branch is required to update ingredient', 400));
  }

  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId, branch: branchId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!ingredient) return next(new AppError('Ingredient not found', 404));
  res.status(200).json({ status: 'success', data: { ingredient } });
});

// DELETE /api/v1/ingredients/:id  (soft delete)
exports.deleteIngredient = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const branchId = req.query.branchId;

  if (!branchId) {
    return next(new AppError('Branch is required to delete ingredient', 400));
  }

  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId, branch: branchId },
    { isActive: false },
    { new: true }
  );
  if (!ingredient) return next(new AppError('Ingredient not found', 404));
  res.status(204).json({ status: 'success', data: null });
});
