/**
 * Orders Module Integration Tests
 * 
 * Tests:
 * 1. Place order (customer)
 * 2. Place order (staff)
 * 3. Update order status
 * 4. Add items to order
 * 5. Validation errors
 * 6. Error handling
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
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
  app = createApp();

  // Seed test data
  const merchant = await Merchant.create({
    name: 'Test Restaurant',
    email: 'test@restaurant.com',
    phone: '+251911111111',
  });
  merchantId = merchant._id;

  const branch = await Branch.create({
    merchant: merchantId,
    name: 'Test Branch',
    phone: '+251911111111',
  });
  branchId = branch._id;

  const menuItem = await Menu.create({
    merchant: merchantId,
    branch: branchId,
    name: 'Test Pizza',
    price: 250,
    publishStatus: 'published',
  });
  menuItemId = menuItem._id;

  // Mock auth token (would normally come from login)
  authToken = 'Bearer mock-jwt-token';
});

afterAll(async () => {
  // Cleanup
  await Order.deleteMany({ merchant: merchantId });
  await Merchant.deleteOne({ _id: merchantId });
  await mongoose.connection.close();
});

describe('Orders Module - Integration Tests', () => {
  describe('POST /api/v1/orders/staff - Staff Place Order', () => {
    it('should create order with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/orders/staff')
        .set('Authorization', authToken)
        .send({
          branchId: branchId.toString(),
          orderType: 'dine_in',
          tableId: new mongoose.Types.ObjectId().toString(),
          customerName: 'John Doe',
          customerPhone: '+251911111111',
          items: [
            {
              menuItemId: menuItemId.toString(),
              quantity: 2,
              notes: 'Extra cheese',
            },
          ],
          subtotal: 500,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Order');
      expect(response.body.data._id).toBeDefined();
      expect(response.body.data.orderNumber).toBeDefined();
      expect(response.body.data.status).toBe('pending');
    });

    it('should reject invalid order type', async () => {
      const response = await request(app)
        .post('/api/v1/orders/staff')
        .set('Authorization', authToken)
        .send({
          branchId: branchId.toString(),
          orderType: 'invalid_type',
          customerName: 'John Doe',
          items: [
            {
              menuItemId: menuItemId.toString(),
              quantity: 2,
            },
          ],
          subtotal: 500,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Validation');
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].field).toBe('orderType');
    });

    it('should reject dine_in without tableId', async () => {
      const response = await request(app)
        .post('/api/v1/orders/staff')
        .set('Authorization', authToken)
        .send({
          branchId: branchId.toString(),
          orderType: 'dine_in',
          // Missing tableId
          customerName: 'John Doe',
          items: [
            {
              menuItemId: menuItemId.toString(),
              quantity: 2,
            },
          ],
          subtotal: 500,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors[0].field).toBe('tableId');
    });

    it('should reject empty items', async () => {
      const response = await request(app)
        .post('/api/v1/orders/staff')
        .set('Authorization', authToken)
        .send({
          branchId: branchId.toString(),
          orderType: 'takeaway',
          customerName: 'John Doe',
          items: [], // Empty
          subtotal: 0,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors[0].field).toBe('items');
    });
  });

  describe('PATCH /api/v1/orders/:id/status - Update Order Status', () => {
    let orderId;

    beforeEach(async () => {
      // Create a test order
      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        customerName: 'Test Customer',
        orderType: 'dine_in',
        status: 'pending',
        items: [
          {
            menuItem: menuItemId,
            quantity: 1,
            unitPrice: 250,
            totalPrice: 250,
          },
        ],
        totalAmount: 250,
        orderNumber: `#T${Date.now()}`,
      });
      orderId = order._id;
    });

    it('should update status to accepted', async () => {
      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', authToken)
        .send({
          status: 'accepted',
          reason: 'Confirmed with kitchen',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('accepted');
      expect(response.body.message).toContain('accepted');
    });

    it('should validate status transition', async () => {
      // Try invalid transition
      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', authToken)
        .send({
          status: 'invalid_status',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Validation');
    });

    it('should reject invalid order ID', async () => {
      const response = await request(app)
        .patch(`/api/v1/orders/invalid_id/status`)
        .set('Authorization', authToken)
        .send({
          status: 'accepted',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/v1/orders/:id/add-items - Add Items', () => {
    let orderId;

    beforeEach(async () => {
      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        customerName: 'Test Customer',
        orderType: 'dine_in',
        status: 'pending',
        items: [
          {
            menuItem: menuItemId,
            quantity: 1,
            unitPrice: 250,
            totalPrice: 250,
          },
        ],
        totalAmount: 250,
        orderNumber: `#T${Date.now()}`,
      });
      orderId = order._id;
    });

    it('should add items to order', async () => {
      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/add-items`)
        .set('Authorization', authToken)
        .send({
          items: [
            {
              menuItemId: menuItemId.toString(),
              quantity: 1,
              notes: 'Extra sauce',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items.length).toBeGreaterThan(1);
    });

    it('should reject empty items array', async () => {
      const response = await request(app)
        .patch(`/api/v1/orders/${orderId}/add-items`)
        .set('Authorization', authToken)
        .send({
          items: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/orders/active - Get Active Orders', () => {
    it('should return active orders', async () => {
      // Create test order
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        customerName: 'Test Customer',
        orderType: 'dine_in',
        status: 'pending',
        items: [
          {
            menuItem: menuItemId,
            quantity: 1,
            unitPrice: 250,
            totalPrice: 250,
          },
        ],
        totalAmount: 250,
        orderNumber: `#T${Date.now()}`,
      });

      const response = await request(app)
        .get('/api/v1/orders/active')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.orders)).toBe(true);
      expect(response.body.meta.count).toBeGreaterThan(0);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/v1/orders/active?status=pending')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      response.body.data.orders.forEach(order => {
        expect(order.status).toBe('pending');
      });
    });
  });

  describe('Response Format Validation', () => {
    it('all success responses should have correct format', async () => {
      const response = await request(app)
        .get('/api/v1/orders/active')
        .set('Authorization', authToken);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('data');
      expect(typeof response.body.success).toBe('boolean');
      expect(typeof response.body.message).toBe('string');
    });

    it('all error responses should have correct format', async () => {
      const response = await request(app)
        .post('/api/v1/orders/staff')
        .set('Authorization', authToken)
        .send({
          // Invalid/empty body
        });

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
      expect(response.body.success).toBe(false);
    });
  });
});
