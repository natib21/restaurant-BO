const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { getMerchantId, isSuperAdmin } = require('../src/common/utils/tenant-scope');

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

/**
 * List users — tenant-scoped to the caller's merchant.
 * SUPER-ADMIN may list across merchants (platform operations only).
 */
exports.getAllUser = catchAsync(async (req, res, next) => {
  const filter = {};

  if (!isSuperAdmin(req.user)) {
    const merchantId = getMerchantId(req);
    if (!merchantId) {
      return next(new AppError('Merchant context is required', 403));
    }
    filter.merchant = merchantId;
  }

  const users = await User.find(filter).select(
    '-password -passwordConfirm -passwordResetToken -passwordResetTokenExpires'
  );

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users },
  });
});

exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
});

exports.updateMe = catchAsync(async (req, res, next) => {
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError('This is Not for Password update pls use /changePassword route', 400));
  }

  const filterdBody = filterObj(req.body, 'firstName', 'lastName', 'phone');

  const updatedUser = await User.findByIdAndUpdate(req.user.id, filterdBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      updatedUser,
    },
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { isActive: false });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.createNewUser = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};

/**
 * Get user by id — same merchant only (or SUPER-ADMIN).
 */
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

  res.status(200).json({
    status: 'success',
    data: { user },
  });
});

/**
 * Update user — tenant ownership required; role changes blocked here (use merchant admin APIs).
 */
exports.updateUser = catchAsync(async (req, res, next) => {
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError('This is Not for Password update pls use /changePassword route', 400));
  }

  // Block privilege escalation via generic user endpoint
  if (req.body.role || req.body.merchant || req.body.branch || req.body.isActive !== undefined) {
    return next(
      new AppError(
        'Cannot change role, merchant, branch, or active status on this endpoint. Use merchant admin routes.',
        403
      )
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

  const filterdBody = filterObj(req.body, 'firstName', 'lastName', 'email', 'phone');

  const updatedUser = await User.findByIdAndUpdate(existing._id, filterdBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: { updatedUser },
  });
});

/**
 * Deactivate user — same merchant only (or SUPER-ADMIN).
 */
exports.deleteUser = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };

  if (!isSuperAdmin(req.user)) {
    const merchantId = getMerchantId(req);
    if (!merchantId) return next(new AppError('Merchant context is required', 403));
    filter.merchant = merchantId;
  }

  const user = await User.findOneAndUpdate(filter, { isActive: false }, { new: true });

  if (!user) return next(new AppError('No user found with that ID', 404));

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
