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
  const role = await Role.findById(req.params.id)
    .populate('restaurant')
    .populate('tasks');

  if (!role) {
    return next(new AppError('No Role found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { role },
  });
});


exports.createNewRole = catchAsync(async (req, res, next) => {
  const { description, name, tasks } = req.body;

  // Prevent duplicate role name (optional)
  const existingRole = await Role.findOne({ name });
  if (existingRole) {
    return next(new AppError('Role name already exists', 400));
  }

  const newRole = await Role.create({ description, name, tasks });

  res.status(201).json({
    status: 'success',
    data: {
      role: newRole,
    },
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
