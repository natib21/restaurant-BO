// tests/audit-plugin-menu.test.js
// ✅ Test audit plugin on Menu model
const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Menu = require('../models/menuModel');
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
    businessName: 'Test Menu Restaurant',
    slug: 'test-menu-restaurant-audit',
    email: 'menu-audit@test.com',
    phone: '+251911444444',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true,
    subscriptionPlan: 'pro',
    owner: {
      fullName: 'Menu Test Owner',
      gender: 'Male',
      email: 'menuaudit@test.com',
      phone: '+251911444445',
    },
  });

  // Create test branch
  branch = await Branch.create({
    name: 'Menu Test Branch',
    merchant: merchant._id,
    location: {
      coordinates: [38.7578, 9.0054],
      city: 'Addis Ababa',
    },
    phone: '+251911444446',
    isActive: true,
  });

  // Create admin role with menu management tasks
  const Task = require('../models/taskModel');
  const menuTasks = await Task.find({
    name: { $in: ['menus.create', 'menus.update', 'menus.read'] },
  });

  adminRole = await Role.create({
    name: 'Menu-Admin',
    description: 'Admin role for menu testing',
    merchant: merchant._id,
    tasks: menuTasks.map(t => t._id),
    isActive: true,
  });

  // Create admin user
  adminUser = await User.create({
    firstName: 'Menu',
    lastName: 'Admin',
    email: 'menuadmin@test.com',
    phone: '+251911444447',
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
  await Menu.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
  await Branch.deleteMany({});
  await Merchant.deleteMany({});
  await disconnectDatabase();
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
  await Menu.deleteMany({});
});

describe('Audit Plugin - Menu Model', () => {
  describe('CREATE operations', () => {
    it('should log menu item creation via API', async () => {
      const res = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Burger',
          category: 'Main',
          price: 150,
          type: 'food',
          description: 'Delicious test burger',
          available: true,
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data).toBeDefined();

      const menuId = res.body.data.menu._id;

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Menu',
        resourceId: menuId,
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('CREATE');
      expect(log.method).toBe('POST');
      expect(log.user.toString()).toBe(adminUser._id.toString());
      expect(log.merchant.toString()).toBe(merchant._id.toString());
      expect(log.endpoint).toContain('/api/v1/menu');
      expect(log.statusCode).toBe(200); // From plugin (post-save)
      expect(log.metadata.wasNew).toBe(true);
    });
  });

  describe('UPDATE operations', () => {
    it('should log menu item updates with changes array', async () => {
      // Create menu item first
      const menu = await Menu.create({
        merchant: merchant._id,
        name: 'Original Pizza',
        category: 'Main',
        price: 200,
        type: 'food',
        available: true,
        publishStatus: 'published',
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Update via API
      await request(app)
        .patch(`/api/v1/menu/${menu._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          price: 250,
          available: false,
        })
        .expect(200);

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Menu',
        resourceId: menu._id,
        action: 'UPDATE',
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('UPDATE');
      expect(log.method).toBe('PATCH');
      expect(log.metadata.wasNew).toBe(false);

      // Verify oldValues
      expect(log.oldValues.price).toBe(200);
      expect(log.oldValues.available).toBe(true);

      // Verify newValues
      expect(log.newValues.price).toBe(250);
      expect(log.newValues.available).toBe(false);

      // Verify changes array
      expect(log.changes).toBeDefined();
      const changedFields = log.changes.map(c => c.field);
      expect(changedFields).toContain('price');
      expect(changedFields).toContain('available');

      const priceChange = log.changes.find(c => c.field === 'price');
      expect(priceChange.oldValue).toBe(200);
      expect(priceChange.newValue).toBe(250);

      const availableChange = log.changes.find(c => c.field === 'available');
      expect(availableChange.oldValue).toBe(true);
      expect(availableChange.newValue).toBe(false);
    });

    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => {
      // CREATE
      const createRes = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Pasta',
          category: 'Main',
          price: 180,
          type: 'food',
        })
        .expect(201);

      const menuId = createRes.body.data.menu._id;

      // UPDATE
      await request(app)
        .patch(`/api/v1/menu/${menuId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          price: 200,
        })
        .expect(200);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch all logs for this menu item
      const logs = await AuditLog.find({
        resource: 'Menu',
        resourceId: menuId,
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
      // Create two menu items with different prices
      const menu1 = await Menu.create({
        merchant: merchant._id,
        name: 'Burger Menu 1',
        category: 'Main',
        price: 150,
        type: 'food',
        available: true,
      });

      const menu2 = await Menu.create({
        merchant: merchant._id,
        name: 'Pizza Menu 2',
        category: 'Main',
        price: 250,
        type: 'food',
        available: true,
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Fire two concurrent updates (different price changes)
      await Promise.all([
        request(app)
          .patch(`/api/v1/menu/${menu1._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ price: 175 }),

        request(app)
          .patch(`/api/v1/menu/${menu2._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ price: 300 }),
      ]);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch logs
      const log1 = await AuditLog.findOne({
        resource: 'Menu',
        resourceId: menu1._id,
        action: 'UPDATE',
      }).lean();

      const log2 = await AuditLog.findOne({
        resource: 'Menu',
        resourceId: menu2._id,
        action: 'UPDATE',
      }).lean();

      // CRITICAL TEST: Each log should have its own correct oldValue
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();

      // Menu 1: price 150 → 175
      expect(log1.oldValues.price).toBe(150);
      expect(log1.newValues.price).toBe(175);

      // Menu 2: price 250 → 300
      expect(log2.oldValues.price).toBe(250);
      expect(log2.newValues.price).toBe(300);

      // If Query instances were NOT isolated, these would be wrong
    });
  });
});
