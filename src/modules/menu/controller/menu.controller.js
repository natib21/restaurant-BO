const AppError = require('../../../../utils/appError');
const catchAsync = require('../../../../utils/catchAsync');
const multer = require('multer');
const sharp = require('sharp');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { MenuService } = require('../service/MenuService');

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
  limits: { fileSize: 5 * 1024 * 1024 },
});

exports.uploadMenuPhoto = upload.single('image');

exports.resizeMenuPhoto = catchAsync(async (req, res, next) => {
  console.log('req.file →', req.file);
  console.log('req.body →', req.body);

  if (!req.file) {
    console.log('No file uploaded → skipping resize');
    return next();
  }

  const merchantId = req.user.merchant._id;
  const itemName = (req.body.name || 'item').replace(/\s+/g, '_').toLowerCase();
  const filename = `menu-${merchantId}-${itemName}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(800, 800, { fit: 'cover', position: 'center' })
    .toFormat('jpeg')
    .jpeg({ quality: 92 })
    .toFile(`uploads/img/menu/${filename}`);

  req.body.image = filename;
  console.log('image - ', req.body.image);
  next();
});

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
  const payload = await MenuService.getPublicMenu(req);

  res.status(200).json({
    status: 'success',
    restaurant: payload.restaurant,
    generatedAt: payload.generatedAt,
    totalItems: payload.totalItems,
    data: {
      menus: payload.menus,
      specialOffers: payload.specialOffers,
    },
  });
});

exports.getAllMenu = catchAsync(async (req, res, next) => {
  const menuWithImages = await MenuService.getAllMenu(req);

  res.status(200).json({
    status: 'success',
    results: menuWithImages.length,
    data: { menu: menuWithImages },
  });
});

exports.getMenu = catchAsync(async (req, res, next) => {
  const menuWithImage = await MenuService.getMenu(req);

  res.status(200).json({
    status: 'success',
    data: { menu: menuWithImage },
  });
});

exports.createNewMenu = catchAsync(async (req, res) => {
  const menu = await MenuService.createNewMenu(req);

  res.status(201).json({
    status: 'success',
    data: { menu },
  });
});

exports.updateMenu = catchAsync(async (req, res, next) => {
  const updatedMenu = await MenuService.updateMenu(req);

  res.status(200).json({
    status: 'success',
    data: { menu: updatedMenu },
  });
});

exports.deleteMenu = catchAsync(async (req, res) => {
  await MenuService.deleteMenu(req);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.getActiveMenu = catchAsync(async (req, res) => {
  const { menu, combos, generatedAt } = await MenuService.getActiveMenu(req);

  res.status(200).json({
    status: 'success',
    data: { menu, combos, generatedAt },
  });
});

exports.toggleMenuItemAvailability = catchAsync(async (req, res) => {
  const result = await MenuService.toggleMenuItemAvailability(req);

  res.status(200).json({
    status: 'success',
    message: result.message,
    data: { menu: { id: result.id, name: result.name, available: result.available } },
  });
});

exports.getStaffMenu = catchAsync(async (req, res) => {
  const payload = await MenuService.getStaffMenu(req);

  res.status(200).json({
    status: 'success',
    role: payload.role,
    data: {
      restaurant: payload.restaurant,
      totalItems: payload.totalItems,
      menu: payload.menu,
    },
  });
});

exports.publishMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { menuGroupId, branchId } = req.body;

  const publication = await MenuService.publishMenuGroup({
    menuGroupId,
    merchantId,
    branchId,
    publishedBy: req.user._id,
  });

  res.status(201).json({
    status: 'success',
    data: { publication },
  });
});

exports.archiveMenuItem = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const menu = await MenuService.archiveMenuItem(req.params.id, merchantId);
  res.status(200).json({ status: 'success', data: { menu } });
});

exports.getBranchPublications = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const publications = await MenuService.getLatestPublicationForBranch(
    merchantId,
    req.params.branchId
  );
  res.status(200).json({
    status: 'success',
    results: publications.length,
    data: { publications },
  });
});
