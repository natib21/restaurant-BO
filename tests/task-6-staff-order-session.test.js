/**
 * Task 6 Verification: Staff Order Creation with Dining Sessions
 * 
 * Verifies that staff-created dine-in orders:
 * 1. Create/reuse dining sessions
 * 2. Link orders to sessions correctly
 * 3. Don't create sessions for takeaway/delivery orders
 */

const mongoose = require('mongoose');
const { OrderService } = require('../src/modules/order/service/OrderService');
const { SessionService } = require('../src/modules/sessions/service/SessionService');
const DiningSession = require('../models/DiningSession');
const Order = require('../models/orderModel');
const Table = require('../models/tabelModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const User = require('../models/userModel');
const Ingredient = require('../models/Ingredient');
const OrderFlowConfig = require('../models/OrderFlowConfig');
const Role = require('../models/roleModel');
const Category = require('../models/Category');

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

describe('Task 6: Staff Order Creation with Sessions', () => {
  let testMerchant;
  let testBranch;
  let testTable;
  let testMenuItem;
  let testStaffId; // Just use an ObjectId instead of a real User
  let testIngredient;

  beforeEach(async () => {
    console.log('\n🧹 Cleaning database...');
    await Order.deleteMany({});
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await MenuItem.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
    await Ingredient.deleteMany({});
    await OrderFlowConfig.deleteMany({});
    await Category.deleteMany({});

    // Create test merchant
    testMerchant = await Merchant.create({
      businessName: 'Test Restaurant',
      slug: 'test-restaurant',
      email: 'test@restaurant.com',
      phone: '+251911000000',
      businessLicenseNumber: 'TEST123'
    });

    // Create test branch
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

    // Create test table
    testTable = await Table.create({
      tableNumber: 'T1',
      capacity: 4,
      merchant: testMerchant._id,
      branch: testBranch._id,
      status: 'available',
      isActive: true
    });

    // Create test ingredient (for inventory)
    testIngredient = await Ingredient.create({
      name: 'Test Ingredient',
      merchant: testMerchant._id,
      branch: testBranch._id,
      unit: 'kg',
      currentStock: 1000,
      minStockLevel: 10,
      costPerUnit: 5
    });

    // Create category (required for MenuItem)
    const testCategory = await Category.create({
      merchant: testMerchant._id,
      name: { en: 'Test Category', am: 'Test Category' },
      isActive: true
    });

    // Create test menu item (simplified - no recipe needed for this test)
    testMenuItem = await MenuItem.create({
      merchant: testMerchant._id,
      branch: testBranch._id,
      categoryId: testCategory._id,
      name: { en: 'Test Dish', am: 'Test Dish' },
      type: 'food',
      price: 150,
      available: true,
      publishStatus: 'published',
      inStock: true
    });

    // Create a simple staff ID (no need for full User model in this test)
    testStaffId = new mongoose.Types.ObjectId();

    // Create order flow config (auto-accept waiter orders)
    await OrderFlowConfig.create({
      merchant: testMerchant._id,
      channels: {
        waiter: { requiresReview: false }
      }
    });

    console.log('✅ Test data created');
    console.log(`   Merchant: ${testMerchant._id}`);
    console.log(`   Branch: ${testBranch._id}`);
    console.log(`   Table: ${testTable._id} (${testTable.tableNumber})`);
    console.log(`   Staff ID: ${testStaffId}\n`);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await MenuItem.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
    await Ingredient.deleteMany({});
    await OrderFlowConfig.deleteMany({});
    await Category.deleteMany({});
  });

  test('Staff dine-in order creates dining session', async () => {
    console.log('🧪 TEST: Staff dine-in order creates dining session');
    console.log('═══════════════════════════════════════════════════\n');

    console.log('📝 Creating staff dine-in order...\n');

    const order = await OrderService.staffPlaceOrder({
      items: [{ menuItemId: testMenuItem._id.toString(), quantity: 2 }],
      tableId: testTable._id.toString(),
      orderType: 'dine_in',
      customerName: 'John Doe',
      branchId: testBranch._id.toString(),
      merchantId: testMerchant._id.toString(),
      performedBy: testStaffId,
      performedByName: 'Test Staff',
      source: 'waiter'
    }, {});

    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Order Created:');
    console.log(`   Order ID: ${order._id}`);
    console.log(`   Order Number: ${order.orderNumber}`);
    console.log(`   Order Type: ${order.orderType}`);
    console.log(`   Source: ${order.source}`);
    console.log(`   Session: ${order.session || 'NULL'}`);
    console.log(`   Table: ${order.table}`);
    console.log(`   Status: ${order.status}\n`);

    // Verify session exists
    const sessions = await DiningSession.find({ table: testTable._id }).lean();
    console.log(`💾 Dining Sessions: ${sessions.length}`);
    if (sessions.length > 0) {
      sessions.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s._id} (status: ${s.status}, createdBy: ${s.createdBy})`);
      });
    }
    console.log('');

    // Verify table status
    const table = await Table.findById(testTable._id);
    console.log(`🪑 Table Status: ${table.status}\n`);

    // Assertions
    expect(order.session).toBeDefined();
    expect(order.session).not.toBeNull();
    expect(sessions.length).toBe(1);
    expect(sessions[0]._id.toString()).toBe(order.session.toString());
    expect(sessions[0].createdBy.toString()).toBe(testStaffId.toString());
    expect(sessions[0].status).toBe('active');
    expect(table.status).toBe('occupied');

    console.log('✅ TEST PASSED: Session created and linked!\n');
  }, 30000);

  test('Multiple staff orders reuse same dining session', async () => {
    console.log('🧪 TEST: Multiple staff orders reuse same session');
    console.log('═══════════════════════════════════════════════════\n');

    console.log('📝 Creating 3 staff orders for same table...\n');

    const orders = [];
    for (let i = 0; i < 3; i++) {
      console.log(`   🚀 Creating order ${i + 1}...`);
      const order = await OrderService.staffPlaceOrder({
        items: [{ menuItemId: testMenuItem._id.toString(), quantity: 1 }],
        tableId: testTable._id.toString(),
        orderType: 'dine_in',
        customerName: `Customer ${String.fromCharCode(65 + i)}`,
        branchId: testBranch._id.toString(),
        merchantId: testMerchant._id.toString(),
        performedBy: testStaffId,
        performedByName: 'Test Staff',
        source: 'waiter'
      }, {});
      orders.push(order);
    }

    console.log('\n📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`✅ Orders created: ${orders.length}\n`);

    // Extract session IDs
    const sessionIds = orders.map(o => o.session.toString());
    const uniqueSessions = [...new Set(sessionIds)];

    console.log('🔍 Session Analysis:');
    console.log(`   Unique sessions: ${uniqueSessions.length}`);
    console.log(`   Session ID: ${uniqueSessions[0]}\n`);

    orders.forEach((o, i) => {
      const match = o.session.toString() === uniqueSessions[0] ? '✅' : '❌';
      console.log(`   ${match} Order ${i + 1}: ${o.orderNumber} → session ${o.session}`);
    });
    console.log('');

    // Verify database
    const dbSessions = await DiningSession.find({ table: testTable._id }).lean();
    const dbOrders = await Order.find({ table: testTable._id }).lean();

    console.log(`💾 Database State:`);
    console.log(`   Sessions: ${dbSessions.length}`);
    console.log(`   Orders: ${dbOrders.length}`);
    console.log('');

    // Assertions
    expect(uniqueSessions.length).toBe(1);
    expect(dbSessions.length).toBe(1);
    expect(dbOrders.length).toBe(3);
    
    orders.forEach(order => {
      expect(order.session.toString()).toBe(uniqueSessions[0]);
    });

    console.log('✅ TEST PASSED: All orders reuse same session!\n');
  }, 30000);

  test('Staff takeaway order does NOT create dining session', async () => {
    console.log('🧪 TEST: Takeaway orders have no session');
    console.log('═══════════════════════════════════════════════════\n');

    console.log('📝 Creating staff takeaway order...\n');

    const order = await OrderService.staffPlaceOrder({
      items: [{ menuItemId: testMenuItem._id.toString(), quantity: 1 }],
      orderType: 'takeaway',
      customerName: 'Takeaway Customer',
      branchId: testBranch._id.toString(),
      merchantId: testMerchant._id.toString(),
      performedBy: testStaffId,
      performedByName: 'Test Staff',
      source: 'waiter'
    }, {});

    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Order Created:');
    console.log(`   Order Number: ${order.orderNumber}`);
    console.log(`   Order Type: ${order.orderType}`);
    console.log(`   Session: ${order.session || 'NULL'}`);
    console.log(`   Table: ${order.table || 'NULL'}\n`);

    // Check sessions
    const sessions = await DiningSession.find({ branch: testBranch._id }).lean();
    console.log(`💾 Total dining sessions: ${sessions.length}\n`);

    // Assertions
    expect(order.session).toBeNull();
    expect(order.table).toBeNull();
    expect(sessions.length).toBe(0);

    console.log('✅ TEST PASSED: Takeaway has no session!\n');
  }, 30000);

  test('Staff can add order to existing customer session', async () => {
    console.log('🧪 TEST: Staff adds order to existing customer session');
    console.log('═══════════════════════════════════════════════════\n');

    console.log('📝 Step 1: Customer scans QR (creates session)...\n');

    // Customer creates session via QR
    const { session: customerSession } = await SessionService.getOrCreateActiveSession({
      tableId: testTable._id
    });

    console.log(`   ✅ Customer session: ${customerSession._id}\n`);

    console.log('📝 Step 2: Staff creates order for same table...\n');

    // Staff creates order (should reuse session)
    const staffOrder = await OrderService.staffPlaceOrder({
      items: [{ menuItemId: testMenuItem._id.toString(), quantity: 1 }],
      tableId: testTable._id.toString(),
      orderType: 'dine_in',
      customerName: 'Staff Order',
      branchId: testBranch._id.toString(),
      merchantId: testMerchant._id.toString(),
      performedBy: testStaffId,
      performedByName: 'Test Staff',
      source: 'waiter'
    }, {});

    console.log('📊 RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🔍 Session Comparison:');
    console.log(`   Customer session: ${customerSession._id}`);
    console.log(`   Staff order session: ${staffOrder.session}`);
    console.log(`   Match: ${customerSession._id.toString() === staffOrder.session.toString() ? '✅ YES' : '❌ NO'}\n`);

    // Verify database
    const allSessions = await DiningSession.find({ table: testTable._id }).lean();
    const allOrders = await Order.find({ table: testTable._id }).lean();

    console.log('💾 Database State:');
    console.log(`   Total sessions: ${allSessions.length}`);
    console.log(`   Total orders: ${allOrders.length}`);
    console.log(`   Session creator: ${allSessions[0].createdBy ? 'Staff' : 'Customer (QR)'}\n`);

    // Assertions
    expect(staffOrder.session.toString()).toBe(customerSession._id.toString());
    expect(allSessions.length).toBe(1);
    expect(allOrders.length).toBe(1);

    console.log('✅ TEST PASSED: Staff reused customer session!\n');
  }, 30000);
});
