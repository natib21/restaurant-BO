// tests/payment-completion-ticket-sync.test.js
// ✅ Payment completion guard + Ticket completion reverse sync tests

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const KitchenTicket = require('../models/KitchenTicket');
const Table = require('../models/tabelModel');
const OutboxEvent = require('../models/OutboxEvent');

let app;

describe('Payment Completion Guard & Ticket Sync', () => {
  let merchant, admin, branch, table, station;
  let adminToken;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
    
    // Create test merchant
    const Merchant = require('../models/merchantModel');
    merchant = await Merchant.create({
      businessName: 'Test Restaurant',
      slug: 'test-restaurant',
      email: 'test@restaurant.com',
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@test.com',
        phone: '+251912345678',
      },
      subscription: { tier: 'premium' },
    });

    // Create test branch
    const Branch = require('../models/branchModel');
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch',
      location: {
        city: 'Test City',
        coordinates: [38.7578, 9.0320], // Addis Ababa coords
      },
      address: { street: '123 Test St' },
    });

    // Create test admin user
    const User = require('../models/userModel');
    admin = await User.create({
      merchant: merchant._id,
      email: 'admin@test.com',
      password: 'password123',
      name: 'Admin User',
      role: {
        name: 'admin',
        permissions: [],
      },
    });
    
    // Create test table
    table = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      number: 'T1',
      capacity: 4,
      status: 'occupied',
    });

    // Create test kitchen station
    const KitchenStation = require('../models/KitchenStation');
    station = await KitchenStation.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Grill',
      code: 'GRILL',
    });

    // Get admin token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await KitchenTicket.deleteMany({});
    await OutboxEvent.deleteMany({});
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
        paymentStatus: 'pending',
      });

      // Attempt to mark as paid
      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}/pay`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'cash' })
        .expect(400);

      expect(res.body.message).toMatch(/cannot complete.*before all items.*served/i);

      // Verify order not completed
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('pending');
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
        paymentStatus: 'pending',
      });

      // Mark as paid
      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}/pay`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'cash' })
        .expect(200);

      // Verify order completed
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('paid');
      expect(updatedOrder.status).toBe('completed');
      expect(updatedOrder.completedAt).toBeTruthy();

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
        paymentStatus: 'pending',
      });

      // Mark as paid (prepayment is allowed for takeaway)
      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}/pay`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'cash' })
        .expect(200);

      // Verify payment recorded but order NOT completed
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('paid');
      expect(updatedOrder.status).toBe('preparing');  // Still preparing!
      expect(updatedOrder.completedAt).toBeFalsy();
    });

    it('should not free table until order actually completes', async () => {
      // Set table to occupied
      await Table.findByIdAndUpdate(table._id, { status: 'occupied' });

      // Create dine-in order with unserved items
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        orderType: 'dine_in',
        status: 'ready',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Steak',
            quantity: 1,
            unitPrice: 25,
            totalPrice: 25,
            status: 'ready',  // Not served
            requiresKitchen: true,
          },
        ],
        subtotal: 25,
        totalAmount: 25,
        paymentStatus: 'pending',
      });

      // Attempt payment (should fail)
      await request(app)
        .patch(`/api/v1/orders/${order._id}/pay`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentMethod: 'cash' })
        .expect(400);

      // Verify table still occupied
      const checkTable = await Table.findById(table._id);
      expect(checkTable.status).toBe('occupied');
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
        orderType: 'dine_in',
        status: 'preparing',
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
      });

      const orderItemId = order.items[0]._id;

      // Create linked ticket
      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-1',
        orderNumber: 'POS-001',
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

      // Serve the order item
      await request(app)
        .patch(`/api/v1/orders/${order._id}/items/${orderItemId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'served' })
        .expect(200);

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
        orderType: 'dine_in',
        status: 'preparing',
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
      });

      const item1Id = order.items[0]._id;
      const item2Id = order.items[1]._id;

      // Create ticket with both items
      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-2',
        orderNumber: 'POS-002',
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
      await request(app)
        .patch(`/api/v1/orders/${order._id}/items/${item1Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'served' })
        .expect(200);

      // Verify ticket status still 'ready' (not 'completed')
      let updatedTicket = await KitchenTicket.findById(ticket._id);
      expect(updatedTicket.items[0].status).toBe('completed');
      expect(updatedTicket.items[1].status).toBe('ready');  // Still ready
      expect(updatedTicket.status).toBe('ready');  // Ticket still ready!

      // Now serve the second item
      await request(app)
        .patch(`/api/v1/orders/${order._id}/items/${item2Id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'served' })
        .expect(200);

      // Verify ticket NOW becomes completed
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
        orderType: 'dine_in',
        status: 'preparing',
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
      });

      const itemId = order.items[0]._id;

      // Create ticket
      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-3',
        orderNumber: 'POS-003',
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
      await request(app)
        .patch(`/api/v1/orders/${order._id}/items/${itemId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'served' })
        .expect(200);

      // Verify outbox event created
      const outboxEvent = await OutboxEvent.findOne({
        eventType: 'ticket:completed',
        'payload.ticketId': ticket._id.toString(),
      });

      expect(outboxEvent).toBeTruthy();
      expect(outboxEvent.payload.ticketId).toBe(ticket._id.toString());
      expect(outboxEvent.payload.stationId).toBe(station._id.toString());
      expect(outboxEvent.payload.previousStatus).toBe('ready');
      expect(outboxEvent.payload.newStatus).toBe('completed');
    });

    it('should exclude completed tickets from active board query', async () => {
      // Create active ticket
      const activeTicket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: new mongoose.Types.ObjectId(),
        station: station._id,
        ticketNumber: 'GRILL-4',
        orderNumber: 'POS-004',
        orderType: 'dine_in',
        items: [
          {
            orderItemId: new mongoose.Types.ObjectId(),
            menuItem: new mongoose.Types.ObjectId(),
            menuItemName: 'Active Item',
            quantity: 1,
            status: 'ready',
          },
        ],
        status: 'ready',
      });

      // Create completed ticket
      const completedTicket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: new mongoose.Types.ObjectId(),
        station: station._id,
        ticketNumber: 'GRILL-5',
        orderNumber: 'POS-005',
        orderType: 'dine_in',
        items: [
          {
            orderItemId: new mongoose.Types.ObjectId(),
            menuItem: new mongoose.Types.ObjectId(),
            menuItemName: 'Completed Item',
            quantity: 1,
            status: 'completed',
          },
        ],
        status: 'completed',
        completedAt: new Date(),
      });

      // Query active board (default - no completed)
      const activeRes = await request(app)
        .get(`/api/v1/kitchen/stations/${station._id}/tickets`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(activeRes.body.results).toBe(1);
      expect(activeRes.body.data.tickets[0]._id).toBe(activeTicket._id.toString());

      // Query with includeCompleted=true
      const allRes = await request(app)
        .get(`/api/v1/kitchen/stations/${station._id}/tickets?includeCompleted=true`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(allRes.body.results).toBe(2);
    });

    it('should handle non-kitchen items gracefully', async () => {
      // Create order with NON-kitchen item (requiresKitchen: false)
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderType: 'dine_in',
        status: 'preparing',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Bottled Water',
            quantity: 1,
            unitPrice: 2,
            totalPrice: 2,
            status: 'ready',
            requiresKitchen: false,  // ❌ No kitchen needed
          },
        ],
        subtotal: 2,
        totalAmount: 2,
      });

      const itemId = order.items[0]._id;

      // Serve the non-kitchen item (should NOT error)
      const res = await request(app)
        .patch(`/api/v1/orders/${order._id}/items/${itemId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'served' })
        .expect(200);

      expect(res.body.status).toBe('success');

      // Verify no ticket lookup attempted (no error thrown)
      const tickets = await KitchenTicket.find({ order: order._id });
      expect(tickets.length).toBe(0);
    });

    // ✅ NEW TEST 1: Bulk serve with multiple items on same ticket
    it('should handle bulk serve where multiple items link to same ticket', async () => {
      // Create order with 2 items
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderType: 'dine_in',
        status: 'ready',
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
      });

      const item1Id = order.items[0]._id;
      const item2Id = order.items[1]._id;

      // Create ONE ticket with BOTH items
      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-BULK',
        orderNumber: 'POS-BULK',
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

      // Bulk serve ALL ready items (both items served in one call)
      await request(app)
        .post(`/api/v1/orders/${order._id}/items/serve-ready`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify _recomputeTicketStatus called twice but ticket ends up completed
      const updatedTicket = await KitchenTicket.findById(ticket._id);
      expect(updatedTicket.items[0].status).toBe('completed');
      expect(updatedTicket.items[1].status).toBe('completed');
      expect(updatedTicket.status).toBe('completed');  // ✅ Not stuck in intermediate state
      expect(updatedTicket.completedAt).toBeTruthy();
    });

    // ✅ NEW TEST 2: End-to-end integration test for outbox event processing
    it('should emit Socket.IO event after outbox processes ticket:completed', async () => {
      // Mock Socket.IO
      const mockEmit = jest.fn();
      const mockIo = {
        to: jest.fn().mockReturnValue({ emit: mockEmit }),
      };

      // Inject mock
      jest.mock('../infrastructure/websocket/socket-server', () => ({
        getIo: () => mockIo,
      }));

      // Create order and ticket
      const order = await Order.create({
        merchant: merchant._id,
        branch: branch._id,
        orderType: 'dine_in',
        status: 'ready',
        items: [
          {
            menuItem: new mongoose.Types.ObjectId(),
            name: 'Test Item',
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
            status: 'ready',
            requiresKitchen: true,
          },
        ],
        subtotal: 10,
        totalAmount: 10,
      });

      const itemId = order.items[0]._id;

      const ticket = await KitchenTicket.create({
        merchant: merchant._id,
        branch: branch._id,
        order: order._id,
        station: station._id,
        ticketNumber: 'GRILL-EMIT',
        orderNumber: 'POS-EMIT',
        orderType: 'dine_in',
        items: [
          {
            orderItemId: itemId,
            menuItem: order.items[0].menuItem,
            menuItemName: 'Test Item',
            quantity: 1,
            status: 'ready',
          },
        ],
        status: 'ready',
      });

      // Serve the item (creates outbox event)
      await request(app)
        .patch(`/api/v1/orders/${order._id}/items/${itemId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'served' })
        .expect(200);

      // Manually trigger outbox worker to process the event
      const outboxWorker = require('../src/infrastructure/outbox/outbox-worker');
      await outboxWorker.processBatch();  // Process pending events

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify Socket.IO emit was called
      expect(mockIo.to).toHaveBeenCalledWith(`station-${station._id}`);
      expect(mockEmit).toHaveBeenCalledWith(
        'ticket:completed',
        expect.objectContaining({
          ticketId: ticket._id.toString(),
          stationId: station._id.toString(),
          previousStatus: 'ready',
          newStatus: 'completed',
        })
      );

      // Clean up mock
      jest.unmock('../infrastructure/websocket/socket-server');
    });
  });
});
