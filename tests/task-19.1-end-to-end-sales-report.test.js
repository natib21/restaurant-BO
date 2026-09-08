/**
 * Task 19.1: End-to-End Sales Report with Real Data
 * 
 * Integration test covering:
 * - Seeding database with orders spanning multiple time periods
 * - Querying sales report with different groupBy values
 * - Verifying breakdown buckets are correct
 * - Testing CSV export download and content verification
 * 
 * Requirements: 5.1, 5.8, 14.1, 14.4
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

let app;
let merchantId, branchId, userId, authToken;
let menuItem1, menuItem2;

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
  await connectDatabase();
  app = createApp();

  // Create role
  const adminRole = await Role.create({
    name: 'MERCHANT_ADMIN',
    description: 'Merchant Administrator',
    isSystemRole: false
  });

  // Create merchant with reports feature enabled
  const merchant = await Merchant.create({
    businessName: 'End-to-End Test Restaurant',
    slug: 'end-to-end-test-restaurant',
    email: 'test-e2e@restaurant.com',
    phone: '+251911111111',
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
    name: 'Main Branch',
    phone: '+251911111111',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Main Branch, Addis Ababa, Ethiopia'
    }
  });
  branchId = branch._id;

  const user = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    phone: '+251911111111',
    email: 'admin-e2e@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchantId,
    branch: [branchId],
    role: adminRole._id
  });
  userId = user._id;

  const userWithRole = await User.findById(userId).populate('role');
  authToken = 'Bearer ' + createTestToken(userWithRole);

  // Create menu items
  menuItem1 = await Menu.create({
    merchant: merchantId,
    branch: branchId,
    name: 'Margherita Pizza',
    price: 250,
    category: 'Main Dish',
    publishStatus: 'published'
  });

  menuItem2 = await Menu.create({
    merchant: merchantId,
    branch: branchId,
    name: 'Caesar Salad',
    price: 120,
    category: 'Appetizer',
    publishStatus: 'published'
  });

  // Seed orders spanning multiple days, weeks, and months
  const now = new Date();
  const orders = [];

  // Generate orders for the last 90 days
  for (let i = 0; i < 90; i++) {
    const orderDate = new Date(now);
    orderDate.setDate(orderDate.getDate() - i);

    // Create 3-5 orders per day
    const ordersPerDay = 3 + (i % 3);
    for (let j = 0; j < ordersPerDay; j++) {
      const orderTime = new Date(orderDate);
      orderTime.setHours(10 + (j * 3)); // Spread throughout the day

      orders.push({
        merchant: merchantId,
        branch: branchId,
        orderNumber: `#E2E-${i}-${j}`,
        customerName: `Customer ${i}-${j}`,
        orderType: ['dine_in', 'takeaway', 'delivery'][j % 3],
        status: 'completed',
        paymentStatus: 'paid',
        items: [
          {
            menuItem: menuItem1._id,
            quantity: 1 + (j % 3),
            unitPrice: 250,
            totalPrice: 250 * (1 + (j % 3)),
            unitCost: 50
          },
          {
            menuItem: menuItem2._id,
            quantity: 1,
            unitPrice: 120,
            totalPrice: 120,
            unitCost: 30
          }
        ],
        subtotal: 250 * (1 + (j % 3)) + 120,
        taxAmount: (250 * (1 + (j % 3)) + 120) * 0.15,
        discountAmount: j === 0 ? 20 : 0,
        deliveryFee: orderTime.getDay() === 0 ? 30 : 0, // Delivery fee on Sunday
        totalAmount: 250 * (1 + (j % 3)) + 120 + (250 * (1 + (j % 3)) + 120) * 0.15 - (j === 0 ? 20 : 0) + (orderTime.getDay() === 0 ? 30 : 0),
        paymentDetails: { method: ['cash', 'card', 'mobile_banking'][j % 3] },
        placedAt: orderTime,
        acceptedAt: new Date(orderTime.getTime() + 5 * 60000),
        readyAt: new Date(orderTime.getTime() + 20 * 60000),
        completedAt: new Date(orderTime.getTime() + 30 * 60000)
      });
    }
  }

  await Order.insertMany(orders);
}, 60000);

afterAll(async () => {
  await Order.deleteMany({ merchant: merchantId });
  await Menu.deleteMany({ merchant: merchantId });
  await Branch.deleteMany({ merchant: merchantId });
  await User.deleteMany({ _id: userId });
  await Merchant.deleteMany({ _id: merchantId });
  await Role.deleteMany({ name: 'MERCHANT_ADMIN' });
  await disconnectDatabase();
}, 30000);

describe('Task 19.1: End-to-End Sales Report with Real Data', () => {
  
  describe('Daily Grouping', () => {
    it('should return correct breakdown buckets when grouped by day', async () => {
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 7); // Last 7 days
      const dateTo = now;

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'day'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.breakdown).toBeDefined();
      
      // Verify breakdown has entries for each day
      const breakdown = response.body.data.breakdown;
      expect(breakdown.length).toBeGreaterThan(0);
      expect(breakdown.length).toBeLessThanOrEqual(8); // 7 days + partial day

      // Verify each entry has expected structure
      breakdown.forEach(entry => {
        expect(entry).toHaveProperty('period');
        expect(entry.period).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
        expect(entry).toHaveProperty('grossRevenue');
        expect(entry).toHaveProperty('orderCount');
        expect(entry.grossRevenue).toBeGreaterThan(0);
        expect(entry.orderCount).toBeGreaterThan(0);
      });

      // Verify periods are sorted descending (most recent first)
      for (let i = 0; i < breakdown.length - 1; i++) {
        expect(breakdown[i].period >= breakdown[i + 1].period).toBe(true);
      }
    });

    it('should aggregate correct totals per day', async () => {
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 2); // Last 2 days
      const dateTo = now;

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'day',
          page: 1,
          limit: 50
        });

      expect(response.status).toBe(200);
      const breakdown = response.body.data.breakdown;
      const summary = response.body.data.summary;

      // Sum up breakdown totals
      const breakdownTotalRevenue = breakdown.reduce((sum, entry) => sum + entry.grossRevenue, 0);
      const breakdownTotalOrders = breakdown.reduce((sum, entry) => sum + entry.orderCount, 0);

      // Summary should match breakdown totals (for non-paginated data)
      expect(Math.abs(breakdownTotalRevenue - summary.grossRevenue)).toBeLessThan(1); // Allow floating point precision
      expect(breakdownTotalOrders).toBe(summary.orderCount);
    });
  });

  describe('Weekly Grouping', () => {
    it('should return correct breakdown buckets when grouped by week', async () => {
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 28); // Last 4 weeks
      const dateTo = now;

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'week'
        });

      expect(response.status).toBe(200);
      const breakdown = response.body.data.breakdown;

      expect(breakdown.length).toBeGreaterThan(0);
      expect(breakdown.length).toBeLessThanOrEqual(5); // ~4 weeks + partial week

      // Verify week format (YYYY-WXX)
      breakdown.forEach(entry => {
        expect(entry.period).toMatch(/^\d{4}-W\d{2}$/);
        expect(entry.grossRevenue).toBeGreaterThan(0);
        expect(entry.orderCount).toBeGreaterThan(0);
      });
    });

    it('should aggregate multiple days into weeks correctly', async () => {
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 14); // Last 2 weeks
      const dateTo = now;

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'week'
        });

      expect(response.status).toBe(200);
      const breakdown = response.body.data.breakdown;

      // Each week entry should have accumulated data from ~7 days
      breakdown.forEach(entry => {
        // Weekly order count should be roughly 7x daily average (3-5 orders/day)
        expect(entry.orderCount).toBeGreaterThanOrEqual(10); // At least some accumulation
      });
    });
  });

  describe('Monthly Grouping', () => {
    it('should return correct breakdown buckets when grouped by month', async () => {
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setMonth(dateFrom.getMonth() - 3); // Last 3 months
      const dateTo = now;

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'month'
        });

      expect(response.status).toBe(200);
      const breakdown = response.body.data.breakdown;

      expect(breakdown.length).toBeGreaterThan(0);
      expect(breakdown.length).toBeLessThanOrEqual(4); // 3 months + partial month

      // Verify month format (YYYY-MM)
      breakdown.forEach(entry => {
        expect(entry.period).toMatch(/^\d{4}-\d{2}$/);
        expect(entry.grossRevenue).toBeGreaterThan(0);
        expect(entry.orderCount).toBeGreaterThan(0);
      });
    });

    it('should accumulate entire month data correctly', async () => {
      const now = new Date();
      const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
      const dateTo = now;

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'month'
        });

      expect(response.status).toBe(200);
      const breakdown = response.body.data.breakdown;

      expect(breakdown.length).toBe(1); // Only current month
      
      const monthEntry = breakdown[0];
      // Month should have significant accumulated data
      expect(monthEntry.orderCount).toBeGreaterThan(50); // At least ~3 orders/day * 30 days
      expect(monthEntry.grossRevenue).toBeGreaterThan(10000); // Significant revenue
    });
  });

  describe('CSV Export', () => {
    it('should download CSV file with correct headers and content', async () => {
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 7);
      const dateTo = now;

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toMatch(/sales_.*\.csv/);

      // Verify CSV content
      const csvContent = response.text;
      expect(csvContent).toContain(','); // CSV delimiter
      expect(csvContent.split('\n').length).toBeGreaterThan(1); // At least headers + data

      // Verify CSV has expected columns
      const lines = csvContent.split('\n');
      const headers = lines[0].split(',');
      
      // Check for key summary fields
      expect(headers).toEqual(expect.arrayContaining([
        expect.stringContaining('grossRevenue'),
        expect.stringContaining('netRevenue'),
        expect.stringContaining('orderCount')
      ]));

      // Verify data row exists
      const dataRow = lines[1];
      expect(dataRow.length).toBeGreaterThan(0);
      
      // Verify numeric values are present
      const values = dataRow.split(',');
      const hasNumericValue = values.some(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0);
      expect(hasNumericValue).toBe(true);
    });

    it('should match CSV summary data with JSON response', async () => {
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 7);
      const dateTo = now;

      // Get JSON response
      const jsonResponse = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'json'
        });

      // Get CSV response
      const csvResponse = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(jsonResponse.status).toBe(200);
      expect(csvResponse.status).toBe(200);

      const summary = jsonResponse.body.data.summary;
      const csvContent = csvResponse.text;

      // Verify key metrics are present in CSV
      expect(csvContent).toContain(summary.grossRevenue.toString());
      expect(csvContent).toContain(summary.orderCount.toString());
    });
  });

  describe('Pagination', () => {
    it('should paginate breakdown data correctly', async () => {
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 30); // Last 30 days
      const dateTo = now;

      // Get first page
      const page1Response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'day',
          page: 1,
          limit: 10
        });

      // Get second page
      const page2Response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          groupBy: 'day',
          page: 2,
          limit: 10
        });

      expect(page1Response.status).toBe(200);
      expect(page2Response.status).toBe(200);

      const page1Data = page1Response.body.data.breakdown;
      const page2Data = page2Response.body.data.breakdown;

      // Verify pagination metadata
      expect(page1Response.body.meta.page).toBe(1);
      expect(page2Response.body.meta.page).toBe(2);
      expect(page1Response.body.meta.total).toBe(page2Response.body.meta.total);

      // Verify different data on different pages
      if (page2Data.length > 0) {
        expect(page1Data[0].period).not.toBe(page2Data[0].period);
      }

      // Verify page limits are respected
      expect(page1Data.length).toBeLessThanOrEqual(10);
      expect(page2Data.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty date range gracefully', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureEnd = new Date(futureDate);
      futureEnd.setDate(futureEnd.getDate() + 1);

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: futureDate.toISOString(),
          dateTo: futureEnd.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.data.summary.orderCount).toBe(0);
      expect(response.body.data.breakdown).toEqual([]);
    });

    it('should handle single-day date range', async () => {
      const singleDay = new Date();
      const singleDayEnd = new Date(singleDay);
      singleDayEnd.setHours(23, 59, 59, 999);

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', authToken)
        .query({
          dateFrom: singleDay.toISOString(),
          dateTo: singleDayEnd.toISOString(),
          groupBy: 'day'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.breakdown.length).toBeLessThanOrEqual(1);
    });
  });
});
