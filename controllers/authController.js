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

exports.signup = catchAsync(async (req, res, next) => {
  console.log(req.body);
  const newUser = await User.create(req.body);

  const token = signToken(newUser._id);

  res.status(201).json({
    status: 'success',
    token,
    data: {
      user: newUser,
    },
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { name, password } = req.body;

  if (!name || !password) {
    return next(new AppError('Please provide Name or Password', 404));
  }

  const user = await User.findOne({ name }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError('Incorrect email or password', 401));

  const token = signToken(user._id);
  console.log(user);
  res.status(200).json({
    status: 'success',
    token,
  });
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
/* 
exports.forgetPassword = catchAsync(async (req, res, next) => {
  // get user based on Phone number
  const user = await User.findOne({ phone: req.body.phone });
  if (!user) {
    return next(new AppError('There is no user with that phone number', 404));
  }
  // Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  //send it to Admin email
}); */

exports.adminResetPassword = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(
      new AppError('You do not have permission to perform this action', 403)
    );
  }

  // Find the user to reset
  const user = await User.findById(req.params.userId); // Assume userId is passed in the request
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  // Update the user's password
  user.password = req.body.newPassword; // New password from admin

  user.passwordConfirm = req.body.newPasswordConfirm; // Validate confirmation

  await user.save(); // Save the updated user document

  res.status(200).json({
    status: 'success',
    message: 'Password has been reset successfully!',
  });
});
