// tests/inventory-stage3-deduction.test.js
const mongoose = require('mongoose');
const Ingredient = require('../models/Ingredient');
const StockHistory = require('../models/StockHistory');
const Order = require('../models/orderModel');
const Recipe = require('../models/Recipe');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Menu = require('../models/branchMenuModel');
const {
  deductIngredientAtomic,
  deductIngredients,
  rollbackDeductions,
} = require('../src/modules/inventory/service/stock.service');

describe('Stage 3: Stock Deduction Functions', () => {
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

  describe('deductIngredientAtomic() - Single ingredient deduction', () => {
    test('should atomically deduct stock and create history entry', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Tomatoes Atomic',
        unit: 'kg',
        currentStock: 100,
        minStock: 20,
      });

      const orderId = new mongoose.Types.ObjectId();
      
      const updated = await deductIngredientAtomic(
        ingredient._id,
        10,
        {
          orderId,
          userId,
          merchantId,
          branchId,
        }
      );

      expect(updated.currentStock).toBe(90);
      
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
      expect(history.branch.toString()).toBe(branchId.toString());
    });

    test('should update alertStatus via hooks after deduction', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Onions Atomic',
        unit: 'kg',
        currentStock: 25,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('OK');

      await deductIngredientAtomic(
        ingredient._id,
        10,
        {
          orderId: new mongoose.Types.ObjectId(),
          userId,
          merchantId,
          branchId,
        }
      );

      const refreshed = await Ingredient.findById(ingredient._id);
      expect(refreshed.currentStock).toBe(15);
      expect(refreshed.alertStatus).toBe('LOW');
    });

    test('should reject deduction when insufficient stock', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Garlic Insufficient',
        unit: 'kg',
        currentStock: 5,
        minStock: 20,
      });

      await expect(
        deductIngredientAtomic(
          ingredient._id,
          10,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        )
      ).rejects.toThrow(/Insufficient stock/);

      // Stock should remain unchanged
      const unchanged = await Ingredient.findById(ingredient._id);
      expect(unchanged.currentStock).toBe(5);
    });

    test('should reject deduction when ingredient not found', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        deductIngredientAtomic(
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

    test('should reject deduction when ingredient is inactive', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Inactive Ingredient',
        unit: 'kg',
        currentStock: 50,
        minStock: 20,
        isActive: false,
      });

      await expect(
        deductIngredientAtomic(
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
        name: 'Test Branch Missing',
        unit: 'kg',
        currentStock: 50,
        minStock: 20,
      });

      await expect(
        deductIngredientAtomic(
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
  });

  describe('Concurrency Tests - Race condition protection', () => {
    test('should handle concurrent deductions without over-deducting', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Concurrent Tomatoes',
        unit: 'kg',
        currentStock: 100,
        minStock: 20,
      });

      // Simulate 5 concurrent deductions of 25kg each
      // Only 4 should succeed (100kg available / 25kg each = 4)
      const deductions = Array(5).fill(null).map((_, i) =>
        deductIngredientAtomic(
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

      const results = await Promise.all(deductions);

      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);

      // Exactly 4 should succeed, 1 should fail
      expect(successes.length).toBe(4);
      expect(failures.length).toBe(1);
      expect(failures[0].error).toMatch(/Insufficient stock/);

      // Final stock should be 0
      const final = await Ingredient.findById(ingredient._id);
      expect(final.currentStock).toBe(0);
    });

    test('should handle concurrent deductions at exact boundary', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Boundary Concurrent',
        unit: 'kg',
        currentStock: 50,
        minStock: 20,
      });

      // Two concurrent deductions of 30kg each
      // Only one should succeed (50kg available, need 30kg each)
      const deductions = [
        deductIngredientAtomic(
          ingredient._id,
          30,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        ).catch(err => ({ error: err.message })),
        deductIngredientAtomic(
          ingredient._id,
          30,
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        ).catch(err => ({ error: err.message })),
      ];

      const results = await Promise.all(deductions);

      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      const final = await Ingredient.findById(ingredient._id);
      expect(final.currentStock).toBe(20);
    });
  });

  describe('deductIngredients() - Full order deduction with rollback', () => {
    let menuItem1, menuItem2, ingredient1, ingredient2, ingredient3;

    beforeAll(async () => {
      // Create menu items
      menuItem1 = new mongoose.Types.ObjectId();
      menuItem2 = new mongoose.Types.ObjectId();

      // Create ingredients
      ingredient1 = await Ingredient.create({
        merchant: merchantId,
        name: 'Pasta',
        unit: 'kg',
        currentStock: 100,
        minStock: 10,
      });

      ingredient2 = await Ingredient.create({
        merchant: merchantId,
        name: 'Tomato Sauce',
        unit: 'liter',
        currentStock: 50,
        minStock: 5,
      });

      ingredient3 = await Ingredient.create({
        merchant: merchantId,
        name: 'Cheese',
        unit: 'kg',
        currentStock: 30,
        minStock: 5,
      });

      // Create recipes
      await Recipe.create({
        merchant: merchantId,
        menuItem: menuItem1,
        name: 'Pasta Recipe',
        items: [
          { ingredient: ingredient1._id, quantity: 0.2, unit: 'kg' },
          { ingredient: ingredient2._id, quantity: 0.1, unit: 'liter' },
        ],
        isActive: true,
      });

      await Recipe.create({
        merchant: merchantId,
        menuItem: menuItem2,
        name: 'Cheesy Pasta Recipe',
        items: [
          { ingredient: ingredient1._id, quantity: 0.2, unit: 'kg' },
          { ingredient: ingredient2._id, quantity: 0.1, unit: 'liter' },
          { ingredient: ingredient3._id, quantity: 0.05, unit: 'kg' },
        ],
        isActive: true,
      });
    });

    test('should deduct all ingredients for an order successfully', async () => {
      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'TEST-001',
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

      const result = await deductIngredients(order._id, userId);

      expect(result.success).toBe(true);
      expect(result.deductions.length).toBe(5); // 2 from recipe1 x2, 3 from recipe2 x1

      // Verify actual stock changes
      const updatedPasta = await Ingredient.findById(ingredient1._id);
      const updatedSauce = await Ingredient.findById(ingredient2._id);
      const updatedCheese = await Ingredient.findById(ingredient3._id);

      // Pasta: 2*0.2 + 1*0.2 = 0.6kg deducted
      expect(updatedPasta.currentStock).toBeCloseTo(99.4, 1);

      // Tomato Sauce: 2*0.1 + 1*0.1 = 0.3L deducted
      expect(updatedSauce.currentStock).toBeCloseTo(49.7, 1);

      // Cheese: 1*0.05 = 0.05kg deducted
      expect(updatedCheese.currentStock).toBeCloseTo(29.95, 2);
    });

    test('should rollback all deductions when one fails (mid-loop failure)', async () => {
      // Set ingredient3 (cheese) to very low stock
      await Ingredient.findByIdAndUpdate(ingredient3._id, {
        currentStock: 0.02, // Not enough for 0.05kg needed
      });

      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'TEST-002',
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
        deductIngredients(order._id, userId)
      ).rejects.toThrow(/Insufficient stock/);

      // Verify pasta and sauce were rolled back
      const pastaAfter = await Ingredient.findById(ingredient1._id);
      const sauceAfter = await Ingredient.findById(ingredient2._id);

      // Stock should be unchanged from before the failed deduction
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
        deductIngredients(fakeOrderId, userId)
      ).rejects.toThrow(/Order not found/);
    });

    // Note: "order missing branch" path is defensive-only and cannot be reached
    // through normal Order.create() since branch is a required field in the schema

    test('should handle order with no recipes gracefully', async () => {
      const menuItemNoRecipe = new mongoose.Types.ObjectId();

      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'TEST-004',
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

      const result = await deductIngredients(order._id, userId);

      expect(result.success).toBe(true);
      expect(result.deductions.length).toBe(0);
    });
  });

  describe('rollbackDeductions() - Rollback helper', () => {
    test('should restore stock and create CORRECTED history entries', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Rollback Ingredient',
        unit: 'kg',
        currentStock: 50,
        minStock: 20,
      });

      const deductions = [
        {
          ingredientId: ingredient._id,
          quantity: 10,
          previousStock: 60,
        },
      ];

      const result = await rollbackDeductions(deductions, merchantId, branchId);

      expect(result.rolledBack).toBe(1);
      expect(result.errors.length).toBe(0);

      const updated = await Ingredient.findById(ingredient._id);
      expect(updated.currentStock).toBe(60);

      const history = await StockHistory.findOne({
        ingredient: ingredient._id,
        action: 'CORRECTED',
      });

      expect(history).toBeDefined();
      expect(history.quantity).toBe(10);
      expect(history.stockBefore).toBe(50);
      expect(history.stockAfter).toBe(60);
    });

    test('should handle partial rollback failures gracefully', async () => {
      const validIngredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Valid Rollback',
        unit: 'kg',
        currentStock: 30,
        minStock: 10,
      });

      const fakeId = new mongoose.Types.ObjectId();

      const deductions = [
        {
          ingredientId: validIngredient._id,
          quantity: 5,
          previousStock: 35,
        },
        {
          ingredientId: fakeId,
          quantity: 3,
          previousStock: 20,
        },
      ];

      const result = await rollbackDeductions(deductions, merchantId, branchId);

      // Valid ingredient succeeds, fake ID fails
      expect(result.rolledBack).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toBe('Ingredient not found during rollback');

      const updated = await Ingredient.findById(validIngredient._id);
      expect(updated.currentStock).toBe(35);
      
      // Verify no phantom history entry for fake ID
      const fakeHistory = await StockHistory.findOne({
        ingredient: fakeId,
        action: 'CORRECTED',
      });
      expect(fakeHistory).toBeNull();
    });

    test('should throw error when branchId is missing', async () => {
      const deductions = [
        {
          ingredientId: new mongoose.Types.ObjectId(),
          quantity: 5,
          previousStock: 10,
        },
      ];

      await expect(
        rollbackDeductions(deductions, merchantId, null)
      ).rejects.toThrow(/branchId is required/);
    });

    test('REGRESSION: rollbackDeductions() correctly updates alertStatus when restoring from OUT_OF_STOCK', async () => {
      // Create ingredient at OUT_OF_STOCK
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Out Of Stock Rollback Stage3',
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
