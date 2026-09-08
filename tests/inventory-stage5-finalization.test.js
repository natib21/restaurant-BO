// tests/inventory-stage5-finalization.test.js
const mongoose = require('mongoose');
const Ingredient = require('../models/Ingredient');
const StockHistory = require('../models/StockHistory');
const Order = require('../models/orderModel');
const Recipe = require('../models/Recipe');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Menu = require('../models/branchMenuModel');
const {
  finalizeIngredientAtomic,
  finalizeIngredients,
  rollbackFinalizations,
} = require('../src/modules/inventory/service/stock.service');

describe('Stage 5: Stock Finalization Functions', () => {
  let merchantId, branchId, userId, menuId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test');
    }
    
    // Create test merchant and branch using Stage 1 fixtures
    const timestamp = Date.now();
    const merchant = await Merchant.create({
      businessName: `Test Restaurant ${timestamp}`,
      slug: `test-restaurant-${timestamp}`,
      phone: '+251912345678',
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: `owner-${timestamp}@test.com`,
        phone: '+251912345678',
      },
      status: 'approved',
    });
    merchantId = merchant._id;

    const branch = await Branch.create({
      merchant: merchantId,
      name: 'Main Branch',
      location: {
        coordinates: [38.7469, 9.0320],
        city: 'Addis Ababa',
        subCity: 'Bole',
        formattedAddress: '123 Main St, Bole, Addis Ababa',
      },
      phone: '+251912345678',
      isActive: true,
    });
    branchId = branch._id;

    // Create test menu
    const menu = await Menu.create({
      merchant: merchantId,
      branch: branchId,
      name: 'Test Menu',
      isActive: true,
    });
    menuId = menu._id;

    userId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await Ingredient.deleteMany({ merchant: merchantId });
    await StockHistory.deleteMany({ merchant: merchantId });
    await Recipe.deleteMany({ merchant: merchantId });
    await Order.deleteMany({ merchant: merchantId });
    await Menu.deleteMany({ merchant: merchantId });
    await Branch.deleteMany({ merchant: merchantId });
    await Merchant.deleteMany({ _id: merchantId });
    await mongoose.connection.close();
  });

  describe('finalizeIngredientAtomic() - Single ingredient finalization', () => {
    test('should atomically finalize reserved stock and create history entry', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Tomatoes Finalize',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 20,
        minStock: 20,
      });

      const orderId = new mongoose.Types.ObjectId();
      
      const updated = await finalizeIngredientAtomic(
        ingredient._id,
        10,
        {
          orderId,
          userId,
          merchantId,
          branchId,
        }
      );

      expect(updated.currentStock).toBe(90); // 100 - 10
      expect(updated.reservedStock).toBe(10); // 20 - 10
      
      // Verify history entry was created
      const history = await StockHistory.findOne({
        ingredient: ingredient._id,
        action: 'USED',
        orderId,
      });
      
      expect(history).toBeDefined();
      expect(history.quantity).toBe(10);
      expect(history.stockBefore).toBe(100);
      expect(history.stockAfter).toBe(90);
      expect(history.reservedBefore).toBe(20);
      expect(history.reservedAfter).toBe(10);
      expect(history.branch.toString()).toBe(branchId.toString());
    });

    test('should reject finalization when insufficient reserved stock', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Onions Insufficient Reserved',
        unit: 'kg',
        currentStock: 50,
        reservedStock: 5, // Only 5 reserved, need 10
        minStock: 10,
      });

      await expect(
        finalizeIngredientAtomic(
          ingredient._id,
          10,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        )
      ).rejects.toThrow(/Insufficient reserved stock/);

      // Stock should remain unchanged
      const unchanged = await Ingredient.findById(ingredient._id);
      expect(unchanged.currentStock).toBe(50);
      expect(unchanged.reservedStock).toBe(5);
    });

    test('should reject finalization when ingredient not found', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        finalizeIngredientAtomic(
          fakeId,
          10,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        )
      ).rejects.toThrow(/not found/);
    });

    test('should reject finalization when ingredient is inactive', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Inactive Finalize',
        unit: 'kg',
        currentStock: 50,
        reservedStock: 20,
        minStock: 20,
        isActive: false,
      });

      await expect(
        finalizeIngredientAtomic(
          ingredient._id,
          10,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        )
      ).rejects.toThrow(/is inactive/);
    });

    test('should throw error when branchId is missing', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Branch Missing Finalize',
        unit: 'kg',
        currentStock: 50,
        reservedStock: 20,
        minStock: 20,
      });

      await expect(
        finalizeIngredientAtomic(
          ingredient._id,
          10,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            // branchId missing
          }
        )
      ).rejects.toThrow(/branchId is required/);
    });

    test('should correctly handle finalization when reserved equals required qty', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Exact Finalize',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 10, // Exactly 10, need 10
        minStock: 10,
      });

      const updated = await finalizeIngredientAtomic(
        ingredient._id,
        10,
        {
          orderId: new mongoose.Types.ObjectId(),
          userId,
          merchantId,
          branchId,
        }
      );

      expect(updated.reservedStock).toBe(0);
      expect(updated.currentStock).toBe(90);
    });

    test('should reject finalization when reservedStock exceeds currentStock (Stage 3 ate reserved)', async () => {
      // Simulate: Order A reserved 20kg, then Stage 3 direct deduction ate 15kg
      // Now reserved=20 but current=10, and we try to finalize 20
      // This should fail because we can't deduct 20 when only 10 physical stock exists
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Reserved Exceeds Current',
        unit: 'kg',
        currentStock: 10, // Stage 3 deduction ate most of the physical stock
        reservedStock: 20, // Still reserved for Order A, but not enough current
        minStock: 10,
      });

      // Try to finalize the full 20kg reservation - should fail because currentStock only 10
      await expect(
        finalizeIngredientAtomic(
          ingredient._id,
          20,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        )
      ).rejects.toThrow(/Insufficient reserved stock/);

      // Verify stock unchanged
      const unchanged = await Ingredient.findById(ingredient._id);
      expect(unchanged.currentStock).toBe(10);
      expect(unchanged.reservedStock).toBe(20);
    });
  });

  describe('Concurrency Tests - Race condition protection for finalizations', () => {
    test('should handle concurrent finalizations without over-finalizing', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Concurrent Finalize',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 100,
        minStock: 20,
      });

      // Simulate 5 concurrent finalizations of 25kg each
      // Only 4 should succeed (100 reserved / 25 each = 4)
      const finalizations = Array(5).fill(null).map((_, i) =>
        finalizeIngredientAtomic(
          ingredient._id,
          25,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        ).catch(err => ({ error: err.message }))
      );

      const results = await Promise.all(finalizations);

      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);

      // Exactly 4 should succeed, 1 should fail
      expect(successes.length).toBe(4);
      expect(failures.length).toBe(1);
      expect(failures[0].error).toMatch(/Insufficient reserved stock/);

      // Final reserved should be 0, current should be 0 (100 - 100)
      const final = await Ingredient.findById(ingredient._id);
      expect(final.reservedStock).toBe(0);
      expect(final.currentStock).toBe(0);
    });

    test('should handle concurrent finalizations with partial reserved stock', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Concurrent Mixed Finalize',
        unit: 'kg',
        currentStock: 80,
        reservedStock: 60, // 60 reserved
        minStock: 10,
      });

      // Try 3 concurrent finalizations of 25kg each
      // Only 2 should succeed (60 reserved / 25 each = 2 with 10 left)
      const finalizations = [
        finalizeIngredientAtomic(ingredient._id, 25, { orderId: new mongoose.Types.ObjectId(), userId, merchantId, branchId })
          .catch(err => ({ error: err.message })),
        finalizeIngredientAtomic(ingredient._id, 25, { orderId: new mongoose.Types.ObjectId(), userId, merchantId, branchId })
          .catch(err => ({ error: err.message })),
        finalizeIngredientAtomic(ingredient._id, 25, { orderId: new mongoose.Types.ObjectId(), userId, merchantId, branchId })
          .catch(err => ({ error: err.message })),
      ];

      const results = await Promise.all(finalizations);

      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);

      expect(successes.length).toBe(2);
      expect(failures.length).toBe(1);

      const final = await Ingredient.findById(ingredient._id);
      expect(final.reservedStock).toBe(10); // 60 - 25 - 25 = 10
      expect(final.currentStock).toBe(30); // 80 - 25 - 25 = 30
    });
  });

  describe('finalizeIngredients() - Full order finalization with rollback', () => {
    let menuItem1, menuItem2, ingredient1, ingredient2, ingredient3;

    beforeAll(async () => {
      // Create menu items
      menuItem1 = new mongoose.Types.ObjectId();
      menuItem2 = new mongoose.Types.ObjectId();

      // Create ingredients
      ingredient1 = await Ingredient.create({
        merchant: merchantId,
        name: 'Pasta Finalize',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 0,
        minStock: 10,
      });

      ingredient2 = await Ingredient.create({
        merchant: merchantId,
        name: 'Tomato Sauce Finalize',
        unit: 'liter',
        currentStock: 50,
        reservedStock: 0,
        minStock: 5,
      });

      ingredient3 = await Ingredient.create({
        merchant: merchantId,
        name: 'Cheese Finalize',
        unit: 'kg',
        currentStock: 30,
        reservedStock: 0,
        minStock: 5,
      });

      // Create recipes
      await Recipe.create({
        merchant: merchantId,
        menuItem: menuItem1,
        name: 'Pasta Recipe Finalize',
        items: [
          { ingredient: ingredient1._id, quantity: 0.2, unit: 'kg' },
          { ingredient: ingredient2._id, quantity: 0.1, unit: 'liter' },
        ],
        isActive: true,
      });

      await Recipe.create({
        merchant: merchantId,
        menuItem: menuItem2,
        name: 'Cheesy Pasta Recipe Finalize',
        items: [
          { ingredient: ingredient1._id, quantity: 0.2, unit: 'kg' },
          { ingredient: ingredient2._id, quantity: 0.1, unit: 'liter' },
          { ingredient: ingredient3._id, quantity: 0.05, unit: 'kg' },
        ],
        isActive: true,
      });
    });

    test('should finalize all ingredients for an order successfully', async () => {
      // First reserve the ingredients with proper precision
      await Ingredient.findByIdAndUpdate(ingredient1._id, { reservedStock: 0.60001 });
      await Ingredient.findByIdAndUpdate(ingredient2._id, { reservedStock: 0.30001 });
      await Ingredient.findByIdAndUpdate(ingredient3._id, { reservedStock: 0.05001 });

      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'FINALIZE-001',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        source: 'admin',
        table: new mongoose.Types.ObjectId(),
        items: [
          { 
            menuItem: menuItem1, 
            quantity: 2, 
            unitPrice: 50,
            totalPrice: 100,
          },
          { 
            menuItem: menuItem2, 
            quantity: 1, 
            unitPrice: 120,
            totalPrice: 120,
          },
        ],
        subtotal: 320,
        totalAmount: 320,
        status: 'pending',
      });

      const result = await finalizeIngredients(order._id, userId);

      expect(result.success).toBe(true);
      expect(result.finalizations.length).toBe(5); // 2 from recipe1 x2, 3 from recipe2 x1

      // Verify actual stock changes
      const updatedPasta = await Ingredient.findById(ingredient1._id);
      const updatedSauce = await Ingredient.findById(ingredient2._id);
      const updatedCheese = await Ingredient.findById(ingredient3._id);

      // Pasta: 0.6kg finalized, reserved should be ~0
      expect(updatedPasta.currentStock).toBeCloseTo(99.4, 1);
      expect(updatedPasta.reservedStock).toBeCloseTo(0, 1);

      // Tomato Sauce: 0.3L finalized, reserved should be ~0
      expect(updatedSauce.currentStock).toBeCloseTo(49.7, 1);
      expect(updatedSauce.reservedStock).toBeCloseTo(0, 1);

      // Cheese: 0.05kg finalized, reserved should be ~0
      expect(updatedCheese.currentStock).toBeCloseTo(29.95, 2);
      expect(updatedCheese.reservedStock).toBeCloseTo(0, 2);
    });

    test('should rollback all finalizations when one fails (mid-loop failure)', async () => {
      // First reserve the ingredients with proper precision
      await Ingredient.findByIdAndUpdate(ingredient1._id, { reservedStock: 0.60001, currentStock: 99.4 });
      await Ingredient.findByIdAndUpdate(ingredient2._id, { reservedStock: 0.30001, currentStock: 49.7 });
      // Leave cheese with no reservation (will fail)
      await Ingredient.findByIdAndUpdate(ingredient3._id, { reservedStock: 0 });

      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'FINALIZE-002',
        customerName: 'Test Customer',
        orderType: 'dine_in',
        source: 'admin',
        table: new mongoose.Types.ObjectId(),
        items: [
          { 
            menuItem: menuItem2, 
            quantity: 1, 
            unitPrice: 120,
            totalPrice: 120,
          },
        ],
        subtotal: 120,
        totalAmount: 120,
        status: 'pending',
      });

      await expect(
        finalizeIngredients(order._id, userId)
      ).rejects.toThrow(/Insufficient reserved stock/);

      // Verify pasta and sauce were rolled back
      const pastaAfter = await Ingredient.findById(ingredient1._id);
      const sauceAfter = await Ingredient.findById(ingredient2._id);

      // Reserved should be unchanged (rolled back)
      expect(pastaAfter.reservedStock).toBeCloseTo(0.60001, 1);
      expect(sauceAfter.reservedStock).toBeCloseTo(0.30001, 1);

      // Current stock should be unchanged from before the failed finalization
      expect(pastaAfter.currentStock).toBeCloseTo(99.4, 1);
      expect(sauceAfter.currentStock).toBeCloseTo(49.7, 1);

      // Verify CORRECTED history entries exist
      const corrections = await StockHistory.find({
        action: 'CORRECTED',
        ingredient: { $in: [ingredient1._id, ingredient2._id] },
      });

      expect(corrections.length).toBeGreaterThan(0);
    });

    test('should throw error when order not found', async () => {
      const fakeOrderId = new mongoose.Types.ObjectId();

      await expect(
        finalizeIngredients(fakeOrderId, userId)
      ).rejects.toThrow(/Order not found/);
    });

    test('should handle order with no recipes gracefully', async () => {
      const menuItemNoRecipe = new mongoose.Types.ObjectId();

      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'FINALIZE-004',
        customerName: 'Test Customer',
        orderType: 'takeaway',
        source: 'admin',
        table: new mongoose.Types.ObjectId(),
        items: [
          { 
            menuItem: menuItemNoRecipe, 
            quantity: 1, 
            unitPrice: 50,
            totalPrice: 50,
          },
        ],
        subtotal: 50,
        totalAmount: 50,
        status: 'pending',
      });

      const result = await finalizeIngredients(order._id, userId);

      expect(result.success).toBe(true);
      expect(result.finalizations.length).toBe(0);
    });
  });

  describe('rollbackFinalizations() - Rollback helper', () => {
    test('should restore reserved and current stock and create CORRECTED history entries', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Rollback Finalization',
        unit: 'kg',
        currentStock: 90,
        reservedStock: 0,
        minStock: 20,
      });

      const finalizations = [
        {
          ingredientId: ingredient._id,
          quantity: 10,
          previousReserved: 10,
          previousStock: 100,
        },
      ];

      const result = await rollbackFinalizations(finalizations, merchantId, branchId);

      expect(result.rolledBack).toBe(1);
      expect(result.errors.length).toBe(0);

      const updated = await Ingredient.findById(ingredient._id);
      expect(updated.currentStock).toBe(100);
      expect(updated.reservedStock).toBe(10);

      const history = await StockHistory.findOne({
        ingredient: ingredient._id,
        action: 'CORRECTED',
      });

      expect(history).toBeDefined();
      expect(history.quantity).toBe(10);
      expect(history.stockBefore).toBe(90);
      expect(history.stockAfter).toBe(100);
      expect(history.reservedBefore).toBe(0);
      expect(history.reservedAfter).toBe(10);
    });

    test('should handle partial rollback failures gracefully', async () => {
      const validIngredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Valid Rollback Finalize',
        unit: 'kg',
        currentStock: 90,
        reservedStock: 0,
        minStock: 10,
      });

      const fakeId = new mongoose.Types.ObjectId();

      const finalizations = [
        {
          ingredientId: validIngredient._id,
          quantity: 10,
          previousReserved: 10,
          previousStock: 100,
        },
        {
          ingredientId: fakeId,
          quantity: 5,
          previousReserved: 5,
          previousStock: 50,
        },
      ];

      const result = await rollbackFinalizations(finalizations, merchantId, branchId);

      // Valid ingredient succeeds, fake ID fails
      expect(result.rolledBack).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toBe('Ingredient not found during rollback');

      const updated = await Ingredient.findById(validIngredient._id);
      expect(updated.currentStock).toBe(100);
      expect(updated.reservedStock).toBe(10);
      
      // Verify no phantom history entry for fake ID
      const fakeHistory = await StockHistory.findOne({
        ingredient: fakeId,
        action: 'CORRECTED',
      });
      expect(fakeHistory).toBeNull();
    });

    test('should throw error when branchId is missing', async () => {
      const finalizations = [
        {
          ingredientId: new mongoose.Types.ObjectId(),
          quantity: 10,
          previousReserved: 10,
          previousStock: 100,
        },
      ];

      await expect(
        rollbackFinalizations(finalizations, merchantId, null)
      ).rejects.toThrow(/branchId is required/);
    });

    test('REGRESSION: rollbackFinalizations() correctly updates alertStatus when restoring from CRITICAL', async () => {
      // Create ingredient with reserved stock at LOW level
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Critical Rollback',
        unit: 'kg',
        currentStock: 25, // HIGH
        reservedStock: 10, // Reserved 10kg
        minStock: 20,
        alertStatus: 'OK',
      });

      expect(ingredient.alertStatus).toBe('OK');
      expect(ingredient.reservedStock).toBe(10);

      // Use real finalizeIngredientAtomic to move ingredient from OK to CRITICAL
      // This decrements both currentStock and reservedStock by 10 (finalizeQty)
      const finalized = await finalizeIngredientAtomic(
        ingredient._id,
        10,
        {
          orderId: new mongoose.Types.ObjectId(),
          userId,
          merchantId,
          branchId,
        }
      );

      // After finalization: currentStock 25 - 10 = 15, reservedStock 10 - 10 = 0
      expect(finalized.currentStock).toBe(15);
      expect(finalized.reservedStock).toBe(0);

      // Re-query to confirm hook recalculated to LOW
      let beforeRollback = await Ingredient.findById(ingredient._id);
      expect(beforeRollback.currentStock).toBe(15);
      expect(beforeRollback.reservedStock).toBe(0);
      expect(beforeRollback.alertStatus).toBe('LOW'); // 15 <= 20, so LOW

      // Now simulate rollback with correct before-state values
      const finalizations = [
        {
          ingredientId: ingredient._id,
          quantity: 10,
          previousReserved: 10, // It WAS reserved before finalization
          previousStock: 25, // It WAS 25 before finalization
        },
      ];

      // Rollback to restore both fields
      const result = await rollbackFinalizations(finalizations, merchantId, branchId);
      expect(result.rolledBack).toBe(1);

      // After rollback, verify { new: true } caused hook to fire with restored stock
      const restored = await Ingredient.findById(ingredient._id);
      expect(restored.currentStock).toBe(25);
      expect(restored.reservedStock).toBe(10); // Reserved amount restored too
      // Hook should have recalculated alertStatus: OK since 25 > minStock 20
      expect(restored.alertStatus).toBe('OK');
    });

    test('REGRESSION: rollbackDeductions() correctly updates alertStatus when restoring from OUT_OF_STOCK', async () => {
      // Import deductIngredientAtomic and rollbackDeductions for this test
      const { deductIngredientAtomic, rollbackDeductions } = require('../src/modules/inventory/service/stock.service');

      // Create ingredient at OUT_OF_STOCK
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Out Of Stock Rollback',
        unit: 'kg',
        currentStock: 0, // OUT_OF_STOCK
        minStock: 20,
        alertStatus: 'OUT_OF_STOCK',
      });

      expect(ingredient.alertStatus).toBe('OUT_OF_STOCK');

      // Simulate deduction that couldn't happen (will be rolled back)
      const deductions = [
        {
          ingredientId: ingredient._id,
          quantity: 10,
          previousStock: 10, // Restoring to 10 should be LOW (below minStock 20)
        },
      ];

      const result = await rollbackDeductions(deductions, merchantId, branchId);
      expect(result.rolledBack).toBe(1);

      // After rollback, verify { new: true } caused hook to fire with restored stock
      const restored = await Ingredient.findById(ingredient._id);
      expect(restored.currentStock).toBe(10);
      // Hook should have recalculated alertStatus: LOW since 10 < minStock 20 but > 0
      expect(restored.alertStatus).toBe('LOW');
    });
  });
});
