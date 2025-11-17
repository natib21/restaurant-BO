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

exports.getPublicMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.params.id;

  const merchant = await Merchant.findById(merchantId);
  if (!merchant || !merchant.isActive) {
    return next(new AppError('Restaurant not found or currently closed.', 404));
  }

  const now = new Date();
  const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().slice(0, 5);
  const today = now.toISOString().split('T')[0];

  // Get all menu groups and determine which are active now
  const groups = await MenuGroup.find({ merchant: merchantId }).select(
    'name bannerImage priority visibility activeDays blockedDays timeSlots specialDates isAlcoholMenu'
  );

  const activeGroupIds = [];
  const activeGroups = [];

  for (const g of groups) {
    let show = false;

    if (g.visibility === 'always') show = true;
    else if (g.visibility === 'scheduled') {
      const onActiveDay = !g.activeDays?.length || g.activeDays.includes(dayName);
      const notBlocked = !g.blockedDays?.includes(dayName);
      const inTime =
        !g.timeSlots?.length ||
        g.timeSlots.some(t => t.start <= currentTime && t.end >= currentTime);
      const specialDateMatch = g.specialDates?.some(d => {
        const dateStr = d.date.toISOString().split('T')[0];
        return (
          dateStr === today ||
          (d.recurringYearly &&
            d.date.getMonth() === now.getMonth() &&
            d.date.getDate() === now.getDate())
        );
      });

      if (g.isAlcoholMenu && dayName === 'tuesday') show = false;
      else if ((onActiveDay || specialDateMatch) && notBlocked && inTime) show = true;
    }

    if (show) {
      activeGroupIds.push(g._id);
      activeGroups.push({
        _id: g._id,
        name: g.name,
        bannerImage: g.bannerImage
          ? `${req.protocol}://${req.get('host')}/img/menu/${g.bannerImage}`
          : null,
      });
    }
  }

  // Get items + always show special combos
  const items = await Menu.find({
    merchant: merchantId,
    $or: [
      { menuGroup: { $in: activeGroupIds }, available: true, inStock: true },
      { isSpecial: true, available: true },
    ],
  })
    .populate('menuGroup', 'name')
    .sort({ isSpecial: -1, name: 1 });

  const itemsWithImages = items.map(item => ({
    ...item.toObject(),
    image: item.image ? `${req.protocol}://${req.get('host')}/img/menu/${item.image}` : null,
  }));

  res.status(200).json({
    status: 'success',
    restaurant: merchant.name,
    results: itemsWithImages.length,
    data: {
      menuGroups: activeGroups,
      menu: itemsWithImages,
      specialOffers: itemsWithImages.filter(i => i.isSpecial),
    },
  });
});

/* ===================================================================
   5. PRIVATE: Merchant CRUD (your exact style)
   =================================================================== */

exports.getAllMenu = catchAsync(async (req, res, next) => {
  const filter = { merchant: req.user.merchant._id };

  const menuItems = await Menu.find(filter).populate('menuGroup', 'name').sort('-createdAt');

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
  }).populate('menuGroup', 'name');

  if (!menuItem) return next(new AppError('Menu item not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { menu: menuItem },
  });
});

exports.createNewMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  // Extract body
  const { name, type, category, menuGroup, variants, isSpecial, comboOffer } = req.body;

  // Required fields
  const required = { name, type, category, menuGroup, variants };
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
  const group = await MenuGroup.findOne({ _id: menuGroup, merchant: merchantId });
  if (!group) return next(new AppError('Invalid menu section.', 400));

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