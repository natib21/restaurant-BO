const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const PaymentVerification = require('../models/PaymentVerification');
const Merchant = require('../models/merchantModel');
const User = require('../models/userModel');
const Branch = require('../models/branchModel');
const { AuthService } = require('../src/modules/auth/auth.service');

describe('Payment Verification Module', () => {
  let app;
  let merchant;
  let branch;
  let user;
  let token;
  let order;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
    
    // Create test merchant
    merchant = await Merchant.create({
      businessName: 'Test Restaurant',
      slug: 'test-restaurant-payment-verification',
      email: 'test@restaurant.com',
      phone: '+251911234567',
      address: { city: 'Addis Ababa', country: 'Ethiopia' },
      status: 'approved',
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@test.com',
        phone: '+251911234567',
      },
    });

    // Create test branch
    branch = await Branch.create({
      name: 'Main Branch',
      merchant: merchant._id,
      phone: '+251911234567',
      location: {
        city: 'Addis Ababa',
        coordinates: [9.0320, 38.7469], // Addis Ababa coordinates
      },
    });

    // Create test role
    const Role = require('../models/roleModel');
    const role = await Role.create({
      name: 'Admin',
      description: 'Test Admin Role',
      merchant: merchant._id,
      tasks: [],
    });

    // Create test user
    user = await User.create({
      firstName: 'Test',
      lastName: 'Manager',
      name: 'Test Manager',
      email: 'manager@test.com',
      password: 'password123',
      passwordConfirm: 'password123',
      phone: '+251911234567',
      merchant: merchant._id,
      branch: branch._id,
      role: role._id,
      isActive: true,
    });

    token = AuthService.signToken(user);
  });

  afterAll(async () => {
    const Role = require('../models/roleModel');
    await Merchant.deleteMany({});
    await Branch.deleteMany({});
    await Role.deleteMany({});
    await User.deleteMany({});
    await Order.deleteMany({});
    await PaymentVerification.deleteMany({});
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Create test order before each test
    order = await Order.create({
      merchant: merchant._id,
      branch: branch._id,
      orderNumber: `TEST-${Date.now()}`,
      orderType: 'dine_in',
      table: new mongoose.Types.ObjectId(),
      customerName: 'Test Customer',
      items: [
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 2,
          unitPrice: 125.00,
          totalPrice: 250.00,
        },
      ],
      subtotal: 250.00,
      totalAmount: 250.00,
      paymentStatus: 'unpaid',
      status: 'served',
    });
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await PaymentVerification.deleteMany({});
  });

  describe('POST /api/v1/payment-verification/initiate', () => {
    it('should create verification record with lookup_failed for invalid receipt number format', async () => {
      const res = await request(app)
        .post('/api/v1/payment-verification/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderId: order._id.toString(),
          provider: 'telebirr',
          receiptNumber: 'INVALID',
        })
        .expect(400);

      expect(res.body.status).toBe('Fail');
      expect(res.body.message).toContain('Invalid Telebirr receipt format');
    });

    it('should reject already paid order', async () => {
      order.paymentStatus = 'paid';
      await order.save();

      const res = await request(app)
        .post('/api/v1/payment-verification/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderId: order._id.toString(),
          provider: 'telebirr',
          receiptNumber: 'DB80L94QPK',
        })
        .expect(400);

      expect(res.body.message).toContain('already paid');
    });

    it('should reject canceled order', async () => {
      order.status = 'canceled';
      await order.save();

      const res = await request(app)
        .post('/api/v1/payment-verification/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderId: order._id.toString(),
          provider: 'cbe',
          receiptNumber: 'FT26240JY4DT',
        })
        .expect(400);

      expect(res.body.message).toContain('canceled order');
    });

    it('should prevent duplicate receipt usage', async () => {
      const receiptNumber = 'DB80L94QPK';

      // First verification
      await request(app)
        .post('/api/v1/payment-verification/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderId: order._id.toString(),
          provider: 'telebirr',
          receiptNumber,
        })
        .expect(201);

      // Create second order
      const order2 = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderNumber: `TEST2-${Date.now()}`,
        orderType: 'takeaway',
        customerName: 'Test Customer 2',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Test Item 2',
            quantity: 1,
            unitPrice: 100.00,
            totalPrice: 100.00,
          },
        ],
        subtotal: 100.00,
        totalAmount: 100.00,
        paymentStatus: 'unpaid',
        status: 'ready',
      });

      // Attempt duplicate
      const res = await request(app)
        .post('/api/v1/payment-verification/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderId: order2._id.toString(),
          provider: 'telebirr',
          receiptNumber,
        })
        .expect(409);

      expect(res.body.message).toContain('already been used');
    });

    it('should create verification with lookup_failed status on network error', async () => {
      // This will fail to fetch because the URL is unreachable in test env
      const res = await request(app)
        .post('/api/v1/payment-verification/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderId: order._id.toString(),
          provider: 'telebirr',
          receiptNumber: 'DB80L94QPK',
        })
        .expect(201);

      expect(res.body.data.verification.status).toBe('lookup_failed');
      expect(res.body.data.verification.verificationType).toBe('manual_entry_lookup_failed');
      expect(res.body.data.verification.parseQuality).toBe('failed');
    });
  });

  describe('POST /api/v1/payment-verification/:id/confirm', () => {
    let verification;

    beforeEach(async () => {
      // Create a pending verification
      verification = await PaymentVerification.create({
        merchant: merchant._id,
        order: order._id,
        provider: 'telebirr',
        providerReference: 'DB80L94QPK',
        verificationType: 'manual_entry_lookup_failed',
        parsed: {
          amount: 250.00,
          status: 'SUCCESS',
          fullRawText: 'Manual verification',
        },
        amountMatch: true,
        parseQuality: 'medium',
        status: 'pending_review',
      });
    });

    it('should confirm verification and mark order as paid', async () => {
      const res = await request(app)
        .post(`/api/v1/payment-verification/${verification._id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);

      expect(res.body.data.verification.status).toBe('verified');
      expect(res.body.data.verification.verifiedBy).toBeTruthy();

      // Check order is paid
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('paid');
      expect(updatedOrder.status).toBe('completed'); // dine-in order completes on payment
    });

    it('should reject invalid ObjectId format', async () => {
      const res = await request(app)
        .post('/api/v1/payment-verification/invalid-id/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(res.body.message).toContain('Invalid verification ID format');
    });

    it('should prevent confirming already processed verification', async () => {
      // First confirmation
      await request(app)
        .post(`/api/v1/payment-verification/${verification._id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);

      // Attempt second confirmation
      const res = await request(app)
        .post(`/api/v1/payment-verification/${verification._id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(409);

      expect(res.body.message).toContain('already processed');
    });

    it('should reject if amount does not match current order total', async () => {
      // Change order amount after verification created
      order.totalAmount = 300.00;
      await order.save();

      const res = await request(app)
        .post(`/api/v1/payment-verification/${verification._id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(res.body.message).toContain('does not match current order total');
    });
  });

  describe('POST /api/v1/payment-verification/:id/reject', () => {
    let verification;

    beforeEach(async () => {
      verification = await PaymentVerification.create({
        merchant: merchant._id,
        order: order._id,
        provider: 'cbe',
        providerReference: 'FT26240JY4DT',
        verificationType: 'manual_entry_lookup_failed',
        parsed: {
          amount: 200.00,
          status: 'UNKNOWN',
        },
        amountMatch: false,
        parseQuality: 'low',
        status: 'pending_review',
      });
    });

    it('should reject verification with reason', async () => {
      const res = await request(app)
        .post(`/api/v1/payment-verification/${verification._id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          reason: 'Amount mismatch - customer provided incorrect receipt',
        })
        .expect(200);

      expect(res.body.data.verification.status).toBe('rejected');
      expect(res.body.data.verification.rejectionReason).toContain('Amount mismatch');
      expect(res.body.data.verification.verifiedBy).toBeTruthy();

      // Order should still be unpaid
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('unpaid');
    });

    it('should require rejection reason', async () => {
      const res = await request(app)
        .post(`/api/v1/payment-verification/${verification._id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(res.body.message).toContain('reason is required');
    });

    it('should prevent rejecting already processed verification', async () => {
      verification.status = 'verified';
      await verification.save();

      const res = await request(app)
        .post(`/api/v1/payment-verification/${verification._id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          reason: 'Test reason',
        })
        .expect(409);

      expect(res.body.message).toContain('Cannot reject');
    });
  });

  describe('GET /api/v1/payment-verification', () => {
    beforeEach(async () => {
      // Create multiple verifications
      await PaymentVerification.create([
        {
          merchant: merchant._id,
          order: order._id,
          provider: 'telebirr',
          providerReference: 'REF001',
          status: 'pending_review',
          verificationType: 'manual_entry_lookup_failed',
          parseQuality: 'medium',
        },
        {
          merchant: merchant._id,
          order: order._id,
          provider: 'cbe',
          providerReference: 'REF002',
          status: 'verified',
          verificationType: 'manual_entry_auto_lookup',
          parseQuality: 'high',
        },
        {
          merchant: merchant._id,
          order: order._id,
          provider: 'telebirr',
          providerReference: 'REF003',
          status: 'rejected',
          verificationType: 'manual_entry_lookup_failed',
          parseQuality: 'failed',
        },
      ]);
    });

    it('should list all verifications', async () => {
      const res = await request(app)
        .get('/api/v1/payment-verification')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.verifications).toHaveLength(3);
      expect(res.body.data.pagination.total).toBe(3);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/v1/payment-verification?status=pending_review')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.verifications).toHaveLength(1);
      expect(res.body.data.verifications[0].status).toBe('pending_review');
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/v1/payment-verification?page=1&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.verifications).toHaveLength(2);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.pages).toBe(2);
    });
  });

  describe('GET /api/v1/payment-verification/:id', () => {
    let verification;

    beforeEach(async () => {
      verification = await PaymentVerification.create({
        merchant: merchant._id,
        order: order._id,
        provider: 'telebirr',
        providerReference: 'DB80L94QPK',
        verificationType: 'manual_entry_lookup_failed',
        parsed: {
          amount: 250.00,
          status: 'SUCCESS',
        },
        amountMatch: true,
        parseQuality: 'high',
        status: 'pending_review',
      });
    });

    it('should get verification details', async () => {
      const res = await request(app)
        .get(`/api/v1/payment-verification/${verification._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.verification._id).toBe(verification._id.toString());
      expect(res.body.data.verification.provider).toBe('telebirr');
      expect(res.body.data.verification.order).toBeTruthy();
    });

    it('should return 404 for non-existent verification', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(`/api/v1/payment-verification/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(res.body.message).toContain('not found');
    });
  });

  describe('Security: Unique Index Enforcement', () => {
    it('should prevent duplicate receipt at database level', async () => {
      const receiptNumber = 'UNIQUETEST1';

      // Create first verification
      await PaymentVerification.create({
        merchant: merchant._id,
        order: order._id,
        provider: 'telebirr',
        providerReference: receiptNumber,
        status: 'pending_review',
        verificationType: 'manual_entry_lookup_failed',
        parseQuality: 'medium',
      });

      // Attempt duplicate at DB level
      await expect(
        PaymentVerification.create({
          merchant: merchant._id,
          order: new mongoose.Types.ObjectId(),
          provider: 'telebirr',
          providerReference: receiptNumber,
          status: 'pending_review',
          verificationType: 'manual_entry_lookup_failed',
          parseQuality: 'medium',
        })
      ).rejects.toThrow();
    });
  });
});
