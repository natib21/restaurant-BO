
const Ingredient = require('../models/Ingredient');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
// Get all ingredients for merchant




exports.getAllIngredients = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const ingredients = await Ingredient.find({ merchant: merchantId, isActive: true })
    .populate('supplier', 'name')
    .sort({ name: 1 });

  res.status(200).json({
    status: 'success',
    results: ingredients.length,
    data: { ingredients },
  });
});

// Get single ingredient
exports.getIngredient = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const ingredient = await Ingredient.findOne({
    _id: req.params.id,
    merchant: merchantId,
  }).populate('supplier', 'name');

  if (!ingredient) {
    return next(new AppError('Ingredient not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { ingredient },
  });
});

// Create ingredient
exports.createIngredient = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const ingredientData = {
    ...req.body,
    merchant: merchantId,
  };

  const ingredient = await Ingredient.create(ingredientData);

  res.status(201).json({
    status: 'success',
    data: { ingredient },
  });
});

// Update ingredient
exports.updateIngredient = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!ingredient) {
    return next(new AppError('Ingredient not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { ingredient },
  });
});

// Delete ingredient (soft delete)
exports.deleteIngredient = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { isActive: false },
    { new: true }
  );

  if (!ingredient) {
    return next(new AppError('Ingredient not found', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
