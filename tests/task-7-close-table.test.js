/**
 * Task 7 Verification: Close Table Endpoint
 * 
 * Verifies that staff can close tables via the API endpoint:
 * 1. Close table with all orders paid
 * 2. Prevent closing with unpaid orders
 * 3. Force close with unpaid orders using force flag
 * 4. Return session summary on close
 */

const mongoose = require('mongoose');
const { SessionService } = require('../src/modules/sessions/service/SessionService');
const DiningSession = require('../models/DiningSession');
const Order = require('../models/orderModel');
const Table = require('../models/tabelModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');

const MONGODB_URI = process.env.DATABASE_LOCAL || 'mongodb://127.0.0.1:27017/restaurant-bo';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    console.log('\n🔌 Connecting to MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');
  }
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Task 7: Close Table Endpoint', () => {
  let testMerchant;
  let testBranch;
  let testTable;
  let testSession;
  let testStaffId;

  beforeEach(async () => {
    console.log('\n🧹 Cleaning database...');
    await Order.deleteMany({});
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});

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

    testStaffId = new mongoose.Types.ObjectId();

    console.log('✅ Test data created');
    console.log(`   Merchant: ${testMerchant._id}`);
    console.log(`   Branch: ${testBranch._id}`);
    console.log(`   Table: ${testTable._id} (${testTable.tableNumber})\n`);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
  });

  test('Close table with all orders paid', async () => {
    console.log('🧪 TEST: Close table with all orders paid');
    console.log('═══════════════════════════════════════════════════\n');

    // Step 1: Create session
    console.log('📝 Step 1: Create dining session');
    const { session } = await SessionService.getOrCreateActiveSession({
      tableId: testTable._id
    });
    console.log(`   Session created: ${session._id}\n`);

    // Step 2: Create paid order
    console.log('📝 Step 2: Create paid order');
    await Order.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      table: testTable._id,
      tableNumber: testTable.tableNumber,
      session: session._id,
      orderType: 'dine_in',
      orderNumber: '#DI-001',
      source: 'qr',
      customerName: 'Test Customer',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 1,
        price: 150,
        unitPrice: 150,
        totalPrice: 150
      }],
      subtotal: 150,
      totalAmount: 150,
      paymentStatus: 'paid', // ✅ Paid
      status: 'completed'
    });
    console.log('   Order created (paid)\n');

    // Step 3: Close session
    console.log('📝 Step 3: Close session');
    const closedSession = await SessionService.endSession({
      sessionId: session._id,
      closedBy: testStaffId,
      force: false
    });

    console.log('\n📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Session Closed:');
    console.log(`   Session ID: ${closedSession._id}`);
    console.log(`   Status: ${closedSession.status}`);
    console.log(`   Started: ${closedSession.startedAt}`);
    console.log(`   Ended: ${closedSession.endedAt}`);
    console.log(`   Duration: ${closedSession.getDurationFormatted()}\n`);

    // Verify table status
    const table = await Table.findById(testTable._id);
    console.log(`🪑 Table Status: ${table.status}\n`);

    // Assertions
    expect(closedSession.status).toBe('ended');
    expect(closedSession.endedAt).toBeDefined();
    expect(table.status).toBe('needs-cleaning');

    console.log('✅ TEST PASSED: Table closed successfully!\n');
  }, 30000);

  test('Prevent closing table with unpaid orders', async () => {
    console.log('🧪 TEST: Prevent closing with unpaid orders');
    console.log('═══════════════════════════════════════════════════\n');

    // Step 1: Create session
    console.log('📝 Step 1: Create dining session');
    const { session } = await SessionService.getOrCreateActiveSession({
      tableId: testTable._id
    });
    console.log(`   Session created: ${session._id}\n`);

    // Step 2: Create unpaid order
    console.log('📝 Step 2: Create unpaid order');
    await Order.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      table: testTable._id,
      tableNumber: testTable.tableNumber,
      session: session._id,
      orderType: 'dine_in',
      orderNumber: '#DI-002',
      source: 'qr',
      customerName: 'Test Customer',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 1,
        price: 150,
        unitPrice: 150,
        totalPrice: 150
      }],
      subtotal: 150,
      totalAmount: 150,
      paymentStatus: 'unpaid', // ❌ Unpaid
      status: 'completed'
    });
    console.log('   Order created (unpaid)\n');

    // Step 3: Attempt to close session
    console.log('📝 Step 3: Attempt to close session (should fail)\n');

    let error;
    try {
      await SessionService.endSession({
        sessionId: session._id,
        closedBy: testStaffId,
        force: false
      });
    } catch (err) {
      error = err;
    }

    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('❌ Close Rejected (as expected):');
    console.log(`   Error: ${error.message}`);
    console.log(`   Status Code: ${error.statusCode}`);
    if (error.data) {
      console.log(`   Code: ${error.data.code}`);
      console.log(`   Unpaid Orders: ${error.data.unpaidCount}`);
    }
    console.log('');

    // Verify session still active
    const stillActiveSession = await DiningSession.findById(session._id);
    console.log(`💾 Session Status: ${stillActiveSession.status}\n`);

    // Assertions
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('unpaid');
    expect(stillActiveSession.status).toBe('active');

    console.log('✅ TEST PASSED: Unpaid orders prevented close!\n');
  }, 30000);

  test('Force close table with unpaid orders', async () => {
    console.log('🧪 TEST: Force close with unpaid orders');
    console.log('═══════════════════════════════════════════════════\n');

    // Step 1: Create session
    console.log('📝 Step 1: Create dining session');
    const { session } = await SessionService.getOrCreateActiveSession({
      tableId: testTable._id
    });
    console.log(`   Session created: ${session._id}\n`);

    // Step 2: Create unpaid order
    console.log('📝 Step 2: Create unpaid order');
    await Order.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      table: testTable._id,
      tableNumber: testTable.tableNumber,
      session: session._id,
      orderType: 'dine_in',
      orderNumber: '#DI-003',
      source: 'qr',
      customerName: 'Test Customer',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 1,
        price: 150,
        unitPrice: 150,
        totalPrice: 150
      }],
      subtotal: 150,
      totalAmount: 150,
      paymentStatus: 'unpaid',
      status: 'completed'
    });
    console.log('   Order created (unpaid)\n');

    // Step 3: Force close session
    console.log('📝 Step 3: Force close session (force=true)\n');

    const closedSession = await SessionService.endSession({
      sessionId: session._id,
      closedBy: testStaffId,
      force: true // ✅ Force close
    });

    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Session Force Closed:');
    console.log(`   Session ID: ${closedSession._id}`);
    console.log(`   Status: ${closedSession.status}`);
    console.log(`   Forced: true\n`);

    // Verify table status
    const table = await Table.findById(testTable._id);
    console.log(`🪑 Table Status: ${table.status}\n`);

    // Assertions
    expect(closedSession.status).toBe('ended');
    expect(closedSession.endedAt).toBeDefined();
    expect(table.status).toBe('needs-cleaning');

    console.log('✅ TEST PASSED: Force close worked with unpaid orders!\n');
  }, 30000);

  test('Return session summary on close', async () => {
    console.log('🧪 TEST: Return session summary on close');
    console.log('═══════════════════════════════════════════════════\n');

    // Step 1: Create session
    console.log('📝 Step 1: Create dining session');
    const { session } = await SessionService.getOrCreateActiveSession({
      tableId: testTable._id
    });
    console.log(`   Session created: ${session._id}\n`);

    // Step 2: Create multiple paid orders
    console.log('📝 Step 2: Create 3 paid orders\n');
    for (let i = 0; i < 3; i++) {
      await Order.create({
        merchant: testMerchant._id,
        branch: testBranch._id,
        table: testTable._id,
        tableNumber: testTable.tableNumber,
        session: session._id,
        orderType: 'dine_in',
        orderNumber: `#DI-00${i + 1}`,
        source: i === 0 ? 'qr' : 'staff',
        customerName: `Customer ${String.fromCharCode(65 + i)}`,
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: i + 1,
          price: 150,
          unitPrice: 150,
          totalPrice: 150 * (i + 1)
        }],
        subtotal: 150 * (i + 1),
        totalAmount: 150 * (i + 1),
        paymentStatus: 'paid',
        status: 'completed'
      });
      console.log(`   Order ${i + 1} created: #DI-00${i + 1} (${150 * (i + 1)} Birr)`);
    }
    console.log('');

    // Step 3: Close session and get summary
    console.log('📝 Step 3: Close session and get summary\n');

    await SessionService.endSession({
      sessionId: session._id,
      closedBy: testStaffId,
      force: false
    });

    const summary = await SessionService.getSessionSummary(session._id);

    console.log('📊 SESSION SUMMARY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`📌 Session: ${summary.sessionId}`);
    console.log(`🪑 Table: ${summary.tableId}`);
    console.log(`📅 Status: ${summary.status}`);
    console.log(`⏱️  Duration: ${summary.duration}\n`);

    console.log(`📦 Orders: ${summary.orderCount}`);
    console.log(`💰 Total Amount: ${summary.totalAmount} Birr`);
    console.log(`✅ Paid: ${summary.paidOrders}`);
    console.log(`❌ Unpaid: ${summary.unpaidOrders}\n`);

    console.log(`🎯 By Source:`);
    console.log(`   QR: ${summary.qrOrders}`);
    console.log(`   Staff: ${summary.staffOrders}\n`);

    console.log('📝 Order Details:');
    summary.orders.forEach((o, i) => {
      console.log(`   ${i + 1}. ${o.orderNumber} - ${o.totalAmount} Birr (${o.source}, ${o.paymentStatus})`);
    });
    console.log('');

    // Assertions
    expect(summary.orderCount).toBe(3);
    expect(summary.totalAmount).toBe(900); // 150 + 300 + 450
    expect(summary.paidOrders).toBe(3);
    expect(summary.unpaidOrders).toBe(0);
    expect(summary.qrOrders).toBe(1);
    expect(summary.staffOrders).toBe(2);
    expect(summary.status).toBe('ended');

    console.log('✅ TEST PASSED: Summary returned correctly!\n');
  }, 30000);
});
