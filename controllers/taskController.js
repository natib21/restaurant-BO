/**
 * @file taskController.js
 * @description Task CRUD + Auto-Assignment
 *              - isMerchant: true → assign to SUPER-MERCHANT-ADMIN
 *              - isMerchant: false → no auto-assign
 */

const Task = require('../models/taskModel');
const Role = require('../models/roleModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// -------------------------------------------------------------------
// ALL API TASKS (for sync)
// -------------------------------------------------------------------
const allApiTasks = [
  /* ... your full list ... */
];

// -------------------------------------------------------------------
// GET ALL TASKS
// -------------------------------------------------------------------
exports.getAllTasks = catchAsync(async (req, res, next) => {
  const tasks = await Task.find().select('name endpoint method description isMerchant');
  res.status(200).json({
    status: 'success',
    results: tasks.length,
    data: { tasks },
  });
});

// -------------------------------------------------------------------
// CREATE TASK + AUTO-ASSIGN TO SUPER-MERCHANT-ADMIN
// -------------------------------------------------------------------
exports.createTask = catchAsync(async (req, res, next) => {
  const { name, endpoint, method, description, isMerchant = true } = req.body;

  // 1. Create task
  const newTask = await Task.create({
    name,
    endpoint,
    method,
    description,
    isMerchant,
  });

  // 2. AUTO-ASSIGN: Only if isMerchant === true
  if (isMerchant) {
    const merchantAdminRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });

    if (merchantAdminRole) {
      // Avoid duplicates
      if (!merchantAdminRole.tasks.includes(newTask._id)) {
        merchantAdminRole.tasks.push(newTask._id);
        await merchantAdminRole.save({ validateBeforeSave: false });
      }
    }
    // Optional: Log if role not found (first-time setup)
    else {
      console.warn('SUPER-MERCHANT-ADMIN role not found. Task created but not assigned.');
    }
  }

  res.status(201).json({
    status: 'success',
    data: { task: newTask },
  });
});

// -------------------------------------------------------------------
// UPDATE TASK
// -------------------------------------------------------------------
exports.updateTask = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;

  const task = await Task.findByIdAndUpdate(
    id,
    { ...updates, updatedAt: new Date() },
    { new: true, runValidators: true }
  );

  if (!task) {
    return next(new AppError('Task not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { task },
  });
});

// -------------------------------------------------------------------
// DELETE TASK (Safe: check role usage)
// -------------------------------------------------------------------
exports.deleteTask = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const task = await Task.findById(id);

  if (!task) {
    return next(new AppError('Task not found', 404));
  }

  // Prevent delete if used in any role
  const rolesInUse = await Role.find({ tasks: id });
  if (rolesInUse.length > 0) {
    return next(new AppError('Cannot delete task assigned to roles', 400));
  }

  await Task.findByIdAndDelete(id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// -------------------------------------------------------------------
// SYNC TASKS (Only add missing + auto-assign)
// -------------------------------------------------------------------
exports.syncTasks = catchAsync(async (req, res, next) => {
  const existingTasks = await Task.find().select('endpoint method');
  const existingKeys = new Set(existingTasks.map(t => `${t.endpoint}|${t.method}`));

  const newTasks = allApiTasks.filter(task => {
    const key = `${task.endpoint}|${task.method}`;
    return !existingKeys.has(key);
  });

  let insertedCount = 0;
  const createdTasks = [];

  if (newTasks.length > 0) {
    const inserted = await Task.insertMany(
      newTasks.map(task => ({
        name: task.name,
        endpoint: task.endpoint,
        method: task.method,
        description: task.description || '',
        isMerchant: task.isMerchant ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    insertedCount = inserted.length;
    createdTasks.push(...inserted);
  }

  // AUTO-ASSIGN: Only merchant tasks to SUPER-MERCHANT-ADMIN
  const merchantAdminRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });
  if (merchantAdminRole && createdTasks.length > 0) {
    const merchantTasks = createdTasks.filter(t => t.isMerchant);
    const newTaskIds = merchantTasks
      .map(t => t._id)
      .filter(id => !merchantAdminRole.tasks.includes(id));

    if (newTaskIds.length > 0) {
      merchantAdminRole.tasks.push(...newTaskIds);
      await merchantAdminRole.save({ validateBeforeSave: false });
    }
  }

  const totalCount = await Task.countDocuments();

  res.status(200).json({
    status: 'success',
    message: 'Sync completed. Missing tasks added and assigned.',
    data: {
      addedCount: insertedCount,
      skippedCount: allApiTasks.length - insertedCount,
      totalTasksInDB: totalCount,
    },
  });
});

// -------------------------------------------------------------------
// DELETE ALL TASKS (Danger Zone)
// -------------------------------------------------------------------
exports.deleteAllTasks = catchAsync(async (req, res, next) => {
  const result = await Task.deleteMany({});
  res.status(200).json({
    status: 'success',
    message: 'All tasks deleted.',
    deletedCount: result.deletedCount,
  });
});

// -------------------------------------------------------------------
// GET ALL MERCHANT TASKS (isMerchant: true)
// -------------------------------------------------------------------
exports.getMerchantTasks = catchAsync(async (req, res, next) => {
  // Filter by isMerchant: true
  const tasks = await Task.find({ isMerchant: true }).select(
    'name endpoint method description isMerchant'
  );

  res.status(200).json({
    status: 'success',
    results: tasks.length,
    data: { tasks },
  });
});
