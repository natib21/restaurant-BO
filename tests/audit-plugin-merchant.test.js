// tests/audit-plugin-merchant.test.js
// ✅ PHASE 2 - STEP 3: Test audit plugin on Merchant model
const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Merchant = require('../models/merchantModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const AuditLog = require('../models/auditLogModel');
const { AuthService } = require('../src/modules/auth/auth.service');

let app;
let superAdminUser;
let superAdminRole;
let token;

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // Create SUPER-ADMIN role (system-wide merchant operations)
  superAdminRole = await Role.create({
    name: 'SUPER-ADMIN',
    description: 'System admin for testing',
    isSystemRole: true,
    tasks: [],
  });

  // Create super admin user (no merchant affiliation needed for system-wide ops)
  superAdminUser = await User.create({
    firstName: 'Super',
    lastName: 'Admin',
    name: 'Super Admin',
    email: 'superadmin@test.com',
    phone: '+251911000000',
    password: 'password123',
    passwordConfirm: 'password123',
    role: superAdminRole._id,
    isActive: true,
  });

  token = AuthService.signToken(superAdminUser);
});

afterAll(async () => {
  await AuditLog.deleteMany({});
  await Merchant.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
  await disconnectDatabase();
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
  await Merchant.deleteMany({});
});

describe('Audit Plugin - Merchant Model', () => {
  describe('CREATE operations', () => {
    it('should log merchant creation via API', async () => {
      const res = await request(app)
        .post('/api/v1/merchant')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessName: 'Test Cafe',
          slug: 'test-cafe-audit',
          phone: '+251911111111',
          sector: 'Cafe',
          owner: {
            fullName: 'John Doe',
            gender: 'Male',
            email: 'john@testcafe.com',
            phone: '+251911111112',
          },
        })
        .expect(201);

      const merchantId = res.body.data.merchant._id;

      // Give audit log time to be created (setImmediate)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Merchant',
        resourceId: merchantId,
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('CREATE');
      expect(log.method).toBe('POST');
      expect(log.user.toString()).toBe(superAdminUser._id.toString());
      expect(log.endpoint).toContain('/api/v1/merchant');
      expect(log.statusCode).toBe(200); // From plugin (post-save)
      expect(log.metadata.wasNew).toBe(true);
    });
  });

  describe('UPDATE operations', () => {
    it('should log merchant updates with changes array', async () => {
      // Create merchant first
      const merchant = await Merchant.create({
        businessName: 'Original Restaurant',
        slug: 'original-restaurant',
        phone: '+251911111111',
        status: 'pending',
        mode: 'Test',
        sector: 'Restaurant',
        owner: {
          fullName: 'Owner Name',
          gender: 'Male',
          email: 'owner@original.com',
          phone: '+251911111112',
        },
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Update via API (status is allowed, phone is blocked by service)
      await request(app)
        .patch(`/api/v1/merchant/${merchant._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'approved',
          brandColor: '#FF5733',
        })
        .expect(200);

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Merchant',
        resourceId: merchant._id,
        action: 'UPDATE',
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('UPDATE');
      expect(log.method).toBe('PATCH');
      expect(log.metadata.wasNew).toBe(false);

      // Verify oldValues
      expect(log.oldValues.status).toBe('pending');
      expect(log.oldValues.brandColor).toBe('#1A1A2E'); // Default value

      // Verify newValues
      expect(log.newValues.status).toBe('approved');
      expect(log.newValues.brandColor).toBe('#FF5733');

      // Verify changes array
      expect(log.changes).toBeDefined();
      const changedFields = log.changes.map(c => c.field);
      expect(changedFields).toContain('status');
      expect(changedFields).toContain('brandColor');

      const statusChange = log.changes.find(c => c.field === 'status');
      expect(statusChange.oldValue).toBe('pending');
      expect(statusChange.newValue).toBe('approved');
    });

    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => {
      // CREATE
      const createRes = await request(app)
        .post('/api/v1/merchant')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessName: 'New Merchant',
          slug: 'new-merchant-audit',
          phone: '+251911333333',
          sector: 'Restaurant',
          owner: {
            fullName: 'New Owner',
            gender: 'Female',
            email: 'owner@newmerchant.com',
            phone: '+251911333334',
          },
        })
        .expect(201);

      const merchantId = createRes.body.data.merchant._id;

      // UPDATE
      await request(app)
        .patch(`/api/v1/merchant/${merchantId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'approved',
        })
        .expect(200);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 150));

      // Fetch all logs for this merchant
      const logs = await AuditLog.find({
        resource: 'Merchant',
        resourceId: merchantId,
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
      // Create two merchants with different values
      const merchant1 = await Merchant.create({
        businessName: 'Merchant 1',
        slug: 'merchant-1-audit',
        phone: '+251911111111',
        status: 'pending',
        isActive: true,
        owner: {
          fullName: 'Owner 1',
          gender: 'Male',
          email: 'owner1@test.com',
          phone: '+251911111112',
        },
      });

      const merchant2 = await Merchant.create({
        businessName: 'Merchant 2',
        slug: 'merchant-2-audit',
        phone: '+251922222222',
        status: 'approved',
        isActive: false,
        owner: {
          fullName: 'Owner 2',
          gender: 'Female',
          email: 'owner2@test.com',
          phone: '+251922222223',
        },
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Fire two concurrent updates
      await Promise.all([
        request(app)
          .patch(`/api/v1/merchant/${merchant1._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ isActive: false }),

        request(app)
          .patch(`/api/v1/merchant/${merchant2._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ isActive: true }),
      ]);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 150));

      // Fetch logs
      const log1 = await AuditLog.findOne({
        resource: 'Merchant',
        resourceId: merchant1._id,
        action: 'UPDATE',
      }).lean();

      const log2 = await AuditLog.findOne({
        resource: 'Merchant',
        resourceId: merchant2._id,
        action: 'UPDATE',
      }).lean();

      // CRITICAL TEST: Each log should have its own correct oldValue
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();

      // Merchant 1: isActive true → false
      expect(log1.oldValues.isActive).toBe(true);
      expect(log1.newValues.isActive).toBe(false);

      // Merchant 2: isActive false → true
      expect(log2.oldValues.isActive).toBe(false);
      expect(log2.newValues.isActive).toBe(true);

      // If Query instances were NOT isolated, these would be wrong
      // (e.g., log1.oldValues.isActive would be false from merchant2)
    });
  });
});
