const mongoose = require('mongoose');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const dotenv = require('dotenv');
require('../models/taskModel');
const { logger } = require('../utils/logger');

// Ensure path to config is correct relative to the file location
dotenv.config({ path: './config.env' }); 

const SUPER_ADMIN_CONFIG = {
  email: process.env.SUPER_ADMIN_EMAIL || 'admin@system.com',
  password: process.env.SUPER_ADMIN_PASSWORD || 'admin123',
  passwordConfirm: process.env.SUPER_ADMIN_PASSWORD || 'admin123',
  firstName: 'System',
  lastName: 'Admin',
  phone: '+251900000000',
};

const createSuperAdmin = async () => {
  try {
    const Local_DB = process.env.LOCAL_DATABASE;
    
    await mongoose.connect(Local_DB);
    logger.info('MongoDB connected successfully!');

    // 1. Create SUPER-ADMIN role
    const role = await Role.findOneAndUpdate(
      { name: 'SUPER-ADMIN' },
      {
        name: 'SUPER-ADMIN',
        description: 'Full system access.',
        isSystemRole: true,
        tasks: [],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 2. Check if user exists
    const existing = await User.findOne({ email: SUPER_ADMIN_CONFIG.email });
    if (existing) {
      console.log(`Super admin already exists: ${SUPER_ADMIN_CONFIG.email}`);
      process.exit(0);
    }

    // 3. Create user (Mongoose pre-save hook handles hashing automatically)
    await User.create({
      firstName: SUPER_ADMIN_CONFIG.firstName,
      lastName: SUPER_ADMIN_CONFIG.lastName,
      email: SUPER_ADMIN_CONFIG.email,
      phone: SUPER_ADMIN_CONFIG.phone,
      password: SUPER_ADMIN_CONFIG.password,         // Raw
      passwordConfirm: SUPER_ADMIN_CONFIG.password, // Raw (matches password for validation)
      role: role._id,
      isActive: true,
    });

    console.log('SUPER-ADMIN created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeder failed:', err.message);
    process.exit(1);
  }
};

createSuperAdmin();