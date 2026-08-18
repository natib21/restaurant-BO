// tests/kds-integration.test.js
// ✅ PHASE 1: Full Order → Ticket → Order Ready integration test
const mongoose = require('mongoose');
const Order = require('../models/orderModel');
const KitchenTicket = require('../models/KitchenTicket');
const KitchenStation = require('../models/KitchenStation');
const OutboxEvent = require('../models/OutboxEvent');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Menu = require('../models/menuModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel'); // Required for Role.populate('tasks')
const { OrderStateMachineService } = require('../src/modules/order/service/OrderStateMachineService');
const KitchenTicketService = require('../src/modules/kitchen/service/KitchenTicketService');
const { handleOrderPreparing } = require('../src/infrastructure/outbox/handlers/kds-handler');
const { handleAllTicketsReady } = require('../src/infrastructure/outbox/handlers/order-ready-handler');

describe('KDS Integration: Order → Ticket → Order Ready Flow', () => {
  let merchant, branch, grillStation, friesStation, burger, fries, kitchenRole, kitchenUser, waiterRole, waiterUser;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant-test');
    }
  });

  beforeEach(async () => {
    // Clean up
    await Order.deleteMany({});
    await KitchenTicket.deleteMany({});
    await KitchenStation.deleteMany({});
    await OutboxEvent.deleteMany({});
    await Menu.deleteMany({});
    await User.deleteMany({});
    await Role.deleteMany({});
    await Merchant.deleteMany({});
    await Branch.deleteMany({});

    // Create test data
    merchant = await Merchant.create({
      businessName: 'Test Restaurant',
      slug: 'test-restaurant',
      status: 'approved',
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@test.com',
        phone: '+251912345678',
      },
    });

    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch',
      branchCode: 'MAIN',
      isActive: true,
      location: {
        city: 'Addis Ababa',
        coordinates: [9.0320, 38.7469],
      },
    });

    grillStation = await KitchenStation.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Grill',
      code: 'GRILL',
    });

    friesStation = await KitchenStation.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Fries',
      code: 'FRIES',
    });

    burger = await Menu.create({
      merchant: merchant._id,
      name: 'Burger',
      price: 10,
      category: 'main',
      kitchenStation: grillStation._id,
    });

    fries = await Menu.create({
      merchant: merchant._id,
      name: 'Fries',
      price: 5,
      category: 'side',
      kitchenStation: friesStation._id,
    });

    // Create Role first (uppercase name, min 10 char description, tasks array)
    const kitchenRole = await Role.create({
      name: 'KITCHEN-STAFF',
      description: 'Kitchen staff role for cooking and food preparation',
      tasks: [],
      isSystemRole: false,
    });

    kitchenUser = await User.create({
      firstName: 'Kitchen',
      name: 'Kitchen Staff',
      email: 'kitchen@test.com',
      phone: '+251912345678',
      password: 'Test1234!',
      passwordConfirm: 'Test1234!',
      merchant: merchant._id,
      branch: branch._id,
      role: kitchenRole._id,
    });

    // ✅ CRITICAL: Populate role immediately to prevent fail-open admin fallback
    await kitchenUser.populate('role');

    // Create waiter role and user for order acceptance
    const waiterRole = await Role.create({
      name: 'WAITER-STAFF',
      description: 'Waiter staff role for taking and serving orders',
      tasks: [],
      isSystemRole: false,
    });

    waiterUser = await User.create({
      firstName: 'Waiter',
      name: 'Waiter Staff',
      email: 'waiter@test.com',
      phone: '+251912345679',
      password: 'Test1234!',
      passwordConfirm: 'Test1234!',
      merchant: merchant._id,
      branch: branch._id,
      role: waiterRole._id,
    });

    // ✅ CRITICAL: Populate role immediately
    await waiterUser.populate('role');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('full lifecycle: order:preparing → tickets created → all ready → order:ready', async () => {
    // 1. Create order with 2 items (2 stations)
    const order = await Order.create({
      merchant: merchant._id,
      branch: branch._id,
      orderNumber: 'TEST-001',
      orderType: 'dine_in',
      source: 'admin',
      status: 'pending',
      customerName: 'Test Customer',
      table: branch._id, // Using branch as table ref for simplicity
      items: [
        {
          menuItem: burger._id,
          quantity: 1,
          unitPrice: 10,
          totalPrice: 10,
        },
        {
          menuItem: fries._id,
          quantity: 1,
          unitPrice: 5,
          totalPrice: 5,
        },
      ],
      subtotal: 15,
      totalAmount: 15,
      totalPrice: 15,
      customer: null,
    });

    console.log('✓ Step 1: Order created:', order._id.toString());
    console.log('  Order items with _id:', order.items.map(i => ({ _id: i._id?.toString(), menuItem: i.menuItem.toString() })));

    // 2. Transition to accepted (waiter accepts order)
    await OrderStateMachineService.transitionOrderStatus({
      orderId: order._id,
      toStatus: 'accepted',
      merchantQuery: { merchant: merchant._id },
      user: waiterUser, // Waiter role can accept orders
    });

    console.log('✓ Step 2: Order accepted by waiter');

    // 3. Transition to preparing (kitchen starts cooking)
    try {
      await OrderStateMachineService.transitionOrderStatus({
        orderId: order._id,
        toStatus: 'preparing',
        merchantQuery: { merchant: merchant._id },
        user: kitchenUser, // Kitchen role can start preparing
      });
      
      // Verify the order status was actually updated
      const updatedOrder = await Order.findById(order._id);
      console.log('✓ Step 3: Order transitioned to preparing by kitchen, actual status:', updatedOrder.status);
      
      if (updatedOrder.status !== 'preparing') {
        throw new Error(`Order status is '${updatedOrder.status}', expected 'preparing'`);
      }
    } catch (error) {
      console.error('❌ Step 3 FAILED:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    }

    // 4. Verify outbox event queued (give a moment for transaction to commit)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const preparingOutbox = await OutboxEvent.findOne({
      eventType: 'order:preparing',
      aggregateId: order._id,
    });

    if (!preparingOutbox) {
      // Debug: show all outbox events with full details
      const allOutbox = await OutboxEvent.find({}).sort({ createdAt: -1 });
      console.log('All outbox events:', allOutbox.map(e => ({ 
        eventType: e.eventType,  // Fixed: was 'type'
        aggId: e.aggregateId?.toString(),
        aggType: e.aggregateType,
        processingStatus: e.status,  // Fixed: renamed to avoid confusion
        created: e.createdAt
      })));
      
      console.log(`Looking for eventType='order:preparing' and aggregateId='${order._id.toString()}'`);
    }

    expect(preparingOutbox).toBeDefined();
    console.log('✓ Step 4: Outbox event queued:', preparingOutbox._id.toString());

    // 5. Process outbox (simulate worker)
    await handleOrderPreparing(preparingOutbox);

    console.log('✓ Step 5: Outbox handler executed');

    // 6. Verify tickets created
    const tickets = await KitchenTicket.find({ order: order._id });
    expect(tickets).toHaveLength(2); // 2 stations

    const grillTicket = tickets.find(t => t.station.toString() === grillStation._id.toString());
    const friesTicket = tickets.find(t => t.station.toString() === friesStation._id.toString());

    expect(grillTicket).toBeDefined();
    expect(friesTicket).toBeDefined();
    expect(grillTicket.status).toBe('pending');
    expect(friesTicket.status).toBe('pending');

    console.log('✓ Step 6: Tickets created:', {
      grill: grillTicket._id.toString(),
      fries: friesTicket._id.toString(),
    });

    // 7. Kitchen staff accepts and marks tickets ready
    await KitchenTicketService.transitionTicketStatus(
      grillTicket._id,
      'accepted',
      kitchenUser // _extractRoleCategory extracts 'kitchen' from role.name 'KITCHEN-STAFF'
    );

    await KitchenTicketService.transitionTicketStatus(
      grillTicket._id,
      'in_progress',
      kitchenUser
    );

    await KitchenTicketService.transitionTicketStatus(
      grillTicket._id,
      'ready',
      kitchenUser
    );

    console.log('✓ Step 7a: Grill ticket marked ready');

    // Second ticket ready
    await KitchenTicketService.transitionTicketStatus(
      friesTicket._id,
      'accepted',
      kitchenUser
    );

    await KitchenTicketService.transitionTicketStatus(
      friesTicket._id,
      'in_progress',
      kitchenUser
    );

    await KitchenTicketService.transitionTicketStatus(
      friesTicket._id,
      'ready',
      kitchenUser
    );

    console.log('✓ Step 7b: Fries ticket marked ready');

    // 8. Verify order:ready rollup event queued
    const readyOutbox = await OutboxEvent.findOne({
      eventType: 'kitchen:all_tickets_ready',
      aggregateId: order._id,
    });

    expect(readyOutbox).toBeDefined();
    console.log('✓ Step 8: Ready rollup outbox event queued:', readyOutbox._id.toString());

    // 9. Process outbox
    await handleAllTicketsReady(readyOutbox);

    console.log('✓ Step 9: Ready rollup handler executed');

    // 10. Verify order transitioned to ready
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.status).toBe('ready');

    console.log('✓ Step 10: Order status:', updatedOrder.status);
    console.log('\n✅ FULL INTEGRATION TEST PASSED\n');
  });
});
