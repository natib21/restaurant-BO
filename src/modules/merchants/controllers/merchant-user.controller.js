const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const User = require('../../../../models/userModel');
const Role = require('../../../../models/roleModel');
const Merchant = require('../../../../models/merchantModel');
const Branch = require('../../../../models/branchModel');

exports.createMerchantUser = catchAsync(async (req, res, next) => {
  const merchant = req.user.merchant;
  const merchantId = merchant._id;
  const { firstName, lastName, phone, email, password, role, branch } = req.body;

  const required = { firstName, phone, password, role };
  const missing = Object.keys(required).find(k => !required[k]);
  if (missing) {
    return next(
      new AppError(`Missing required field: ${missing} (firstName, phone, password, role)`, 400)
    );
  }

  const roleDoc = await Role.findOne({
    _id: role,
    merchant: merchantId,
    isActive: true,
    isSystemRole: false,
  });

  if (!roleDoc) {
    return next(
      new AppError(
        'Invalid role: role does not exist, is inactive, or does not belong to your merchant',
        400
      )
    );
  }

  const duplicate = await User.findOne({
    $or: [{ phone }, { email: email?.trim() }].filter(Boolean),
  });
  if (duplicate) {
    return next(new AppError('Phone or email already in use', 400));
  }

  if (branch && Array.isArray(branch) && branch.length > 0) {
    const validBranchCount = await Branch.countDocuments({
      _id: { $in: branch },
      merchant: merchantId,
    });
    if (validBranchCount !== branch.length) {
      return next(new AppError('One or more selected branches are invalid or unauthorized.', 400));
    }
  }

  const newUser = await User.create({
    firstName: firstName.trim(),
    lastName: lastName?.trim(),
    phone: phone.trim(),
    email: email?.trim().toLowerCase(),
    password,
    passwordConfirm: password,
    business: merchant.businessName,
    merchant: merchantId,
    branch: branch || [],
    role: roleDoc._id,
    isActive: true,
  });

  const populated = await User.findById(newUser._id)
    .select('firstName lastName phone email role isActive')
    .populate({ path: 'role', select: 'name description' });

  res.status(201).json({
    status: 'success',
    data: { user: populated },
  });
});

exports.updateMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;
  const { firstName, lastName, email, phone, role, isActive } = req.body;

  const user = await User.findOne({ _id: id, merchant: merchantId });
  if (!user) return next(new AppError('User not found or does not belong to your merchant', 404));

  if (role !== undefined) {
    const roleDoc = await Role.findOne({
      _id: role,
      context: 'merchant',
      restaurant: merchantId,
    });
    if (!roleDoc) return next(new AppError('Invalid role for this merchant', 400));
  }

  const blocked = ['password', 'passwordConfirm', 'restaurant', 'business'];
  if (blocked.some(f => f in req.body)) {
    return next(new AppError('Cannot update sensitive fields via this route', 400));
  }

  const update = { firstName, lastName, email, phone, role, isActive };
  Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

  const updatedUser = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .populate('role', 'name description')
    .select('firstName lastName email phone role isActive');

  res.status(200).json({ status: 'success', data: { user: updatedUser } });
});

exports.deleteMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const user = await User.findOne({ _id: req.params.id, merchant: merchantId });
  if (!user) return next(new AppError('User not found or does not belong to your merchant', 404));

  await User.findByIdAndUpdate(req.params.id, { isActive: false });
  res
    .status(200)
    .json({ status: 'success', message: 'User deactivated and unlinked successfully' });
});

exports.activateMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const user = await User.findById(req.params.id);
  if (!user) return next(new AppError('User not found', 404));

  const wasLinked = [user.merchant, user.business].some(id => String(id) === String(merchantId));
  if (!wasLinked) return next(new AppError('This user was never part of your merchant', 403));
  if (user.isActive) return next(new AppError('User is already active', 400));

  const activatedUser = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true, runValidators: true }
  )
    .populate('role', 'name description')
    .select('firstName lastName email phone role isActive');

  res
    .status(200)
    .json({
      status: 'success',
      message: 'User reactivated successfully',
      data: { user: activatedUser },
    });
});

exports.getMerchantUsers = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const merchant = await Merchant.findById(merchantId)
    .select('businessName')
    .populate({
      path: 'users',
      select: 'firstName lastName email phone role isActive',
      populate: { path: 'role', select: 'name description' },
    })
    .lean();

  if (!merchant) return next(new AppError('Merchant not found', 404));
  res
    .status(200)
    .json({
      status: 'success',
      data: { merchantName: merchant.businessName, users: merchant.users || [] },
    });
});

exports.getMerchantUserById = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const merchant = await Merchant.findById(merchantId)
    .select('businessName')
    .populate({
      path: 'users',
      match: { _id: req.params.id, isActive: true },
      select: 'firstName lastName email phone role isActive',
      populate: { path: 'role', select: 'name description' },
    })
    .lean();

  if (!merchant || !merchant.users?.length)
    return next(new AppError('User not found or not active', 404));
  res
    .status(200)
    .json({
      status: 'success',
      data: { merchantName: merchant.businessName, user: merchant.users[0] },
    });
});

exports.getMerchantUsersByBranch = catchAsync(async (req, res) => {
  const { BranchService } = require('../../branch');
  const { branch, users } = await BranchService.getMerchantUsersByBranch(req);
  res.status(200).json({ status: 'success', results: users.length, data: { branch, users } });
});
