// controllers/comboController.js
const Combo = require('../models/comboModel');
const Menu = require('../models/menuModel');
const Branch = require('../models/branchModel'); // ← Add this
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ========================= CREATE COMBO =========================
exports.createCombo = catchAsync(async (req, res, next) => {
  const {
    name,
    description,
    items,
    comboPrice,
    image,
    bannerImage,
    validFrom,
    validUntil,
    availableOnDays,
    timeSlots,
    maxPerOrder,
    priority,
    tags,
    branches: branchesFromBody
  } = req.body;

  const merchantId = req.user.merchant._id;
  const userRole = req.user.role.name;
  const userBranch = req.user.branch; // may be null for super admin

  let finalBranches = [];

  // —————————————————————— BRANCH LOGIC ——————————————————————
  if (userRole === 'SUPER-MERCHANT-ADMIN') {
    // Super admin MUST explicitly send branches
    if (!branchesFromBody || !Array.isArray(branchesFromBody) || branchesFromBody.length === 0) {
      return next(new AppError('As super admin, you must specify at least one branch', 400));
    }
    finalBranches = branchesFromBody.map(id => id.toString());
  } else {
    // Regular staff → ONLY their branch allowed
    if (!userBranch) {
      return next(new AppError('Your account is not assigned to any branch', 403));
    }
    finalBranches = [userBranch._id.toString()];

    // Security: Block staff from trying to set branches
    if (branchesFromBody !== undefined) {
      console.warn(`User ${req.user._id} (non-admin) tried to set branches. Blocked.`);
    }
  }

  // —————————————————————— VALIDATE BRANCHES ——————————————————————
  const validBranches = await Branch.find({
    _id: { $in: finalBranches },
    merchant: merchantId
  });

  if (validBranches.length !== finalBranches.length) {
    return next(new AppError('One or more branches are invalid or do not belong to your business', 400));
  }

  // —————————————————————— ENRICH ITEMS ——————————————————————
  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError('Combo must include at least one item', 400));
  }

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const menuItem = await Menu.findById(item.menuItem)
        .select('name image available inStock defaultVariant variants');

      if (!menuItem) throw new AppError(`Menu item not found: ${item.menuItem}`, 404);
      if (!menuItem.available || !menuItem.inStock)
        throw new AppError(`"${menuItem.name}" is unavailable or out of stock`, 400);

      return {
        menuItem: item.menuItem,
        nameFallback: menuItem.name,
        quantity: item.quantity || 1,
      };
    })
  );

  // —————————————————————— CREATE COMBO ——————————————————————
  const combo = await Combo.create({
    merchant: merchantId,
    name: name.trim(),
    description,
    items: enrichedItems,
    comboPrice,
    image,
    bannerImage,
    validFrom,
    validUntil,
    availableOnDays,
    timeSlots,
    maxPerOrder: maxPerOrder || 10,
    priority: priority || 0,
    tags,
    branches: finalBranches,
  });

  await combo.populate({
    path: 'items.menuItem',
    select: 'name image defaultVariant variants price'
  });

  res.status(201).json({
    status: 'success',
    data: { combo }
  });
});

// ========================= GET ACTIVE COMBOS (Customer View) =========================
exports.getActiveCombos = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const branchId = req.user.branch?._id || req.headers['x-branch-id'];
  if (!branchId) return next(new AppError('Branch not specified', 400));

  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // "14:30"
  const todayStr = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();

  const query = {
    merchant: merchantId,
    isActive: true,
    branches: branchId, // ← Critical: only combos for this branch
    $or: [{ validFrom: { $lte: now } }, { validFrom: null }],
    $or: [{ validUntil: { $gte: now } }, { validUntil: null }],
    $or: [
      { availableOnDays: { $size: 0 } },
      { availableOnDays: null },
      { availableOnDays: todayStr }
    ],
  };

  // Time slot filter
  query.$or.push(
    { timeSlots: { $size: 0 } },
    { timeSlots: null },
    {
      timeSlots: {
        $elemMatch: {
          start: { $lte: currentTime },
          end: { $gte: currentTime }
        }
      }
    }
  );

  const combos = await Combo.find(query)
    .sort({ priority: -1, createdAt: -1 })
    .populate({
      path: 'items.menuItem',
      select: 'name image defaultVariant variants price available inStock'
    });

  res.status(200).json({
    status: 'success',
    results: combos.length,
    data: { combos }
  });
});

// ========================= GET ALL COMBOS (Admin Panel) =========================
exports.getAllCombos = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const combos = await Combo.find({ merchant: merchantId })
    .sort({ priority: -1, createdAt: -1 })
    .populate({
      path: 'items.menuItem',
      select: 'name image defaultVariant variants'
    })
    .populate('branches', 'name'); // Optional: show branch names

  res.status(200).json({
    status: 'success',
    results: combos.length,
    data: { combos }
  });
});

// ========================= GET SINGLE COMBO =========================
exports.getCombo = catchAsync(async (req, res, next) => {
  const combo = await Combo.findById(req.params.id)
    .populate({
      path: 'items.menuItem',
      select: 'name image defaultVariant variants price'
    })
    .populate('branches', 'name');

  if (!combo || combo.merchant.toString() !== req.user.merchant._id.toString()) {
    return next(new AppError('Combo not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { combo }
  });
});

// ========================= UPDATE COMBO =========================
exports.updateCombo = catchAsync(async (req, res, next) => {
  const combo = await Combo.findOne({
    _id: req.params.id,
    merchant: req.user.merchant._id
  });

  if (!combo) return next(new AppError('Combo not found', 404));

  const userRole = req.user.role.name;

  // Only super admin can change branches
  if (req.body.branches !== undefined) {
    if (userRole !== 'SUPER-MERCHANT-ADMIN') {
      return next(new AppError('You are not allowed to change combo branches', 403));
    }
    if (!Array.isArray(req.body.branches) || req.body.branches.length === 0) {
      return next(new AppError('At least one branch must be selected', 400));
    }

    const valid = await Branch.find({
      _id: { $in: req.body.branches },
      merchant: req.user.merchant._id
    });

    if (valid.length !== req.body.branches.length) {
      return next(new AppError('Invalid branch selected', 400));
    }
  }

  // Re-validate items if sent
  if (req.body.items) {
    const enriched = await Promise.all(
      req.body.items.map(async (item) => {
        const menuItem = await Menu.findById(item.menuItem);
        if (!menuItem) throw new AppError('Menu item not found', 404);
        if (!menuItem.available || !menuItem.inStock)
          throw new AppError(`"${menuItem.name}" is out of stock`, 400);

        return {
          menuItem: item.menuItem,
          nameFallback: menuItem.name,
          quantity: item.quantity || 1
        };
      })
    );
    req.body.items = enriched;
  }

  const updatedCombo = await Combo.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate([
    { path: 'items.menuItem', select: 'name image defaultVariant variants price' },
    { path: 'branches', select: 'name' }
  ]);

  res.status(200).json({
    status: 'success',
    data: { combo: updatedCombo }
  });
});

// ========================= DELETE & INCREMENT (Minor Fixes) =========================
exports.deleteCombo = catchAsync(async (req, res, next) => {
  const combo = await Combo.findOneAndDelete({
    _id: req.params.id,
    merchant: req.user.merchant._id
  });

  if (!combo) return next(new AppError('Combo not found or not authorized', 404));

  res.status(204).json({ status: 'success', data: null });
});

exports.incrementComboSold = catchAsync(async (req, res, next) => {
  const { comboId, quantity = 1 } = req.body;

  const result = await Combo.findByIdAndUpdate(
    comboId,
    { $inc: { totalSold: quantity } },
    { new: true }
  );

  if (!result) return next(new AppError('Combo not found', 404));

  res.status(200).json({ status: 'success' });
});