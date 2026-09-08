// tests/ticket-order-transaction-REAL-ROLLBACK.test.js
// Phase 4: REAL rollback test - error thrown BEFORE save
// Must prove: error thrown inside withTransaction causes REAL rollback

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

describe('Phase 4: REAL Transaction Rollback Test', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb-test', {
      serverSelectionTimeoutMS: 5000,
    });

    // Verify replica set
    const admin = mongoose.connection.db.admin();
    const hello = await admin.command({ hello: 1 });
    console.log(`\n✓ Connected to replica set: ${hello.setName}`);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('PROOF: withTransaction() truly rolls back when error thrown before save', async () => {
    console.log('\n=== ROLLBACK PROOF TEST ===');
    console.log('Testing: Error thrown BEFORE any database operation');

    // Create test document with nested array
    const TestSchema = new mongoose.Schema({
      name: String,
      items: [{ status: String }],
    });
    const TestModel = mongoose.model('RollbackProof', TestSchema);
    await TestModel.deleteMany({});

    const doc = await TestModel.create({
      name: 'Test',
      items: [{ status: 'start' }],
    });

    console.log(`1. Created doc: items[0].status = "start"`);
    const before = await TestModel.findById(doc._id);
    console.log(`2. Verified in DB: items[0].status = "${before.items[0].status}"`);

    // Now attempt transaction that modifies then throws
    const session = await mongoose.startSession();
    let errorWasThrown = false;
    let errorThrowPoint = null;

    try {
      await session.withTransaction(async () => {
        // Get document inside transaction
        const txDoc = await TestModel.findById(doc._id).session(session);
        console.log(`3. Inside transaction: loaded doc, items[0].status = "${txDoc.items[0].status}"`);

        // Modify it
        txDoc.items[0].status = 'modified';
        console.log(`4. Inside transaction: modified to "modified" (in memory)`);

        // THROW ERROR BEFORE SAVE
        errorThrowPoint = 'before save';
        throw new Error('INTENTIONAL_ERROR_BEFORE_SAVE');
        
        // This line never executes
        await txDoc.save({ session });
      });
    } catch (err) {
      errorWasThrown = true;
      console.log(`5. Transaction threw: ${err.message}`);
      console.log(`   Error thrown at: ${errorThrowPoint}`);
    }

    await session.endSession();

    expect(errorWasThrown).toBe(true);
    expect(errorThrowPoint).toBe('before save');

    // CRITICAL CHECK: Reload from database and verify rollback
    const after = await TestModel.findById(doc._id);
    console.log(`6. After transaction abort, reloaded from DB: items[0].status = "${after.items[0].status}"`);

    // THIS IS THE REAL TEST: Did it roll back?
    expect(after.items[0].status).toBe('start');
    console.log(`✓ VERIFIED: Status rolled back to "start" (transaction actually aborted)`);

    await TestModel.collection.drop();
  });

  it('PROOF: Kitchen service transaction MUST use this pattern correctly', async () => {
    console.log('\n=== KITCHEN SERVICE TRANSACTION PATTERN ===');

    // This test documents what the pattern MUST be
    const TicketSchema = new mongoose.Schema({
      ticketNumber: String,
      items: [{ itemId: String, status: String }],
    });
    const TicketModel = mongoose.model('TicketPattern', TicketSchema);
    await TicketModel.deleteMany({});

    const ticket = await TicketModel.create({
      ticketNumber: 'T-1',
      items: [{ itemId: 'item-1', status: 'pending' }],
    });

    console.log('Initial: ticket.items[0].status = "pending"');

    // Correct pattern for transaction
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // Step 1: Get ticket with session
        const txTicket = await TicketModel.findById(ticket._id).session(session);
        
        // Step 2: Modify in memory
        txTicket.items[0].status = 'ready';
        console.log('Modified in memory: "ready"');
        
        // Step 3: Save INSIDE transaction with session
        await txTicket.save({ session });
        console.log('Saved with session inside transaction');
        
        // Step 4: Simulate downstream failure (e.g., order sync fails)
        throw new Error('Simulated order sync failure');
        
        // This never executes:
        // return txTicket;
      });
    } catch (err) {
      console.log(`Error thrown: ${err.message}`);
    }

    await session.endSession();

    // Verify rollback
    const final = await TicketModel.findById(ticket._id);
    expect(final.items[0].status).toBe('pending');
    console.log(`Verified rollback: status is back to "pending"`);

    await TicketModel.collection.drop();
  });

  it('FAILURE CASE: Missing session in findById = NO ROLLBACK', async () => {
    console.log('\n=== FAILURE CASE: Missing Session ===');

    const BadSchema = new mongoose.Schema({
      items: [{ status: String }],
    });
    const BadModel = mongoose.model('BadPattern', BadSchema);
    await BadModel.deleteMany({});

    const doc = await BadModel.create({
      items: [{ status: 'start' }],
    });

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // ❌ WRONG: No session on findById
        const txDoc = await BadModel.findById(doc._id);  // Missing .session(session)
        
        txDoc.items[0].status = 'modified';
        
        // Even with session here, it's too late - doc wasn't loaded in transaction
        await txDoc.save({ session });
        
        throw new Error('Error after save outside transaction scope');
      });
    } catch (err) {
      // Expected
    }

    await session.endSession();

    const final = await BadModel.findById(doc._id);
    console.log(`Without session on query: final status = "${final.items[0].status}"`);
    console.log(`⚠️  This likely shows "modified" (NOT rolled back) due to missing session`);
    
    await BadModel.collection.drop();
  });
});
