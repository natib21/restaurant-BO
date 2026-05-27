/**
 * @file src/modules/roles/role.controller.js
 * @description System-wide role management — SUPER-ADMIN only.
 * No legacy dependency.
 */

const Role       = require('../../../models/roleModel');
const Task       = require('../../../models/taskModel');
const Merchant   = require('../../../models/merchantModel');
const User       = require('../../../models/userModel');
const catchAsync = require('../../../utils/catchAsync');
const AppError   = require('../../../utils/appError');

exports.getAllRoles = catchAsync(async (req, res) => {
  const roles = await Role.find()
    .populate('merchant', 'businessName')
    .populate('tasks', 'name endpoint method description isMerchant');
  res.status(200).json({ status: 'success', results: roles.length, data: { roles } });
});

exports.getRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id)
    .populate('merchant', 'businessName')
    .populate('tasks', 'name endpoint method description');
  if (!role) return next(new AppError('Role not found', 404));
  res.status(200).json({ status: 'success', data: { role } });
});

exports.createRole = catchAsync(async (req, res, next) => {
  const { name, description, tasks, merchant, isSystemRole = false } = req.body;

  if (!name || !description) return next(new AppError('Name and description are required', 400));

  let finalMerchant = null;
  if (merchant) {
    const merchantDoc = await Merchant.findById(merchant);
    if (!merchantDoc) return next(new AppError('Merchant not found', 404));
    finalMerchant = merchant;
  }

  if (tasks?.length) {
    if (!Array.isArray(tasks)) return next(new AppError('Tasks must be an array of IDs', 400));
    const valid = await Task.find({ _id: { $in: tasks } });
    if (valid.length !== tasks.length) return next(new AppError('One or more task IDs are invalid', 400));
  }

  const exists = await Role.findOne({ name: name.toUpperCase(), merchant: finalMerchant || null });
  if (exists) return next(new AppError('Role name already exists', 400));

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

  res.status(201).json({ status: 'success', data: { role: populated } });
});

exports.updateRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id);
  if (!role) return next(new AppError('Role not found', 404));

  const { name, description, tasks, isSystemRole } = req.body;

  if (req.body.merchant !== undefined && req.body.merchant !== role.merchant?.toString()) {
    return next(new AppError('Cannot change role merchant assignment', 400));
  }

  if (name && name.toUpperCase() !== role.name) {
    const conflict = await Role.findOne({
      name: name.toUpperCase(),
      merchant: role.merchant || null,
      _id: { $ne: req.params.id },
    });
    if (conflict) return next(new AppError('Role name already exists', 400));
  }

  if (tasks !== undefined) {
    if (!Array.isArray(tasks)) return next(new AppError('Tasks must be an array', 400));
    const valid = await Task.find({ _id: { $in: tasks } });
    if (valid.length !== tasks.length) return next(new AppError('One or more task IDs are invalid', 400));
  }

  const updated = await Role.findByIdAndUpdate(
    req.params.id,
    {
      ...(name && { name: name.toUpperCase() }),
      ...(description && { description }),
      ...(tasks !== undefined && { tasks }),
      ...(isSystemRole !== undefined && { isSystemRole }),
      ...(req.body.isSubscriptionBased !== undefined && { isSubscriptionBased: req.body.isSubscriptionBased }),
    },
    { new: true, runValidators: true }
  )
    .populate('merchant', 'businessName')
    .populate('tasks');

  res.status(200).json({ status: 'success', data: { role: updated } });
});

exports.deleteRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id);
  if (!role) return next(new AppError('Role not found', 404));

  const inUse = await User.countDocuments({ role: req.params.id });
  if (inUse > 0) return next(new AppError('Cannot delete a role that is assigned to users', 400));

  await Role.findByIdAndDelete(req.params.id);
  res.status(204).json({ status: 'success', data: null });
});
