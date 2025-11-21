// controllers/menuGroupController.js
const MenuGroup = require('../models/menuGroupModel');
const Menu = require('../models/menuModel'); // Master dishes
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// =============================================================
// CREATE NEW MENU GROUP (e.g., Breakfast, Ramadan, Kids Menu)
// =============================================================
exports.createMenuGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
    console.log(merchantId)
  const { name, description, bannerImage, visibility, priority, timeSlots, activeDays, blockedDays, isAlcoholMenu ,items} = req.body;

  const menuGroup = await MenuGroup.create({
    merchant: merchantId,
    name,
    description,
    bannerImage,
    visibility: visibility || 'always',
    priority: priority || 0,
    timeSlots,
    activeDays,
    blockedDays,
    isAlcoholMenu: isAlcoholMenu || false,
    items, 
  });

  res.status(201).json({
    status: 'success',
    data: { menuGroup },
  });
});

// =============================================================
// GET ALL MENU GROUPS (Merchant Admin Panel)
// =============================================================
exports.getAllMenuGroups = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id ;

  const menuGroups = await MenuGroup.find({ merchant: merchantId })
    .sort({ priority: -1, createdAt: -1 })
    .select('-__v')
    .populate({
      path: 'items.menu',
      select: 'name image variants available inStock',
    });
  
  res.status(200).json({
    status: 'success',
    results: menuGroups.length,
    data: { menuGroups },
  });
});
// LIGHTWEIGHT VERSION – Only IDs + basic group info
exports.getAllMenuGroupsLight = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id || req.user._id;

  const menuGroups = await MenuGroup.find({ merchant: merchantId })
    .sort({ priority: -1, createdAt: -1 })
    .select('name description bannerImage visibility priority isAlcoholMenu isSystemDefault slug items.menu items.sortOrder items.isHidden items.overridePrice items.customName')
    .lean(); // ← Important: skip Mongoose docs for speed

  // Transform: only keep menu IDs, not full objects
  const lightGroups = menuGroups.map(group => ({
    ...group,
    items: group.items.map(item => ({
      menu: item.menu,           // ← Just the ObjectId (string)
      sortOrder: item.sortOrder,
      overridePrice: item.overridePrice,
      customName: item.customName,
      customDescription: item.customDescription,
      isHidden: item.isHidden,
      _id: item._id
    }))
  }));

  res.status(200).json({
    status: 'success',
    results: lightGroups.length,
    data: { menuGroups: lightGroups }
  });
});
// =============================================================
// GET SINGLE MENU GROUP (for editing in admin)
// =============================================================
exports.getMenuGroup = catchAsync(async (req, res, next) => {
  console.log(req.user)
  const merchantId = req.user.merchant.id;

  const menuGroup = await MenuGroup.findOne({
    _id: req.params.id,
    merchant: merchantId,
  }).populate({
    path: 'items.menu',
    select: 'name image type variants available inStock',
  }).lean();

  if (!menuGroup) return next(new AppError('Menu group not found', 404));

  res.status(200).json({
    status: 'success',
    data: { menuGroup },
  });
});

// =============================================================
// UPDATE MENU GROUP (name, scheduling, banner, etc.)
// =============================================================
exports.updateMenuGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id || req.user._id;

  const menuGroup = await MenuGroup.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!menuGroup) return next(new AppError('Menu group not found or unauthorized', 404));

  res.status(200).json({
    status: 'success',
    data: { menuGroup },
  });
});

// =============================================================
// DELETE MENU GROUP (safe – only removes playlist, not dishes)
// =============================================================
exports.deleteMenuGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id || req.user._id;

  const menuGroup = await MenuGroup.findOneAndDelete({
    _id: req.params.id,
    merchant: merchantId,
  });

  if (!menuGroup) return next(new AppError('Menu group not found or unauthorized', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// =============================================================
// ADD / REMOVE / REORDER ITEMS IN MENU GROUP
// =============================================================
exports.addItemToGroup = catchAsync(async (req, res, next) => {
  const { menuId } = req.body; // the master Menu item ID
  const merchantId = req.user.merchant._id || req.user._id;

  const menuItem = await Menu.findOne({ _id: menuId, merchant: merchantId });
  if (!menuItem) return next(new AppError('Dish not found', 404));

  const updated = await MenuGroup.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    {
      $push: {
        items: {
          menu: menuId,
          sortOrder: Date.now(), // temporary – can be reordered later
        },
      },
    },
    { new: true }
  );

  if (!updated) return next(new AppError('Menu group not found', 404));

  await updated.populate('items.menu');

  res.status(200).json({
    status: 'success',
    data: { menuGroup: updated },
  });
});

exports.removeItemFromGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id || req.user._id;
  const { menuId } = req.body;

  const updated = await MenuGroup.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { $pull: { items: { menu: menuId } } },
    { new: true }
  );

  if (!updated) return next(new AppError('Menu group or item not found', 404));

  await updated.populate('items.menu');

  res.status(200).json({
    status: 'success',
    data: { menuGroup: updated },
  });
});

// Reorder items (drag & drop support)
exports.reorderItems = catchAsync(async (req, res, next) => {
  const { items } = req.body; // array of { menuId, sortOrder }
  const merchantId = req.user.merchant._id || req.user._id;

  const menuGroup = await MenuGroup.findOne({ _id: req.params.id, merchant: merchantId });
  if (!menuGroup) return next(new AppError('Menu group not found', 404));

  // Update sortOrder for each item
  menuGroup.items.forEach((item) => {
    const newOrder = items.find((i) => i.menuId === item.menu.toString());
    if (newOrder) item.sortOrder = newOrder.sortOrder;
  });

  await menuGroup.save();

  await menuGroup.populate('items.menu');

  res.status(200).json({
    status: 'success',
    data: { menuGroup },
  });
});