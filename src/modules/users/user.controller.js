/**
 * @file src/modules/users/user.controller.js
 * @description User self-service and admin management.
 * All business logic is inline here — no legacy dependency.
 */

const User = require('../../../models/userModel');
const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');
const { getMerchantId, isSuperAdmin } = require('../../common/utils/tenant-scope');

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

// GET /api/v1/users
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const filter = {};
  if (!isSuperAdmin(req.user)) {
    const merchantId = getMerchantId(req);
    if (!merchantId) return next(new AppError('Merchant context is required', 403));
    filter.merchant = merchantId;
  }

  const users = await User.find(filter).select(
    '-password -passwordConfirm -passwordResetToken -passwordResetTokenExpires'
  );

  res.status(200).json({ status: 'success', results: users.length, data: { users } });
});

// GET /api/v1/users/me
exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({ status: 'success', data: { user: req.user } });
});

// PATCH /api/v1/users/me
exports.updateMe = catchAsync(async (req, res, next) => {
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError('Use /auth/change-password to update your password.', 400));
  }
  const filtered = filterObj(req.body, 'firstName', 'lastName', 'phone');
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filtered, {
    new: true,
    runValidators: true,
  });
  res.status(200).json({ status: 'success', data: { user: updatedUser } });
});

// DELETE /api/v1/users/me
exports.deleteMe = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { isActive: false });
  res.status(204).json({ status: 'success', data: null });
});

// POST /api/v1/users  — not supported; use /merchants/users
exports.createUser = (_req, res) => {
  res.status(405).json({
    status: 'error',
    message: 'Use POST /api/v1/merchants/users to create staff accounts.',
  });
};

// GET /api/v1/users/:id
exports.getUser = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (!isSuperAdmin(req.user)) {
    const merchantId = getMerchantId(req);
    if (!merchantId) return next(new AppError('Merchant context is required', 403));
    filter.merchant = merchantId;
  }
  const user = await User.findOne(filter).select(
    '-password -passwordConfirm -passwordResetToken'
  );
  if (!user) return next(new AppError('User not found', 404));
  res.status(200).json({ status: 'success', data: { user } });
});

// PATCH /api/v1/users/:id
exports.updateUser = catchAsync(async (req, res, next) => {
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError('Use /auth/change-password to update passwords.', 400));
  }
  if (req.body.role || req.body.merchant || req.body.branch || req.body.isActive !== undefined) {
    return next(
      new AppError('Use /api/v1/merchants/users/:id to change role, branch, or status.', 403)
    );
  }
  const filter = { _id: req.params.id };
  if (!isSuperAdmin(req.user)) {
    const merchantId = getMerchantId(req);
    if (!merchantId) return next(new AppError('Merchant context is required', 403));
    filter.merchant = merchantId;
  }
  const existing = await User.findOne(filter);
  if (!existing) return next(new AppError('User not found', 404));

  const filtered = filterObj(req.body, 'firstName', 'lastName', 'email', 'phone');
  const updatedUser = await User.findByIdAndUpdate(existing._id, filtered, {
    new: true,
    runValidators: true,
  });
  res.status(200).json({ status: 'success', data: { user: updatedUser } });
});

// DELETE /api/v1/users/:id
exports.deleteUser = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (!isSuperAdmin(req.user)) {
    const merchantId = getMerchantId(req);
    if (!merchantId) return next(new AppError('Merchant context is required', 403));
    filter.merchant = merchantId;
  }
  const user = await User.findOneAndUpdate(filter, { isActive: false }, { new: true });
  if (!user) return next(new AppError('User not found', 404));
  res.status(204).json({ status: 'success', data: null });
});
