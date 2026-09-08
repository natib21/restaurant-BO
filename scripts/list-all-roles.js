/**
 * List All Roles - Complete Overview
 * 
 * Purpose: Show all roles in the database with their task counts for context
 * 
 * Run: node scripts/list-all-roles.js
 */

require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const Role = require('../models/roleModel');
const User = require('../models/userModel');
const Merchant = require('../models/merchantModel');

async function listAllRoles() {
  try {
    const dbUri = process.env.LOCAL_DATABASE || process.env.DATABASE;
    
    if (!dbUri) {
      console.error('❌ No database URI found');
      process.exit(1);
    }

    await mongoose.connect(dbUri);
    
    const roles = await Role.find({})
      .select('name description isSystemRole tasks merchant isActive createdAt')
      .populate('merchant', 'businessName')
      .sort({ isSystemRole: -1, name: 1 });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('ALL ROLES IN DATABASE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (roles.length === 0) {
      console.log('No roles found in database\n');
      await mongoose.connection.close();
      return;
    }

    for (const role of roles) {
      const userCount = await User.countDocuments({ role: role._id, isActive: true });
      
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`Role: ${role.name}`);
      console.log(`Description: ${role.description}`);
      console.log(`System Role: ${role.isSystemRole ? 'Yes' : 'No'}`);
      console.log(`Tasks: ${role.tasks?.length || 0} permissions`);
      console.log(`Merchant: ${role.merchant?.businessName || 'System-wide'}`);
      console.log(`Active: ${role.isActive}`);
      console.log(`Active Users: ${userCount}`);
      console.log(`Status: ${role.isSystemRole || (role.tasks?.length > 0) ? '✅ OK' : '❌ BROKEN (no tasks)'}`);
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total Roles: ${roles.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    await mongoose.connection.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listAllRoles();
