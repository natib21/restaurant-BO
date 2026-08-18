/**
 * Task 19.2: Profitability Report with Mixed Cost Data
 * 
 * Integration test covering:
 * - Creating orders with some items having unitCost and others with null
 * - Verifying COGS calculation excludes null values
 * - Verifying warning appears when items lack cost data
 * - Testing gross profit and margin calculations
 * 
 * Requirements: 10.1, 10.2, 10.6
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
const Task = require('../models/taskModel');
const Ingredient = require('../models/Ingredient');

let app;
let merchantId, branchId, userId, authToken;
let menuItemWithCost, menuItemWithoutCost;

function createTestToken(user) {
  const payload = {
    id: user._id.toString(),
    merchant: user.merchant.toString(),
    branch: Array.isArray(user.branch) ? user.branch[0].toString() : user.branch.toString(),
    role: user.role._id.toString()
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // Clean up any existing test data first
  await Task.deleteMany({ name: 'View Reports' });
  await Role.deleteMany({ name: 'MERCHANT_ADMIN' });

  // Create tasks for reports access
  const reportsTask = await Task.create({
    name: 'View Reports',
    endpoint: '/api/v1/reports/*',
    method: 'GET'
  });

  const adminRole = await Role.create({
    name: 'MERCHANT_ADMIN',
    description: 'Merchant Administrator',
    isSystemRole: false,
    tasks: [reportsTask._id]
  });

  const merchant = await Merchant.create({
    businessName: 'Profitability Test Restaurant',
    slug: 'profitability-test-restaurant',
    email: 'test-profit@restaurant.com',
    phone: '+251911222333',
    status: 'approved',
    mode: 'Test',
    features: {
      core: { orders: { enabled: true }, menu: { enabled: true } },
      optional: { reports: { enabled: true } }
    }
  });
  merchantId = merchant._id;

  const branch = await Branch.create({
    merchant: merchantId,
    name: 'Test Branch',
    phone: '+251911222333',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Test Branch, Addis Ababa, Ethiopia'
    }
  });
  branchId = branch._id;

  const user = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    phone: '+251911222333',
    email: 'admin-profit@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchantId,
    branch: [branchId],
    role: adminRole._id
  });
  userId = user._id;

  const userWithRole = await User.findById(userId).populate('role');
  authToken = 'Bearer ' + createTestToken(userWithRole);

  // Create ingredient for recipe
  const ingredient = await Ingredient.create({
    merchant: merchantId,
    branch: branchId,
    name: 'Tomato',
    unit: 'kg',
    currentStock: 50,
    reorderLevel: 10,
    costPerUnit: 10
  });

  // Create menu item WITH cost (has recipe)
  menuItemWithCost = await Menu.create({
    merchant: merchantId,
    branch: branchId,
    name: 'Pizza with Cost',
    price: 300,
    category: 'Main Dish',
    publishStatus: 'published',
    recipe: {
      ingredients: [
        {
          ingredient: ingredient._id,
          quantity: 0.5, // 0.5 kg
          unit: 'kg'
        }
      ]
    }
  });

  // Create menu item WITHOUT cost (no recipe)
  menuItemWithoutCost = await Menu.create({
    merchant: merchantId,
    branch: branchId,
    name: 'Salad without Cost',
    price: 150,
    category: 'Appetizer',
    publishStatus: 'published'
    // No recipe
  });
}, 30000);

afterAll(async () => {
  await Order.deleteMany({ merchant: merchantId });
  await Menu.deleteMany({ merchant: merchantId });
  await Ingredient.deleteMany({ merchant: merchantId });
  await Branch.deleteMany({ merchant: merchantId });
  await User.deleteMany({ _id: userId });
  await Merchant.deleteMany({ _id: merchantId });
  await Role.deleteMany({ name: 'MERCHANT_ADMIN' });
  await Task.deleteMany({ name: 'View Reports' });
  await disconnectDatabase();
}, 30000);

describe('Task 19.2: Profitability Report with Mixed Cost Data', () => {

  beforeEach(async () => {
    // Clean up orders before each test
    await Order.deleteMany({ merchant: merchantId });
  });

  describe('COGS Calculation with Mixed Cost Data', () => {
    
    it('should calculate COGS only from items with unitCost', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      // Create order with mixed cost items
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#MIXED-001',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithCost._id,
            quantity: 2,
            unitPrice: 300,
            totalPrice: 600,
            unitCost: 5 // 0.5 kg * 10 per kg = 5
          },
          {
            menuItem: menuItemWithoutCost._id,
            quantity: 1,
            unitPrice: 150,
            totalPrice: 150,
            unitCost: null // No cost data
          }
        ],
        subtotal: 750,
        taxAmount: 0,
        discountAmount: 0,
        deliveryFee: 0,
        totalAmount: 750,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;

      // COGS should only include items with unitCost
      // Expected COGS: 2 * 5 = 10 (from items with cost)
      expect(summary.totalCOGS).toBe(10);

      // Gross profit = netRevenue - COGS
      expect(summary.grossProfit).toBe(summary.netRevenue - 10);

      // Items without cost should be counted separately
      expect(summary.itemsWithoutCost).toBeGreaterThan(0);
    });

    it('should exclude null unitCost values from COGS sum', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      // Create multiple orders with varying cost patterns
      await Order.insertMany([
        {
          merchant: merchantId,
          branch: branchId,
          orderNumber: '#NULL-001',
          customerName: 'Customer 1',
          orderType: 'takeaway',
          status: 'completed',
          paymentStatus: 'paid',
          items: [
            {
              menuItem: menuItemWithCost._id,
              quantity: 1,
              unitPrice: 300,
              totalPrice: 300,
              unitCost: 5
            }
          ],
          subtotal: 300,
          totalAmount: 300,
          paymentDetails: { method: 'cash' },
          placedAt: yesterday
        },
        {
          merchant: merchantId,
          branch: branchId,
          orderNumber: '#NULL-002',
          customerName: 'Customer 2',
          orderType: 'delivery',
          location: {
            type: 'Point',
            coordinates: [38.7578, 9.025],
            city: 'Addis Ababa',
            formattedAddress: 'Test Address, Addis Ababa, Ethiopia'
          },
          status: 'completed',
          paymentStatus: 'paid',
          items: [
            {
              menuItem: menuItemWithoutCost._id,
              quantity: 3,
              unitPrice: 150,
              totalPrice: 450,
              unitCost: null // Should not affect COGS
            }
          ],
          subtotal: 450,
          totalAmount: 450,
          paymentDetails: { method: 'card' },
          placedAt: yesterday
        },
        {
          merchant: merchantId,
          branch: branchId,
          orderNumber: '#NULL-003',
          customerName: 'Customer 3',
          orderType: 'dine_in',
          table: new mongoose.Types.ObjectId(),
          status: 'completed',
          paymentStatus: 'paid',
          items: [
            {
              menuItem: menuItemWithCost._id,
              quantity: 4,
              unitPrice: 300,
              totalPrice: 1200,
              unitCost: 5
            },
            {
              menuItem: menuItemWithoutCost._id,
              quantity: 2,
              unitPrice: 150,
              totalPrice: 300,
              unitCost: null
            }
          ],
          subtotal: 1500,
          totalAmount: 1500,
          paymentDetails: { method: 'cash' },
          placedAt: yesterday
        }
      ]);

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;

      // Expected COGS:
      // Order 1: 1 * 5 = 5
      // Order 2: 0 (null unitCost)
      // Order 3: 4 * 5 = 20
      // Total COGS: 25
      expect(summary.totalCOGS).toBe(25);

      // Revenue should include all paid orders
      expect(summary.netRevenue).toBe(2250); // 300 + 450 + 1500

      // Gross profit
      expect(summary.grossProfit).toBe(2225); // 2250 - 25
    });

    it('should handle orders with all null unitCost', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#ALL-NULL',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithoutCost._id,
            quantity: 2,
            unitPrice: 150,
            totalPrice: 300,
            unitCost: null
          },
          {
            menuItem: menuItemWithoutCost._id,
            quantity: 1,
            unitPrice: 150,
            totalPrice: 150,
            unitCost: null
          }
        ],
        subtotal: 450,
        totalAmount: 450,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;

      // COGS should be 0 when all items have null unitCost
      expect(summary.totalCOGS).toBe(0);
      
      // All items should be counted as without cost
      expect(summary.itemsWithoutCost).toBe(3); // 2 + 1 = 3 items

      // Gross profit equals net revenue when COGS is 0
      expect(summary.grossProfit).toBe(summary.netRevenue);
    });

    it('should handle orders with all valid unitCost', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#ALL-COST',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithCost._id,
            quantity: 3,
            unitPrice: 300,
            totalPrice: 900,
            unitCost: 5
          },
          {
            menuItem: menuItemWithCost._id,
            quantity: 2,
            unitPrice: 300,
            totalPrice: 600,
            unitCost: 5
          }
        ],
        subtotal: 1500,
        totalAmount: 1500,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;

      // COGS: (3 * 5) + (2 * 5) = 25
      expect(summary.totalCOGS).toBe(25);
      
      // No items without cost
      expect(summary.itemsWithoutCost).toBe(0);

      // Gross profit
      expect(summary.grossProfit).toBe(1475); // 1500 - 25
    });
  });

  describe('Warning Messages', () => {
    
    it('should include warning when items lack cost data', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#WARNING-001',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithCost._id,
            quantity: 1,
            unitPrice: 300,
            totalPrice: 300,
            unitCost: 5
          },
          {
            menuItem: menuItemWithoutCost._id,
            quantity: 2,
            unitPrice: 150,
            totalPrice: 300,
            unitCost: null
          }
        ],
        subtotal: 600,
        totalAmount: 600,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      
      // Verify warnings array exists
      expect(response.body).toHaveProperty('warnings');
      expect(Array.isArray(response.body.warnings)).toBe(true);
      
      // Should have at least one warning
      expect(response.body.warnings.length).toBeGreaterThan(0);
      
      // Warning should mention incomplete cost data
      const warningText = response.body.warnings.join(' ');
      expect(warningText).toMatch(/cost data|incomplete|missing|without cost/i);
      
      // Warning should mention the count
      expect(warningText).toContain('2'); // 2 items without cost
    });

    it('should NOT include warning when all items have cost data', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#NO-WARNING',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithCost._id,
            quantity: 2,
            unitPrice: 300,
            totalPrice: 600,
            unitCost: 5
          }
        ],
        subtotal: 600,
        totalAmount: 600,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      
      // Warnings array should be empty or not contain cost-related warnings
      if (response.body.warnings) {
        expect(response.body.warnings.length).toBe(0);
      }
      
      // Items without cost should be 0
      expect(response.body.data.summary.itemsWithoutCost).toBe(0);
    });

    it('should include warning with percentage of items without cost', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      // Create order with 1 item with cost and 3 items without cost
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#PERCENT-WARNING',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithCost._id,
            quantity: 1,
            unitPrice: 300,
            totalPrice: 300,
            unitCost: 5
          },
          {
            menuItem: menuItemWithoutCost._id,
            quantity: 3,
            unitPrice: 150,
            totalPrice: 450,
            unitCost: null
          }
        ],
        subtotal: 750,
        totalAmount: 750,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.warnings.length).toBeGreaterThan(0);
      
      // Warning should mention significant percentage (75% = 3 out of 4 items)
      const warningText = response.body.warnings.join(' ');
      expect(warningText).toMatch(/75|percent|percentage/i);
    });
  });

  describe('Gross Profit and Margin Calculations', () => {
    
    it('should calculate gross profit correctly', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#PROFIT-001',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithCost._id,
            quantity: 10,
            unitPrice: 300,
            totalPrice: 3000,
            unitCost: 5
          }
        ],
        subtotal: 3000,
        taxAmount: 450, // 15% tax
        discountAmount: 200,
        deliveryFee: 0,
        totalAmount: 3250,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;

      // COGS: 10 * 5 = 50
      expect(summary.totalCOGS).toBe(50);

      // Net revenue = gross - discount - tax = 3000 - 200 - 450 = 2350
      const expectedNetRevenue = 2350;
      expect(summary.netRevenue).toBe(expectedNetRevenue);

      // Gross profit = netRevenue - COGS = 2350 - 50 = 2300
      expect(summary.grossProfit).toBe(2300);

      // Gross margin = (grossProfit / netRevenue) * 100
      const expectedMargin = (2300 / 2350) * 100;
      expect(Math.abs(summary.grossMarginPercentage - expectedMargin)).toBeLessThan(0.01);
    });

    it('should calculate gross margin percentage correctly', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#MARGIN-001',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithCost._id,
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            unitCost: 40 // 40% COGS
          }
        ],
        subtotal: 100,
        totalAmount: 100,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;

      // Net revenue: 100
      // COGS: 40
      // Gross profit: 60
      // Margin: (60/100) * 100 = 60%
      expect(summary.grossMarginPercentage).toBeCloseTo(60, 1);
    });

    it('should handle zero revenue gracefully', async () => {
      const now = new Date();
      const futureDate = new Date(now);
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureEnd = new Date(futureDate);
      futureEnd.setDate(futureEnd.getDate() + 1);

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: futureDate.toISOString(),
          dateTo: futureEnd.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;

      expect(summary.netRevenue).toBe(0);
      expect(summary.totalCOGS).toBe(0);
      expect(summary.grossProfit).toBe(0);
      expect(summary.grossMarginPercentage).toBe(0);
    });
  });

  describe('Response Structure', () => {
    
    it('should include warnings array in response envelope', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: '#STRUCTURE-001',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        table: new mongoose.Types.ObjectId(),
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItemWithoutCost._id,
            quantity: 1,
            unitPrice: 150,
            totalPrice: 150,
            unitCost: null
          }
        ],
        subtotal: 150,
        totalAmount: 150,
        paymentDetails: { method: 'cash' },
        placedAt: yesterday
      });

      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', authToken)
        .query({
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('breakdown');
      expect(response.body).toHaveProperty('warnings'); // Key difference from other reports
      expect(response.body).toHaveProperty('meta');
    });
  });
});
