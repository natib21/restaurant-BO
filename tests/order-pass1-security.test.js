/**
 * @file tests/order-pass1-security.test.js
 * @description Integration tests for the three Pass 1 ship-blocker fixes.
 *
 * These tests run against a real (local) MongoDB instance — not mocks.
 * They prove DB-level and transaction-level behavior actually works.
 *
 * Tests:
 *  1. Staff order price tampering  — client unitPrice is ignored, DB price wins
 *  2. Inventory deduction          — stock decrements correctly after staff order
 *  3. Cross-tenant table rejection — staff of Merchant A cannot use Merchant B's table
 *  4. Sequential order numbers     — back-to-back orders get unique, non-duplicate numbers
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const { OrderService } = require('../src/modules/order/service/OrderService');

// Models
const Merchant  = require('../models/merchantModel');
const Branch    = require('../models/branchModel');
const Table     = require('../models/tabelModel');
const Category  = require('../models/Category');
const MenuItem  = require('../src/modules/menu/model/MenuItem.model');
const Ingredient = require('../models/Ingredient');
const Recipe    = require('../models/Recipe');
const Order     = require('../models/orderModel');

// ─────────────────────────────────────────────────────────────────────────────
// Test-wide fixtures (shared across the suite)
// ─────────────────────────────────────────────────────────────────────────────
let merchantA, branchA, tableA, categoryA, menuItemA, ingredientA, recipeA;
let merchantB, branchB, tableB;

// Unique 4-digit suffix to avoid index collisions when re-running tests
const RUN_ID = String(Date.now()).slice(-4);

const STAFF_USER_ID = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectDatabase();

  // ── Merchant A ──────────────────────────────────────────────────────────
  merchantA = await Merchant.create({
    businessName: `Pass1 Merchant A ${RUN_ID}`,
    slug: `pass1-merchant-a-${RUN_ID}`,
    owner: {
      fullName: 'Owner A',
      gender: 'Male',
      email: `owner-a-${RUN_ID}@pass1test.com`,
      phone: '+251911000001',
    },
    status: 'approved',
    isActive: true,
  });

  branchA = await Branch.create({
    merchant: merchantA._id,
    name: 'Branch A',
    phone: '+251911000002',
    location: {
      type: 'Point',
      coordinates: [38.75, 9.02],
      city: 'Addis Ababa',
      formattedAddress: 'Branch A, Addis Ababa',
    },
  });

  tableA = await Table.create({
    merchant: merchantA._id,
    branch:   branchA._id,
    tableNumber: `T${RUN_ID}`,
    capacity: 4,
    status: 'available',
  });

  // Menu item with DB price = 50 (tests must not be able to override this)
  categoryA = await Category.create({
    merchant: merchantA._id,
    name: { en: 'Test Category', am: 'Test Category' },
    isActive: true,
  });

  menuItemA = await MenuItem.create({
    merchant:      merchantA._id,
    branch:        branchA._id,
    categoryId:    categoryA._id,
    name:          { en: 'Test Burger', am: 'Test Burger' },
    type:          'food',
    price:         50,
    available:     true,
    publishStatus: 'published',
    inStock:       true,
  });

  // Ingredient: 10 units in stock, recipe needs 2 units per burger
  ingredientA = await Ingredient.create({
    merchant: merchantA._id,
    name: `Flour ${RUN_ID}`,
    unit: 'kg',
    currentStock: 10,
    minStock: 1,
    costPerUnit: 5,
    isActive: true,
  });

  recipeA = await Recipe.create({
    merchant:  merchantA._id,
    menuItem:  menuItemA._id,
    name:      'Test Burger Recipe',
    isActive:  true,
    yield:     1,
    items: [
      {
        ingredient: ingredientA._id,
        quantity:   2,      // 2 kg per burger
        unit:       'kg',
      },
    ],
  });

  // ── Merchant B ──────────────────────────────────────────────────────────
  merchantB = await Merchant.create({
    businessName: `Pass1 Merchant B ${RUN_ID}`,
    slug: `pass1-merchant-b-${RUN_ID}`,
    owner: {
      fullName: 'Owner B',
      gender: 'Female',
      email: `owner-b-${RUN_ID}@pass1test.com`,
      phone: '+251911000003',
    },
    status: 'approved',
    isActive: true,
  });

  branchB = await Branch.create({
    merchant: merchantB._id,
    name: 'Branch B',
    phone: '+251911000004',
    location: {
      type: 'Point',
      coordinates: [38.76, 9.03],
      city: 'Addis Ababa',
      formattedAddress: 'Branch B, Addis Ababa',
    },
  });

  tableB = await Table.create({
    merchant: merchantB._id,
    branch:   branchB._id,
    tableNumber: `U${RUN_ID}`,
    capacity: 4,
    status: 'available',
  });
});

afterAll(async () => {
  // Teardown in reverse-creation order so FK/ref constraints are not an issue
  await Order.deleteMany({ merchant: { $in: [merchantA._id, merchantB._id] } });
  await Recipe.deleteMany({ merchant: merchantA._id });
  await MenuItem.deleteMany({ merchant: merchantA._id });
  await Category.deleteMany({ merchant: merchantA._id });
  await Ingredient.deleteMany({ merchant: merchantA._id });
  await Table.deleteMany({ merchant: { $in: [merchantA._id, merchantB._id] } });
  await Branch.deleteMany({ merchant: { $in: [merchantA._id, merchantB._id] } });
  await Merchant.deleteMany({ _id: { $in: [merchantA._id, merchantB._id] } });

  await disconnectDatabase();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: minimal valid staffPlaceOrder data for Merchant A / Branch A
// ─────────────────────────────────────────────────────────────────────────────
function makeStaffOrderData(overrides = {}) {
  return {
    items: [
      {
        menuItemId: menuItemA._id.toString(),
        quantity: 1,
        unitPrice: 1,    // ← intentionally tampered — DB price is 50
        notes: '',
      },
    ],
    tableId:         tableA._id.toString(),
    orderType:       'dine_in',
    customerName:    'Test Customer',
    customerPhone:   '+251911999999',
    subtotal:        1,  // ← intentionally tampered — server must recompute
    notes:           '',
    branchId:        branchA._id.toString(),
    merchantId:      merchantA._id.toString(),
    performedBy:     STAFF_USER_ID,
    performedByName: 'Test Staff',
    location:        undefined,
    ...overrides,
  };
}

// =============================================================================
// Test 1 — Price tampering: client-supplied unitPrice is ignored
// =============================================================================
describe('Test 1 — Staff order price tampering', () => {
  it('stores the DB price (50), not the tampered client price (1)', async () => {
    const data = makeStaffOrderData();
    // items[0].unitPrice = 1, subtotal = 1 — both tampered

    const order = await OrderService.staffPlaceOrder(data, {});

    expect(order).toBeDefined();
    expect(order._id).toBeDefined();

    // The stored item must use the DB price, not the client-supplied 1
    const storedItem = order.items[0];
    expect(storedItem.unitPrice).toBe(50);
    expect(storedItem.totalPrice).toBe(50);    // 1 unit × 50

    // The order-level totals must also reflect the DB price
    expect(order.subtotal).toBe(50);
    expect(order.totalAmount).toBe(50);
  }, 20000);
});

// =============================================================================
// Test 2 — Inventory deduction after staff order
// =============================================================================
describe('Test 2 — Staff order inventory deduction', () => {
  it('decrements ingredient stock by recipe quantity × order quantity', async () => {
    // Re-read stock to get a fresh baseline (Test 1 may have consumed some)
    const before = await Ingredient.findById(ingredientA._id).lean();
    const stockBefore = before.currentStock;

    const data = makeStaffOrderData({
      items: [
        {
          menuItemId: menuItemA._id.toString(),
          quantity:   2,          // ordering 2 burgers
          unitPrice:  1,          // tampered — ignored
          notes:      '',
        },
      ],
      subtotal: 2,                // tampered — ignored
    });

    await OrderService.staffPlaceOrder(data, {});

    const after = await Ingredient.findById(ingredientA._id).lean();

    // Recipe requires 2 kg per burger, we ordered 2 burgers → 4 kg deducted
    const expectedDeduction = 2 /* recipe qty */ * 2 /* order qty */;
    expect(after.currentStock).toBe(stockBefore - expectedDeduction);
  }, 20000);
});

// =============================================================================
// Test 3 — Cross-tenant table rejection
// =============================================================================
describe('Test 3 — Cross-tenant table rejection', () => {
  it('rejects a Merchant A staff order that references Merchant B\'s tableId', async () => {
    const data = makeStaffOrderData({
      // Merchant A's merchantId and branchId — but Merchant B's tableId
      tableId: tableB._id.toString(),
      // Branch is also wrong (B's branch, not A's) to stress-test the merchant filter
      branchId: branchB._id.toString(),
    });

    await expect(OrderService.staffPlaceOrder(data, {}))
      .rejects
      .toMatchObject({ statusCode: 404, message: /table not found/i });

    // Confirm no order was actually created
    const orphan = await Order.findOne({ merchant: merchantA._id, table: tableB._id });
    expect(orphan).toBeNull();
  }, 20000);

  it('also rejects when only the tableId is from Merchant B (branchId is correct)', async () => {
    // Even with a valid branchId for A, the table belongs to B → should reject
    const data = makeStaffOrderData({
      tableId:  tableB._id.toString(),   // B's table
      branchId: branchA._id.toString(),  // A's branch
    });

    await expect(OrderService.staffPlaceOrder(data, {}))
      .rejects
      .toMatchObject({ statusCode: 404 });

    const orphan = await Order.findOne({ merchant: merchantA._id, table: tableB._id });
    expect(orphan).toBeNull();
  }, 20000);
});

// =============================================================================
// Test 4 — Sequential, non-duplicate order numbers
// =============================================================================
describe('Test 4 — Sequential and unique orderNumbers', () => {
  // Replenish stock before this group so inventory doesn't block the orders
  // (Tests 1 & 2 together consumed up to 6 kg from the initial 10)
  beforeAll(async () => {
    await Ingredient.findByIdAndUpdate(ingredientA._id, { currentStock: 100 });
    await Table.findByIdAndUpdate(tableA._id, { status: 'available' });
  });

  it('produces 3 unique orderNumbers when orders are placed sequentially', async () => {
    const orders = [];
    for (let i = 0; i < 3; i++) {
      // Reset table to available between sequential orders so validation passes
      await Table.findByIdAndUpdate(tableA._id, { status: 'available' });
      const order = await OrderService.staffPlaceOrder(makeStaffOrderData(), {});
      orders.push(order);
    }

    const numbers = orders.map(o => o.orderNumber);

    // All must be present
    expect(numbers.every(n => typeof n === 'string' && n.length > 0)).toBe(true);

    // All must be unique (Set deduplication)
    const unique = new Set(numbers);
    expect(unique.size).toBe(3);
  }, 60000);

  it('produces 3 unique orderNumbers when orders are placed concurrently', async () => {
    // Reset table to available so concurrent orders can all use it
    await Table.findByIdAndUpdate(tableA._id, { status: 'available' });

    const results = await Promise.all([
      OrderService.staffPlaceOrder(makeStaffOrderData(), {}),
      OrderService.staffPlaceOrder(makeStaffOrderData(), {}),
      OrderService.staffPlaceOrder(makeStaffOrderData(), {}),
    ]);

    const numbers = results.map(o => o.orderNumber);

    expect(numbers.every(n => typeof n === 'string' && n.length > 0)).toBe(true);

    const unique = new Set(numbers);
    expect(unique.size).toBe(3);
  }, 60000);
});
