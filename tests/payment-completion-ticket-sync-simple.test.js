// tests/payment-completion-ticket-sync-simple.test.js
// ✅ Payment completion guard + Ticket completion reverse sync tests (Service-level)

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const KitchenTicket = require('../models/KitchenTicket');
const Table = require('../models/tabelModel');
const OutboxEvent = require('../models/OutboxEvent');
const { OrderService } = require('../src/modules/order/service/OrderService');
const { StatusSyncService } = require('../src/modules/order/service/StatusSyncService');
const { ItemStatusService } = require('../src/modules/order/service/ItemStatusService');

describe('Payment Completion Guard & Ticket Sync (Service-Level Tests)', () => {
  let merchant, branch, table, station;

  beforeAll(async () => {
    await connectDatabase();
  });

  beforeEach(async () => {
    const Merchant = require('../models/merchantModel');
    const Branch = require('../models/branchModel');
    const KitchenStation = require('../models/KitchenStation');
    
    // Clean up
    await Order.deleteMany({});
    await KitchenTicket.deleteMany({});
    await OutboxEvent.deleteMany({});
    await Table.deleteMany({});
    await Merchant.deleteMany({});
    await Branch.deleteMany({});
    await KitchenStation.deleteMany({});
    
    // Create test merchant (exact pattern from kds-integration.test.js)
    merchant = await Merchant.create({
      businessName: 'Test Restaurant Service',
      slug: 'test-restaurant-service',
      status: 'approved',
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner-service@test.com',
        phone: '+251912345679',
      },
    });

    // Create test branch (exact pattern from kds-integration.test.js)
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch Service',
      branchCode: 'MAIN',
      isActive: true,
      location: {
        city: 'Addis Ababa',
        coordinates: [9.0320, 38.7469],
      },
    });
    
    // Create test table
    table = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      number: 'T1',
      tableNumber: 'T1',
      capacity: 4,
      status: 'occupied',
    });

    // Create test kitchen station
    station = await KitchenStation.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Grill Service',
      code: 'GRILL-SVC',
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PART A: PAYMENT COMPLETION GUARD TESTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part A: Payment Completion Guard', () => {
    it('should reject payment on dine-in order with unserved items', async () => {
      // Create dine-in order with items still in 'ready' status
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        orderType: 'dine_in',
        status: 'ready',
        customerName: 'Test Customer',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Burger',
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
            status: 'ready',  // Not served yet!
            requiresKitchen: true,
          },
        ],
        subtotal: 10,
        totalAmount: 10,
        paymentStatus: 'unpaid',
      });

      // Create mock request object
      const req = {
        params: { id: order._id },
        body: { paymentMethod: 'cash' },
        user: { merchant: merchant._id },
      };

      // Attempt to mark as paid - should throw
      await expect(OrderService.markAsPaid(req)).rejects.toThrow(/cannot complete.*before all items.*served/i);

      // Verify order not completed
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('unpaid');
      expect(updatedOrder.status).toBe('ready');
    });

    it('should complete dine-in order when all items served', async () => {
      // Create dine-in order with all items served
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        orderType: 'dine_in',
        status: 'served',  // All items served
        customerName: 'Test Customer',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Burger',
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
            status: 'served',  // ✅ Served
            requiresKitchen: true,
            servedAt: new Date(),
          },
        ],
        subtotal: 10,
        totalAmount: 10,
        paymentStatus: 'unpaid',
      });

      const req = {
        params: { id: order._id },
        body: { paymentMethod: 'cash' },
        user: { merchant: merchant._id },
      };

      const result = await OrderService.markAsPaid(req);

      expect(result.paymentStatus).toBe('paid');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeTruthy();

      // Verify table freed
      const updatedTable = await Table.findById(table._id);
      expect(updatedTable.status).toBe('available');
    });

    it('should accept payment on takeaway order without completing it', async () => {
      // Create takeaway order with items still preparing
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderType: 'takeaway',
        status: 'preparing',
        customerName: 'Test Customer Takeaway',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Pizza',
            quantity: 1,
            unitPrice: 15,
            totalPrice: 15,
            status: 'in_progress',  // Still cooking
            requiresKitchen: true,
          },
        ],
        subtotal: 15,
        totalAmount: 15,
        paymentStatus: 'unpaid',
      });

      const req = {
        params: { id: order._id },
        body: { paymentMethod: 'cash' },
        user: { merchant: merchant._id },
      };

      const result = await OrderService.markAsPaid(req);

      expect(result.paymentStatus).toBe('paid');
      expect(result.status).toBe('preparing');  // Still preparing!
      expect(result.completedAt).toBeFalsy();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PART B: TICKET COMPLETION REVERSE SYNC TESTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part B: Ticket Completion Sync', () => {
    it('should mark ticket item completed when order item served', async () => {
      // Create order with kitchen item
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        orderType: 'dine_in',
        status: 'preparing',
        customerName: 'Test Customer B1',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Burger',
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
            status: 'ready',
            requiresKitchen: true,
          },
        ],
        subtotal: 10,
        totalAmount: 10,
        paymentStatus: 'unpaid',
      });

      const orderItemId = order.items[0]._id;

      // Create linked ticket
      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-SVC-1',
        orderNumber: 'POS-SVC-001',
        orderType: 'dine_in',
        items: [
          {
            orderItemId,
            menuItem: order.items[0].menuItem,
            menuItemName: 'Burger',
            quantity: 1,
            status: 'ready',
          },
        ],
        status: 'ready',
      });

      // Serve the order item (directly via service)
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const mockUser = { _id: new mongoose.Types.ObjectId(), name: 'Test Waiter' };
        await ItemStatusService.updateItemStatus(order, orderItemId, 'served', mockUser, session);
        await ItemStatusService.recomputeOrderStatus(order, session);
        await StatusSyncService.syncTicketItemCompletion(order, orderItemId, session);
      });
      await session.endSession();

      // Verify ticket item marked completed
      const updatedTicket = await KitchenTicket.findById(ticket._id);
      expect(updatedTicket.items[0].status).toBe('completed');
      expect(updatedTicket.items[0].completedServingAt).toBeTruthy();
      expect(updatedTicket.status).toBe('completed');
    });

    it('should keep ticket ready until ALL items served', async () => {
      // Create order with 2 kitchen items
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        orderType: 'dine_in',
        status: 'preparing',
        customerName: 'Test Customer B2',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Burger',
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
            status: 'ready',
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Fries',
            quantity: 1,
            unitPrice: 5,
            totalPrice: 5,
            status: 'ready',
            requiresKitchen: true,
          },
        ],
        subtotal: 15,
        totalAmount: 15,
        paymentStatus: 'unpaid',
      });

      const item1Id = order.items[0]._id;
      const item2Id = order.items[1]._id;

      // Create ticket with both items
      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-SVC-2',
        orderNumber: 'POS-SVC-002',
        orderType: 'dine_in',
        items: [
          {
            orderItemId: item1Id,
            menuItem: order.items[0].menuItem,
            menuItemName: 'Burger',
            quantity: 1,
            status: 'ready',
          },
          {
            orderItemId: item2Id,
            menuItem: order.items[1].menuItem,
            menuItemName: 'Fries',
            quantity: 1,
            status: 'ready',
          },
        ],
        status: 'ready',
      });

      // Serve ONLY the first item
      let session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const mockUser = { _id: new mongoose.Types.ObjectId(), name: 'Test Waiter' };
        await ItemStatusService.updateItemStatus(order, item1Id, 'served', mockUser, session);
        await StatusSyncService.syncTicketItemCompletion(order, item1Id, session);
      });
      await session.endSession();

      // Verify ticket still ready (not completed)
      let updatedTicket = await KitchenTicket.findById(ticket._id);
      expect(updatedTicket.items[0].status).toBe('completed');
      expect(updatedTicket.items[1].status).toBe('ready');
      expect(updatedTicket.status).toBe('ready');  // ❌ Not completed yet

      // Now serve the second item
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const mockUser = { _id: new mongoose.Types.ObjectId(), name: 'Test Waiter' };
        await ItemStatusService.updateItemStatus(order, item2Id, 'served', mockUser, session);
        await StatusSyncService.syncTicketItemCompletion(order, item2Id, session);
      });
      await session.endSession();

      // NOW ticket should be completed
      updatedTicket = await KitchenTicket.findById(ticket._id);
      expect(updatedTicket.items[0].status).toBe('completed');
      expect(updatedTicket.items[1].status).toBe('completed');
      expect(updatedTicket.status).toBe('completed');  // ✅ Now completed!
    });

    it('should queue outbox event when ticket becomes completed', async () => {
      // Create order with 1 item
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        orderType: 'dine_in',
        status: 'preparing',
        customerName: 'Test Customer B3',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Salad',
            quantity: 1,
            unitPrice: 8,
            totalPrice: 8,
            status: 'ready',
            requiresKitchen: true,
          },
        ],
        subtotal: 8,
        totalAmount: 8,
        paymentStatus: 'unpaid',
      });

      const itemId = order.items[0]._id;

      // Create ticket
      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-SVC-3',
        orderNumber: 'POS-SVC-003',
        orderType: 'dine_in',
        items: [
          {
            orderItemId: itemId,
            menuItem: order.items[0].menuItem,
            menuItemName: 'Salad',
            quantity: 1,
            status: 'ready',
          },
        ],
        status: 'ready',
      });

      // Serve the item
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const mockUser = { _id: new mongoose.Types.ObjectId(), name: 'Test Waiter' };
        await ItemStatusService.updateItemStatus(order, itemId, 'served', mockUser, session);
        await ItemStatusService.recomputeOrderStatus(order, session);
        await StatusSyncService.syncTicketItemCompletion(order, itemId, session);
      });
      await session.endSession();

      // Verify outbox event created
      const outboxEvent = await OutboxEvent.findOne({
        eventType: 'ticket:completed',
        'payload.ticketId': ticket._id.toString(),
      });

      expect(outboxEvent).toBeTruthy();
      expect(outboxEvent.payload.ticketId).toBe(ticket._id.toString());
      expect(outboxEvent.payload.stationId).toBe(station._id.toString());
      expect(outboxEvent.payload.branchId).toBe(branch._id.toString());
      expect(outboxEvent.payload.previousStatus).toBe('ready');
      expect(outboxEvent.payload.newStatus).toBe('completed');
    });

    it('should handle bulk-serve of multiple items in same ticket correctly', async () => {
      // Create order with 3 items on same station
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        orderType: 'dine_in',
        status: 'preparing',
        customerName: 'Test Customer Bulk',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Burger',
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
            status: 'ready',
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Fries',
            quantity: 1,
            unitPrice: 5,
            totalPrice: 5,
            status: 'ready',
            requiresKitchen: true,
          },
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Salad',
            quantity: 1,
            unitPrice: 7,
            totalPrice: 7,
            status: 'ready',
            requiresKitchen: true,
          },
        ],
        subtotal: 22,
        totalAmount: 22,
        paymentStatus: 'unpaid',
      });

      const item1Id = order.items[0]._id;
      const item2Id = order.items[1]._id;
      const item3Id = order.items[2]._id;

      // Create ticket with all 3 items
      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-SVC-BULK',
        orderNumber: 'POS-SVC-BULK',
        orderType: 'dine_in',
        items: [
          {
            orderItemId: item1Id,
            menuItem: order.items[0].menuItem,
            menuItemName: 'Burger',
            quantity: 1,
            status: 'ready',
          },
          {
            orderItemId: item2Id,
            menuItem: order.items[1].menuItem,
            menuItemName: 'Fries',
            quantity: 1,
            status: 'ready',
          },
          {
            orderItemId: item3Id,
            menuItem: order.items[2].menuItem,
            menuItemName: 'Salad',
            quantity: 1,
            status: 'ready',
          },
        ],
        status: 'ready',
      });

      // Bulk-serve all 3 items in one transaction (simulates serveReadyItems)
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const mockUser = { _id: new mongoose.Types.ObjectId(), name: 'Test Waiter Bulk' };
        
        // Serve all items
        await ItemStatusService.updateItemStatus(order, item1Id, 'served', mockUser, session);
        await ItemStatusService.updateItemStatus(order, item2Id, 'served', mockUser, session);
        await ItemStatusService.updateItemStatus(order, item3Id, 'served', mockUser, session);
        
        // Sync each one (syncTicketItemCompletion called 3 times, same as real flow)
        await StatusSyncService.syncTicketItemCompletion(order, item1Id, session);
        await StatusSyncService.syncTicketItemCompletion(order, item2Id, session);
        await StatusSyncService.syncTicketItemCompletion(order, item3Id, session);
      });
      await session.endSession();

      // Verify ticket correctly marked completed (not stuck in stale state)
      const updatedTicket = await KitchenTicket.findById(ticket._id);
      expect(updatedTicket.items[0].status).toBe('completed');
      expect(updatedTicket.items[1].status).toBe('completed');
      expect(updatedTicket.items[2].status).toBe('completed');
      expect(updatedTicket.status).toBe('completed');

      // Verify only ONE outbox event created (not 3)
      const events = await OutboxEvent.find({ 
        eventType: 'ticket:completed',
        'payload.ticketId': ticket._id.toString(),
      });
      expect(events).toHaveLength(1);
    });

    it('should emit socket event when outbox handler processes ticket:completed', async () => {
      // Create order and ticket
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        orderType: 'dine_in',
        status: 'preparing',
        customerName: 'Test Customer Socket',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Pasta',
            quantity: 1,
            unitPrice: 12,
            totalPrice: 12,
            status: 'ready',
            requiresKitchen: true,
          },
        ],
        subtotal: 12,
        totalAmount: 12,
        paymentStatus: 'unpaid',
      });

      const itemId = order.items[0]._id;

      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-SVC-SOCKET',
        orderNumber: 'POS-SVC-SOCKET',
        orderType: 'dine_in',
        items: [
          {
            orderItemId: itemId,
            menuItem: order.items[0].menuItem,
            menuItemName: 'Pasta',
            quantity: 1,
            status: 'ready',
          },
        ],
        status: 'ready',
      });

      // Serve the item (creates outbox event)
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const mockUser = { _id: new mongoose.Types.ObjectId(), name: 'Test Waiter' };
        await ItemStatusService.updateItemStatus(order, itemId, 'served', mockUser, session);
        await StatusSyncService.syncTicketItemCompletion(order, itemId, session);
      });
      await session.endSession();

      // Find the outbox event
      const outboxEvent = await OutboxEvent.findOne({ 
        eventType: 'ticket:completed',
        'payload.ticketId': ticket._id.toString(),
      });
      expect(outboxEvent).toBeTruthy();

      // Mock Socket.IO
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };

      // Process the event through the handler
      const { handleTicketCompleted } = require('../src/infrastructure/outbox/handlers/ticket-completed-handler');
      await handleTicketCompleted(outboxEvent, mockIo);

      // Verify socket emission
      expect(mockIo.to).toHaveBeenCalledWith(`branch:${branch._id.toString()}:station:${station._id.toString()}`);
      expect(mockIo.emit).toHaveBeenCalledWith('ticket:completed', expect.objectContaining({
        ticketId: ticket._id.toString(),
        stationId: station._id.toString(),
        orderId: order._id.toString(),
      }));
    });
  });
});
