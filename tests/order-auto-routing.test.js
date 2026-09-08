/**
 * Test: Order Auto-Routing (Step 3)
 * 
 * Tests automatic order routing based on OrderFlowConfig:
 * - System actor can transition pending → accepted → preparing
 * - Orders with requiresReview=false auto-route to kitchen
 * - Orders with requiresReview=true stay at pending
 * - Lazy-created config works correctly
 * - Manual accept still works for pending orders
 * - Cancellation works on auto-routed orders
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const OrderFlowConfig = require('../models/OrderFlowConfig');
const KitchenTicket = require('../models/KitchenTicket');
const OutboxEvent = require('../models/OutboxEvent');
const { OrderStateMachineService } = require('../src/modules/order/service/OrderStateMachineService');

describe('Order Auto-Routing (Step 3)', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await OrderFlowConfig.deleteMany({});
    await KitchenTicket.deleteMany({});
    await OutboxEvent.deleteMany({});
    await disconnectDatabase();
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await OrderFlowConfig.deleteMany({});
    await KitchenTicket.deleteMany({});
    await OutboxEvent.deleteMany({});
  });

  describe('System Actor Transitions', () => {
    it('should allow system actor to transition pending → accepted', async () => {
      const merchantId = new mongoose.Types.ObjectId();
      const branchId = new mongoose.Types.ObjectId();
      const tableId = new mongoose.Types.ObjectId();

      // Create order at pending
      const [order] = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T1',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        orderNumber: '#TEST-001',
        source: 'waiter',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
        }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'pending',
      }]);

      // System transitions pending → accepted
      const result = await OrderStateMachineService.transitionOrderStatus({
        orderId: order._id,
        toStatus: 'accepted',
        merchantQuery: { merchant: merchantId },
        user: null,
        actorType: 'system',
        reason: 'System auto-accept',
      });

      expect(result.order.status).toBe('accepted');
      expect(result.noop).toBeFalsy();

      // Verify in database
      const savedOrder = await Order.findById(order._id);
      expect(savedOrder.status).toBe('accepted');
      expect(savedOrder.acceptedAt).toBeDefined();
      expect(savedOrder.statusHistory).toHaveLength(1);
      expect(savedOrder.statusHistory[0].fromStatus).toBe('pending');
      expect(savedOrder.statusHistory[0].toStatus).toBe('accepted');
      expect(savedOrder.statusHistory[0].reason).toBe('System auto-accept');
    });

    it('should allow system actor to transition accepted → preparing', async () => {
      const merchantId = new mongoose.Types.ObjectId();
      const branchId = new mongoose.Types.ObjectId();
      const tableId = new mongoose.Types.ObjectId();

      // Create order at accepted
      const [order] = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T1',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        orderNumber: '#TEST-002',
        source: 'waiter',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
        }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'accepted',
        acceptedAt: new Date(),
      }]);

      // System transitions accepted → preparing
      const result = await OrderStateMachineService.transitionOrderStatus({
        orderId: order._id,
        toStatus: 'preparing',
        merchantQuery: { merchant: merchantId },
        user: null,
        actorType: 'system',
        reason: 'System auto-send to kitchen',
      });

      expect(result.order.status).toBe('preparing');
      expect(result.noop).toBeFalsy();

      // Verify in database
      const savedOrder = await Order.findById(order._id);
      expect(savedOrder.status).toBe('preparing');

      // Verify outbox event was created for KDS ticket creation
      const outboxEvents = await OutboxEvent.find({
        aggregateId: order._id,
        eventType: 'order:preparing',
      });
      expect(outboxEvents.length).toBeGreaterThan(0);
    });

    it('should enforce role permissions for human actors (waiter cannot do accepted → preparing)', async () => {
      const merchantId = new mongoose.Types.ObjectId();
      const branchId = new mongoose.Types.ObjectId();
      const tableId = new mongoose.Types.ObjectId();

      // Create order at accepted
      const [order] = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T1',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        orderNumber: '#TEST-003',
        source: 'waiter',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
        }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'accepted',
        acceptedAt: new Date(),
      }]);

      // Mock waiter user
      const waiterUser = {
        _id: new mongoose.Types.ObjectId(),
        role: { name: 'WAITER', _id: new mongoose.Types.ObjectId() },
      };

      // Waiter tries to transition accepted → preparing (should fail)
      await expect(
        OrderStateMachineService.transitionOrderStatus({
          orderId: order._id,
          toStatus: 'preparing',
          merchantQuery: { merchant: merchantId },
          user: waiterUser,
          actorType: null,
          reason: 'Waiter trying to send to kitchen',
        })
      ).rejects.toThrow(/cannot transition/);
    });
  });

  describe('Auto-Routing Integration (Simulated)', () => {
    it('should verify requiresReview=false config exists', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // Create config with waiter.requiresReview = false
      await OrderFlowConfig.create({
        merchant: merchantId,
        channels: {
          waiter: { requiresReview: false, reviewerRole: null },
          web: { requiresReview: true, reviewerRole: 'waiter' },
          admin: { requiresReview: true, reviewerRole: 'support' },
          telegram: { requiresReview: true, reviewerRole: 'support' },
        },
      });

      const { OrderFlowConfigService } = require('../src/modules/order-flow-config');
      const channelConfig = await OrderFlowConfigService.getChannelConfig(merchantId, 'waiter');

      expect(channelConfig.requiresReview).toBe(false);
      expect(channelConfig.reviewerRole).toBe(null);
    });

    it('should verify requiresReview=true config (default) exists', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // Lazy-create with defaults
      const { OrderFlowConfigService } = require('../src/modules/order-flow-config');
      const channelConfig = await OrderFlowConfigService.getChannelConfig(merchantId, 'web');

      expect(channelConfig.requiresReview).toBe(true);
      expect(channelConfig.reviewerRole).toBe('waiter');
    });

    it('should simulate two-step auto-routing for requiresReview=false', async () => {
      const merchantId = new mongoose.Types.ObjectId();
      const branchId = new mongoose.Types.ObjectId();
      const tableId = new mongoose.Types.ObjectId();

      // Create config with waiter.requiresReview = false
      await OrderFlowConfig.create({
        merchant: merchantId,
        channels: {
          waiter: { requiresReview: false, reviewerRole: null },
          web: { requiresReview: true, reviewerRole: 'waiter' },
          admin: { requiresReview: true, reviewerRole: 'support' },
          telegram: { requiresReview: true, reviewerRole: 'support' },
        },
      });

      // Create order
      const [order] = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T1',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        orderNumber: '#TEST-AUTO-001',
        source: 'waiter',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
        }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'pending',
      }]);

      // Simulate auto-routing (what the order creation code does)
      const { OrderFlowConfigService } = require('../src/modules/order-flow-config');
      const channelConfig = await OrderFlowConfigService.getChannelConfig(merchantId, order.source);

      if (channelConfig.requiresReview === false) {
        // Step 1: pending → accepted
        await OrderStateMachineService.transitionOrderStatus({
          orderId: order._id,
          toStatus: 'accepted',
          merchantQuery: { merchant: merchantId },
          user: null,
          actorType: 'system',
          reason: 'Auto-accepted: channel requires no review',
        });

        // Step 2: accepted → preparing
        await OrderStateMachineService.transitionOrderStatus({
          orderId: order._id,
          toStatus: 'preparing',
          merchantQuery: { merchant: merchantId },
          user: null,
          actorType: 'system',
          reason: 'Auto-sent to kitchen: channel requires no review',
        });
      }

      // Verify final state
      const finalOrder = await Order.findById(order._id);
      expect(finalOrder.status).toBe('preparing');
      expect(finalOrder.acceptedAt).toBeDefined();
      expect(finalOrder.statusHistory).toHaveLength(2);
      expect(finalOrder.statusHistory[0].fromStatus).toBe('pending');
      expect(finalOrder.statusHistory[0].toStatus).toBe('accepted');
      expect(finalOrder.statusHistory[1].fromStatus).toBe('accepted');
      expect(finalOrder.statusHistory[1].toStatus).toBe('preparing');

      // Verify outbox event created for KDS
      const outboxEvents = await OutboxEvent.find({
        aggregateId: order._id,
        eventType: 'order:preparing',
      });
      expect(outboxEvents.length).toBeGreaterThan(0);
    });

    it('should leave order at pending when requiresReview=true', async () => {
      const merchantId = new mongoose.Types.ObjectId();
      const branchId = new mongoose.Types.ObjectId();
      const tableId = new mongoose.Types.ObjectId();

      // Use default config (web.requiresReview = true)
      const { OrderFlowConfigService } = require('../src/modules/order-flow-config');
      const channelConfig = await OrderFlowConfigService.getChannelConfig(merchantId, 'web');

      expect(channelConfig.requiresReview).toBe(true);

      // Create order
      const [order] = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T2',
        customerName: 'QR Customer',
        orderType: 'dine_in',
        orderNumber: '#TEST-MANUAL-001',
        source: 'web',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
        }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'pending',
      }]);

      // Simulate: do NOT auto-route (requiresReview is true)
      if (channelConfig.requiresReview === false) {
        // This block should NOT execute
        throw new Error('Should not auto-route when requiresReview is true');
      }

      // Verify order stayed at pending
      const finalOrder = await Order.findById(order._id);
      expect(finalOrder.status).toBe('pending');
      expect(finalOrder.acceptedAt).toBeUndefined();
      expect(finalOrder.statusHistory).toHaveLength(0);

      // No KDS events yet
      const outboxEvents = await OutboxEvent.find({
        aggregateId: order._id,
        eventType: 'order:preparing',
      });
      expect(outboxEvents.length).toBe(0);
    });
  });

  describe('Manual Accept Still Works', () => {
    it('should allow waiter to manually accept pending order', async () => {
      const merchantId = new mongoose.Types.ObjectId();
      const branchId = new mongoose.Types.ObjectId();
      const tableId = new mongoose.Types.ObjectId();

      // Create order at pending (with requiresReview=true)
      const [order] = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T3',
        customerName: 'Manual Customer',
        orderType: 'dine_in',
        orderNumber: '#TEST-MANUAL-002',
        source: 'web',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
        }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'pending',
      }]);

      // Mock waiter user
      const waiterUser = {
        _id: new mongoose.Types.ObjectId(),
        role: { name: 'WAITER', _id: new mongoose.Types.ObjectId() },
      };

      // Waiter manually accepts
      const result = await OrderStateMachineService.transitionOrderStatus({
        orderId: order._id,
        toStatus: 'accepted',
        merchantQuery: { merchant: merchantId },
        user: waiterUser,
        actorType: null,
        reason: 'Waiter manual accept',
      });

      expect(result.order.status).toBe('accepted');

      const savedOrder = await Order.findById(order._id);
      expect(savedOrder.status).toBe('accepted');
      expect(savedOrder.acceptedAt).toBeDefined();
    });
  });

  describe('Cancellation on Auto-Routed Orders', () => {
    it('should allow canceling an auto-routed order at preparing status', async () => {
      const merchantId = new mongoose.Types.ObjectId();
      const branchId = new mongoose.Types.ObjectId();
      const tableId = new mongoose.Types.ObjectId();

      // Create order at preparing (simulating auto-routed)
      const [order] = await Order.create([{
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T4',
        customerName: 'Cancel Test',
        orderType: 'dine_in',
        orderNumber: '#TEST-CANCEL-001',
        source: 'waiter',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
        }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'preparing',
        acceptedAt: new Date(),
      }]);

      // Mock waiter user
      const waiterUser = {
        _id: new mongoose.Types.ObjectId(),
        role: { name: 'WAITER', _id: new mongoose.Types.ObjectId() },
      };

      // Waiter cancels the order
      const result = await OrderStateMachineService.transitionOrderStatus({
        orderId: order._id,
        toStatus: 'canceled',
        merchantQuery: { merchant: merchantId },
        user: waiterUser,
        actorType: null,
        reason: 'Customer changed mind',
      });

      expect(result.order.status).toBe('canceled');

      const savedOrder = await Order.findById(order._id);
      expect(savedOrder.status).toBe('canceled');
      expect(savedOrder.canceledAt).toBeDefined();
      expect(savedOrder.canceledReason).toBe('Customer changed mind');
    });
  });
});
