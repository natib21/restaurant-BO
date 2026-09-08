/**
 * @file src/modules/roles/task.controller.js
 * @description Task (RBAC permission unit) management — SUPER-ADMIN only.
 * No legacy dependency.
 */

const Task = require('../../../models/taskModel');
const Role = require('../../../models/roleModel');
const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');

exports.getAllTasks = catchAsync(async (req, res) => {
  const tasks = await Task.find().select('name endpoint method description isMerchant');
  res.status(200).json({ status: 'success', results: tasks.length, data: { tasks } });
});

exports.getMerchantTasks = catchAsync(async (req, res) => {
  const tasks = await Task.find({ isMerchant: true }).select(
    'name endpoint method description isMerchant'
  );
  res.status(200).json({ status: 'success', results: tasks.length, data: { tasks } });
});

exports.createTask = catchAsync(async (req, res) => {
  const { name, endpoint, method, description, isMerchant = true } = req.body;

  const newTask = await Task.create({ name, endpoint, method, description, isMerchant });

  // Auto-assign merchant tasks to SUPER-MERCHANT-ADMIN role
  if (isMerchant) {
    const adminRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });
    if (adminRole && !adminRole.tasks.includes(newTask._id)) {
      adminRole.tasks.push(newTask._id);
      await adminRole.save({ validateBeforeSave: false });
    }
  }

  res.status(201).json({ status: 'success', data: { task: newTask } });
});

exports.updateTask = catchAsync(async (req, res, next) => {
  const task = await Task.findByIdAndUpdate(
    req.params.id,
    { ...req.body, updatedAt: new Date() },
    { new: true, runValidators: true }
  );
  if (!task) return next(new AppError('Task not found', 404));
  res.status(200).json({ status: 'success', data: { task } });
});

exports.deleteTask = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id);
  if (!task) return next(new AppError('Task not found', 404));

  const rolesInUse = await Role.find({ tasks: req.params.id });
  if (rolesInUse.length > 0)
    return next(new AppError('Cannot delete a task assigned to roles', 400));

  await Task.findByIdAndDelete(req.params.id);
  res.status(204).json({ status: 'success', data: null });
});

exports.syncTasks = catchAsync(async (req, res) => {
  // Sync is a seeder-level operation — body contains the task list to sync
  const { tasks: taskList = [] } = req.body;

  const existing = await Task.find().select('endpoint method');
  const existingKeys = new Set(existing.map(t => `${t.endpoint}|${t.method}`));

  const newTasks = taskList.filter(t => !existingKeys.has(`${t.endpoint}|${t.method}`));

  let inserted = [];
  if (newTasks.length > 0) {
    inserted = await Task.insertMany(
      newTasks.map(t => ({
        name: t.name,
        endpoint: t.endpoint,
        method: t.method,
        description: t.description || '',
        isMerchant: t.isMerchant ?? true,
      }))
    );
  }

  // Auto-assign merchant tasks to SUPER-MERCHANT-ADMIN
  const adminRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });
  if (adminRole && inserted.length > 0) {
    const merchantTaskIds = inserted.filter(t => t.isMerchant).map(t => t._id);
    const newIds = merchantTaskIds.filter(id => !adminRole.tasks.includes(id));
    if (newIds.length > 0) {
      adminRole.tasks.push(...newIds);
      await adminRole.save({ validateBeforeSave: false });
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Sync completed',
    data: { added: inserted.length, total: await Task.countDocuments() },
  });
});

exports.deleteAllTasks = catchAsync(async (req, res) => {
  const result = await Task.deleteMany({});
  res
    .status(200)
    .json({ status: 'success', message: 'All tasks deleted', deletedCount: result.deletedCount });
});
