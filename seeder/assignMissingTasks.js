/**
 * @file assignMissingTasks.js
 * @description ONE-TIME SCRIPT
 *              → Finds all tasks where isMerchant: true
 *              → Adds them to SUPER-MERCHANT-ADMIN role (if not already)
 *              → Safe, idempotent, logs results
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const Role = require('../models/roleModel');
const logger = require('../utils/logger')


const MONGO_URI =  `mongodb+srv://nathnaelzelalem:UZ8NzyORmOcIPUK9@restaurant.k0gc3.mongodb.net/?retryWrites=true&w=majority&appName=Restaurant` || 'mongodb://localhost:27017/your-db-name';

async function assignMerchantTasks() {
  try {
    // 1. Connect to DB
     await mongoose.connect(MONGO_URI).then(() => {
      logger.info('MongoDB connected successfully!');
    });

    console.log('Connected to database.');

    // 2. Find SUPER-MERCHANT-ADMIN role
    const merchantAdminRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });
    if (!merchantAdminRole) {
      throw new Error('SUPER-MERCHANT-ADMIN role not found. Create it first.');
    }
    console.log(`Found role: ${merchantAdminRole.name} (ID: ${merchantAdminRole._id})`);

    // 3. Find all tasks where isMerchant: true
    const merchantTasks = await Task.find({ isMerchant: true }).select('_id');
    const taskIds = merchantTasks.map(t => t._id);
    console.log(`Found ${taskIds.length} tasks with isMerchant: true`);

    if (taskIds.length === 0) {
      console.log('No merchant tasks found. Nothing to do.');
      return;
    }

    // 4. Filter out tasks already in the role
    const existingTaskIds = merchantAdminRole.tasks.map(id => id.toString());
    const missingTaskIds = taskIds.filter(
      id => !existingTaskIds.includes(id.toString())
    );

    console.log(`Already assigned: ${existingTaskIds.length}`);
    console.log(`Missing: ${missingTaskIds.length}`);

    if (missingTaskIds.length === 0) {
      console.log('All merchant tasks are already assigned. Done!');
      return;
    }

    // 5. Add missing tasks
    merchantAdminRole.tasks.push(...missingTaskIds);
    await merchantAdminRole.save({ validateBeforeSave: false });

    console.log(`Successfully added ${missingTaskIds.length} tasks to SUPER-MERCHANT-ADMIN`);
    console.log('One-time fix completed!');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}


assignMerchantTasks();