/**
 * @file menuController.js
 * @description Complete controller for Menu Item management
 *              Handles: Create, Read, Update, Delete (CRUD) + image upload/resize
 *              Supports: Multiple Menus, Combos, Variants, Scheduling
 *              Works with: menuModel.js + menuGroupModel.js (2025 version)
 */

const multer = require('multer');
const sharp = require('sharp');
const Menu = require('../models/menuModel');
const MenuGroup = require('../models/menuGroupModel');
const Merchant = require('../models/merchantModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/* ===================================================================
   1. MULTER CONFIG: Handle image upload (single 'image' field)
   =================================================================== */

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

exports.uploadMenuPhoto = upload.single('image');

/* ===================================================================
   2. IMAGE PROCESSING: Resize & save uploaded image
   =================================================================== */

exports.resizeMenuPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const merchantId = req.user.id; // merchant login
  const itemName = (req.body.name || 'item').replace(/\s+/g, '_').toLowerCase();
  const filename = `menu-${merchantId}-${itemName}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(800, 800, { fit: 'cover', position: 'center' })
    .toFormat('jpeg')
    .jpeg({ quality: 92 })
    .toFile(`public/img/menu/${filename}`);

  req.body.image = filename;
  next();
});

/* ===================================================================
   3. FILTER MIDDLEWARES: Category & Special helpers (your style)
   =================================================================== */

exports.getAllBeverage = (req, res, next) => {
  req.query.type = 'drink';
  next();
};

exports.getAppetizers = (req, res, next) => {
  req.query.category = 'Appetizers';
  next();
};

exports.getSpecials = (req, res, next) => {
  req.query.isSpecial = 'true';
  next();
};

exports.searchMenu = catchAsync(async (req, res, next) => {
  const { query } = req.query;
  if (!query?.trim()) return next();

  const searchRegex = new RegExp(query.trim(), 'i');
  req.query = {
    $or: [{ name: searchRegex }, { description: searchRegex }],
  };
  next();
});

exports.getFoodOnly = (req, res, next) => {
  req.query.type = 'food';
  next();
};

/* ===================================================================
   4. PUBLIC: Get active menu for customer (smart scheduling + combos!)
   =================================================================== */

/* =============================================================
   4. PUBLIC: Get active menu for customer (with ?type= support)
   Example URLs:
   /api/v1/menus/public/60d5ec49f1b2c8b3d4e9a123
   /api/v1/menus/public/60d5ec49f1b2c8b3d4e9a123?type=food
   /api/v1/menus/public/60d5ec49f1b2c8b3d4e9a123?type=drink
   /api/v1/menus/public/60d5ec49f1b2c8b3d4e9a123?type=alcohol
   ============================================================= */
exports.getPublicMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.params.id;
  const requestedType = req.query.type?.toLowerCase(); // food | drink | alcohol

  const merchant = await Merchant.findById(merchantId).select('name isActive');
  if (!merchant || !merchant.isActive) {
    return next(new AppError('Restaurant not found or closed.', 404));
  }

  const now = new Date();
  const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
  console.log("day Name "+dayName)
  const currentTime = now.toTimeString().slice(0, 5); // "14:30"
  console.log("currentTime"+currentTime)
  const today = now.toISOString().split('T')[0];
console.log("today "+today)
  // Step 1: Find all currently active MenuGroups
  const allGroups = await MenuGroup.find({ merchant: merchantId })
    .select('name description bannerImage priority visibility activeDays blockedDays timeSlots specialDates isAlcoholMenu')
    .sort({ priority: -1 });

  const activeGroups = [];
  const activeGroupIds = [];

  for (const group of allGroups) {
    let isActive = false;

    if (group.visibility === 'always') {
      isActive = true;
    } else if (group.visibility === 'scheduled') {
      const onActiveDay = !group.activeDays?.length || group.activeDays.includes(dayName);
      const notBlocked = !group.blockedDays?.includes(dayName);

      const inTimeSlot = !group.timeSlots?.length || group.timeSlots.some(slot =>
        slot.start <= currentTime && slot.end >= currentTime
      );

      const isSpecialDate = group.specialDates?.some(d => {
        const dStr = d.date.toISOString().split('T')[0];
        return dStr === today || (d.recurringYearly && d.date.getMonth() === now.getMonth() && d.date.getDate() === now.getDate());
      });

      isActive = (onActiveDay || isSpecialDate) && notBlocked && inTimeSlot;
    }

    if (isActive) {
      activeGroupIds.push(group._id);
      activeGroups.push({
        _id: group._id,
        name: group.name,
        description: group.description,
        bannerImage: group.bannerImage
          ? `${req.protocol}://${req.get('host')}/img/menu/${group.bannerImage}`
          : null,
        isAlcoholMenu: group.isAlcoholMenu,
      });
    }
  }

  // Step 2: Build query for Menu items
  let menuQuery = {
    merchant: merchantId,
    available: true,
    inStock: true,
    $or: [
      { menuGroup: { $in: activeGroupIds } },
      { visibility: 'always' },           // fallback items
      { isSpecial: true }                 // always show specials
    ]
  };

  // Apply type filter if requested
  if (requestedType === 'food') {
    menuQuery.type = 'food';
  } else if (requestedType === 'drink') {
    menuQuery.type = 'drink';
  } else if (requestedType === 'alcohol') {
    // Show only alcohol menu groups + alcohol items
    const alcoholGroups = activeGroups.filter(g => g.isAlcoholMenu);
    const alcoholGroupIds = alcoholGroups.map(g => g._id);
    menuQuery.$or = [
      { menuGroup: { $in: alcoholGroupIds } },
      { isAlcohol: true }
    ];
    // Override active groups to show only alcohol ones
    activeGroups = alcoholGroups;
  }

  // Step 3: Fetch items
  const items = await Menu.find(menuQuery)
    .select('name description image price variants type isVeg isSpicy calories prepTime')
    .sort({ isSpecial: -1, name: 1 });

  const baseUrl = `${req.protocol}://${req.get('host')}/img/menu/`;
  const formattedItems = items.map(item => ({
    ...item.toObject(),
    image: item.image ? baseUrl + item.image : null,
    finalPrice: item.variants?.[0]?.price || item.price,
  }));

  // Step 4: Send response
  res.status(200).json({
    status: 'success',
    restaurant: merchant.name,
    generatedAt: new Date(),
    // activeMenuGroups: activeGroups,
    filtersApplied: requestedType ? { type: requestedType } : null,
    data: {
      menuGroups: activeGroups,
      items: formattedItems,
      specialOffers: formattedItems.filter(i => i.isSpecial),
      totalItems: formattedItems.length,
    },
  });
});

/* ===================================================================
   5. PRIVATE: Merchant CRUD (your exact style)
   =================================================================== */

exports.getAllMenu = catchAsync(async (req, res, next) => {
  const filter = { merchant: req.user.merchant._id };

  const menuItems = await Menu.find(filter).sort('-createdAt');

  const menuWithImages = menuItems.map(item => ({
    ...item.toObject(),
    image: item.image ? `${req.protocol}://${req.get('host')}/img/menu/${item.image}` : null,
  }));

  res.status(200).json({
    status: 'success',
    results: menuWithImages.length,
    data: { menu: menuWithImages },
  });
});

exports.getMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const menuItem = await Menu.findOne({
    _id: req.params.id,
    merchant: merchantId,
  });

  if (!menuItem) return next(new AppError('Menu item not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { menu: menuItem },
  });
});

exports.createNewMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  // Extract body
  const { name, type, category, variants, isSpecial, comboOffer } = req.body;

  // Required fields
  const required = { name, type, category, variants };
  const missing = Object.keys(required).find(k => !required[k]);
  if (missing) {
    return next(
      new AppError(
        `Missing required field: ${missing} (name, type, category, menuGroup, variants)`,
        400
      )
    );
  }

  // Additional checks
  if (!variants.length) return next(new AppError('At least one variant is required.', 400));
  if (isSpecial && (!comboOffer?.comboPrice || !comboOffer?.description)) {
    return next(new AppError('Special items require combo price & description.', 400));
  }

  // Validate menuGroup belongs to this merchant
  /* const group = await MenuGroup.findOne({ _id: menuGroup, merchant: merchantId });
  if (!group) return next(new AppError('Invalid menu section.', 400)); */

  const newMenuItem = await Menu.create({ ...req.body, merchant: merchantId });

  res.status(201).json({ status: 'success', data: { menu: newMenuItem } });
});

exports.updateMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  // Validate menuGroup if being changed
  if (req.body.menuGroup) {
    const group = await MenuGroup.findOne({ _id: req.body.menuGroup, merchant: merchantId });
    if (!group) return next(new AppError('Invalid menu section.', 400));
  }
  // Optional: validate comboOffer only if isSpecial is true
  if (req.body.isSpecial && req.body.comboOffer) {
    if (!req.body.comboOffer.comboPrice || !req.body.comboOffer.description) {
      return next(new AppError('Special items require combo price & description.', 400));
    }
  }
  const updatedMenu = await Menu.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!updatedMenu) return next(new AppError('Menu item not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { menu: updatedMenu },
  });
});

exports.deleteMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const menuItem = await Menu.findOneAndDelete({
    _id: req.params.id,
    merchant: merchantId,
  });

  if (!menuItem) return next(new AppError('Menu item not found.', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// controllers/menuController.js
exports.getActiveMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.params.merchantId || req.user.merchant;
  const now = new Date();
  const currentDay = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().slice(0, 5); // "14:30"

  const menuGroups = await MenuGroup.find({
    merchant: merchantId,
    visibility: { $in: ['always', 'scheduled'] },
    $or: [
      { activeDays: currentDay },
      { activeDays: { $size: 0 } }
    ],
    $or: [
      { blockedDays: { $ne: currentDay } },
      { blockedDays: { $size: 0 } }
    ]
  })
  .sort({ priority: -1 })
  .populate({
    path: 'items.menu',
    match: { available: true, inStock: true },
    populate: { path: 'variants' }
  });

  // Filter out groups with no visible items + clean up
  const cleanedGroups = menuGroups
    .map(group => {
      const visibleItems = group.items.filter(i => 
        i.menuItem && !i.isHidden
      );
      if (visibleItems.length === 0) return null;

      return {
        _id: group._id,
        name: group.name,
        description: group.description,
        bannerImage: group.bannerImage,
        items: visibleItems.map(i => ({
          _id: i.menuItem._id,
          name: i.customName || i.menuItem.name,
          description: i.customDescription || i.menuItem.description,
          image: i.menuItem.image,
          price: i.overridePrice || i.menuItem.variants[0]?.price || i.menuItem.price,
          variants: i.menuItem.variants,
          isVeg: i.menuItem.isVeg,
          isSpicy: i.menuItem.isSpicy,
          prepTime: i.menuItem.prepTime,
        }))
      };
    })
    .filter(Boolean);

  // Also get active combos
  const combos = await Combo.find({ /* same logic as before */ })
    .sort({ priority: -1 })
    .populate('items.menuItem');

  res.status(200).json({
    status: 'success',
    data: {
      menu: cleanedGroups,
      combos,
      generatedAt: new Date()
    }
  });
});