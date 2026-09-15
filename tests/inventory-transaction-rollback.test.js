/**
 * @file tests/inventory-transaction-rollback.test.js
 * @description Test transaction rollback on partial cancellation failure
 * 
 * CRITICAL SCENARIO:
 * Order has 3 ingredients deducted
 * During cancellation, restoreOrderStock() fails after restoring ingredient 1
 * Expected: Transaction rolls back, ALL ingredients remain in depleted state
 * Failure: Ingredient 1 restored, 2 and 3 still depleted (partial restore)
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

// Models
const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');
const Order = require('../models/orderModel');
const StockHistory = require('../models/StockHistory');

// Services
const { InventoryService } = require('../src/modules/inventory');

describe('Transaction Rollback on Partial Cancellation Failure', () => {
  let merchant, branch;
  let ingredient1, ingredient2, ingredient3;
  let orderId;

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
      Order.deleteMany({}),
      StockHistory.deleteMany({}),
    ]);

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Rollback Test',
      slug: 'rollback-test',
      email: 'test@rollback.com',
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

    // Create 3 ingredients
    ingredient1 = await Ingredient.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Ingredient 1',
      unit: 'kg',
      currentStock: 100,
      category: 'meat',
    });

    ingredient2 = await Ingredient.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Ingredient 2',
      unit: 'kg',
      currentStock: 200,
      category: 'grains',
    });

    ingredient3 = await Ingredient.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Ingredient 3',
      unit: 'kg',
      currentStock: 300,
      category: 'vegetables',
    });

    orderId = new mongoose.Types.ObjectId();

    // Simulate order deduction for all 3 ingredients
    await Ingredient.updateOne({ _id: ingredient1._id }, { $inc: { currentStock: -10 } });
    await Ingredient.updateOne({ _id: ingredient2._id }, { $inc: { currentStock: -20 } });
    await Ingredient.updateOne({ _id: ingredient3._id }, { $inc: { currentStock: -30 } });

    const userId = new mongoose.Types.ObjectId();
    await StockHistory.create([
      {
        merchant: merchant._id,
        branch: branch._id,
        ingredient: ingredient1._id,
        action: 'USED',
        quantity: 10,
        stockBefore: 100,
        stockAfter: 90,
        orderId: orderId,
        recordedBy: userId,
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        ingredient: ingredient2._id,
        action: 'USED',
        quantity: 20,
        stockBefore: 200,
        stockAfter: 180,
        orderId: orderId,
        recordedBy: userId,
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        ingredient: ingredient3._id,
        action: 'USED',
        quantity: 30,
        stockBefore: 300,
        stockAfter: 270,
        orderId: orderId,
        recordedBy: userId,
      },
    ]);
  });

  test('Partial failure during restore causes complete rollback', async () => {
    console.log('\n🔥 SIMULATING PARTIAL CANCELLATION FAILURE');
    
    // Record initial depleted state
    const initialStocks = {
      ing1: (await Ingredient.findById(ingredient1._id)).currentStock,
      ing2: (await Ingredient.findById(ingredient2._id)).currentStock,
      ing3: (await Ingredient.findById(ingredient3._id)).currentStock,
    };

    console.log('\n📊 INITIAL DEPLETED STATE:');
    console.log(`  Ingredient 1: ${initialStocks.ing1} kg (was 100)`);
    console.log(`  Ingredient 2: ${initialStocks.ing2} kg (was 200)`);
    console.log(`  Ingredient 3: ${initialStocks.ing3} kg (was 300)`);

    expect(initialStocks.ing1).toBe(90);
    expect(initialStocks.ing2).toBe(180);
    expect(initialStocks.ing3).toBe(270);

    // Now simulate a failure: delete ingredient3 to cause findOneAndUpdate to fail
    console.log('\n💥 INJECTING FAILURE: Deleting ingredient 3 to cause restore failure');
    await Ingredient.deleteOne({ _id: ingredient3._id });

    // Attempt to restore with transaction
    console.log('\n🔄 ATTEMPTING RESTORE IN TRANSACTION...');
    const session = await mongoose.startSession();
    
    let errorThrown = false;
    let errorMessage = '';

    try {
      await session.withTransaction(async () => {
        await InventoryService.restoreOrderStock(
          orderId,
          merchant._id,
          branch._id,
          session
        );
      });
    } catch (error) {
      errorThrown = true;
      errorMessage = error.message;
      console.log(`  ✓ Error thrown: ${error.message}`);
    } finally {
      session.endSession();
    }

    expect(errorThrown).toBe(true);
    expect(errorMessage).toContain('Ingredient not found during cancellation restore');

    // ============================================
    // CRITICAL CHECK: Verify NO partial restoration occurred
    // ============================================
    console.log('\n✅ VERIFYING TRANSACTION ROLLBACK...');
    
    const finalStocks = {
      ing1: (await Ingredient.findById(ingredient1._id)).currentStock,
      ing2: (await Ingredient.findById(ingredient2._id)).currentStock,
      ing3: await Ingredient.findById(ingredient3._id), // Will be null
    };

    console.log(`  Ingredient 1: ${finalStocks.ing1} kg (should still be ${initialStocks.ing1})`);
    console.log(`  Ingredient 2: ${finalStocks.ing2} kg (should still be ${initialStocks.ing2})`);
    console.log(`  Ingredient 3: ${finalStocks.ing3 ? 'EXISTS' : 'DELETED'}`);

    // ALL ingredients should remain in depleted state (transaction rolled back)
    expect(finalStocks.ing1).toBe(90);  // NOT 100 (not restored)
    expect(finalStocks.ing2).toBe(180); // NOT 200 (not restored)
    expect(finalStocks.ing3).toBeNull(); // Deleted

    // Verify NO RELEASED entries were created
    const releasedEntries = await StockHistory.find({
      merchant: merchant._id,
      branch: branch._id,
      action: 'RELEASED',
      orderId: orderId,
    });

    console.log(`  RELEASED audit entries: ${releasedEntries.length} (should be 0)`);
    expect(releasedEntries.length).toBe(0);

    console.log('\n✅ TRANSACTION ROLLBACK VERIFIED:');
    console.log('  - Ingredient 1: Still depleted (90 kg) ✅');
    console.log('  - Ingredient 2: Still depleted (180 kg) ✅');
    console.log('  - No RELEASED audit entries created ✅');
    console.log('  - Atomic transaction guarantee upheld ✅');
  });

  test('Successful restore when all ingredients exist', async () => {
    console.log('\n✅ TESTING SUCCESSFUL RESTORE (all ingredients valid)');

    const initialStocks = {
      ing1: (await Ingredient.findById(ingredient1._id)).currentStock,
      ing2: (await Ingredient.findById(ingredient2._id)).currentStock,
      ing3: (await Ingredient.findById(ingredient3._id)).currentStock,
    };

    console.log('\n📊 INITIAL DEPLETED STATE:');
    console.log(`  Ingredient 1: ${initialStocks.ing1} kg`);
    console.log(`  Ingredient 2: ${initialStocks.ing2} kg`);
    console.log(`  Ingredient 3: ${initialStocks.ing3} kg`);

    // Restore in transaction
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        await InventoryService.restoreOrderStock(
          orderId,
          merchant._id,
          branch._id,
          session
        );
      });
    } finally {
      session.endSession();
    }

    // Verify all restored
    const finalStocks = {
      ing1: (await Ingredient.findById(ingredient1._id)).currentStock,
      ing2: (await Ingredient.findById(ingredient2._id)).currentStock,
      ing3: (await Ingredient.findById(ingredient3._id)).currentStock,
    };

    console.log('\n📊 FINAL RESTORED STATE:');
    console.log(`  Ingredient 1: ${finalStocks.ing1} kg (should be 100)`);
    console.log(`  Ingredient 2: ${finalStocks.ing2} kg (should be 200)`);
    console.log(`  Ingredient 3: ${finalStocks.ing3} kg (should be 300)`);

    expect(finalStocks.ing1).toBe(100);
    expect(finalStocks.ing2).toBe(200);
    expect(finalStocks.ing3).toBe(300);

    // Verify RELEASED entries created
    const releasedEntries = await StockHistory.find({
      merchant: merchant._id,
      branch: branch._id,
      action: 'RELEASED',
      orderId: orderId,
    });

    console.log(`  RELEASED audit entries: ${releasedEntries.length} (should be 3)`);
    expect(releasedEntries.length).toBe(3);

    console.log('\n✅ SUCCESSFUL RESTORE VERIFIED:');
    console.log('  - All ingredients restored ✅');
    console.log('  - All RELEASED entries created ✅');
  });
});
