// controllers/comboController.js
const Combo = require('../models/comboModel');
const Menu = require('../models/menuModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ========================= CREATE COMBO =========================
exports.createCombo = catchAsync(async (req, res, next) => {
  const { name, description, items, originalPrice, comboPrice, image, validFrom, validUntil, availableOnDays, timeSlots, maxPerOrder, priority, tags } = req.body;

  // Merchant comes from protect middleware (req.user.merchant or req.user._id)
  const merchant = req.user.merchant._id || req.user._id;

  // Validate and enrich items with fallback names
  console.log(items)
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const menuItem = await Menu.findById(item.menuItem).select('name image available inStock');;
      if (!menuItem) throw new AppError(`Menu item not found: ${item.menuItem}`, 404);
      if (!menuItem.available || !menuItem.inStock) throw new AppError(`Item "${menuItem.name}" is not available`, 400);

      return {
        menuItem: item.menuItem,
        nameFallback: menuItem.name,
        quantity: item.quantity || 1,
        
      };
    })
  );

  const combo = await Combo.create({
    merchant,
    name,
    description,
    items: enrichedItems,
    originalPrice,
    comboPrice,
    image,
    validFrom,
    validUntil,
    availableOnDays,
    timeSlots,
    maxPerOrder,
    priority: priority || 0,
    tags,
  });
await combo.populate('items.menuItem', 'name image variants');
  res.status(201).json({
    status: 'success',
    data: { combo },
  });
});

// ========================= GET ALL ACTIVE COMBOS (Customer View) =========================
exports.getActiveCombos = catchAsync(async (req, res, next) => {
  const merchantId = req.params.id || req.user.merchant || req.user._id;
  const now = new Date();
  const todayStr = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();

  const combos = await Combo.find({
    merchant: merchantId,
    isActive: true,
    $or: [
      { validFrom: { $lte: now } },
      { validFrom: null },
    ],
    $or: [
      { validUntil: { $gte: now } },
      { validUntil: null },
    ],
    $or: [
      { availableOnDays: todayStr },
      { availableOnDays: { $size: 0 } },
    ],
  })
    .sort({ priority: -1, createdAt: -1 })
    .populate('items.menu');

  res.status(200).json({
    status: 'success',
    results: combos.length,
    data: { combos },
  });
});

// ========================= GET ALL COMBOS (Admin Panel) =========================
exports.getAllCombos = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const combos = await Combo.find({ merchant: merchantId })
    .sort({ priority: -1, createdAt: -1 })
    .populate('items.menuItem');

  res.status(200).json({
    status: 'success',
    results: combos.length,
    data: { combos },
  });
});

// ========================= GET SINGLE COMBO =========================
exports.getCombo = catchAsync(async (req, res, next) => {

  const merchantId = req.user.merchant._id;

  const combo = await Combo.findOne({
    _id: req.params.id,
    merchant: merchantId,
  }).populate('items.menuItem');

  if (!combo) {
    return next(new AppError('Combo not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { combo },
  });
});

// ========================= UPDATE COMBO =========================
exports.updateCombo = catchAsync(async (req, res, next) => {
 const merchantId = req.user.merchant._id;

 const combo = await Combo.findOne({
    _id: req.params.id,
    merchant: merchantId,
  })

  if (!combo) return next(new AppError('Combo not found', 404));
 

  // If items are being updated, re-validate
 if (req.body.items) {
    const enrichedItems = await Promise.all(
      req.body.items.map(async (item) => {
        const menuItem = await Menu.findById(item.menuItem).select('name image available inStock');
        
        if (!menuItem) {
          throw new AppError(`Menu item not found: ${item.menuItem}`, 404);
        }
        if (!menuItem.available || !menuItem.inStock) {
          throw new AppError(`"${menuItem.name}" is currently unavailable or out of stock`, 400);
        }

        return {
          menuItem: item.menuItem,           // ← CORRECT field name
          nameFallback: menuItem.name,       // ← Correct reference
          quantity: item.quantity || 1,
        };
      })
    );

    req.body.items = enrichedItems; // ← Replace with validated + enriched items
  }

const updatedCombo = await Combo.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true,
    }
  ).populate('items.menuItem', 'name image variants price available inStock');

  res.status(200).json({
    status: 'success',
    data: { combo: updatedCombo },
  });
});

// ========================= DELETE COMBO =========================
exports.deleteCombo = catchAsync(async (req, res, next) => {
  const combo = await Combo.findById(req.params.id);
  if (!combo) return next(new AppError('Combo not found', 404));
  if (combo.merchant.toString() !== (req.user.merchant || req.user._id).toString()) {
    return next(new AppError('Not authorized', 403));
  }

  await Combo.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// ========================= INCREMENT SOLD COUNT (When Order Placed) =========================
exports.incrementComboSold = catchAsync(async (req, res, next) => {
  const { comboId } = req.body;

  await Combo.findByIdAndUpdate(comboId, { $inc: { totalSold: 1 } });

  res.status(200).json({
    status: 'success',
    message: 'Combo sold count updated',
  });
});