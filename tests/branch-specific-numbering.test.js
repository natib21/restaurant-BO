/**
 * Test: Branch-Specific Table and Order Numbering
 * 
 * Verifies that:
 * 1. Table numbers are unique per branch (not globally)
 * 2. Order numbers are unique per branch with format #ORDER/000001
 * 3. Order numbers are continuous (not daily reset)
 * 4. Starting numbers are configurable per branch
 * 5. Concurrent order creation is safe (no duplicates)
 */

const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Table = require('../models/tabelModel');
const Counter = require('../models/CounterModel.js.js');
const { OrderTransactionService } = require('../src/modules/order/service/OrderTransactionService');

describe('Branch-Specific Numbering', () => {
  let merchant;

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Create test merchant
    merchant = await Merchant.create({
      businessName: 'Test Numbering Restaurant',
      slug: `numbering-test-${Date.now()}`,
      email: `numbering-${Date.now()}@test.com`,
      phone: '+251911223344',
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true,
      features: {
        optional: {
          orders: { enabled: true },
        },
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await Counter.deleteMany({ merchantId: merchant._id });
    await Table.deleteMany({ merchant: merchant._id });
    await Branch.deleteMany({ merchant: merchant._id });
    await Merchant.deleteMany({ _id: merchant._id });
  });

  // ============================================================
  // PHASE 1: Table Numbering (Branch-Scoped)
  // ============================================================

  describe('Table Numbering - Branch-Scoped', () => {
    test('allows same table number in different branches', async () => {
      const branch1 = await Branch.create({
        merchant: merchant._id,
        name: 'Downtown Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      const branch2 = await Branch.create({
        merchant: merchant._id,
        name: 'Airport Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7969, 9.0120],
        },
      });

      // ✅ Create T-01 in Branch 1
      const table1Branch1 = await Table.create({
        merchant: merchant._id,
        branch: branch1._id,
        tableNumber: 'T-01',
        capacity: 4,
      });

      // ✅ Create T-01 in Branch 2 (same table number, different branch)
      const table1Branch2 = await Table.create({
        merchant: merchant._id,
        branch: branch2._id,
        tableNumber: 'T-01',
        capacity: 4,
      });

      expect(table1Branch1.tableNumber).toBe('T-01');
      expect(table1Branch2.tableNumber).toBe('T-01');
      expect(table1Branch1._id.toString()).not.toBe(table1Branch2._id.toString());
    });

    test('prevents duplicate table number in same branch', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Test Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      // Create first table
      await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-01',
        capacity: 4,
      });

      // ❌ Try to create duplicate table in same branch
      await expect(
        Table.create({
          merchant: merchant._id,
          branch: branch._id,
          tableNumber: 'T-01',
          capacity: 6,
        })
      ).rejects.toThrow();
    });

    test('allows multiple unique table numbers in same branch', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Test Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      const table1 = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-01',
        capacity: 4,
      });

      const table2 = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-02',
        capacity: 4,
      });

      const table3 = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'T-03',
        capacity: 6,
      });

      expect(table1.tableNumber).toBe('T-01');
      expect(table2.tableNumber).toBe('T-02');
      expect(table3.tableNumber).toBe('T-03');
    });
  });

  // ============================================================
  // PHASE 2: Order Number Format
  // ============================================================

  describe('Order Number Format', () => {
    test('generates order numbers in #ORDER/000001 format', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Test Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      const session = await mongoose.startSession();
      
      try {
        const orderNumber = await session.withTransaction(async () => {
          return await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
        });

        expect(orderNumber).toMatch(/^#ORDER\/\d{6}$/);
        expect(orderNumber).toBe('#ORDER/000001');
      } finally {
        await session.endSession();
      }
    });

    test('increments sequence continuously', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Test Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      const session = await mongoose.startSession();
      
      try {
        const [order1, order2, order3] = await session.withTransaction(async () => {
          const num1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
          const num2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
          const num3 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
          return [num1, num2, num3];
        });

        expect(order1).toBe('#ORDER/000001');
        expect(order2).toBe('#ORDER/000002');
        expect(order3).toBe('#ORDER/000003');
      } finally {
        await session.endSession();
      }
    });

    test('zero-pads numbers correctly', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Test Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      // Pre-seed counter to test padding
      await Counter.create({
        merchantId: merchant._id,
        branchId: branch._id,
        prefix: 'ORDER',
        seq: 99,
        date: null,
      });

      const session = await mongoose.startSession();
      
      try {
        const [order100, order101] = await session.withTransaction(async () => {
          const num1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
          const num2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
          return [num1, num2];
        });

        expect(order100).toBe('#ORDER/000100');
        expect(order101).toBe('#ORDER/000101');
      } finally {
        await session.endSession();
      }
    });
  });

  // ============================================================
  // PHASE 3: Branch-Specific Sequences
  // ============================================================

  describe('Branch-Specific Order Sequences', () => {
    test('different branches have independent sequences', async () => {
      const branch1 = await Branch.create({
        merchant: merchant._id,
        name: 'Branch 1',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      const branch2 = await Branch.create({
        merchant: merchant._id,
        name: 'Branch 2',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7969, 9.0120],
        },
      });

      const session = await mongoose.startSession();
      
      try {
        const [b1o1, b2o1, b1o2, b2o2] = await session.withTransaction(async () => {
          const branch1Order1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch1._id },
            session
          );
          const branch2Order1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch2._id },
            session
          );
          const branch1Order2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch1._id },
            session
          );
          const branch2Order2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch2._id },
            session
          );
          return [branch1Order1, branch2Order1, branch1Order2, branch2Order2];
        });

        // ✅ Both branches start at 1
        expect(b1o1).toBe('#ORDER/000001');
        expect(b2o1).toBe('#ORDER/000001');

        // ✅ Each branch continues its own sequence
        expect(b1o2).toBe('#ORDER/000002');
        expect(b2o2).toBe('#ORDER/000002');
      } finally {
        await session.endSession();
      }
    });
  });

  // ============================================================
  // PHASE 4: Configurable Starting Number
  // ============================================================

  describe('Configurable Starting Number', () => {
    test('respects branch starting number configuration', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Branch with Custom Start',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
        config: {
          orderNumberStart: 1000, // ✅ Start from 1000
        },
      });

      const session = await mongoose.startSession();
      
      try {
        const [order1, order2] = await session.withTransaction(async () => {
          const num1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
          const num2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
          return [num1, num2];
        });

        expect(order1).toBe('#ORDER/001000');
        expect(order2).toBe('#ORDER/001001');
      } finally {
        await session.endSession();
      }
    });

    test('defaults to 1 when no starting number configured', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Branch with Default Start',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
        // No config specified
      });

      const session = await mongoose.startSession();
      
      try {
        const orderNumber = await session.withTransaction(async () => {
          return await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
        });

        expect(orderNumber).toBe('#ORDER/000001');
      } finally {
        await session.endSession();
      }
    });
  });

  // ============================================================
  // PHASE 5: Concurrency Safety
  // ============================================================

  describe('Concurrency Safety', () => {
    test('handles concurrent order number generation without duplicates', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Concurrent Test Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      // ✅ Generate 20 order numbers concurrently
      const promises = Array.from({ length: 20 }, async () => {
        const session = await mongoose.startSession();
        try {
          return await session.withTransaction(async () => {
            return await OrderTransactionService.generateOrderNumber(
              { merchant: merchant._id, branch: branch._id },
              session
            );
          });
        } finally {
          await session.endSession();
        }
      });

      const orderNumbers = await Promise.all(promises);

      // ✅ No duplicates
      const uniqueNumbers = new Set(orderNumbers);
      expect(uniqueNumbers.size).toBe(20);

      // ✅ All numbers are sequential
      const numbers = orderNumbers.map(n => parseInt(n.replace('#ORDER/', '')));
      numbers.sort((a, b) => a - b);
      expect(numbers[0]).toBe(1);
      expect(numbers[19]).toBe(20);
    });
  });

  // ============================================================
  // PHASE 6: Counter Model Validation
  // ============================================================

  describe('Counter Model - Continuous Numbering', () => {
    test('creates counter without date field for continuous numbering', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Test Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      const session = await mongoose.startSession();
      
      try {
        await session.withTransaction(async () => {
          await OrderTransactionService.generateOrderNumber(
            { merchant: merchant._id, branch: branch._id },
            session
          );
        });

        const counter = await Counter.findOne({
          merchantId: merchant._id,
          branchId: branch._id,
          prefix: 'ORDER',
        });

        expect(counter).toBeDefined();
        expect(counter.seq).toBe(1);
        expect(counter.date).toBeNull();
        expect(counter.prefix).toBe('ORDER');
        expect(counter.startingNumber).toBe(1);
      } finally {
        await session.endSession();
      }
    });

    test('unique index prevents duplicate counters per branch', async () => {
      const branch = await Branch.create({
        merchant: merchant._id,
        name: 'Test Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [38.7469, 9.0320],
        },
      });

      // Create first counter
      await Counter.create({
        merchantId: merchant._id,
        branchId: branch._id,
        prefix: 'ORDER',
        seq: 1,
        date: null,
      });

      // ❌ Try to create duplicate counter
      await expect(
        Counter.create({
          merchantId: merchant._id,
          branchId: branch._id,
          prefix: 'ORDER',
          seq: 1,
          date: null,
        })
      ).rejects.toThrow();
    });
  });
});
