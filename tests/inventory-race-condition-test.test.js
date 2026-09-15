/**
 * @file tests/inventory-race-condition-test.test.js
 * @description Test for potential race condition in adjustStockAtomic
 * 
 * Tests whether concurrent stock adjustments can result in:
 * 1. Negative stock (overselling)
 * 2. More successful deductions than available stock
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

// Models
const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');

// Service
const { InventoryService } = require('../src/modules/inventory');

describe('Race Condition: Concurrent Stock Adjustments', () => {
  let merchant, branch, ingredient;
  let merchantId, branchId, ingredientId;

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
    ]);

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Race Test Merchant',
      slug: 'race-test-' + Date.now(),
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@race.com',
        phone: '+251911234567',
      },
      phone: '+251911234567',
      features: {
        optional: {
          inventory: { enabled: true },
        },
      },
    });
    merchantId = merchant._id;

    // Create branch
    branch = await Branch.create({
      merchant: merchantId,
      name: 'Test Branch',
      city: 'Addis Ababa',
      location: {
        type: 'Point',
        coordinates: [9.0320, 38.7469],
        city: 'Addis Ababa',
      },
    });
    branchId = branch._id;

    // Create ingredient with LIMITED stock
    ingredient = await Ingredient.create({
      merchant: merchantId,
      branch: branchId,
      name: 'Test Ingredient',
      unit: 'kg',
      currentStock: 5,  // ⚠️ Only 5 units available
      category: 'other',  // Valid category
      costPerUnit: 10,
    });
    ingredientId = ingredient._id;

    console.log('\n📋 TEST SETUP:');
    console.log(`  Ingredient: ${ingredientId}`);
    console.log(`  Initial stock: 5 kg`);
  });

  test('⚠️ RACE CONDITION TEST: 10 concurrent deductions of 1kg each (only 5 available)', async () => {
    console.log('\n🧪 TESTING: Fire 10 concurrent adjustStockAtomic() calls against stock of 5kg');

    const performedBy = new mongoose.Types.ObjectId();
    const concurrentCalls = 10;
    const deductionAmount = 1;

    console.log(`  Launching ${concurrentCalls} concurrent deductions of ${deductionAmount}kg each...`);

    // Fire 10 concurrent adjustStockAtomic calls
    const promises = [];
    for (let i = 0; i < concurrentCalls; i++) {
      const session = await mongoose.startSession();
      
      const promise = (async () => {
        try {
          await session.withTransaction(async () => {
            await InventoryService.adjustStockAtomic(
              merchantId,
              branchId,
              ingredientId,
              deductionAmount,
              'out',
              'order_consumption',
              `Test Order ${i + 1}`,
              performedBy,
              session
            );
          });
          return { success: true, index: i + 1 };
        } catch (err) {
          return { success: false, index: i + 1, error: err.message };
        } finally {
          await session.endSession();
        }
      })();

      promises.push(promise);
    }

    // Wait for all to complete
    const results = await Promise.all(promises);

    // Count successes and failures
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    console.log(`\n  Results:`);
    console.log(`    - Successful deductions: ${successes.length}`);
    console.log(`    - Failed deductions: ${failures.length}`);

    // Check final stock
    const finalIngredient = await Ingredient.findById(ingredientId);
    console.log(`    - Final stock: ${finalIngredient.currentStock} kg`);
    console.log(`    - Expected final stock: ${5 - successes.length} kg`);

    // Log failure reasons
    if (failures.length > 0) {
      console.log(`\n  Failure reasons:`);
      failures.slice(0, 3).forEach(f => {
        console.log(`    - Deduction ${f.index}: ${f.error}`);
      });
    }

    // ASSERTIONS
    console.log(`\n  Checking for race conditions:`);

    // Test 1: No more than 5 deductions should succeed (we only have 5kg)
    console.log(`    1. Success count <= available stock?`);
    expect(successes.length).toBeLessThanOrEqual(5);
    console.log(`       ✅ ${successes.length} <= 5`);

    // Test 2: Final stock should not be negative
    console.log(`    2. Final stock >= 0?`);
    expect(finalIngredient.currentStock).toBeGreaterThanOrEqual(0);
    console.log(`       ✅ ${finalIngredient.currentStock} >= 0`);

    // Test 3: Final stock should match (initial - successes)
    const expectedFinal = 5 - successes.length;
    console.log(`    3. Final stock = initial - successes?`);
    expect(finalIngredient.currentStock).toBe(expectedFinal);
    console.log(`       ✅ ${finalIngredient.currentStock} = ${expectedFinal}`);

    // VERDICT
    if (successes.length > 5) {
      console.log(`\n  ❌ RACE CONDITION DETECTED: ${successes.length} deductions succeeded with only 5kg available!`);
    } else if (finalIngredient.currentStock < 0) {
      console.log(`\n  ❌ RACE CONDITION DETECTED: Stock went negative (${finalIngredient.currentStock}kg)!`);
    } else {
      console.log(`\n  ✅ NO RACE CONDITION: Correctly limited to ${successes.length} successful deductions`);
    }
  }, 30000);  // 30 second timeout

  test('🔄 CONTROL TEST: Sequential deductions should all succeed if stock sufficient', async () => {
    console.log('\n🧪 CONTROL: 5 sequential deductions of 1kg each (5 available)');

    const performedBy = new mongoose.Types.ObjectId();
    let successCount = 0;

    // Sequential deductions
    for (let i = 0; i < 5; i++) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await InventoryService.adjustStockAtomic(
            merchantId,
            branchId,
            ingredientId,
            1,
            'out',
            'order_consumption',
            `Sequential Order ${i + 1}`,
            performedBy,
            session
          );
        });
        successCount++;
      } catch (err) {
        console.log(`  Sequential deduction ${i + 1} failed: ${err.message}`);
      } finally {
        await session.endSession();
      }
    }

    const finalIngredient = await Ingredient.findById(ingredientId);

    console.log(`  Sequential results:`);
    console.log(`    - Successful: ${successCount}/5`);
    console.log(`    - Final stock: ${finalIngredient.currentStock} kg`);

    expect(successCount).toBe(5);
    expect(finalIngredient.currentStock).toBe(0);

    console.log(`  ✅ Sequential deductions work as expected`);
  });
});
