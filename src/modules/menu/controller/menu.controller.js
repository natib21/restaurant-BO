// controllers/menu.controller.js

const AppError = require('../../../../utils/appError');
const catchAsync = require('../../../../utils/catchAsync');
const multer = require('multer');
const sharp = require('sharp');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { MenuService } = require('../service/MenuService'); // Legacy service for some methods
const MenuItemService = require('../service/MenuItem.service'); // New structured service
const MenuGroupService = require('../service/MenuGroup.service'); // New structured service
const { FileManagementService } = require('../../files/file-management.service');
const FileAsset = require('../../../../models/FileAsset');
const { resolveSingleImageData, resolveImageCollectionData } = require('../utils/image-response');
const { sendResponse } = require('../../../../utils/sendResponse');

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
// QUERY MIDDLEWARES
// ============================================
exports.getAllBeverage = (req, res, next) => {
  req.query.type = 'drink';
  next();
};

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
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  if (!merchantId) {
    throw new AppError('Merchant ID is required', 400);
  }

  // Create menu with processed image IDs
  const menuData = {
    ...req.body,
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

  // Create menu item
  const menu = await MenuItemService.create(menuData, merchantId, userId);

  // Update FileAsset records with entityId after menu creation
  if (menu.image && typeof menu.image !== 'string') {
    await FileAsset.findByIdAndUpdate(menu.image, {
      entityId: menu._id,
    });
  }

  if (menu.images && menu.images.length > 0) {
    const objectIds = menu.images.filter(id => typeof id !== 'string');
    if (objectIds.length > 0) {
      await FileAsset.updateMany({ _id: { $in: objectIds } }, { entityId: menu._id });
    }
  }

  // Populate image references for response
  await menu.populate([
    { path: 'image', match: { isDeleted: false } },
    { path: 'images', match: { isDeleted: false } },
  ]);

  sendResponse(res, 201, 'menu', formatMenuResponse(menu));
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
  const merchantId = getMerchantId(req);
  
  // ✅ Get menu using new service - now returns Mongoose document
  const menu = await MenuItemService.getById(req.params.id, merchantId);

  if (!menu) {
    throw new AppError('Menu not found', 404);
  }

  // ✅ Populate image references (works because menu is a Mongoose document)
  await menu.populate([
    { path: 'image', match: { isDeleted: false } },
    { path: 'images', match: { isDeleted: false } },
  ]);

  sendResponse(res, 200, 'menu', formatMenuResponse(menu));
});

// ============================================
// 2. GET ALL MENU
// ============================================
exports.getAllMenu = catchAsync(async (req, res, next) => {
  // ✅ Get menu items using new service - returns Mongoose documents (with ApiFeatures applied)
  const menuItems = await MenuItemService.getAll(req);

  if (!menuItems || menuItems.length === 0) {
    return sendResponse(res, 200, 'menus', [], { results: 0 });
  }

  // ✅ Populate and format each menu
  const formattedMenus = await Promise.all(
    menuItems.map(async menu => {
      await menu.populate([
        { path: 'image', match: { isDeleted: false } },
        { path: 'images', match: { isDeleted: false } },
      ]);
      return formatMenuResponse(menu);
    })
  );

  // Use standardized response helper (note: 'menu' → 'menus' for consistency)
  sendResponse(res, 200, 'menus', formattedMenus, { results: formattedMenus.length });
});

// ============================================
// 4. UPDATE MENU
// ============================================
exports.updateMenu = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  // If new image uploaded, cleanup old FileAsset before updating
  if (req.processedImageId || (req.processedImageIds && req.processedImageIds.length > 0)) {
    const oldMenu = await MenuItemService.getById(req.params.id, merchantId);

    // Clean up old single image
    if (req.processedImageId && oldMenu.image && typeof oldMenu.image !== 'string') {
      await FileManagementService.softDelete(oldMenu.image, merchantId);
    }

    // Clean up old images array
    if (req.processedImageIds && oldMenu.images && oldMenu.images.length > 0) {
      for (const imageId of oldMenu.images) {
        if (typeof imageId !== 'string') {
          await FileManagementService.softDelete(imageId, merchantId);
        }
      }
    }
  }

  const updatedMenu = await MenuItemService.update(req.params.id, req.body, merchantId, userId);

  // Populate image references
  await updatedMenu.populate([
    { path: 'image', match: { isDeleted: false } },
    { path: 'images', match: { isDeleted: false } },
  ]);

  sendResponse(res, 200, 'menu', formatMenuResponse(updatedMenu));
});

// ============================================
// 5. DELETE MENU
// ============================================
exports.deleteMenu = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  // Get menu before deletion to clean up images
  const menu = await MenuItemService.getById(req.params.id, merchantId);

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

  await MenuItemService.softDelete(req.params.id, merchantId, userId);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// ============================================
// 6. GET PUBLIC MENU
// ============================================
exports.getPublicMenu = catchAsync(async (req, res, next) => {
  const payload = await MenuGroupService.getPublicMenu(req);

  res.status(200).json({
    status: 'success',
    data: payload,
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
  const merchantId = getMerchantId(req);
  
  const menuItem = await MenuItemService.toggleAvailability(req.params.id, merchantId);

  sendResponse(
    res,
    200,
    'menu',
    { id: menuItem._id, name: menuItem.name, available: menuItem.available },
    { message: `Menu item ${menuItem.available ? 'made available' : 'made unavailable'} successfully` }
  );
});

// ============================================
// 9. GET STAFF MENU
// ============================================
exports.getStaffMenu = catchAsync(async (req, res) => {
  const payload = await MenuGroupService.getStaffMenu(req);

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

  sendResponse(res, 201, 'publication', publication);
});

// ============================================
// 11. ARCHIVE MENU ITEM
// ============================================
exports.archiveMenuItem = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const menu = await MenuService.archiveMenuItem(req.params.id, merchantId);
  sendResponse(res, 200, 'menu', menu);
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
  sendResponse(res, 200, 'publications', publications, { results: publications.length });
});

// ============================================
// HELPER: formatMenuResponse
// ============================================
function formatMenuResponse(menu) {
  if (!menu) return null;

  const menuObj = menu.toObject ? menu.toObject() : menu;
  const imageData = resolveSingleImageData({
    image: menuObj.image,
  });
  const imagesData = resolveImageCollectionData(menuObj.images, {});

  // Remove populated image objects to keep response clean
  delete menuObj.image;
  delete menuObj.images;

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
