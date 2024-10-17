const multer = require('multer');
const Menu = require('../models/menuModel');
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const sharp = require('sharp');

/* const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/img/menu');
  },
  filename: function (req, file, cb) {
    const ext = file.mimetype.split('/')[1];
    cb(null, `menu-${req.body.name}-${Date.now()}.${ext}`);
  },
});
 */

const multerStorage = multer.memoryStorage();
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not An Image! Pls upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});
exports.uploadMenuPhoto = upload.single('image');

exports.resizeMenuPhoto = (req, res, next) => {
  if (!req.file) return next();

  req.file.filename = `menu-${req.body.name}-${Date.now()}.jpeg`;

  sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`uploads/img/menu/${req.file.filename}`);

  next();
};

exports.getAllBeverage = (req, res, next) => {
  req.query.category = 'Beverage';
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

exports.searchMenu = async (req, res, next) => {
  const query = req.query.query;
  if (!query) {
    return next();
  }
  const searchRegex = new RegExp(query, 'i');
  req.query = {
    $or: [{ name: searchRegex }, { description: searchRegex }],
  };

  next();
};

exports.getAllMenu = catchAsync(async (req, res) => {
  const features = new ApiFeatures(Menu.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const allMenu = await features.query;

  const menuWithImages = allMenu.map((menu) => ({
    ...menu.toObject(),
    image: `${req.protocol}://${req.get('host')}/img/menu/${menu.image}`, // Construct URL
  }));

  res.status(200).json({
    status: 'success',
    requestedAt: req.requestTime,
    result: allMenu.length,
    menu: menuWithImages,
  });
});

exports.getMenu = catchAsync(async (req, res, next) => {
  const menu = await Menu.findById(req.params.id);

  if (!menu) {
    return next(new AppError('No Menu item Found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    menu,
  });
});

exports.createNewMenu = catchAsync(async (req, res, next) => {
  if (req.file) {
    req.body.image = req.file.filename;
  }
  console.log(req.body);
  const newMenu = await Menu.create({
    ...req.body,
    image: req.file ? req.file.filename : undefined,
  });
  res.status(201).json({
    status: 'success',
    menu: newMenu,
  });
});

exports.updateMenu = catchAsync(async (req, res, next) => {
  if (req.file) {
    req.body.image = req.file.filename; // Save filename to the 'photo' field
  }
  const menu = await Menu.findByIdAndUpdate(req.params.id, req.body, {
    runValidators: true,
    new: true,
  });
  if (!menu) {
    return next(new AppError('No Menu item Found with that ID', 404));
  }
  res.status(200).json({
    status: 'success',
    menu,
  });
});

exports.deleteMenu = catchAsync(async (req, res, next) => {
  const menu = await Menu.findOneAndDelete(req.params.id);
  if (!menu) {
    return next(new AppError('No Menu item Found with that ID', 404));
  }
  res.status(204).json({
    status: 'success',
    menu: null,
  });
});
