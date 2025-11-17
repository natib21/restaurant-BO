/**
 * @file menuController.js
 * @description Complete controller for Menu Item management
 *              Handles: Create, Read, Update, Delete (CRUD) + image upload/resize
 *              Supports both merchant staff (own restaurant) and super-admin (all)
 */

const multer = require('multer');
const sharp = require('sharp');
const Menu = require('../models/menuModel');
const Merchant = require('../models/merchantModel');
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/* ===================================================================
   1. MULTER CONFIG: Handle image upload (single 'image' field)
   =================================================================== */

// Store file in memory → allows us to process with Sharp before saving
const multerStorage = multer.memoryStorage();

/**
 * File filter: Only allow image files
 */
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// Multer instance: accept single file with field name 'image'
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

exports.uploadMenuPhoto = upload.single('image');

/* ===================================================================
   2. IMAGE PROCESSING: Resize & save uploaded image
   =================================================================== */

/**
 * Middleware: Resize uploaded menu image to 500x500 JPEG and save to disk
 * Runs after multer, before create/update
 */
exports.resizeMenuPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // No image → skip

  // Ensure user is linked to a merchant (merchant staff only)
  const merchantId = req.user.merchant?._id?.toString();
  if (!merchantId) {
    return next(new AppError('You are not associated with any restaurant.', 403));
  }

  // Generate clean, unique filename
  const itemName = (req.body.name || 'item').replace(/\s+/g, '_');
  const filename = `menu-${merchantId}-${itemName}-${Date.now()}.jpeg`;
  req.file.filename = filename;

  // Resize + convert + save
  await sharp(req.file.buffer)
    .resize(500, 500, { fit: 'cover', position: 'center' })
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`uploads/img/menu/${filename}`);

  next();
});

/* ===================================================================
   3. FILTER MIDDLEWARES: Category & Search helpers
   =================================================================== */

/**
 * Filter: Get only Beverage items
 */
exports.getAllBeverage = (req, res, next) => {
  req.query.category = 'Beverage';
  next();
};

/**
 * Filter: Get only Appetizers
 */
exports.getAppetizers = (req, res, next) => {
  req.query.category = 'Appetizers';
  next();
};

/**
 * Filter: Get only Special items
 */
exports.getSpecials = (req, res, next) => {
  req.query.isSpecial = 'true';
  next();
};

/**
 * Search: By name or description (case-insensitive)
 */
exports.searchMenu = catchAsync(async (req, res, next) => {
  const { query } = req.query;
  if (!query?.trim()) return next();

  const searchRegex = new RegExp(query.trim(), 'i');
  req.query = {
    $or: [{ name: searchRegex }, { description: searchRegex }],
  };
  next();
});

/* ===================================================================
   4. PUBLIC: Get menu for a specific merchant (customer-facing)
   =================================================================== */

/**
 * GET /api/v1/menus/public/:id
 * Public endpoint → customers can view any merchant's menu
 */
exports.getPublicMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.params.id;

  // 1. Verify merchant exists
  const merchant = await Merchant.findById(merchantId).select('status isActive');
  if (!merchant) {
    return next(new AppError('No merchant found with that ID.', 404));
  }

  // 2. Optional: Block if merchant is not approved/active
  // Uncomment when approval workflow is enforced

  /* if (merchant.status !== 'approved' || !merchant.isActive) {
    return next(new AppError('This restaurant is currently unavailable.', 403));
  } */

  // 3. Fetch all active menu items for this merchant
  const menuItems = await Menu.find({
    restaurant: merchantId,
    isDeleted: { $ne: true }, // Hide soft-deleted items
    isActive: true, // Only show active items
  }).select('-__v -restaurant -isDeleted');

  // 4. Add full image URLs
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

/* ===================================================================
   5. PRIVATE: Merchant staff & super-admin menu access
   =================================================================== */

/**
 * GET /api/v1/menus
 * Get all menu items (filtered by merchant unless super-admin)
 */
exports.getAllMenu = catchAsync(async (req, res, next) => {
  const filter = {};

  // Super-admin sees everything
  if (req.user?.role?.name !== 'SUPER-ADMIN') {
    if (!req.user?.merchant) {
      return next(new AppError('You are not assigned to a restaurant.', 403));
    }
    filter.restaurant = req.user.merchant._id;
  }

  // Optional: hide soft-deleted items by default
  filter.isDeleted = { $ne: true };

  const features = new ApiFeatures(Menu.find(filter), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const menuItems = await features.query;

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

/**
 * GET /api/v1/menus/:id
 * Get single menu item (with ownership check)
 */
exports.getMenu = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };

  if (req.user?.role?.name !== 'SUPER-ADMIN') {
    if (!req.user?.merchant) {
      return next(new AppError('You are not assigned to a restaurant.', 403));
    }
    filter.restaurant = req.user.merchant._id;
  }

  const menuItem = await Menu.findOne(filter);

  if (!menuItem) {
    return next(new AppError('Menu item not found or access denied.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { menu: menuItem },
  });
});

/**
 * POST /api/v1/menus
 * Create new menu item
 */
exports.createNewMenu = catchAsync(async (req, res, next) => {
  if (!req.user?.merchant) {
    return next(new AppError('You are not assigned to a restaurant.', 403));
  }

  const newMenuData = {
    ...req.body,
    restaurant: req.user.merchant._id,
    image: req.file ? req.file.filename : undefined,
  };

  const newMenuItem = await Menu.create(newMenuData);

  res.status(201).json({
    status: 'success',
    data: { menu: newMenuItem },
  });
});

/**
 * PATCH /api/v1/menus/:id
 * Update menu item (image + other fields)
 */
exports.updateMenu = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };

  if (req.user?.role?.name !== 'SUPER-ADMIN') {
    if (!req.user?.merchant) {
      return next(new AppError('You are not assigned to a restaurant.', 403));
    }
    filter.restaurant = req.user.merchant._id;
  }

  if (req.file) {
    req.body.image = req.file.filename;
  }

  const updatedMenu = await Menu.findOneAndUpdate(filter, req.body, {
    new: true,
    runValidators: true,
  });

  if (!updatedMenu) {
    return next(new AppError('Menu item not found or access denied.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { menu: updatedMenu },
  });
});

/**
 * DELETE /api/v1/menus/:id
 * Soft delete → set isDeleted = true
 */
exports.deleteMenu = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };

  if (req.user?.role?.name !== 'SUPER-ADMIN') {
    if (!req.user?.merchant) {
      return next(new AppError('You are not assigned to a restaurant.', 403));
    }
    filter.restaurant = req.user.merchant._id;
  }

  const menuItem = await Menu.findOneAndUpdate(
    filter,
    { isDeleted: true, isActive: false },
    { new: true }
  );

  if (!menuItem) {
    return next(new AppError('Menu item not found or access denied.', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
