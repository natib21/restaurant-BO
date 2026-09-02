// controllers/combo.controller.js

const catchAsync = require('../../../../utils/catchAsync');
const multer = require('multer');
const sharp = require('sharp');
const AppError = require('../../../../utils/appError');
const { MenuService } = require('../service/MenuService'); // Legacy service for some methods
const ComboService = require('../service/Combo.service'); // New structured service
const { FileAsset } = require('../../../../models/FileAsset');
const { FileManagementService } = require('../../files/file-management.service');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { resolveSingleImageData } = require('../utils/image-response');
const { sendResponse } = require('../../../../utils/sendResponse');

/**
 * Parse JSON-stringified fields from multipart/form-data
 * 
 * When using multipart/form-data for image uploads, structured fields (arrays, objects)
 * are sent as JSON strings. This helper safely parses them back to their expected types.
 * 
 * @param {Object} body - Request body
 * @param {Array<string>} fields - Field names to parse
 * @returns {Object} Body with parsed fields
 */
function parseMultipartJsonFields(body, fields = []) {
  const parsed = { ...body };

  for (const field of fields) {
    if (parsed[field] && typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch (err) {
        throw new AppError(
          `Invalid JSON format for field "${field}": ${err.message}`,
          400
        );
      }
    }
  }

  return parsed;
}

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
// LEGACY RESIZE MIDDLEWARE — REMOVED
// ============================================
// resizeComboPhoto (disk-based) has been replaced by resizeAndProcessImages (FileAsset-based).
// It wrote files to uploads/img/combo/ as plain filename strings, which meant:
//   - Images were never tracked in FileAsset
//   - deleteCombo / updateCombo cleanup was silently skipped (typeof image === 'string')
//   - Disk accumulated orphaned files on every update/delete
//
// ⚠️  DATA MIGRATION NOTE: Any existing combo documents whose `image` field holds a
//     plain filename string (e.g. "combo-abc-burger-1234567890.jpeg") rather than a
//     Mongoose ObjectId reference were created via the old middleware. Those files
//     live in uploads/img/combo/ and are not tracked in FileAsset. A one-time backfill
//     job should:
//       1. Find combos where typeof image === 'string'
//       2. Create a FileAsset record for each file (or mark as unmanaged)
//       3. Update the combo.image field to the new FileAsset ObjectId
//     Until that backfill runs, those images will not be served via the FileAsset URL
//     resolver and will not be cleaned up by FileManagementService.softDelete.


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

  // Parse JSON-stringified fields from multipart/form-data
  // ONLY parse actual JSON fields (arrays/objects), NOT plain strings like name/description
  const parsedBody = parseMultipartJsonFields(req.body, [
    'items', // Array of combo items
    'tags', // Array of tags
    'branchOverrides', // Array of branch-specific overrides
    'branches', // Array of branch IDs
    'availableOnDays', // Array of days
    'timeSlots', // Array of time slot objects
  ]);

  // Create combo with processed image ID
  const comboData = {
    ...parsedBody,
  };

  if (req.processedImageId) {
    comboData.image = req.processedImageId;
  }

  const combo = await ComboService.create(comboData, merchantId, userId);

  // Update FileAsset record with entityId after combo creation
  if (combo.image && typeof combo.image !== 'string') {
    await FileAsset.findByIdAndUpdate(combo.image, {
      entityId: combo._id,
    });
  }

  sendResponse(res, 201, 'combo', formatComboResponse(combo));
});

// ============================================
// 2. GET ALL COMBOS
// ============================================
exports.getAllCombos = catchAsync(async (req, res) => {
  const combos = await ComboService.getAll(req);

  if (!combos || combos.length === 0) {
    return sendResponse(res, 200, 'combos', [], { results: 0 });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('GET ALL COMBOS returned', combos.length, 'records');
    console.log('Combo prototype isDocument:', combos[0]?.toObject ? true : false);
  }

  const formattedCombos = combos.map(combo => formatComboResponse(combo));

  sendResponse(res, 200, 'combos', formattedCombos, { results: formattedCombos.length });
});

// ============================================
// 3. GET ACTIVE COMBOS
// ============================================
exports.getActiveCombos = catchAsync(async (req, res) => {
  // merchantId and branchId come exclusively from the validated table session
  // (set by protectTableSession middleware). Never trust client-supplied query params.
  const merchantId = req.merchantId;
  const branchId = req.branchId || null;

  if (!merchantId) {
    throw new AppError('Merchant context is required', 400);
  }

  const combos = await ComboService.getActive(merchantId, branchId);

  if (process.env.NODE_ENV === 'development') {
    console.log('GET ACTIVE COMBOS returned', combos.length, 'records');
    console.log('Combo prototype isDocument:', combos[0]?.toObject ? true : false);
  }

  const formattedCombos = combos.map(combo => formatComboResponse(combo));

  sendResponse(res, 200, 'combos', formattedCombos, { results: formattedCombos.length });
});

// ============================================
// 4. GET SINGLE COMBO
// ============================================
exports.getCombo = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  
  const combo = await ComboService.getById(req.params.id, merchantId);

  if (!combo) {
    throw new AppError('Combo not found', 404);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('GET SINGLE COMBO returned type:', typeof combo);
    console.log('Combo has toObject:', combo?.toObject ? true : false);
  }

  sendResponse(res, 200, 'combo', formatComboResponse(combo));
});

// ============================================
// 5. UPDATE COMBO
// ============================================
exports.updateCombo = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  // Parse JSON-stringified fields from multipart/form-data
  // ONLY parse actual JSON fields (arrays/objects), NOT plain strings like name/description
  const parsedBody = parseMultipartJsonFields(req.body, [
    'items', // Array of combo items
    'tags', // Array of tags
    'branchOverrides', // Array of branch-specific overrides
    'branches', // Array of branch IDs
    'availableOnDays', // Array of days
    'timeSlots', // Array of time slot objects
  ]);

  // If new image was uploaded, cleanup old FileAsset before updating
  if (req.processedImageId) {
    const oldCombo = await ComboService.getById(req.params.id, merchantId);

    // Clean up old image
    if (oldCombo.image && typeof oldCombo.image !== 'string') {
      await FileManagementService.softDelete(oldCombo.image, merchantId);
    }

    parsedBody.image = req.processedImageId;
  }

  const combo = await ComboService.update(req.params.id, parsedBody, merchantId, userId);

  // Update FileAsset record with entityId after combo update
  if (combo.image && typeof combo.image !== 'string') {
    await FileAsset.findByIdAndUpdate(combo.image, {
      entityId: combo._id,
    });
  }

  sendResponse(res, 200, 'combo', formatComboResponse(combo));
});

// ============================================
// 6. UPDATE BRANCH OVERRIDE
// ============================================
exports.updateBranchOverride = catchAsync(async (req, res) => {
  const { combo, message } = await MenuService.updateBranchOverride(req);

  sendResponse(res, 200, 'combo', formatComboResponse(combo), { message });
});

// ============================================
// 7. DELETE COMBO
// ============================================
exports.deleteCombo = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  // Get combo before deletion to clean up image
  const combo = await ComboService.getById(req.params.id, merchantId);

  // Soft delete FileAsset image
  if (combo.image && typeof combo.image !== 'string') {
    await FileManagementService.softDelete(combo.image, merchantId);
  }

  await ComboService.softDelete(req.params.id, merchantId, userId);

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
  const merchantId = getMerchantId(req);
  
  const combo = await ComboService.toggleActive(req.params.id, merchantId);

  sendResponse(
    res,
    200,
    'combo',
    {
      id: combo._id,
      name: combo.name,
      isActive: combo.isActive,
    },
    { message: `Combo ${combo.isActive ? 'activated' : 'deactivated'} successfully` }
  );
});

// ============================================
// 10. TOGGLE BRANCH ACTIVE
// ============================================
exports.toggleBranchActive = catchAsync(async (req, res) => {
  const result = await MenuService.toggleBranchActive(req);

  sendResponse(res, 200, 'branchOverride', { isActive: result.isActive }, { message: result.message });
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
