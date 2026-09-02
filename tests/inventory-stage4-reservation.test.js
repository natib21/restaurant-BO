// tests/inventory-stage4-reservation.test.js
const mongoose = require('mongoose');
const Ingredient = require('../models/Ingredient');
const StockHistory = require('../models/StockHistory');
const Order = require('../models/orderModel');
const Recipe = require('../models/Recipe');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Menu = require('../models/branchMenuModel');
const {
  reserveIngredientAtomic,
  reserveIngredients,
  releaseReservations,
} = require('../src/modules/inventory/service/stock.service');

describe('Stage 4: Stock Reservation Functions', () => {
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

  describe('reserveIngredientAtomic() - Single ingredient reservation', () => {
    test('should atomically reserve stock and create history entry', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Tomatoes Reserve',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 0,
        minStock: 20,
      });

      const orderId = new mongoose.Types.ObjectId();
      
      const updated = await reserveIngredientAtomic(
        ingredient._id,
        10,
        {
          orderId,
          userId,
          merchantId,
          branchId,
        }
      );

      expect(updated.reservedStock).toBe(10);
      expect(updated.currentStock).toBe(100); // currentStock unchanged
      
      // Verify history entry was created
      const history = await StockHistory.findOne({
        ingredient: ingredient._id,
        action: 'RESERVED',
        orderId,
      });
      
      expect(history).toBeDefined();
      expect(history.quantity).toBe(10);
      expect(history.stockBefore).toBe(100); // currentStock unchanged during reservation
      expect(history.stockAfter).toBe(100);  // currentStock unchanged during reservation
      expect(history.reservedBefore).toBe(0);
      expect(history.reservedAfter).toBe(10);
      expect(history.branch.toString()).toBe(branchId.toString());
    });

    test('should reject reservation when insufficient available stock', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Onions Insufficient Reserve',
        unit: 'kg',
        currentStock: 30,
        reservedStock: 25, // 30 - 25 = 5 available
        minStock: 10,
      });

      await expect(
        reserveIngredientAtomic(
          ingredient._id,
          10, // Need 10, only 5 available
          {
            orderId: new mongoose.Types.ObjectId(),
            userId,
            merchantId,
            branchId,
          }
        )
      ).rejects.toThrow(/Insufficient available stock/);

      // Stock should remain unchanged
      const unchanged = await Ingredient.findById(ingredient._id);
      expect(unchanged.reservedStock).toBe(25);
    });

    test('should reject reservation when ingredient not found', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        reserveIngredientAtomic(
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

    test('should reject reservation when ingredient is inactive', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Inactive Reserve',
        unit: 'kg',
        currentStock: 50,
        reservedStock: 0,
        minStock: 20,
        isActive: false,
      });

      await expect(
        reserveIngredientAtomic(
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
        name: 'Test Branch Missing Reserve',
        unit: 'kg',
        currentStock: 50,
        reservedStock: 0,
        minStock: 20,
      });

      await expect(
        reserveIngredientAtomic(
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

    test('should correctly handle reservation when available stock equals required qty', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Exact Reserve',
        unit: 'kg',
        currentStock: 50,
        reservedStock: 40, // 50 - 40 = 10 available, need exactly 10
        minStock: 10,
      });

      const updated = await reserveIngredientAtomic(
        ingredient._id,
        10,
        {
          orderId: new mongoose.Types.ObjectId(),
          userId,
          merchantId,
          branchId,
        }
      );

      expect(updated.reservedStock).toBe(50);
    });
  });

  describe('Concurrency Tests - Race condition protection for reservations', () => {
    test('should handle concurrent reservations without over-reserving', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Concurrent Reserve',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 0,
        minStock: 20,
      });

      // Simulate 5 concurrent reservations of 25kg each
      // Only 4 should succeed (100kg available / 25kg each = 4)
      const reservations = Array(5).fill(null).map((_, i) =>
        reserveIngredientAtomic(
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

      const results = await Promise.all(reservations);

      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);

      // Exactly 4 should succeed, 1 should fail
      expect(successes.length).toBe(4);
      expect(failures.length).toBe(1);
      expect(failures[0].error).toMatch(/Insufficient available stock/);

      // Final reserved should be 100
      const final = await Ingredient.findById(ingredient._id);
      expect(final.reservedStock).toBe(100);
    });

    test('should handle concurrent reservations with partial deductions', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Concurrent Mixed',
        unit: 'kg',
        currentStock: 80,
        reservedStock: 20, // 80 - 20 = 60 available
        minStock: 10,
      });

      // Try 3 concurrent reservations of 25kg each
      // Only 2 should succeed (60 available / 25kg each = 2 with 10 left)
      const reservations = [
        reserveIngredientAtomic(ingredient._id, 25, { orderId: new mongoose.Types.ObjectId(), userId, merchantId, branchId })
          .catch(err => ({ error: err.message })),
        reserveIngredientAtomic(ingredient._id, 25, { orderId: new mongoose.Types.ObjectId(), userId, merchantId, branchId })
          .catch(err => ({ error: err.message })),
        reserveIngredientAtomic(ingredient._id, 25, { orderId: new mongoose.Types.ObjectId(), userId, merchantId, branchId })
          .catch(err => ({ error: err.message })),
      ];

      const results = await Promise.all(reservations);

      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);

      expect(successes.length).toBe(2);
      expect(failures.length).toBe(1);

      const final = await Ingredient.findById(ingredient._id);
      expect(final.reservedStock).toBe(70); // 20 + 25 + 25 = 70
    });
  });

  describe('reserveIngredients() - Full order reservation with release', () => {
    let menuItem1, menuItem2, ingredient1, ingredient2, ingredient3;

    beforeAll(async () => {
      // Create menu items
      menuItem1 = new mongoose.Types.ObjectId();
      menuItem2 = new mongoose.Types.ObjectId();

      // Create ingredients
      ingredient1 = await Ingredient.create({
        merchant: merchantId,
        name: 'Pasta Reserve',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 0,
        minStock: 10,
      });

      ingredient2 = await Ingredient.create({
        merchant: merchantId,
        name: 'Tomato Sauce Reserve',
        unit: 'liter',
        currentStock: 50,
        reservedStock: 0,
        minStock: 5,
      });

      ingredient3 = await Ingredient.create({
        merchant: merchantId,
        name: 'Cheese Reserve',
        unit: 'kg',
        currentStock: 30,
        reservedStock: 0,
        minStock: 5,
      });

      // Create recipes
      await Recipe.create({
        merchant: merchantId,
        menuItem: menuItem1,
        name: 'Pasta Recipe Reserve',
        items: [
          { ingredient: ingredient1._id, quantity: 0.2, unit: 'kg' },
          { ingredient: ingredient2._id, quantity: 0.1, unit: 'liter' },
        ],
        isActive: true,
      });

      await Recipe.create({
        merchant: merchantId,
        menuItem: menuItem2,
        name: 'Cheesy Pasta Recipe Reserve',
        items: [
          { ingredient: ingredient1._id, quantity: 0.2, unit: 'kg' },
          { ingredient: ingredient2._id, quantity: 0.1, unit: 'liter' },
          { ingredient: ingredient3._id, quantity: 0.05, unit: 'kg' },
        ],
        isActive: true,
      });
    });

    test('should reserve all ingredients for an order successfully', async () => {
      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'RESERVE-001',
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

      const result = await reserveIngredients(order._id, userId);

      expect(result.success).toBe(true);
      expect(result.reservations.length).toBe(5); // 2 from recipe1 x2, 3 from recipe2 x1

      // Verify actual reserved stock changes
      const updatedPasta = await Ingredient.findById(ingredient1._id);
      const updatedSauce = await Ingredient.findById(ingredient2._id);
      const updatedCheese = await Ingredient.findById(ingredient3._id);

      // Pasta: 2*0.2 + 1*0.2 = 0.6kg reserved
      expect(updatedPasta.reservedStock).toBeCloseTo(0.6, 1);

      // Tomato Sauce: 2*0.1 + 1*0.1 = 0.3L reserved
      expect(updatedSauce.reservedStock).toBeCloseTo(0.3, 1);

      // Cheese: 1*0.05 = 0.05kg reserved
      expect(updatedCheese.reservedStock).toBeCloseTo(0.05, 2);
    });

    test('should release all reservations when one fails (mid-loop failure)', async () => {
      // Set ingredient3 (cheese) to very low available stock
      await Ingredient.findByIdAndUpdate(ingredient3._id, {
        currentStock: 0.02, // 0.02 - 0 = 0.02 available, need 0.05
        reservedStock: 0,
      });

      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'RESERVE-002',
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
        reserveIngredients(order._id, userId)
      ).rejects.toThrow(/Insufficient available stock/);

      // Verify pasta and sauce were released
      const pastaAfter = await Ingredient.findById(ingredient1._id);
      const sauceAfter = await Ingredient.findById(ingredient2._id);

      // Reserved should be unchanged from before the failed reservation
      expect(pastaAfter.reservedStock).toBeCloseTo(0.6, 1);
      expect(sauceAfter.reservedStock).toBeCloseTo(0.3, 1);

      // Verify RELEASED history entries exist
      const releases = await StockHistory.find({
        action: 'RELEASED',
        ingredient: { $in: [ingredient1._id, ingredient2._id] },
      });

      expect(releases.length).toBeGreaterThan(0);
    });

    test('should throw error when order not found', async () => {
      const fakeOrderId = new mongoose.Types.ObjectId();

      await expect(
        reserveIngredients(fakeOrderId, userId)
      ).rejects.toThrow(/Order not found/);
    });

    test('should handle order with no recipes gracefully', async () => {
      const menuItemNoRecipe = new mongoose.Types.ObjectId();

      const order = await Order.create({
        merchant: merchantId,
        branch: branchId,
        orderNumber: 'RESERVE-004',
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

      const result = await reserveIngredients(order._id, userId);

      expect(result.success).toBe(true);
      expect(result.reservations.length).toBe(0);
    });
  });

  describe('releaseReservations() - Release (cancel) helper', () => {
    test('should restore reservedStock and create RELEASED history entries', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Release Ingredient',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 10,
        minStock: 20,
      });

      const reservations = [
        {
          ingredientId: ingredient._id,
          quantity: 10,
          previousReserved: 0,
        },
      ];

      const result = await releaseReservations(reservations, merchantId, branchId);

      expect(result.released).toBe(1);
      expect(result.errors.length).toBe(0);

      const updated = await Ingredient.findById(ingredient._id);
      expect(updated.reservedStock).toBe(0);

      const history = await StockHistory.findOne({
        ingredient: ingredient._id,
        action: 'RELEASED',
      });

      expect(history).toBeDefined();
      expect(history.quantity).toBe(10);
      expect(history.reservedBefore).toBe(10);
      expect(history.reservedAfter).toBe(0);
    });

    test('should handle partial release failures gracefully', async () => {
      const validIngredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Valid Release',
        unit: 'kg',
        currentStock: 100,
        reservedStock: 5,
        minStock: 10,
      });

      const fakeId = new mongoose.Types.ObjectId();

      const reservations = [
        {
          ingredientId: validIngredient._id,
          quantity: 5,
          previousReserved: 0,
        },
        {
          ingredientId: fakeId,
          quantity: 3,
          previousReserved: 3,
        },
      ];

      const result = await releaseReservations(reservations, merchantId, branchId);

      // Valid ingredient succeeds, fake ID fails
      expect(result.released).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toBe('Ingredient not found during release');

      const updated = await Ingredient.findById(validIngredient._id);
      expect(updated.reservedStock).toBe(0);
      
      // Verify no phantom history entry for fake ID
      const fakeHistory = await StockHistory.findOne({
        ingredient: fakeId,
        action: 'RELEASED',
      });
      expect(fakeHistory).toBeNull();
    });

    test('should throw error when branchId is missing', async () => {
      const reservations = [
        {
          ingredientId: new mongoose.Types.ObjectId(),
          quantity: 5,
          previousReserved: 0,
        },
      ];

      await expect(
        releaseReservations(reservations, merchantId, null)
      ).rejects.toThrow(/branchId is required/);
    });
  });
});
