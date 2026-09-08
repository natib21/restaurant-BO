const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const catchAsync = require('../../../../utils/catchAsync');
const merchantService = require('../services/merchant.service');
const { FileManagementService } = require('../../files/file-management.service');
const { getMerchantId } = require('../../../common/utils/tenant-scope');

const MERCHANT_UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'img', 'merchants');
const MERCHANT_DOCUMENT_ROOT = path.join(process.cwd(), 'public', 'img', 'merchants', 'documents');

function ensureMerchantUploadDirs() {
  fs.mkdirSync(MERCHANT_UPLOAD_ROOT, { recursive: true });
  fs.mkdirSync(MERCHANT_DOCUMENT_ROOT, { recursive: true });
}

const multerStorage = multer.memoryStorage();
const multerFilter = (req, file, cb) => {
  if (file.fieldname === 'documents') {
    cb(null, true);
  } else if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images for logo/cover.'), false);
  }
};

const upload = multer({ storage: multerStorage, fileFilter: multerFilter });

exports.uploadMerchantPhotos = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
  { name: 'documents', maxCount: 10 },
]);

exports.processMerchantMedia = catchAsync(async (req, res, next) => {
  ensureMerchantUploadDirs();
  const merchantId = getMerchantId(req);

  const resizeForLogo = async file =>
    sharp(file.buffer)
      .resize(300, 300, { fit: 'cover', position: 'center' })
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toBuffer();

  const resizeForCover = async file =>
    sharp(file.buffer)
      .resize(1200, 400, { fit: 'cover', position: 'center' })
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toBuffer();

  if (req.files?.logo?.[0]) {
    if (merchantId) {
      const file = await FileManagementService.registerUpload({
        merchantId,
        branchId: req.ctx?.branchId || null,
        buffer: await resizeForLogo(req.files.logo[0]),
        originalName: req.files.logo[0].originalname || 'merchant-logo.jpeg',
        mimeType: 'image/jpeg',
        entityType: 'merchant',
        entityId: merchantId,
        purpose: 'logo',
        uploadedBy: req.user?._id || null,
      });

      req.body.logo = file._id;
    } else {
      const logoFile = req.files.logo[0];
      const logoFilename = `merchant-logo-${Date.now()}-${logoFile.originalname.split('.').slice(0, -1).join('.')}.jpeg`;
      const logoPath = path.join(MERCHANT_UPLOAD_ROOT, logoFilename);

      await sharp(logoFile.buffer)
        .resize(300, 300, { fit: 'cover' })
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(logoPath);

      req.body.logo = logoFilename;
    }
  }

  if (req.files?.coverImage?.[0]) {
    if (merchantId) {
      const file = await FileManagementService.registerUpload({
        merchantId,
        branchId: req.ctx?.branchId || null,
        buffer: await resizeForCover(req.files.coverImage[0]),
        originalName: req.files.coverImage[0].originalname || 'merchant-cover.jpeg',
        mimeType: 'image/jpeg',
        entityType: 'merchant',
        entityId: merchantId,
        purpose: 'image',
        uploadedBy: req.user?._id || null,
      });

      req.body.coverImage = file._id;
    } else {
      const coverFile = req.files.coverImage[0];
      const coverFilename = `merchant-cover-${Date.now()}-${coverFile.originalname.split('.').slice(0, -1).join('.')}.jpeg`;
      const coverPath = path.join(MERCHANT_UPLOAD_ROOT, coverFilename);

      await sharp(coverFile.buffer)
        .resize(1200, 400, { fit: 'cover' })
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(coverPath);

      req.body.coverImage = coverFilename;
    }
  }

  if (req.files?.documents) {
    const docs = req.files.documents;
    req.body.documents = [];

    docs.forEach((file, index) => {
      const docFilename = `${Date.now()}-${file.originalname}`;
      const docPath = path.join(MERCHANT_DOCUMENT_ROOT, docFilename);
      fs.writeFileSync(docPath, file.buffer);

      req.body.documents.push({
        name: file.originalname,
        type: req.body.documentTypes?.[index] || 'unknown',
        url: `/img/merchants/documents/${docFilename}`,
        uploadedAt: new Date(),
      });
    });
  }

  next();
});

exports.getAllMerchants = catchAsync(async (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const merchants = await merchantService.getAllMerchants(req.query, origin);

  res.status(200).json({
    status: 'success',
    results: merchants.length,
    data: { merchants },
  });
});

exports.getMerchant = catchAsync(async (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const merchant = await merchantService.getMerchantById(req.params.id, origin);

  res.status(200).json({
    status: 'success',
    data: { merchant },
  });
});

exports.createNewMerchant = catchAsync(async (req, res) => {
  const merchant = await merchantService.createMerchant(req.body, req.user._id);
  const merchantObj = merchant.toObject ? merchant.toObject() : merchant;

  res.status(201).json({
    status: 'success',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.logo)}/content` : null,
        coverImage: merchantObj.coverImage ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.coverImage)}/content` : null,
      },
    },
  });
});

exports.updateMerchant = catchAsync(async (req, res) => {
  const merchant = await merchantService.updateMerchant(req.params.id, req.body, req.user);
  const merchantObj = merchant.toObject ? merchant.toObject() : merchant;

  res.status(200).json({
    status: 'success',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.logo)}/content` : null,
        coverImage: merchantObj.coverImage ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.coverImage)}/content` : null,
      },
    },
  });
});

exports.getMe = catchAsync(async (req, res) => {
  const merchantId = req.user.merchant?._id || req.user.merchant;
  const origin = `${req.protocol}://${req.get('host')}`;
  const merchant = await merchantService.getMerchantById(merchantId, origin);

  res.status(200).json({
    status: 'success',
    data: { merchant },
  });
});

exports.updateMe = catchAsync(async (req, res) => {
  const merchantId = req.user.merchant?._id || req.user.merchant;
  const origin = `${req.protocol}://${req.get('host')}`;

  const updatedMerchant = await merchantService.updateMe(merchantId, req.body);
  const merchantObj = updatedMerchant.toObject();

  res.status(200).json({
    status: 'success',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${origin}/api/v1/files/${String(merchantObj.logo)}/content` : null,
        coverImage: merchantObj.coverImage ? `${origin}/api/v1/files/${String(merchantObj.coverImage)}/content` : null,
      },
    },
  });
});

exports.deleteMerchant = catchAsync(async (req, res) => {
  await merchantService.deleteMerchant(req.params.id);

  res.status(200).json({
    status: 'success',
    message: 'Merchant deactivated and users disabled',
  });
});

exports.approveMerchant = catchAsync(async (req, res) => {
  console.log(`Approving merchant with ID: ${req.params.id} by user: ${req.user._id}`);
  const merchant = await merchantService.approveMerchant(req.params.id, req.user._id);
  const merchantObj = merchant.toObject ? merchant.toObject() : merchant;

  res.status(200).json({
    status: 'success',
    message: 'Merchant approved',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.logo)}/content` : null,
        coverImage: merchantObj.coverImage ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.coverImage)}/content` : null,
      },
    },
  });
});

exports.suspendMerchant = catchAsync(async (req, res) => {
  const merchant = await merchantService.suspendMerchant(req.params.id, req.body.reason);
  const merchantObj = merchant.toObject ? merchant.toObject() : merchant;

  res.status(200).json({
    status: 'success',
    message: 'Merchant suspended',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.logo)}/content` : null,
        coverImage: merchantObj.coverImage ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.coverImage)}/content` : null,
      },
    },
  });
});

exports.activateMerchant = catchAsync(async (req, res) => {
  const merchant = await merchantService.activateMerchant(req.params.id);
  const merchantObj = merchant.toObject ? merchant.toObject() : merchant;

  res.status(200).json({
    status: 'success',
    message: 'Merchant reactivated',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.logo)}/content` : null,
        coverImage: merchantObj.coverImage ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.coverImage)}/content` : null,
      },
    },
  });
});

exports.getMerchantStats = catchAsync(async (req, res) => {
  const stats = await merchantService.getMerchantStats(req.params.id);

  res.status(200).json({
    status: 'success',
    data: { stats },
  });
});

exports.updateSubscription = catchAsync(async (req, res) => {
  const merchant = await merchantService.updateSubscription(req.params.id, req.body.plan);
  const merchantObj = merchant.toObject ? merchant.toObject() : merchant;

  res.status(200).json({
    status: 'success',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.logo)}/content` : null,
        coverImage: merchantObj.coverImage ? `${req.protocol}://${req.get('host')}/api/v1/files/${String(merchantObj.coverImage)}/content` : null,
      },
    },
  });
});
