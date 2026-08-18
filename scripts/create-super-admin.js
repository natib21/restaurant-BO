/**
 * Create Super Admin User
 * 
 * Creates a user with SUPER-ADMIN role
 * 
 * Usage: 
 *   node scripts/create-super-admin.js
 *   node scripts/create-super-admin.js --email admin@example.com --phone +251912345678 --password SecurePass123
 */

const mongoose = require('mongoose');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel'); // Required for Role.populate('tasks')
const Task = require('../models/taskModel'); // Required for Role population

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    email: 'admin@tirusolution.com',
    phone: '+251911111111',
    password: 'Admin@123',
    firstName: 'Super',
    lastName: 'Admin'
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      config.email = args[i + 1];
      i++;
    } else if (args[i] === '--phone' && args[i + 1]) {
      config.phone = args[i + 1];
      i++;
    } else if (args[i] === '--password' && args[i + 1]) {
      config.password = args[i + 1];
      i++;
    } else if (args[i] === '--firstName' && args[i + 1]) {
      config.firstName = args[i + 1];
      i++;
    } else if (args[i] === '--lastName' && args[i + 1]) {
      config.lastName = args[i + 1];
      i++;
    }
  }

  return config;
}

async function createSuperAdmin() {
  try {
    // Connect to production database
    const dbUri = process.env.DATABASE || 'mongodb://127.0.0.1:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('✅ Connected to database:', mongoose.connection.name);

    const config = parseArgs();

    // Find or create SUPER-ADMIN role
    let superAdminRole = await Role.findOne({ name: 'SUPER-ADMIN' });
    
    if (!superAdminRole) {
      console.log('\n⚠️  SUPER-ADMIN role not found. Creating it...');
      superAdminRole = await Role.create({
        name: 'SUPER-ADMIN',
        description: 'System administrator with universal access (bypasses task checking)',
        isSystemRole: true,
        tasks: []
      });
      console.log('✅ SUPER-ADMIN role created');
    } else {
      console.log('✅ Found existing SUPER-ADMIN role');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone: config.phone });
    if (existingUser) {
      console.log('\n⚠️  User with this phone already exists');
      console.log(`User ID: ${existingUser._id}`);
      console.log(`Email: ${existingUser.email}`);
      console.log(`Phone: ${existingUser.phone}`);
      console.log(`Role: ${existingUser.role}`);
      
      // Update to SUPER-ADMIN role
      existingUser.role = superAdminRole._id;
      existingUser.isActive = true;
      await existingUser.save({ validateBeforeSave: false });
      
      console.log(`\n✅ Updated existing user to SUPER-ADMIN role`);
      await mongoose.disconnect();
      return;
    }

    // Create new super admin user
    console.log('\n=== Creating Super Admin User ===');
    console.log(`Email: ${config.email}`);
    console.log(`Phone: ${config.phone}`);
    console.log(`Name: ${config.firstName} ${config.lastName}`);

    const user = await User.create({
      firstName: config.firstName,
      lastName: config.lastName,
      email: config.email,
      phone: config.phone,
      password: config.password,
      passwordConfirm: config.password,
      role: superAdminRole._id,
      isActive: true,
      emailConfirmed: true,
      merchant: null, // Super admin doesn't belong to any merchant
      branch: []
    });

    console.log('\n✅ Super Admin User Created Successfully!');
    console.log('\n=== Login Credentials ===');
    console.log(`Phone: ${user.phone}`);
    console.log(`Email: ${user.email}`);
    console.log(`Password: ${config.password}`);
    console.log(`\n=== User Details ===`);
    console.log(`User ID: ${user._id}`);
    console.log(`Name: ${user.firstName} ${user.lastName}`);
    console.log(`Role: SUPER-ADMIN (ID: ${superAdminRole._id})`);
    console.log(`isSystemRole: ${superAdminRole.isSystemRole}`);
    
    console.log('\n=== Next Steps ===');
    console.log('1. Login using POST /api/v1/auth/login with phone and password');
    console.log('2. You now have full system access (bypasses all RBAC checks)');
    console.log('3. You can manage roles, tasks, merchants, and all system resources');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 11000) {
      console.error('Duplicate key error - user with this email or phone already exists');
    }
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
createSuperAdmin();
