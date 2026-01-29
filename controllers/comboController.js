// controllers/comboController.js
const Combo = require('../models/comboModel');
const Menu = require('../models/menuModel');
const Branch = require('../models/branchModel'); // ← Add this
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');

/* 

// controllers/comboController.js
const { uploadImage } = require('../utils/multer');
const { processImage } = require('../utils/imageProcessor');
const { buildImageName } = require('../utils/imagePaths');
const catchAsync = require('../utils/catchAsync');

exports.uploadComboPhoto = uploadImage.single('image');

exports.resizeComboPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const filename = buildImageName({
    prefix: 'combo',
    ownerId: req.user.merchant._id,
    name: req.body.name,
  });

  await processImage({
    buffer: req.file.buffer,
    folder: 'combo',
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

exports.uploadComboPhoto = upload.single('image');

exports.resizeComboPhoto = catchAsync(async (req, res, next) => {
  console.log('req.file:', req.file);
  console.log('req.body before resize:', req.body);
  if (!req.file) {
    delete req.body.image;
    return next();
  }

  const merchantId = req.user.merchant._id;
  const comboName = (req.body.name || 'combo').replace(/\s+/g, '_').toLowerCase();
  const filename = `combo-${merchantId}-${comboName}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(800, 800, { fit: 'cover', position: 'center' })
    .toFormat('jpeg')
    .jpeg({ quality: 92 })
    .toFile(`uploads/img/combo/${filename}`); // ← create this folder!

  req.body.image = filename; // this will be saved to DB
  next();
});

const enrichItems = async items => {
  if (!items?.length) {
    throw new AppError('Combo must have at least one item', 400);
  }

  const menuIds = [...new Set(items.map(i => i.menuItem))];
  const menus = await Menu.find({ _id: { $in: menuIds } }).select('name');

  const menuMap = Object.fromEntries(menus.map(m => [m._id.toString(), m.name]));

  return items.map(item => {
    const name = menuMap[item.menuItem.toString()];
    if (!name) {
      throw new AppError(`Menu item ${item.menuItem} not found`, 404);
    }

    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new AppError('Invalid item quantity', 400);
    }

    return {
      menuItem: item.menuItem,
      nameFallback: name,
      quantity: qty,
    };
  });
};

exports.createCombo = catchAsync(async (req, res, next) => {
  // Parse JSON strings from form-data
  ['items', 'branches', 'availableOnDays', 'timeSlots', 'tags'].forEach(field => {
    if (typeof req.body[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch {
        req.body[field] = [];
      }
    }
  });
  console.log(req.body);
  // Branch assignment logic
  if (req.user.role.name !== 'SUPER-MERCHANT-ADMIN') {
    if (!req.user.branch) return next(new AppError('No branch assigned', 403));
    req.body.branches = [req.user.branch._id];
  } else if (!req.body.branches?.length) {
    return next(new AppError('Super admin must select at least one branch', 400));
  }

  // Enrich items
  req.body.items = await enrichItems(req.body.items);

  // Set merchant
  req.body.merchant = req.user.merchant._id;

  const combo = await Combo.create(req.body);

  res.status(201).json({
    status: 'success',
    data: { combo },
  });
});
// ========================= GET ACTIVE COMBOS (Customer View) =========================
exports.getActiveCombos = catchAsync(async (req, res, next) => {
  const branchId = req.query.branchId || req.user?.branch?._id;
  if (!branchId) return next(new AppError('Branch ID is required', 400));

  const combos = await Combo.find({
    merchant: req.user.merchant._id,
    $or: [{ branches: { $size: 0 } }, { branches: branchId }],
  })
    .sort({ priority: -1, createdAt: -1 })
    .populate('items.menuItem', 'name image price defaultVariant variants available inStock');

  const activeCombos = combos
    .filter(combo => combo.isAvailableNow(branchId))
    .map(combo => {
      const override = combo.branchOverrides.find(o => o.branch.toString() === branchId.toString());

      if (!override) return combo.toObject();

      return {
        ...combo.toObject(),
        comboPrice: override.comboPrice ?? combo.comboPrice,
        items: override.items?.length > 0 ? override.items : combo.items,
        availableOnDays: override.availableOnDays ?? combo.availableOnDays,
        timeSlots: override.timeSlots ?? combo.timeSlots,
        validFrom: override.validFrom ?? combo.validFrom,
        validUntil: override.validUntil ?? combo.validUntil,
        isActive: override.isActive ?? combo.isActive,
        isBranchSpecial: true,
      };
    });

  res.status(200).json({
    status: 'success',
    results: activeCombos.length,
    data: { combos: activeCombos },
  });
});

// ========================= GET ALL COMBOS (Admin Panel) =========================
exports.getAllCombos = catchAsync(async (req, res, next) => {
  const userRole = req.user.role.name;
  const userBranchId = req.user.branch?._id;

  let query = { merchant: req.user.merchant._id };

  if (userRole !== 'SUPER-MERCHANT-ADMIN') {
    if (!userBranchId) return next(new AppError('No branch assigned', 403));
    query.$or = [{ branches: { $size: 0 } }, { branches: userBranchId }];
  }

  let combos = await Combo.find(query)
    .populate({
      path: 'branches',
      select: 'name location.code location.city location.formattedAddress',
    })
    .sort({ priority: -1, createdAt: -1 });

  // Transform image URLs to full absolute paths
  const combosWithImages = combos.map(combo => {
    const comboObj = combo.toObject();

    return {
      ...comboObj,
      image: comboObj.image
        ? `${req.protocol}://${req.get('host')}/img/combo/${comboObj.image}`
        : null,
    };
  });

  res.status(200).json({
    status: 'success',
    results: combosWithImages.length,
    data: { combos: combosWithImages },
  });
});
// ========================= GET SINGLE COMBO =========================
exports.getCombo = catchAsync(async (req, res, next) => {
  const combo = await Combo.findById(req.params.id).populate({
    path: 'branches',
    select: 'name location.formattedAddress location.city location.code publicUrl',
  });

  if (!combo || combo.merchant.toString() !== req.user.merchant._id.toString()) {
    return next(new AppError('Combo not found', 404));
  }

  // Convert to plain object and add full image URL
  const comboObj = combo.toObject();

  const comboWithImage = {
    ...comboObj,
    image: comboObj.image
      ? `${req.protocol}://${req.get('host')}/img/combo/${comboObj.image}`
      : null,
  };

  res.status(200).json({
    status: 'success',
    data: { combo: comboWithImage },
  });
});

// ========================= UPDATE COMBO =========================
exports.updateCombo = catchAsync(async (req, res, next) => {
  ['items', 'branches', 'availableOnDays', 'timeSlots', 'tags'].forEach(field => {
    if (typeof req.body[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch {
        req.body[field] = field === 'items' ? [] : undefined;
      }
    }
  });
  console.log(req.body);
  const combo = await Combo.findOne({
    _id: req.params.id,
    merchant: req.user.merchant._id,
  });
  if (!combo) return next(new AppError('Combo not found', 404));

  // Only super admin can change branches
  if (req.body.branches !== undefined && req.user.role.name !== 'SUPER-MERCHANT-ADMIN') {
    return next(new AppError('Not allowed to change branches', 403));
  }

  if (req.body.items) {
    req.body.items = await enrichItems(req.body.items);
  }

  Object.assign(combo, req.body);
  await combo.save();

  res.status(200).json({
    status: 'success',
    data: { combo },
  });
});

exports.updateBranchOverride = catchAsync(async (req, res, next) => {
  const { comboId } = req.params;
  const branchId = req.user.branch?._id?.toString();
  // Parse JSON fields
  ['items', 'availableOnDays', 'timeSlots'].forEach(field => {
    if (typeof req.body[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch {
        req.body[field] = [];
      }
    }
  });

  const combo = await Combo.findOne({
    _id: comboId,
    merchant: req.user.merchant._id,
  });
  if (!combo) return next(new AppError('Combo not found', 404));

  // Authorization
  if (
    req.user.role.name !== 'SUPER-MERCHANT-ADMIN' &&
    req.user.branch?._id.toString() !== branchId
  ) {
    return next(new AppError('You can only override your own branch', 403));
  }

  // Validate applicability
  const isApplicable =
    combo.branches.length === 0 || combo.branches.some(b => b.toString() === branchId);
  if (!isApplicable) return next(new AppError('Combo not available in this branch', 400));

  // Remove existing override
  combo.branchOverrides = combo.branchOverrides.filter(o => o.branch.toString() !== branchId);

  // If no data sent → remove override completely
  const hasData = Object.keys(req.body).length > 0;
  if (!hasData) {
    await combo.save();
    return res.status(200).json({
      status: 'success',
      message: 'Branch override removed',
      data: { combo },
    });
  }

  // Enrich items if present
  if (req.body.items) {
    req.body.items = await enrichItems(req.body.items);
  }

  // Add new override
  combo.branchOverrides.push({ branch: branchId, ...req.body });

  await combo.save();

  const refreshed = await Combo.findById(comboId);
  res.status(200).json({
    status: 'success',
    message: 'Branch override updated',
    data: { combo: refreshed },
  });
});
// ========================= DELETE & INCREMENT (Minor Fixes) =========================
exports.deleteCombo = catchAsync(async (req, res, next) => {
  const combo = await Combo.findOneAndDelete({
    _id: req.params.id,
    merchant: req.user.merchant._id,
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

// ========================= TOGGLE COMBO ACTIVE STATUS =========================
exports.toggleComboActive = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const comboId = req.params.id;

  // Find the combo belonging to the merchant
  const combo = await Combo.findOne({
    _id: comboId,
    merchant: merchantId,
  });

  if (!combo) {
    return next(new AppError('Combo not found or access denied.', 404));
  }

  // Toggle the `isActive` field
  const newActiveStatus = !combo.isActive;
  combo.isActive = newActiveStatus;

  // Save with minimal validation (faster and safe since we're only changing a boolean)
  await combo.save({ validateModifiedOnly: true });

  res.status(200).json({
    status: 'success',
    message: `Special offer is now ${newActiveStatus ? 'active' : 'inactive'}`,
    data: {
      combo: {
        id: combo._id,
        name: combo.name,
        isActive: combo.isActive,
      },
    },
  });
});

exports.toggleBranchActive = catchAsync(async (req, res, next) => {
  const { comboId } = req.params;
  const branchId = req.user.branch?._id?.toString();

  if (!branchId) return next(new AppError('No branch assigned', 403));

  let targetBranchId = branchId;
  if (req.user.role.name === 'SUPER-MERCHANT-ADMIN' && req.body.branchId) {
    targetBranchId = req.body.branchId;
  }

  const combo = await Combo.findOne({
    _id: comboId,
    merchant: req.user.merchant._id,
  });
  if (!combo) return next(new AppError('Combo not found', 404));

  const isApplicable =
    combo.branches.length === 0 || combo.branches.some(b => b.toString() === targetBranchId);
  if (!isApplicable) return next(new AppError('Combo not available in this branch', 400));

  let override = combo.branchOverrides.find(o => o.branch.toString() === targetBranchId);
  if (!override) {
    override = { branch: targetBranchId };
    combo.branchOverrides.push(override);
  }

  const current = override.isActive !== undefined ? override.isActive : combo.isActive;
  override.isActive = !current;

  // Clean up if empty
  const meaningfulFields = [
    'isActive',
    'comboPrice',
    'items',
    'availableOnDays',
    'timeSlots',
    'validFrom',
    'validUntil',
  ];

  const hasMeaningfulData = meaningfulFields.some(field => {
    const value = override[field];
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  });

  if (!hasMeaningfulData) {
    combo.branchOverrides.pull(override._id);
  }

  await combo.save();

  res.status(200).json({
    status: 'success',
    message: `Combo ${override.isActive ? 'activated' : 'deactivated'} for this branch`,
    data: { isActive: override.isActive ?? combo.isActive },
  });
});
