/**
 * @file src/modules/inventory/controller/recipe.controller.js
 * @description Recipe CRUD — maps menu items to ingredient quantities.
 */

const Recipe = require('../../../../models/Recipe');
const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');

exports.getAllRecipes = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const recipes = await Recipe.find({ merchant: merchantId, isActive: true })
    .populate('menuItem', 'name')
    .populate('items.ingredient', 'name unit')
    .sort({ name: 1 });

  res.status(200).json({ status: 'success', results: recipes.length, data: { recipes } });
});

exports.getRecipe = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const recipe = await Recipe.findOne({ _id: req.params.id, merchant: merchantId })
    .populate('menuItem', 'name')
    .populate('items.ingredient', 'name unit currentStock');

  if (!recipe) return next(new AppError('Recipe not found', 404));
  res.status(200).json({ status: 'success', data: { recipe } });
});

exports.createRecipe = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);

  const existing = await Recipe.findOne({
    merchant: merchantId,
    menuItem: req.body.menuItem,
    isActive: true,
  });
  if (existing) return next(new AppError('Recipe already exists for this menu item', 400));

  const recipe = await Recipe.create({ ...req.body, merchant: merchantId });
  res.status(201).json({ status: 'success', data: { recipe } });
});

exports.updateRecipe = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const recipe = await Recipe.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!recipe) return next(new AppError('Recipe not found', 404));
  res.status(200).json({ status: 'success', data: { recipe } });
});

exports.deleteRecipe = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const recipe = await Recipe.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { isActive: false },
    { new: true }
  );
  if (!recipe) return next(new AppError('Recipe not found', 404));
  res.status(204).json({ status: 'success', data: null });
});
