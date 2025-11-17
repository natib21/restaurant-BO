// seed/createSuperAdmin.js
const mongoose = require('mongoose');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const dotenv = require('dotenv');
require('../models/taskModel');
const bcrypt = require('bcryptjs');
const {logger} = require('../utils/logger');
dotenv.config({path:'././config.env'})
const SUPER_ADMIN_CONFIG = {
  email: process.env.SUPER_ADMIN_EMAIL || 'admin@system.com',
  password: process.env.SUPER_ADMIN_PASSWORD || 'admin123',
  firstName: 'System',
  lastName: 'Admin',
  phone: '+251900000000',
};

const createSuperAdmin = async () => {
  try {
    const DB = `mongodb+srv://nathnaelzelalem:UZ8NzyORmOcIPUK9@restaurant.k0gc3.mongodb.net/?retryWrites=true&w=majority&appName=Restaurant`;
    const Local_DB = process.env.LOCAL_DATABASE; 
    console.log(Local_DB);

    await mongoose.connect(Local_DB).then(() => {
      logger.info('MongoDB connected successfully!');
    });

    console.log('Connected to database. Seeding super-admin...');

    // 1. Create SUPER-ADMIN role
    const role = await Role.findOneAndUpdate(
      { name: 'SUPER-ADMIN' },
      {
        name: 'SUPER-ADMIN',
        description: 'Full system access. Can manage all merchants, users, and settings.',
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

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_CONFIG.password, 12);

    // 4. Create user
    const superAdmin = await User.create({
      ...SUPER_ADMIN_CONFIG,
      password: hashedPassword,
      role: role._id,
      isActive: true,
    });

    await superAdmin.populate('role');

    console.log('SUPER-ADMIN created successfully!');
    console.log(`   Email: ${SUPER_ADMIN_CONFIG.email}`);
    console.log(`   Password: ${SUPER_ADMIN_CONFIG.password}`);
    console.log(`   Role: SUPER-ADMIN`);
    console.log(`\n   Login at: POST /api/v1/auth/login`);

    process.exit(0);
  } catch (err) {
    console.error('Seeder failed:', err.message);
    process.exit(1);
  }
};

createSuperAdmin();
