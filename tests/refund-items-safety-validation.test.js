/**
 * @file tests/refund-items-safety-validation.test.js
 * @description Test safety validation in refundOrderItems() — rejects over-refunds
 * 
 * Tests:
 * 1. Valid refund restores exact deducted quantity
 * 2. Over-refund is REJECTED (not silently clamped or allowed)
 * 3. Partial refund (less than deducted) is allowed
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

// Models
const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');
const Order = require('../models/orderModel');
const StockHistory = require('../models/StockHistory');

// Services
const { OrderService } = require('../src/modules/order/service/OrderService');
const { InventoryService } = require('../src/modules/inventory');

describe('SAFETY: refundOrderItems() Validates Refund Amounts', () => {
  let merchant, branch;
  let ingredientChicken;
  let merchantId, branchId, orderId;
  let orderData;

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up
    await Promise.all([
      Merchant.deleteMany({}),
      Branch.deleteMany({}),
      Ingredient.deleteMany({}),
      Recipe.deleteMany({}),
      Order.deleteMany({}),
      StockHistory.deleteMany({}),
    ]);

    // Create merchant WITH inventory enabled
    merchant = await Merchant.create({
      businessName: 'Refund Test Merchant',
      slug: 'refund-test-' + Date.now(),
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@refund.com',
        phone: '+251911234567',
      },
      phone: '+251911234567',
      features: {
        core: {
          menu: { enabled: true },
        },
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
      name: 'Refund Test Branch',
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

    // Create a minimal order to test against
    orderData = {
      merchant: merchantId,
      branch: branchId,
      orderNumber: 'TEST-REFUND-001',
      customerName: 'Test Customer',
      orderType: 'takeaway',
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
    };
  });

  test('✅ Valid refund: restore exact amount deducted', async () => {
    console.log('\n🧪 TEST 1: Valid refund restores exact deducted quantity');

    // Create order and manually log deduction (simulating order placement)
    const order = await Order.create(orderData);
    orderId = order._id;

    // Simulate 2kg deduction via StockHistory
    const deductedAmount = 2;
    await StockHistory.create({
      merchant: merchantId,
      branch: branchId,
      ingredient: ingredientChicken._id,
      action: 'USED',
      quantity: deductedAmount,
      stockBefore: 100,
      stockAfter: 98,
      reason: 'Order placement',
      orderId: orderId,
      recordedBy: new mongoose.Types.ObjectId(),
    });

    // Manually deduct stock to simulate order
    await Ingredient.findByIdAndUpdate(
      ingredientChicken._id,
      { currentStock: 98 }
    );

    console.log(`  Initial stock: 100 kg`);
    console.log(`  Deducted: 2 kg (via order placement)`);
    console.log(`  Current stock: 98 kg`);

    // Now refund the exact amount
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await InventoryService.refundOrderItems(
          orderId,
          merchantId,
          branchId,
          [{ ingredientId: ingredientChicken._id, quantity: 2 }],
          'Customer refund - valid',
          new mongoose.Types.ObjectId(),
          session
        );

        console.log(`  Refund result:`, result.reversals);
      });
    } finally {
      session.endSession();
    }

    // Verify stock restored
    const ingAfter = await Ingredient.findById(ingredientChicken._id);
    console.log(`  Stock after refund: ${ingAfter.currentStock} kg (expected 100)`);

    expect(ingAfter.currentStock).toBe(100);
    console.log(`  ✅ TEST PASSED — exact refund accepted`);
  });

  test('❌ Over-refund is REJECTED', async () => {
    console.log('\n🧪 TEST 2: Over-refund attempt is REJECTED');

    // Create order and log 2kg deduction
    const order = await Order.create(orderData);
    orderId = order._id;

    const deductedAmount = 2;
    await StockHistory.create({
      merchant: merchantId,
      branch: branchId,
      ingredient: ingredientChicken._id,
      action: 'USED',
      quantity: deductedAmount,
      stockBefore: 100,
      stockAfter: 98,
      reason: 'Order placement',
      orderId: orderId,
      recordedBy: new mongoose.Types.ObjectId(),
    });

    // Deduct stock
    await Ingredient.findByIdAndUpdate(
      ingredientChicken._id,
      { currentStock: 98 }
    );

    console.log(`  Deducted (per StockHistory): 2 kg`);
    console.log(`  Current stock: 98 kg`);
    console.log(`  Attempting to refund: 5 kg (MORE than deducted!)`);

    // Try to refund MORE than was deducted
    const session = await mongoose.startSession();
    let errorThrown = false;
    let errorMessage = '';

    try {
      await session.withTransaction(async () => {
        await InventoryService.refundOrderItems(
          orderId,
          merchantId,
          branchId,
          [{ ingredientId: ingredientChicken._id, quantity: 5 }],  // Requesting 5, only 2 was deducted
          'Customer refund - OVER-REFUND ATTEMPT',
          new mongoose.Types.ObjectId(),
          session
        );
      });
    } catch (err) {
      errorThrown = true;
      errorMessage = err.message;
      console.log(`  Error caught: ${err.message}`);
    } finally {
      session.endSession();
    }

    // Verify error was thrown
    expect(errorThrown).toBe(true);
    expect(errorMessage).toContain('Refund validation failed');
    expect(errorMessage).toContain('only 2 was deducted');

    // Verify stock unchanged (transaction rolled back)
    const ingAfter = await Ingredient.findById(ingredientChicken._id);
    console.log(`  Stock after failed refund: ${ingAfter.currentStock} kg (should be unchanged)`);
    expect(ingAfter.currentStock).toBe(98);

    console.log(`  ✅ TEST PASSED — over-refund REJECTED`);
  });

  test('✅ Partial refund (less than deducted) is allowed', async () => {
    console.log('\n🧪 TEST 3: Partial refund (less than deducted) is allowed');

    // Create order and log 5kg deduction
    const order = await Order.create(orderData);
    orderId = order._id;

    const deductedAmount = 5;
    await StockHistory.create({
      merchant: merchantId,
      branch: branchId,
      ingredient: ingredientChicken._id,
      action: 'USED',
      quantity: deductedAmount,
      stockBefore: 100,
      stockAfter: 95,
      reason: 'Order placement',
      orderId: orderId,
      recordedBy: new mongoose.Types.ObjectId(),
    });

    // Deduct stock
    await Ingredient.findByIdAndUpdate(
      ingredientChicken._id,
      { currentStock: 95 }
    );

    console.log(`  Deducted (per StockHistory): 5 kg`);
    console.log(`  Current stock: 95 kg`);
    console.log(`  Attempting partial refund: 2 kg (LESS than deducted)`);

    // Refund LESS than was deducted
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await InventoryService.refundOrderItems(
          orderId,
          merchantId,
          branchId,
          [{ ingredientId: ingredientChicken._id, quantity: 2 }],  // Requesting 2 of 5
          'Partial refund - customer rejected 2 items',
          new mongoose.Types.ObjectId(),
          session
        );

        console.log(`  Refund accepted: ${result.reversals[0].refundedQuantity} kg`);
      });
    } finally {
      session.endSession();
    }

    // Verify stock correctly updated
    const ingAfter = await Ingredient.findById(ingredientChicken._id);
    console.log(`  Stock after partial refund: ${ingAfter.currentStock} kg (expected 97)`);

    expect(ingAfter.currentStock).toBe(97);  // 95 + 2
    console.log(`  ✅ TEST PASSED — partial refund accepted`);
  });

  test('❌ Refund for ingredient with NO deduction is REJECTED', async () => {
    console.log('\n🧪 TEST 4: Refund for ingredient that was never deducted is REJECTED');

    // Create order with NO deductions logged
    const order = await Order.create(orderData);
    orderId = order._id;

    console.log(`  Created order with NO StockHistory entries`);
    console.log(`  Attempting to refund 1 kg for ingredient that was never deducted`);

    // Try to refund ingredient that has no USED entry in StockHistory
    const session = await mongoose.startSession();
    let errorThrown = false;
    let errorMessage = '';

    try {
      await session.withTransaction(async () => {
        await InventoryService.refundOrderItems(
          orderId,
          merchantId,
          branchId,
          [{ ingredientId: ingredientChicken._id, quantity: 1 }],  // No deduction recorded
          'Invalid refund',
          new mongoose.Types.ObjectId(),
          session
        );
      });
    } catch (err) {
      errorThrown = true;
      errorMessage = err.message;
      console.log(`  Error caught: ${err.message}`);
    } finally {
      session.endSession();
    }

    // Verify error was thrown
    expect(errorThrown).toBe(true);
    expect(errorMessage).toContain('Refund validation failed');
    expect(errorMessage).toContain('only 0 was deducted');

    console.log(`  ✅ TEST PASSED — refund for non-deducted ingredient REJECTED`);
  });
});

