const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Menu = require('../models/menuModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');

let app;
let merchantId;
let branchId;
let menuItemId;
let authToken;
let adminUserId;
let adminRoleId;
let taskId;

beforeAll(async () => {
  // Connect to test database
  await connectDatabase();
  
  app = createApp();

  // Create task for RBAC
  const task = await Task.create({
    name: 'Orders GET',
    description: 'View completed orders',
    method: 'GET',
    endpoint: '/api/v1/order/completed'
  });
  taskId = task._id;

  // Create admin role with task
  const adminRole = await Role.create({
    name: 'MERCHANT_ADMIN',
    description: 'Merchant Administrator',
    isSystemRole: false,
    tasks: [taskId]
  });
  adminRoleId = adminRole._id;

  // Seed test data
  const merchant = await Merchant.create({
    businessName: 'Test Restaurant',
    slug: 'test-restaurant-history',
    name: 'Test Restaurant',
    email: 'test@restaurant.com',
    phone: '+251911111111',
    status: 'approved',
    isActive: true,
    owner: {
      fullName: 'Test Owner',
      gender: 'Male',
      email: 'owner@test-restaurant-history.com',
      phone: '+251911111111'
    }
  });
  merchantId = merchant._id;

  const branch = await Branch.create({
    merchant: merchantId,
    name: 'Test Branch',
    phone: '+251911111111',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Test Branch, Addis Ababa, Ethiopia'
    }
  });
  branchId = branch._id;

  // Create admin user
  const adminUser = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    phone: '+251911111111',
    email: 'admin@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchantId,
    branch: [branchId],
    role: adminRoleId
  });
  adminUserId = adminUser._id;

  // Create real JWT token
  const payload = {
    id: adminUserId.toString(),
    merchant: merchantId.toString(),
    branch: branchId.toString(),
    role: adminRoleId.toString()
  };
  authToken = 'Bearer ' + jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

  const menuItem = await Menu.create({
    merchant: merchantId,
    branch: branchId,
    name: 'Test Pizza',
    category: 'Main Course',
    price: 250,
    publishStatus: 'published',
  });
  menuItemId = menuItem._id;

  // Create test completed orders
  await Order.create([
    {
      merchant: merchantId,
      branch: branchId,
      customerName: 'Customer 1',
      orderType: 'dine_in',
      table: new mongoose.Types.ObjectId(),
      status: 'completed',
      paymentStatus: 'paid',
      items: [{ menuItem: menuItemId, quantity: 2, unitPrice: 250, totalPrice: 500 }],
      subtotal: 500,
      totalAmount: 500,
      orderNumber: '#T001',
    },
    {
      merchant: merchantId,
      branch: branchId,
      customerName: 'Customer 2',
      orderType: 'takeaway',
      status: 'completed',
      paymentStatus: 'paid',
      items: [{ menuItem: menuItemId, quantity: 1, unitPrice: 250, totalPrice: 250 }],
      subtotal: 250,
      totalAmount: 250,
      orderNumber: '#T002',
    },
  ]);

  // Mock auth token
  authToken = 'Bearer mock-jwt-token';
});

afterAll(async () => {
  // Cleanup
  await Order.deleteMany({ merchant: merchantId });
  await Menu.deleteOne({ _id: menuItemId });
  await User.deleteOne({ _id: adminUserId });
  await Branch.deleteOne({ _id: branchId });
  await Merchant.deleteOne({ _id: merchantId });
  await Role.deleteOne({ _id: adminRoleId });
  await Task.deleteOne({ _id: taskId });
  await disconnectDatabase();
});

describe('Order History Module - Integration Tests', () => {
  describe('GET /api/v1/order/completed - Get Completed Orders', () => {
    it('should return completed orders with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/order/completed')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.orders).toBeDefined();
      expect(Array.isArray(response.body.data.orders)).toBe(true);
    });

    it('should filter by search query', async () => {
      const response = await request(app)
        .get('/api/v1/order/completed?search=Customer 1')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.data.orders.length).toBeGreaterThan(0);
    });
  });
});
