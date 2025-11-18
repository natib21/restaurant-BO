/**
 * @file menuGroupController.js
 * @description Controller for managing Menu Groups (sections/tabs like Breakfast, Drinks)
 *              Handles: Create, Read, Update, Delete (CRUD)
 *              Supports: Merchant ownership checks via JWT
 */

// const MenuGroup = require('../models/menuGroupModel');
const MenuGroup = require('../models/menuGroupModel');
const Menu = require('../models/menuModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Create new menu group (Breakfast, Brunch, Ramadan, etc.)
exports.createMenuGroup = catchAsync(async (req, res, next) => {
  const merchnatId = req.user.merchant._id; // Merchant ID from JWT

  // TODO: Add subscription limit check here (Free = max 1)

  const menuGroup = await MenuGroup.create({
    ...req.body,
    merchant: merchnatId,
  });

  res.status(201).json({
    status: 'success',
    data: { menuGroup },
  });
});

// Get all menu groups for a merchant (admin panel)
exports.getAllMenuGroups = catchAsync(async (req, res, next) => {
  const menuGroups = await MenuGroup.find({ merchant: req.user.merchant._id }).sort({
    priority: -1,
    name: 1,
  });

  res.status(200).json({
    status: 'success',
    results: menuGroups.length,
    data: { menuGroups },
  });
});

// Update menu group (e.g., change time, hide/show)
exports.updateMenuGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const menuGroup = await MenuGroup.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );
  console.log('dfsaf ' + menuGroup);
  if (!menuGroup) return next(new AppError('Menu group not found', 404));

  res.status(200).json({
    status: 'success',
    data: { menuGroup },
  });
});

exports.deleteMenuGroup = catchAsync(async (req, res, next) => {
  const menuGroup = await MenuGroup.findOneAndDelete({
    _id: req.params.id,
    merchant: req.user.merchant,
  });

  if (!menuGroup) return next(new AppError('Menu group not found', 404));

  // Optional: delete all items in this group
  await Menu.deleteMany({ menuGroup: req.params.id });

  res.status(204).json({ status: 'success', data: null });
});
