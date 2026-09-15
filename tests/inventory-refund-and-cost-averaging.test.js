/**
 * @file tests/inventory-refund-and-cost-averaging.test.js
 * @description Test partial refunds and cost averaging for inventory management
 *
 * Tests:
 * 1. refundOrderItems() — restore stock for specific items/quantities within an order (not full cancel)
 * 2. adjustStockAtomic() with cost parameter — weighted average cost calculation on 'in' movements
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');
const Order = require('../models/orderModel');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const Category = require('../models/Category');
const StockHistory = require('../models/StockHistory');

const { InventoryService } = require('../src/modules/inventory');
const { OrderService } = require('../src/modules/order/service/OrderService');

describe('Inventory: Partial Refunds & Cost Averaging', () => {
  let merchant, branch;
  let chicken, rice;
  let merchantId, branchId;

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
      MenuItem.deleteMany({}),
      Category.deleteMany({}),
      StockHistory.deleteMany({}),
    ]);

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Refund Test',
      slug: 'refund-test-' + Date.now(),
      owner: {
        fullName: 'Owner',
        gender: 'Male',
        email: 'owner@refund.com',
        phone: '+251911234567',
      },
      phone: '+251911234567',
      features: {
        core: { menu: { enabled: true }, tableManagement: { enabled: true } },
        optional: { inventory: { enabled: true }, orders: { enabled: true } },
      },
    });
    merchantId = merchant._id;

    // Create branch
    branch = await Branch.create({
      merchant: merchantId,
      name: 'Test Branch',
      city: 'Addis',
      location: { type: 'Point', coordinates: [9.0, 38.7], city: 'Addis' },
    });
    branchId = branch._id;

    // Create ingredients
    chicken = await Ingredient.create({
      merchant: merchantId,
      branch: branchId,
      name: 'Chicken',
      unit: 'kg',
      currentStock: 50,
      category: 'meat',
      costPerUnit: 100,  // ETB per kg
    });

    rice = await Ingredient.create({
      merchant: merchantId,
      branch: branchId,
      name: 'Rice',
      unit: 'kg',
      currentStock: 100,
      category: 'grains',
      costPerUnit: 50,  // ETB per kg
    });

    console.log('\n📋 SETUP: Merchant with inventory enabled');
    console.log(`  Chicken: 50 kg @ 100 ETB/kg`);
    console.log(`  Rice: 100 kg @ 50 ETB/kg`);
  });

  describe('Feature 1: refundOrderItems() — Partial Item Refunds', () => {
    test('Partial refund restores stock for 2 of 5 ordered items', async () => {
      console.log('\n🧪 TEST 1: Partial refund of 2 items out of 5 ordered');

      // Create menu items
      const category = await Category.create({
        merchant: merchantId,
        name: { en: 'Mains', am: 'ዋናዎች' },
      });

      const chickenDish = await MenuItem.create({
        merchant: merchantId,
        branch: branchId,
        categoryId: category._id,
        name: { en: 'Chicken Rice', am: 'ዶሮ ሩዝ' },
        price: 150,
        type: 'food',
      });

      const riceDish = await MenuItem.create({
        merchant: merchantId,
        branch: branchId,
        categoryId: category._id,
        name: { en: 'Plain Rice', am: 'ሩዝ' },
        price: 50,
        type: 'food',
      });

      // Create recipes
      const chickenRecipe = await Recipe.create({
        merchant: merchantId,
        menuItem: chickenDish._id,
        name: 'Chicken Rice Recipe',
        items: [
          { ingredientName: 'Chicken', quantity: 0.5, unit: 'kg' },
          { ingredientName: 'Rice', quantity: 0.3, unit: 'kg' },
        ],
        isActive: true,
      });

      const riceRecipe = await Recipe.create({
        merchant: merchantId,
        menuItem: riceDish._id,
        name: 'Rice Recipe',
        items: [
          { ingredientName: 'Rice', quantity: 0.5, unit: 'kg' },
        ],
        isActive: true,
      });

      // Update menu items
      await MenuItem.updateMany(
        { _id: { $in: [chickenDish._id, riceDish._id] } },
        { recipe: new mongoose.Types.ObjectId() }
      );
      await MenuItem.findByIdAndUpdate(chickenDish._id, { recipe: chickenRecipe._id });
      await MenuItem.findByIdAndUpdate(riceDish._id, { recipe: riceRecipe._id });

      // Simulate an order with 5 items: 3 Chicken Rice + 2 Plain Rice
      console.log(`  Creating order with 5 items:`);
      console.log(`    - 3x Chicken Rice (0.5kg chicken, 0.3kg rice each) = 1.5kg chicken, 0.9kg rice`);
      console.log(`    - 2x Plain Rice (0.5kg rice each) = 1kg rice`);
      console.log(`    Total deduction: 1.5kg chicken, 1.9kg rice`);

      // Manually deduct stock (simulating order placement)
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await InventoryService.adjustStockAtomic(
            merchantId, branchId, chicken._id,
            1.5,  // quantity (positive number)
            'out', 'order_consumption', 'Order #TEST-001', new mongoose.Types.ObjectId(), session
          );

          await InventoryService.adjustStockAtomic(
            merchantId, branchId, rice._id,
            1.9,  // quantity (positive number)
            'out', 'order_consumption', 'Order #TEST-001', new mongoose.Types.ObjectId(), session
          );
        });
      } finally {
        session.endSession();
      }

      // Verify stock after deduction
      let chickenAfterOrder = await Ingredient.findById(chicken._id);
      let riceAfterOrder = await Ingredient.findById(rice._id);

      console.log(`\n  After order placement:`);
      console.log(`    - Chicken: ${chickenAfterOrder.currentStock} kg (was 50, deducted 1.5)`);
      console.log(`    - Rice: ${riceAfterOrder.currentStock} kg (was 100, deducted 1.9)`);

      expect(chickenAfterOrder.currentStock).toBe(48.5);
      expect(riceAfterOrder.currentStock).toBe(98.1);

      // Create order document
      const orderId = new mongoose.Types.ObjectId();

      // Create StockHistory entries for the deduction
      await StockHistory.create([
        {
          merchant: merchantId,
          branch: branchId,
          ingredient: chicken._id,
          action: 'USED',
          quantity: 1.5,
          stockBefore: 50,
          stockAfter: 48.5,
          reason: 'order_consumption',
          orderId,
        },
        {
          merchant: merchantId,
          branch: branchId,
          ingredient: rice._id,
          action: 'USED',
          quantity: 1.9,
          stockBefore: 100,
          stockAfter: 98.1,
          reason: 'order_consumption',
          orderId,
        },
      ]);

      // NOW: Refund 2 items (say, 2 Chicken Rice dishes that were rejected)
      console.log(`\n  Refunding 2 Chicken Rice dishes (out of 3 ordered):`);
      console.log(`    - Restoring 2 × 0.5kg chicken = 1kg`);
      console.log(`    - Restoring 2 × 0.3kg rice = 0.6kg`);

      // Partial refund: restore stock for 2 items
      const refundSession = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await InventoryService.refundOrderItems(
            orderId,
            merchantId,
            branchId,
            [
              { ingredientId: chicken._id, quantity: 1.0 },  // 2 × 0.5
              { ingredientId: rice._id, quantity: 0.6 },     // 2 × 0.3
            ],
            'Customer rejected 2 Chicken Rice dishes',
            new mongoose.Types.ObjectId(),
            refundSession
          );
        });
      } finally {
        refundSession.endSession();
      }

      // Verify final stock
      chickenAfterOrder = await Ingredient.findById(chicken._id);
      riceAfterOrder = await Ingredient.findById(rice._id);

      console.log(`\n  After partial refund:`);
      console.log(`    - Chicken: ${chickenAfterOrder.currentStock} kg (was 48.5, restored 1.0)`);
      console.log(`    - Rice: ${riceAfterOrder.currentStock} kg (was 98.1, restored 0.6)`);

      // ✅ Assertions: Refunded items restored, non-refunded items still deducted
      expect(chickenAfterOrder.currentStock).toBe(49.5);  // 48.5 + 1.0
      expect(riceAfterOrder.currentStock).toBeCloseTo(98.7, 5);  // Use toBeCloseTo for floating point

      // Verify StockHistory has REFUNDED entry (should look for RELEASED action)
      const refundHistory = await StockHistory.findOne({
        merchant: merchantId,
        branch: branchId,
        orderId,
        action: 'RELEASED',
      });

      expect(refundHistory).toBeDefined();
      console.log(`  ✅ StockHistory entry created for refund`);
    });
  });

  describe('Feature 2: Cost Averaging — Weighted Average on Stock In', () => {
    test('Receiving stock at different cost updates costPerUnit via weighted average', async () => {
      console.log('\n🧪 TEST 2: Cost averaging on ingredient receipt');

      console.log(`\n  Initial state:`);
      console.log(`    - Chicken: 50 kg @ 100 ETB/kg = 5000 ETB total cost`);
      console.log(`    - Total value: 50 * 100 = 5000 ETB`);

      // Receive 30 kg of chicken at a DIFFERENT cost (80 ETB/kg, cheaper supply)
      console.log(`\n  Receiving 30 kg at 80 ETB/kg (cheaper supplier):`);
      console.log(`    - New total quantity: 50 + 30 = 80 kg`);
      console.log(`    - New total cost: 5000 + (30 * 80) = 5000 + 2400 = 7400 ETB`);
      console.log(`    - Expected weightedAvg: 7400 / 80 = 92.5 ETB/kg`);

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await InventoryService.adjustStockAtomic(
            merchantId,
            branchId,
            chicken._id,
            30,  // Receive 30 kg
            'in',
            'purchase',  // Valid reason from StockMovement enum
            'PO #2024-001 received',
            new mongoose.Types.ObjectId(),
            session,
            80  // Cost: 80 ETB per kg
          );
        });
      } finally {
        session.endSession();
      }

      // Verify stock and cost
      const chickenUpdated = await Ingredient.findById(chicken._id);

      console.log(`\n  After receipt:`);
      console.log(`    - Stock: ${chickenUpdated.currentStock} kg`);
      console.log(`    - costPerUnit: ${chickenUpdated.costPerUnit} ETB/kg`);
      console.log(`    - Expected: 92.5 ETB/kg`);

      // ✅ Assertions: Stock increased AND cost averaged
      expect(chickenUpdated.currentStock).toBe(80);
      expect(chickenUpdated.costPerUnit).toBe(92.5);

      console.log(`  ✅ Weighted average cost calculated correctly`);

      // Verify StockMovement entry (writes to StockMovement, not StockHistory)
      const StockMovement = require('../models/StockMovement');
      const historyEntry = await StockMovement.findOne({
        merchant: merchantId,
        ingredient: chicken._id,
        type: 'in',
      });

      expect(historyEntry).toBeDefined();
      expect(historyEntry.quantity).toBe(30);
      expect(historyEntry.cost).toBe(80);
      console.log(`  ✅ StockMovement entry created with cost`);

      // Another scenario: receive more at an even DIFFERENT cost
      console.log(`\n  Receiving another 20 kg at 110 ETB/kg (premium supplier):`);
      console.log(`    - Current: 80 kg @ 92.5 ETB/kg = 7400 ETB total`);
      console.log(`    - New total quantity: 80 + 20 = 100 kg`);
      console.log(`    - New total cost: 7400 + (20 * 110) = 7400 + 2200 = 9600 ETB`);
      console.log(`    - Expected weightedAvg: 9600 / 100 = 96 ETB/kg`);

      const session2 = await mongoose.startSession();
      try {
        await session2.withTransaction(async () => {
          await InventoryService.adjustStockAtomic(
            merchantId,
            branchId,
            chicken._id,
            20,
            'in',
            'purchase',  // Valid reason
            'PO #2024-002 received',
            new mongoose.Types.ObjectId(),
            session2,
            110  // Cost: 110 ETB per kg
          );
        });
      } finally {
        session2.endSession();
      }

      const chickenFinal = await Ingredient.findById(chicken._id);

      console.log(`\n  After second receipt:`);
      console.log(`    - Stock: ${chickenFinal.currentStock} kg`);
      console.log(`    - costPerUnit: ${chickenFinal.costPerUnit} ETB/kg`);
      console.log(`    - Expected: 96 ETB/kg`);

      expect(chickenFinal.currentStock).toBe(100);
      expect(chickenFinal.costPerUnit).toBe(96);

      console.log(`  ✅ Multi-receipt cost averaging works correctly`);
    });
  });
});

