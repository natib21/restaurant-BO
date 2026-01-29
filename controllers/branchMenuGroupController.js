// controllers/branchMenuGroupController.js
/**
 * BranchMenuGroup Controller – Multi-Branch Ready
 * Full CRUD + Reordering + Override Support
 * With Defense-in-Depth Security (merchant + branch verification)
 */

const BranchMenuGroup = require('../models/branchMenuGroupModel');
const MasterMenuItem = require('../models/menuModel');
const Branch = require('../models/branchModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ===================================================================
// 1. CREATE BRANCH MENU GROUP
// ===================================================================
exports.createBranchMenuGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id.toString();
  const branchId = req.user.branch._id.toString();

  const {
    name,
    description,
    bannerImage,
    visibility = 'always',
    priority = 0,
    timeSlots,
    activeDays,
    blockedDays,
    isAlcoholMenu = false,
    items = [], // [{ menuItemId, sortOrder, overridePrice, customName }]
  } = req.body;

  if (!name?.trim()) {
    return next(new AppError('Menu group name is required', 400));
  }

  // SECURITY: Validate all menu items belong to this merchant
  if (items.length > 0) {
    const itemIds = items.map(i => i.menuItemId).filter(Boolean);
    const validCount = await MasterMenuItem.countDocuments({
      _id: { $in: itemIds },
      merchant: merchantId,
    });

    if (validCount !== itemIds.length) {
      return next(new AppError('One or more menu items do not belong to your restaurant', 403));
    }
  }

  const menuGroup = await BranchMenuGroup.create({
    branch: branchId,
    merchant: merchantId,
    name: name.trim(),
    description,
    bannerImage,
    visibility,
    priority: Number(priority),
    timeSlots,
    activeDays,
    blockedDays,
    isAlcoholMenu,
    items: items.map(item => ({
      menuItem: item.menuItemId,
      sortOrder: item.sortOrder ?? Date.now(),
      overridePrice: item.overridePrice ?? null,
      customName: item.customName?.trim() || null,
      customDescription: item.customDescription?.trim() || null,
      isHidden: !!item.isHidden,
    })),
  });

  await menuGroup.populate({
    path: 'items.menuItem',
    select: 'name image price variants type isVeg isSpicy isAlcoholic prepTime',
  });

  res.status(201).json({
    status: 'success',
    data: { menuGroup },
  });
});

// ===================================================================
// 2. GET ALL MENU GROUPS FOR CURRENT BRANCH
// ===================================================================
exports.getAllBranchMenuGroups = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id.toString();
  const branchId = req.user.branch._id.toString();

  const groups = await BranchMenuGroup.find({
    branch: branchId,
    merchant: merchantId,
  })
    .sort({ priority: -1, createdAt: -1 })
    .select('-__v')
    .populate({
      path: 'items.menuItem',
      select: 'name image price variants type isVeg isSpicy isAlcoholic prepTime tags',
    });

  res.status(200).json({
    status: 'success',
    results: groups.length,
    data: { menuGroups: groups },
  });
});

// ===================================================================
// 3. GET SINGLE MENU GROUP
// ===================================================================
exports.getBranchMenuGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id.toString();
  const branchId = req.user.branch._id.toString();

  const group = await BranchMenuGroup.findOne({
    _id: req.params.id,
    branch: branchId,
    merchant: merchantId,
  }).populate({
    path: 'items.menuItem',
    select: 'name image price variants type isVeg isSpicy isAlcoholic prepTime',
  });

  if (!group) {
    return next(new AppError('Menu group not found or you do not have access', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});

// ===================================================================
// 4. UPDATE MENU GROUP
// ===================================================================
exports.updateBranchMenuGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id.toString();
  const branchId = req.user.branch._id.toString();

  const allowedUpdates = {
    name: req.body.name?.trim(),
    description: req.body.description,
    bannerImage: req.body.bannerImage,
    visibility: req.body.visibility,
    priority: Number(req.body.priority),
    timeSlots: req.body.timeSlots,
    activeDays: req.body.activeDays,
    blockedDays: req.body.blockedDays,
    isAlcoholMenu: req.body.isAlcoholMenu,
  };

  const group = await BranchMenuGroup.findOneAndUpdate(
    { _id: req.params.id, branch: branchId, merchant: merchantId },
    allowedUpdates,
    { new: true, runValidators: true }
  );

  if (!group) {
    return next(new AppError('Menu group not found or unauthorized', 404));
  }

  await group.populate('items.menuItem');

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});

// ===================================================================
// 5. DELETE MENU GROUP
// ===================================================================
exports.deleteBranchMenuGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id.toString();
  const branchId = req.user.branch._id.toString();

  const group = await BranchMenuGroup.findOneAndDelete({
    _id: req.params.id,
    branch: branchId,
    merchant: merchantId,
    isSystemDefault: false, // ← Prevent deleting "All Items"
  });

  if (!group) {
    return next(new AppError('Menu group not found, unauthorized, or is system default', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// ===================================================================
// 6. ADD ITEM TO GROUP
// ===================================================================
exports.addItemToGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id.toString();
  const branchId = req.user.branch._id.toString();
  const { menuItemId, overridePrice, customName } = req.body;

  if (!menuItemId) return next(new AppError('menuItemId is required', 400));

  // Verify item belongs to merchant
  const menuItem = await MasterMenuItem.findOne({
    _id: menuItemId,
    merchant: merchantId,
  });
  if (!menuItem) return next(new AppError('Menu item not found or unauthorized', 404));

  const group = await BranchMenuGroup.findOneAndUpdate(
    { _id: req.params.id, branch: branchId, merchant: merchantId },
    {
      $push: {
        items: {
          $each: [
            {
              menuItem: menuItemId,
              sortOrder: Date.now(),
              overridePrice: overridePrice ?? null,
              customName: customName?.trim() || null,
              isHidden: false,
            },
          ],
          $position: 0,
        },
      },
    },
    { new: true }
  ).populate('items.menuItem');

  if (!group) return next(new AppError('Menu group not found', 404));

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});

// ===================================================================
// 7. REMOVE ITEM FROM GROUP
// ===================================================================
exports.removeItemFromGroup = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id.toString();
  const branchId = req.user.branch._id.toString();
  const { menuItemId } = req.body;

  const group = await BranchMenuGroup.findOneAndUpdate(
    { _id: req.params.id, branch: branchId, merchant: merchantId },
    { $pull: { items: { menuItem: menuItemId } } },
    { new: true }
  ).populate('items.menuItem');

  if (!group) return next(new AppError('Menu group not found', 404));

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});

// ===================================================================
// 8. REORDER ITEMS (Drag & Drop)
// ===================================================================
exports.reorderBranchMenuGroupItems = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id.toString();
  const branchId = req.user.branch._id.toString();
  const { items } = req.body; // [{ menuItemId, sortOrder }]

  if (!Array.isArray(items) || items.length === 0) {
    return next(new AppError('Items array is required', 400));
  }

  const group = await BranchMenuGroup.findOne({
    _id: req.params.id,
    branch: branchId,
    merchant: merchantId,
  });

  if (!group) return next(new AppError('Menu group not found', 404));

  const orderMap = new Map(items.map(i => [i.menuItemId, i.sortOrder]));

  group.items.forEach(item => {
    const newOrder = orderMap.get(item.menuItem.toString());
    if (newOrder !== undefined) item.sortOrder = newOrder;
  });

  await group.save();
  await group.populate('items.menuItem');

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});
