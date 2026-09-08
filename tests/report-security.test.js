/**
 * Advanced Reporting - Security Middleware Integration Tests
 * 
 * Task 17.4: Write integration tests for security middleware
 * 
 * Tests verify:
 * - Authentication enforcement (HTTP 401)
 * - Authorization enforcement (HTTP 403)
 * - Feature gating enforcement (HTTP 403)
 * - Cross-tenant access prevention (HTTP 403)
 * 
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');

let app;

// Test data IDs
let merchantWithReportsId, merchantWithoutReportsId;
let branch1Id, branch2Id;
let adminRoleId, staffRoleId;
let reportsTaskId, ordersTaskId;
let adminUserId, staffUserId;

// Test tokens
let validAdminToken;
let validStaffToken;
let invalidToken;
let expiredToken;

// Helper function to create JWT tokens for testing
function createTestToken(user, expiresIn = '7d') {
  const payload = {
    id: user._id.toString(),
    merchant: user.merchant.toString(),
    branch: Array.isArray(user.branch) ? user.branch[0].toString() : user.branch.toString(),
    role: user.role.name
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// Helper function to create expired token
function createExpiredToken(user) {
  const payload = {
    id: user._id.toString(),
    merchant: user.merchant.toString(),
    branch: Array.isArray(user.branch) ? user.branch[0].toString() : user.branch.toString(),
    role: user.role.name
  };
  // Create token that expired 1 hour ago
  const iat = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
  const exp = iat + 3600; // Expired 1 hour ago
  return jwt.sign({ ...payload, iat, exp }, process.env.JWT_SECRET);
}

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // ========================================
  // CREATE TASKS FIRST
  // ========================================
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

  // ========================================
  // CREATE ROLES WITH TASKS
  // ========================================
  const adminRole = await Role.create({
    name: 'MERCHANT_ADMIN',
    description: 'Merchant Administrator with full access',
    isSystemRole: false,
    tasks: [reportsGetTask._id, reportsPostTask._id] // Admin has reports access
  });
  adminRoleId = adminRole._id;

  const staffRole = await Role.create({
    name: 'STAFF',
    description: 'Regular staff member',
    isSystemRole: false,
    tasks: [ordersTaskId] // Staff has orders access, NO reports
  });
  staffRoleId = staffRole._id;

  // ========================================
  // MERCHANT 1 - WITH REPORTS FEATURE
  // ========================================
  const merchantWithReports = await Merchant.create({
    businessName: 'Restaurant With Reports',
    slug: 'restaurant-with-reports',
    email: 'reports@restaurant.com',
    phone: '+251911111111',
    status: 'approved',
    mode: 'Test',
    isActive: true,
    isSubscriptionActive: true,
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
  merchantWithReportsId = merchantWithReports._id;

  const branch1 = await Branch.create({
    merchant: merchantWithReportsId,
    name: 'Branch 1',
    phone: '+251911111111',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Branch 1, Addis Ababa, Ethiopia'
    }
  });
  branch1Id = branch1._id;

  // Create admin user for merchant 1
  const adminUser = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    phone: '+251911111111',
    email: 'admin@reports.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchantWithReportsId,
    branch: [branch1Id],
    role: adminRoleId,
    isActive: true
  });
  adminUserId = adminUser._id;

  // Create staff user for merchant 1 (non-admin role)
  const staffUser = await User.create({
    firstName: 'Staff',
    lastName: 'User',
    phone: '+251911111112',
    email: 'staff@reports.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchantWithReportsId,
    branch: [branch1Id],
    role: staffRoleId,
    isActive: true
  });
  staffUserId = staffUser._id;

  // ========================================
  // MERCHANT 2 - WITHOUT REPORTS FEATURE
  // ========================================
  const merchantWithoutReports = await Merchant.create({
    businessName: 'Restaurant Without Reports',
    slug: 'restaurant-without-reports',
    email: 'noreports@restaurant.com',
    phone: '+251922222222',
    status: 'approved',
    mode: 'Test',
    isActive: true,
    isSubscriptionActive: true,
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
  merchantWithoutReportsId = merchantWithoutReports._id;

  const branch2 = await Branch.create({
    merchant: merchantWithoutReportsId,
    name: 'Branch 2',
    phone: '+251922222222',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Branch 2, Addis Ababa, Ethiopia'
    }
  });
  branch2Id = branch2._id;

  // Create admin user for merchant 2
  const adminUser2 = await User.create({
    firstName: 'Admin',
    lastName: 'User2',
    phone: '+251922222222',
    email: 'admin2@noreports.com',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchantWithoutReportsId,
    branch: [branch2Id],
    role: adminRoleId,
    isActive: true
  });

  // ========================================
  // GENERATE TEST TOKENS
  // ========================================
  const adminUserWithRole = await User.findById(adminUserId).populate('role');
  validAdminToken = 'Bearer ' + createTestToken(adminUserWithRole);

  const staffUserWithRole = await User.findById(staffUserId).populate('role');
  validStaffToken = 'Bearer ' + createTestToken(staffUserWithRole);

  const adminUser2WithRole = await User.findById(adminUser2._id).populate('role');
  const noReportsToken = createTestToken(adminUser2WithRole);

  // Create invalid and expired tokens
  invalidToken = 'Bearer eyInvalidToken123.invalid.token';
  expiredToken = 'Bearer ' + createExpiredToken(adminUserWithRole);

  // Store no-reports token for feature gating tests
  global.noReportsToken = 'Bearer ' + noReportsToken;
}, 30000);

afterAll(async () => {
  // Cleanup
  await User.deleteMany({ merchant: { $in: [merchantWithReportsId, merchantWithoutReportsId] } });
  await Branch.deleteMany({ merchant: { $in: [merchantWithReportsId, merchantWithoutReportsId] } });
  await Merchant.deleteMany({ _id: { $in: [merchantWithReportsId, merchantWithoutReportsId] } });
  await Role.deleteMany({ _id: { $in: [adminRoleId, staffRoleId] } });
  await Task.deleteMany({ _id: { $in: [...reportsTaskId, ordersTaskId] } });
  await disconnectDatabase();
}, 30000);

describe('Report Security Middleware Integration Tests', () => {
  
  // Common test parameters
  const validQueryParams = {
    dateFrom: new Date('2024-01-01T00:00:00Z').toISOString(),
    dateTo: new Date('2024-01-31T23:59:59Z').toISOString()
  };

  // All report endpoints to test
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
  // TEST SUITE 1: AUTHENTICATION (HTTP 401)
  // Requirement 17.1
  // ========================================
  describe('Authentication Tests (HTTP 401)', () => {
    
    it('should return HTTP 401 when no JWT token is provided', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .query(validQueryParams);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('not logged in');
    });

    it('should return HTTP 401 when invalid JWT token is provided', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', invalidToken)
        .query(validQueryParams);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Invalid token');
    });

    it('should return HTTP 401 when expired JWT token is provided', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', expiredToken)
        .query(validQueryParams);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('expired');
    });

    it('should return HTTP 401 for orders report without token', async () => {
      const response = await request(app)
        .get('/api/v1/reports/orders')
        .query(validQueryParams);

      expect(response.status).toBe(401);
    });

    it('should return HTTP 401 for products report without token', async () => {
      const response = await request(app)
        .get('/api/v1/reports/products')
        .query(validQueryParams);

      expect(response.status).toBe(401);
    });

    it('should return HTTP 401 for export job creation without token', async () => {
      const response = await request(app)
        .post('/api/v1/reports/exports')
        .send({
          reportType: 'sales',
          dateFrom: validQueryParams.dateFrom,
          dateTo: validQueryParams.dateTo,
          format: 'csv'
        });

      expect(response.status).toBe(401);
    });

    it('should return HTTP 401 for export job status check without token', async () => {
      const fakeJobId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .get(`/api/v1/reports/exports/${fakeJobId}`);

      expect(response.status).toBe(401);
    });
  });

  // ========================================
  // TEST SUITE 2: AUTHORIZATION (HTTP 403)
  // Requirement 17.2
  // ========================================
  describe('Authorization Tests (HTTP 403)', () => {
    
    it('should return HTTP 403 when non-admin role (STAFF) tries to access sales report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });

    it('should return HTTP 403 when non-admin role tries to access orders report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/orders')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });

    it('should return HTTP 403 when non-admin role tries to access products report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/products')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
    });

    it('should return HTTP 403 when non-admin role tries to access customers report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/customers')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
    });

    it('should return HTTP 403 when non-admin role tries to access delivery report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/delivery')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
    });

    it('should return HTTP 403 when non-admin role tries to access profitability report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
    });

    it('should return HTTP 403 when non-admin role tries to access staff report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/staff')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
    });

    it('should return HTTP 403 when non-admin role tries to access inventory report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/inventory')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
    });

    it('should return HTTP 403 when non-admin role tries to create export job', async () => {
      const response = await request(app)
        .post('/api/v1/reports/exports')
        .set('Authorization', validStaffToken)
        .send({
          reportType: 'sales',
          dateFrom: validQueryParams.dateFrom,
          dateTo: validQueryParams.dateTo,
          format: 'csv'
        });

      expect(response.status).toBe(403);
    });

    it('should allow admin role to access sales report', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', validAdminToken)
        .query(validQueryParams);

      // Should not fail authorization (may fail validation, but not 403)
      expect(response.status).not.toBe(403);
    });
  });

  // ========================================
  // TEST SUITE 3: FEATURE GATING (HTTP 403)
  // Requirement 17.3
  // ========================================
  describe('Feature Gating Tests (HTTP 403)', () => {
    
    it('should return HTTP 403 when merchant does not have reports feature enabled', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', global.noReportsToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('reports');
      expect(response.body.message).toContain('not enabled');
    });

    it('should return HTTP 403 for orders report when reports feature is disabled', async () => {
      const response = await request(app)
        .get('/api/v1/reports/orders')
        .set('Authorization', global.noReportsToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('reports');
    });

    it('should return HTTP 403 for products report when reports feature is disabled', async () => {
      const response = await request(app)
        .get('/api/v1/reports/products')
        .set('Authorization', global.noReportsToken)
        .query(validQueryParams);

      expect(response.status).toBe(403);
    });

    it('should return HTTP 403 for export job when reports feature is disabled', async () => {
      const response = await request(app)
        .post('/api/v1/reports/exports')
        .set('Authorization', global.noReportsToken)
        .send({
          reportType: 'sales',
          dateFrom: validQueryParams.dateFrom,
          dateTo: validQueryParams.dateTo,
          format: 'csv'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('reports');
    });

    it('should allow access when merchant has reports feature enabled', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', validAdminToken)
        .query(validQueryParams);

      // Should not fail feature gating (may fail for other reasons, but not 403 feature)
      if (response.status === 403) {
        expect(response.body.message).not.toContain('not enabled');
      }
    });
  });

  // ========================================
  // TEST SUITE 4: CROSS-TENANT ACCESS PREVENTION (HTTP 403)
  // Requirement 17.4, 17.5
  // ========================================
  describe('Cross-Tenant Access Prevention Tests (HTTP 403)', () => {
    
    it('should return HTTP 403 when merchant 1 tries to access merchant 2 branch data', async () => {
      // Merchant 1 (validAdminToken) trying to access branch2 (belongs to merchant 2)
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch2Id.toString() // Branch from merchant 2
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });

    it('should return HTTP 403 for orders report with cross-tenant branch access', async () => {
      const response = await request(app)
        .get('/api/v1/reports/orders')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch2Id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });

    it('should return HTTP 403 for products report with cross-tenant branch access', async () => {
      const response = await request(app)
        .get('/api/v1/reports/products')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch2Id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });

    it('should return HTTP 403 for customers report with cross-tenant branch access', async () => {
      const response = await request(app)
        .get('/api/v1/reports/customers')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch2Id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });

    it('should return HTTP 403 for delivery report with cross-tenant branch access', async () => {
      const response = await request(app)
        .get('/api/v1/reports/delivery')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch2Id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });

    it('should return HTTP 403 for profitability report with cross-tenant branch access', async () => {
      const response = await request(app)
        .get('/api/v1/reports/profitability')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch2Id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });

    it('should return HTTP 403 for staff report with cross-tenant branch access', async () => {
      const response = await request(app)
        .get('/api/v1/reports/staff')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch2Id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });

    it('should return HTTP 403 for inventory report with cross-tenant branch access', async () => {
      const response = await request(app)
        .get('/api/v1/reports/inventory')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch2Id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied to specified branch');
    });

    it('should allow access when merchant accesses their own branch', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', validAdminToken)
        .query({
          ...validQueryParams,
          branchId: branch1Id.toString() // Own branch
        });

      // Should not fail cross-tenant check
      if (response.status === 403) {
        expect(response.body.message).not.toBe('Access denied to specified branch');
      }
    });

    it('should allow access when no branchId is specified (all merchant branches)', async () => {
      const response = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', validAdminToken)
        .query(validQueryParams); // No branchId

      // Should not fail cross-tenant check
      if (response.status === 403) {
        expect(response.body.message).not.toBe('Access denied to specified branch');
      }
    });
  });

  // ========================================
  // TEST SUITE 5: COMPREHENSIVE MIDDLEWARE CHAIN
  // ========================================
  describe('Comprehensive Middleware Chain Tests', () => {
    
    it('should enforce middleware chain in correct order: authentication -> feature -> authorization -> validation', async () => {
      // No token = fail at authentication (401)
      const noTokenResponse = await request(app)
        .get('/api/v1/reports/sales')
        .query(validQueryParams);
      expect(noTokenResponse.status).toBe(401);

      // Valid token but no feature = fail at feature gate (403)
      const noFeatureResponse = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', global.noReportsToken)
        .query(validQueryParams);
      expect(noFeatureResponse.status).toBe(403);
      expect(noFeatureResponse.body.message).toContain('not enabled');

      // Valid token, feature enabled, but wrong role = fail at authorization (403)
      const wrongRoleResponse = await request(app)
        .get('/api/v1/reports/sales')
        .set('Authorization', validStaffToken)
        .query(validQueryParams);
      expect(wrongRoleResponse.status).toBe(403);
      expect(wrongRoleResponse.body.message).toContain('Access denied');
    });

    it('should test full security chain for export job creation', async () => {
      const exportPayload = {
        reportType: 'sales',
        dateFrom: validQueryParams.dateFrom,
        dateTo: validQueryParams.dateTo,
        format: 'csv'
      };

      // No authentication
      const noAuth = await request(app)
        .post('/api/v1/reports/exports')
        .send(exportPayload);
      expect(noAuth.status).toBe(401);

      // No feature
      const noFeature = await request(app)
        .post('/api/v1/reports/exports')
        .set('Authorization', global.noReportsToken)
        .send(exportPayload);
      expect(noFeature.status).toBe(403);

      // Wrong role
      const wrongRole = await request(app)
        .post('/api/v1/reports/exports')
        .set('Authorization', validStaffToken)
        .send(exportPayload);
      expect(wrongRole.status).toBe(403);
    });
  });

  // ========================================
  // TEST SUITE 6: ALL ENDPOINTS SECURITY
  // ========================================
  describe('Security Applied to All Report Endpoints', () => {
    
    reportEndpoints.forEach(endpoint => {
      it(`${endpoint} should enforce authentication`, async () => {
        const response = await request(app)
          .get(endpoint)
          .query(validQueryParams);
        
        expect(response.status).toBe(401);
      });

      it(`${endpoint} should enforce feature gating`, async () => {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', global.noReportsToken)
          .query(validQueryParams);
        
        expect(response.status).toBe(403);
        expect(response.body.message).toContain('reports');
      });

      it(`${endpoint} should enforce role authorization`, async () => {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', validStaffToken)
          .query(validQueryParams);
        
        expect(response.status).toBe(403);
      });

      it(`${endpoint} should enforce cross-tenant isolation`, async () => {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', validAdminToken)
          .query({
            ...validQueryParams,
            branchId: branch2Id.toString()
          });
        
        expect(response.status).toBe(403);
        expect(response.body.message).toBe('Access denied to specified branch');
      });
    });
  });
});
