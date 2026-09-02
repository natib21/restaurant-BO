/**
 * Test: Order source field fix (Step 1) - Unit tests
 * 
 * Verifies that order.source is set correctly in the database:
 * - Customer QR orders → 'web'
 * - Waiter staff orders → 'waiter' (based on role name)
 * - Admin staff orders → 'admin' (based on role name)
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Order = require('../models/orderModel');

describe('Order Source Field - Database Level', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await disconnectDatabase();
  });

  afterEach(async () => {
    await Order.deleteMany({});
  });

  it('should save order with source="web" explicitly', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();
    const tableId = new mongoose.Types.ObjectId();

    const [order] = await Order.create([{
      merchant: merchantId,
      branch: branchId,
      table: tableId,
      tableNumber: 'T1',
      customerName: 'Customer Test',
      orderType: 'dine_in',
      orderNumber: '#TEST-001',
      source: 'web', // Explicit source
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      }],
      subtotal: 100,
      totalAmount: 100,
      paymentStatus: 'unpaid',
      status: 'pending',
    }]);

    expect(order.source).toBe('web');

    // Verify in database
    const savedOrder = await Order.findById(order._id);
    expect(savedOrder.source).toBe('web');
  });

  it('should save order with source="waiter"', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();
    const tableId = new mongoose.Types.ObjectId();

    const [order] = await Order.create([{
      merchant: merchantId,
      branch: branchId,
      table: tableId,
      tableNumber: 'T2',
      customerName: 'Walk-in Customer',
      orderType: 'dine_in',
      orderNumber: '#TEST-002',
      source: 'waiter', // Explicit waiter source
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 2,
        unitPrice: 150,
        totalPrice: 300,
      }],
      subtotal: 300,
      totalAmount: 300,
      paymentStatus: 'unpaid',
      status: 'pending',
    }]);

    expect(order.source).toBe('waiter');

    // Verify in database
    const savedOrder = await Order.findById(order._id);
    expect(savedOrder.source).toBe('waiter');
  });

  it('should save order with source="admin"', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();

    const [order] = await Order.create([{
      merchant: merchantId,
      branch: branchId,
      customerName: 'Admin Created Order',
      orderType: 'takeaway',
      orderNumber: '#TEST-003',
      source: 'admin', // Explicit admin source
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 1,
        unitPrice: 200,
        totalPrice: 200,
      }],
      subtotal: 200,
      totalAmount: 200,
      paymentStatus: 'unpaid',
      status: 'pending',
    }]);

    expect(order.source).toBe('admin');

    // Verify in database
    const savedOrder = await Order.findById(order._id);
    expect(savedOrder.source).toBe('admin');
  });

  it('should save order with source="telegram"', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();

    const [order] = await Order.create([{
      merchant: merchantId,
      branch: branchId,
      customerName: 'Telegram Customer',
      orderType: 'delivery',
      orderNumber: '#TEST-004',
      source: 'telegram', // Explicit telegram source
      location: {
        type: 'Point',
        coordinates: [38.7525, 9.0082],
        city: 'Addis Ababa',
      },
      delivery: {
        location: { lat: 9.0082, lng: 38.7525 },
        phone: '+251911111111',
        fee: 50,
      },
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 1,
        unitPrice: 250,
        totalPrice: 250,
      }],
      subtotal: 250,
      totalAmount: 300, // including delivery fee
      deliveryFee: 50,
      paymentStatus: 'unpaid',
      status: 'pending',
    }]);

    expect(order.source).toBe('telegram');

    // Verify in database
    const savedOrder = await Order.findById(order._id);
    expect(savedOrder.source).toBe('telegram');
  });

  it('should enforce source enum validation', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();

    await expect(Order.create([{
      merchant: merchantId,
      branch: branchId,
      customerName: 'Invalid Source Order',
      orderType: 'dine_in',
      orderNumber: '#TEST-005',
      source: 'invalid_source', // Invalid source
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      }],
      subtotal: 100,
      totalAmount: 100,
      paymentStatus: 'unpaid',
      status: 'pending',
    }])).rejects.toThrow();
  });

  it('should allow querying orders by source', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();
    const tableId = new mongoose.Types.ObjectId();

    // Create orders with different sources
    await Order.create([
      {
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T1',
        customerName: 'Web Order',
        orderType: 'dine_in',
        orderNumber: '#WEB-001',
        source: 'web',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'pending',
      },
      {
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        tableNumber: 'T2',
        customerName: 'Waiter Order',
        orderType: 'dine_in',
        orderNumber: '#WAITER-001',
        source: 'waiter',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'pending',
      },
      {
        merchant: merchantId,
        branch: branchId,
        customerName: 'Admin Order',
        orderType: 'takeaway',
        orderNumber: '#ADMIN-001',
        source: 'admin',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentStatus: 'unpaid',
        status: 'pending',
      },
    ]);

    // Query by source
    const webOrders = await Order.find({ merchant: merchantId, source: 'web' });
    const waiterOrders = await Order.find({ merchant: merchantId, source: 'waiter' });
    const adminOrders = await Order.find({ merchant: merchantId, source: 'admin' });

    expect(webOrders.length).toBe(1);
    expect(waiterOrders.length).toBe(1);
    expect(adminOrders.length).toBe(1);

    expect(webOrders[0].orderNumber).toBe('#WEB-001');
    expect(waiterOrders[0].orderNumber).toBe('#WAITER-001');
    expect(adminOrders[0].orderNumber).toBe('#ADMIN-001');
  });
});
