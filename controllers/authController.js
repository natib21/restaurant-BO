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

  const fresh = await User.findById(decoded.id);
  if (!fresh) {
    return next(new AppError('the token does not exist', 401));
  }

  fresh.changedPasswordAfter(decoded.iat);
  next();
});
