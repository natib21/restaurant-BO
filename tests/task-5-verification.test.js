/**
 * Task 5 Verification Test
 * 
 * Verifies that customer orders:
 * 1. Have session field populated
 * 2. Have source='qr'
 * 3. Multiple orders link to same session
 */

const mongoose = require('mongoose');
const DiningSession = require('../models/DiningSession');
const Order = require('../models/orderModel');
const Table = require('../models/tabelModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');

// Connect to test database
beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant-test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Task 5: Customer Order Creation with Sessions', () => {
  let testMerchant;
  let testBranch;
  let testTable;
  let testSession;

  beforeEach(async () => {
    // Clean database
    await Order.deleteMany({});
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});

    // Create test data
    testMerchant = await Merchant.create({
      businessName: 'Test Restaurant',
      slug: 'test-restaurant',
      email: 'test@restaurant.com',
      phone: '+251911000000',
      businessLicenseNumber: 'TEST123'
    });

    testBranch = await Branch.create({
      name: 'Test Branch',
      merchant: testMerchant._id,
      location: {
        type: 'Point',
        coordinates: [38.7578, 9.0192],
        city: 'Addis Ababa'
      },
      qrSecretKey: 'test-secret-key'
    });

    testTable = await Table.create({
      tableNumber: 'T1',
      capacity: 4,
      merchant: testMerchant._id,
      branch: testBranch._id,
      status: 'available',
      isActive: true
    });

    // Create dining session
    testSession = await DiningSession.create({
      table: testTable._id,
      merchant: testMerchant._id,
      branch: testBranch._id,
      token: 'test-session-token-123',
      status: 'active',
      startedAt: new Date()
    });

    // Mark table as occupied
    testTable.status = 'occupied';
    await testTable.save();
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
  });

  test('Order has session field populated', async () => {
    console.log('\n🧪 TEST 1: Order has session field populated');
    console.log('Session ID:', testSession._id.toString());

    // Create order with session
    const order = await Order.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      table: testTable._id,
      tableNumber: testTable.tableNumber,
      session: testSession._id,  // ✅ Set session
      orderType: 'dine_in',
      orderNumber: '#T1-001',
      source: 'qr',
      customerName: 'Test Customer',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Burger',
        quantity: 2,
        price: 150,
        unitPrice: 150,
        totalPrice: 300
      }],
      subtotal: 300,
      totalAmount: 300,
      paymentStatus: 'unpaid',
      status: 'pending'
    });

    console.log('Order created:', order._id.toString());
    console.log('Order.session:', order.session?.toString());
    console.log('Order.source:', order.source);

    // Verify
    expect(order.session).toBeDefined();
    expect(order.session.toString()).toBe(testSession._id.toString());
    expect(order.source).toBe('qr');

    console.log('✅ PASS: Order has session and source=qr\n');
  });

  test('Two orders link to same session', async () => {
    console.log('\n🧪 TEST 2: Two orders link to same session');
    console.log('Session ID:', testSession._id.toString());
    console.log('Table:', testTable.tableNumber);

    // Customer A places order
    const order1 = await Order.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      table: testTable._id,
      tableNumber: testTable.tableNumber,
      session: testSession._id,
      orderType: 'dine_in',
      orderNumber: '#T1-001',
      source: 'qr',
      customerName: 'Customer A',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Burger',
        quantity: 2,
        price: 150,
        unitPrice: 150,
        totalPrice: 300
      }],
      subtotal: 300,
      totalAmount: 300,
      paymentStatus: 'unpaid',
      status: 'pending'
    });

    console.log('Order 1 created:', order1._id.toString());

    // Customer B places order (same session)
    const order2 = await Order.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      table: testTable._id,
      tableNumber: testTable.tableNumber,
      session: testSession._id,  // ✅ Same session
      orderType: 'dine_in',
      orderNumber: '#T1-002',
      source: 'qr',
      customerName: 'Customer B',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Burger',
        quantity: 1,
        price: 150,
        unitPrice: 150,
        totalPrice: 150
      }],
      subtotal: 150,
      totalAmount: 150,
      paymentStatus: 'unpaid',
      status: 'pending'
    });

    console.log('Order 2 created:', order2._id.toString());

    // Query orders by session
    const sessionOrders = await Order.find({
      session: testSession._id
    }).select('_id orderNumber session source customerName').lean();

    console.log('\n📊 Query Result: Order.find({ session: sessionId })');
    console.log('Found', sessionOrders.length, 'orders');
    sessionOrders.forEach((order, i) => {
      console.log(`  Order ${i + 1}:`, {
        _id: order._id.toString(),
        orderNumber: order.orderNumber,
        session: order.session.toString(),
        source: order.source,
        customerName: order.customerName
      });
    });

    // Verify
    expect(sessionOrders.length).toBe(2);
    expect(sessionOrders[0].session.toString()).toBe(testSession._id.toString());
    expect(sessionOrders[1].session.toString()).toBe(testSession._id.toString());
    expect(sessionOrders[0].source).toBe('qr');
    expect(sessionOrders[1].source).toBe('qr');

    console.log('\n✅ PASS: Both orders linked to same session\n');
  });

  test('Order without session fails for dine-in', async () => {
    console.log('\n🧪 TEST 3: Order without session fails for dine-in');

    // Try to create dine-in order without session
    await expect(Order.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      table: testTable._id,
      tableNumber: testTable.tableNumber,
      // ❌ session: MISSING
      orderType: 'dine_in',
      orderNumber: '#T1-003',
      source: 'qr',
      customerName: 'Customer C',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Burger',
        quantity: 1,
        price: 150,
        unitPrice: 150,
        totalPrice: 150
      }],
      subtotal: 150,
      totalAmount: 150,
      paymentStatus: 'unpaid',
      status: 'pending'
    })).rejects.toThrow();

    console.log('✅ PASS: Validation error thrown as expected\n');
  });

  test('Takeaway order works without session', async () => {
    console.log('\n🧪 TEST 4: Takeaway order works without session');

    // Create takeaway order without session (should work)
    const takeawayOrder = await Order.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      // ❌ No table, No session
      orderType: 'takeaway',
      orderNumber: '#TAKE-001',
      source: 'qr',
      customerName: 'Takeaway Customer',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Burger',
        quantity: 1,
        price: 150,
        unitPrice: 150,
        totalPrice: 150
      }],
      subtotal: 150,
      totalAmount: 150,
      paymentStatus: 'unpaid',
      status: 'pending'
    });

    console.log('Takeaway order created:', takeawayOrder._id.toString());
    console.log('Order.session:', takeawayOrder.session); // undefined
    console.log('Order.orderType:', takeawayOrder.orderType);

    expect(takeawayOrder.session).toBeUndefined();
    expect(takeawayOrder.orderType).toBe('takeaway');

    console.log('✅ PASS: Takeaway works without session\n');
  });
});
