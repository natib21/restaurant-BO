// controllers/menu.controller.js

const AppError = require('../../../../utils/appError');
const catchAsync = require('../../../../utils/catchAsync');
const multer = require('multer');
const sharp = require('sharp');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { MenuService } = require('../service/MenuService');
const { FileManagementService } = require('../../files/file-management.service');
const FileAsset = require('../../../../models/FileAsset');
const {
  resolveSingleImageData,
  resolveImageCollectionData,
} = require('../utils/image-response');

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
exports.uploadMenuPhotos = upload.array('images', 5);

// ============================================
// RESIZE & PROCESS IMAGE (Using FileAsset)
// ============================================
exports.resizeAndProcessImages = catchAsync(async (req, res, next) => {
  console.log('📸 req.file →', req.file);
  console.log('📸 req.files →', req.files);
  console.log('📸 req.body →', req.body);

  const merchantId = getMerchantId(req);
  const branchId = req.body.branchId || null;
  const userId = req.user._id;

  // Handle single image upload
  if (req.file) {
    const processedBuffer = await sharp(req.file.buffer)
      .resize(800, 800, { fit: 'cover', position: 'center' })
      .toFormat('jpeg')
      .jpeg({ quality: 92 })
      .toBuffer();

    const fileAsset = await FileManagementService.registerUpload({
      merchantId,
      branchId,
      buffer: processedBuffer,
      originalName: `menu-${Date.now()}.jpeg`,
      mimeType: 'image/jpeg',
      entityType: 'menu',
      entityId: null,
      purpose: 'image',
      uploadedBy: userId,
    });

    req.processedImageId = fileAsset._id;
    req.body.image = fileAsset._id;
    req.body.imageUrl = fileAsset.getPublicUrl();
    req.body.imageFilename = `menu-${merchantId}-${Date.now()}.jpeg`;
  }

  // Handle multiple images upload
  if (req.files && req.files.length > 0) {
    const processedImages = [];

    for (const file of req.files) {
      const processedBuffer = await sharp(file.buffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .toFormat('jpeg')
        .jpeg({ quality: 92 })
        .toBuffer();

      const fileAsset = await FileManagementService.registerUpload({
        merchantId,
        branchId,
        buffer: processedBuffer,
        originalName: file.originalname || `menu-${Date.now()}.jpeg`,
        mimeType: 'image/jpeg',
        entityType: 'menu',
        entityId: null,
        purpose: 'image',
        uploadedBy: userId,
      });

      processedImages.push(fileAsset._id);
    }

    req.processedImageIds = processedImages;
    req.body.images = processedImages;
  }

  next();
});

// ============================================
// EXISTING MIDDLEWARE (Legacy support)
// ============================================
exports.resizeMenuPhoto = catchAsync(async (req, res, next) => {
  console.log('🔄 Legacy resizeMenuPhoto →', req.file);
  console.log('📝 req.body →', req.body);

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

// ============================================
// QUERY MIDDLEWARES
// ============================================
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

// ============================================
// CONTROLLER METHODS
// ============================================

// ============================================
// 1. CREATE NEW MENU
// ============================================
exports.createNewMenu = catchAsync(async (req, res) => {
  console.log("👤 user=>", req.user);
  console.log("📦 req.body=>", req.body);

  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  if (!merchantId) {
    throw new AppError('Merchant ID is required', 400);
  }

  // Create menu with processed image IDs
  const menuData = {
    ...req.body,
    merchant: merchantId,
    createdBy: userId,
  };

  // If we have processed image IDs from middleware
  if (req.processedImageId) {
    menuData.image = req.processedImageId;
    menuData.images = [req.processedImageId];
  }

  if (req.processedImageIds && req.processedImageIds.length > 0) {
    menuData.images = req.processedImageIds;
    if (!menuData.image) {
      menuData.image = req.processedImageIds[0];
    }
  }

  console.log('📦 Final menuData:', {
    name: menuData.name,
    merchant: menuData.merchant,
    image: menuData.image,
    images: menuData.images,
  });

  // Create menu item
  const menu = await MenuService.createNewMenu(menuData, req);

  // Update FileAsset records with entityId after menu creation
  if (menu.image && typeof menu.image !== 'string') {
    await FileAsset.findByIdAndUpdate(menu.image, {
      entityId: menu._id,
    });
  }

  if (menu.images && menu.images.length > 0) {
    const objectIds = menu.images.filter(id => typeof id !== 'string');
    if (objectIds.length > 0) {
      await FileAsset.updateMany(
        { _id: { $in: objectIds } },
        { entityId: menu._id }
      );
    }
  }

  // Populate image references for response
  await menu.populate([
    { path: 'image', match: { isDeleted: false } },
    { path: 'images', match: { isDeleted: false } },
  ]);

  res.status(201).json({
    status: 'success',
    data: { menu: formatMenuResponse(menu) },
  });
});

// ============================================
// 2. GET ALL MENU
// ============================================
// controllers/menu.controller.js

// controllers/menu.controller.js

// ============================================
// 3. GET SINGLE MENU
// ============================================
exports.getMenu = catchAsync(async (req, res, next) => {
  console.log('🔍 getMenu called for ID:', req.params.id);
  
  // ✅ Get menu - now returns Mongoose document
  const menu = await MenuService.getMenu(req);
  
  if (!menu) {
    throw new AppError('Menu not found', 404);
  }
  
  // ✅ Populate image references (works because menu is a Mongoose document)
  await menu.populate([
    { path: 'image', match: { isDeleted: false } },
    { path: 'images', match: { isDeleted: false } },
  ]);

  res.status(200).json({
    status: 'success',
    data: { menu: formatMenuResponse(menu) },
  });
});

// ============================================
// 2. GET ALL MENU
// ============================================
exports.getAllMenu = catchAsync(async (req, res, next) => {
  // ✅ Get menu items - returns Mongoose documents
  const menuItems = await MenuService.getAllMenu(req);

  if (!menuItems || menuItems.length === 0) {
    return res.status(200).json({
      status: 'success',
      results: 0,
      data: { menu: [] },
    });
  }

  // ✅ Populate and format each menu
  const formattedMenus = await Promise.all(
    menuItems.map(async (menu) => {
      await menu.populate([
        { path: 'image', match: { isDeleted: false } },
        { path: 'images', match: { isDeleted: false } },
      ]);
      return formatMenuResponse(menu);
    })
  );

  res.status(200).json({
    status: 'success',
    results: formattedMenus.length,
    data: { menu: formattedMenus },
  });
});

// ============================================
// 4. UPDATE MENU
// ============================================
exports.updateMenu = catchAsync(async (req, res, next) => {
  const updatedMenu = await MenuService.updateMenu(req);

  // Populate image references
  await updatedMenu.populate([
    { path: 'image', match: { isDeleted: false } },
    { path: 'images', match: { isDeleted: false } },
  ]);

  res.status(200).json({
    status: 'success',
    data: { menu: formatMenuResponse(updatedMenu) },
  });
});

// ============================================
// 5. DELETE MENU
// ============================================
exports.deleteMenu = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  // Get menu before deletion to clean up images
  const menu = await MenuService.getMenu(req);

  // Soft delete all FileAsset images
  if (menu.image && typeof menu.image !== 'string') {
    await FileManagementService.softDelete(menu.image, merchantId);
  }

  if (menu.images && menu.images.length > 0) {
    for (const imageId of menu.images) {
      if (typeof imageId !== 'string') {
        await FileManagementService.softDelete(imageId, merchantId);
      }
    }
  }

  await MenuService.deleteMenu(req);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// ============================================
// 6. GET PUBLIC MENU
// ============================================
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

// ============================================
// 7. GET ACTIVE MENU
// ============================================
exports.getActiveMenu = catchAsync(async (req, res) => {
  const { menu, combos, generatedAt } = await MenuService.getActiveMenu(req);

  res.status(200).json({
    status: 'success',
    data: { menu, combos, generatedAt },
  });
});

// ============================================
// 8. TOGGLE AVAILABILITY
// ============================================
exports.toggleMenuItemAvailability = catchAsync(async (req, res) => {
  const result = await MenuService.toggleMenuItemAvailability(req);

  res.status(200).json({
    status: 'success',
    message: result.message,
    data: { menu: { id: result.id, name: result.name, available: result.available } },
  });
});

// ============================================
// 9. GET STAFF MENU
// ============================================
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

// ============================================
// 10. PUBLISH MENU GROUP
// ============================================
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

// ============================================
// 11. ARCHIVE MENU ITEM
// ============================================
exports.archiveMenuItem = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const menu = await MenuService.archiveMenuItem(req.params.id, merchantId);
  res.status(200).json({ status: 'success', data: { menu } });
});

// ============================================
// 12. GET BRANCH PUBLICATIONS
// ============================================
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

// ============================================
// HELPER: formatMenuResponse
// ============================================
function formatMenuResponse(menu) {
  if (!menu) return null;

  const menuObj = menu.toObject ? menu.toObject() : menu;
  const imageData = resolveSingleImageData({
    image: menuObj.image,
    imageFilename: menuObj.imageFilename,
    imageUrl: menuObj.imageUrl,
    legacyBasePath: '/img/menu',
  });
  const imagesData = resolveImageCollectionData(menuObj.images, {
    legacyBasePath: '/img/menu',
  });

  return {
    ...menuObj,
    imageData,
    imagesData,
    // Backward compatibility
    imageUrl: imageData?.url || null,
    imageUrls: imagesData.map(img => img.url),
    // Keep IDs for reference
    mainImageId: imageData?.id || null,
    imageIds: imagesData.map(img => img.id),
  };
}
