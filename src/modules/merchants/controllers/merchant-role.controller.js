const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const Role = require('../../../../models/roleModel');
const Task = require('../../../../models/taskModel');
const User = require('../../../../models/userModel');
const mongoose = require('mongoose');

exports.createMerchantRole = catchAsync(async (req, res, next) => {
  let { name, description, tasks } = req.body;
  const merchantId = req.user.merchant._id;

  if (!name?.trim()) return next(new AppError('Role name is required', 400));
  if (!description?.trim()) return next(new AppError('Role description is required', 400));
  if (!Array.isArray(tasks) || tasks.length === 0) return next(new AppError('At least one task must be assigned to the role', 400));

  name = name.trim().toUpperCase();
  description = description.trim();

  const exists = await Role.findOne({ name, merchant: merchantId });
  if (exists) return next(new AppError('Role name already exists', 400));

  const invalidId = tasks.find(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidId) return next(new AppError(`Invalid task ID: ${invalidId}`, 400));

  const validTasks = await Task.find({ _id: { $in: tasks } });
  if (validTasks.length !== tasks.length) return next(new AppError('One or more tasks do not exist', 400));

  const role = await Role.create({ name, description, tasks, merchant: merchantId, isSystemRole: false, isSubscriptionBased: false });
  const populatedRole = await Role.findById(role._id).populate({ path: 'tasks', select: 'name endpoint method description' });

  res.status(201).json({ status: 'success', data: { role: populatedRole } });
});

exports.getAllMerchantRoles = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const roles = await Role.find({ merchant: merchantId })
    .populate('tasks', 'name endpoint method')
    .select('name description tasks isActive createdAt');

  res.status(200).json({ status: 'success', results: roles.length, data: { roles } });
});

exports.getMerchantRoleById = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const role = await Role.findOne({ _id: req.params.id, merchant: merchantId }).populate('tasks');
  if (!role) return next(new AppError('Role not found', 404));
  res.status(200).json({ status: 'success', data: { role } });
});

exports.updateMerchantRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;
  const { name, description, tasks } = req.body;

  const role = await Role.findOne({ _id: id, merchant: merchantId });
  if (!role) return next(new AppError('Role not found or does not belong to your merchant', 404));
  if (role.isSystemRole) return next(new AppError('Cannot modify system roles', 403));

  delete req.body.merchant;
  delete req.body.isSystemRole;
  delete req.body.isSubscriptionBased;

  if (name) {
    const normalizedName = name.trim().toUpperCase();
    const duplicate = await Role.findOne({ name: normalizedName, merchant: merchantId, _id: { $ne: id } });
    if (duplicate) return next(new AppError('Another role with this name already exists', 400));
    req.body.name = normalizedName;
  }

  if (tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return next(new AppError('Tasks must be a non-empty array', 400));
    const invalidId = tasks.find(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidId) return next(new AppError(`Invalid task ID: ${invalidId}`, 400));
    const validTasks = await Task.find({ _id: { $in: tasks } });
    if (validTasks.length !== tasks.length) return next(new AppError('One or more tasks do not exist', 400));
  }

  const updatedRole = await Role.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
    .populate('tasks', 'name endpoint method description');

  res.status(200).json({ status: 'success', data: { role: updatedRole } });
});

exports.deleteMerchantRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;

  const role = await Role.findOne({ _id: id, merchant: merchantId });
  if (!role) return next(new AppError('Role not found or does not belong to your merchant', 404));
  if (role.isSystemRole) return next(new AppError('Cannot deactivate system roles', 403));

  const inUse = await User.exists({ role: id, isActive: true });
  if (inUse) return next(new AppError('Cannot deactivate role: it is currently assigned to one or more active users', 400));

  await Role.findByIdAndUpdate(id, { isActive: false }, { new: true, runValidators: true });
  res.status(200).json({ status: 'success', message: 'Role deactivated successfully', data: null });
});

exports.activateMerchantRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;

  const role = await Role.findOne({ _id: id, merchant: merchantId, isActive: false });
  if (!role) return next(new AppError('Role not found or already active', 404));
  if (role.isSystemRole) return next(new AppError('System roles cannot be reactivated this way', 403));

  const updated = await Role.findByIdAndUpdate(id, { isActive: true }, { new: true }).populate('tasks');
  res.status(200).json({ status: 'success', message: 'Role reactivated successfully', data: { role: updated } });
});
