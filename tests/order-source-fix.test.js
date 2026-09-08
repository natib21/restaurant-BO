/**
 * Test: Order source field fix (Step 1)
 * 
 * Verifies that order.source is set correctly based on the actor:
 * - Customer QR orders → 'web'
 * - Waiter staff orders → 'waiter'
 * - Admin staff orders → 'admin'
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Table = require('../models/tabelModel');
const Customer = require('../models/customerModule');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const Ingredient = require('../models/Ingredient');

describe('Order Source Field Fix', () => {
  let app;
  let merchant, branch, table, menuItem, ingredient;
  let waiterUser, waiterToken, waiterRole;
  let adminUser, adminToken, adminRole;
  let customer, tableSession;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Source Test Restaurant',
      email: 'source-test@restaurant.com',
      phone: '+251911000000',
      slug: 'source-test-restaurant', // Add required slug field
      address: { city: 'Addis Ababa', subCity: 'Bole', wereda: '01' },
      subscriptionType: 'premium',
      subscriptionStatus: 'active',
      features: { orders: true, menu: true, inventory: true },
    });

    // Create branch
    branch = await Branch.create({
      name: 'Main Branch',
      merchant: merchant._id,
      address: { city: 'Addis Ababa', subCity: 'Bole', wereda: '01' },
      location: {
        type: 'Point',
        coordinates: [38.7525, 9.0082], // [lng, lat]
        city: 'Addis Ababa',
      },
      phone: '+251911000001',
      isActive: true,
    });

    // Create table
    table = await Table.create({
      tableNumber: 'T1',
      capacity: 4,
      status: 'available',
      merchant: merchant._id,
      branch: branch._id,
    });

    // Create ingredient
    ingredient = await Ingredient.create({
      name: 'Test Ingredient',
      category: 'vegetables',
      unit: 'kg',
      currentStock: 1000,
      minStock: 10,
      merchant: merchant._id,
    });

    // Create category first
    const Category = require('../models/Category');
    const category = await Category.create({
      name: { en: 'Test Category', am: 'ምድብ ሙከራ' },
      description: { en: 'Test description', am: 'የሙከራ መግለጫ' },
      merchant: merchant._id,
      branch: branch._id,
      isActive: true,
    });

    // Create menu item
    menuItem = await MenuItem.create({
      name: { en: 'Test Dish', am: 'የሙከራ ምግብ' },
      description: { en: 'Test dish for source testing', am: 'የምንጭ ሙከራ ምግብ' },
      price: 150,
      categoryId: category._id,
      merchant: merchant._id,
      branch: branch._id,
      isActive: true,
      recipe: {
        ingredients: [
          {
            ingredient: ingredient._id,
            quantity: 0.1,
            unit: 'kg',
          },
        ],
        preparationTime: 15,
        instructions: 'Test instructions',
      },
    });

    // Create tasks
    const placeOrderTask = await Task.create({
      name: 'orders.placeStaff',
      endpoint: '/api/v1/order/staff',
      method: 'POST',
      description: 'Place staff order',
      isMerchant: true,
    });

    // Create waiter role
    waiterRole = await Role.create({
      name: 'WAITER',
      description: 'Waiter role for testing',
      merchant: merchant._id,
      tasks: [placeOrderTask._id],
    });

    // Create admin role
    adminRole = await Role.create({
      name: 'SUPER-MERCHANT-ADMIN',
      description: 'Admin role for testing',
      merchant: merchant._id,
      tasks: [placeOrderTask._id],
    });

    // Create waiter user
    waiterUser = await User.create({
      firstName: 'Waiter',
      lastName: 'Test',
      phone: '+251911111111',
      password: 'password123',
      passwordConfirm: 'password123',
      merchant: merchant._id,
      role: waiterRole._id,
      branch: [branch._id],
    });

    // Create admin user
    adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'Test',
      phone: '+251911111112',
      password: 'password123',
      passwordConfirm: 'password123',
      merchant: merchant._id,
      role: adminRole._id,
      branch: [branch._id],
    });

    // Login waiter
    const waiterLogin = await request(app)
      .post('/api/v1/users/login')
      .send({ phone: '+251911111111', password: 'password123' });
    waiterToken = waiterLogin.body.token;

    // Populate role for waiter (required for role name check)
    waiterUser = await User.findById(waiterUser._id).populate('role');

    // Login admin
    const adminLogin = await request(app)
      .post('/api/v1/users/login')
      .send({ phone: '+251911111112', password: 'password123' });
    adminToken = adminLogin.body.token;

    // Populate role for admin
    adminUser = await User.findById(adminUser._id).populate('role');

    // Create customer for QR order test
    customer = await Customer.create({
      fullName: 'Customer Test',
      phone: '+251911222222',
      merchant: merchant._id,
    });

    // Create table session
    const TableSession = require('../models/customerSessionModule');
    const crypto = require('crypto');
    tableSession = await TableSession.create({
      table: table._id,
      customer: customer._id,
      merchant: merchant._id,
      branch: branch._id,
      token: crypto.randomBytes(32).toString('hex'), // Add required token
      status: 'active',
      startedAt: new Date(),
    });
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await User.deleteMany({});
    await Role.deleteMany({});
    await Task.deleteMany({});
    await Merchant.deleteMany({});
    await Branch.deleteMany({});
    await Table.deleteMany({});
    await Customer.deleteMany({});
    await MenuItem.deleteMany({});
    await Ingredient.deleteMany({});
    const TableSession = require('../models/customerSessionModule');
    await TableSession.deleteMany({});
    await disconnectDatabase();
  });

  describe('Staff Order Source', () => {
    it('should set source to "waiter" when created by waiter-role user', async () => {
      const response = await request(app)
        .post('/api/v1/order/staff')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({
          orderType: 'dine_in',
          tableId: table._id.toString(),
          branchId: branch._id.toString(),
          customerName: 'Walk-in Customer',
          items: [
            {
              menuItem: menuItem._id.toString(),
              quantity: 2,
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.order.source).toBe('waiter');

      // Verify in database
      const order = await Order.findById(response.body.data.order._id);
      expect(order.source).toBe('waiter');
      expect(order.status).toBe('pending');
    });

    it('should set source to "admin" when created by admin-role user', async () => {
      const response = await request(app)
        .post('/api/v1/order/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderType: 'dine_in',
          tableId: table._id.toString(),
          branchId: branch._id.toString(),
          customerName: 'Walk-in Customer',
          items: [
            {
              menuItem: menuItem._id.toString(),
              quantity: 1,
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.order.source).toBe('admin');

      // Verify in database
      const order = await Order.findById(response.body.data.order._id);
      expect(order.source).toBe('admin');
      expect(order.status).toBe('pending');
    });
  });

  describe('Customer QR Order Source', () => {
    it('should set source to "web" for customer QR orders', async () => {
      const response = await request(app)
        .post('/api/v1/order')
        .set('X-Table-Session-Token', tableSession.token)
        .send({
          items: [
            {
              menuItem: menuItem._id.toString(),
              quantity: 1,
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');

      // Verify in database
      const order = await Order.findById(response.body.data.order._id);
      expect(order.source).toBe('web');
      expect(order.orderType).toBe('dine_in');
      expect(order.status).toBe('pending');
    });
  });

  describe('Backwards Compatibility', () => {
    it('should not break existing orderType, status, or other fields', async () => {
      const response = await request(app)
        .post('/api/v1/order/staff')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({
          orderType: 'takeaway',
          branchId: branch._id.toString(),
          customerName: 'Takeaway Customer',
          customerPhone: '+251911333333',
          items: [
            {
              menuItem: menuItem._id.toString(),
              quantity: 3,
            },
          ],
        });

      expect(response.status).toBe(201);

      const order = await Order.findById(response.body.data.order._id);
      
      // Verify source
      expect(order.source).toBe('waiter');
      
      // Verify existing fields still work
      expect(order.orderType).toBe('takeaway');
      expect(order.status).toBe('pending');
      expect(order.customerName).toBe('Takeaway Customer');
      expect(order.customerPhone).toBe('+251911333333');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].quantity).toBe(3);
      expect(order.totalAmount).toBe(450); // 150 * 3
    });

    it('should handle delivery orders with correct source', async () => {
      const response = await request(app)
        .post('/api/v1/order/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderType: 'delivery',
          branchId: branch._id.toString(),
          customerName: 'Delivery Customer',
          customerPhone: '+251911444444',
          location: {
            type: 'Point',
            coordinates: [38.7525, 9.0082], // [lng, lat]
            city: 'Addis Ababa',
          },
          deliveryFee: 50,
          items: [
            {
              menuItem: menuItem._id.toString(),
              quantity: 1,
            },
          ],
        });

      expect(response.status).toBe(201);

      const order = await Order.findById(response.body.data.order._id);
      
      expect(order.source).toBe('admin');
      expect(order.orderType).toBe('delivery');
      expect(order.deliveryFee).toBe(50);
      expect(order.location.coordinates).toEqual([38.7525, 9.0082]);
    });
  });
});
