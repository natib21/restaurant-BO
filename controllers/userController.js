const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.getAllUser = catchAsync(async (req, res, next) => {
  const users = await User.find();

  // if (!allUsers) return next(new AppError(''));

  res.status(200).json({
    status: 'success',
    message: users.length,
    data: users,
  });
});
exports.createNewUser = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
exports.getUser = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
exports.updateUser = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
exports.deleteUser = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
