/**
 * Test: Order Review Queue (Step 4)
 * 
 * Tests GET /api/v1/order/review-queue endpoint:
 * - Waiter sees orders with reviewerRole='waiter' (web orders)
 * - Support sees orders with reviewerRole='support' (admin + telegram orders)
 * - Role isolation works correctly
 * - Only pending orders with requiresReview=true appear
 * - Orders with requiresReview=false don't appear
 * - Reuses existing PATCH /api/v1/order/:id/status for approve/reject
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const OrderFlowConfig = require('../models/OrderFlowConfig');
const { OrderService } = require('../src/modules/order/service/OrderService');

describe('Order Review Queue (Step 4)', () => {
  let merchantId, branchId, tableId;
  let waiterUser, supportUser, kitchenUser;

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await OrderFlowConfig.deleteMany({});
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean state
    await Order.deleteMany({});
    await OrderFlowConfig.deleteMany({});

    // Setup test data
    merchantId = new mongoose.Types.ObjectId();
    branchId = new mongoose.Types.ObjectId();
    tableId = new mongoose.Types.ObjectId();

    // Mock users with different roles
    waiterUser = {
      _id: new mongoose.Types.ObjectId(),
      role: { 
        name: 'WAITER',
        _id: new mongoose.Types.ObjectId(),
      },
      merchant: merchantId,
      branch: branchId,
    };

    supportUser = {
      _id: new mongoose.Types.ObjectId(),
      role: { 
        name: 'SUPPORT',
        _id: new mongoose.Types.ObjectId(),
      },
      merchant: merchantId,
      branch: branchId,
    };

    kitchenUser = {
      _id: new mongoose.Types.ObjectId(),
      role: { 
        name: 'KITCHEN',
        _id: new mongoose.Types.ObjectId(),
      },
      merchant: merchantId,
      branch: branchId,
    };

    // Create default OrderFlowConfig
    await OrderFlowConfig.create({
      merchant: merchantId,
      channels: {
        waiter: { requiresReview: false, reviewerRole: null },
        web: { requiresReview: true, reviewerRole: 'waiter' },
        admin: { requiresReview: true, reviewerRole: 'support' },
        telegram: { requiresReview: true, reviewerRole: 'support' },
      },
    });
  });

  describe('Waiter Review Queue', () => {
    it('should show web orders to waiter (reviewerRole=waiter)', async () => {
      // Create orders with different sources
      await Order.create([
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T1',
          customerName: 'Web Customer',
          orderType: 'dine_in',
          orderNumber: '#WEB-001',
          source: 'web', // reviewerRole='waiter'
          status: 'pending',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T2',
          customerName: 'Admin Customer',
          orderType: 'dine_in',
          orderNumber: '#ADMIN-001',
          source: 'admin', // reviewerRole='support'
          status: 'pending',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
      ]);

      // Mock request
      const req = {
        user: waiterUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].source).toBe('web');
      expect(result.orders[0].orderNumber).toBe('#WEB-001');
      expect(result.orders[0].reviewerRole).toBe('waiter');
    });

    it('should NOT show admin orders to waiter (wrong reviewerRole)', async () => {
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T3',
        customerName: 'Admin Customer',
        orderType: 'dine_in',
        orderNumber: '#ADMIN-002',
        source: 'admin', // reviewerRole='support'
        status: 'pending',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      const req = {
        user: waiterUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(0);
    });

    it('should NOT show waiter orders to waiter (requiresReview=false)', async () => {
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T4',
        customerName: 'Waiter Customer',
        orderType: 'dine_in',
        orderNumber: '#WAITER-001',
        source: 'waiter', // requiresReview=false
        status: 'pending',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      const req = {
        user: waiterUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(0);
    });

    it('should NOT show accepted/preparing orders to waiter (not pending)', async () => {
      await Order.create([
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T5',
          customerName: 'Web Customer',
          orderType: 'dine_in',
          orderNumber: '#WEB-ACCEPTED',
          source: 'web',
          status: 'accepted', // Not pending
          acceptedAt: new Date(),
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T6',
          customerName: 'Web Customer 2',
          orderType: 'dine_in',
          orderNumber: '#WEB-PREPARING',
          source: 'web',
          status: 'preparing', // Not pending
          acceptedAt: new Date(),
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
      ]);

      const req = {
        user: waiterUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(0);
    });
  });

  describe('Support Review Queue', () => {
    it('should show admin orders to support (reviewerRole=support)', async () => {
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T7',
        customerName: 'Admin Customer',
        orderType: 'dine_in',
        orderNumber: '#ADMIN-003',
        source: 'admin', // reviewerRole='support'
        status: 'pending',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      const req = {
        user: supportUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].source).toBe('admin');
      expect(result.orders[0].orderNumber).toBe('#ADMIN-003');
      expect(result.orders[0].reviewerRole).toBe('support');
    });

    it('should show telegram orders to support (reviewerRole=support)', async () => {
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T8',
        customerName: 'Telegram Customer',
        orderType: 'dine_in', // Changed from delivery to dine_in
        orderNumber: '#TELEGRAM-001',
        source: 'telegram', // reviewerRole='support'
        status: 'pending',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      const req = {
        user: supportUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].source).toBe('telegram');
    });

    it('should show both admin and telegram orders to support', async () => {
      await Order.create([
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T9',
          customerName: 'Admin Customer',
          orderType: 'dine_in',
          orderNumber: '#ADMIN-004',
          source: 'admin',
          status: 'pending',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T10',
          customerName: 'Telegram Customer',
          orderType: 'dine_in', // Changed from delivery to dine_in
          orderNumber: '#TELEGRAM-002',
          source: 'telegram',
          status: 'pending',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
      ]);

      const req = {
        user: supportUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(2);
      expect(result.orders.map(o => o.source).sort()).toEqual(['admin', 'telegram']);
    });

    it('should NOT show web orders to support (wrong reviewerRole)', async () => {
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T11',
        customerName: 'Web Customer',
        orderType: 'dine_in',
        orderNumber: '#WEB-002',
        source: 'web', // reviewerRole='waiter'
        status: 'pending',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      const req = {
        user: supportUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(0);
    });
  });

  describe('Role Isolation', () => {
    it('should maintain strict role isolation between waiter and support', async () => {
      // Create orders for both roles
      await Order.create([
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T12',
          customerName: 'Web Customer',
          orderType: 'dine_in',
          orderNumber: '#WEB-003',
          source: 'web', // waiter
          status: 'pending',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T13',
          customerName: 'Admin Customer',
          orderType: 'dine_in',
          orderNumber: '#ADMIN-005',
          source: 'admin', // support
          status: 'pending',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
      ]);

      // Waiter sees only web orders
      const waiterReq = { user: waiterUser, query: {} };
      const waiterResult = await OrderService.getReviewQueue(waiterReq);
      expect(waiterResult.orders).toHaveLength(1);
      expect(waiterResult.orders[0].source).toBe('web');

      // Support sees only admin orders
      const supportReq = { user: supportUser, query: {} };
      const supportResult = await OrderService.getReviewQueue(supportReq);
      expect(supportResult.orders).toHaveLength(1);
      expect(supportResult.orders[0].source).toBe('admin');
    });

    it('should return empty array for non-reviewer roles (kitchen)', async () => {
      await Order.create({
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T14',
        customerName: 'Web Customer',
        orderType: 'dine_in',
        orderNumber: '#WEB-004',
        source: 'web',
        status: 'pending',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      const req = {
        user: kitchenUser, // Kitchen role
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(0);
    });
  });

  describe('Merchant Isolation', () => {
    it('should not leak orders between merchants', async () => {
      const merchant2Id = new mongoose.Types.ObjectId();

      // Create config for second merchant
      await OrderFlowConfig.create({
        merchant: merchant2Id,
        channels: {
          waiter: { requiresReview: false, reviewerRole: null },
          web: { requiresReview: true, reviewerRole: 'waiter' },
          admin: { requiresReview: true, reviewerRole: 'support' },
          telegram: { requiresReview: true, reviewerRole: 'support' },
        },
      });

      // Create orders for both merchants
      await Order.create([
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T15',
          customerName: 'Merchant 1 Customer',
          orderType: 'dine_in',
          orderNumber: '#M1-WEB-001',
          source: 'web',
          status: 'pending',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
        {
          merchant: merchant2Id,
          branch: new mongoose.Types.ObjectId(),
          table: new mongoose.Types.ObjectId(),
          tableNumber: 'T16',
          customerName: 'Merchant 2 Customer',
          orderType: 'dine_in',
          orderNumber: '#M2-WEB-001',
          source: 'web',
          status: 'pending',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
      ]);

      // Waiter from merchant 1 should only see merchant 1 orders
      const req = {
        user: waiterUser, // waiterUser has merchantId
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].orderNumber).toBe('#M1-WEB-001');
    });
  });

  describe('Order Sorting', () => {
    it('should sort orders by placedAt ascending (oldest first)', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      await Order.create([
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T17',
          customerName: 'Recent',
          orderType: 'dine_in',
          orderNumber: '#RECENT',
          source: 'web',
          status: 'pending',
          placedAt: now,
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T18',
          customerName: 'Middle',
          orderType: 'dine_in',
          orderNumber: '#MIDDLE',
          source: 'web',
          status: 'pending',
          placedAt: oneHourAgo,
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
        {
          merchant: merchantId,
          branch: branchId,
          table: tableId,
          tableNumber: 'T19',
          customerName: 'Oldest',
          orderType: 'dine_in',
          orderNumber: '#OLDEST',
          source: 'web',
          status: 'pending',
          placedAt: twoHoursAgo,
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          paymentStatus: 'unpaid',
        },
      ]);

      const req = {
        user: waiterUser,
        query: {},
      };

      const result = await OrderService.getReviewQueue(req);

      expect(result.orders).toHaveLength(3);
      expect(result.orders[0].orderNumber).toBe('#OLDEST');
      expect(result.orders[1].orderNumber).toBe('#MIDDLE');
      expect(result.orders[2].orderNumber).toBe('#RECENT');
    });
  });
});
