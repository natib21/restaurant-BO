const Task = require('../models/taskModel');
const Role = require('../models/roleModel'); // Required for the safety check
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');


// -------------------------------------------------------------------
// 🎯 COMPLETE API TASK LIST (Used for Synchronization)
// This list MUST be synchronized before using the signup function.
// -------------------------------------------------------------------
[
  { "name": "Search Menu", "endpoint": "/api/v1/menus/search", "method": "GET", "description": "Search for menu items", "isMerchant": true },
  { "name": "View Beverages", "endpoint": "/api/v1/menus/beverages", "method": "GET", "description": "Retrieve all beverage menu items", "isMerchant": true },
  { "name": "View Appetizers", "endpoint": "/api/v1/menus/appetizers", "method": "GET", "description": "Retrieve all appetizer menu items", "isMerchant": true },
  { "name": "View Specials", "endpoint": "/api/v1/menus/specials", "method": "GET", "description": "Retrieve all special menu items", "isMerchant": true },
  { "name": "View Merchant Menus", "endpoint": "/api/v1/menus", "method": "GET", "description": "Retrieve all menus for the merchant", "isMerchant": true },
  { "name": "Create Menu Item", "endpoint": "/api/v1/menus", "method": "POST", "description": "Create a new menu item", "isMerchant": true },
  { "name": "View Menu Item", "endpoint": "/api/v1/menus/:id", "method": "GET", "description": "Retrieve a specific menu item", "isMerchant": true },
  { "name": "Update Menu Item", "endpoint": "/api/v1/menus/:id", "method": "PATCH", "description": "Update a specific menu item", "isMerchant": true },
  { "name": "Delete Menu Item", "endpoint": "/api/v1/menus/:id", "method": "DELETE", "description": "Delete a specific menu item", "isMerchant": true },
  { "name": "Admin View All Menus", "endpoint": "/api/v1/menus/admin/all", "method": "GET", "description": "Retrieve all menus across all merchants", "isMerchant": false },

  { "name": "Submit Merchant KYC", "endpoint": "/api/v1/merchants/kyc", "method": "POST", "description": "Submit KYC documents for merchant verification", "isMerchant": true },
  { "name": "View Merchant Users", "endpoint": "/api/v1/merchants/:id/users", "method": "GET", "description": "Retrieve all users for a merchant", "isMerchant": true },
  { "name": "Create Merchant User", "endpoint": "/api/v1/merchants/:id/users", "method": "POST", "description": "Create a new user for a merchant", "isMerchant": true },
  { "name": "Update Merchant User", "endpoint": "/api/v1/merchants/:id/users/:userId", "method": "PATCH", "description": "Update a specific merchant user", "isMerchant": true },
  { "name": "Delete Merchant User", "endpoint": "/api/v1/merchants/:id/users/:userId", "method": "DELETE", "description": "Delete a specific merchant user", "isMerchant": true },
  { "name": "Create Merchant", "endpoint": "/api/v1/merchants", "method": "POST", "description": "Create a new merchant", "isMerchant": false },
  { "name": "View All Merchants", "endpoint": "/api/v1/merchants", "method": "GET", "description": "Retrieve all merchants", "isMerchant": false },
  { "name": "View Merchant", "endpoint": "/api/v1/merchants/:id", "method": "GET", "description": "Retrieve a specific merchant", "isMerchant": false },
  { "name": "Update Merchant", "endpoint": "/api/v1/merchants/:id", "method": "PATCH", "description": "Update a specific merchant", "isMerchant": false },
  { "name": "Delete Merchant", "endpoint": "/api/v1/merchants/:id", "method": "DELETE", "description": "Delete a specific merchant", "isMerchant": false },
  { "name": "Approve Merchant", "endpoint": "/api/v1/merchants/:id/approve", "method": "PATCH", "description": "Approve a merchant’s account", "isMerchant": false },
  { "name": "Suspend Merchant", "endpoint": "/api/v1/merchants/:id/suspend", "method": "PATCH", "description": "Suspend a merchant’s account", "isMerchant": false },
  { "name": "Activate Merchant", "endpoint": "/api/v1/merchants/:id/activate", "method": "PATCH", "description": "Activate a merchant’s account", "isMerchant": false },
  { "name": "Update Merchant Subscription", "endpoint": "/api/v1/merchants/:id/subscription", "method": "PATCH", "description": "Update a merchant’s subscription details", "isMerchant": false },
  { "name": "View Merchant Stats", "endpoint": "/api/v1/merchants/:id/stats", "method": "GET", "description": "Retrieve statistics for a merchant", "isMerchant": true },

  { "name": "View Orders", "endpoint": "/api/v1/orders", "method": "GET", "description": "Retrieve all orders for merchant", "isMerchant": true },
  { "name": "Create Order", "endpoint": "/api/v1/orders", "method": "POST", "description": "Create a new order", "isMerchant": true },
  { "name": "View Order", "endpoint": "/api/v1/orders/:id", "method": "GET", "description": "Retrieve a specific order", "isMerchant": true },
  { "name": "Update Order", "endpoint": "/api/v1/orders/:id", "method": "PATCH", "description": "Update a specific order", "isMerchant": true },
  { "name": "Delete Order", "endpoint": "/api/v1/orders/:id", "method": "DELETE", "description": "Delete a specific order", "isMerchant": true },

  { "name": "View Roles", "endpoint": "/api/v1/roles", "method": "GET", "description": "Retrieve all roles", "isMerchant": false },
  { "name": "Create Role", "endpoint": "/api/v1/roles", "method": "POST", "description": "Create a new role", "isMerchant": false },
  { "name": "View Role", "endpoint": "/api/v1/roles/:id", "method": "GET", "description": "Retrieve a specific role", "isMerchant": false },
  { "name": "Update Role", "endpoint": "/api/v1/roles/:id", "method": "PATCH", "description": "Update a specific role", "isMerchant": false },
  { "name": "Delete Role", "endpoint": "/api/v1/roles/:id", "method": "DELETE", "description": "Delete a specific role", "isMerchant": false },

  { "name": "View Tables", "endpoint": "/api/v1/tables", "method": "GET", "description": "Retrieve all tables", "isMerchant": true },
  { "name": "Create Table", "endpoint": "/api/v1/tables", "method": "POST", "description": "Create a new table", "isMerchant": true },
  { "name": "View Table", "endpoint": "/api/v1/tables/:id", "method": "GET", "description": "Retrieve a specific table", "isMerchant": true },
  { "name": "Update Table", "endpoint": "/api/v1/tables/:id", "method": "PATCH", "description": "Update a specific table", "isMerchant": true },
  { "name": "Delete Table", "endpoint": "/api/v1/tables/:id", "method": "DELETE", "description": "Delete a specific table", "isMerchant": true },

  { "name": "View Tasks", "endpoint": "/api/v1/tasks", "method": "GET", "description": "Retrieve all tasks", "isMerchant": false },
  { "name": "Sync Tasks", "endpoint": "/api/v1/tasks/sync", "method": "POST", "description": "Synchronize tasks from API or predefined list", "isMerchant": false },
  { "name": "Create Task", "endpoint": "/api/v1/tasks", "method": "POST", "description": "Create a new task", "isMerchant": false },
  { "name": "Update Task", "endpoint": "/api/v1/tasks/:id", "method": "PATCH", "description": "Update a specific task", "isMerchant": false },
  { "name": "Delete Task", "endpoint": "/api/v1/tasks/:id", "method": "DELETE", "description": "Delete a specific task", "isMerchant": false },

  { "name": "Sign Up User", "endpoint": "/api/v1/users/signup", "method": "POST", "description": "Register a new user", "isMerchant": true },
  { "name": "Login User", "endpoint": "/api/v1/users/login", "method": "POST", "description": "Authenticate a user and return a JWT", "isMerchant": true },
  { "name": "Admin Reset Password", "endpoint": "/api/v1/users/adminResetPassword", "method": "PATCH", "description": "Reset a user’s password by admin", "isMerchant": false },
  { "name": "Change Password", "endpoint": "/api/v1/users/changePassword", "method": "PATCH", "description": "Change the logged-in user’s password", "isMerchant": true },
  { "name": "Update My Profile", "endpoint": "/api/v1/users/updateMe", "method": "PATCH", "description": "Update the logged-in user’s profile", "isMerchant": true },
  { "name": "Delete My Profile", "endpoint": "/api/v1/users/deleteMe", "method": "DELETE", "description": "Delete the logged-in user’s account", "isMerchant": true },
  { "name": "View Users", "endpoint": "/api/v1/users", "method": "GET", "description": "Retrieve all users", "isMerchant": false },
  { "name": "Create User", "endpoint": "/api/v1/users", "method": "POST", "description": "Create a new user", "isMerchant": false },
  { "name": "View User", "endpoint": "/api/v1/users/:id", "method": "GET", "description": "Retrieve a specific user", "isMerchant": false },
  { "name": "Update User", "endpoint": "/api/v1/users/:id", "method": "PATCH", "description": "Update a specific user", "isMerchant": false },
  { "name": "Delete User", "endpoint": "/api/v1/users/:id", "method": "DELETE", "description": "Delete a specific user", "isMerchant": false }
]

// -------------------------------------------------------------------
// Task Controllers
// -------------------------------------------------------------------

exports.getAllTasks = catchAsync(async (req, res, next) => {
    
    if (!req.user.role || req.user.role.name !== 'super-admin') {
        return next(new AppError('You are not authorized to view all tasks', 403));
    }

    const tasks = await Task.find().select('name endpoint method description isMerchant');
    res.status(200).json({
        status: 'success',
        results: tasks.length,
        data: { tasks },
    });
});


exports.getAllMerchantTasks = catchAsync(async(req,res,next)=>{
    if(!req.user.merchant){
        return next(new AppError('you are not a merchant',403))
    }
    const tasks = await Task.find({isMerchant:true}).select('name description method endpoint isMerchant')

     res.status(200).json({
        status: 'success',
        results: tasks.length,
        data: { tasks },
    });
})

exports.createTask = catchAsync(async (req, res, next) => {
    const { name, endpoint, method, description, isMerchant } = req.body;
    if (!name || !endpoint || !method) {
        return next(new AppError('Please provide name, endpoint, and method', 400));
    }
    const task = await Task.create({
        name,
        endpoint,
        method,
        description: description || '',
        isMerchant: isMerchant === true,
        createdAt: new Date(),
    });
    res.status(201).json({
        status: 'success',
        data: { task },
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
    const existingKeys = new Set(
        existingTasks.map(t => `${t.endpoint}|${t.method}`)
    );

    // Step 2: Filter only tasks that don't exist yet
    const newTasks = allApiTasks.filter(task => {
        const key = `${task.endpoint}|${task.method}`;
        return !existingKeys.has(key);
    });

    // Step 3: Insert only the missing ones (if any)
    let insertedCount = 0;
    if (newTasks.length > 0) {
        const result = await Task.insertMany(newTasks.map(task => ({
            ...task,
            description: task.description || '',
            createdAt: new Date(),
            updatedAt: new Date()
        })));
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
            totalTasksInDB: totalCount
        }
    });
});
