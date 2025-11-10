const Role = require('../models/roleModel');
const AppError = require('../utils/appError');
const ApiFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');

exports.getAllRoles = catchAsync(async (req, res, next) => {
  // Apply filters, pagination, etc.
  const features = new ApiFeatures(Role.find().populate('restaurant').populate('tasks'), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const roles = await features.query;

  res.status(200).json({
    status: 'success',
    results: roles.length,
    data: {
      roles,
    },
  });
});

exports.getRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id).populate('restaurant').populate('tasks');

  if (!role) {
    return next(new AppError('No Role found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { role },
  });
});

exports.createNewRole = catchAsync(async (req, res, next) => {
  const { name, description, tasks, merchant } = req.body;
  const creator = req.user; // from auth middleware

  let finalMerchant = null;

  // 1. SUPER ADMIN (you) → full control
  if (creator.role.name === 'super-admin') {
    finalMerchant = merchant || null; // can set any merchant or null
  }
  // 2. MERCHANT → only their own
  else if (creator.role.name === 'super-merchant-admin') {
    finalMerchant = creator._id; // or creator.merchantId
  } else {
    return next(new AppError('Unauthorized to create roles', 403));
  }

  // Prevent duplicate name per merchant
  const exists = await Role.findOne({ name, merchant: finalMerchant });
  if (exists) {
    return next(new AppError('Role name already exists for this merchant', 400));
  }

  const newRole = await Role.create({
    name,
    description,
    tasks,
    merchant: finalMerchant,
  });

  res.status(201).json({
    status: 'success',
    data: { role: newRole },
  });
});

exports.updateRole = catchAsync(async (req, res, next) => {
  const role = await Role.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!role) {
    return next(new AppError('No Role found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      role,
    },
  });
});

exports.deleteRole = catchAsync(async (req, res, next) => {
  const role = await Role.findByIdAndDelete(req.params.id);

  if (!role) {
    return next(new AppError('No Role found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
