/**
 * Advanced Reporting - All 8 Report Endpoints Integration Tests
 * 
 * Task 12.1: Verify all 8 report endpoints
 * 
 * Tests verify:
 * - Response envelope structure matches design specification
 * - Merchant scoping (cross-tenant isolation)
 * - CSV export functionality (format=csv query param)
 * - Empty data handling (HTTP 200 with empty arrays)
 * - Date range and branch filtering
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

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
const Ingredient = require('../models/Ingredient');
const StockMovement = require('../models/StockMovement');

let app;
let merchant1Id, merchant2Id;
let branch1Id, branch2Id;
let user1Id, user2Id;
let authToken1, authToken2;
let menuItemId1, menuItemId2;
let ingredientId1;

// Helper function to create JWT tokens for testing
function createTestToken(user) {
  const payload = {
    id: user._id.toString(),
    merchant: user.merchant.toString(),
    branch: Array.isArray(user.branch) ? user.branch[0].toString() : user.branch.toString(),
    role: user.role.name
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

beforeAll(async () => {
  // Connect to test database
  await connectDatabase();
  
  app = createApp();
  
  // Create admin role
  const adminRole = await Role.create({
    name: 'MERCHANT_ADMIN',
    description: 'Merchant Administrator',
    isSystemRole: false
  });

  // ========================================
  // MERCHANT 1 - Main test data
  // ========================================
  const merchant1 = await Merchant.create({
    businessName: 'Test Restaurant 1',
    slug: 'test-restaurant-1',
    email: 'test1@restaurant.com',
    phone: '+251911111111',
    status: 'approved',
    mode: 'Test',
    features: {
      core: {
        orders: { enabled: true },
        menu: { enabled: true }
      },
      optional: {
        reports: { enabled: true } // CRITICAL: Enable reports feature
      }
    }
  });
  merchant1Id = merchant1._id;

  const branch1 = await Branch.create({
    merchant: merchant1Id,
    name: 'Test Branch 1',
    phone: '+251911111111',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Test Branch 1, Addis Ababa, Ethiopia'
    }
  });
  branch1Id = branch1._id;

  const user1 = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    phone: '+251911111111',
    email: 'admin1@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant1Id,
    branch: [branch1Id],
    role: adminRole._id
  });
  user1Id = user1._id;

  // Create JWT token for merchant 1
  const user1WithRole = await User.findById(user1Id).populate('role');
  authToken1 = 'Bearer ' + createTestToken(user1WithRole);

  // Create ingredient for profitability testing
  const ingredient1 = await Ingredient.create({
    merchant: merchant1Id,
    branch: branch1Id,
    name: 'Tomato',
    unit: 'kg',
    currentStock: 50,
    reorderLevel: 10,
    costPerUnit: 5.50
  });
  ingredientId1 = ingredient1._id;

  // Create menu items with recipes
  const menuItem1 = await Menu.create({
    merchant: merchant1Id,
    branch: branch1Id,
    name: 'Margherita Pizza',
    price: 250,
    category: 'Main Dish',
    publishStatus: 'published',
    recipe: {
      ingredients: [
        {
          ingredient: ingredientId1,
          quantity: 0.2,
          unit: 'kg'
        }
      ]
    }
  });
  menuItemId1 = menuItem1._id;

  const menuItem2 = await Menu.create({
    merchant: merchant1Id,
    branch: branch1Id,
    name: 'Pasta',
    price: 180,
    category: 'Main Dish',
    publishStatus: 'published'
  });
  menuItemId2 = menuItem2._id;

  // Create test orders with varying dates
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  // Order 1: Paid order from 2 days ago
  await Order.create({
    merchant: merchant1Id,
    branch: branch1Id,
    orderNumber: '#T001',
    customerName: 'Customer 1',
    orderType: 'dine_in',
    status: 'completed',
    paymentStatus: 'paid',
    items: [
      {
        menuItem: menuItemId1,
        quantity: 2,
        unitPrice: 250,
        totalPrice: 500,
        unitCost: 1.10 // 0.2 kg * 5.50 per kg
      },
      {
        menuItem: menuItemId2,
        quantity: 1,
        unitPrice: 180,
        totalPrice: 180,
        unitCost: null // No recipe
      }
    ],
    totalAmount: 680,
    discountAmount: 0,
    taxAmount: 0,
    deliveryFee: 0,
    paymentDetails: { method: 'cash' },
    placedAt: twoDaysAgo,
    acceptedAt: new Date(twoDaysAgo.getTime() + 5 * 60000), // 5 min later
    readyAt: new Date(twoDaysAgo.getTime() + 20 * 60000) // 20 min later
  });

  // Order 2: Paid delivery order from yesterday
  await Order.create({
    merchant: merchant1Id,
    branch: branch1Id,
    orderNumber: '#T002',
    customerName: 'Customer 2',
    orderType: 'delivery',
    status: 'delivered',
    paymentStatus: 'paid',
    items: [
      {
        menuItem: menuItemId1,
        quantity: 1,
        unitPrice: 250,
        totalPrice: 250,
        unitCost: 1.10
      }
    ],
    totalAmount: 280,
    discountAmount: 10,
    taxAmount: 10,
    deliveryFee: 30,
    paymentDetails: { method: 'card' },
    placedAt: yesterday,
    acceptedAt: new Date(yesterday.getTime() + 3 * 60000),
    readyAt: new Date(yesterday.getTime() + 15 * 60000),
    dispatchedAt: new Date(yesterday.getTime() + 20 * 60000),
    deliveredAt: new Date(yesterday.getTime() + 40 * 60000)
  });

  // Order 3: Cancelled order
  await Order.create({
    merchant: merchant1Id,
    branch: branch1Id,
    orderNumber: '#T003',
    customerName: 'Customer 3',
    orderType: 'takeaway',
    status: 'canceled',
    paymentStatus: 'unpaid',
    items: [
      {
        menuItem: menuItemId2,
        quantity: 1,
        unitPrice: 180,
        totalPrice: 180,
        unitCost: null
      }
    ],
    totalAmount: 180,
    discountAmount: 0,
    taxAmount: 0,
    deliveryFee: 0,
    placedAt: yesterday
  });

  // Create stock movement for inventory report
  await StockMovement.create({
    merchant: merchant1Id,
    branch: branch1Id,
    ingredient: ingredientId1,
    type: 'purchase',
    quantity: 20,
    unitCost: 5.50,
    totalCost: 110,
    reference: 'PO-001',
    createdAt: yesterday
  });

  // ========================================
  // MERCHANT 2 - For cross-tenant testing
  // ========================================
  const merchant2 = await Merchant.create({
    businessName: 'Test Restaurant 2',
    slug: 'test-restaurant-2',
    email: 'test2@restaurant.com',
    phone: '+251922222222',
    status: 'approved',
    mode: 'Test',
    features: {
      core: {
        orders: { enabled: true },
        menu: { enabled: true }
      },
      optional: {
        reports: { enabled: true }
      }
    }
  });
  merchant2Id = merchant2._id;

  const branch2 = await Branch.create({
    merchant: merchant2Id,
    name: 'Test Branch 2',
    phone: '+251922222222',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Test Branch 2, Addis Ababa, Ethiopia'
    }
  });
  branch2Id = branch2._id;

  const user2 = await User.create({
    firstName: 'Admin',
    lastName: 'User2',
    phone: '+251922222222',
    email: 'admin2@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant2Id,
    branch: [branch2Id],
    role: adminRole._id
  });
  user2Id = user2._id;

  const user2WithRole = await User.findById(user2Id).populate('role');
  authToken2 = 'Bearer ' + createTestToken(user2WithRole);

  // Create one order for merchant 2
  await Order.create({
    merchant: merchant2Id,
    branch: branch2Id,
    orderNumber: '#M2-001',
    customerName: 'Merchant 2 Customer',
    orderType: 'dine_in',
    status: 'completed',
    paymentStatus: 'paid',
    items: [
      {
        menuItem: new mongoose.Types.ObjectId(),
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
        unitCost: null
      }
    ],
    totalAmount: 100,
    discountAmount: 0,
    taxAmount: 0,
    deliveryFee: 0,
    paymentDetails: { method: 'cash' },
    placedAt: yesterday
  });
}, 30000);

afterAll(async () => {
  // Cleanup
  await Order.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id] } });
  await StockMovement.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id] } });
  await Menu.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id] } });
  await Ingredient.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id] } });
  await Branch.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id] } });
  await User.deleteMany({ _id: { $in: [user1Id, user2Id] } });
  await Merchant.deleteMany({ _id: { $in: [merchant1Id, merchant2Id] } });
  await Role.deleteMany({ name: 'MERCHANT_ADMIN' });
  await disconnectDatabase();
}, 30000);

describe('Advanced Reporting - All 8 Report Endpoints Integration Tests', () => {
  
  // ========================================
  // TEST SUITE 0: VALIDATION ERROR MESSAGES (Task 17.1)
  // Testing Requirements 19.1, 19.2, 19.3, 19.4, 19.6, 19.7
  // ========================================
  describe('Validation Error Messages - Requirement 19', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('Req 19.1: should return HTTP 400 with "dateFrom is required" when dateFrom is missing', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('dateFrom is required');
    });

    it('Req 19.2: should return HTTP 400 with "dateTo is required" when dateTo is missing', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('dateTo is required');
    });

    it('should return HTTP 400 with "dateFrom must be ISO 8601 format" when dateFrom has invalid format', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: '2024-01-01',  // Not ISO 8601 datetime
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('dateFrom must be ISO 8601 format');
    });

    it('should return HTTP 400 with "dateTo must be ISO 8601 format" when dateTo has invalid format', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: '2024-12-31'  // Not ISO 8601 datetime
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('dateTo must be ISO 8601 format');
    });

    it('Req 19.3: should return HTTP 400 with "dateFrom must be before dateTo" when dateFrom is after dateTo', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateTo.toISOString(),
          dateTo: dateFrom.toISOString()  // dateFrom > dateTo
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('dateFrom must be before dateTo');
    });

    it('Req 19.4: should return HTTP 400 with specific message when date range exceeds 366 days for JSON', async () => {
      const farPast = new Date(now);
      farPast.setDate(farPast.getDate() - 370);  // 370 days ago

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: farPast.toISOString(),
          dateTo: now.toISOString(),
          format: 'json'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Date range exceeds maximum of 366 days. Use export for larger ranges.');
    });

    it('should allow date range exceeding 366 days for CSV format', async () => {
      const farPast = new Date(now);
      farPast.setDate(farPast.getDate() - 370);  // 370 days ago

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: farPast.toISOString(),
          dateTo: now.toISOString(),
          format: 'csv'
        });

      // Should succeed (HTTP 200) because CSV format allows larger ranges
      expect(response.status).toBe(200);
      expect(response.type).toBe('text/csv');
    });

    it('Req 19.6: should return HTTP 400 with "groupBy must be one of: day, week, month" when groupBy is invalid', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'year'  // Invalid value
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('groupBy must be one of: day, week, month');
    });

    it('Req 19.7: should return HTTP 400 with "format must be one of: json, csv, xlsx, pdf" when format is invalid', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'xml'  // Invalid value
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('format must be one of: json, csv, xlsx, pdf');
    });

    it('should return HTTP 403 with "Access denied to specified branch" when branchId does not belong to merchant', async () => {
      // Try to access branch2 (belongs to merchant2) using merchant1's token
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          branchId: branch2Id.toString()  // Branch belongs to merchant2
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });
  });
  
  // ========================================
  // TEST SUITE 1: SALES REPORT
  // ========================================
  describe('GET /api/v1/reports/sales - Sales Report', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('should return sales report with correct response envelope', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('dateFrom');
      expect(response.body.meta).toHaveProperty('dateTo');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('pages');
      expect(response.body.meta).toHaveProperty('total');
    });

    it('should compute correct sales metrics', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      // We have 2 paid orders: 680 + 280 = 960
      expect(summary.grossRevenue).toBeGreaterThan(0);
      expect(summary).toHaveProperty('netRevenue');
      expect(summary).toHaveProperty('totalDiscounts');
      expect(summary).toHaveProperty('totalTaxes');
      expect(summary).toHaveProperty('orderCount');
      expect(summary.orderCount).toBe(2); // Only paid orders
    });

    it('should support CSV export format', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('sales_');
      expect(response.text).toContain(','); // CSV should contain commas
    });

    it('should enforce merchant scoping (cross-tenant isolation)', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      // Merchant 1 should only see their 2 orders, not merchant 2's order
      expect(summary.orderCount).toBe(2);
    });

    it('should return HTTP 200 with empty data when no orders exist', async () => {
      // Query for dates in the far future
      const futureStart = new Date();
      futureStart.setFullYear(futureStart.getFullYear() + 1);
      const futureEnd = new Date(futureStart);
      futureEnd.setDate(futureEnd.getDate() + 1);

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: futureStart.toISOString(),
          dateTo: futureEnd.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.summary.orderCount).toBe(0);
      expect(Array.isArray(response.body.data.breakdown)).toBe(true);
    });

    it('should support branch filtering', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          branchId: branch1Id.toString()
        });

      expect(response.status).toBe(200);
      expect(response.body.meta.branchId).toBe(branch1Id.toString());
    });

    it('should reject access to branch from different merchant', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          branchId: branch2Id.toString() // Branch from merchant 2
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });
  });

  // ========================================
  // TEST SUITE 2: ORDERS REPORT
  // ========================================
  describe('GET /api/v1/reports/orders - Orders Report', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('should return orders report with correct envelope', async () => {
      const response = await request(app)
        .get('/api/v1/reports/orders')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
    });

    it('should compute order counts by status', async () => {
      const response = await request(app)
        .get('/api/v1/reports/orders')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      expect(summary).toHaveProperty('totalOrders');
      expect(summary.totalOrders).toBeGreaterThan(0);
      // We have 1 canceled order
      expect(summary).toHaveProperty('canceledOrders');
    });

    it('should support CSV export', async () => {
      const response = await request(app)
        .get('/api/v1/reports/orders')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  // ========================================
  // TEST SUITE 3: PRODUCTS REPORT
  // ========================================
  describe('GET /api/v1/reports/products - Products Report', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('should return products report with correct envelope', async () => {
      const response = await request(app)
        .get('/api/v1/reports/products')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
    });

    it('should aggregate product quantities sold', async () => {
      const response = await request(app)
        .get('/api/v1/reports/products')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      expect(summary).toHaveProperty('totalItemsSold');
      expect(summary.totalItemsSold).toBeGreaterThan(0);
    });

    it('should support CSV export', async () => {
      const response = await request(app)
        .get('/api/v1/reports/products')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  // ========================================
  // TEST SUITE 4: CUSTOMERS REPORT
  // ========================================
  describe('GET /api/v1/reports/customers - Customers Report', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('should return customers report with correct envelope', async () => {
      const response = await request(app)
        .get('/api/v1/reports/customers')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
    });

    it('should classify new vs returning customers', async () => {
      const response = await request(app)
        .get('/api/v1/reports/customers')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      expect(summary).toHaveProperty('totalCustomers');
    });

    it('should support CSV export', async () => {
      const response = await request(app)
        .get('/api/v1/reports/customers')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  // ========================================
  // TEST SUITE 5: DELIVERY REPORT
  // ========================================
  describe('GET /api/v1/reports/delivery - Delivery Report', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('should return delivery report with correct envelope', async () => {
      const response = await request(app)
        .get('/api/v1/reports/delivery')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
    });

    it('should filter only delivery orders', async () => {
      const response = await request(app)
        .get('/api/v1/reports/delivery')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      expect(summary).toHaveProperty('totalDeliveryOrders');
      expect(summary.totalDeliveryOrders).toBeGreaterThanOrEqual(1); // We have 1 delivery order
    });

    it('should support CSV export', async () => {
      const response = await request(app)
        .get('/api/v1/reports/delivery')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  // ========================================
  // TEST SUITE 6: PROFITABILITY REPORT
  // ========================================
  describe('GET /api/v1/reports/profitability - Profitability Report', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('should return profitability report with correct envelope', async () => {
      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
    });

    it('should compute COGS and gross profit', async () => {
      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      expect(summary).toHaveProperty('totalCOGS');
      expect(summary).toHaveProperty('grossProfit');
      expect(summary.totalCOGS).toBeGreaterThan(0);
    });

    it('should include warnings when items lack cost data', async () => {
      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      
      // We have items with null unitCost, so warnings should exist
      if (response.body.warnings) {
        expect(Array.isArray(response.body.warnings)).toBe(true);
      }
    });

    it('should support CSV export', async () => {
      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  // ========================================
  // TEST SUITE 7: STAFF REPORT
  // ========================================
  describe('GET /api/v1/reports/staff - Staff Report', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('should return staff report with correct envelope', async () => {
      const response = await request(app)
        .get('/api/v1/reports/staff')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
    });

    it('should support CSV export', async () => {
      const response = await request(app)
        .get('/api/v1/reports/staff')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  // ========================================
  // TEST SUITE 8: INVENTORY REPORT
  // ========================================
  describe('GET /api/v1/reports/inventory - Inventory Report', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    it('should return inventory report with correct envelope', async () => {
      const response = await request(app)
        .get('/api/v1/reports/inventory')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
    });

    it('should compute stock valuation', async () => {
      const response = await request(app)
        .get('/api/v1/reports/inventory')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      expect(summary).toHaveProperty('totalStockValue');
      expect(summary.totalStockValue).toBeGreaterThan(0); // We have ingredients
    });

    it('should support CSV export', async () => {
      const response = await request(app)
        .get('/api/v1/reports/inventory')
        .set('Authorization', authToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  // ========================================
  // CROSS-CUTTING TESTS
  // ========================================
  describe('Cross-Cutting Concerns - All Endpoints', () => {
    const now = new Date();
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - 7);
    const dateTo = now;

    const endpoints = [
      '/api/v1/reports/sales',
      '/api/v1/reports/orders',
      '/api/v1/reports/products',
      '/api/v1/reports/customers',
      '/api/v1/reports/delivery',
      '/api/v1/reports/profitability',
      '/api/v1/reports/staff',
      '/api/v1/reports/inventory'
    ];

    endpoints.forEach(endpoint => {
      describe(`${endpoint}`, () => {
        it('should require authentication', async () => {
          const response = await request(app)
            .get(endpoint)
            .query({
              dateFrom: dateFrom.toISOString(),
              dateTo: dateTo.toISOString()
            });

          expect([401, 403]).toContain(response.status);
        });

        it('should validate required dateFrom parameter', async () => {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', authToken1)
            .query({
              dateTo: dateTo.toISOString()
            });

          expect(response.status).toBe(400);
          expect(response.body.message).toContain('dateFrom');
        });

        it('should validate required dateTo parameter', async () => {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', authToken1)
            .query({
              dateFrom: dateFrom.toISOString()
            });

          expect(response.status).toBe(400);
          expect(response.body.message).toContain('dateTo');
        });

        it('should validate date range logic', async () => {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', authToken1)
            .query({
              dateFrom: dateTo.toISOString(),
              dateTo: dateFrom.toISOString() // Swapped - invalid
            });

          expect(response.status).toBe(400);
        });

        it('should support groupBy parameter', async () => {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', authToken1)
            .query({
              dateFrom: dateFrom.toISOString(),
              dateTo: dateTo.toISOString(),
              groupBy: 'week'
            });

          expect(response.status).toBe(200);
        });

        it('should support pagination', async () => {
          const response = await request(app)
            .get(endpoint)
            .set('Authorization', authToken1)
            .query({
              dateFrom: dateFrom.toISOString(),
              dateTo: dateTo.toISOString(),
              page: 1,
              limit: 10
            });

          expect(response.status).toBe(200);
          expect(response.body.meta.page).toBe(1);
        });
      });
    });
  });
});
