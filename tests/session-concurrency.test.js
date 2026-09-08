/**
 * Concurrency Test - REAL MongoDB Transactions
 * 
 * Tests:
 * 1. 10 simultaneous getOrCreateActiveSession() calls → 1 session
 * 2. Simultaneous order placements → all link to same session
 */

const mongoose = require('mongoose');
const { SessionService } = require('../src/modules/sessions/service/SessionService');
const DiningSession = require('../models/DiningSession');
const Order = require('../models/orderModel');
const Table = require('../models/tabelModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');

// Use local MongoDB (should be replica set)
const MONGODB_URI = process.env.DATABASE_LOCAL || 'mongodb://127.0.0.1:27017/restaurant-bo';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    console.log('\n🔌 Connecting to MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected');
    
    // Check if replica set
    const admin = mongoose.connection.db.admin();
    try {
      const status = await admin.replSetGetStatus();
      console.log('✅ Replica Set detected:', status.set);
    } catch (err) {
      console.warn('⚠️  WARNING: Not a replica set - transactions may fail');
    }
    console.log('');
  }
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Concurrency with MongoDB Transactions', () => {
  let testMerchant;
  let testBranch;
  let testTable;

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

    console.log('✅ Test data created');
    console.log(`   Table ID: ${testTable._id}`);
    console.log(`   Table Number: ${testTable.tableNumber}\n`);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
  });

  test('10 simultaneous getOrCreateActiveSession → exactly 1 session', async () => {
    console.log('🧪 TEST 1: 10 Simultaneous Session Calls');
    console.log('============================================\n');

    const startTime = Date.now();

    // Fire 10 simultaneous requests
    const promises = Array(10).fill(null).map((_, index) => {
      console.log(`  🚀 Request ${index + 1}: Calling getOrCreateActiveSession()`);
      return SessionService.getOrCreateActiveSession({
        tableId: testTable._id
      });
    });

    console.log('\n⏳ Waiting for all requests to complete...\n');
    const results = await Promise.all(promises);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Analyze results
    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const newSessions = results.filter(r => r.isNew);
    const reusedSessions = results.filter(r => !r.isNew);
    
    console.log(`✅ New sessions created: ${newSessions.length}`);
    console.log(`♻️  Sessions reused: ${reusedSessions.length}`);
    console.log(`⏱️  Total time: ${duration}ms\n`);

    // Extract session IDs
    const sessionIds = results.map(r => r.session._id.toString());
    const uniqueSessionIds = [...new Set(sessionIds)];
    
    console.log(`🔑 Unique session IDs returned: ${uniqueSessionIds.length}`);
    if (uniqueSessionIds.length === 1) {
      console.log(`   Session ID: ${uniqueSessionIds[0]}`);
    } else {
      console.log(`   ❌ ERROR: Multiple sessions created!`);
      uniqueSessionIds.forEach((id, i) => {
        console.log(`   ${i + 1}. ${id}`);
      });
    }
    console.log('');

    // Verify database has exactly one active session
    const dbSessions = await DiningSession.find({
      table: testTable._id,
      status: 'active'
    }).lean();

    console.log(`💾 Active sessions in database: ${dbSessions.length}`);
    if (dbSessions.length === 1) {
      console.log(`   Session ID: ${dbSessions[0]._id}`);
      console.log(`   Token: ${dbSessions[0].token.substring(0, 16)}...`);
      console.log(`   Status: ${dbSessions[0].status}`);
    } else {
      console.log(`   ❌ ERROR: Expected 1, found ${dbSessions.length}`);
      dbSessions.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s._id} (status: ${s.status})`);
      });
    }
    console.log('');

    // Verify table status
    const updatedTable = await Table.findById(testTable._id);
    console.log(`🪑 Table status: ${updatedTable.status}`);
    console.log('');

    // Assertions
    expect(newSessions.length).toBe(1);
    expect(reusedSessions.length).toBe(9);
    expect(uniqueSessionIds.length).toBe(1);
    expect(dbSessions.length).toBe(1);
    expect(updatedTable.status).toBe('occupied');

    console.log('✅ TEST 1 PASSED: Only one session created!\n');
  }, 30000);

  test('Simultaneous order placements → all link to same session', async () => {
    console.log('🧪 TEST 2: Simultaneous Order Placements');
    console.log('============================================\n');

    // Step 1: Create session
    console.log('📝 Step 1: Create dining session');
    const { session } = await SessionService.getOrCreateActiveSession({
      tableId: testTable._id
    });
    console.log(`   Session created: ${session._id}`);
    console.log(`   Session token: ${session.token.substring(0, 16)}...\n`);

    // Step 2: Fire 5 simultaneous order placements
    console.log('📝 Step 2: Fire 5 simultaneous order placements\n');

    const startTime = Date.now();

    const orderPromises = Array(5).fill(null).map((_, index) => {
      console.log(`  🚀 Order ${index + 1}: Creating order...`);
      return Order.create({
        merchant: testMerchant._id,
        branch: testBranch._id,
        table: testTable._id,
        tableNumber: testTable.tableNumber,
        session: session._id,  // ✅ Link to session
        orderType: 'dine_in',
        orderNumber: `#T1-${String(index + 1).padStart(3, '0')}`,
        source: 'qr',
        customerName: `Customer ${String.fromCharCode(65 + index)}`,
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
        status: 'pending'
      });
    });

    console.log('\n⏳ Waiting for all orders to complete...\n');
    const orders = await Promise.all(orderPromises);

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`✅ Orders created: ${orders.length}`);
    console.log(`⏱️  Total time: ${duration}ms\n`);

    // Step 3: Query orders by session
    console.log('📝 Step 3: Query orders by session\n');

    const sessionOrders = await Order.find({
      session: session._id
    }).select('_id orderNumber session source customerName').lean();

    console.log(`💾 Orders found in database: ${sessionOrders.length}\n`);

    // Analyze
    const orderSessionIds = sessionOrders.map(o => o.session.toString());
    const uniqueOrderSessionIds = [...new Set(orderSessionIds)];

    console.log('🔍 Order Analysis:');
    console.log(`   Unique session IDs: ${uniqueOrderSessionIds.length}`);
    console.log(`   Expected session ID: ${session._id}\n`);

    sessionOrders.forEach((order, i) => {
      const match = order.session.toString() === session._id.toString() ? '✅' : '❌';
      console.log(`   ${match} Order ${i + 1}:`);
      console.log(`      Order Number: ${order.orderNumber}`);
      console.log(`      Session: ${order.session}`);
      console.log(`      Source: ${order.source}`);
      console.log(`      Customer: ${order.customerName}`);
      if (i < sessionOrders.length - 1) console.log('');
    });
    console.log('');

    // Verify no duplicate sessions created
    const allSessions = await DiningSession.find({
      table: testTable._id
    }).lean();

    console.log(`💾 Total sessions for this table: ${allSessions.length}`);
    allSessions.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s._id} (status: ${s.status})`);
    });
    console.log('');

    // Assertions
    expect(sessionOrders.length).toBe(5);
    expect(uniqueOrderSessionIds.length).toBe(1);
    expect(uniqueOrderSessionIds[0]).toBe(session._id.toString());
    expect(allSessions.length).toBe(1);
    
    sessionOrders.forEach(order => {
      expect(order.session.toString()).toBe(session._id.toString());
      expect(order.source).toBe('qr');
    });

    console.log('✅ TEST 2 PASSED: All orders linked to same session!\n');
  }, 30000);

  test('Mixed: Sessions + Orders simultaneously', async () => {
    console.log('🧪 TEST 3: Mixed Concurrent Sessions + Orders');
    console.log('============================================\n');

    console.log('📝 Scenario: 3 customers scan QR simultaneously, then all place orders\n');

    const startTime = Date.now();

    // Step 1: 3 customers scan QR simultaneously
    console.log('Step 1: 3 QR scans (getOrCreateActiveSession)\n');

    const sessionPromises = Array(3).fill(null).map((_, index) => {
      console.log(`  🚀 Customer ${index + 1}: Scanning QR...`);
      return SessionService.getOrCreateActiveSession({
        tableId: testTable._id
      });
    });

    const sessionResults = await Promise.all(sessionPromises);

    const newCount = sessionResults.filter(r => r.isNew).length;
    const reusedCount = sessionResults.filter(r => !r.isNew).length;

    console.log(`\n   ✅ New: ${newCount}, Reused: ${reusedCount}`);

    const sessionIds = sessionResults.map(r => r.session._id.toString());
    const uniqueSessionIds = [...new Set(sessionIds)];
    
    console.log(`   🔑 Unique sessions: ${uniqueSessionIds.length}`);
    console.log(`   📌 Session ID: ${uniqueSessionIds[0]}\n`);

    const sessionToken = sessionResults[0].session.token;

    // Step 2: All 3 customers place orders simultaneously
    console.log('Step 2: 3 simultaneous order placements\n');

    const orderPromises = sessionResults.map((result, index) => {
      console.log(`  🚀 Customer ${index + 1}: Placing order...`);
      return Order.create({
        merchant: testMerchant._id,
        branch: testBranch._id,
        table: testTable._id,
        tableNumber: testTable.tableNumber,
        session: result.session._id,
        orderType: 'dine_in',
        orderNumber: `#T1-${String(index + 1).padStart(3, '0')}`,
        source: 'qr',
        customerName: `Customer ${String.fromCharCode(65 + index)}`,
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Test Item',
          quantity: index + 1,
          price: 150,
          unitPrice: 150,
          totalPrice: 150 * (index + 1)
        }],
        subtotal: 150 * (index + 1),
        totalAmount: 150 * (index + 1),
        paymentStatus: 'unpaid',
        status: 'pending'
      });
    });

    const orders = await Promise.all(orderPromises);

    const endTime = Date.now();

    console.log(`\n   ✅ Orders created: ${orders.length}`);
    console.log(`   ⏱️  Total time: ${endTime - startTime}ms\n`);

    // Step 3: Verify final state
    console.log('Step 3: Verify final database state\n');

    const finalSessions = await DiningSession.find({
      table: testTable._id
    }).lean();

    const finalOrders = await Order.find({
      table: testTable._id
    }).select('orderNumber session source').lean();

    console.log('📊 FINAL STATE:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`💾 Sessions in database: ${finalSessions.length}`);
    finalSessions.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s._id} (status: ${s.status})`);
    });
    console.log('');

    console.log(`💾 Orders in database: ${finalOrders.length}`);
    finalOrders.forEach((o, i) => {
      const match = o.session.toString() === uniqueSessionIds[0] ? '✅' : '❌';
      console.log(`   ${match} ${o.orderNumber}: session=${o.session}, source=${o.source}`);
    });
    console.log('');

    // Assertions
    expect(finalSessions.length).toBe(1);
    expect(finalOrders.length).toBe(3);
    expect(uniqueSessionIds.length).toBe(1);
    
    finalOrders.forEach(order => {
      expect(order.session.toString()).toBe(uniqueSessionIds[0]);
      expect(order.source).toBe('qr');
    });

    console.log('✅ TEST 3 PASSED: Mixed concurrency handled correctly!\n');
  }, 30000);
});
