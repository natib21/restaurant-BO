// tests/audit-plugin-user.test.js
// ✅ Test audit plugin on User model
const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const User = require('../models/userModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Role = require('../models/roleModel');
const AuditLog = require('../models/auditLogModel');
const { AuthService } = require('../src/modules/auth/auth.service');

let app;
let merchant;
let branch;
let adminUser;
let adminRole;
let testRole;
let token;

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // Create test merchant
  merchant = await Merchant.create({
    businessName: 'Test User Restaurant',
    slug: 'test-user-restaurant-audit',
    email: 'users-audit@test.com',
    phone: '+251911666666',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true,
    subscriptionPlan: 'pro',
    owner: {
      fullName: 'User Test Owner',
      gender: 'Male',
      email: 'useraudit@test.com',
      phone: '+251911666667',
    },
  });

  // Create test branch
  branch = await Branch.create({
    name: 'User Test Branch',
    merchant: merchant._id,
    location: {
      coordinates: [38.7578, 9.0054],
      city: 'Addis Ababa',
    },
    phone: '+251911666668',
    isActive: true,
  });

  // Create admin role with user management tasks
  const Task = require('../models/taskModel');
  const userTasks = await Task.find({
    name: { $in: ['merchants.users.create', 'merchants.users.update', 'merchants.users.read'] },
  });

  adminRole = await Role.create({
    name: 'User-Admin',
    description: 'Admin role for user testing',
    merchant: merchant._id,
    tasks: userTasks.map(t => t._id),
    isActive: true,
  });

  // Create test role for assignment to new users
  testRole = await Role.create({
    name: 'Test-Waiter',
    description: 'Test waiter role',
    merchant: merchant._id,
    tasks: [],
    isActive: true,
  });

  // Create admin user
  adminUser = await User.create({
    firstName: 'User',
    lastName: 'Admin',
    email: 'useradmin@test.com',
    phone: '+251911666669',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant._id,
    branch: [branch._id],
    role: adminRole._id,
    isActive: true,
  });

  token = AuthService.signToken(adminUser);
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
  // Don't delete users - we need adminUser throughout the tests
  await User.deleteMany({ _id: { $ne: adminUser._id } });
});

describe('Audit Plugin - User Model', () => {
  describe('CREATE operations', () => {
    it('should log user creation via API', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Test',
          lastName: 'Waiter',
          email: 'testwaiter@test.com',
          phone: '+251911777770',
          password: 'password123',
          role: testRole._id.toString(),
          branch: [branch._id.toString()],
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data).toBeDefined();

      const userId = res.body.data.user._id;

      // Give audit log time to be created (setImmediate + async creation)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'User',
        resourceId: userId,
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('CREATE');
      expect(log.method).toBe('POST');
      expect(log.user.toString()).toBe(adminUser._id.toString());
      expect(log.merchant.toString()).toBe(merchant._id.toString());
      expect(log.endpoint).toContain('/api/v1/merchant/users');
      expect(log.statusCode).toBe(200); // From plugin (post-save)
      expect(log.metadata.wasNew).toBe(true);
    });
  });

  describe('UPDATE operations', () => {
    it('should log user updates with changes array', async () => {
      // Create user first
      const user = await User.create({
        firstName: 'Original',
        lastName: 'User',
        email: 'originaluser@test.com',
        phone: '+251911777771',
        password: 'password123',
        passwordConfirm: 'password123',
        merchant: merchant._id,
        branch: [branch._id],
        role: testRole._id,
        isActive: true,
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Update via API (change email and isActive)
      await request(app)
        .patch(`/api/v1/merchant/users/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'updateduser@test.com',
          isActive: false,
        })
        .expect(200);

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'User',
        resourceId: user._id,
        action: 'UPDATE',
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('UPDATE');
      expect(log.method).toBe('PATCH');
      expect(log.metadata.wasNew).toBe(false);

      // Verify oldValues
      expect(log.oldValues.email).toBe('originaluser@test.com');
      expect(log.oldValues.isActive).toBe(true);

      // Verify newValues
      expect(log.newValues.email).toBe('updateduser@test.com');
      expect(log.newValues.isActive).toBe(false);

      // Verify changes array
      expect(log.changes).toBeDefined();
      const changedFields = log.changes.map(c => c.field);
      expect(changedFields).toContain('email');
      expect(changedFields).toContain('isActive');

      const emailChange = log.changes.find(c => c.field === 'email');
      expect(emailChange.oldValue).toBe('originaluser@test.com');
      expect(emailChange.newValue).toBe('updateduser@test.com');

      const isActiveChange = log.changes.find(c => c.field === 'isActive');
      expect(isActiveChange.oldValue).toBe(true);
      expect(isActiveChange.newValue).toBe(false);
    });

    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => {
      // CREATE
      const createRes = await request(app)
        .post('/api/v1/merchant/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'createupdate@test.com',
          phone: '+251911777772',
          password: 'password123',
          role: testRole._id.toString(),
          branch: [branch._id.toString()],
        })
        .expect(201);

      const userId = createRes.body.data.user._id;

      // UPDATE
      await request(app)
        .patch(`/api/v1/merchant/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          isActive: false,
        })
        .expect(200);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch all logs for this user
      const logs = await AuditLog.find({
        resource: 'User',
        resourceId: userId,
      })
        .sort('createdAt')
        .lean();

      expect(logs).toHaveLength(2);

      // First log should be CREATE
      expect(logs[0].action).toBe('CREATE');
      expect(logs[0].method).toBe('POST');
      expect(logs[0].metadata.wasNew).toBe(true);

      // Second log should be UPDATE
      expect(logs[1].action).toBe('UPDATE');
      expect(logs[1].method).toBe('PATCH');
      expect(logs[1].metadata.wasNew).toBe(false);
    });
  });

  describe('Concurrent UPDATE operations (Query instance isolation test)', () => {
    it('should NOT cross-contaminate oldValues between concurrent updates', async () => {
      // Create two users with different emails
      const user1 = await User.create({
        firstName: 'User',
        lastName: 'One',
        email: 'user1@test.com',
        phone: '+251911777773',
        password: 'password123',
        passwordConfirm: 'password123',
        merchant: merchant._id,
        branch: [branch._id],
        role: testRole._id,
        isActive: true,
      });

      const user2 = await User.create({
        firstName: 'User',
        lastName: 'Two',
        email: 'user2@test.com',
        phone: '+251911777774',
        password: 'password123',
        passwordConfirm: 'password123',
        merchant: merchant._id,
        branch: [branch._id],
        role: testRole._id,
        isActive: true,
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Fire two concurrent updates (different email changes)
      await Promise.all([
        request(app)
          .patch(`/api/v1/merchant/users/${user1._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ email: 'user1-updated@test.com' }),

        request(app)
          .patch(`/api/v1/merchant/users/${user2._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ email: 'user2-updated@test.com' }),
      ]);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch logs
      const log1 = await AuditLog.findOne({
        resource: 'User',
        resourceId: user1._id,
        action: 'UPDATE',
      }).lean();

      const log2 = await AuditLog.findOne({
        resource: 'User',
        resourceId: user2._id,
        action: 'UPDATE',
      }).lean();

      // CRITICAL TEST: Each log should have its own correct oldValue
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();

      // User 1: email user1@test.com → user1-updated@test.com
      expect(log1.oldValues.email).toBe('user1@test.com');
      expect(log1.newValues.email).toBe('user1-updated@test.com');

      // User 2: email user2@test.com → user2-updated@test.com
      expect(log2.oldValues.email).toBe('user2@test.com');
      expect(log2.newValues.email).toBe('user2-updated@test.com');

      // If Query instances were NOT isolated, these would be wrong
      // (e.g., log1.oldValues.email would be 'user2@test.com' from user2)
    });
  });
});
