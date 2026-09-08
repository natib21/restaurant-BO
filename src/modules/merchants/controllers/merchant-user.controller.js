const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const User = require('../../../../models/userModel');
const Role = require('../../../../models/roleModel');
const Merchant = require('../../../../models/merchantModel');
const Branch = require('../../../../models/branchModel');
const { guardAgainstRemovingLastAdmin } = require('../../auth/admin-safety.helper');

/**
 * Whitelist-based field filter — only allows specified fields through.
 * Prevents privilege escalation by blocking sensitive fields.
 */
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

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

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY: Block sensitive fields from being updated via this endpoint.
  // These require dedicated endpoints with explicit authorization and audit trails.
  // ═══════════════════════════════════════════════════════════════════════════
  if (req.body.role !== undefined) {
    return next(
      new AppError(
        'Cannot change role via this endpoint. Role assignments are handled during user creation. ' +
        'To change a user\'s role, contact support or use the dedicated role management endpoint.',
        400
      )
    );
  }

  if (req.body.isActive !== undefined) {
    return next(
      new AppError(
        'Use PATCH /api/v1/merchant/users/:id/activate to reactivate a user, ' +
        'or DELETE /api/v1/merchant/users/:id to deactivate.',
        400
      )
    );
  }

  // Block password and system fields
  if (req.body.password || req.body.passwordConfirm || req.body.merchant || req.body.business) {
    return next(new AppError('Cannot update password or system fields via this route', 400));
  }

  const user = await User.findOne({ _id: id, merchant: merchantId });
  if (!user) return next(new AppError('User not found or does not belong to your merchant', 404));

  // Only allow safe fields: firstName, lastName, email, phone
  const filtered = filterObj(req.body, 'firstName', 'lastName', 'email', 'phone');

  const updatedUser = await User.findByIdAndUpdate(id, filtered, {
    new: true,
    runValidators: true,
  })
    .populate('role', 'name description')
    .select('firstName lastName email phone role isActive');

  res.status(200).json({ status: 'success', data: { user: updatedUser } });
});

exports.deleteMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const user = await User.findOne({ _id: req.params.id, merchant: merchantId });
  if (!user) return next(new AppError('User not found or does not belong to your merchant', 404));

  // Safety check: prevent deactivating the last SUPER-MERCHANT-ADMIN
  try {
    await guardAgainstRemovingLastAdmin(req.params.id, merchantId, null, 'deactivate');
  } catch (error) {
    return next(error);
  }

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

/**
 * PATCH /api/v1/merchant/users/:id/role
 * @description Change an existing user's role.
 * Separate endpoint from updateMerchantUser to allow independent task-based access control.
 * 
 * Safety checks:
 * 1. Reject SUPER-MERCHANT-ADMIN assignments (owner escalation must go through separate flow)
 * 2. Reject if it would remove the last remaining SUPER-MERCHANT-ADMIN (prevent lockout)
 * 
 * @body { role: <roleId> }
 */
exports.changeUserRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;
  const { role: newRoleId } = req.body;

  // Validate role parameter exists
  if (!newRoleId) {
    return next(new AppError('Missing required field: role', 400));
  }

  // Get the user being modified
  const user = await User.findOne({ _id: id, merchant: merchantId });
  if (!user) {
    return next(new AppError('User not found or does not belong to your merchant', 404));
  }

  // Get the new role and validate it belongs to this merchant
  const newRole = await Role.findOne({
    _id: newRoleId,
    merchant: merchantId,
    isActive: true,
    isSystemRole: false,
  });
  if (!newRole) {
    return next(
      new AppError('Invalid role: role does not exist, is inactive, or does not belong to your merchant', 400)
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY CHECK 1: Prevent escalation to SUPER-MERCHANT-ADMIN via this endpoint.
  // Owner role changes should go through a separate, more deliberate flow.
  // ═══════════════════════════════════════════════════════════════════════════
  if (newRole.name === 'SUPER-MERCHANT-ADMIN') {
    return next(
      new AppError(
        'Cannot assign SUPER-MERCHANT-ADMIN role via this endpoint. ' +
        'Owner role assignments require separate authorization. Contact support.',
        403
      )
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY CHECK 2: Prevent removing the last SUPER-MERCHANT-ADMIN.
  // If the user currently has SUPER-MERCHANT-ADMIN and is changing away from it,
  // ensure at least one other SUPER-MERCHANT-ADMIN exists.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    await guardAgainstRemovingLastAdmin(id, merchantId, null, 'change role for');
  } catch (error) {
    return next(error);
  }

  // Update user role
  const updatedUser = await User.findByIdAndUpdate(
    id,
    { role: newRoleId },
    { new: true, runValidators: true }
  )
    .populate('role', 'name description')
    .select('firstName lastName email phone role isActive');

  res.status(200).json({
    status: 'success',
    message: 'User role changed successfully',
    data: { user: updatedUser },
  });
});
