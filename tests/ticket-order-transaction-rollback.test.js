// tests/ticket-order-transaction-rollback.test.js
// Phase 4: Transaction-Safe Ticket → Order Sync

const mongoose = require('mongoose');

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockIo = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};
jest.mock('../src/infrastructure/websocket/socket-server', () => ({
  getIo: jest.fn(() => mockIo),
  createSocketServer: jest.fn(),
}));

const KitchenTicket = require('../models/KitchenTicket');
const Order = require('../models/orderModel');
const KitchenStation = require('../models/KitchenStation');
const KitchenTicketService = require('../src/modules/kitchen/service/KitchenTicketService');

describe('Phase 4: Transaction-Safe Ticket → Order Sync', () => {
  let station, order, ticket;

  beforeAll(async () => {
    await mongoose.connect(process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb-test', {
      serverSelectionTimeoutMS: 5000,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await KitchenTicket.deleteMany({});
    await Order.deleteMany({});
    await KitchenStation.deleteMany({});

    station = await KitchenStation.create({
      merchant: new mongoose.Types.ObjectId(),
      branch: new mongoose.Types.ObjectId(),
      name: 'Test Grill',
      code: 'GRILL',
      displayOrder: 1,
      isActive: true,
    });

    order = await Order.create({
      merchant: new mongoose.Types.ObjectId(),
      branch: new mongoose.Types.ObjectId(),
      orderType: 'takeaway',
      source: 'admin',
      orderNumber: '#TX-001',
      customerName: 'Transaction Test',
      status: 'preparing',
      items: [
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          status: 'pending',
          requiresKitchen: true,
        },
      ],
      subtotal: 100,
      totalAmount: 100,
      paymentStatus: 'unpaid',
    });

    const orderItemId = order.items[0]._id;

    ticket = await KitchenTicket.create({
      merchant: order.merchant,
      branch: order.branch,
      order: order._id,
      station: station._id,
      ticketNumber: 'T-001',
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: 'pending',
      items: [
        {
          orderItemId,
          menuItem: order.items[0].menuItem,
          menuItemName: 'Test Item',
          quantity: 1,
          status: 'pending',
        },
      ],
    });
  });

  it('should atomically update BOTH ticket and order on success (happy path)', async () => {
    const ticketItemId = ticket.items[0]._id;
    const actor = { id: new mongoose.Types.ObjectId(), role: 'test' };

    await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'in_progress', actor);

    const t1 = await KitchenTicket.findById(ticket._id);
    const o1 = await Order.findById(order._id);
    
    expect(t1.items[0].status).toBe('in_progress');
    expect(o1.items[0].status).toBe('in_progress');

    await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'ready', actor);

    const t2 = await KitchenTicket.findById(ticket._id);
    const o2 = await Order.findById(order._id);
    
    expect(t2.items[0].status).toBe('ready');
    expect(o2.items[0].status).toBe('ready');
    expect(t2.status).toBe('ready');
    expect(o2.status).toBe('ready');

    console.log('✅ Happy Path PASSED');
  });

  it('should throw error when order sync fails', async () => {
    const ticketItemId = ticket.items[0]._id;
    const actor = { id: new mongoose.Types.ObjectId(), role: 'test' };

    order.items = [];
    await order.save();

    await expect(
      KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'in_progress', actor)
    ).rejects.toThrow(/not found/);

    console.log('✅ Error Handling PASSED');
  });

  it('confirms MongoDB transaction infrastructure works', async () => {
    const TestSchema = new mongoose.Schema({ nested: [{ status: String }] });
    const TestModel = mongoose.model('TxTest', TestSchema);
    await TestModel.deleteMany({});

    const doc = await TestModel.create({ nested: [{ status: 'start' }] });

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const txDoc = await TestModel.findById(doc._id).session(session);
        txDoc.nested[0].status = 'modified';
        await txDoc.save({ session });
        throw new Error('ABORT');
      });
    } catch (err) {
      // Expected
    }

    const final = await TestModel.findById(doc._id);
    expect(final.nested[0].status).toBe('start');

    console.log('✅ MongoDB Transactions VERIFIED');
    await TestModel.collection.drop();
  });
});
