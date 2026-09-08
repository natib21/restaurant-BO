/**
 * @file tests/order-pass2-fixes.test.js
 * @description Integration tests for the two DB-level Pass 2 fixes:
 *
 *  Fix 1 — mergeOrders revenue fix
 *    a. Merged source orders keep paymentStatus:'unpaid' (not 'paid')
 *    b. Attempting to markAsPaid on a merged (canceled) order is rejected with 400
 *
 *  Fix 4 — markAsPaid loyalty points
 *    a. Points are added once (correct amount) for a normal payment
 *    b. Tier upgrades correctly when total crosses a threshold
 *
 * Transient-conflict simulation: MongoDB does not expose a direct way to inject a
 * TransientTransactionError in integration tests without a replica set. On a standalone
 * mongod (localhost:27017) withTransaction's retry loop is never exercised. Instead we
 * prove the atomic $inc property: two concurrent markAsPaid calls on two DIFFERENT orders
 * each produce the correct isolated point increment, confirming no cross-call interference.
 *
 * Real tests, real MongoDB — no mocks.
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const { OrderService } = require('../src/modules/order/service/OrderService');

// Models
const Merchant   = require('../models/merchantModel');
const Branch     = require('../models/branchModel');
const Table      = require('../models/tabelModel');
const Category   = require('../models/Category');
const MenuItem   = require('../src/modules/menu/model/MenuItem.model');
const Ingredient = require('../models/Ingredient');
const Recipe     = require('../models/Recipe');
const Order      = require('../models/orderModel');
const Customer   = require('../models/customerModule');

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────
let merchant, branch, table, category, menuItem, ingredient, recipe;

// Run-specific suffix so re-runs don't collide on unique indexes
const RUN_ID = String(Date.now()).slice(-5);

const STAFF_USER_ID = new mongoose.Types.ObjectId();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: minimal req object for OrderService methods that read merchantId
// ─────────────────────────────────────────────────────────────────────────────
function makeReq(overrides = {}) {
  return {
    merchantId: merchant._id,
    params: {},
    body: {},
    query: {},
    user: null,
    customer: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: place a staff takeaway order (no table, no inventory recipe needed)
// Returns the saved Order document.
// ─────────────────────────────────────────────────────────────────────────────
async function placeTakeawayOrder() {
  return OrderService.staffPlaceOrder(
    {
      items: [{ menuItemId: menuItem._id.toString(), quantity: 1 }],
      orderType:       'takeaway',
      customerName:    'Test Customer',
      customerPhone:   '+251911999998',
      branchId:        branch._id.toString(),
      merchantId:      merchant._id.toString(),
      performedBy:     STAFF_USER_ID,
      performedByName: 'Test Staff',
    },
    {}
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// beforeAll / afterAll
// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  await connectDatabase();

  merchant = await Merchant.create({
    businessName: `Pass2 Merchant ${RUN_ID}`,
    slug:         `pass2-merchant-${RUN_ID}`,
    owner: {
      fullName: 'Pass Two Owner',
      gender:   'Male',
      email:    `pass2-owner-${RUN_ID}@test.com`,
      phone:    '+251911100001',
    },
    status:   'approved',
    isActive: true,
  });

  branch = await Branch.create({
    merchant: merchant._id,
    name:     'Pass2 Branch',
    phone:    '+251911100002',
    location: {
      type:        'Point',
      coordinates: [38.75, 9.02],
      city:        'Addis Ababa',
      formattedAddress: 'Pass2 Branch, Addis Ababa',
    },
  });

  table = await Table.create({
    merchant:    merchant._id,
    branch:      branch._id,
    tableNumber: `P${RUN_ID}`,
    capacity:    4,
    status:      'available',
  });

  category = await Category.create({
    merchant: merchant._id,
    name:     { en: 'Pass2 Category', am: 'Pass2 Category' },
    isActive: true,
  });

  // Price 100 — makes loyalty points arithmetic simple (100 points per order)
  menuItem = await MenuItem.create({
    merchant:      merchant._id,
    branch:        branch._id,
    categoryId:    category._id,
    name:          { en: 'Pass2 Burger', am: 'Pass2 Burger' },
    type:          'food',
    price:         100,
    available:     true,
    publishStatus: 'published',
    inStock:       true,
  });

  // Ingredient + recipe so staffPlaceOrder's inventory deduction doesn't fail
  ingredient = await Ingredient.create({
    merchant:     merchant._id,
    name:         `Pass2Flour${RUN_ID}`,
    unit:         'kg',
    currentStock: 999,
    minStock:     1,
    costPerUnit:  5,
    isActive:     true,
  });

  recipe = await Recipe.create({
    merchant: merchant._id,
    menuItem: menuItem._id,
    name:     'Pass2 Burger Recipe',
    isActive: true,
    yield:    1,
    items:    [{ ingredient: ingredient._id, quantity: 1, unit: 'kg' }],
  });
});

afterAll(async () => {
  await Order.deleteMany({ merchant: merchant._id });
  await Customer.deleteMany({ merchant: merchant._id });
  await Recipe.deleteMany({ merchant: merchant._id });
  await MenuItem.deleteMany({ merchant: merchant._id });
  await Category.deleteMany({ merchant: merchant._id });
  await Ingredient.deleteMany({ merchant: merchant._id });
  await Table.deleteMany({ merchant: merchant._id });
  await Branch.deleteMany({ merchant: merchant._id });
  await Merchant.deleteOne({ _id: merchant._id });
  await disconnectDatabase();
});

// =============================================================================
// Fix 1a — mergeOrders: source order paymentStatus stays 'unpaid'
// =============================================================================
describe('Fix 1a — mergeOrders: source paymentStatus stays unpaid', () => {
  it('sets source order status=canceled but leaves paymentStatus=unpaid', async () => {
    // Arrange: two orders to merge
    const [source, target] = await Promise.all([
      placeTakeawayOrder(),
      placeTakeawayOrder(),
    ]);

    // Act
    await OrderService.mergeOrders(
      makeReq({
        body: {
          orderIds:      [source._id.toString()],
          targetOrderId: target._id.toString(),
        },
      })
    );

    // Assert
    const refreshed = await Order.findById(source._id).lean();
    expect(refreshed.status).toBe('canceled');
    // THE KEY ASSERTION — must NOT be 'paid'
    expect(refreshed.paymentStatus).toBe('unpaid');
    expect(refreshed.canceledReason).toMatch(/Merged into order/i);
  }, 30000);

  it('canceledReason includes the target order number', async () => {
    const [source, target] = await Promise.all([
      placeTakeawayOrder(),
      placeTakeawayOrder(),
    ]);

    await OrderService.mergeOrders(
      makeReq({
        body: {
          orderIds:      [source._id.toString()],
          targetOrderId: target._id.toString(),
        },
      })
    );

    const refreshed = await Order.findById(source._id).lean();
    expect(refreshed.canceledReason).toContain(target.orderNumber);
  }, 30000);
});

// =============================================================================
// Fix 1b — markAsPaid rejects canceled orders
// =============================================================================
describe('Fix 1b — markAsPaid: rejects a canceled (merged) order', () => {
  it('throws 400 when attempting to pay a merged source order', async () => {
    // Arrange: merge two orders so source becomes canceled
    const [source, target] = await Promise.all([
      placeTakeawayOrder(),
      placeTakeawayOrder(),
    ]);

    await OrderService.mergeOrders(
      makeReq({
        body: {
          orderIds:      [source._id.toString()],
          targetOrderId: target._id.toString(),
        },
      })
    );

    // Confirm it's canceled and unpaid before we try to pay it
    const canceled = await Order.findById(source._id).lean();
    expect(canceled.status).toBe('canceled');
    expect(canceled.paymentStatus).toBe('unpaid');

    // Act + Assert — markAsPaid must reject
    await expect(
      OrderService.markAsPaid(
        makeReq({
          params: { id: source._id.toString() },
          body:   { paymentMethod: 'cash' },
        })
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: /cannot mark a canceled order as paid/i,
    });

    // Confirm paymentStatus was NOT changed by the rejected attempt
    const stillUnpaid = await Order.findById(source._id).lean();
    expect(stillUnpaid.paymentStatus).toBe('unpaid');
  }, 30000);
});

// =============================================================================
// Fix 4a — markAsPaid: loyalty points added once with correct amount
// =============================================================================
describe('Fix 4a — markAsPaid: loyalty points awarded correctly', () => {
  it('awards floor(totalAmount) points exactly once', async () => {
    // Arrange: create a customer and a completed order linked to them
    const customer = await Customer.create({
      merchant:    merchant._id,
      branch:      branch._id,
      fullName:    'Loyalty Test Customer',
      phone:       '+251911777001',
      source:      'guest',
      loyalty:     { points: 0, totalPointsEarned: 0, tier: 'bronze' },
    });

    const order = await placeTakeawayOrder();
    // totalAmount = 100 (1 × price 100) → expect 100 points

    // Act
    await OrderService.markAsPaid(
      makeReq({
        params:   { id: order._id.toString() },
        body:     { paymentMethod: 'cash' },
        customer: customer, // req.customer triggers loyalty path
      })
    );

    // Assert
    const updatedCustomer = await Customer.findById(customer._id).lean();
    expect(updatedCustomer.loyalty.points).toBe(100);
    expect(updatedCustomer.loyalty.totalPointsEarned).toBe(100);
    // History entry created
    const historyEntry = updatedCustomer.history.find(h => h.action === 'award_points');
    expect(historyEntry).toBeDefined();
    expect(historyEntry.details).toMatch(/100 points/);
  }, 30000);

  it('does not double-award points if markAsPaid is called and order is already paid', async () => {
    // Proves idempotency guard: a second call throws 400 and points are not incremented again
    const customer = await Customer.create({
      merchant: merchant._id,
      branch:   branch._id,
      fullName: 'Idempotency Test Customer',
      phone:    '+251911777002',
      source:   'guest',
      loyalty:  { points: 0, totalPointsEarned: 0, tier: 'bronze' },
    });

    const order = await placeTakeawayOrder();

    // First call succeeds
    await OrderService.markAsPaid(
      makeReq({
        params:   { id: order._id.toString() },
        body:     { paymentMethod: 'cash' },
        customer: customer,
      })
    );

    const afterFirst = await Customer.findById(customer._id).lean();
    expect(afterFirst.loyalty.points).toBe(100);

    // Second call must be rejected
    await expect(
      OrderService.markAsPaid(
        makeReq({
          params:   { id: order._id.toString() },
          body:     { paymentMethod: 'cash' },
          customer: customer,
        })
      )
    ).rejects.toMatchObject({ statusCode: 400, message: /already paid/i });

    // Points must not have changed
    const afterSecond = await Customer.findById(customer._id).lean();
    expect(afterSecond.loyalty.points).toBe(100);
  }, 30000);
});

// =============================================================================
// Fix 4b — markAsPaid: tier upgrade triggers correctly via re-fetch
// =============================================================================
describe('Fix 4b — markAsPaid: tier upgrades on threshold crossing', () => {
  it('upgrades bronze → silver when totalPointsEarned crosses 5000', async () => {
    // Start customer just below the silver threshold
    const customer = await Customer.create({
      merchant: merchant._id,
      branch:   branch._id,
      fullName: 'Tier Upgrade Customer',
      phone:    '+251911777003',
      source:   'guest',
      loyalty:  { points: 4950, totalPointsEarned: 4950, tier: 'bronze' },
    });

    // Order worth 100 → adds 100 points → totalPointsEarned becomes 5050 → silver
    const order = await placeTakeawayOrder();

    await OrderService.markAsPaid(
      makeReq({
        params:   { id: order._id.toString() },
        body:     { paymentMethod: 'cash' },
        customer: customer,
      })
    );

    const upgraded = await Customer.findById(customer._id).lean();
    expect(upgraded.loyalty.totalPointsEarned).toBe(5050);
    expect(upgraded.loyalty.tier).toBe('silver');
  }, 30000);

  it('stays at current tier when threshold is not crossed', async () => {
    // Customer at 4800 + 100 = 4900 — still below silver (5000)
    const customer = await Customer.create({
      merchant: merchant._id,
      branch:   branch._id,
      fullName: 'No Tier Upgrade Customer',
      phone:    '+251911777004',
      source:   'guest',
      loyalty:  { points: 4800, totalPointsEarned: 4800, tier: 'bronze' },
    });

    const order = await placeTakeawayOrder();

    await OrderService.markAsPaid(
      makeReq({
        params:   { id: order._id.toString() },
        body:     { paymentMethod: 'cash' },
        customer: customer,
      })
    );

    const unchanged = await Customer.findById(customer._id).lean();
    expect(unchanged.loyalty.totalPointsEarned).toBe(4900);
    expect(unchanged.loyalty.tier).toBe('bronze'); // no upgrade
  }, 30000);
});

// =============================================================================
// Fix 4c — concurrent markAsPaid on two different orders: no cross-interference
// (proxy for retry-safety — confirms $inc isolation between concurrent sessions)
// =============================================================================
describe('Fix 4c — concurrent markAsPaid: atomic $inc isolation', () => {
  it('two concurrent payments on different orders each award the correct points independently', async () => {
    const customer = await Customer.create({
      merchant: merchant._id,
      branch:   branch._id,
      fullName: 'Concurrent Points Customer',
      phone:    '+251911777005',
      source:   'guest',
      loyalty:  { points: 0, totalPointsEarned: 0, tier: 'bronze' },
    });

    // Two separate orders, both worth 100 each → expect 200 total
    const [orderA, orderB] = await Promise.all([
      placeTakeawayOrder(),
      placeTakeawayOrder(),
    ]);

    // Pay both concurrently
    await Promise.all([
      OrderService.markAsPaid(
        makeReq({
          params:   { id: orderA._id.toString() },
          body:     { paymentMethod: 'cash' },
          customer: customer,
        })
      ),
      OrderService.markAsPaid(
        makeReq({
          params:   { id: orderB._id.toString() },
          body:     { paymentMethod: 'cash' },
          customer: customer,
        })
      ),
    ]);

    const result = await Customer.findById(customer._id).lean();
    // Each $inc is atomic — total must be exactly 200, not 100 or 300
    expect(result.loyalty.points).toBe(200);
    expect(result.loyalty.totalPointsEarned).toBe(200);
  }, 30000);
});
