const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Menu = require('../models/menuModel');

let app;
let merchantId;
let branchId;
let menuItemId;
let authToken;

beforeAll(async () => {
  // Connect to test database
  await connectDatabase();
  
  app = createApp();

  // Seed test data
  const merchant = await Merchant.create({
    businessName: 'Test Restaurant',
    slug: 'test-restaurant-history',
    name: 'Test Restaurant',
    email: 'test@restaurant.com',
    phone: '+251911111111',
    status: 'approved',
    isActive: true
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
      status: 'completed',
      paymentStatus: 'paid',
      items: [{ menuItem: menuItemId, quantity: 2, unitPrice: 250, totalPrice: 500 }],
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
  await Branch.deleteOne({ _id: branchId });
  await Merchant.deleteOne({ _id: merchantId });
  await disconnectDatabase();
});

describe('Order History Module - Integration Tests', () => {
  describe('GET /api/v1/orders/completed - Get Completed Orders', () => {
    it('should return completed orders with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/orders/completed')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.orders).toBeDefined();
      expect(Array.isArray(response.body.data.orders)).toBe(true);
    });

    it('should filter by search query', async () => {
      const response = await request(app)
        .get('/api/v1/orders/completed?search=Customer 1')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.data.orders.length).toBeGreaterThan(0);
    });
  });
});
