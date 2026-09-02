/**
 * Unit Test: Order Number Generation Logic
 * Tests the core order number generation without full app initialization
 */

const mongoose = require('mongoose');
const Counter = require('../models/CounterModel.js.js');
const Branch = require('../models/branchModel');
const Merchant = require('../models/merchantModel');

// Mock the OrderTransactionService generateOrderNumber logic
async function generateOrderNumber({ merchant, branch }, session) {
  const prefix = 'ORDER';

  // Check if counter exists for this branch
  let counter = await Counter.findOne(
    { merchantId: merchant, branchId: branch, prefix, date: null },
    null,
    { session }
  );

  if (!counter) {
    // First order for this branch - initialize with configured starting number
    const branchDoc = await Branch.findById(branch)
      .select('config.orderNumberStart')
      .session(session);
    
    const startingNumber = branchDoc?.config?.orderNumberStart || 1;

    // Create counter starting at (startingNumber - 1) so first increment gives startingNumber
    counter = await Counter.findOneAndUpdate(
      { merchantId: merchant, branchId: branch, prefix, date: null },
      { 
        $setOnInsert: { 
          seq: startingNumber - 1,
          startingNumber,
          prefix,
          startedAt: new Date()
        } 
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );
  }

  // Atomically increment sequence
  counter = await Counter.findOneAndUpdate(
    { _id: counter._id },
    { $inc: { seq: 1 } },
    { new: true, session }
  );

  // Format: #ORDER/000001 (6-digit zero-padded)
  return `#ORDER/${counter.seq.toString().padStart(6, '0')}`;
}

describe('Order Number Generation - Unit Tests', () => {
  let merchant, branch1, branch2;

  beforeAll(async () => {
    await mongoose.connect(process.env.TEST_DB_URI || process.env.DATABASE_URI);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Create test merchant
    merchant = await Merchant.create({
      businessName: 'Test Restaurant',
      slug: `test-${Date.now()}`,
      email: `test-${Date.now()}@test.com`,
      phone: '+251911223344',
      status: 'approved',
      isActive: true,
    });

    // Create test branches
    branch1 = await Branch.create({
      merchant: merchant._id,
      name: 'Branch 1',
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7469, 9.0320],
      },
    });

    branch2 = await Branch.create({
      merchant: merchant._id,
      name: 'Branch 2',
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7969, 9.0120],
      },
    });
  });

  afterEach(async () => {
    await Counter.deleteMany({ merchantId: merchant._id });
    await Branch.deleteMany({ merchant: merchant._id });
    await Merchant.deleteMany({ _id: merchant._id });
  });

  test('generates order number in correct format', async () => {
    const session = await mongoose.startSession();
    
    try {
      const orderNumber = await session.withTransaction(async () => {
        return await generateOrderNumber(
          { merchant: merchant._id, branch: branch1._id },
          session
        );
      });

      expect(orderNumber).toMatch(/^#ORDER\/\d{6}$/);
      expect(orderNumber).toBe('#ORDER/000001');
    } finally {
      await session.endSession();
    }
  });

  test('increments sequence correctly', async () => {
    const session = await mongoose.startSession();
    
    try {
      const numbers = await session.withTransaction(async () => {
        const num1 = await generateOrderNumber(
          { merchant: merchant._id, branch: branch1._id },
          session
        );
        const num2 = await generateOrderNumber(
          { merchant: merchant._id, branch: branch1._id },
          session
        );
        const num3 = await generateOrderNumber(
          { merchant: merchant._id, branch: branch1._id },
          session
        );
        return [num1, num2, num3];
      });

      expect(numbers).toEqual(['#ORDER/000001', '#ORDER/000002', '#ORDER/000003']);
    } finally {
      await session.endSession();
    }
  });

  test('different branches have independent sequences', async () => {
    const session = await mongoose.startSession();
    
    try {
      const numbers = await session.withTransaction(async () => {
        const b1n1 = await generateOrderNumber(
          { merchant: merchant._id, branch: branch1._id },
          session
        );
        const b2n1 = await generateOrderNumber(
          { merchant: merchant._id, branch: branch2._id },
          session
        );
        const b1n2 = await generateOrderNumber(
          { merchant: merchant._id, branch: branch1._id },
          session
        );
        return [b1n1, b2n1, b1n2];
      });

      expect(numbers[0]).toBe('#ORDER/000001'); // Branch 1, order 1
      expect(numbers[1]).toBe('#ORDER/000001'); // Branch 2, order 1 (same number, different branch)
      expect(numbers[2]).toBe('#ORDER/000002'); // Branch 1, order 2
    } finally {
      await session.endSession();
    }
  });

  test('respects custom starting number', async () => {
    // Update branch2 to start from 1000
    await Branch.findByIdAndUpdate(branch2._id, {
      'config.orderNumberStart': 1000
    });

    const session = await mongoose.startSession();
    
    try {
      const orderNumber = await session.withTransaction(async () => {
        return await generateOrderNumber(
          { merchant: merchant._id, branch: branch2._id },
          session
        );
      });

      expect(orderNumber).toBe('#ORDER/001000');
    } finally {
      await session.endSession();
    }
  });

  test('counter is created with correct fields', async () => {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        await generateOrderNumber(
          { merchant: merchant._id, branch: branch1._id },
          session
        );
      });

      const counter = await Counter.findOne({
        merchantId: merchant._id,
        branchId: branch1._id,
        prefix: 'ORDER',
      });

      expect(counter).toBeDefined();
      expect(counter.seq).toBe(1);
      expect(counter.date).toBeNull();
      expect(counter.prefix).toBe('ORDER');
      expect(counter.startingNumber).toBe(1);
      expect(counter.startedAt).toBeDefined();
    } finally {
      await session.endSession();
    }
  });
});
