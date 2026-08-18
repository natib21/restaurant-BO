/**
 * Inspect current RBAC data (roles and tasks) in the database
 */

const mongoose = require('mongoose');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');

async function inspectRBACData() {
  try {
    // Connect using the same DB from config
    const dbUri = process.env.DATABASE || 'mongodb://127.0.0.1:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('✅ Connected to database:', mongoose.connection.name);

    // Get all roles
    const roles = await Role.find({})
      .populate('tasks', 'name endpoint method')
      .lean();
    
    console.log('\n=== ROLES ===');
    console.log(`Total roles: ${roles.length}`);
    roles.forEach(role => {
      console.log(`\nRole: ${role.name}`);
      console.log(`  _id: ${role._id}`);
      console.log(`  isSystemRole: ${role.isSystemRole || false}`);
      console.log(`  tasks: ${role.tasks?.length || 0} tasks`);
      if (role.tasks && role.tasks.length > 0) {
        role.tasks.forEach(task => {
          console.log(`    - ${task.name} (${task.method} ${task.endpoint})`);
        });
      }
    });

    // Get all tasks
    const tasks = await Task.find({}).lean();
    console.log('\n\n=== TASKS ===');
    console.log(`Total tasks: ${tasks.length}`);
    tasks.forEach(task => {
      console.log(`\nTask: ${task.name}`);
      console.log(`  _id: ${task._id}`);
      console.log(`  endpoint: ${task.endpoint}`);
      console.log(`  method: ${task.method}`);
      console.log(`  isMerchant: ${task.isMerchant || false}`);
    });

    // Check if test database exists
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    const testDbExists = dbs.databases.find(db => db.name.includes('test') || db.name.includes('Test'));
    console.log('\n\n=== DATABASE INFO ===');
    console.log(`Current database: ${mongoose.connection.name}`);
    console.log(`Test database exists: ${testDbExists ? testDbExists.name : 'NO'}`);
    console.log('\nAll databases:');
    dbs.databases.forEach(db => {
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

inspectRBACData();
