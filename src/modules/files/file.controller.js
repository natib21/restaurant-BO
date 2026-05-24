const multer = require('multer');
const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');
const { FileManagementService } = require('./file-management.service');
const { getMerchantId } = require('../../common/utils/tenant-scope');

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

exports.getFileContent = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { file, buffer } = await FileManagementService.getContent(req.params.id, merchantId);
  res.set('Content-Type', file.mimeType || 'application/octet-stream');
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
