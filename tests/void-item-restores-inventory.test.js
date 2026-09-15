/**
 * @file tests/void-item-restores-inventory.test.js
 * @description Test that refundOrderItems is called with proper validation when void happens
 * 
 * Integration test: demonstrates void→refund flow with safety check
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

// Models
const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');
const Order = require('../models/orderModel');
const StockHistory = require('../models/StockHistory');
const User = require('../models/userModel');
const Role = require('../models/roleModel');

// Services
const { InventoryService } = require('../src/modules/inventory');

describe('INTEGRATION: Void Item Flow Calls Refund with Validation', () => {
  let merchant, branch;
  let ingredientChicken;
  let waiterUser, waiterRole;
  let merchantId, branchId;

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Register Task model
    require('../models/taskModel');
    mongoose.model('Task', require('../models/taskModel').schema || require('../models/taskModel'));

    // Clean up
    await Promise.all([
      Merchant.deleteMany({}),
      Branch.deleteMany({}),
      Ingredient.deleteMany({}),
      Order.deleteMany({}),
      StockHistory.deleteMany({}),
      User.deleteMany({}),
      Role.deleteMany({}),
    ]);

    // Create merchant WITH inventory enabled
    merchant = await Merchant.create({
      businessName: 'Void Integration Test',
      slug: 'void-int-test-' + Date.now(),
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@void-int.com',
        phone: '+251911234567',
      },
      phone: '+251911234567',
      features: {
        core: { menu: { enabled: true } },
        optional: {
          inventory: { enabled: true },
          orders: { enabled: true },
        },
      },
    });
    merchantId = merchant._id;

    // Create branch
    branch = await Branch.create({
      merchant: merchantId,
      name: 'Void Int Test Branch',
      city: 'Addis Ababa',
      location: {
        type: 'Point',
        coordinates: [9.0320, 38.7469],
        city: 'Addis Ababa',
      },
    });
    branchId = branch._id;

    // Create ingredient
    ingredientChicken = await Ingredient.create({
      merchant: merchantId,
      branch: branchId,
      name: 'Chicken',
      unit: 'kg',
      currentStock: 100,
      category: 'meat',
      costPerUnit: 10,
    });

    // Create waiter
    waiterRole = await Role.create({
      name: 'Waiter',
      merchant: merchantId,
      isSystemRole: false,
      tasks: [],
    });

    waiterUser = await User.create({
      merchant: merchantId,
      email: `waiter-void-${Date.now()}@test.com`,
      firstName: 'Waiter',
      lastName: 'Test',
      phone: `+251911${String(Date.now()).slice(-6)}`,
      password: 'TestPass123!',
      passwordConfirm: 'TestPass123!',
      role: waiterRole._id,
      isActive: true,
    });
  });

  test('✅ Void flow: refund restores stock via safety-validated refundOrderItems()', async () => {
    console.log('\n🧪 TEST: Void → refundOrderItems with validation');

    // Create an order
    const order = await Order.create({
      merchant: merchantId,
      branch: branchId,
      orderNumber: 'VOID-INT-001',
      customerName: 'Test',
      orderType: 'takeaway',
      items: [{
        menuItem: new mongoose.Types.ObjectId(),
        name: 'Test Item',
        quantity: 1,
        unitPrice: 250,
        totalPrice: 250,
      }],
      subtotal: 250,
      totalAmount: 250,
      status: 'pending',
    });

    // Record 1kg deduction
    console.log('\n  Step 1: Simulate order placement (1kg deducted)');
    await StockHistory.create({
      merchant: merchantId,
      branch: branchId,
      ingredient: ingredientChicken._id,
      action: 'USED',
      quantity: 1,
      stockBefore: 100,
      stockAfter: 99,
      reason: 'Order placement',
      orderId: order._id,
      recordedBy: waiterUser._id,
    });

    await Ingredient.findByIdAndUpdate(ingredientChicken._id, { currentStock: 99 });
    let stock = await Ingredient.findById(ingredientChicken._id);
    console.log(`    Stock: ${stock.currentStock} kg`);

    // This is what the void handler does:
    console.log('\n  Step 2: Void handler calls refundOrderItems()');
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const deductions = await StockHistory.find(
          { orderId: order._id, action: 'USED' },
          null,
          { session }
        );

        if (deductions && deductions.length > 0) {
          const itemsToRefund = deductions.map(d => ({
            ingredientId: d.ingredient,
            quantity: d.quantity,
          }));

          console.log(`    Calling refundOrderItems with validated: ${itemsToRefund[0].quantity} kg`);

          const result = await InventoryService.refundOrderItems(
            order._id,
            merchantId,
            branchId,
            itemsToRefund,
            'Order item voided',
            waiterUser._id,
            session
          );

          console.log(`    ✅ Refund accepted by safety check`);
          console.log(`    Result: ${result.reversals[0].newStock} kg current stock`);
        }
      });
    } finally {
      session.endSession();
    }

    // Verify stock restored
    console.log('\n  Step 3: Verify stock restored');
    stock = await Ingredient.findById(ingredientChicken._id);
    console.log(`    Stock: ${stock.currentStock} kg (expected 100)`);
    expect(stock.currentStock).toBe(100);

    // Verify audit trail
    const released = await StockHistory.findOne({
      orderId: order._id,
      action: 'RELEASED',
    });
    console.log(`\n  Step 4: Verify RELEASED entry in StockHistory`);
    console.log(`    RELEASED reason: "${released.reason}"`);
    expect(released).toBeTruthy();
    expect(released.quantity).toBe(1);

    console.log(`\n✅ TEST PASSED — Void→Refund integration with safety validation complete`);
  });
});

