// seeders/seedAllRealTasksWithCategories.js
require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../models/taskModel'); // Make sure this path is correct

const MONGO_URI = 'mongodb+srv://nathnaelzelalem_db_user:L6iyvT71WT4adq37@cluster0.zuwarje.mongodb.net/?appName=Cluster0';

const tasks = [
  { name: "Increment Combo Sold Count", endpoint: "/api/v1/menuCombo/increment-sold", method: "POST", description: "Internal - track popularity.", isMerchant: false, hidden: false },
  { name: "View Active Combos (Customer)", endpoint: "/api/v1/menuCombo/active/:id", method: "GET", description: "Public endpoint for customers.", isMerchant: false, hidden: false },
  { name: "Delete Combo", endpoint: "/api/v1/menuCombo/:id", method: "DELETE", description: "Permanently delete a combo offer.", isMerchant: true, hidden: false },
  { name: "Get Single Combo", endpoint: "/api/v1/menuCombo/:id", method: "GET", description: "Get details of a specific combo for editing.", isMerchant: true, hidden: false },
  { name: "Update Combo", endpoint: "/api/v1/menuCombo/:id", method: "PATCH", description: "Update combo details.", isMerchant: true, hidden: false },
  { name: "Create Combo", endpoint: "/api/v1/menuCombo", method: "POST", description: "Create a new combo offer.", isMerchant: true, hidden: false },
  { name: "Get All Combos", endpoint: "/api/v1/menuCombo", method: "GET", description: "List all combos.", isMerchant: true, hidden: false },
  { name: "View Merchant User List", endpoint: "/api/v1/merchants/users", method: "GET", description: "List all staff under own merchant", isMerchant: true, hidden: false },
  { name: "Add New Merchant User", endpoint: "/api/v1/merchants/users", method: "POST", description: "Create new staff member", isMerchant: true, hidden: false },
  { name: "Update Merchant User", endpoint: "/api/v1/merchants/users/:id", method: "PATCH", description: "Edit staff details", isMerchant: true, hidden: false },
  { name: "View Merchant User By Id", endpoint: "/api/v1/merchants/users/:id", method: "GET", description: "Get Single Merchant User.", isMerchant: true, hidden: false },
  { name: "Deactivate Merchant User", endpoint: "/api/v1/merchants/users/:id", method: "DELETE", description: "Soft-delete staff", isMerchant: true, hidden: false },
  { name: "Activate Merchant User", endpoint: "/api/v1/merchants/users/:id/activate", method: "PATCH", description: "Activate Merchant User.", isMerchant: true, hidden: false },
  { name: "List All Merchants", endpoint: "/api/v1/merchants", method: "GET", description: "View all merchants (pending, approved, suspended)", isMerchant: false, hidden: false },
  { name: "Update Merchant Profile", endpoint: "/api/v1/merchants/:id", method: "PATCH", description: "Update non-sensitive fields", isMerchant: false, hidden: false },
  { name: "View Merchant Stats", endpoint: "/api/v1/merchants/:id/stats", method: "GET", description: "User count, plan, status", isMerchant: true, hidden: false },
  { name: "Approve Merchant", endpoint: "/api/v1/merchants/:id/approve", method: "PATCH", description: "Approve KYC to merchant goes live in production", isMerchant: false, hidden: false },
  { name: "Suspend Merchant", endpoint: "/api/v1/merchants/:id/suspend", method: "PATCH", description: "Suspend with reason", isMerchant: false, hidden: false },
  { name: "Reactivate Merchant", endpoint: "/api/v1/merchants/:id/activate", method: "PATCH", description: "Reactivate suspended merchant", isMerchant: false, hidden: false },
  { name: "Change Subscription Plan", endpoint: "/api/v1/merchants/subscription", method: "PATCH", description: "Upgrade/downgrade subscription", isMerchant: true, hidden: false },
  { name: "Create Merchant Role", endpoint: "/api/v1/merchants/roles", method: "POST", description: "Create a new merchant role with specific permissions.", isMerchant: true, hidden: false },
  { name: "Get All Merchant Roles", endpoint: "/api/v1/merchants/roles", method: "GET", description: "Retrieve all merchant roles.", isMerchant: true, hidden: false },
  { name: "Get Merchant Role by ID", endpoint: "/api/v1/merchants/roles/:id", method: "GET", description: "Retrieve details of a merchant role.", isMerchant: true, hidden: false },
  { name: "Update Merchant Role", endpoint: "/api/v1/merchants/roles/:id", method: "PUT", description: "Update merchant role.", isMerchant: true, hidden: false },
  { name: "Delete Merchant Role", endpoint: "/api/v1/merchants/roles/:id", method: "DELETE", description: "Delete merchant role.", isMerchant: true, hidden: false },
  { name: "Activate Merchant Role", endpoint: "/api/v1/merchants/roles/:id/activate", method: "PATCH", description: "Activate Merchant Role.", isMerchant: true, hidden: false },
  { name: "KYC Merchant", endpoint: "/api/v1/merchants/kyc", method: "POST", description: "Merchant completes KYC.", isMerchant: true, hidden: false },
  { name: "Create New Menu Item", endpoint: "/api/v1/menu", method: "POST", description: "Creates a new menu item.", isMerchant: true, hidden: false },
  { name: "Get All Menu", endpoint: "/api/v1/menu", method: "GET", description: "Retrieve all menu items.", isMerchant: true, hidden: false },
  { name: "Get Single Menu Item", endpoint: "/api/v1/menu/:id", method: "GET", description: "Retrieve specific menu item.", isMerchant: true, hidden: false },
  { name: "Update Menu Item", endpoint: "/api/v1/menu/:id", method: "PATCH", description: "Update menu item.", isMerchant: true, hidden: false },
  { name: "Delete Menu Item", endpoint: "/api/v1/menu/:id", method: "DELETE", description: "Delete menu item.", isMerchant: true, hidden: false },
  { name: "Get All Menu Groups (Admin)", endpoint: "/api/v1/menuGroup", method: "GET", description: "Retrieve all menu groups.", isMerchant: true, hidden: false },
  { name: "Create Menu Group", endpoint: "/api/v1/menuGroup", method: "POST", description: "Create new menu group.", isMerchant: true, hidden: false },
  { name: "Get Single Menu Group", endpoint: "/api/v1/menuGroup/:id", method: "GET", description: "Get a specific menu group.", isMerchant: true, hidden: false },
  { name: "Update Menu Group", endpoint: "/api/v1/menuGroup/:id", method: "PATCH", description: "Update menu group.", isMerchant: true, hidden: false },
  { name: "Delete Menu Group", endpoint: "/api/v1/menuGroup/:id", method: "DELETE", description: "Delete menu group.", isMerchant: true, hidden: false },
  { name: "Free Table", endpoint: "/api/v1/customerSession/free-table/:id", method: "PATCH", description: "Manually make table free.", isMerchant: true, hidden: false },
  { name: "Assign Tables to Staff", endpoint: "/api/v1/staff-assignments", method: "POST", description: "Assign tables to staff.", isMerchant: true, hidden: false },
  { name: "Get All Staff Assignments (History)", endpoint: "/api/v1/staff-assignments", method: "GET", description: "Retrieve all staff assignments.", isMerchant: true, hidden: false },
  { name: "Get Current Active Assignments", endpoint: "/api/v1/staff-assignments/current", method: "GET", description: "Retrieve active assignments.", isMerchant: true, hidden: false },
  { name: "End Staff Assignment", endpoint: "/api/v1/staff-assignments/:id/end", method: "PATCH", description: "End assignment.", isMerchant: true, hidden: false },
  { name: "Create New Table", endpoint: "/api/v1/table", method: "POST", description: "Create new table.", isMerchant: true, hidden: false },
  { name: "Get All Tables", endpoint: "/api/v1/table", method: "GET", description: "Retrieve all tables.", isMerchant: true, hidden: false },
  { name: "Get Single Table", endpoint: "/api/v1/table/:id", method: "GET", description: "Retrieve specific table.", isMerchant: true, hidden: false },
  { name: "Update Table", endpoint: "/api/v1/table/:id", method: "PATCH", description: "Update table.", isMerchant: true, hidden: false },
  { name: "Delete Table", endpoint: "/api/v1/table/:id", method: "DELETE", description: "Soft delete table.", isMerchant: true, hidden: false },
  { name: "List All Roles", endpoint: "/api/v1/roles", method: "GET", description: "Retrieve all system and merchant roles.", isMerchant: false, hidden: true },
  { name: "Create New Role", endpoint: "/api/v1/roles", method: "POST", description: "Create system or merchant role.", isMerchant: false, hidden: true },
  { name: "View Role Details", endpoint: "/api/v1/roles/:id", method: "GET", description: "Get role details.", isMerchant: false, hidden: true },
  { name: "Update Role", endpoint: "/api/v1/roles/:id", method: "PATCH", description: "Update role.", isMerchant: false, hidden: true },
  { name: "Delete Role", endpoint: "/api/v1/roles/:id", method: "DELETE", description: "Delete role.", isMerchant: false, hidden: true },
  { name: "Create Task", endpoint: "/api/v1/tasks", method: "POST", description: "Create a new task.", isMerchant: false, hidden: true }
];

// Correct IIFE — This is the only one!
(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    await Task.deleteMany({});
    const result = await Task.insertMany(tasks);

    console.log(`Successfully seeded ${result.length} tasks!`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding tasks:', err);
    process.exit(1);
  }
})();