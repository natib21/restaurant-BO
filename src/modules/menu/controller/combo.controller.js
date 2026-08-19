// controllers/combo.controller.js

const catchAsync = require('../../../../utils/catchAsync');
const multer = require('multer');
const sharp = require('sharp');
const AppError = require('../../../../utils/appError');
const { MenuService } = require('../service/MenuService');
const { FileAsset } = require('../../../../models/FileAsset');
const { FileManagementService } = require('../../files/file-management.service');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { resolveSingleImageData } = require('../utils/image-response');

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

exports.uploadComboPhoto = upload.single('image');

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
      originalName: `combo-${Date.now()}.jpeg`,
      mimeType: 'image/jpeg',
      entityType: 'combo',
      entityId: null,
      purpose: 'image',
      uploadedBy: userId,
    });

    req.processedImageId = fileAsset._id;
    req.body.image = fileAsset._id;
  }

  next();
});

// ============================================
// LEGACY RESIZE MIDDLEWARE
// ============================================
exports.resizeComboPhoto = catchAsync(async (req, res, next) => {
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
    .toFile(`uploads/img/combo/${filename}`);

  req.body.image = filename;
  next();
});

// ============================================
// CONTROLLER METHODS
// ============================================

// ============================================
// 1. CREATE COMBO
// ============================================
exports.createCombo = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  if (!merchantId) {
    throw new AppError('Merchant ID is required', 400);
  }

  // Create combo with processed image ID
  const comboData = {
    ...req.body,
    merchant: merchantId,
    createdBy: userId,
  };

  if (req.processedImageId) {
    comboData.image = req.processedImageId;
  }

  const combo = await MenuService.createCombo(comboData, req);

  // Update FileAsset record with entityId after combo creation
  if (combo.image && typeof combo.image !== 'string') {
    await FileAsset.findByIdAndUpdate(combo.image, {
      entityId: combo._id,
    });
  }

  res.status(201).json({
    status: 'success',
    data: { combo: formatComboResponse(combo) },
  });
});

// ============================================
// 2. GET ALL COMBOS
// ============================================
exports.getAllCombos = catchAsync(async (req, res) => {
  const combos = await MenuService.getAllCombos(req);

  if (!combos || combos.length === 0) {
    return res.status(200).json({
      status: 'success',
      results: 0,
      data: { combos: [] },
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('GET ALL COMBOS returned', combos.length, 'records');
    console.log('Combo prototype isDocument:', combos[0]?.toObject ? true : false);
  }

  const formattedCombos = combos.map(combo => formatComboResponse(combo));

  res.status(200).json({
    status: 'success',
    results: formattedCombos.length,
    data: { combos: formattedCombos },
  });
});

// ============================================
// 3. GET ACTIVE COMBOS
// ============================================
exports.getActiveCombos = catchAsync(async (req, res) => {
  const combos = await MenuService.getActiveCombos(req);

  if (process.env.NODE_ENV === 'development') {
    console.log('GET ACTIVE COMBOS returned', combos.length, 'records');
    console.log('Combo prototype isDocument:', combos[0]?.toObject ? true : false);
  }

  const formattedCombos = combos.map(combo => formatComboResponse(combo));

  res.status(200).json({
    status: 'success',
    results: formattedCombos.length,
    data: { combos: formattedCombos },
  });
});

// ============================================
// 4. GET SINGLE COMBO
// ============================================
exports.getCombo = catchAsync(async (req, res) => {
  const combo = await MenuService.getCombo(req);

  if (!combo) {
    throw new AppError('Combo not found', 404);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('GET SINGLE COMBO returned type:', typeof combo);
    console.log('Combo has toObject:', combo?.toObject ? true : false);
  }

  res.status(200).json({
    status: 'success',
    data: { combo: formatComboResponse(combo) },
  });
});

// ============================================
// 5. UPDATE COMBO
// ============================================
exports.updateCombo = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  // If new image was uploaded, cleanup old FileAsset before updating
  if (req.processedImageId) {
    const oldCombo = await MenuService.getCombo(req);

    // Clean up old image
    if (oldCombo.image && typeof oldCombo.image !== 'string') {
      await FileManagementService.softDelete(oldCombo.image, merchantId);
    }

    req.body.image = req.processedImageId;
  }

  const combo = await MenuService.updateCombo(req);

  // Update FileAsset record with entityId after combo update
  if (combo.image && typeof combo.image !== 'string') {
    await FileAsset.findByIdAndUpdate(combo.image, {
      entityId: combo._id,
    });
  }

  res.status(201).json({
    status: 'success',
    data: { combo: formatComboResponse(combo) },
  });
});

// ============================================
// 6. UPDATE BRANCH OVERRIDE
// ============================================
exports.updateBranchOverride = catchAsync(async (req, res) => {
  const { combo, message } = await MenuService.updateBranchOverride(req);

  res.status(200).json({
    status: 'success',
    message,
    data: { combo: formatComboResponse(combo) },
  });
});

// ============================================
// 7. DELETE COMBO
// ============================================
exports.deleteCombo = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  // Get combo before deletion to clean up image
  const combo = await MenuService.getCombo(req);

  // Soft delete FileAsset image
  if (combo.image && typeof combo.image !== 'string') {
    await FileManagementService.softDelete(combo.image, merchantId);
  }

  await MenuService.deleteCombo(req);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// ============================================
// 8. INCREMENT COMBO SOLD
// ============================================
exports.incrementComboSold = catchAsync(async (req, res) => {
  const { comboId, quantity = 1 } = req.body;
  await MenuService.incrementComboSold({ comboId, quantity });

  res.status(200).json({
    status: 'success',
    data: null,
  });
});

// ============================================
// 9. TOGGLE COMBO ACTIVE
// ============================================
exports.toggleComboActive = catchAsync(async (req, res) => {
  const result = await MenuService.toggleComboActive(req);

  res.status(200).json({
    status: 'success',
    message: result.message,
    data: {
      combo: {
        id: result.id,
        name: result.name,
        isActive: result.isActive,
      },
    },
  });
});

// ============================================
// 10. TOGGLE BRANCH ACTIVE
// ============================================
exports.toggleBranchActive = catchAsync(async (req, res) => {
  const result = await MenuService.toggleBranchActive(req);

  res.status(200).json({
    status: 'success',
    message: result.message,
    data: { isActive: result.isActive },
  });
});

// ============================================
// HELPER: formatComboResponse
// ============================================
function formatComboResponse(combo) {
  if (!combo) return null;

  const comboObj = combo.toObject ? combo.toObject() : combo;
  const imageData = resolveSingleImageData({
    image: comboObj.image,
  });

  return {
    ...comboObj,
    imageData,
    // Backward compatibility
    imageUrl: imageData?.url || null,
    // Keep ID for reference
    mainImageId: imageData?.id || null,
  };
}
