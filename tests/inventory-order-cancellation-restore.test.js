/**
 * @file tests/inventory-order-cancellation-restore.test.js
 * @description Test that order cancellation restores stock correctly
 * 
 * CRITICAL BUG THIS TESTS:
 * Before: Order placed → stock deducted → order canceled → stock NEVER restored
 *         Permanent stock loss, inventory audit broken
 * 
 * After: Order placed → stock deducted → order canceled → stock atomically restored
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

// Models
const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');
const StockHistory = require('../models/StockHistory');

// Services
const { InventoryService } = require('../src/modules/inventory');

describe('Order Cancellation → Stock Restoration (Blocking Issue Fix)', () => {
  let merchant, branch;
  let chicken, rice;

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean slate
    await Promise.all([
      Merchant.deleteMany({}),
      Branch.deleteMany({}),
      Ingredient.deleteMany({}),
      StockHistory.deleteMany({}),
    ]);

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Cancellation Test',
      slug: 'cancellation-test',
      email: 'test@cancellation.com',
      phone: '+251911234567',
    });

    // Create branch
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch',
      city: 'Addis Ababa',
      location: {
        type: 'Point',
        coordinates: [9.0320, 38.7469],
        city: 'Addis Ababa',
      },
    });

    // Create ingredients with initial stock
    chicken = await Ingredient.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Grilled Chicken',
      unit: 'kg',
      currentStock: 50,
      category: 'meat',
      costPerUnit: 300,
    });

    rice = await Ingredient.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'White Rice',
      unit: 'kg',
      currentStock: 100,
      category: 'grains',
      costPerUnit: 150,
    });
  });

  test('restoreOrderStock() correctly restores deducted stock', async () => {
    const orderId = new mongoose.Types.ObjectId();
    const initialChickenStock = chicken.currentStock;
    const initialRiceStock = rice.currentStock;

    console.log('\n📊 INITIAL STOCK:');
    console.log(`  Chicken: ${initialChickenStock} kg`);
    console.log(`  Rice: ${initialRiceStock} kg`);

    // ============================================
    // PHASE 1: Simulate order deduction
    // ============================================
    console.log('\n🛒 SIMULATING ORDER DEDUCTION...');
    const chickenDeduct = 0.6;
    const riceDeduct = 0.4;

    // Deduct stock
    await Ingredient.updateOne({ _id: chicken._id }, { $inc: { currentStock: -chickenDeduct } });
    await Ingredient.updateOne({ _id: rice._id }, { $inc: { currentStock: -riceDeduct } });

    // Record deductions in audit
    const userId = new mongoose.Types.ObjectId();
    await StockHistory.create([
      {
        merchant: merchant._id,
        branch: branch._id,
        ingredient: chicken._id,
        action: 'USED',
        quantity: chickenDeduct,
        stockBefore: initialChickenStock,
        stockAfter: initialChickenStock - chickenDeduct,
        reason: 'order_consumption',
        orderId: orderId,
        recordedBy: userId,
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        ingredient: rice._id,
        action: 'USED',
        quantity: riceDeduct,
        stockBefore: initialRiceStock,
        stockAfter: initialRiceStock - riceDeduct,
        reason: 'order_consumption',
        orderId: orderId,
        recordedBy: userId,
      },
    ]);

    let chickenAfterDeduct = await Ingredient.findById(chicken._id);
    console.log(`✓ Deducted: Chicken ${initialChickenStock} → ${chickenAfterDeduct.currentStock} kg`);
    expect(chickenAfterDeduct.currentStock).toBe(initialChickenStock - chickenDeduct);

    // ============================================
    // PHASE 2: Restore stock using restoreOrderStock()
    // ============================================
    console.log('\n❌ CANCELING ORDER - RESTORING STOCK...');
    console.log('✓ Calling InventoryService.restoreOrderStock()...');

    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        return await InventoryService.restoreOrderStock(
          orderId,
          merchant._id,
          branch._id,
          session
        );
      });

      console.log(`✓ Result: Restored ${result.restored.length} ingredients`);
      result.reversals.forEach(r => {
        console.log(`  - ${r.ingredientId}: +${r.restoredQuantity} kg → ${r.newStock} kg`);
      });
    } finally {
      session.endSession();
    }

    // ============================================
    // PHASE 3: Verify stock was restored
    // ============================================
    console.log('\n✅ VERIFYING STOCK RESTORATION...');
    const chickenAfterRestore = await Ingredient.findById(chicken._id);
    const riceAfterRestore = await Ingredient.findById(rice._id);

    console.log(`  Chicken: ${chickenAfterRestore.currentStock} kg (expected ${initialChickenStock})`);
    console.log(`  Rice: ${riceAfterRestore.currentStock} kg (expected ${initialRiceStock})`);

    expect(chickenAfterRestore.currentStock).toBe(initialChickenStock);
    expect(riceAfterRestore.currentStock).toBe(initialRiceStock);

    // ============================================
    // PHASE 4: Verify audit trail includes RELEASED entries
    // ============================================
    console.log('\n📋 VERIFYING AUDIT TRAIL...');
    const movements = await StockHistory.find({
      merchant: merchant._id,
      branch: branch._id,
      ingredient: chicken._id,
    }).sort({ recordedAt: 1 });

    const usedActions = movements.filter(m => m.action === 'USED');
    const releasedActions = movements.filter(m => m.action === 'RELEASED');

    console.log(`✓ Total movements: ${movements.length}`);
    console.log(`  - USED (deductions): ${usedActions.length}`);
    console.log(`  - RELEASED (restores): ${releasedActions.length}`);

    movements.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.action}: qty=${m.quantity}, before=${m.stockBefore}, after=${m.stockAfter}`);
    });

    expect(usedActions.length).toBeGreaterThanOrEqual(1);
    expect(releasedActions.length).toBeGreaterThanOrEqual(1);

    // Verify the RELEASED entry matches the USED entry
    const released = releasedActions[0];
    expect(released.quantity).toBe(chickenDeduct);
    expect(released.orderId.toString()).toBe(orderId.toString());
    expect(released.reason).toContain('canceled');

    console.log('\n✅ TEST PASSED: Stock correctly restored with complete audit trail');
  });
});
