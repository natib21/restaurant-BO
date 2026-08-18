// tests/audit-plugin-ingredient.test.js
// ✅ Test audit plugin on Ingredient model
const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Ingredient = require('../models/Ingredient');
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
    businessName: 'Test Ingredient Restaurant',
    slug: 'test-ingredient-restaurant-audit',
    email: 'ingredient-audit@test.com',
    phone: '+251911555555',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true,
    subscriptionPlan: 'pro',
    owner: {
      fullName: 'Ingredient Test Owner',
      gender: 'Male',
      email: 'ingredientaudit@test.com',
      phone: '+251911555556',
    },
    features: {
      optional: {
        inventory: {
          enabled: true, // Enable inventory feature
        },
      },
    },
  });

  // Create test branch
  branch = await Branch.create({
    name: 'Ingredient Test Branch',
    merchant: merchant._id,
    location: {
      coordinates: [38.7578, 9.0054],
      city: 'Addis Ababa',
    },
    phone: '+251911555557',
    isActive: true,
  });

  // Create admin role with ingredient management tasks
  const Task = require('../models/taskModel');
  const ingredientTasks = await Task.find({
    name: { $in: ['ingredients.list', 'ingredients.create', 'ingredients.update', 'ingredients.read'] },
  });

  adminRole = await Role.create({
    name: 'Ingredient-Admin',
    description: 'Admin role for ingredient testing',
    merchant: merchant._id,
    tasks: ingredientTasks.map(t => t._id),
    isActive: true,
  });

  // Create admin user
  adminUser = await User.create({
    firstName: 'Ingredient',
    lastName: 'Admin',
    email: 'ingredientadmin@test.com',
    phone: '+251911555558',
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
  await Ingredient.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
  await Branch.deleteMany({});
  await Merchant.deleteMany({});
  await disconnectDatabase();
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
  await Ingredient.deleteMany({});
});

describe('Audit Plugin - Ingredient Model', () => {
  describe('CREATE operations', () => {
    it('should log ingredient creation via API', async () => {
      const res = await request(app)
        .post('/api/v1/ingredients')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Tomatoes',
          category: 'vegetables',
          unit: 'kg',
          currentStock: 50,
          minStock: 10,
          maxStock: 100,
          costPerUnit: 25,
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data).toBeDefined();

      const ingredientId = res.body.data.ingredient._id;

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Ingredient',
        resourceId: ingredientId,
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('CREATE');
      expect(log.method).toBe('POST');
      expect(log.user.toString()).toBe(adminUser._id.toString());
      expect(log.merchant.toString()).toBe(merchant._id.toString());
      expect(log.endpoint).toContain('/api/v1/ingredients');
      expect(log.statusCode).toBe(200); // From plugin (post-save)
      expect(log.metadata.wasNew).toBe(true);
    });
  });

  describe('UPDATE operations', () => {
    it('should log ingredient updates with changes array', async () => {
      // Create ingredient first
      const ingredient = await Ingredient.create({
        merchant: merchant._id,
        name: 'Original Carrots',
        category: 'vegetables',
        unit: 'kg',
        currentStock: 30,
        minStock: 10,
        maxStock: 80,
        costPerUnit: 20,
        isActive: true,
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Update via API
      await request(app)
        .patch(`/api/v1/ingredients/${ingredient._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentStock: 45,
          costPerUnit: 22,
          isActive: false,
        })
        .expect(200);

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Ingredient',
        resourceId: ingredient._id,
        action: 'UPDATE',
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('UPDATE');
      expect(log.method).toBe('PATCH');
      expect(log.metadata.wasNew).toBe(false);

      // Verify oldValues
      expect(log.oldValues.currentStock).toBe(30);
      expect(log.oldValues.costPerUnit).toBe(20);
      expect(log.oldValues.isActive).toBe(true);

      // Verify newValues
      expect(log.newValues.currentStock).toBe(45);
      expect(log.newValues.costPerUnit).toBe(22);
      expect(log.newValues.isActive).toBe(false);

      // Verify changes array
      expect(log.changes).toBeDefined();
      const changedFields = log.changes.map(c => c.field);
      expect(changedFields).toContain('currentStock');
      expect(changedFields).toContain('costPerUnit');
      expect(changedFields).toContain('isActive');

      const stockChange = log.changes.find(c => c.field === 'currentStock');
      expect(stockChange.oldValue).toBe(30);
      expect(stockChange.newValue).toBe(45);

      const costChange = log.changes.find(c => c.field === 'costPerUnit');
      expect(costChange.oldValue).toBe(20);
      expect(costChange.newValue).toBe(22);

      const activeChange = log.changes.find(c => c.field === 'isActive');
      expect(activeChange.oldValue).toBe(true);
      expect(activeChange.newValue).toBe(false);
    });

    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => {
      // CREATE
      const createRes = await request(app)
        .post('/api/v1/ingredients')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Onions',
          category: 'vegetables',
          unit: 'kg',
          currentStock: 25,
          minStock: 5,
          maxStock: 60,
          costPerUnit: 15,
        })
        .expect(201);

      const ingredientId = createRes.body.data.ingredient._id;

      // UPDATE
      await request(app)
        .patch(`/api/v1/ingredients/${ingredientId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentStock: 35,
        })
        .expect(200);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch all logs for this ingredient
      const logs = await AuditLog.find({
        resource: 'Ingredient',
        resourceId: ingredientId,
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
      // Create two ingredients with different stock levels
      const ingredient1 = await Ingredient.create({
        merchant: merchant._id,
        name: 'Ingredient 1 Potatoes',
        category: 'vegetables',
        unit: 'kg',
        currentStock: 40,
        minStock: 10,
        maxStock: 80,
        costPerUnit: 18,
      });

      const ingredient2 = await Ingredient.create({
        merchant: merchant._id,
        name: 'Ingredient 2 Rice',
        category: 'grains',
        unit: 'kg',
        currentStock: 100,
        minStock: 20,
        maxStock: 200,
        costPerUnit: 30,
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Fire two concurrent updates (different stock changes)
      await Promise.all([
        request(app)
          .patch(`/api/v1/ingredients/${ingredient1._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ currentStock: 50 }),

        request(app)
          .patch(`/api/v1/ingredients/${ingredient2._id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ currentStock: 120 }),
      ]);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch logs
      const log1 = await AuditLog.findOne({
        resource: 'Ingredient',
        resourceId: ingredient1._id,
        action: 'UPDATE',
      }).lean();

      const log2 = await AuditLog.findOne({
        resource: 'Ingredient',
        resourceId: ingredient2._id,
        action: 'UPDATE',
      }).lean();

      // CRITICAL TEST: Each log should have its own correct oldValue
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();

      // Ingredient 1: currentStock 40 → 50
      expect(log1.oldValues.currentStock).toBe(40);
      expect(log1.newValues.currentStock).toBe(50);

      // Ingredient 2: currentStock 100 → 120
      expect(log2.oldValues.currentStock).toBe(100);
      expect(log2.newValues.currentStock).toBe(120);

      // If Query instances were NOT isolated, these would be wrong
    });
  });
});
