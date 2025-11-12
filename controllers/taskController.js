const Task = require('../models/taskModel');
const Role = require('../models/roleModel'); // Required for the safety check
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// -------------------------------------------------------------------
// 🎯 COMPLETE API TASK LIST (Used for Synchronization)
// This list MUST be synchronized before using the signup function.
// -------------------------------------------------------------------
const allApiTasks = [
  {
    name: 'Search Menu',
    endpoint: '/api/menu/search',
    method: 'GET',
    description: 'Search for menu items',
    isMerchant: true,
  },
  {
    name: 'View Beverages',
    endpoint: '/api/menu/beverage',
    method: 'GET',
    description: 'Retrieve all beverage menu items',
    isMerchant: true,
  },
  {
    name: 'View Appetizers',
    endpoint: '/api/menu/Appetizers',
    method: 'GET',
    description: 'Retrieve all appetizer menu items',
    isMerchant: true,
  },
  {
    name: 'View Specials',
    endpoint: '/api/menu/specials',
    method: 'GET',
    description: 'Retrieve all special menu items',
    isMerchant: true,
  },
  {
    name: 'View Menu',
    endpoint: '/api/menu',
    method: 'GET',
    description: 'Retrieve all menu items',
    isMerchant: true,
  },
  {
    name: 'Create Menu Item',
    endpoint: '/api/menu',
    method: 'POST',
    description: 'Create a new menu item',
    isMerchant: true,
  },
  {
    name: 'View Menu Item',
    endpoint: '/api/menu/:id',
    method: 'GET',
    description: 'Retrieve a specific menu item',
    isMerchant: true,
  },
  {
    name: 'Update Menu Item',
    endpoint: '/api/menu/:id',
    method: 'PATCH',
    description: 'Update a specific menu item',
    isMerchant: true,
  },
  {
    name: 'Delete Menu Item',
    endpoint: '/api/menu/:id',
    method: 'DELETE',
    description: 'Delete a specific menu item',
    isMerchant: true,
  },

  {
    name: 'Submit Merchant KYC',
    endpoint: '/api/merchant/KYC',
    method: 'POST',
    description: 'Submit KYC documents for merchant verification',
    isMerchant: true,
  },
  {
    name: 'View Merchant Users',
    endpoint: '/api/merchant/:id/users',
    method: 'GET',
    description: 'Retrieve all users for a merchant',
    isMerchant: true,
  },
  {
    name: 'Create Merchant User',
    endpoint: '/api/merchant/:id/users',
    method: 'POST',
    description: 'Create a new user for a merchant',
    isMerchant: true,
  },
  {
    name: 'Update Merchant User',
    endpoint: '/api/merchant/:id/users/:userId',
    method: 'PATCH',
    description: 'Update a specific merchant user',
    isMerchant: true,
  },
  {
    name: 'Delete Merchant User',
    endpoint: '/api/merchant/:id/users/:userId',
    method: 'DELETE',
    description: 'Delete a specific merchant user',
    isMerchant: true,
  },
  {
    name: 'Create Merchant',
    endpoint: '/api/merchant',
    method: 'POST',
    description: 'Create a new merchant',
    isMerchant: true,
  },
  {
    name: 'View All Merchants',
    endpoint: '/api/merchant',
    method: 'GET',
    description: 'Retrieve all merchants',
    isMerchant: true,
  },
  {
    name: 'View Merchant',
    endpoint: '/api/merchant/:id',
    method: 'GET',
    description: 'Retrieve a specific merchant',
    isMerchant: true,
  },
  {
    name: 'Update Merchant',
    endpoint: '/api/merchant/:id',
    method: 'PATCH',
    description: 'Update a specific merchant',
    isMerchant: true,
  },
  {
    name: 'Delete Merchant',
    endpoint: '/api/merchant/:id',
    method: 'DELETE',
    description: 'Delete a specific merchant',
    isMerchant: true,
  },
  {
    name: 'Approve Merchant',
    endpoint: '/api/merchant/:id/approve',
    method: 'PATCH',
    description: 'Approve a merchant’s account',
    isMerchant: true,
  },
  {
    name: 'Suspend Merchant',
    endpoint: '/api/merchant/:id/suspend',
    method: 'PATCH',
    description: 'Suspend a merchant’s account',
    isMerchant: true,
  },
  {
    name: 'Activate Merchant',
    endpoint: '/api/merchant/:id/activate',
    method: 'PATCH',
    description: 'Activate a merchant’s account',
    isMerchant: true,
  },
  {
    name: 'Update Merchant Subscription',
    endpoint: '/api/merchant/:id/subscription',
    method: 'PATCH',
    description: 'Update a merchant’s subscription details',
    isMerchant: true,
  },
  {
    name: 'View Merchant Stats',
    endpoint: '/api/merchant/:id/stats',
    method: 'GET',
    description: 'Retrieve statistics for a merchant',
    isMerchant: true,
  },
  {
    name: 'View Orders',
    endpoint: '/api/orders',
    method: 'GET',
    description: 'Retrieve all orders',
    isMerchant: true,
  },
  {
    name: 'Create Order',
    endpoint: '/api/orders',
    method: 'POST',
    description: 'Create a new order',
    isMerchant: true,
  },
  {
    name: 'View Order',
    endpoint: '/api/orders/:id',
    method: 'GET',
    description: 'Retrieve a specific order',
    isMerchant: true,
  },
  {
    name: 'Update Order',
    endpoint: '/api/orders/:id',
    method: 'PATCH',
    description: 'Update a specific order',
    isMerchant: true,
  },
  {
    name: 'Delete Order',
    endpoint: '/api/orders/:id',
    method: 'DELETE',
    description: 'Delete a specific order',
    isMerchant: true,
  },
  {
    name: 'View Roles',
    endpoint: '/api/roles',
    method: 'GET',
    description: 'Retrieve all roles',
    isMerchant: true,
  },
  {
    name: 'Create Role',
    endpoint: '/api/roles',
    method: 'POST',
    description: 'Create a new role',
    isMerchant: true,
  },
  {
    name: 'View Role',
    endpoint: '/api/roles/:id',
    method: 'GET',
    description: 'Retrieve a specific role',
    isMerchant: true,
  },
  {
    name: 'Update Role',
    endpoint: '/api/roles/:id',
    method: 'PATCH',
    description: 'Update a specific role',
    isMerchant: true,
  },
  {
    name: 'Delete Role',
    endpoint: '/api/roles/:id',
    method: 'DELETE',
    description: 'Delete a specific role',
    isMerchant: true,
  },
  {
    name: 'View Tables',
    endpoint: '/api/tables',
    method: 'GET',
    description: 'Retrieve all tables',
    isMerchant: true,
  },
  {
    name: 'Create Table',
    endpoint: '/api/tables',
    method: 'POST',
    description: 'Create a new table',
    isMerchant: true,
  },
  {
    name: 'View Table',
    endpoint: '/api/tables/:id',
    method: 'GET',
    description: 'Retrieve a specific table',
    isMerchant: true,
  },
  {
    name: 'Update Table',
    endpoint: '/api/tables/:id',
    method: 'PATCH',
    description: 'Update a specific table',
    isMerchant: true,
  },
  {
    name: 'Delete Table',
    endpoint: '/api/tables/:id',
    method: 'DELETE',
    description: 'Delete a specific table',
    isMerchant: true,
  },
  {
    name: 'View Tasks',
    endpoint: '/api/tasks',
    method: 'GET',
    description: 'Retrieve all tasks',
    isMerchant: true,
  },
  {
    name: 'Sync Tasks',
    endpoint: '/api/tasks/sync',
    method: 'POST',
    description: 'Synchronize tasks from an API or predefined list',
    isMerchant: true,
  },
  {
    name: 'Create Task',
    endpoint: '/api/tasks',
    method: 'POST',
    description: 'Create a new task',
    isMerchant: true,
  },
  {
    name: 'Update Task',
    endpoint: '/api/tasks/:id',
    method: 'PATCH',
    description: 'Update a specific task',
    isMerchant: true,
  },
  {
    name: 'Delete Task',
    endpoint: '/api/tasks/:id',
    method: 'DELETE',
    description: 'Delete a specific task',
    isMerchant: true,
  },
  {
    name: 'Sign Up User',
    endpoint: '/api/users/signup',
    method: 'POST',
    description: 'Register a new user',
    isMerchant: true,
  },
  {
    name: 'Login User',
    endpoint: '/api/users/login',
    method: 'POST',
    description: 'Authenticate a user and return a JWT',
    isMerchant: true,
  },
  {
    name: 'Admin Reset Password',
    endpoint: '/api/users/adminResetPassword',
    method: 'PATCH',
    description: 'Reset a user’s password by admin',
    isMerchant: true,
  },
  {
    name: 'Change Password',
    endpoint: '/api/users/changePassword',
    method: 'PATCH',
    description: 'Change the logged-in user’s password',
    isMerchant: true,
  },
  {
    name: 'Update My Profile',
    endpoint: '/api/users/updateMe',
    method: 'PATCH',
    description: 'Update the logged-in user’s profile',
    isMerchant: true,
  },
  {
    name: 'Delete My Profile',
    endpoint: '/api/users/deleteMe',
    method: 'DELETE',
    description: 'Delete the logged-in user’s account',
    isMerchant: true,
  },
  {
    name: 'View Users',
    endpoint: '/api/users',
    method: 'GET',
    description: 'Retrieve all users',
    isMerchant: true,
  },
  {
    name: 'Create User',
    endpoint: '/api/users',
    method: 'POST',
    description: 'Create a new user',
    isMerchant: true,
  },
  {
    name: 'View User',
    endpoint: '/api/users/:id',
    method: 'GET',
    description: 'Retrieve a specific user',
    isMerchant: true,
  },
  {
    name: 'Update User',
    endpoint: '/api/users/:id',
    method: 'PATCH',
    description: 'Update a specific user',
    isMerchant: true,
  },
  {
    name: 'Delete User',
    endpoint: '/api/users/:id',
    method: 'DELETE',
    description: 'Delete a specific user',
    isMerchant: true,
  },
];

// -------------------------------------------------------------------
// Task Controllers
// -------------------------------------------------------------------

exports.getAllTasks = catchAsync(async (req, res, next) => {
  const tasks = await Task.find().select('name endpoint method description isMerchant');
  res.status(200).json({
    status: 'success',
    results: tasks.length,
    data: { tasks },
  });
});

// controllers/taskController.js
exports.createTask = catchAsync(async (req, res, next) => {
  const { name, endpoint, method, description, isMerchant } = req.body;

  // 1. Create the task
  const newTask = await Task.create({
    name,
    endpoint,
    method,
    description,
    isMerchant,
  });

  // 2. Find super-admin role
  const superAdminRole = await Role.findOne({ name: 'super-admin' });

  if (superAdminRole) {
    // 3. Add task ID to super-admin's tasks array (if not already there)
    if (!superAdminRole.tasks.includes(newTask._id)) {
      superAdminRole.tasks.push(newTask._id);
      await superAdminRole.save();
    }
  }

  // 4. Return response
  res.status(201).json({
    status: 'success',
    data: { task: newTask },
  });
});
exports.updateTask = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { name, endpoint, method, description, isMerchant } = req.body;
  const task = await Task.findByIdAndUpdate(
    id,
    { name, endpoint, method, description, isMerchant, updatedAt: new Date() },
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

exports.deleteTask = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const task = await Task.findById(id);
  if (!task) {
    return next(new AppError('Task not found', 404));
  }
  // Check if task is assigned to any roles
  const roles = await Role.find({ tasks: id });
  if (roles.length > 0) {
    return next(new AppError('Cannot delete task assigned to roles', 400));
  }
  await Task.findByIdAndDelete(id);
  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.syncTasks = catchAsync(async (req, res, next) => {
  // Step 1: Get all existing endpoints + methods from DB
  const existingTasks = await Task.find().select('endpoint method');
  const existingKeys = new Set(existingTasks.map(t => `${t.endpoint}|${t.method}`));

  // Step 2: Filter only tasks that don't exist yet
  const newTasks = allApiTasks.filter(task => {
    const key = `${task.endpoint}|${task.method}`;
    return !existingKeys.has(key);
  });

  // Step 3: Insert only the missing ones (if any)
  let insertedCount = 0;
  if (newTasks.length > 0) {
    const result = await Task.insertMany(
      newTasks.map(task => ({
        ...task,
        description: task.description || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    insertedCount = result.length;
  }

  // Step 4: Final count
  const totalCount = await Task.countDocuments({});

  res.status(200).json({
    status: 'success',
    message: 'Sync completed: only missing tasks were added.',
    data: {
      addedCount: insertedCount,
      skippedCount: allApiTasks.length - insertedCount,
      totalTasksInDB: totalCount,
    },
  });
});

exports.deleteAllTasks = catchAsync(async (req, res, next) => {
  const result = await Task.deleteMany({});

  res.status(200).json({
    status: 'success',
    message: 'All tasks have been deleted successfully.',
    deletedCount: result.deletedCount,
  });
});
