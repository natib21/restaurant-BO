/**
 * Advanced Reporting - Security Middleware Integration Tests
 * 
 * Task 17.4: Write integration tests for security middleware
 * 
 * Tests verify:
 * - Requirement 17.1: Every report endpoint SHALL enforce authentication via `protect` middleware
 * - Requirement 17.2: Every report endpoint SHALL enforce role authorization via `restrictTo()` middleware
 * - Requirement 17.3: Every report endpoint SHALL enforce feature subscription gating via `requireFeature('reports')` middleware
 * - Requirement 17.4: The Report_Module SHALL use existing `merchantScopedQuery` pattern to prevent cross-tenant data leakage
 * - Requirement 17.5: The Report_Module SHALL never expose raw customer PII (phone, email) in breakdown arrays without explicit permission check
 * 
 * Security Tests:
 * 1. Test unauthenticated requests return HTTP 401
 * 2. Test unauthorized roles return HTTP 403
 * 3. Test merchant without 'reports' feature subscription returns HTTP 403
 * 4. Test cross-tenant access prevention (user A cannot access user B's branch data)
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
const StockMovement = require('../models/StockMovement');

let app;
let merchant1Id, merchant2Id, merchant3Id;
let branch1Id, branch2Id, branch3Id;
let adminUser1Id, staffUser1Id, adminUser2Id, adminUser3Id;
let adminToken1, staffToken1, adminToken2, adminToken3;
let adminRoleId, staffRoleId;
let reportsTaskId, ordersTaskId;

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
  
  // Create tasks first
  const reportsGetTask = await Task.create({
    name: 'View Reports GET',
    endpoint: '/api/v1/reports/*',
    method: 'GET',
    description: 'Access to all report GET endpoints',
    isMerchant: true
  });

  const reportsPostTask = await Task.create({
    name: 'Create Report Exports',
    endpoint: '/api/v1/reports/exports',
    method: 'POST',
    description: 'Create export jobs',
    isMerchant: true
  });
  reportsTaskId = [reportsGetTask._id, reportsPostTask._id];

  const ordersTask = await Task.create({
    name: 'View Orders',
    endpoint: '/api/v1/orders/*',
    method: 'GET',
    description: 'Access to order management',
    isMerchant: true
  });
  ordersTaskId = ordersTask._id;

  // Create roles with task references
  const adminRole = await Role.create({
    name: 'MERCHANT_ADMIN',
    description: 'Merchant Administrator',
    isSystemRole: false,
    tasks: [reportsGetTask._id, reportsPostTask._id] // Reference to both reports tasks
  });
  adminRoleId = adminRole._id;

  const staffRole = await Role.create({
    name: 'STAFF',
    description: 'Restaurant Staff',
    isSystemRole: false,
    tasks: [ordersTaskId] // Reference to orders task (NO access to reports)
  });
  staffRoleId = staffRole._id;

  // ========================================
  // MERCHANT 1 - Has reports feature enabled
  // ========================================
  const merchant1 = await Merchant.create({
    businessName: 'Merchant With Reports',
    slug: 'merchant-with-reports',
    email: 'reports@merchant1.com',
    phone: '+251911111111',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true, // Active subscription
    mode: 'Test',
    features: {
      core: {
        orders: { enabled: true },
        menu: { enabled: true }
      },
      optional: {
        reports: { enabled: true } // Reports feature ENABLED
      }
    }
  });
  merchant1Id = merchant1._id;

  const branch1 = await Branch.create({
    merchant: merchant1Id,
    name: 'Merchant 1 Branch',
    phone: '+251911111111',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Merchant 1 Branch, Addis Ababa, Ethiopia'
    }
  });
  branch1Id = branch1._id;

  // Admin user for merchant 1
  const adminUser1 = await User.create({
    firstName: 'Admin',
    lastName: 'User1',
    phone: '+251911111111',
    email: 'admin1@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant1Id,
    branch: [branch1Id],
    role: adminRoleId,
    isActive: true
  });
  adminUser1Id = adminUser1._id;

  const adminUser1WithRole = await User.findById(adminUser1Id).populate('role');
  adminToken1 = 'Bearer ' + createTestToken(adminUser1WithRole);

  // Staff user for merchant 1 (unauthorized role)
  const staffUser1 = await User.create({
    firstName: 'Staff',
    lastName: 'User1',
    phone: '+251911111112',
    email: 'staff1@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant1Id,
    branch: [branch1Id],
    role: staffRoleId,
    isActive: true
  });
  staffUser1Id = staffUser1._id;

  const staffUser1WithRole = await User.findById(staffUser1Id).populate('role');
  staffToken1 = 'Bearer ' + createTestToken(staffUser1WithRole);

  // Create test order for merchant 1
  const now = new Date();
  await Order.create({
    merchant: merchant1Id,
    branch: branch1Id,
    orderNumber: '#M1-001',
    customerName: 'Merchant 1 Customer',
    orderType: 'takeaway', // Changed from dine_in to avoid table requirement
    status: 'completed',
    paymentStatus: 'paid',
    items: [
      {
        menuItem: new mongoose.Types.ObjectId(),
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
        unitCost: 10
      }
    ],
    subtotal: 100, // Added subtotal
    totalAmount: 100,
    discountAmount: 0,
    taxAmount: 0,
    deliveryFee: 0,
    paymentDetails: { method: 'cash' },
    placedAt: now
  });

  // ========================================
  // MERCHANT 2 - Another merchant with reports (for cross-tenant testing)
  // ========================================
  const merchant2 = await Merchant.create({
    businessName: 'Merchant 2 With Reports',
    slug: 'merchant-2-with-reports',
    email: 'reports@merchant2.com',
    phone: '+251922222222',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true,
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
    name: 'Merchant 2 Branch',
    phone: '+251922222222',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Merchant 2 Branch, Addis Ababa, Ethiopia'
    }
  });
  branch2Id = branch2._id;

  const adminUser2 = await User.create({
    firstName: 'Admin',
    lastName: 'User2',
    phone: '+251922222222',
    email: 'admin2@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant2Id,
    branch: [branch2Id],
    role: adminRoleId,
    isActive: true
  });
  adminUser2Id = adminUser2._id;

  const adminUser2WithRole = await User.findById(adminUser2Id).populate('role');
  adminToken2 = 'Bearer ' + createTestToken(adminUser2WithRole);

  // Create test order for merchant 2
  await Order.create({
    merchant: merchant2Id,
    branch: branch2Id,
    orderNumber: '#M2-001',
    customerName: 'Merchant 2 Customer',
    orderType: 'takeaway', // Changed from dine_in to avoid table requirement
    status: 'completed',
    paymentStatus: 'paid',
    items: [
      {
        menuItem: new mongoose.Types.ObjectId(),
        quantity: 2,
        unitPrice: 200,
        totalPrice: 400,
        unitCost: 20
      }
    ],
    subtotal: 400, // Added subtotal
    totalAmount: 400,
    discountAmount: 0,
    taxAmount: 0,
    deliveryFee: 0,
    paymentDetails: { method: 'cash' },
    placedAt: now
  });

  // ========================================
  // MERCHANT 3 - WITHOUT reports feature (for feature gating testing)
  // ========================================
  const merchant3 = await Merchant.create({
    businessName: 'Merchant Without Reports',
    slug: 'merchant-without-reports',
    email: 'noreports@merchant3.com',
    phone: '+251933333333',
    status: 'approved',
    isActive: true,
    isSubscriptionActive: true,
    mode: 'Test',
    features: {
      core: {
        orders: { enabled: true },
        menu: { enabled: true }
      },
      optional: {
        reports: { enabled: false } // Reports feature DISABLED
      }
    }
  });
  merchant3Id = merchant3._id;

  const branch3 = await Branch.create({
    merchant: merchant3Id,
    name: 'Merchant 3 Branch',
    phone: '+251933333333',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Merchant 3 Branch, Addis Ababa, Ethiopia'
    }
  });
  branch3Id = branch3._id;

  const adminUser3 = await User.create({
    firstName: 'Admin',
    lastName: 'User3',
    phone: '+251933333333',
    email: 'admin3@test.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant3Id,
    branch: [branch3Id],
    role: adminRoleId,
    isActive: true
  });
  adminUser3Id = adminUser3._id;

  const adminUser3WithRole = await User.findById(adminUser3Id).populate('role');
  adminToken3 = 'Bearer ' + createTestToken(adminUser3WithRole);

}, 30000);

afterAll(async () => {
  // Cleanup
  await Order.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id, merchant3Id] } });
  await StockMovement.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id, merchant3Id] } });
  await Menu.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id, merchant3Id] } });
  await Ingredient.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id, merchant3Id] } });
  await Branch.deleteMany({ merchant: { $in: [merchant1Id, merchant2Id, merchant3Id] } });
  await User.deleteMany({ _id: { $in: [adminUser1Id, staffUser1Id, adminUser2Id, adminUser3Id] } });
  await Merchant.deleteMany({ _id: { $in: [merchant1Id, merchant2Id, merchant3Id] } });
  await Role.deleteMany({ _id: { $in: [adminRoleId, staffRoleId] } });
  await Task.deleteMany({ _id: { $in: [...reportsTaskId, ordersTaskId] } });
  await disconnectDatabase();
}, 30000);

describe('Security Middleware Integration Tests - Task 17.4', () => {
  
  const now = new Date();
  const dateFrom = new Date(now);
  dateFrom.setDate(dateFrom.getDate() - 7);
  const dateTo = now;

  // List of all report endpoints to test
  const reportEndpoints = [
    '/api/v1/reports/sales',
    '/api/v1/reports/orders',
    '/api/v1/reports/products',
    '/api/v1/reports/customers',
    '/api/v1/reports/delivery',
    '/api/v1/reports/profitability',
    '/api/v1/reports/staff',
    '/api/v1/reports/inventory'
  ];

  // ========================================
  // REQUIREMENT 17.1: Authentication Enforcement
  // Test unauthenticated requests return HTTP 401
  // ========================================
  describe('Req 17.1: Authentication Enforcement - Unauthenticated requests return HTTP 401', () => {
    
    reportEndpoints.forEach(endpoint => {
      it(`should return HTTP 401 for unauthenticated request to ${endpoint}`, async () => {
        const response = await request(app)
          .get(endpoint)
          .query({
            dateFrom: dateFrom.toISOString(),
            dateTo: dateTo.toISOString()
          });

        expect(response.status).toBe(401);
        // Check for error message in body (format may vary)
        const message = response.body.message || response.body.error || '';
        expect(message.toLowerCase()).toMatch(/not logged in|authentication|unauthorized/i);
      });
    });

    it('should return HTTP 401 for unauthenticated request to POST /api/v1/reports/exports', async () => {
      const response = await request(app)
        .post('/api/v1/reports/exports')
        .send({
          reportType: 'sales',
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('not logged in');
    });

    it('should return HTTP 401 for request with invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', 'Bearer invalid-token-12345')
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Invalid token');
    });

    it('should return HTTP 401 for request with expired JWT token', async () => {
      // Create an expired token (expired 1 day ago)
      const expiredPayload = {
        id: adminUser1Id.toString(),
        merchant: merchant1Id.toString(),
        branch: branch1Id.toString(),
        role: 'MERCHANT_ADMIN'
      };
      const expiredToken = jwt.sign(expiredPayload, process.env.JWT_SECRET, { expiresIn: '-1d' });

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', `Bearer ${expiredToken}`)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('expired');
    });
  });

  // ========================================
  // REQUIREMENT 17.2: Role Authorization Enforcement
  // Test unauthorized roles return HTTP 403
  // ========================================
  describe('Req 17.2: Role Authorization - Unauthorized roles return HTTP 403', () => {
    
    reportEndpoints.forEach(endpoint => {
      it(`should return HTTP 403 for STAFF role accessing ${endpoint}`, async () => {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', staffToken1)
          .query({
            dateFrom: dateFrom.toISOString(),
            dateTo: dateTo.toISOString()
          });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Access denied');
      });
    });

    it('should return HTTP 403 for STAFF role accessing POST /api/v1/reports/exports', async () => {
      const response = await request(app)
        .post('/api/v1/reports/exports')
        .set('Authorization', staffToken1)
        .send({
          reportType: 'sales',
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });

    it('should allow MERCHANT_ADMIN role to access report endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  // ========================================
  // REQUIREMENT 17.3: Feature Subscription Gating
  // Test merchant without 'reports' feature subscription returns HTTP 403
  // ========================================
  describe('Req 17.3: Feature Subscription Gating - Merchants without reports feature return HTTP 403', () => {
    
    reportEndpoints.forEach(endpoint => {
      it(`should return HTTP 403 for merchant without reports feature accessing ${endpoint}`, async () => {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', adminToken3) // Merchant 3 has reports disabled
          .query({
            dateFrom: dateFrom.toISOString(),
            dateTo: dateTo.toISOString()
          });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('reports');
        expect(response.body.message).toContain('not enabled');
      });
    });

    it('should return HTTP 403 for merchant without reports feature accessing POST /api/v1/reports/exports', async () => {
      const response = await request(app)
        .post('/api/v1/reports/exports')
        .set('Authorization', adminToken3) // Merchant 3 has reports disabled
        .send({
          reportType: 'sales',
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('reports');
      expect(response.body.message).toContain('not enabled');
    });

    it('should allow merchants with reports feature to access endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken1) // Merchant 1 has reports enabled
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should return HTTP 403 if merchant subscription is not active', async () => {
      // Temporarily disable subscription for merchant 1
      await Merchant.findByIdAndUpdate(merchant1Id, { isSubscriptionActive: false });

      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('subscription');

      // Restore subscription
      await Merchant.findByIdAndUpdate(merchant1Id, { isSubscriptionActive: true });
    });
  });

  // ========================================
  // REQUIREMENT 17.4: Cross-Tenant Access Prevention (merchantScopedQuery pattern)
  // Test user A cannot access user B's branch data
  // ========================================
  describe('Req 17.4: Cross-Tenant Access Prevention - Merchant scoping isolation', () => {
    
    it('should prevent Merchant 1 from accessing Merchant 2 branch data via branchId parameter', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken1) // Merchant 1 token
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          branchId: branch2Id.toString() // Trying to access Merchant 2's branch
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied to specified branch');
    });

    it('should only return data for the authenticated merchant (Merchant 1)', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      
      // Merchant 1 should only see their 1 order (totalAmount: 100)
      const summary = response.body.data.summary;
      expect(summary.orderCount).toBe(1);
      expect(summary.grossRevenue).toBe(100);
    });

    it('should only return data for the authenticated merchant (Merchant 2)', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken2)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      
      // Merchant 2 should only see their 1 order (totalAmount: 400)
      const summary = response.body.data.summary;
      expect(summary.orderCount).toBe(1);
      expect(summary.grossRevenue).toBe(400);
    });

    it('should enforce merchant scoping for orders report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/orders')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      // Merchant 1 should only see their orders
      expect(summary.totalOrders).toBe(1);
    });

    it('should enforce merchant scoping for products report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/products')
        .set('Authorization', adminToken2)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const summary = response.body.data.summary;
      
      // Merchant 2 should only see their products (2 items sold)
      expect(summary.totalItemsSold).toBe(2);
    });

    it('should prevent cross-tenant access via export job endpoints', async () => {
      // Create export job for merchant 1
      const createResponse = await request(app)
        .post('/api/v1/reports/exports')
        .set('Authorization', adminToken1)
        .send({
          reportType: 'sales',
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(createResponse.status).toBe(202);
      const jobId = createResponse.body.data.jobId;

      // Try to access merchant 1's export job with merchant 2's token
      const statusResponse = await request(app)
        .get(`/api/v1/reports/exports/${jobId}`)
        .set('Authorization', adminToken2); // Merchant 2 trying to access Merchant 1's job

      expect(statusResponse.status).toBe(404);
      expect(statusResponse.body.message).toContain('not found');
    });

    it('should allow merchant to access their own export jobs', async () => {
      // Create export job for merchant 1
      const createResponse = await request(app)
        .post('/api/v1/reports/exports')
        .set('Authorization', adminToken1)
        .send({
          reportType: 'sales',
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          format: 'csv'
        });

      expect(createResponse.status).toBe(202);
      const jobId = createResponse.body.data.jobId;

      // Access own export job with same merchant token
      const statusResponse = await request(app)
        .get(`/api/v1/reports/exports/${jobId}`)
        .set('Authorization', adminToken1);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.jobId).toBe(jobId);
      expect(statusResponse.body.data.reportType).toBe('sales');
    });
  });

  // ========================================
  // REQUIREMENT 17.5: PII Protection
  // Test that raw customer PII is not exposed in breakdown arrays
  // ========================================
  describe('Req 17.5: PII Protection - No raw customer PII in breakdown arrays', () => {
    
    it('should not expose customer phone numbers in customers report breakdown', async () => {
      const response = await request(app)
        .get('/api/v1/reports/customers')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const breakdown = response.body.data.breakdown;

      // Verify breakdown does not contain phone field
      if (Array.isArray(breakdown) && breakdown.length > 0) {
        breakdown.forEach(item => {
          expect(item).not.toHaveProperty('phone');
          expect(item).not.toHaveProperty('customerPhone');
        });
      }
    });

    it('should not expose customer email addresses in customers report breakdown', async () => {
      const response = await request(app)
        .get('/api/v1/reports/customers')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const breakdown = response.body.data.breakdown;

      // Verify breakdown does not contain email field
      if (Array.isArray(breakdown) && breakdown.length > 0) {
        breakdown.forEach(item => {
          expect(item).not.toHaveProperty('email');
          expect(item).not.toHaveProperty('customerEmail');
        });
      }
    });

    it('should use customer names or anonymized identifiers instead of PII', async () => {
      const response = await request(app)
        .get('/api/v1/reports/customers')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });

      expect(response.status).toBe(200);
      const breakdown = response.body.data.breakdown;

      // If breakdown has items, verify they use safe identifiers
      if (Array.isArray(breakdown) && breakdown.length > 0) {
        breakdown.forEach(item => {
          // Should have safe identifying fields
          const hasSafeId = item.hasOwnProperty('customerName') || 
                           item.hasOwnProperty('customerId') ||
                           item.hasOwnProperty('anonymousId');
          expect(hasSafeId).toBe(true);
          
          // Should NOT have PII fields
          expect(item).not.toHaveProperty('phone');
          expect(item).not.toHaveProperty('email');
        });
      }
    });
  });

  // ========================================
  // COMBINED SECURITY TEST
  // Test that all security layers work together
  // ========================================
  describe('Combined Security Layers - All middleware enforced together', () => {
    
    it('should enforce all security layers in correct order: auth → role → feature → tenant', async () => {
      // 1. No auth - should fail at authentication layer
      let response = await request(app)
        .get('/api/v1/reports/sales')
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });
      expect(response.status).toBe(401);

      // 2. With auth but wrong role - should fail at role authorization layer
      response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', staffToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');

      // 3. With auth and role but no feature - should fail at feature gate layer
      response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken3) // Merchant 3 has no reports feature
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('reports');

      // 4. With all layers passed but trying to access another tenant's branch - should fail at tenant scoping
      response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          branchId: branch2Id.toString() // Cross-tenant access attempt
        });
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied to specified branch');

      // 5. With all layers properly satisfied - should succeed
      response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', adminToken1)
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString()
        });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should maintain security even with valid pagination and filtering parameters', async () => {
      // Try to bypass security with pagination parameters
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', staffToken1) // Unauthorized role
        .query({
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          page: 1,
          limit: 100,
          groupBy: 'day',
          format: 'json'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });
  });
});
