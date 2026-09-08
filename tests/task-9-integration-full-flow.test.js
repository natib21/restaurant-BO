/**
 * Task 9: Additional Integration Tests
 * 
 * End-to-end integration tests verifying complete dining session flow:
 * 1. Multiple customers at same table (QR + staff orders)
 * 2. Payment flow integration
 * 3. Table lifecycle (available → occupied → needs-cleaning)
 * 4. Session data consistency across all operations
 * 5. Mixed source orders (QR + staff) in same session
 */

const mongoose = require('mongoose');
const { SessionService } = require('../src/modules/sessions/service/SessionService');
const DiningSession = require('../models/DiningSession');
const Table = require('../models/tabelModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Order = require('../models/orderModel');

describe('Task 9: Full Integration Tests', () => {
  let merchant, branch, table1, table2;
  
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test-integration', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  });
  
  afterAll(async () => {
    await mongoose.connection.close();
  });
  
  beforeEach(async () => {
    // Clear all collections
    await DiningSession.deleteMany({});
    await Table.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
    await Order.deleteMany({});
    
    // Create test data
    merchant = await Merchant.create({
      businessName: 'Integration Test Restaurant',
      slug: 'integration-test',
      email: 'test@integration.com',
      phone: '+251911000000',
      address: { city: 'Addis Ababa', country: 'Ethiopia' },
      businessType: 'restaurant',
      supportedPaymentMethods: ['cash', 'card']
    });
    
    branch = await Branch.create({
      name: 'Main Branch',
      merchant: merchant._id,
      location: {
        type: 'Point',
        coordinates: [38.7578, 9.0192],
        city: 'Addis Ababa'
      },
      address: { city: 'Addis Ababa', country: 'Ethiopia' },
      phone: '+251911000001',
      isActive: true
    });
    
    table1 = await Table.create({
      tableNumber: 'T-201',
      capacity: 4,
      section: 'Main Hall',
      merchant: merchant._id,
      branch: branch._id,
      qrCode: 'QR-T201',
      status: 'available',
      isActive: true
    });
    
    table2 = await Table.create({
      tableNumber: 'T-202',
      capacity: 2,
      section: 'Patio',
      merchant: merchant._id,
      branch: branch._id,
      qrCode: 'QR-T202',
      status: 'available',
      isActive: true
    });
  });
  
  describe('End-to-End: Multiple Customers at Same Table', () => {
    test('Complete flow: 3 customers scan QR → order → pay → close table', async () => {
      console.log('\n🧪 TEST: Complete multi-customer flow at single table\n');
      
      // ========== STEP 1: Customer A scans QR ==========
      console.log('📱 Customer A scans QR code...');
      const { session: sessionA, isNew: isNewA } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      expect(isNewA).toBe(true);
      expect(sessionA.status).toBe('active');
      console.log(`   ✅ New session created: ${sessionA._id}`);
      
      // Customer A places order
      const orderA = await Order.create({
        orderNumber: 'ORD-A-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: sessionA._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Customer A',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Burger',
          quantity: 1,
          unitPrice: 150,
          totalPrice: 150
        }],
        subtotal: 150,
        totalAmount: 150,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
      console.log(`   ✅ Order placed: ${orderA.orderNumber} (150 ETB)`);
      
      // Verify table is occupied
      const updatedTable1 = await Table.findById(table1._id);
      expect(updatedTable1.status).toBe('occupied');
      
      // ========== STEP 2: Customer B scans SAME QR ==========
      console.log('\n📱 Customer B scans same QR code...');
      const { session: sessionB, isNew: isNewB } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      expect(isNewB).toBe(false);
      expect(sessionB._id.toString()).toBe(sessionA._id.toString());
      console.log(`   ✅ Reused existing session: ${sessionB._id}`);
      
      // Customer B places order
      const orderB = await Order.create({
        orderNumber: 'ORD-B-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: sessionB._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Customer B',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Pizza',
          quantity: 1,
          unitPrice: 200,
          totalPrice: 200
        }],
        subtotal: 200,
        totalAmount: 200,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
      console.log(`   ✅ Order placed: ${orderB.orderNumber} (200 ETB)`);
      
      // ========== STEP 3: Staff adds order for Customer C ==========
      console.log('\n👨‍🍳 Staff adds order for Customer C at same table...');
      const staffId = new mongoose.Types.ObjectId();
      const { session: sessionC, isNew: isNewC } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id,
        createdBy: staffId
      });
      
      expect(isNewC).toBe(false);
      expect(sessionC._id.toString()).toBe(sessionA._id.toString());
      console.log(`   ✅ Reused same session: ${sessionC._id}`);
      
      const orderC = await Order.create({
        orderNumber: 'ORD-C-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: sessionC._id,
        orderType: 'dine_in',
        source: 'staff',
        customerName: 'Customer C',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Salad',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
      console.log(`   ✅ Order placed: ${orderC.orderNumber} (100 ETB)`);
      
      // ========== STEP 4: Verify session state ==========
      console.log('\n📊 Verifying session state...');
      const allOrders = await SessionService.getSessionOrders(sessionA._id);
      expect(allOrders).toHaveLength(3);
      
      const qrOrders = allOrders.filter(o => o.source === 'qr');
      const staffOrders = allOrders.filter(o => o.source === 'staff');
      expect(qrOrders).toHaveLength(2);
      expect(staffOrders).toHaveLength(1);
      
      const totalAmount = allOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      expect(totalAmount).toBe(450); // 150 + 200 + 100
      console.log(`   ✅ 3 orders in session, total: ${totalAmount} ETB`);
      
      // ========== STEP 5: Customers pay their orders ==========
      console.log('\n💰 Customers paying their orders...');
      orderA.paymentStatus = 'paid';
      orderA.status = 'completed';
      await orderA.save();
      console.log(`   ✅ ${orderA.orderNumber} paid`);
      
      orderB.paymentStatus = 'paid';
      orderB.status = 'completed';
      await orderB.save();
      console.log(`   ✅ ${orderB.orderNumber} paid`);
      
      orderC.paymentStatus = 'paid';
      orderC.status = 'completed';
      await orderC.save();
      console.log(`   ✅ ${orderC.orderNumber} paid`);
      
      // ========== STEP 6: Staff closes table ==========
      console.log('\n🔒 Staff closes table...');
      const endedSession = await SessionService.endSession({
        sessionId: sessionA._id,
        closedBy: staffId,
        force: false
      });
      
      expect(endedSession.status).toBe('ended');
      expect(endedSession.endedAt).toBeDefined();
      console.log(`   ✅ Session ended: ${endedSession._id}`);
      console.log(`   Duration: ${endedSession.getDurationFormatted()}`);
      
      // Verify table status changed
      const finalTable1 = await Table.findById(table1._id);
      expect(finalTable1.status).toBe('needs-cleaning');
      console.log(`   ✅ Table status: ${finalTable1.status}`);
      
      // ========== STEP 7: Verify final session summary ==========
      const summary = await SessionService.getSessionSummary(sessionA._id);
      expect(summary).toMatchObject({
        status: 'ended',
        orderCount: 3,
        totalAmount: 450,
        paidOrders: 3,
        unpaidOrders: 0,
        qrOrders: 2,
        staffOrders: 1
      });
      console.log('\n📋 Final Summary:');
      console.log(`   Orders: ${summary.orderCount}`);
      console.log(`   Total: ${summary.totalAmount} ETB`);
      console.log(`   QR: ${summary.qrOrders}, Staff: ${summary.staffOrders}`);
      console.log('   ✅ Complete flow successful!\n');
    });
    
    test('Session isolation: Different tables have different sessions', async () => {
      console.log('\n🧪 TEST: Session isolation between tables\n');
      
      // Customer at table 1
      const { session: session1 } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      const order1 = await Order.create({
        orderNumber: 'T1-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: session1._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Table 1 Customer',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item 1',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
      
      // Customer at table 2
      const { session: session2 } = await SessionService.getOrCreateActiveSession({
        tableId: table2._id
      });
      
      const order2 = await Order.create({
        orderNumber: 'T2-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table2._id,
        session: session2._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Table 2 Customer',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item 2',
          quantity: 1,
          unitPrice: 200,
          totalPrice: 200
        }],
        subtotal: 200,
        totalAmount: 200,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
      
      // Verify sessions are different
      expect(session1._id.toString()).not.toBe(session2._id.toString());
      console.log(`✅ Table 1 session: ${session1._id}`);
      console.log(`✅ Table 2 session: ${session2._id}`);
      
      // Verify orders are in correct sessions
      const table1Orders = await SessionService.getSessionOrders(session1._id);
      const table2Orders = await SessionService.getSessionOrders(session2._id);
      
      expect(table1Orders).toHaveLength(1);
      expect(table2Orders).toHaveLength(1);
      expect(table1Orders[0]._id.toString()).toBe(order1._id.toString());
      expect(table2Orders[0]._id.toString()).toBe(order2._id.toString());
      console.log('✅ Orders correctly isolated per session\n');
    });
  });
  
  describe('Payment Flow Integration', () => {
    test('Cannot close session with unpaid orders (unless forced)', async () => {
      console.log('\n🧪 TEST: Payment validation on session close\n');
      
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      // Create unpaid order
      await Order.create({
        orderNumber: 'ORD-UNPAID',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: session._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Customer',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
      
      const staffId = new mongoose.Types.ObjectId();
      
      // Attempt to close without force
      await expect(
        SessionService.endSession({
          sessionId: session._id,
          closedBy: staffId,
          force: false
        })
      ).rejects.toThrow('Cannot close session: 1 unpaid order(s) remaining');
      console.log('✅ Prevented closing with unpaid orders');
      
      // Close with force
      const endedSession = await SessionService.endSession({
        sessionId: session._id,
        closedBy: staffId,
        force: true
      });
      
      expect(endedSession.status).toBe('ended');
      console.log('✅ Force close successful\n');
    });
    
    test('Partial payment scenario', async () => {
      console.log('\n🧪 TEST: Partial payment handling\n');
      
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      // Order 1: Paid
      await Order.create({
        orderNumber: 'ORD-PAID',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: session._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Customer A',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item 1',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        status: 'completed',
        paymentStatus: 'paid'
      });
      
      // Order 2: Unpaid
      await Order.create({
        orderNumber: 'ORD-UNPAID',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: session._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Customer B',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item 2',
          quantity: 1,
          unitPrice: 200,
          totalPrice: 200
        }],
        subtotal: 200,
        totalAmount: 200,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
      
      // Check if has unpaid orders
      const hasUnpaid = await SessionService.hasUnpaidOrders(session._id);
      expect(hasUnpaid).toBe(true);
      console.log('✅ Detected unpaid orders in session');
      
      const summary = await SessionService.getSessionSummary(session._id);
      expect(summary.paidOrders).toBe(1);
      expect(summary.unpaidOrders).toBe(1);
      console.log(`✅ Summary: ${summary.paidOrders} paid, ${summary.unpaidOrders} unpaid\n`);
    });
  });
  
  describe('Table Lifecycle Management', () => {
    test('Table status transitions: available → occupied → needs-cleaning', async () => {
      console.log('\n🧪 TEST: Table status lifecycle\n');
      
      // Initial state
      expect(table1.status).toBe('available');
      console.log(`1️⃣ Initial: ${table1.status}`);
      
      // Create session (table becomes occupied)
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      const checkTable1 = await Table.findById(table1._id);
      expect(checkTable1.status).toBe('occupied');
      console.log(`2️⃣ After session: ${checkTable1.status}`);
      
      // Place and pay order
      const order = await Order.create({
        orderNumber: 'ORD-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: session._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Customer',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        status: 'completed',
        paymentStatus: 'paid'
      });
      
      // Close session (table becomes needs-cleaning)
      await SessionService.endSession({
        sessionId: session._id,
        closedBy: new mongoose.Types.ObjectId(),
        force: false
      });
      
      const finalTable1 = await Table.findById(table1._id);
      expect(finalTable1.status).toBe('needs-cleaning');
      console.log(`3️⃣ After close: ${finalTable1.status}`);
      console.log('✅ Complete lifecycle verified\n');
    });
    
    test('Multiple session cycles at same table', async () => {
      console.log('\n🧪 TEST: Multiple session cycles\n');
      
      // === Session 1 ===
      const { session: session1 } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      const order1 = await Order.create({
        orderNumber: 'SESSION1-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: session1._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Session 1 Customer',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        status: 'completed',
        paymentStatus: 'paid'
      });
      
      await SessionService.endSession({
        sessionId: session1._id,
        closedBy: new mongoose.Types.ObjectId(),
        force: false
      });
      console.log('✅ Session 1 completed');
      
      // Mark table available again (simulating cleaning)
      table1.status = 'available';
      await table1.save();
      
      // === Session 2 ===
      const { session: session2 } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      // Should be new session
      expect(session2._id.toString()).not.toBe(session1._id.toString());
      console.log('✅ Session 2 created (different from Session 1)');
      
      const order2 = await Order.create({
        orderNumber: 'SESSION2-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: session2._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Session 2 Customer',
        items: [{
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item',
          quantity: 1,
          unitPrice: 200,
          totalPrice: 200
        }],
        subtotal: 200,
        totalAmount: 200,
        status: 'completed',
        paymentStatus: 'paid'
      });
      
      // Verify session isolation
      const session1Orders = await SessionService.getSessionOrders(session1._id);
      const session2Orders = await SessionService.getSessionOrders(session2._id);
      
      expect(session1Orders).toHaveLength(1);
      expect(session2Orders).toHaveLength(1);
      expect(session1Orders[0].orderNumber).toBe('SESSION1-001');
      expect(session2Orders[0].orderNumber).toBe('SESSION2-001');
      console.log('✅ Orders correctly isolated across sessions\n');
    });
  });
  
  describe('Data Consistency', () => {
    test('All orders in session have correct references', async () => {
      console.log('\n🧪 TEST: Data consistency across operations\n');
      
      const { session } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      // Create multiple orders
      const orders = await Order.create([
        {
          orderNumber: 'ORD-001',
          merchant: merchant._id,
          branch: branch._id,
          table: table1._id,
          session: session._id,
          orderType: 'dine_in',
          source: 'qr',
          customerName: 'Customer 1',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item 1', quantity: 1, unitPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          totalAmount: 100,
          status: 'pending',
          paymentStatus: 'unpaid'
        },
        {
          orderNumber: 'ORD-002',
          merchant: merchant._id,
          branch: branch._id,
          table: table1._id,
          session: session._id,
          orderType: 'dine_in',
          source: 'staff',
          customerName: 'Customer 2',
          items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item 2', quantity: 1, unitPrice: 200, totalPrice: 200 }],
          subtotal: 200,
          totalAmount: 200,
          status: 'pending',
          paymentStatus: 'unpaid'
        }
      ]);
      
      // Verify all orders have correct references
      for (const order of orders) {
        expect(order.session.toString()).toBe(session._id.toString());
        expect(order.table.toString()).toBe(table1._id.toString());
        expect(order.branch.toString()).toBe(branch._id.toString());
        expect(order.merchant.toString()).toBe(merchant._id.toString());
        expect(order.orderType).toBe('dine_in');
      }
      console.log('✅ All orders have correct references');
      
      // Verify session has correct references
      expect(session.table.toString()).toBe(table1._id.toString());
      expect(session.branch.toString()).toBe(branch._id.toString());
      expect(session.merchant.toString()).toBe(merchant._id.toString());
      console.log('✅ Session has correct references\n');
    });
    
    test('Session token uniqueness', async () => {
      console.log('\n🧪 TEST: Session tokens are unique\n');
      
      const { session: session1 } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      const { session: session2 } = await SessionService.getOrCreateActiveSession({
        tableId: table2._id
      });
      
      expect(session1.token).toBeDefined();
      expect(session2.token).toBeDefined();
      expect(session1.token).not.toBe(session2.token);
      expect(session1.token.length).toBe(64); // 32 bytes = 64 hex chars
      console.log(`✅ Session 1 token: ${session1.token.substring(0, 16)}...`);
      console.log(`✅ Session 2 token: ${session2.token.substring(0, 16)}...`);
      console.log('✅ Tokens are unique\n');
    });
  });
  
  describe('Branch-Level Operations', () => {
    test('Get all active sessions for a branch', async () => {
      console.log('\n🧪 TEST: Branch-level session listing\n');
      
      // Create sessions at both tables
      const { session: session1 } = await SessionService.getOrCreateActiveSession({
        tableId: table1._id
      });
      
      const { session: session2 } = await SessionService.getOrCreateActiveSession({
        tableId: table2._id
      });
      
      // Get all active sessions for branch
      const activeSessions = await SessionService.getActiveSessions(branch._id);
      
      expect(activeSessions).toHaveLength(2);
      const sessionIds = activeSessions.map(s => s._id.toString());
      expect(sessionIds).toContain(session1._id.toString());
      expect(sessionIds).toContain(session2._id.toString());
      console.log(`✅ Found ${activeSessions.length} active sessions in branch`);
      
      // Close one session
      await Order.create({
        orderNumber: 'ORD-001',
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        session: session1._id,
        orderType: 'dine_in',
        source: 'qr',
        customerName: 'Customer',
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
        subtotal: 100,
        totalAmount: 100,
        status: 'completed',
        paymentStatus: 'paid'
      });
      
      await SessionService.endSession({
        sessionId: session1._id,
        closedBy: new mongoose.Types.ObjectId(),
        force: false
      });
      
      // Should now have only 1 active session
      const activeSessionsAfter = await SessionService.getActiveSessions(branch._id);
      expect(activeSessionsAfter).toHaveLength(1);
      expect(activeSessionsAfter[0]._id.toString()).toBe(session2._id.toString());
      console.log(`✅ After closing, ${activeSessionsAfter.length} active session remains\n`);
    });
  });
});
