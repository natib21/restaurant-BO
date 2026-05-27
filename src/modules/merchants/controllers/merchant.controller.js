const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const catchAsync = require('../../../../utils/catchAsync');
const merchantService = require('../services/merchant.service');

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
  if (req.files?.logo?.[0]) {
    const logoFile = req.files.logo[0];
    const logoFilename = `merchant-logo-${Date.now()}-${logoFile.originalname.split('.').slice(0, -1).join('.')}.jpeg`;

    await sharp(logoFile.buffer)
      .resize(300, 300, { fit: 'cover' })
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(`uploads/img/merchants/${logoFilename}`);

    req.body.logo = logoFilename;
  }

  if (req.files?.coverImage?.[0]) {
    const coverFile = req.files.coverImage[0];
    const coverFilename = `merchant-cover-${Date.now()}-${coverFile.originalname.split('.').slice(0, -1).join('.')}.jpeg`;

    await sharp(coverFile.buffer)
      .resize(1200, 400, { fit: 'cover' })
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(`uploads/img/merchants/${coverFilename}`);

    req.body.coverImage = coverFilename;
  }

  if (req.files?.documents) {
    const docs = req.files.documents;
    req.body.documents = [];

    docs.forEach((file, index) => {
      const docFilename = `${Date.now()}-${file.originalname}`;
      const docPath = `public/img/merchants/documents/${docFilename}`;
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
  const baseUrl = `${req.protocol}://${req.get('host')}/img/merchants`;
  const merchants = await merchantService.getAllMerchants(req.query, baseUrl);

  res.status(200).json({
    status: 'success',
    results: merchants.length,
    data: { merchants },
  });
});

exports.getMerchant = catchAsync(async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}/img/merchants`;
  const merchant = await merchantService.getMerchantById(req.params.id, baseUrl);

  res.status(200).json({
    status: 'success',
    data: { merchant },
  });
});

exports.createNewMerchant = catchAsync(async (req, res) => {
  const merchant = await merchantService.createMerchant(req.body, req.user._id);

  res.status(201).json({
    status: 'success',
    data: { merchant },
  });
});

exports.updateMerchant = catchAsync(async (req, res) => {
  const merchant = await merchantService.updateMerchant(req.params.id, req.body, req.user);

  res.status(200).json({
    status: 'success',
    data: { merchant },
  });
});

exports.getMe = catchAsync(async (req, res) => {
  const merchantId = req.user.merchant?._id || req.user.merchant;
  const baseUrl = `${req.protocol}://${req.get('host')}/img/merchants`;
  const merchant = await merchantService.getMerchantById(merchantId, baseUrl);

  res.status(200).json({
    status: 'success',
    data: { merchant },
  });
});

exports.updateMe = catchAsync(async (req, res) => {
  const merchantId = req.user.merchant?._id || req.user.merchant;
  const baseUrl = `${req.protocol}://${req.get('host')}/img/merchants`;
  
  const updatedMerchant = await merchantService.updateMe(merchantId, req.body);
  const merchantObj = updatedMerchant.toObject();

  res.status(200).json({
    status: 'success',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${baseUrl}/${merchantObj.logo}` : null,
        coverImage: merchantObj.coverImage ? `${baseUrl}/${merchantObj.coverImage}` : null,
      }
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
  const merchant = await merchantService.approveMerchant(req.params.id, req.user._id);

  res.status(200).json({
    status: 'success',
    message: 'Merchant approved',
    data: { merchant },
  });
});

exports.suspendMerchant = catchAsync(async (req, res) => {
  const merchant = await merchantService.suspendMerchant(req.params.id, req.body.reason);

  res.status(200).json({
    status: 'success',
    message: 'Merchant suspended',
    data: { merchant },
  });
});

exports.activateMerchant = catchAsync(async (req, res) => {
  const merchant = await merchantService.activateMerchant(req.params.id);

  res.status(200).json({
    status: 'success',
    message: 'Merchant reactivated',
    data: { merchant },
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

  res.status(200).json({
    status: 'success',
    data: { merchant },
  });
});
