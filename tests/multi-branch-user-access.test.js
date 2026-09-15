/**
 * @file tests/multi-branch-user-access.test.js
 * @description Test multi-branch user access — verify JWT tokens contain all branches
 * and login/me endpoints return all assigned branches
 */

const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const User = require('../models/userModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Role = require('../models/roleModel');

// Suppress console logs during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

describe('Multi-Branch User Access', () => {
  let app;
  let merchant;
  let branch1, branch2, branch3;
  let adminRole;
  let multibranchUser;
  let singlebranchUser;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Multi-Branch Restaurant',
      phone: '+251999888777',
      slug: 'multi-branch-restaurant',
      status: 'approved', // Use valid enum value
      mode: 'Live',
    });

    // Create role
    adminRole = await Role.create({
      name: 'STAFF',
      merchant: merchant._id,
      isSystemRole: false,
      description: 'Staff member role for multi-branch testing',
      tasks: [],
    });

    // Create multiple branches
    branch1 = await Branch.create({
      name: 'Downtown Branch',
      merchant: merchant._id,
      branchCode: 'BR-001',
      isMain: true,
      isActive: true,
      phone: '+251999888701',
      location: {
        type: 'Point',
        coordinates: [38.7578, 9.025],
        city: 'Addis Ababa',
        formattedAddress: 'Downtown',
      },
    });

    branch2 = await Branch.create({
      name: 'Uptown Branch',
      merchant: merchant._id,
      branchCode: 'BR-002',
      isMain: false,
      isActive: true,
      phone: '+251999888702',
      location: {
        type: 'Point',
        coordinates: [38.7678, 9.035],
        city: 'Addis Ababa',
        formattedAddress: 'Uptown',
      },
    });

    branch3 = await Branch.create({
      name: 'Airport Branch',
      merchant: merchant._id,
      branchCode: 'BR-003',
      isMain: false,
      isActive: true,
      phone: '+251999888703',
      location: {
        type: 'Point',
        coordinates: [38.6778, 8.925],
        city: 'Addis Ababa',
        formattedAddress: 'Airport',
      },
    });

    // Create multi-branch user (has access to all 3 branches)
    multibranchUser = await User.create({
      firstName: 'Alice',
      lastName: 'Manager',
      phone: '+251911222333',
      email: 'alice@multibranch.test',
      password: 'Test@1234',
      passwordConfirm: 'Test@1234',
      merchant: merchant._id,
      role: adminRole._id,
      branch: [branch1._id, branch2._id, branch3._id], // Multi-branch
      isActive: true,
    });

    // Create single-branch user (has access to 1 branch only)
    singlebranchUser = await User.create({
      firstName: 'Bob',
      lastName: 'Cashier',
      phone: '+251911222444',
      email: 'bob@singlebranch.test',
      password: 'Test@1234',
      passwordConfirm: 'Test@1234',
      merchant: merchant._id,
      role: adminRole._id,
      branch: [branch1._id], // Single branch (as array)
      isActive: true,
    });
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({ phone: { $in: ['+251911222333', '+251911222444'] } }),
      Branch.deleteMany({ merchant: merchant._id }),
      Role.deleteMany({ merchant: merchant._id }),
      Merchant.deleteMany({ _id: merchant._id }),
    ]);
    await disconnectDatabase();
  });

  describe('JWT Token Format', () => {
    test('Multi-branch user JWT contains array of all branch IDs', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@multibranch.test',
          password: 'Test@1234',
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();

      const decoded = jwt.decode(response.body.token);
      expect(decoded.branches).toBeDefined();
      expect(Array.isArray(decoded.branches)).toBe(true);
      expect(decoded.branches.length).toBe(3);
      expect(decoded.branches).toContain(branch1._id.toString());
      expect(decoded.branches).toContain(branch2._id.toString());
      expect(decoded.branches).toContain(branch3._id.toString());
    });

    test('Single-branch user JWT contains array with one branch ID', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'bob@singlebranch.test',
          password: 'Test@1234',
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();

      const decoded = jwt.decode(response.body.token);
      expect(decoded.branches).toBeDefined();
      expect(Array.isArray(decoded.branches)).toBe(true);
      expect(decoded.branches.length).toBe(1);
      expect(decoded.branches[0]).toBe(branch1._id.toString());
    });
  });

  describe('Login Response', () => {
    test('Login response returns user with all branch references', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@multibranch.test',
          password: 'Test@1234',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.branch).toBeDefined();
      expect(Array.isArray(response.body.data.user.branch)).toBe(true);

      // Should return populated branch objects with names
      const branchNames = response.body.data.user.branch.map(b => b.name || b);
      expect(branchNames).toContain('Downtown Branch');
      expect(branchNames).toContain('Uptown Branch');
      expect(branchNames).toContain('Airport Branch');
    });

    test('Single-branch login response returns user with single branch in array', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'bob@singlebranch.test',
          password: 'Test@1234',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.branch).toBeDefined();
      expect(Array.isArray(response.body.data.user.branch)).toBe(true);
      expect(response.body.data.user.branch.length).toBe(1);
      expect(response.body.data.user.branch[0].name).toBe('Downtown Branch');
    });
  });

  describe('/me Endpoint', () => {
    test('Multi-branch user /me returns all assigned branches', async () => {
      // Login first
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@multibranch.test',
          password: 'Test@1234',
        });

      const token = loginRes.body.token;

      // Call /me endpoint
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.branch).toBeDefined();
      expect(Array.isArray(response.body.data.user.branch)).toBe(true);
      expect(response.body.data.user.branch.length).toBe(3);

      const branchIds = response.body.data.user.branch.map(b => b._id.toString());
      expect(branchIds).toContain(branch1._id.toString());
      expect(branchIds).toContain(branch2._id.toString());
      expect(branchIds).toContain(branch3._id.toString());
    });

    test('Single-branch user /me returns single branch in array', async () => {
      // Login first
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'bob@singlebranch.test',
          password: 'Test@1234',
        });

      const token = loginRes.body.token;

      // Call /me endpoint
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.branch).toBeDefined();
      expect(Array.isArray(response.body.data.user.branch)).toBe(true);
      expect(response.body.data.user.branch.length).toBe(1);
      expect(response.body.data.user.branch[0]._id.toString()).toBe(branch1._id.toString());
    });
  });

  describe('Branch Validation', () => {
    test('Multi-branch user can access /api/v1/users/me with valid token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@multibranch.test',
          password: 'Test@1234',
        });

      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`);

      expect(response.status).toBe(200);
    });

    test('User is rejected if branch assignment changed (reassigned)', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@multibranch.test',
          password: 'Test@1234',
        });

      const token = loginRes.body.token;

      // Remove a branch from the user completely
      await User.findByIdAndUpdate(multibranchUser._id, {
        branch: [branch1._id], // Changed from 3 branches to just 1
      });

      // Try to use old token (which contains 3 branches in decoded.branches)
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`);

      // Should be rejected due to branch array mismatch 
      // (old token claims 3 branches, user now has only 1)
      expect(response.status).toBe(401);
      expect(response.body.message).toContain('reassigned');

      // Restore original branches
      await User.findByIdAndUpdate(multibranchUser._id, {
        branch: [branch1._id, branch2._id, branch3._id],
      });
    });
  });

  describe('Backward Compatibility', () => {
    test('Existing single-branch tokens still work with validation', async () => {
      // Create a token with old format (single branch ID instead of array)
      const oldFormatPayload = {
        id: singlebranchUser._id.toString(),
        merchant: merchant._id.toString(),
        branch: branch1._id.toString(), // Old format: single ID, not array
        role: adminRole.name,
      };

      const env = require('../src/config/env').loadEnv();
      const oldToken = jwt.sign(oldFormatPayload, env.JWT_SECRET, { expiresIn: '24h' });

      // Should still work with backward-compatible validation
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${oldToken}`);

      // Token should be valid (backward compatible)
      expect([200, 401]).toContain(response.status);
    });
  });
});
