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

/* 

// controllers/menuController.js
const { uploadImage } = require('../utils/multer');
const { processImage } = require('../utils/imageProcessor');
const { buildImageName } = require('../utils/imagePaths');
const catchAsync = require('../utils/catchAsync');

exports.uploadMenuPhoto = uploadImage.single('image');

exports.resizeMenuPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const filename = buildImageName({
    prefix: 'menu',
    ownerId: req.user.id,
    name: req.body.name,
  });

  await processImage({
    buffer: req.file.buffer,
    folder: 'menu',
    filename,
  });

  req.body.image = filename;
  next();
});

*/

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
    image: item.image ? `${req.protocol}s://${req.get('host')}/img/menu/${item.image}` : null,
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

  if (!menuItem) {
    return next(new AppError('Menu item not found.', 404));
  }

  const menuWithImage = {
    ...menuItem.toObject(),
    image: menuItem.image
      ? `${req.protocol}://${req.get('host')}/img/menu/${menuItem.image}`
      : null,
  };

  res.status(200).json({
    status: 'success',
    data: {
      menu: menuWithImage,
    },
  });
});
const parseJSON = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (err) {
    return fallback;
  }
};

exports.createNewMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  // ==================== PARSE JSON FIELDS ====================
  const variants = parseJSON(req.body.variants, []);
  const ingredients = parseJSON(req.body.ingredients, []);
  const allergens = parseJSON(req.body.allergens, []);
  const tags = parseJSON(req.body.tags, []);

  const {
    name,
    type,
    category,
    description,
    prepTime,
    drinkType,
    isAlcoholic,
    alcoholPercentage,
    isVeg,
    isSpicy,
    available,
    price,
    image,
  } = req.body;

  // ==================== 1. REQUIRED FIELDS ====================
  if (!name || !type || !category) {
    return next(new AppError('name, type and category are required', 400));
  }

  // ==================== 2. HANDLE VARIANTS ====================
  let finalVariants = [];

  if (variants.length > 0) {
    finalVariants = variants.map((v, index) => {
      if (v.price == null || v.price < 0) {
        throw new AppError(`Variant ${index + 1} must have a valid price`, 400);
      }

      return {
        name: v.name?.trim() || 'Regular',
        size: v.size || undefined,
        volume: v.volume || undefined,
        price: Number(v.price),
        calories: v.calories,
        available: v.available !== false,
        isDefault: Boolean(v.isDefault),
      };
    });

    // Ensure one default variant
    if (!finalVariants.some(v => v.isDefault)) {
      finalVariants[0].isDefault = true;
    }
  }

  // ==================== 3. FALLBACK DEFAULT VARIANT ====================
  if (finalVariants.length === 0) {
    finalVariants.push({
      name: 'Regular',
      price: Number(price) || 0,
      isDefault: true,
    });
  }

  // ==================== 4. CREATE MENU ITEM ====================
  const menu = await Menu.create({
    merchant: merchantId,
    name: name.trim(),
    type,
    category: category.trim(),
    description,
    prepTime,
    drinkType: drinkType || null,
    isAlcoholic: isAlcoholic === 'true',
    alcoholPercentage: Number(alcoholPercentage) || 0,
    isVeg: isVeg === 'true' ? true : isVeg === 'false' ? false : null,
    isSpicy: isSpicy === 'true',
    available: available !== 'false',
    price,
    variants: finalVariants,
    ingredients,
    allergens,
    tags,
    image,
  });

  // ==================== 5. ADD TO DEFAULT MENU GROUP ====================
  await MenuGroup.findOneAndUpdate(
    { merchant: merchantId, isSystemDefault: true },
    {
      $push: {
        items: {
          menu: menu._id,
          sortOrder: Date.now(),
        },
      },
    }
  );

  // ==================== 6. RESPONSE ====================
  res.status(201).json({
    status: 'success',
    data: { menu },
  });
});

exports.updateMenu = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  console.log(req.user);
  // 1. Convert JSON strings back to Objects/Arrays
  const jsonFields = ['variants', 'ingredients', 'allergens', 'tags'];
  jsonFields.forEach(field => {
    if (typeof req.body[field] === 'string') {
      req.body[field] = parseJSON(req.body[field], []);
    }
  });

  // 2. Convert Boolean strings (from FormData) to actual Booleans
  if (req.body.available) req.body.available = req.body.available === 'true';
  if (req.body.isSpicy) req.body.isSpicy = req.body.isSpicy === 'true';
  if (req.body.isAlcoholic) req.body.isAlcoholic = req.body.isAlcoholic === 'true';

  if (req.body.isVeg !== undefined) {
    req.body.isVeg = req.body.isVeg === 'true' ? true : req.body.isVeg === 'false' ? false : null;
  }

  // 3. Update the document
  // Note: if a new image was uploaded, req.body.image was already set by resizeMenuPhoto
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

/* ===================================================================
   6. TOGGLE AVAILABILITY (PATCH /api/menu/:id/toggle-availability)
   =================================================================== */

exports.toggleMenuItemAvailability = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const itemId = req.params.id;

  // Find the menu item
  const menuItem = await Menu.findOne({
    _id: itemId,
    merchant: merchantId,
  });

  if (!menuItem) {
    return next(new AppError('Menu item not found or access denied.', 404));
  }

  // Toggle the `available` field
  const newAvailability = !menuItem.available;
  menuItem.available = newAvailability;

  // Optional: Also toggle all variants' availability for consistency
  if (menuItem.variants && menuItem.variants.length > 0) {
    menuItem.variants = menuItem.variants.map(variant => ({
      ...variant,
      available: newAvailability,
    }));
  }

  await menuItem.save({ validateModifiedOnly: true });

  res.status(200).json({
    status: 'success',
    message: `Menu item is now ${newAvailability ? 'available' : 'unavailable'}`,
    data: {
      menu: {
        id: menuItem._id,
        name: menuItem.name,
        available: menuItem.available,
      },
    },
  });
});

exports.getStaffMenu = catchAsync(async (req, res, next) => {
  console.log(req.user);
  const userMerchant = req.user.merchant;
  const merchantId = userMerchant._id ? userMerchant._id : userMerchant;

  if (!merchantId) {
    return next(new AppError('You are not associated with any restaurant.', 403));
  }

  // 2. BASIC SETUP
  const protocol = req.protocol;
  const host = req.get('host');

  const merchant = await Merchant.findById(merchantId).select('businessName isActive');
  if (!merchant || !merchant.isActive) {
    return next(new AppError('Restaurant not found or closed.', 404));
  }

  // 3. TIME AND DATE CALCULATION (For Scheduling)
  const now = new Date();
  const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
  const currentTimeStr = now.toTimeString().slice(0, 5);

  const timeToMinutes = time => {
    const timeArray = time.split(':');
    const hours = Number(timeArray[0]);
    const minutes = Number(timeArray[1]);
    return hours * 60 + minutes;
  };
  const currentMinutes = timeToMinutes(currentTimeStr);

  // 4. FIND ACTIVE MENU GROUPS
  // We sort by priority (-1) so the most important menus appear first
  const allGroups = await MenuGroup.find({ merchant: merchantId }).sort({ priority: -1 });
  const activeGroupIds = [];

  for (let i = 0; i < allGroups.length; i++) {
    const group = allGroups[i];
    if (group.visibility === 'hidden') continue;

    let isActive = group.visibility === 'always';

    // Check scheduling if the group is not "always" visible
    if (!isActive && group.visibility === 'scheduled') {
      const onActiveDay =
        !group.activeDays ||
        group.activeDays.length === 0 ||
        group.activeDays.map(d => d.toLowerCase()).includes(dayName);

      const notBlocked =
        !group.blockedDays ||
        group.blockedDays.length === 0 ||
        !group.blockedDays.map(d => d.toLowerCase()).includes(dayName);

      const inTimeSlot =
        !group.timeSlots ||
        group.timeSlots.length === 0 ||
        group.timeSlots.some(slot => {
          const startMin = timeToMinutes(slot.start);
          const endMin = timeToMinutes(slot.end);
          if (endMin < startMin) {
            return currentMinutes >= startMin || currentMinutes <= endMin;
          }
          return currentMinutes >= startMin && currentMinutes <= endMin;
        });

      isActive = onActiveDay && notBlocked && inTimeSlot;
    }

    if (isActive) {
      activeGroupIds.push(group._id);
    }
  }

  // 5. FETCH ITEMS FOR ACTIVE GROUPS
  const activeGroups = await MenuGroup.find({
    _id: { $in: activeGroupIds },
    merchant: merchantId,
  })
    .sort({ priority: -1 })
    .populate({
      path: 'items.menu',
      match: { available: true, inStock: true }, // Only items staff can actually sell
    });

  // 6. CONSOLIDATE DATA & REMOVE DUPLICATES
  const baseUrl = protocol + '://' + host + '/img/menu/';
  const seenItemIds = new Set();
  const finalItems = [];

  for (let j = 0; j < activeGroups.length; j++) {
    const groupObj = activeGroups[j];

    for (let k = 0; k < groupObj.items.length; k++) {
      const itemEntry = groupObj.items[k];

      if (!itemEntry.menu || itemEntry.isHidden) continue;

      const itemIdString = itemEntry.menu._id.toString();

      // If the item exists in a higher priority group already, skip it
      if (seenItemIds.has(itemIdString)) continue;
      seenItemIds.add(itemIdString);

      const menu = itemEntry.menu;

      // Determine price (Override > Variant > Default)
      const itemPrice =
        itemEntry.overridePrice ||
        (menu.variants && menu.variants[0] ? menu.variants[0].price : menu.price) ||
        0;

      finalItems.push({
        id: menu._id,
        name: itemEntry.customName || menu.name,
        description: itemEntry.customDescription || menu.description || '',
        image: menu.image ? baseUrl + menu.image : null,
        price: itemPrice,
        variants: menu.variants || [],
        type: menu.type,
        isVeg: menu.isVeg,
        isSpicy: menu.isSpicy,
        isAlcoholic: !!menu.isAlcoholic || groupObj.isAlcoholMenu,
        prepTime: menu.prepTime || '15-25 min',
        rating: menu.ratingAverage || 4.5,
        category: groupObj.name, // Staff sees which group/category the item belongs to
      });
    }
  }

  // 7. FINAL RESPONSE
  res.status(200).json({
    status: 'success',
    role: req.user.role,
    data: {
      restaurant: merchant.businessName,
      totalItems: finalItems.length,
      menu: finalItems,
    },
  });
});
