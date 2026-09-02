/**
 * Test: OrderFlowConfig API Endpoints (Step 2)
 * 
 * Integration tests for:
 * - GET /api/v1/order-flow-config
 * - PUT /api/v1/order-flow-config
 * - DTO validation
 * - Merchant scoping
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const OrderFlowConfig = require('../models/OrderFlowConfig');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');
const Merchant = require('../models/merchantModel');

describe('OrderFlowConfig API', () => {
  let app;
  let merchant1, merchant2;
  let user1, token1, user2, token2;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();

    // Create tasks
    const viewTask = await Task.create({
      name: 'orderFlow.view',
      endpoint: '/api/v1/order-flow-config',
      method: 'GET',
      description: 'View order flow config',
      isMerchant: true,
    });

    const updateTask = await Task.create({
      name: 'orderFlow.update',
      endpoint: '/api/v1/order-flow-config',
      method: 'PUT',
      description: 'Update order flow config',
      isMerchant: true,
    });

    // Create merchants
    merchant1 = await Merchant.create({
      businessName: 'Merchant 1',
      email: 'merchant1@test.com',
      phone: '+251911000001',
      slug: 'merchant-1',
      address: { city: 'Addis Ababa', subCity: 'Bole', wereda: '01' },
      subscriptionType: 'premium',
      subscriptionStatus: 'active',
      features: { orders: true },
      owner: { 
        fullName: 'Owner One',
        email: 'owner1@test.com', 
        phone: '+251911111111',
        gender: 'Male',
      },
    });

    merchant2 = await Merchant.create({
      businessName: 'Merchant 2',
      email: 'merchant2@test.com',
      phone: '+251911000002',
      slug: 'merchant-2',
      address: { city: 'Addis Ababa', subCity: 'Bole', wereda: '02' },
      subscriptionType: 'premium',
      subscriptionStatus: 'active',
      features: { orders: true },
      owner: { 
        fullName: 'Owner Two',
        email: 'owner2@test.com', 
        phone: '+251911111112',
        gender: 'Male',
      },
    });

    // Create roles
    const role1 = await Role.create({
      name: 'ADMIN-1',
      description: 'Admin for merchant 1',
      merchant: merchant1._id,
      tasks: [viewTask._id, updateTask._id],
    });

    const role2 = await Role.create({
      name: 'ADMIN-2',
      description: 'Admin for merchant 2',
      merchant: merchant2._id,
      tasks: [viewTask._id, updateTask._id],
    });

    // Create users
    user1 = await User.create({
      firstName: 'User',
      lastName: 'One',
      phone: '+251911111111',
      password: 'password123',
      passwordConfirm: 'password123',
      merchant: merchant1._id,
      role: role1._id,
    });

    user2 = await User.create({
      firstName: 'User',
      lastName: 'Two',
      phone: '+251911111112',
      password: 'password123',
      passwordConfirm: 'password123',
      merchant: merchant2._id,
      role: role2._id,
    });

    // Login users
    const login1 = await request(app)
      .post('/api/v1/users/login')
      .send({ phone: '+251911111111', password: 'password123' });
    token1 = login1.body.token;

    const login2 = await request(app)
      .post('/api/v1/users/login')
      .send({ phone: '+251911111112', password: 'password123' });
    token2 = login2.body.token;
  });

  afterAll(async () => {
    await OrderFlowConfig.deleteMany({});
    await User.deleteMany({});
    await Role.deleteMany({});
    await Task.deleteMany({});
    await Merchant.deleteMany({});
    await disconnectDatabase();
  });

  afterEach(async () => {
    await OrderFlowConfig.deleteMany({});
  });

  describe('GET /api/v1/order-flow-config', () => {
    it('should lazy-create and return default config for merchant', async () => {
      const response = await request(app)
        .get('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.config).toBeDefined();

      const { config } = response.body.data;

      expect(config.merchantId.toString()).toBe(merchant1._id.toString());
      expect(config.channels.waiter.requiresReview).toBe(false);
      expect(config.channels.waiter.reviewerRole).toBe(null);
      expect(config.channels.web.requiresReview).toBe(true);
      expect(config.channels.web.reviewerRole).toBe('waiter');
      expect(config.channels.admin.requiresReview).toBe(true);
      expect(config.channels.admin.reviewerRole).toBe('support');
      expect(config.channels.telegram.requiresReview).toBe(true);
      expect(config.channels.telegram.reviewerRole).toBe('support');
    });

    it('should return correct merchant-scoped config', async () => {
      // Merchant 1 gets config
      const response1 = await request(app)
        .get('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`);

      // Merchant 2 gets config
      const response2 = await request(app)
        .get('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token2}`);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Different merchants, different configs
      expect(response1.body.data.config.merchantId).not.toBe(
        response2.body.data.config.merchantId
      );
    });
  });

  describe('PUT /api/v1/order-flow-config', () => {
    it('should update web channel config', async () => {
      const response = await request(app)
        .put('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          channels: {
            web: {
              requiresReview: false,
              reviewerRole: null,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.config.channels.web.requiresReview).toBe(false);
      expect(response.body.data.config.channels.web.reviewerRole).toBe(null);

      // Other channels unchanged
      expect(response.body.data.config.channels.waiter.requiresReview).toBe(false);
      expect(response.body.data.config.channels.admin.requiresReview).toBe(true);
      expect(response.body.data.config.channels.telegram.requiresReview).toBe(true);
    });

    it('should update multiple channels', async () => {
      const response = await request(app)
        .put('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          channels: {
            web: {
              requiresReview: false,
              reviewerRole: null,
            },
            telegram: {
              requiresReview: false,
              reviewerRole: null,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.config.channels.web.requiresReview).toBe(false);
      expect(response.body.data.config.channels.telegram.requiresReview).toBe(false);
    });

    it('should reject unknown channel key', async () => {
      const response = await request(app)
        .put('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          channels: {
            phone: {  // Invalid channel
              requiresReview: true,
              reviewerRole: 'waiter',
            },
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/Invalid channel key/);
      expect(response.body.message).toMatch(/phone/);
    });

    it('should reject requiresReview=true with reviewerRole=null', async () => {
      const response = await request(app)
        .put('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          channels: {
            web: {
              requiresReview: true,
              reviewerRole: null,  // Invalid
            },
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/reviewerRole/);
    });

    it('should reject invalid reviewerRole value', async () => {
      const response = await request(app)
        .put('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          channels: {
            web: {
              requiresReview: true,
              reviewerRole: 'invalid_role',  // Invalid
            },
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
    });

    it('should reject empty channels object', async () => {
      const response = await request(app)
        .put('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          channels: {},  // Empty
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toMatch(/At least one channel/);
    });

    it('should maintain merchant isolation on updates', async () => {
      // Merchant 1 updates their config
      await request(app)
        .put('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          channels: {
            web: {
              requiresReview: false,
              reviewerRole: null,
            },
          },
        });

      // Merchant 2 gets their config (should have defaults)
      const response2 = await request(app)
        .get('/api/v1/order-flow-config')
        .set('Authorization', `Bearer ${token2}`);

      expect(response2.status).toBe(200);
      expect(response2.body.data.config.channels.web.requiresReview).toBe(true);
      expect(response2.body.data.config.channels.web.reviewerRole).toBe('waiter');
    });
  });
});
