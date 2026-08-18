// tests/audit-plugin-order.test.js
// ✅ PHASE 2 - STEP 4: Test audit plugin on Order model
const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Table = require('../models/tabelModel');
const MenuItem = require('../models/menuModel');
const AuditLog = require('../models/auditLogModel');
const { AuthService } = require('../src/modules/auth/auth.service');

let app;
let merchant;
let branch;
let waiterUser;
let waiterRole;
let table;
let menuItem;
let token;

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // Create test merchant with orders feature enabled AND active subscription
  merchant = await Merchant.create({
    businessName: 'Test Order Restaurant',
    slug: 'test-order-restaurant-audit',
    email: 'orders-audit@test.com',
    phone: '+251911777777',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true, // REQUIRED for hasActiveAccess
    subscriptionPlan: 'pro',
    owner: {
      fullName: 'Order Test Owner',
      gender: 'Male',
      email: 'orderaudit@test.com',
      phone: '+251911777778',
    },
    features: {
      optional: {
        orders: { enabled: true }, // REQUIRED for requireFeature('orders')
      },
    },
  });

  // Create test branch
  branch = await Branch.create({
    name: 'Order Test Branch',
    merchant: merchant._id,
    location: {
      coordinates: [38.7578, 9.0054],
      city: 'Addis Ababa',
    },
    phone: '+251911777779',
    isActive: true,
  });

  // Create admin role with order tasks (ADMIN role can perform all state transitions)
  const Task = require('../models/taskModel');
  const orderTasks = await Task.find({
    name: { $in: ['orders.placeStaff', 'orders.updateStatus', 'orders.read'] },
  });

  waiterRole = await Role.create({
    name: 'Order-Admin', // Name contains 'ADMIN' → resolves to roleCategory='admin'
    description: 'Admin role for order testing',
    merchant: merchant._id,
    tasks: orderTasks.map(t => t._id),
  });

  // Create admin user
  waiterUser = await User.create({
    firstName: 'Order',
    lastName: 'Admin',
    name: 'Order Admin',
    email: 'orderadmin@test.com',
    phone: '+251911888891',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant._id,
    branch: branch._id,
    role: waiterRole._id,
    isActive: true,
  });

  // Create test table
  table = await Table.create({
    tableNumber: 'T10',
    capacity: 4,
    merchant: merchant._id,
    branch: branch._id,
    status: 'available',
    isActive: true,
  });

  // Create test menu item
  menuItem = await MenuItem.create({
    name: 'Test Burger',
    price: 150,
    category: 'Main',
    merchant: merchant._id,
    branch: branch._id,
    isAvailable: true,
  });

  token = AuthService.signToken(waiterUser);
});

afterAll(async () => {
  await AuditLog.deleteMany({});
  await Order.deleteMany({});
  await MenuItem.deleteMany({});
  await Table.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
  await Branch.deleteMany({});
  await Merchant.deleteMany({});
  await disconnectDatabase();
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
  await Order.deleteMany({});
});

describe('Audit Plugin - Order Model', () => {
  describe('CREATE operations', () => {
    it('should log order creation via API', async () => {
      const res = await request(app)
        .post('/api/v1/order/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId: branch._id.toString(),
          orderType: 'dine_in',
          tableId: table._id.toString(),
          customerName: 'Test Customer',
          customerPhone: '+251911999999',
          items: [
            {
              menuItemId: menuItem._id.toString(),
              quantity: 2,
              unitPrice: 150,
            },
          ],
          subtotal: 300,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const orderId = res.body.data._id;

      // Give audit log time to be created (setImmediate + async creation)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Order',
        resourceId: orderId,
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('CREATE');
      expect(log.method).toBe('POST');
      expect(log.user.toString()).toBe(waiterUser._id.toString());
      expect(log.merchant.toString()).toBe(merchant._id.toString());
      expect(log.endpoint).toContain('/api/v1/order');
      expect(log.statusCode).toBe(200); // From plugin (post-save)
      expect(log.metadata.wasNew).toBe(true);
    });
  });

  describe('UPDATE operations', () => {
    it('should log order updates with changes array', async () => {
      // Create order first
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        tableNumber: 'T10',
        orderType: 'dine_in',
        customerName: 'Original Customer',
        customerPhone: '+251911111111',
        items: [
          {
            menuItem: menuItem._id,
            quantity: 1,
            unitPrice: 150,
            totalPrice: 150,
          },
        ],
        subtotal: 150,
        totalAmount: 150,
        status: 'pending',
        paymentStatus: 'unpaid',
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Update via API (status change)
      await request(app)
        .patch(`/api/v1/order/${order._id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'accepted',
        })
        .expect(200);

      // Give audit log time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audit log
      const logs = await AuditLog.find({
        resource: 'Order',
        resourceId: order._id,
        action: 'UPDATE',
      }).lean();

      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('UPDATE');
      expect(log.method).toBe('PATCH');
      expect(log.metadata.wasNew).toBe(false);

      // Verify oldValues
      expect(log.oldValues.status).toBe('pending');

      // Verify newValues
      expect(log.newValues.status).toBe('accepted');

      // Verify changes array
      expect(log.changes).toBeDefined();
      const changedFields = log.changes.map(c => c.field);
      expect(changedFields).toContain('status');

      const statusChange = log.changes.find(c => c.field === 'status');
      expect(statusChange.oldValue).toBe('pending');
      expect(statusChange.newValue).toBe('accepted');
    });

    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => {
      // CREATE
      const createRes = await request(app)
        .post('/api/v1/order/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId: branch._id.toString(),
          orderType: 'dine_in',
          tableId: table._id.toString(),
          customerName: 'Test Customer',
          customerPhone: '+251911999999',
          items: [
            {
              menuItemId: menuItem._id.toString(),
              quantity: 1,
              unitPrice: 150,
            },
          ],
          subtotal: 150,
        })
        .expect(201);

      const orderId = createRes.body.data._id;

      // UPDATE
      await request(app)
        .patch(`/api/v1/order/${orderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'accepted',
        })
        .expect(200);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch all logs for this order
      const logs = await AuditLog.find({
        resource: 'Order',
        resourceId: orderId,
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
      // Create two orders with different payment statuses
      const order1 = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        tableNumber: 'T10',
        orderType: 'dine_in',
        customerName: 'Customer 1',
        customerPhone: '+251911111111',
        items: [
          {
            menuItem: menuItem._id,
            quantity: 1,
            unitPrice: 150,
            totalPrice: 150,
          },
        ],
        subtotal: 150,
        totalAmount: 150,
        status: 'pending',
        paymentStatus: 'unpaid',
      });

      const order2 = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        tableNumber: 'T10',
        orderType: 'dine_in',
        customerName: 'Customer 2',
        customerPhone: '+251922222222',
        items: [
          {
            menuItem: menuItem._id,
            quantity: 1,
            unitPrice: 150,
            totalPrice: 150,
          },
        ],
        subtotal: 150,
        totalAmount: 150,
        status: 'accepted',
        paymentStatus: 'unpaid',
      });

      // Clear creation logs
      await AuditLog.deleteMany({});

      // Fire two concurrent updates (different status changes)
      await Promise.all([
        request(app)
          .patch(`/api/v1/order/${order1._id}/status`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status: 'accepted' }),

        request(app)
          .patch(`/api/v1/order/${order2._id}/status`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status: 'preparing' }),
      ]);

      // Give audit logs time to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch logs
      const log1 = await AuditLog.findOne({
        resource: 'Order',
        resourceId: order1._id,
        action: 'UPDATE',
      }).lean();

      const log2 = await AuditLog.findOne({
        resource: 'Order',
        resourceId: order2._id,
        action: 'UPDATE',
      }).lean();

      // CRITICAL TEST: Each log should have its own correct oldValue
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();

      // Order 1: status pending → accepted
      expect(log1.oldValues.status).toBe('pending');
      expect(log1.newValues.status).toBe('accepted');

      // Order 2: status accepted → preparing
      expect(log2.oldValues.status).toBe('accepted');
      expect(log2.newValues.status).toBe('preparing');

      // If Query instances were NOT isolated, these would be wrong
      // (e.g., log1.oldValues.status would be 'accepted' from order2)
    });
  });
});
