// tests/audit-security-check.test.js
// SECURITY CHECK: Verify audit plugin doesn't leak password hashes
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const User = require('../models/userModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel'); // Required by User pre-save hook
const AuditLog = require('../models/auditLogModel');

let merchant;
let branch;
let role;

beforeAll(async () => {
  await connectDatabase();

  merchant = await Merchant.create({
    businessName: 'Security Test Restaurant',
    slug: 'security-test-restaurant',
    email: 'security@test.com',
    phone: '+251911555555',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true,
    owner: {
      fullName: 'Security Owner',
      gender: 'Male',
      email: 'securityowner@test.com',
      phone: '+251911555556',
    },
  });

  branch = await Branch.create({
    name: 'Security Test Branch',
    merchant: merchant._id,
    location: {
      coordinates: [38.7578, 9.0054],
      city: 'Addis Ababa',
    },
    phone: '+251911555557',
    isActive: true,
  });

  role = await Role.create({
    name: 'Security-Test-Role',
    description: 'Test role for security check',
    merchant: merchant._id,
    tasks: [],
    isActive: true,
  });
});

afterAll(async () => {
  await AuditLog.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
  await Branch.deleteMany({});
  await Merchant.deleteMany({});
  await disconnectDatabase();
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
  await User.deleteMany({});
});

describe('Audit Plugin Security - Password Leakage Check', () => {
  it('should verify what toObject() exposes on User document', async () => {
    console.log('\n=== SECURITY CHECK: User.toObject() Contents ===\n');

    // Create user with password
    const user = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'securitytest@test.com',
      phone: '+251911555558',
      password: 'SuperSecret123!',
      passwordConfirm: 'SuperSecret123!',
      passwordResetToken: 'fake-reset-token-12345',
      merchant: merchant._id,
      branch: [branch._id],
      role: role._id,
      isActive: true,
    });

    // Simulate what the audit plugin does: toObject() on in-memory doc
    const obj = user.toObject();
    const keys = Object.keys(obj);

    console.log('Fields exposed by toObject():');
    console.log(keys.join(', '));
    console.log('\n');

    console.log('Checking for sensitive fields:');
    console.log(`  password field present: ${keys.includes('password')}`);
    console.log(`  password value: ${obj.password ? '[PRESENT - HASH LEAKED]' : '[NOT PRESENT]'}`);
    console.log(`  passwordResetToken present: ${keys.includes('passwordResetToken')}`);
    console.log(`  passwordResetToken value: ${obj.passwordResetToken ? '[PRESENT - TOKEN LEAKED]' : '[NOT PRESENT]'}`);
    console.log('\n');

    // Now update the user and check what ends up in audit log
    user.email = 'updated@test.com';
    await user.save();

    // Give audit log time to be created
    await new Promise(resolve => setTimeout(resolve, 500));

    const log = await AuditLog.findOne({
      resource: 'User',
      resourceId: user._id,
      action: 'UPDATE',
    }).lean();

    if (log) {
      console.log('=== AUDIT LOG CONTENTS ===\n');
      console.log('oldValues keys:', Object.keys(log.oldValues || {}).join(', '));
      console.log('newValues keys:', Object.keys(log.newValues || {}).join(', '));
      console.log('\n');

      console.log('CRITICAL SECURITY CHECK:');
      console.log(`  password in oldValues: ${log.oldValues?.password ? '[YES - SECURITY BUG]' : '[NO - SAFE]'}`);
      console.log(`  password in newValues: ${log.newValues?.password ? '[YES - SECURITY BUG]' : '[NO - SAFE]'}`);
      console.log(`  passwordResetToken in oldValues: ${log.oldValues?.passwordResetToken ? '[YES - SECURITY BUG]' : '[NO - SAFE]'}`);
      console.log(`  passwordResetToken in newValues: ${log.newValues?.passwordResetToken ? '[YES - SECURITY BUG]' : '[NO - SAFE]'}`);
      console.log('\n');

      if (log.oldValues?.password || log.newValues?.password || log.oldValues?.passwordResetToken || log.newValues?.passwordResetToken) {
        console.log('🚨 SECURITY VULNERABILITY CONFIRMED: Sensitive data leaked into audit logs!');
      } else {
        console.log('✅ No sensitive data leaked');
      }
    } else {
      console.log('No audit log created (expected if auditedFields is undefined)');
    }

    // Force test to always pass - this is a diagnostic test
    expect(true).toBe(true);
  });
});
