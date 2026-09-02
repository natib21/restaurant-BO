// tests/status-derivation-verification.test.js
// Verification tests for Phase 1-3 implementation

const mongoose = require('mongoose');

// Mock logger FIRST
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock socket - MUST be before any imports that use it
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
jest.mock('../src/infrastructure/websocket/socket-server', () => ({
  getIo: jest.fn(() => ({
    to: mockTo,
    emit: mockEmit,
  })),
  createSocketServer: jest.fn(),
}));

// NOW import the modules that depend on socket
const Order = require('../models/orderModel');
const { ItemStatusService } = require('../src/modules/order/service/ItemStatusService');
const { StatusSyncService } = require('../src/modules/order/service/StatusSyncService');

describe('Status Derivation - Verification Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb-test', {
      serverSelectionTimeoutMS: 5000,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Order.deleteMany({});
    jest.clearAllMocks();
  });

  describe('Verification 1: recomputeOrderStatus - Single Lagging Item', () => {
    it('should keep order at "preparing" when 2 items served but 1 still pending', async () => {
      // Create order with 3 items
      const order = await Order.create({
        merchant: new mongoose.Types.ObjectId(),
        branch: new mongoose.Types.ObjectId(),
        orderType: 'takeaway', // takeaway doesn't require table
        source: 'admin',
        orderNumber: '#TEST-001',
        customerName: 'Test Customer',
        status: 'preparing',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'served', // Served
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'served', // Served
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 3',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending', // Still pending - THE LAGGING ITEM
            requiresKitchen: true,
          },
        ],
        subtotal: 300,
        totalAmount: 300,
        paymentStatus: 'unpaid',
      });

      // Recompute
      await ItemStatusService.recomputeOrderStatus(order);

      // Verify: Order should stay "preparing" because of the single lagging item
      expect(order.status).toBe('preparing');
      
      console.log('✅ Verification 1 PASSED: Single lagging item holds order at "preparing"');
    });

    it('should move to "ready" only when ALL items are at least ready', async () => {
      const order = await Order.create({
        merchant: new mongoose.Types.ObjectId(),
        branch: new mongoose.Types.ObjectId(),
        orderType: 'takeaway',
        source: 'admin',
        orderNumber: '#TEST-002',
        customerName: 'Test Customer',
        status: 'preparing',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'ready',
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'ready',
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 3',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'ready', // Now all ready
            requiresKitchen: true,
          },
        ],
        subtotal: 300,
        totalAmount: 300,
        paymentStatus: 'unpaid',
      });

      await ItemStatusService.recomputeOrderStatus(order);

      // Now should be "ready"
      expect(order.status).toBe('ready');
      
      console.log('✅ Verification 1 PASSED: Order moves to "ready" when all items ready');
    });
  });

  describe('Verification 2: afterBulkOrderItemsChange - Single Event', () => {
    it('should emit order:status-changed only ONCE per batch, not per item', async () => {
      // Clear previous mock calls
      mockEmit.mockClear();
      mockTo.mockClear();

      const order = await Order.create({
        merchant: new mongoose.Types.ObjectId(),
        branch: new mongoose.Types.ObjectId(),
        orderType: 'takeaway',
        source: 'admin',
        orderNumber: '#TEST-003',
        customerName: 'Test Customer',
        status: 'preparing',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending',
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 2',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending',
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Item 3',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending',
            requiresKitchen: true,
          },
        ],
        subtotal: 300,
        totalAmount: 300,
        paymentStatus: 'unpaid',
      });

      // Change all 3 items to 'ready'
      order.items[0].status = 'ready';
      order.items[1].status = 'ready';
      order.items[2].status = 'ready';

      // Call bulk update
      await StatusSyncService.afterBulkOrderItemsChange(order, order.items);

      // Analyze the actual emit calls
      const allEmitCalls = mockEmit.mock.calls;
      const itemEvents = allEmitCalls.filter(call => call[0] === 'order:item-status-changed');
      const statusEvents = allEmitCalls.filter(call => call[0] === 'order:status-changed');

      // Should emit 3 item events (one per item)
      expect(itemEvents.length).toBe(3);
      console.log(`  ✓ Emitted ${itemEvents.length} item-level events (one per item)`);
      
      // Should emit only 1 order status event (not 3!)
      expect(statusEvents.length).toBe(1);
      console.log(`  ✓ Emitted ${statusEvents.length} order-level event (single batch event)`);
      
      // Verify the order status actually changed
      const statusEventData = statusEvents[0][1];
      expect(statusEventData.oldStatus).toBe('preparing');
      expect(statusEventData.newStatus).toBe('ready');
      console.log(`  ✓ Order status changed: ${statusEventData.oldStatus} → ${statusEventData.newStatus}`);

      console.log('✅ Verification 2 PASSED: Bulk update emits single parent event');
    });
  });

  describe('Verification 3: Kitchen Item Ready Protection - Live Route', () => {
    it('should reject manual ready on requiresKitchen=true item', async () => {
      const order = await Order.create({
        merchant: new mongoose.Types.ObjectId(),
        branch: new mongoose.Types.ObjectId(),
        orderType: 'takeaway',
        source: 'admin',
        orderNumber: '#TEST-004',
        customerName: 'Test Customer',
        status: 'preparing',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Kitchen Item',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            status: 'pending',
            requiresKitchen: true, // Kitchen item
          },
        ],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
      });

      const itemId = order.items[0]._id;
      const actor = { _id: new mongoose.Types.ObjectId() };

      // Try to set to 'ready' manually
      await expect(
        ItemStatusService.updateItemStatus(order, itemId, 'ready', actor)
      ).rejects.toThrow(/Kitchen items can only reach "ready" via their ticket completing/);

      console.log('✅ Verification 3 PASSED: Kitchen item ready protection works');
    });

    it('should allow manual served on requiresKitchen=false item', async () => {
      const order = await Order.create({
        merchant: new mongoose.Types.ObjectId(),
        branch: new mongoose.Types.ObjectId(),
        orderType: 'takeaway',
        source: 'admin',
        orderNumber: '#TEST-005',
        customerName: 'Test Customer',
        status: 'preparing',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Non-Kitchen Item (Drink)',
            quantity: 1,
            unitPrice: 50,
            totalPrice: 50,
            status: 'pending',
            requiresKitchen: false, // Non-kitchen item (e.g., drink)
          },
        ],
        subtotal: 50,
        totalAmount: 50,
        paymentStatus: 'unpaid',
      });

      const itemId = order.items[0]._id;
      const actor = { _id: new mongoose.Types.ObjectId() };

      // Non-kitchen items go straight to 'served' (auto-serve or manual)
      // 'ready' is not a valid state for non-kitchen items
      await expect(
        ItemStatusService.updateItemStatus(order, itemId, 'served', actor)
      ).resolves.not.toThrow();

      // Reload order and verify
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.items[0].status).toBe('served');

      console.log('✅ Verification 3 PASSED: Non-kitchen item served allowed');
    });
  });
});
