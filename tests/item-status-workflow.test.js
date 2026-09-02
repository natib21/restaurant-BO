// tests/item-status-workflow.test.js
// ✅ Comprehensive tests for item-level status workflow

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const KitchenStation = require('../models/KitchenStation');
const KitchenTicket = require('../models/KitchenTicket');
const Table = require('../models/tabelModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const { ItemStatusService } = require('../src/modules/order/service/ItemStatusService');

let app;
let testContext = {};

beforeAll(async () => {
  await connectDatabase();
  app = createApp();
  
  // Create test merchant (once for all tests)
  const Merchant = require('../models/merchantModel');
  
  // Clean up any existing test merchant
  await Merchant.deleteMany({ slug: 'test-restaurant' });
  
  testContext.merchant = await Merchant.create({
    businessName: 'Test Restaurant',
    slug: 'test-restaurant',
    email: `test-${Date.now()}@restaurant.com`, // Unique email
    phone: '+251911111111',
    branchCounter: 0,
  });
  testContext.merchantId = testContext.merchant._id;

  // Create branch
  testContext.branch = await Branch.create({
    merchant: testContext.merchantId,
    name: 'Test Branch',
    isActive: true,
    location: {
      city: 'Test City',
      coordinates: [38.7578, 9.0320] // [longitude, latitude]
    }
  });

  // Create roles
  testContext.waiterRole = await Role.create({
    merchant: testContext.merchantId,
    name: 'WAITER',
    category: 'staff',
    permissions: [],
  });

  testContext.kitchenRole = await Role.create({
    merchant: testContext.merchantId,
    name: 'KITCHEN_STAFF',
    category: 'kitchen',
    permissions: [],
  });

  // Create users
  testContext.waiter = await User.create({
    merchant: testContext.merchantId,
    fullName: 'Test Waiter',
    email: 'waiter@test.com',
    password: 'password123',
    role: testContext.waiterRole._id,
    branch: testContext.branch._id,
  });

  testContext.kitchenStaff = await User.create({
    merchant: testContext.merchantId,
    fullName: 'Kitchen Staff',
    email: 'kitchen@test.com',
    password: 'password123',
    role: testContext.kitchenRole._id,
    branch: testContext.branch._id,
  });

  // Get JWT tokens
  const waiterLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'waiter@test.com', password: 'password123' });
  testContext.waiterToken = waiterLogin.body.token;

  const kitchenLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'kitchen@test.com', password: 'password123' });
  testContext.kitchenToken = kitchenLogin.body.token;

  // Create kitchen station
  testContext.grillStation = await KitchenStation.create({
    merchant: testContext.merchantId,
    branch: testContext.branch._id,
    name: 'Grill',
    slug: 'grill',
    isActive: true,
  });

  // Create table
  testContext.table = await Table.create({
    merchant: testContext.merchantId,
    branch: testContext.branch._id,
    tableNumber: 'T1',
    capacity: 4,
    status: 'available',
  });

  // Create menu items
  testContext.cookedItem = await MenuItem.create({
    merchant: testContext.merchantId,
    name: { en: 'Grilled Steak', am: 'Grilled Steak' },
    price: 250,
    available: true,
    publishStatus: 'published',
    kitchenStation: testContext.grillStation._id,
    requiresKitchen: true, // ✅ Requires cooking
  });

  testContext.nonCookedItem = await MenuItem.create({
    merchant: testContext.merchantId,
    name: { en: 'Coca Cola', am: 'Coca Cola' },
    price: 20,
    available: true,
    publishStatus: 'published',
    kitchenStation: null, // No station
    requiresKitchen: false, // ✅ Does NOT require cooking
  });
});

afterAll(async () => {
  const Merchant = require('../models/merchantModel');
  await Order.deleteMany({ merchant: testContext.merchantId });
  await MenuItem.deleteMany({ merchant: testContext.merchantId });
  await KitchenStation.deleteMany({ merchant: testContext.merchantId });
  await KitchenTicket.deleteMany({ merchant: testContext.merchantId });
  await Table.deleteMany({ merchant: testContext.merchantId });
  await Branch.deleteMany({ merchant: testContext.merchantId });
  await User.deleteMany({ merchant: testContext.merchantId });
  await Role.deleteMany({ merchant: testContext.merchantId });
  await Merchant.deleteMany({ _id: testContext.merchantId });
  await disconnectDatabase();
});

describe('Item Status Workflow - Auto-serve Non-cooked Items', () => {
  test('Non-cooked items are auto-served on order acceptance (dine-in)', async () => {
    // 1. Create dine-in order with mixed items
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [
          { menuItemId: testContext.cookedItem._id, quantity: 1 },
          { menuItemId: testContext.nonCookedItem._id, quantity: 2 },
        ],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;

    // 2. Order should be pending
    let order = await Order.findById(orderId);
    expect(order.status).toBe('pending');
    expect(order.items[0].status).toBe('pending'); // Cooked item
    expect(order.items[1].status).toBe('pending'); // Non-cooked item

    // 3. Accept order → should auto-serve non-cooked items
    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'accepted' })
      .expect(200);

    // 4. Verify non-cooked items are auto-served
    order = await Order.findById(orderId);
    expect(order.items[0].status).toBe('pending'); // Cooked item still pending
    expect(order.items[1].status).toBe('served'); // Non-cooked auto-served
    expect(order.items[1].servedVia).toBe('auto');
    expect(order.items[1].servedAt).toBeTruthy();
  });

  test('Non-cooked items NOT auto-served for delivery orders', async () => {
    // Delivery orders should not auto-serve
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.nonCookedItem._id, quantity: 1 }],
        orderType: 'delivery',
        customerName: 'Test Customer',
        customerPhone: '+251911111111',
        branchId: testContext.branch._id,
        source: 'admin',
        location: { type: 'Point', coordinates: [38.7578, 9.0320] },
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;

    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'accepted' })
      .expect(200);

    const order = await Order.findById(orderId);
    expect(order.items[0].status).toBe('pending'); // NOT auto-served
  });
});

describe('Item Status Workflow - Ticket Integration', () => {
  test('Ticket creation sets items to in_progress', async () => {
    // 1. Create order with cooked items
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.cookedItem._id, quantity: 2 }],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;

    // 2. Accept order
    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'accepted' })
      .expect(200);

    // 3. Move to preparing → creates tickets
    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'preparing' })
      .expect(200);

    // 4. Verify items are in_progress
    const order = await Order.findById(orderId);
    expect(order.items[0].status).toBe('in_progress');
  });

  test('Ticket ready transition sets items to ready (NOT served)', async () => {
    // 1. Create order
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.cookedItem._id, quantity: 1 }],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;

    // 2. Accept → Preparing
    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'accepted' });

    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'preparing' });

    // 3. Get ticket
    const tickets = await KitchenTicket.find({ order: orderId });
    expect(tickets.length).toBe(1);

    // 4. Mark ticket as ready
    await request(app)
      .patch(`/api/v1/kitchen/tickets/${tickets[0]._id}/status`)
      .set('Authorization', `Bearer ${testContext.kitchenToken}`)
      .send({ status: 'ready' })
      .expect(200);

    // 5. Verify items are ready (NOT served)
    const order = await Order.findById(orderId);
    expect(order.items[0].status).toBe('ready');
    expect(order.items[0].servedAt).toBeNull();
  });
});

describe('Item Status Workflow - Manual Endpoints', () => {
  test('PATCH /:orderId/items/:itemId/status - Serve ready item manually', async () => {
    // 1. Create order and get to ready status
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.cookedItem._id, quantity: 1 }],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;

    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'accepted' });

    await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'preparing' });

    const tickets = await KitchenTicket.find({ order: orderId });
    await request(app)
      .patch(`/api/v1/kitchen/tickets/${tickets[0]._id}/status`)
      .set('Authorization', `Bearer ${testContext.kitchenToken}`)
      .send({ status: 'ready' });

    let order = await Order.findById(orderId);
    const itemId = order.items[0]._id;

    // 2. Manually serve the item
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'served' })
      .expect(200);

    expect(res.body.data.item.status).toBe('served');
    expect(res.body.data.item.servedVia).toBe('manual');

    // 3. Verify in database
    order = await Order.findById(orderId);
    expect(order.items[0].status).toBe('served');
    expect(order.items[0].servedVia).toBe('manual');
    expect(order.items[0].servedBy.toString()).toBe(testContext.waiter._id.toString());
  });

  test('POST /:orderId/items/serve-ready - Bulk serve all ready items', async () => {
    // 1. Create order with multiple items
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [
          { menuItemId: testContext.cookedItem._id, quantity: 3 },
        ],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;

    // 2. Get to ready status
    await request(app).patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'accepted' });

    await request(app).patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'preparing' });

    const tickets = await KitchenTicket.find({ order: orderId });
    await request(app)
      .patch(`/api/v1/kitchen/tickets/${tickets[0]._id}/status`)
      .set('Authorization', `Bearer ${testContext.kitchenToken}`)
      .send({ status: 'ready' });

    // 3. Bulk serve all ready items
    const res = await request(app)
      .post(`/api/v1/orders/${orderId}/items/serve-ready`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .expect(200);

    expect(res.body.data.servedCount).toBe(1);

    // 4. Verify all items served
    const order = await Order.findById(orderId);
    expect(order.items[0].status).toBe('served');
  });

  test('PATCH /:orderId/items/:itemId/void - Void item with reason', async () => {
    // 1. Create order
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.cookedItem._id, quantity: 1 }],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;
    let order = await Order.findById(orderId);
    const itemId = order.items[0]._id;

    // 2. Void the item
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/items/${itemId}/void`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ reason: 'Out of stock' })
      .expect(200);

    expect(res.body.data.voidedItem.status).toBe('void');
    expect(res.body.data.voidedItem.voidReason).toBe('Out of stock');

    // 3. Verify in database
    order = await Order.findById(orderId);
    expect(order.items[0].status).toBe('void');
    expect(order.items[0].voidedBy.toString()).toBe(testContext.waiter._id.toString());
  });

  test('Void with replacement creates new item', async () => {
    // 1. Create order
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.cookedItem._id, quantity: 1 }],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;
    let order = await Order.findById(orderId);
    const itemId = order.items[0]._id;

    // 2. Void with replacement
    const res = await request(app)
      .patch(`/api/v1/orders/${orderId}/items/${itemId}/void`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        reason: 'Wrong item',
        createReplacement: true,
      })
      .expect(200);

    expect(res.body.data.replacementItem).toBeTruthy();
    expect(res.body.data.replacementItem.status).toBe('pending');

    // 3. Verify in database
    order = await Order.findById(orderId);
    expect(order.items.length).toBe(2); // Original + replacement
    expect(order.items[0].status).toBe('void');
    expect(order.items[1].status).toBe('pending');
    expect(order.items[1].replacedItemId.toString()).toBe(itemId.toString());
  });
});

describe('Item Status Workflow - State Machine Validation', () => {
  test('Invalid transitions are rejected', async () => {
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.cookedItem._id, quantity: 1 }],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;
    const order = await Order.findById(orderId);
    const itemId = order.items[0]._id;

    // Try invalid transition: pending → served (should go through in_progress/ready first)
    // Actually, this is valid per spec - pending can go directly to served
    // Let's test a truly invalid one: served → pending
    
    // First serve the item
    await request(app)
      .patch(`/api/v1/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'served' })
      .expect(200);

    // Try to move back to pending (invalid)
    await request(app)
      .patch(`/api/v1/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'pending' })
      .expect(400); // Should fail
  });

  test('Cannot transition from void (terminal status)', async () => {
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.cookedItem._id, quantity: 1 }],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;
    let order = await Order.findById(orderId);
    const itemId = order.items[0]._id;

    // Void the item
    await request(app)
      .patch(`/api/v1/orders/${orderId}/items/${itemId}/void`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ reason: 'Test' })
      .expect(200);

    // Try to change status (should fail)
    await request(app)
      .patch(`/api/v1/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'served' })
      .expect(400);
  });
});

describe('Item Status Workflow - Order Status Recomputation', () => {
  test('Order status derived from item statuses', async () => {
    // Create order with cooked item
    const orderRes = await request(app)
      .post('/api/v1/orders/staff')
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({
        items: [{ menuItemId: testContext.cookedItem._id, quantity: 1 }],
        orderType: 'dine_in',
        tableId: testContext.table._id,
        branchId: testContext.branch._id,
        source: 'waiter',
      })
      .expect(201);

    const orderId = orderRes.body.data.order._id;

    // Accept → Preparing
    await request(app).patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'accepted' });

    await request(app).patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'preparing' });

    // Ticket ready
    const tickets = await KitchenTicket.find({ order: orderId });
    await request(app)
      .patch(`/api/v1/kitchen/tickets/${tickets[0]._id}/status`)
      .set('Authorization', `Bearer ${testContext.kitchenToken}`)
      .send({ status: 'ready' });

    // Order should be 'ready'
    let order = await Order.findById(orderId);
    expect(order.status).toBe('ready');

    // Serve the item
    const itemId = order.items[0]._id;
    await request(app)
      .patch(`/api/v1/orders/${orderId}/items/${itemId}/status`)
      .set('Authorization', `Bearer ${testContext.waiterToken}`)
      .send({ status: 'served' });

    // Order should be 'served'
    order = await Order.findById(orderId);
    expect(order.status).toBe('served');
  });
});
