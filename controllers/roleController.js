/**
 * @file roleController.js
 * @description SUPER-ADMIN ONLY Role Management
 *              - Full CRUD on ALL roles (system + merchant)
 *              - Works with hard-restricted routes
 */

const Role = require('../models/roleModel');
const Task = require('../models/taskModel');
const Merchant = require('../models/merchantModel'); // for validation
const User = require('../models/userModel'); // for delete check
const AppError = require('../utils/appError');
const ApiFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');

// ===================================================================
// GET ALL ROLES
// ===================================================================
exports.getAllRoles = catchAsync(async (req, res, next) => {
  const features = new ApiFeatures(
    Role.find()
      .populate('merchant', 'businessName')
      .populate('tasks', 'name endpoint method description isMerchant'),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const roles = await features.query;

  res.status(200).json({
    status: 'success',
    results: roles.length,
    data: { roles },
  });
});

// ===================================================================
// GET SINGLE ROLE
// ===================================================================
exports.getRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id)
    .populate('merchant', 'businessName')
    .populate('tasks', 'name target method description');

  if (!role) {
    return next(new AppError('Role not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { role },
  });
});

// ===================================================================
// CREATE ROLE
// ===================================================================
exports.createNewRole = catchAsync(async (req, res, next) => {
  const { name, description, tasks, merchant, isSystemRole = false } = req.body;
  let finalMerchant = null;
  if (merchant) {
    const merchantDoc = await Merchant.findById(merchant);
    if (!merchantDoc) {
      return next(new AppError('Merchant not found', 404));
    }
    finalMerchant = merchant;
  }
  // === 1. Required fields ===
  if (!name || !description) {
    return next(new AppError('Name and description are required', 400));
  }

  // === 2. Validate tasks ===
  if (tasks && tasks.length > 0) {
    if (!Array.isArray(tasks)) {
      return next(new AppError('Tasks must be an array of task IDs', 400));
    }
    const validTasks = await Task.find({ _id: { $in: tasks } });
    if (validTasks.length !== tasks.length) {
      return next(new AppError('One or more task IDs are invalid', 400));
    }
  }

  // === 4. Prevent duplicate name ===
  const duplicateQuery = {
    name: name.toUpperCase(),
    merchant: finalMerchant || null,
  };
  const exists = await Role.findOne(duplicateQuery);
  if (exists) {
    return next(
      new AppError(
        finalMerchant
          ? 'Role name already exists for this merchant'
          : 'System role name already exists',
        400
      )
    );
  }

  // === 5. Create role ===
  const newRole = await Role.create({
    name: name.toUpperCase(),
    description,
    tasks: tasks || [],
    merchant: finalMerchant,
    isSystemRole: !!isSystemRole,
    isSubscriptionBased: req.body.isSubscriptionBased || false,
  });

  const populated = await Role.findById(newRole._id)
    .populate('merchant', 'businessName')
    .populate('tasks', 'name endpoint method description');

  res.status(201).json({
    status: 'success',
    data: { role: populated },
  });
});

// ===================================================================
// UPDATE ROLE
// ===================================================================
exports.updateRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id);
  if (!role) return next(new AppError('Role not found', 404));

  const { name, description, tasks, merchant, isSystemRole } = req.body;

  // === Prevent changing merchant ===
  if (merchant !== undefined && merchant !== null && merchant !== role.merchant?.toString()) {
    return next(new AppError('Cannot change role merchant assignment', 400));
  }

  // === Validate name change ===
  if (name && name.toUpperCase() !== role.name) {
    const conflict = await Role.findOne({
      name: name.toUpperCase(),
      merchant: role.merchant || null,
      _id: { $ne: req.params.id },
    });
    if (conflict) {
      return next(new AppError('Role name already exists', 400));
    }
  }

  // === Validate tasks ===
  if (tasks !== undefined) {
    if (!Array.isArray(tasks)) {
      return next(new AppError('Tasks must be an array', 400));
    }
    const validTasks = await Task.find({ _id: { $in: tasks } });
    if (validTasks.length !== tasks.length) {
      return next(new AppError('One or more task IDs are invalid', 400));
    }
  }

  // === Block dangerous fields ===
  delete req.body.merchant;
  delete req.body.createdAt;

  const updated = await Role.findByIdAndUpdate(
    req.params.id,
    {
      name: name?.toUpperCase(),
      description,
      tasks,
      isSystemRole: isSystemRole !== undefined ? isSystemRole : role.isSystemRole,
      isSubscriptionBased: req.body.isSubscriptionBased,
    },
    { new: true, runValidators: true }
  )
    .populate('merchant', 'businessName')
    .populate('tasks');

  res.status(200).json({
    status: 'success',
    data: { role: updated },
  });
});

// ===================================================================
// DELETE ROLE
// ===================================================================
exports.deleteRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id);
  if (!role) return next(new AppError('Role not found', 404));

  // === Prevent deleting role in use ===
  const inUse = await User.countDocuments({ role: req.params.id });
  if (inUse > 0) {
    return next(new AppError('Cannot delete role assigned to users', 400));
  }

  await Role.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
