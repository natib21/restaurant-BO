// modules/files/file.controller.js

const multer = require('multer');
const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');
const { FileManagementService } = require('./file-management.service');
const { getMerchantId } = require('../../common/utils/tenant-scope');
// ✅ Add these imports for public access
const FileAsset = require('../../../models/FileAsset');
const { readLocal } = require('../../infrastructure/storage/local-storage.adapter');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new AppError('Only image uploads are supported', 400), false);
    }
    cb(null, true);
  },
});

exports.uploadMiddleware = upload.single('file');

exports.uploadFile = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);

  const merchantId = getMerchantId(req);
  const { entityType, entityId, purpose, branchId } = req.body;

  if (!entityType) {
    throw new AppError('entityType is required', 400);
  }

  const file = await FileManagementService.registerUpload({
    merchantId,
    branchId: branchId || req.ctx?.branchId,
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    entityType,
    entityId,
    purpose,
    uploadedBy: req.user?._id,
  });

  res.status(201).json({
    status: 'success',
    data: {
      file: {
        _id: file._id,
        url: file.getPublicUrl(),
        entityType: file.entityType,
        entityId: file.entityId,
        purpose: file.purpose,
      },
    },
  });
});

// ✅ FIXED: Handle both authenticated and public access
exports.getFileContent = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Check if user is authenticated
  const isAuthenticated = req.user && req.user._id;
  const merchantId = isAuthenticated ? getMerchantId(req) : null;

  let file;
  let buffer;

  if (isAuthenticated && merchantId) {
    // ✅ Authenticated user - full access to their files
    try {
      const result = await FileManagementService.getContent(id, merchantId);
      file = result.file;
      buffer = result.buffer;
    } catch (error) {
      throw new AppError('File not found', 404);
    }
  } else {
    // ✅ Public access - only allow specific entity types (menu images, etc.)
    file = await FileAsset.findOne({
      _id: id,
      isDeleted: false,
      entityType: {
        $in: ['menu', 'combo', 'branch', 'table', 'qr'],
      },
    });

    if (!file) {
      throw new AppError('File not found or access denied', 404);
    }

    // Read file from storage
    try {
      buffer = await readLocal(file.storageKey);
    } catch (error) {
      throw new AppError('File content not found', 404);
    }
  }

  // Set content type and send
  res.set('Content-Type', file.mimeType || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  res.send(buffer);
});

exports.listEntityFiles = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { entityType, entityId, branchId } = req.query;
  const files = await FileManagementService.listForEntity({
    merchantId,
    entityType,
    entityId,
    branchId,
  });
  res.status(200).json({ status: 'success', results: files.length, data: { files } });
});

exports.deleteFile = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  await FileManagementService.softDelete(req.params.id, merchantId);
  res.status(204).send();
});
