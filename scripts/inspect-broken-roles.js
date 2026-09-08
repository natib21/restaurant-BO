/**
 * Database Inspection Script: Find Broken Roles
 * 
 * Purpose: Identify roles where isSystemRole is false/absent and tasks array is empty/missing.
 * These roles would fail authorization in production.
 * 
 * Run: node scripts/inspect-broken-roles.js
 */

require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const Role = require('../models/roleModel');
const User = require('../models/userModel');

async function inspectBrokenRoles() {
  try {
    // Connect to production database (using LOCAL_DATABASE from config.env)
    const dbUri = process.env.LOCAL_DATABASE || process.env.DATABASE;
    
    if (!dbUri) {
      console.error('❌ No database URI found in environment variables');
      process.exit(1);
    }

    console.log('🔍 Connecting to database...');
    await mongoose.connect(dbUri);
    console.log('✅ Connected successfully\n');

    // Query for broken roles:
    // - isSystemRole is NOT true (false or undefined)
    // - tasks array is empty or missing
    const brokenRoles = await Role.find({
      isSystemRole: { $ne: true },
      $or: [
        { tasks: { $exists: false } },
        { tasks: { $size: 0 } }
      ]
    }).select('name description isSystemRole tasks merchant isActive createdAt');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('BROKEN ROLES ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (brokenRoles.length === 0) {
      console.log('✅ No broken roles found!');
      console.log('All non-system roles have at least one task assigned.\n');
      await mongoose.connection.close();
      return;
    }

    console.log(`⚠️  Found ${brokenRoles.length} broken role(s):\n`);

    // Analyze each broken role
    for (const role of brokenRoles) {
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`Role ID: ${role._id}`);
      console.log(`Name: ${role.name}`);
      console.log(`Description: ${role.description}`);
      console.log(`System Role: ${role.isSystemRole || false}`);
      console.log(`Tasks Count: ${role.tasks?.length || 0}`);
      console.log(`Merchant: ${role.merchant || 'None (system-wide)'}`);
      console.log(`Active: ${role.isActive}`);
      console.log(`Created: ${role.createdAt}`);

      // Check for affected users
      const affectedUsers = await User.find({ 
        role: role._id,
        isActive: true 
      }).select('firstName lastName email merchant isActive');

      console.log(`\n👥 Affected Users: ${affectedUsers.length}`);
      
      if (affectedUsers.length > 0) {
        console.log('   Users currently assigned to this broken role:');
        affectedUsers.forEach((user, idx) => {
          console.log(`   ${idx + 1}. ${user.firstName} ${user.lastName} (${user.email})`);
          console.log(`      - Merchant: ${user.merchant || 'None'}`);
          console.log(`      - Active: ${user.isActive}`);
        });
      } else {
        console.log('   ✅ No active users currently assigned to this role');
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const totalAffectedUsers = await User.countDocuments({
      role: { $in: brokenRoles.map(r => r._id) },
      isActive: true
    });

    console.log(`Total Broken Roles: ${brokenRoles.length}`);
    console.log(`Total Affected Active Users: ${totalAffectedUsers}`);
    
    if (totalAffectedUsers > 0) {
      console.log('\n🚨 LIVE INCIDENT: Active users are assigned to broken roles');
      console.log('   These users cannot access any endpoints (except public routes)');
      console.log('   Action Required: Data repair script + user notification');
    } else {
      console.log('\n⚠️  LATENT BUG: Broken roles exist but no active users affected');
      console.log('   Action Required: Validation fix only (no data repair needed)');
    }

    console.log('\n');

    await mongoose.connection.close();
    console.log('✅ Database connection closed');

  } catch (error) {
    console.error('❌ Error during inspection:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run inspection
inspectBrokenRoles();
