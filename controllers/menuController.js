const Menu = require('../models/menuModel');
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

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

  res.status(200).json({
    status: 'success',
    requestedAt: req.requestTime,
    result: allMenu.length,
    menu: allMenu,
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
  const newMenu = await Menu.create(req.body);
  res.status(201).json({
    status: 'success',
    menu: newMenu,
  });
});

exports.updateMenu = catchAsync(async (req, res, next) => {
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
