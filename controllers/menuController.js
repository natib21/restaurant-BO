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
const Table = require('../models/tabelModel');
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

  console.log('req.file →', req.file);        // ← THIS LINE
  console.log('req.body →', req.body);        // ← AND THIS LINE

  if (!req.file) {
    console.log('No file uploaded → skipping resize');
    return next(); // continue without image
  }

  const merchantId = req.user.merchant._id; // merchant login
  const itemName = (req.body.name || 'item').replace(/\s+/g, '_').toLowerCase();
  const filename = `menu-${merchantId}-${itemName}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(800, 800, { fit: 'cover', position: 'center' })
    .toFormat('jpeg')
    .jpeg({ quality: 92 })
    .toFile(`uploads/img/menu/${filename}`);

  req.body.image = filename;
  console.log("image - ", req.body.image)
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

exports.getPublicMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.merchantId;
  const tableId = req.tableId;
  if (!merchantId) {
    return next(new AppError('Merchant ID is required', 400));
  }

  let tableNumber = null;

  if (tableId) {
    const table = await Table.findOne({
      _id: tableId,
      merchant: merchantId,
      isActive: true,
    }).select('tableNumber');

    if (!table) {
      return next(new AppError('Invalid or inactive table', 400));
    }
    tableNumber = table.tableNumber;
  }

  const requestedType = req.query.type?.toLowerCase();

  const merchant = await Merchant.findById(merchantId).select('businessName isActive');
  if (!merchant || !merchant.isActive) {
    return next(new AppError('Restaurant not found or closed.', 404));
  }

  const now = new Date();
  const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
  const currentTimeStr = now.toTimeString().slice(0, 5);
  const today = now.toISOString().split('T')[0];

  const timeToMinutes = time => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  const currentMinutes = timeToMinutes(currentTimeStr);

  // Step 1: Get ALL groups with priority
  const allGroups = await MenuGroup.find({ merchant: merchant._id })
    .select(
      'priority visibility activeDays blockedDays timeSlots specialDates isAlcoholMenu items name'
    )
    .sort({ priority: -1 }); // HIGHEST PRIORITY FIRST ← crucial

  const activeGroupIds = new Set();

  for (const group of allGroups) {
    if (group.visibility === 'hidden') continue;

    let isActive = group.visibility === 'always';

    if (!isActive && group.visibility === 'scheduled') {
      const onActiveDay =
        !group.activeDays?.length || group.activeDays.map(d => d.toLowerCase()).includes(dayName);

      const notBlocked =
        !group.blockedDays?.length ||
        !group.blockedDays.map(d => d.toLowerCase()).includes(dayName);

      const inTimeSlot =
        !group.timeSlots?.length ||
        group.timeSlots.some(slot => {
          const startMin = timeToMinutes(slot.start);
          const endMin = timeToMinutes(slot.end);
          if (endMin < startMin) {
            return currentMinutes >= startMin || currentMinutes <= endMin;
          }
          return currentMinutes >= startMin && currentMinutes <= endMin;
        });

      const isSpecialDate = group.specialDates?.some(d => {
        const dateStr = d.date.toISOString().split('T')[0];
        if (d.recurringYearly) {
          const monthDay = `${d.date.getMonth() + 1}-${d.date.getDate()}`;
          const todayMD = `${now.getMonth() + 1}-${now.getDate()}`;
          return monthDay === todayMD;
        }
        return dateStr === today;
      });

      isActive = (onActiveDay || isSpecialDate) && notBlocked && inTimeSlot;
    }

    if (isActive) {
      activeGroupIds.add(group._id.toString());
    }
  }

  // Step 2: Fetch active groups with populated items (sorted by priority already)
  const activeGroups = await MenuGroup.find({
    _id: { $in: Array.from(activeGroupIds) },
    merchant: merchantId,
  })
    .sort({ priority: -1 }) // ← again, highest first
    .populate({
      path: 'items.menu',
      match: { available: true, inStock: true },
      select:
        'name description image variants price type isVeg isSpicy isAlcoholic prepTime tags ingredients allergens ratingAverage',
    });

  const baseUrl = `${req.protocol}://${req.get('host')}/img/menu/`;

  // Key: Track which menu items we've already added (by _id)
  const seenItemIds = new Set();
  const finalItems = [];

  // Loop through groups in priority order
  for (const group of activeGroups) {
    for (const item of group.items) {
      if (!item.menu || item.isHidden) continue;
      if (seenItemIds.has(item.menu._id.toString())) continue; // Skip if already added from higher group

      seenItemIds.add(item.menu._id.toString());

      const menu = item.menu;
      const defaultPrice = item.overridePrice || menu.variants?.[0]?.price || menu.price || 0;

      const menuItem = {
        _id: menu._id,
        name: item.customName || menu.name,
        description: item.customDescription || menu.description || '',
        image: menu.image ? `${baseUrl}${menu.image}` : null,
        price: defaultPrice,
        variants: menu.variants || [],
        type: menu.type,
        isVeg: menu.isVeg,
        isSpicy: menu.isSpicy,
        isAlcoholic: !!menu.isAlcoholic || group.isAlcoholMenu,
        prepTime: menu.prepTime || '15-25 min',
        tags: menu.tags || [],
        ingredients: menu.ingredients || [],
        allergens: menu.allergens || [],
        rating: menu.ratingAverage || 4.5,
        displayedIn: group.name, // optional: show where it came from
      };

      finalItems.push(menuItem);
    }
  }

  // Apply type filter (food/drink/alcohol)
  let filteredItems = finalItems;
  if (requestedType === 'food') {
    filteredItems = finalItems.filter(i => i.type === 'food');
  } else if (requestedType === 'drink') {
    filteredItems = finalItems.filter(i => i.type === 'drink' && !i.isAlcoholic);
  } else if (requestedType === 'alcohol') {
    filteredItems = finalItems.filter(i => i.isAlcoholic);
  }

  const specialOffers = filteredItems
    .filter(i =>
      i.tags.some(t => ['chef-special', 'trending', 'bestseller', 'limited'].includes(t))
    )
    .slice(0, 10);

  res.status(200).json({
    status: 'success',
    restaurant: merchant.businessName,
    generatedAt: new Date().toISOString(),
    totalItems: filteredItems.length,
    data: {
      menus: filteredItems.map(i => ({
        id: i._id,
        name: i.name,
        description: i.description,
        image: i.image,
        price: i.price,
        variants: i.variants,
        isVeg: i.isVeg,
        isSpicy: i.isSpicy,
        isAlcoholic: i.isAlcoholic,
        prepTime: i.prepTime,
        ingredients: i.ingredients,
        allergens: i.allergens,
        rating: i.rating,
        displayedIn: i.displayedIn,
      })),
      specialOffers: specialOffers.map(i => ({
        id: i._id,
        name: i.name,
        image: i.image,
        price: i.price,
        tag: i.tags.find(t => ['chef-special', 'trending', 'bestseller', 'limited'].includes(t)),
      })),
    },
  });
});
/* ===================================================================
   5. PRIVATE: Merchant CRUD (your exact style)
   =================================================================== */

exports.getAllMenu = catchAsync(async (req, res, next) => {
  const filter = { merchant: req.user.merchant._id };

  const menuItems = await Menu.find(filter).sort('-createdAt');
if (!menuItems) return next(new AppError('Menu item not found.', 404));
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
   const menuWithImages = {
    ...menuItem.toObject(),
     image: menuItem.image ? `${req.protocol}://${req.get('host')}/img/menu/${menuItem.image}` : null,
   }
  res.status(200).json({
    status: 'success',
    data: { menu: menuWithImages },
  });
});

exports.createNewMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  console.log(req.body)
  // ─────── SUPER SAFE variants parsing (this fixes your error forever) ───────
  let variants = undefined;

  if (req.body.variants != null && req.body.variants !== '') {
    try {
      // Handle both string (form-data) and real array (raw JSON)
      const parsed = typeof req.body.variants === 'string' 
        ? JSON.parse(req.body.variants) 
        : req.body.variants;

      if (!Array.isArray(parsed)) {
        return next(new AppError('"variants" must be a JSON array', 400));
      }
      variants = parsed;
    } catch (err) {
      return next(new AppError('Invalid JSON in "variants" field – check quotes and brackets', 400));
    }
  }

  // ─────── Required fields ───────
  if (!req.body.name?.trim()) return next(new AppError('Name is required', 400));
  if (!['food', 'drink'].includes(req.body.type)) return next(new AppError('Type must be food or drink', 400));
  if (!req.body.category?.trim()) return next(new AppError('Category is required', 400));

  // ─────── Pricing: at least one of variants or price ───────
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  const hasPrice = req.body.price !== undefined && req.body.price !== '' && req.body.price !== null;

  if (!hasVariants && !hasPrice) {
    return next(new AppError('Either "variants" array or "price" is required', 400));
  }

  // ─────── Create menu item ───────
  const newMenuItem = await Menu.create({
    ...req.body,
    merchant: merchantId,
    name: req.body.name.trim(),
    category: req.body.category.trim(),

    // Clean pricing
    variants: hasVariants ? variants : undefined,
    price: hasVariants ? undefined : Number(req.body.price),

    // Boolean fixes
    isVeg: req.body.isVeg === 'true' ? true : req.body.isVeg === 'false' ? false : null,
    isSpicy: req.body.isSpicy === 'true',
    isAlcoholic: req.body.isAlcoholic === 'true',
    available: req.body.available !== 'false',
    inStock: req.body.inStock !== 'false',

    image: req.body.image, // from sharp middleware
  });

  // Auto-add to default group
  await MenuGroup.findOneAndUpdate(
    { merchant: merchantId, isSystemDefault: true },
    { $push: { items: { menu: newMenuItem._id, sortOrder: Date.now() } } },
    { upsert: true }
  );

  res.status(201).json({
    status: 'success',
    data: { menu: newMenuItem },
  });
});

exports.updateMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

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
  // 2. CRITICAL CLEANUP: Remove the item's reference from ALL MenuGroups
  await MenuGroup.updateMany(
    { merchant: merchantId },
    { $pull: { items: { menu: req.params.id } } }
  );
  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// controllers/menuController.js
exports.getActiveMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.params.merchantId || req.user.merchant._id;
  const now = new Date();
  const currentDay = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().slice(0, 5); // "14:30"

  const menuGroups = await MenuGroup.find({
    merchant: merchantId,
    visibility: { $in: ['always', 'scheduled'] },
    $or: [{ activeDays: currentDay }, { activeDays: { $size: 0 } }],
    $or: [{ blockedDays: { $ne: currentDay } }, { blockedDays: { $size: 0 } }],
  })
    .sort({ priority: -1 })
    .populate({
      path: 'items.menu',
      match: { available: true, inStock: true },
      populate: { path: 'variants' },
    });

  // Filter out groups with no visible items + clean up
  const cleanedGroups = menuGroups
    .map(group => {
      const visibleItems = group.items.filter(i => i.menuItem && !i.isHidden);
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
        })),
      };
    })
    .filter(Boolean);

  // Also get active combos
  const combos = await Combo.find({
    /* same logic as before */
  })
    .sort({ priority: -1 })
    .populate('items.menuItem');

  res.status(200).json({
    status: 'success',
    data: {
      menu: cleanedGroups,
      combos,
      generatedAt: new Date(),
    },
  });
});
