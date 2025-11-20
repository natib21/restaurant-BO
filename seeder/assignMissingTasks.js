// seeders/seedAllRealTasksWithCategories.js
require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../models/taskModel');

const MONGO_URI = process.env.DATABASE || 'mongodb+srv://nathnaelzelalem:UZ8NzyORmOcIPUK9@restaurant.k0gc3.mongodb.net/Restaurant?retryWrites=true&w=majority';

const tasks = [
  // System Permissions
  { name: "Create Task", endpoint: "/api/v1/tasks", method: "POST", description: "Create a new task, assignable to roles", isMerchant: false, category: "System Permissions", hidden: true },
  { name: "List All Roles", endpoint: "/api/v1/roles", method: "GET", category: "System Permissions", isMerchant: false,category: "System Permissions", hidden: true },
  { name: "Create New Role", endpoint: "/api/v1/roles", method: "POST", category: "System Permissions", isMerchant: false,category: "System Permissions", hidden: true },
  { name: "View Role Details", endpoint: "/api/v1/roles/:id", method: "GET", category: "System Permissions", isMerchant: false,category: "System Permissions", hidden: true },
  { name: "Update Role", endpoint: "/api/v1/roles/:id", method: "PATCH", category: "System Permissions", isMerchant: false,category: "System Permissions", hidden: true },
  { name: "Delete Role", endpoint: "/api/v1/roles/:id", method: "DELETE", category: "System Permissions", isMerchant: false,category: "System Permissions", hidden: true },

  // Merchant Management (Super Admin)
  { name: "Approve Merchant", endpoint: "/api/v1/merchants/:id/approve", method: "PATCH", isMerchant: false, category: "Merchant Management" },
  { name: "List All Merchants", endpoint: "/api/v1/merchants", method: "GET", isMerchant: false, category: "Merchant Management" },
  { name: "Update Merchant Profile", endpoint: "/api/v1/merchants/:id", method: "PATCH", isMerchant: false, category: "Merchant Management" },
  { name: "Suspend Merchant", endpoint: "/api/v1/merchants/:id/suspend", method: "PATCH", isMerchant: false, category: "Merchant Management" },
  { name: "Reactivate Merchant", endpoint: "/api/v1/merchants/:id/activate", method: "PATCH", isMerchant: false, category: "Merchant Management" },

  // Merchant Profile
  { name: "KYC Merchant", endpoint: "/api/v1/merchants/kyc", method: "POST", isMerchant: true, category: "Merchant Profile" },
  { name: "View Merchant Stats", endpoint: "/api/v1/merchants/:id/stats", method: "GET", isMerchant: true, category: "Merchant Profile" },
  { name: "Change Subscription Plan", endpoint: "/api/v1/merchants/subscription", method: "PATCH", isMerchant: true, category: "Merchant Profile" },

  // Staff Management
  { name: "View Merchant User List", endpoint: "/api/v1/merchants/users", method: "GET", isMerchant: true, category: "Staff Management" },
  { name: "Add New Merchant User", endpoint: "/api/v1/merchants/users", method: "POST", isMerchant: true, category: "Staff Management" },
  { name: "View Merchant User By Id", endpoint: "/api/v1/merchants/users/:id", method: "GET", isMerchant: true, category: "Staff Management" },
  { name: "Update Merchant User", endpoint: "/api/v1/merchants/users/:id", method: "PATCH", isMerchant: true, category: "Staff Management" },
  { name: "Deactivate Merchant User", endpoint: "/api/v1/merchants/users/:id", method: "DELETE", isMerchant: true, category: "Staff Management" },
  { name: "Activate Merchant User", endpoint: "/api/v1/merchants/users/:id/activate", method: "PATCH", isMerchant: true, category: "Staff Management" },

  // Roles & Permissions
  { name: "Get All Merchant Roles", endpoint: "/api/v1/merchants/roles", method: "GET", isMerchant: true, category: "Roles & Permissions" },
  { name: "Create Merchant Role", endpoint: "/api/v1/merchants/roles", method: "POST", isMerchant: true, category: "Roles & Permissions" },
  { name: "Get Merchant Role by ID", endpoint: "/api/v1/merchants/roles/:id", method: "GET", isMerchant: true, category: "Roles & Permissions" },
  { name: "Update Merchant Role", endpoint: "/api/v1/merchants/roles/:id", method: "PUT", isMerchant: true, category: "Roles & Permissions" },
  { name: "Delete Merchant Role", endpoint: "/api/v1/merchants/roles/:id", method: "DELETE", isMerchant: true, category: "Roles & Permissions" },
  { name: "Activate Merchant Role", endpoint: "/api/v1/merchants/roles/:id/activate", method: "PATCH", isMerchant: true, category: "Roles & Permissions" },

  // Menu Management
  { name: "Get All Menu Groups (Admin)", endpoint: "/api/v1/menuGroup", method: "GET", isMerchant: true, category: "Menu Management" },
  { name: "Create Menu Group", endpoint: "/api/v1/menuGroup", method: "POST", isMerchant: true, category: "Menu Management" },
  { name: "Update Menu Group", endpoint: "/api/v1/menuGroup/:id", method: "PATCH", isMerchant: true, category: "Menu Management" },
  { name: "Delete Menu Group", endpoint: "/api/v1/menuGroup/:id", method: "DELETE", isMerchant: true, category: "Menu Management" },
  { name: "Get All Menu", endpoint: "/api/v1/menu", method: "GET", isMerchant: true, category: "Menu Management" },
  { name: "Get Single Menu Item", endpoint: "/api/v1/menu/:id", method: "GET", isMerchant: true, category: "Menu Management" },
  { name: "Create New Menu Item", endpoint: "/api/v1/menu", method: "POST", isMerchant: true, category: "Menu Management" },
  { name: "Update Menu Item", endpoint: "/api/v1/menu/:id", method: "PATCH", isMerchant: true, category: "Menu Management" },
  { name: "Delete Menu Item", endpoint: "/api/v1/menu/:id", method: "DELETE", isMerchant: true, category: "Menu Management" },
];

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected');

    await Task.deleteMany({});
    await Task.insertMany(tasks);

    console.log(`Successfully seeded ${tasks.length} tasks with categories!`);
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
})();