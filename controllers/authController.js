const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const { promisify } = require('util');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE_IN,
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  console.log(req.body);
  const newUser = await User.create(req.body);
  createSendToken(newUser, 201, res);
  /*  const token = signToken(newUser._id);

  res.status(201).json({
    status: 'success',
    token,
    data: {
      user: newUser,
    },
  }); */
});

exports.login = catchAsync(async (req, res, next) => {
  const { name, password } = req.body;

  if (!name || !password) {
    return next(new AppError('Please provide Name or Password', 404));
  }

  const user = await User.findOne({ name }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError('Incorrect name or password', 401));
  createSendToken(user, 200, res);
  /*   const token = signToken(user._id);
  console.log(user);
  res.status(200).json({
    status: 'success',
    token,
  }); */
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in! please log in ', 401));
  }

  // verfiy token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const currentUser = await User.findById(decoded.id);

  if (!currentUser) {
    return next(new AppError('the token does not exist', 401));
  }

  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! pls log in again', 401)
    );
  }

  req.user = currentUser;

  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    console.log(req.user);
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do Not have a permission to perform this action ',
          403
        )
      );
    }
    next();
  };
};

exports.adminResetPassword = catchAsync(async (req, res, next) => {
  const { phone, password, passwordConfirm } = req.body;

  if (!phone || !password || !passwordConfirm) {
    return next(
      new AppError(
        'Please provide phone, password, and password confirmation',
        400
      )
    );
  }

  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  // Find the user to reset password for
  const user = await User.findOne({ phone });

  if (!user) {
    return next(new AppError('No user found with that phone number', 404));
  }

  // Update the user's password
  user.password = password;
  user.passwordConfirm = undefined;

  // Save the updated user document, which should trigger password hashing
  await user.save();

  /*   res.status(200).json({
    status: 'success',
    message: 'Password has been reset successfully!',
  }); */
  createSendToken(user, 200, res);
});

exports.changePassword = catchAsync(async (req, res, next) => {
  const { password, newPassword, confirmNewPassword } = req.body;
  if (!newPassword || !password || !confirmNewPassword) {
    return next(new AppError('Please provide passwords', 404));
  }

  const user = await User.findOne({ name: req.user.id }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect name or password', 401));
  }

  user.password = newPassword;
  user.passwordConfirm = confirmNewPassword;

  await user.save();

  /*   res.status(200).json({
    status: 'success',
    message: 'Password Successfully Changed',
  }); */
  createSendToken(user, 200, res);
});
