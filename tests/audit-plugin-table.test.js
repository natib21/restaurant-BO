// tests/audit-plugin-table.test.js
// ✅ Test audit plugin on Table model
const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Table = require('../models/tabelModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const AuditLog = require('../models/auditLogModel');
const { AuthService } = require('../src/modules/auth/auth.service');

let app;
let merchant;
let branch;
let adminUser;
let adminRole;
let token;

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // Create test merchant
  merchant = await Merchant.create({
    businessName: 'Test Table Restaurant',
    slug: 'test-table-restaurant-audit',
    email: 'table-audit@test.com',
    phone: '+251911666666',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true,
    subscriptionPlan: 'pro',
    owner: {
      fullName: 'Table Test Owner',
      gender: 'Male',
      email: 'tableaudit@test.com',
      phone: '+251911666667',
    },
  });

  // Create test branch
  branch = await Branch.create({
    name: 'Table Test Branch',
    merchant: merchant._id,
    location: {
      coordinates: [38.7578, 9.0054],
      city: 'Addis Ababa',
    },
    phone: '+251911666668',
    isActive: true,
  });

  // Create admin role with table management tasks
  const Task = require('../models/taskModel');
  const tableTasks = await Task.find({
    name: { $in: ['tables.list', 'tables.create', 'tables.update', 'tables.read'] },
  });

  adminRole = await Role.create({
    name: 'Table-Admin',
    description: 'Admin role for table testing',
    merchant: merchant._id,
    tasks: tableTasks.map(t => t._id),
    isActive: true,
  });

  // Create admin user
  adminUser = await User.create({
    firstName: 'Table',
    lastName: 'Admin',
    email: 'tableadmin@test.com',
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
  await Table.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
  await Branch.deleteMany({});
  await Merchant.deleteMany({});
  await disconnectDatabase();
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
  await Table.deleteMany({});
});

describe('Audit Plugin - Table Model', () => {
  describe('CREATE operations', () => {
    it('should log table creation via direct Mongoose save', async () => {
      // Create table directly via Mongoose (bypasses API complexity)
      const table = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-01',
        capacity: 4,
        status: 'available',
        location: 'indoor',
        section: 'Main',
      });

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Table',
        resourceId: table._id,
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('CREATE');
      expect(log.merchant.toString()).toBe(merchant._id.toString());
      expect(log.metadata.wasNew).toBe(true);
    });
  });

  describe('UPDATE operations', () => {
    it('should log table updates with changes array', async () => {
      // Create table first
      const table = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-02',
        capacity: 4,
        status: 'available',
        location: 'indoor',
        section: 'Main',
        isActive: true,
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Update via API
      await request(app)
        .patch(`/api/v1/table/${table._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          capacity: 6,
          status: 'disabled',
          section: 'VIP',
        })
        .expect(200);

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Table',
        resourceId: table._id,
        action: 'UPDATE',
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('UPDATE');
      expect(log.method).toBe('PATCH');
      expect(log.metadata.wasNew).toBe(false);

      // Verify oldValues
      expect(log.oldValues.capacity).toBe(4);
      expect(log.oldValues.status).toBe('available');
      expect(log.oldValues.section).toBe('Main');

      // Verify newValues
      expect(log.newValues.capacity).toBe(6);
      expect(log.newValues.status).toBe('disabled');
      expect(log.newValues.section).toBe('VIP');

      // Verify changes array
      expect(log.changes).toBeDefined();
      const changedFields = log.changes.map(c => c.field);
      expect(changedFields).toContain('capacity');
      expect(changedFields).toContain('status');
      expect(changedFields).toContain('section');

      const capacityChange = log.changes.find(c => c.field === 'capacity');
      expect(capacityChange.oldValue).toBe(4);
      expect(capacityChange.newValue).toBe(6);

      const statusChange = log.changes.find(c => c.field === 'status');
      expect(statusChange.oldValue).toBe('available');
      expect(statusChange.newValue).toBe('disabled');

      const sectionChange = log.changes.find(c => c.field === 'section');
      expect(sectionChange.oldValue).toBe('Main');
      expect(sectionChange.newValue).toBe('VIP');
    });

    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => {
      // CREATE via Mongoose
      const table = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-03',
        capacity: 2,
        status: 'available',
        location: 'outdoor',
        section: 'Terrace',
      });

      // UPDATE via API
      await request(app)
        .patch(`/api/v1/table/${table._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          capacity: 4,
        })
        .expect(200);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch all logs for this table
      const logs = await AuditLog.find({
        resource: 'Table',
        resourceId: table._id,
      })
        .sort('createdAt')
        .lean();

      expect(logs).toHaveLength(2);

      // First log should be CREATE
      expect(logs[0].action).toBe('CREATE');
      expect(logs[0].metadata.wasNew).toBe(true);

      // Second log should be UPDATE
      expect(logs[1].action).toBe('UPDATE');
      expect(logs[1].method).toBe('PATCH');
      expect(logs[1].metadata.wasNew).toBe(false);
    });
  });

  describe('Concurrent UPDATE operations (Query instance isolation test)', () => {
    it('should NOT cross-contaminate oldValues between concurrent updates', async () => {
      // Create two tables with different capacities
      const table1 = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-10',
        capacity: 4,
        status: 'available',
        location: 'indoor',
        section: 'Main',
      });

      const table2 = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-11',
        capacity: 8,
        status: 'available',
        location: 'outdoor',
        section: 'Terrace',
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Fire two concurrent updates (different capacity changes)
      await Promise.all([
        request(app)
          .patch(`/api/v1/table/${table1._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ capacity: 6 }),

        request(app)
          .patch(`/api/v1/table/${table2._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ capacity: 10 }),
      ]);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch logs
      const log1 = await AuditLog.findOne({
        resource: 'Table',
        resourceId: table1._id,
        action: 'UPDATE',
      }).lean();

      const log2 = await AuditLog.findOne({
        resource: 'Table',
        resourceId: table2._id,
        action: 'UPDATE',
      }).lean();

      // CRITICAL TEST: Each log should have its own correct oldValue
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();

      // Table 1: capacity 4 → 6
      expect(log1.oldValues.capacity).toBe(4);
      expect(log1.newValues.capacity).toBe(6);

      // Table 2: capacity 8 → 10
      expect(log2.oldValues.capacity).toBe(8);
      expect(log2.newValues.capacity).toBe(10);

      // If Query instances were NOT isolated, these would be wrong
    });
  });
});
