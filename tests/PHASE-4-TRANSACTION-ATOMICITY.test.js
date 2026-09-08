// tests/PHASE-4-TRANSACTION-ATOMICITY.test.js
// Phase 4: FINAL TEST - Transaction atomicity with real Kitchen Service
// REQUIREMENT: Error in order sync MUST roll back ticket changes

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

describe('Phase 4: Transaction Atomicity - Ticket → Order Sync', () => {
  let station, order, ticket, actor;

  beforeAll(async () => {
    await mongoose.connect(process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb-test', {
      serverSelectionTimeoutMS: 5000,
    });

    // Verify replica set
    const admin = mongoose.connection.db.admin();
    const hello = await admin.command({ hello: 1 });
    if (!hello.setName) {
      throw new Error('MongoDB must be a replica set (transactions require replica set)');
    }
    console.log(`\n✓ Connected to replica set: ${hello.setName}`);
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
      orderNumber: '#ATOMIC-001',
      customerName: 'Atomicity Test',
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
      ticketNumber: 'T-ATOMIC',
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

    actor = { id: new mongoose.Types.ObjectId(), role: 'test' };
  });

  describe('Happy Path: Atomic Commit', () => {
    it('should commit BOTH ticket and order atomically', async () => {
      const ticketItemId = ticket.items[0]._id;

      console.log('\n=== ATOMIC COMMIT TEST ===');
      console.log('Before: ticket.items[0].status = pending, order.items[0].status = pending');

      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'in_progress', actor);

      const t1 = await KitchenTicket.findById(ticket._id);
      const o1 = await Order.findById(order._id);

      expect(t1.items[0].status).toBe('in_progress');
      expect(o1.items[0].status).toBe('in_progress');
      console.log('After: ticket.items[0].status = in_progress, order.items[0].status = in_progress ✓');

      await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'ready', actor);

      const t2 = await KitchenTicket.findById(ticket._id);
      const o2 = await Order.findById(order._id);

      expect(t2.items[0].status).toBe('ready');
      expect(o2.items[0].status).toBe('ready');
      console.log('After: ticket.items[0].status = ready, order.items[0].status = ready ✓');
    });
  });

  describe('Atomicity Failure: Order Sync Error', () => {
    it('should ROLLBACK ticket when order sync fails (order item missing)', async () => {
      const ticketItemId = ticket.items[0]._id;

      console.log('\n=== ATOMICITY FAILURE TEST ===');
      console.log('Setup: Order item will disappear to trigger sync failure');
      console.log('Before: ticket.items[0].status = pending, order.items[0].status = pending');

      // Store the pre-transaction state
      const ticketBefore = await KitchenTicket.findById(ticket._id);
      const orderBefore = await Order.findById(order._id);
      expect(ticketBefore.items[0].status).toBe('pending');
      expect(orderBefore.items[0].status).toBe('pending');

      // Remove the order item after ticket is created but before sync
      // This simulates data corruption or concurrent deletion
      order.items = [];
      await order.save();
      console.log('Order item deleted (simulating data integrity failure)');

      // Attempt to update ticket - should fail
      let transactionFailed = false;
      let errorMessage = '';
      try {
        await KitchenTicketService.updateTicketItemStatus(ticket._id, ticketItemId, 'in_progress', actor);
        console.log('ERROR: updateTicketItemStatus should have failed!');
        throw new Error('Transaction should have thrown but didnt');
      } catch (err) {
        transactionFailed = true;
        errorMessage = err.message;
        console.log(`Transaction failed as expected: "${err.message}"`);
      }

      expect(transactionFailed).toBe(true);
      expect(errorMessage).toContain('not found');

      // CRITICAL: Verify ticket rolled back to pending
      const ticketAfter = await KitchenTicket.findById(ticket._id);
      console.log(`After rollback: ticket.items[0].status = "${ticketAfter.items[0].status}"`);

      expect(ticketAfter.items[0].status).toBe('pending');
      console.log('✓ VERIFIED: Ticket rolled back to pending (transaction was atomic)');
    });
  });

  describe('Proof: MongoDB Transaction Infrastructure', () => {
    it('confirms replica set transactions work with nested documents', async () => {
      console.log('\n=== TRANSACTION INFRASTRUCTURE PROOF ===');

      const TestSchema = new mongoose.Schema({
        nested: [{ status: String }],
      });
      const TestModel = mongoose.model('TxInfraProof', TestSchema);
      await TestModel.deleteMany({});

      const doc = await TestModel.create({ nested: [{ status: 'before' }] });
      console.log('Created: nested[0].status = "before"');

      const session = await mongoose.startSession();
      let transactionAborted = false;

      try {
        await session.withTransaction(async () => {
          const txDoc = await TestModel.findById(doc._id).session(session);
          txDoc.nested[0].status = 'inside_tx';
          await txDoc.save({ session });
          console.log('Inside tx: modified to "inside_tx" and saved');
          throw new Error('ABORT_TX');
        });
      } catch (err) {
        transactionAborted = true;
        console.log(`Transaction aborted: ${err.message}`);
      }

      await session.endSession();

      const final = await TestModel.findById(doc._id);
      console.log(`After abort: nested[0].status = "${final.nested[0].status}"`);

      expect(final.nested[0].status).toBe('before');
      expect(transactionAborted).toBe(true);
      console.log('✓ Transactions confirmed working: changes rolled back');

      await TestModel.collection.drop();
    });
  });
});
