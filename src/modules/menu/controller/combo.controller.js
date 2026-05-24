const catchAsync = require('../../../../utils/catchAsync');
const multer = require('multer');
const sharp = require('sharp');
const AppError = require('../../../../utils/appError');
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

exports.uploadComboPhoto = upload.single('image');

exports.resizeComboPhoto = catchAsync(async (req, res, next) => {
  console.log('req.file:', req.file);
  console.log('req.body before resize:', req.body);
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

exports.createCombo = catchAsync(async (req, res) => {
  const combo = await MenuService.createCombo(req);

  res.status(201).json({
    status: 'success',
    data: { combo },
  });
});

exports.getActiveCombos = catchAsync(async (req, res) => {
  const activeCombos = await MenuService.getActiveCombos(req);

  res.status(200).json({
    status: 'success',
    results: activeCombos.length,
    data: { combos: activeCombos },
  });
});

exports.getAllCombos = catchAsync(async (req, res) => {
  const combosWithImages = await MenuService.getAllCombos(req);

  res.status(200).json({
    status: 'success',
    results: combosWithImages.length,
    data: { combos: combosWithImages },
  });
});

exports.getCombo = catchAsync(async (req, res) => {
  const comboWithImage = await MenuService.getCombo(req);

  res.status(200).json({
    status: 'success',
    data: { combo: comboWithImage },
  });
});

exports.updateCombo = catchAsync(async (req, res) => {
  const combo = await MenuService.updateCombo(req);

  res.status(200).json({
    status: 'success',
    data: { combo },
  });
});

exports.updateBranchOverride = catchAsync(async (req, res) => {
  const { combo, message } = await MenuService.updateBranchOverride(req);

  res.status(200).json({
    status: 'success',
    message,
    data: { combo },
  });
});

exports.deleteCombo = catchAsync(async (req, res) => {
  await MenuService.deleteCombo(req);

  res.status(204).json({ status: 'success', data: null });
});

exports.incrementComboSold = catchAsync(async (req, res) => {
  const { comboId, quantity = 1 } = req.body;
  await MenuService.incrementComboSold({ comboId, quantity });

  res.status(200).json({ status: 'success' });
});

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

exports.toggleBranchActive = catchAsync(async (req, res) => {
  const result = await MenuService.toggleBranchActive(req);

  res.status(200).json({
    status: 'success',
    message: result.message,
    data: { isActive: result.isActive },
  });
});
