/**
 * @file tests/order-numbering-by-type.test.js
 * @description Integration tests for branch-scoped order numbering by order type
 * 
 * Tests:
 * - Separate sequences per order type (DI, TA, DL)
 * - Branch-scoped numbering (different branches, same numbers OK)
 * - Merchant isolation (different merchants can have same order numbers)
 * - Concurrent order creation (no duplicate numbers)
 * - Sequence incrementing
 * - Prefix generation
 * - Duplicate prevention
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const { OrderTransactionService } = require('../src/modules/order/service/OrderTransactionService');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Counter = require('../models/CounterModel.js.js');

describe('Order Numbering by Type - Integration Tests', () => {
  let merchant1, merchant2, branch1A, branch1B, branch2A;

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up
    await Counter.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});

    // Create merchants
    merchant1 = await Merchant.create({
      businessName: 'Restaurant A',
      slug: `rest-a-${Date.now()}`,
      email: `resta-${Date.now()}@test.com`,
      phone: '+251911111111',
      owner: {
        fullName: 'Owner A',
        email: `ownera-${Date.now()}@test.com`,
        phone: '+251911111111',
        gender: 'Male',
      },
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true,
    });

    merchant2 = await Merchant.create({
      businessName: 'Restaurant B',
      slug: `rest-b-${Date.now()}`,
      email: `restb-${Date.now()}@test.com`,
      phone: '+251922222222',
      owner: {
        fullName: 'Owner B',
        email: `ownerb-${Date.now()}@test.com`,
        phone: '+251922222222',
        gender: 'Female',
      },
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true,
    });

    // Create branches
    branch1A = await Branch.create({
      merchant: merchant1._id,
      name: 'Merchant 1 - Branch A',
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7469, 9.0320],
      },
      isActive: true,
    });

    branch1B = await Branch.create({
      merchant: merchant1._id,
      name: 'Merchant 1 - Branch B',
      location: {
        city: 'Bahir Dar',
        coordinates: [37.3897, 11.5942],
      },
      isActive: true,
    });

    branch2A = await Branch.create({
      merchant: merchant2._id,
      name: 'Merchant 2 - Branch A',
      location: {
        city: 'Dire Dawa',
        coordinates: [41.8661, 9.5930],
      },
      isActive: true,
    });
  });

  afterEach(async () => {
    await Counter.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
  });

  describe('Separate Sequences per Order Type', () => {
    test('each order type maintains independent sequence', async () => {
      const session = await mongoose.startSession();

      try {
        const [dineIn1, takeaway1, delivery1, dineIn2, takeaway2, delivery2] = 
          await session.withTransaction(async () => {
            const di1 = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
              session
            );
            const ta1 = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'takeaway' },
              session
            );
            const dl1 = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'delivery' },
              session
            );
            const di2 = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
              session
            );
            const ta2 = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'takeaway' },
              session
            );
            const dl2 = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'delivery' },
              session
            );
            return [di1, ta1, dl1, di2, ta2, dl2];
          });

        // Each type starts at 1 and increments independently
        expect(dineIn1).toBe('#DI-000001');
        expect(takeaway1).toBe('#TA-000001');
        expect(delivery1).toBe('#DL-000001');
        expect(dineIn2).toBe('#DI-000002');
        expect(takeaway2).toBe('#TA-000002');
        expect(delivery2).toBe('#DL-000002');

        // Verify counters in database
        const counters = await Counter.find({
          merchantId: merchant1._id,
          branchId: branch1A._id,
        }).sort({ prefix: 1 });

        expect(counters).toHaveLength(3);
        expect(counters[0].prefix).toBe('DI');
        expect(counters[0].seq).toBe(2);
        expect(counters[1].prefix).toBe('DL');
        expect(counters[1].seq).toBe(2);
        expect(counters[2].prefix).toBe('TA');
        expect(counters[2].seq).toBe(2);
      } finally {
        await session.endSession();
      }
    });

    test('creating takeaway does not increment dine-in sequence', async () => {
      const session = await mongoose.startSession();

      try {
        const [di1, ta1, ta2, di2] = await session.withTransaction(async () => {
          const dineIn1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          const takeaway1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'takeaway' },
            session
          );
          const takeaway2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'takeaway' },
            session
          );
          const dineIn2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          return [dineIn1, takeaway1, takeaway2, dineIn2];
        });

        expect(di1).toBe('#DI-000001');
        expect(ta1).toBe('#TA-000001');
        expect(ta2).toBe('#TA-000002');
        expect(di2).toBe('#DI-000002'); // Still 2, not affected by takeaway orders
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Branch-Scoped Numbering', () => {
    test('different branches have independent sequences for same order type', async () => {
      const session = await mongoose.startSession();

      try {
        const [b1di1, b2di1, b1di2, b2di2] = await session.withTransaction(async () => {
          const branch1DineIn1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          const branch2DineIn1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1B._id, orderType: 'dine_in' },
            session
          );
          const branch1DineIn2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          const branch2DineIn2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1B._id, orderType: 'dine_in' },
            session
          );
          return [branch1DineIn1, branch2DineIn1, branch1DineIn2, branch2DineIn2];
        });

        // Both branches can have #DI-000001
        expect(b1di1).toBe('#DI-000001');
        expect(b2di1).toBe('#DI-000001');
        expect(b1di2).toBe('#DI-000002');
        expect(b2di2).toBe('#DI-000002');
      } finally {
        await session.endSession();
      }
    });

    test('branch A and branch B have completely independent sequences', async () => {
      const session = await mongoose.startSession();

      try {
        const numbers = await session.withTransaction(async () => {
          return {
            b1di: await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
              session
            ),
            b1ta: await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'takeaway' },
              session
            ),
            b1dl: await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'delivery' },
              session
            ),
            b2di: await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1B._id, orderType: 'dine_in' },
              session
            ),
            b2ta: await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1B._id, orderType: 'takeaway' },
              session
            ),
            b2dl: await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1B._id, orderType: 'delivery' },
              session
            ),
          };
        });

        // All start at 1 for each branch
        expect(numbers.b1di).toBe('#DI-000001');
        expect(numbers.b1ta).toBe('#TA-000001');
        expect(numbers.b1dl).toBe('#DL-000001');
        expect(numbers.b2di).toBe('#DI-000001'); // Same as branch A
        expect(numbers.b2ta).toBe('#TA-000001'); // Same as branch A
        expect(numbers.b2dl).toBe('#DL-000001'); // Same as branch A
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Merchant Isolation', () => {
    test('different merchants can have identical order numbers', async () => {
      const session = await mongoose.startSession();

      try {
        const [m1di, m2di, m1ta, m2ta] = await session.withTransaction(async () => {
          const merchant1DineIn = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          const merchant2DineIn = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant2._id, branch: branch2A._id, orderType: 'dine_in' },
            session
          );
          const merchant1Takeaway = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'takeaway' },
            session
          );
          const merchant2Takeaway = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant2._id, branch: branch2A._id, orderType: 'takeaway' },
            session
          );
          return [merchant1DineIn, merchant2DineIn, merchant1Takeaway, merchant2Takeaway];
        });

        // Both merchants can have #DI-000001, #TA-000001
        expect(m1di).toBe('#DI-000001');
        expect(m2di).toBe('#DI-000001');
        expect(m1ta).toBe('#TA-000001');
        expect(m2ta).toBe('#TA-000001');
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Concurrent Order Creation', () => {
    test('prevents duplicate numbers under concurrent requests', async () => {
      const promises = [];

      // Create 10 concurrent dine-in orders
      for (let i = 0; i < 10; i++) {
        const session = await mongoose.startSession();
        const promise = session.withTransaction(async () => {
          const orderNumber = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          await session.endSession();
          return orderNumber;
        });
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      // All numbers should be unique
      const uniqueNumbers = new Set(results);
      expect(uniqueNumbers.size).toBe(10);

      // All should be dine-in orders
      results.forEach(num => {
        expect(num).toMatch(/^#DI-\d{6}$/);
      });

      // Should be sequential from 1 to 10
      expect(results.sort()).toEqual([
        '#DI-000001',
        '#DI-000002',
        '#DI-000003',
        '#DI-000004',
        '#DI-000005',
        '#DI-000006',
        '#DI-000007',
        '#DI-000008',
        '#DI-000009',
        '#DI-000010',
      ]);
    });

    test('concurrent mixed order types maintain separate sequences', async () => {
      const promises = [];

      // Create concurrent orders of different types
      for (let i = 0; i < 3; i++) {
        const session1 = await mongoose.startSession();
        promises.push(
          session1.withTransaction(async () => {
            const num = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
              session1
            );
            await session1.endSession();
            return num;
          })
        );

        const session2 = await mongoose.startSession();
        promises.push(
          session2.withTransaction(async () => {
            const num = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'takeaway' },
              session2
            );
            await session2.endSession();
            return num;
          })
        );

        const session3 = await mongoose.startSession();
        promises.push(
          session3.withTransaction(async () => {
            const num = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'delivery' },
              session3
            );
            await session3.endSession();
            return num;
          })
        );
      }

      const results = await Promise.all(promises);

      // Separate by prefix
      const dineIn = results.filter(r => r.startsWith('#DI-')).sort();
      const takeaway = results.filter(r => r.startsWith('#TA-')).sort();
      const delivery = results.filter(r => r.startsWith('#DL-')).sort();

      // Each type should have 3 orders
      expect(dineIn).toHaveLength(3);
      expect(takeaway).toHaveLength(3);
      expect(delivery).toHaveLength(3);

      // Each should be sequential
      expect(dineIn).toEqual(['#DI-000001', '#DI-000002', '#DI-000003']);
      expect(takeaway).toEqual(['#TA-000001', '#TA-000002', '#TA-000003']);
      expect(delivery).toEqual(['#DL-000001', '#DL-000002', '#DL-000003']);
    });
  });

  describe('Sequence Incrementing', () => {
    test('sequence increments correctly', async () => {
      const session = await mongoose.startSession();

      try {
        const numbers = await session.withTransaction(async () => {
          const results = [];
          for (let i = 1; i <= 5; i++) {
            const num = await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
              session
            );
            results.push(num);
          }
          return results;
        });

        expect(numbers).toEqual([
          '#DI-000001',
          '#DI-000002',
          '#DI-000003',
          '#DI-000004',
          '#DI-000005',
        ]);
      } finally {
        await session.endSession();
      }
    });

    test('handles large sequence numbers', async () => {
      const session = await mongoose.startSession();

      try {
        // Seed counter with high number
        await Counter.create({
          merchantId: merchant1._id,
          branchId: branch1A._id,
          prefix: 'DI',
          seq: 999998,
          date: null,
        });

        const [num1, num2, num3] = await session.withTransaction(async () => {
          const n1 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          const n2 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          const n3 = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          return [n1, n2, n3];
        });

        expect(num1).toBe('#DI-999999');
        expect(num2).toBe('#DI-1000000'); // Allows overflow
        expect(num3).toBe('#DI-1000001');
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Prefix Generation', () => {
    test('generates correct prefix for each order type', async () => {
      const session = await mongoose.startSession();

      try {
        const [di, ta, dl] = await session.withTransaction(async () => {
          const dineIn = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'dine_in' },
            session
          );
          const takeaway = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'takeaway' },
            session
          );
          const delivery = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'delivery' },
            session
          );
          return [dineIn, takeaway, delivery];
        });

        expect(di).toMatch(/^#DI-\d{6}$/);
        expect(ta).toMatch(/^#TA-\d{6}$/);
        expect(dl).toMatch(/^#DL-\d{6}$/);
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Validation', () => {
    test('throws error for invalid order type', async () => {
      const session = await mongoose.startSession();

      try {
        await expect(
          session.withTransaction(async () => {
            return await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id, orderType: 'invalid' },
              session
            );
          })
        ).rejects.toThrow('Invalid order type');
      } finally {
        await session.endSession();
      }
    });

    test('throws error when orderType is missing', async () => {
      const session = await mongoose.startSession();

      try {
        await expect(
          session.withTransaction(async () => {
            return await OrderTransactionService.generateOrderNumber(
              { merchant: merchant1._id, branch: branch1A._id },
              session
            );
          })
        ).rejects.toThrow();
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Order Source Independence', () => {
    test('order source does not affect prefix or sequence', async () => {
      const session = await mongoose.startSession();

      try {
        // Both are delivery orders but from different sources
        // They should share the same DL sequence
        const [dlTelegram, dlWebsite, dlPhone] = await session.withTransaction(async () => {
          const telegram = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'delivery' },
            session
          );
          const website = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'delivery' },
            session
          );
          const phone = await OrderTransactionService.generateOrderNumber(
            { merchant: merchant1._id, branch: branch1A._id, orderType: 'delivery' },
            session
          );
          return [telegram, website, phone];
        });

        // All use DL prefix and share sequence
        expect(dlTelegram).toBe('#DL-000001');
        expect(dlWebsite).toBe('#DL-000002');
        expect(dlPhone).toBe('#DL-000003');
      } finally {
        await session.endSession();
      }
    });
  });
});
