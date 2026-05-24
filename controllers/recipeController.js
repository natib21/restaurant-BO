// controllers/recipeController.js
const Recipe = require('../models/Recipe');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all recipes for merchant
exports.getAllRecipes = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const recipes = await Recipe.find({ merchant: merchantId, isActive: true })
    .populate('menuItem', 'name')
    .populate('items.ingredient', 'name unit')
    .sort({ name: 1 });

  res.status(200).json({
    status: 'success',
    results: recipes.length,
    data: { recipes },
  });
});

// Get single recipe
exports.getRecipe = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const recipe = await Recipe.findOne({
    _id: req.params.id,
    merchant: merchantId,
  })
    .populate('menuItem', 'name')
    .populate('items.ingredient', 'name unit currentStock');

  if (!recipe) {
    return next(new AppError('Recipe not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { recipe },
  });
});

// Create recipe
exports.createRecipe = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  // Check if recipe already exists for this menu item
  const existingRecipe = await Recipe.findOne({
    merchant: merchantId,
    menuItem: req.body.menuItem,
    isActive: true,
  });

  if (existingRecipe) {
    return next(new AppError('Recipe already exists for this menu item', 400));
  }

  const recipeData = {
    ...req.body,
    merchant: merchantId,
  };

  const recipe = await Recipe.create(recipeData);

  res.status(201).json({
    status: 'success',
    data: { recipe },
  });
});

// Update recipe
exports.updateRecipe = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const recipe = await Recipe.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!recipe) {
    return next(new AppError('Recipe not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { recipe },
  });
});

// Delete recipe (soft delete)
exports.deleteRecipe = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const recipe = await Recipe.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { isActive: false },
    { new: true }
  );

  if (!recipe) {
    return next(new AppError('Recipe not found', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});