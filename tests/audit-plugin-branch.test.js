// tests/audit-plugin-branch.test.js
// ✅ PHASE 2 - STEP 3: Test audit plugin on Branch model (first real-world application)
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Branch = require('../models/branchModel');
const Merchant = require('../models/merchantModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const AuditLog = require('../models/auditLogModel');
const { AuthService } = require('../src/modules/auth/auth.service');

let app;
let merchant;
let adminUser;
let adminRole;
let token;

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // Create test merchant
  merchant = await Merchant.create({
    businessName: 'Test Restaurant',
    slug: 'test-restaurant-audit',
    email: 'test@restaurant.com',
    phone: '+251911111111',
    status: 'approved',
    owner: {
      fullName: 'Test Owner',
      gender: 'Male',
      email: 'owner@test.com',
      phone: '+251911222333',
    },
  });

  // Create admin role with branch tasks
  const Task = require('../models/taskModel');
  const branchTasks = await Task.find({
    name: { $in: ['branches.create', 'branches.update', 'branches.delete'] },
  });

  adminRole = await Role.create({
    name: 'Admin',
    description: 'Admin role for testing',
    merchant: merchant._id,
    tasks: branchTasks.map(t => t._id),
  });

  // Create admin user
  adminUser = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    name: 'Admin User',
    email: 'admin@test.com',
    phone: '+251911111111',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant._id,
    role: adminRole._id,
    isActive: true,
  });

  token = AuthService.signToken(adminUser);
});

afterAll(async () => {
  await AuditLog.deleteMany({});
  await Branch.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
  await Merchant.deleteMany({});
  await disconnectDatabase();
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
  await Branch.deleteMany({});
});

describe('Audit Plugin - Branch Model', () => {
  describe('CREATE operations', () => {
    it('should log branch creation via API', async () => {
      const res = await request(app)
        .post('/api/v1/branch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Downtown Branch',
          city: 'Addis Ababa',
          location: {
            coordinates: [38.7578, 9.0054], // Addis Ababa
          },
          phone: '+251911223344',
        })
        .expect(201);

      const branchId = res.body.data.branch._id;

      // Give audit log time to be created (setImmediate)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Branch',
        resourceId: branchId,
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('CREATE');
      expect(log.method).toBe('POST');
      expect(log.user.toString()).toBe(adminUser._id.toString());
      expect(log.merchant.toString()).toBe(merchant._id.toString());
      expect(log.endpoint).toContain('/api/v1/branch');
      expect(log.statusCode).toBe(200); // From plugin (post-save)
      expect(log.metadata.wasNew).toBe(true);
    });
  });

  describe('UPDATE operations', () => {
    it('should log branch updates with changes array', async () => {
      // Create branch first
      const branch = await Branch.create({
        name: 'Original Name',
        merchant: merchant._id,
        location: {
          coordinates: [38.7578, 9.0054],
          city: 'Addis Ababa',
        },
        phone: '+251911111111',
        isActive: true,
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Update via API
      await request(app)
        .patch(`/api/v1/branch/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
          phone: '+251922222222',
        })
        .expect(200);

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Branch',
        resourceId: branch._id,
        action: 'UPDATE',
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('UPDATE');
      expect(log.method).toBe('PATCH');
      expect(log.metadata.wasNew).toBe(false);

      // Verify oldValues
      expect(log.oldValues.name).toBe('Original Name');
      expect(log.oldValues.phone).toBe('+251911111111');

      // Verify newValues
      expect(log.newValues.name).toBe('Updated Name');
      expect(log.newValues.phone).toBe('+251922222222');

      // Verify changes array
      expect(log.changes).toBeDefined();
      const changedFields = log.changes.map(c => c.field);
      expect(changedFields).toContain('name');
      expect(changedFields).toContain('phone');

      const nameChange = log.changes.find(c => c.field === 'name');
      expect(nameChange.oldValue).toBe('Original Name');
      expect(nameChange.newValue).toBe('Updated Name');
    });

    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => {
      // CREATE
      const createRes = await request(app)
        .post('/api/v1/branch')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Branch',
          city: 'Addis Ababa',
          location: {
            coordinates: [38.7578, 9.0054],
          },
        })
        .expect(201);

      const branchId = createRes.body.data.branch._id;

      // UPDATE
      await request(app)
        .patch(`/api/v1/branch/${branchId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Branch',
        })
        .expect(200);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 150));

      // Fetch all logs for this branch
      const logs = await AuditLog.find({
        resource: 'Branch',
        resourceId: branchId,
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
      // Create two branches with different values
      const branch1 = await Branch.create({
        name: 'Branch 1',
        merchant: merchant._id,
        location: {
          coordinates: [38.7578, 9.0054],
          city: 'Addis Ababa',
        },
        phone: '+251911111111',
        isActive: true,
      });

      const branch2 = await Branch.create({
        name: 'Branch 2',
        merchant: merchant._id,
        location: {
          coordinates: [38.7578, 9.0054],
          city: 'Addis Ababa',
        },
        phone: '+251922222222',
        isActive: false,
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Fire two concurrent updates
      await Promise.all([
        request(app)
          .patch(`/api/v1/branch/${branch1._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ isActive: false }),

        request(app)
          .patch(`/api/v1/branch/${branch2._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ isActive: true }),
      ]);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 150));

      // Fetch logs
      const log1 = await AuditLog.findOne({
        resource: 'Branch',
        resourceId: branch1._id,
        action: 'UPDATE',
      }).lean();

      const log2 = await AuditLog.findOne({
        resource: 'Branch',
        resourceId: branch2._id,
        action: 'UPDATE',
      }).lean();

      // CRITICAL TEST: Each log should have its own correct oldValue
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();

      // Branch 1: isActive true → false
      expect(log1.oldValues.isActive).toBe(true);
      expect(log1.newValues.isActive).toBe(false);

      // Branch 2: isActive false → true
      expect(log2.oldValues.isActive).toBe(false);
      expect(log2.newValues.isActive).toBe(true);

      // If Query instances were NOT isolated, these would be wrong
      // (e.g., log1.oldValues.isActive would be false from branch2)
    });
  });
});
