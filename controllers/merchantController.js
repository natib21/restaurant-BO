const multer = require('multer');
const sharp = require('sharp');
const Merchant = require('../models/merchantModel');
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// ------------------- MULTER SETUP -------------------
const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) cb(null, true);
  else cb(new AppError('Not an image! Please upload only images.', 400), false);
};

const upload = multer({ storage: multerStorage, fileFilter: multerFilter });

// upload both logo and coverImage
exports.uploadMerchantPhotos = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
]);

// Resize images using sharp
exports.resizeMerchantPhotos = async (req, res, next) => {
  if (req.files?.logo) {
    req.files.logo[0].filename = `merchant-logo-${Date.now()}.jpeg`;
    await sharp(req.files.logo[0].buffer)
      .resize(300, 300)
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(`uploads/img/merchants/${req.files.logo[0].filename}`);
    req.body.logo = req.files.logo[0].filename;
  }

  if (req.files?.coverImage) {
    req.files.coverImage[0].filename = `merchant-cover-${Date.now()}.jpeg`;
    await sharp(req.files.coverImage[0].buffer)
      .resize(1200, 400)
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(`uploads/img/merchants/${req.files.coverImage[0].filename}`);
    req.body.coverImage = req.files.coverImage[0].filename;
  }

  next();
};

// ------------------- CRUD -------------------

// Get all merchants (with optional filtering, sorting, pagination)
exports.getAllMerchants = catchAsync(async (req, res) => {
  const features = new ApiFeatures(Merchant.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const allMerchants = await features.query;

  const merchantsWithImages = allMerchants.map((merchant) => ({
    ...merchant.toObject(),
    logo: merchant.logo
      ? `${req.protocol}://${req.get('host')}/img/merchants/${merchant.logo}`
      : null,
    coverImage: merchant.coverImage
      ? `${req.protocol}://${req.get('host')}/img/merchants/${merchant.coverImage}`
      : null,
  }));

  res.status(200).json({
    status: 'success',
    requestedAt: req.requestTime,
    result: allMerchants.length,
    merchants: merchantsWithImages,
  });
});

// Get a single merchant
exports.getMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findById(req.params.id);

  if (!merchant) return next(new AppError('No Merchant found with that ID', 404));

  res.status(200).json({
    status: 'success',
    merchant,
  });
});

// Create new merchant
exports.createNewMerchant = catchAsync(async (req, res, next) => {
  if (req.files) {
    if (req.files.logo) req.body.logo = req.files.logo[0].filename;
    if (req.files.coverImage) req.body.coverImage = req.files.coverImage[0].filename;
  }

  const newMerchant = await Merchant.create(req.body);

  res.status(201).json({
    status: 'success',
    merchant: newMerchant,
  });
});

// Update merchant
exports.updateMerchant = catchAsync(async (req, res, next) => {
  if (req.files) {
    if (req.files.logo) req.body.logo = req.files.logo[0].filename;
    if (req.files.coverImage) req.body.coverImage = req.files.coverImage[0].filename;
  }

  const merchant = await Merchant.findByIdAndUpdate(req.params.id, req.body, {
    runValidators: true,
    new: true,
  });

  if (!merchant) return next(new AppError('No Merchant found with that ID', 404));

  res.status(200).json({
    status: 'success',
    merchant,
  });
});

// Delete merchant
exports.deleteMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByIdAndDelete(req.params.id);

  if (!merchant) return next(new AppError('No Merchant found with that ID', 404));

  res.status(204).json({
    status: 'success',
    merchant: null,
  });
});
