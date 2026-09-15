/**
 * @file tests/inventory-recipe-resolution-e2e.test.js
 * @description End-to-end test: Full order placement flow with branch-scoped inventory
 * 
 * CRITICAL TEST: Proves the fix for recipe-to-ingredient resolution.
 * Traces: MenuItem → Recipe (ingredientName) → Branch-scoped Ingredient → Order placement → Stock deduction
 * 
 * This test would have caught the bug: accessing item.ingredient._id when schema field is ingredientName.
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

// Models
const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');
const Order = require('../models/orderModel');

// Services
const { InventoryService } = require('../src/modules/inventory');

describe('E2E: Recipe Resolution with Branch-Scoped Inventory', () => {
  let merchant, branchA, branchB;
  let ingredientA_Chicken, ingredientB_Chicken;
  let recipeId, menuItemId;
  let merchantId, branchAId, branchBId;

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
    ]);

    // Create merchant WITH inventory feature enabled
    merchant = await Merchant.create({
      businessName: 'Recipe Resolution Test',
      slug: 'recipe-resolution-test-' + Date.now(),
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@recipe.com',
        phone: '+251911234567',
      },
      phone: '+251911234567',
      features: {
        core: {
          menu: { enabled: true },
          tableManagement: { enabled: true },
        },
        optional: {
          inventory: { enabled: true },  // ✅ CRITICAL: Enable inventory feature
          orders: { enabled: true },
        },
      },
    });
    merchantId = merchant._id;

    // Verify hasFeature works
    const hasInventory = merchant.hasFeature('inventory');
    console.log(`\n📋 Merchant.hasFeature('inventory'): ${hasInventory}`);
    if (!hasInventory) {
      throw new Error('Merchant inventory feature not enabled!');
    }

    // Create two branches
    branchA = await Branch.create({
      merchant: merchantId,
      name: 'Branch A',
      city: 'Addis Ababa',
      location: {
        type: 'Point',
        coordinates: [9.0320, 38.7469],
        city: 'Addis Ababa',
      },
    });
    branchAId = branchA._id;

    branchB = await Branch.create({
      merchant: merchantId,
      name: 'Branch B',
      city: 'Dire Dawa',
      location: {
        type: 'Point',
        coordinates: [9.6412, 41.8722],
        city: 'Dire Dawa',
      },
    });
    branchBId = branchB._id;

    // Create same ingredient name, but DIFFERENT stocks per branch
    ingredientA_Chicken = await Ingredient.create({
      merchant: merchantId,
      branch: branchAId,
      name: 'Chicken',
      unit: 'kg',
      currentStock: 100,
      category: 'meat',
      costPerUnit: 10,  // Required for recipe pre-save validation
    });

    ingredientB_Chicken = await Ingredient.create({
      merchant: merchantId,
      branch: branchBId,
      name: 'Chicken',
      unit: 'kg',
      currentStock: 50, // Different stock per branch
      category: 'meat',
      costPerUnit: 10,  // Required for recipe pre-save validation
    });

    // Create recipe using ingredientName (String), NOT ObjectId
    const recipe = await Recipe.create({
      merchant: merchantId,
      menuItem: new mongoose.Types.ObjectId(),  // Will be updated per test with actual MenuItem
      name: 'Doro Wat Recipe',
      items: [
        {
          ingredientName: 'Chicken',  // ✅ Name-based resolution
          quantity: 0.5,              // 500g per serving
          unit: 'kg',
        },
      ],
      yield: 1,
      isActive: true,
    });
    recipeId = recipe._id;

    console.log('\n📋 TEST SETUP:');
    console.log(`  Merchant: ${merchantId}`);
    console.log(`  Branch A: ${branchAId}`);
    console.log(`  Branch B: ${branchBId}`);
    console.log(`  Ingredient (shared name "Chicken")`);
    console.log(`    - Branch A stock: 100 kg`);
    console.log(`    - Branch B stock: 50 kg`);
    console.log(`  Recipe items: [{ ingredientName: "Chicken", qty: 0.5 kg }]`);
  });

  describe('Core: resolveDeductionPlan() resolves by ingredientName', () => {
    test('Should resolve ingredientName to correct branch ingredient ObjectId', async () => {
      console.log('\n🧪 TEST 1: resolveDeductionPlan resolves ingredientName correctly');

      // First, verify the recipe exists
      const recipeCheck = await Recipe.findById(recipeId);
      console.log(`  Recipe found: ${recipeCheck ? 'yes' : 'no'}`);
      console.log(`  Recipe items: ${JSON.stringify(recipeCheck?.items)}`);

      // Create a MenuItem to reference this recipe
      const Category = require('../models/Category');
      const category = await Category.create({
        merchant: merchantId,
        name: { en: 'Test Category', am: 'ሙከራ ክፍል' },
      });

      const MenuItem = require('../src/modules/menu/model/MenuItem.model');
      const testMenuItem = await MenuItem.create({
        merchant: merchantId,
        branch: branchAId,
        recipe: recipeId,
        categoryId: category._id,
        name: { en: 'Test Item', am: 'ሙከራ ቁስ' },
        price: 100,
        type: 'food',
      });

      const orderItems = [
        {
          menuItemId: testMenuItem._id,
          quantity: 2,  // 2 portions × 0.5kg = 1kg total
        },
      ];

      // ✅ CRITICAL: resolveDeductionPlan must pass branchId for correct ingredient resolution
      const plan = await InventoryService.resolveDeductionPlan(
        orderItems,
        merchantId,
        branchAId  // For Branch A
      );

      console.log(`  Order items: 2x menu item`);
      console.log(`  Branch: ${branchAId}`);
      console.log(`  Resolution result:`);
      console.log(`    - Ingredient count: ${plan.length}`);
      if (plan.length > 0) {
        console.log(`    - Ingredient ID: ${plan[0].ingredientId}`);
        console.log(`    - Total quantity to deduct: ${plan[0].totalQuantity} kg`);
      } else {
        console.log(`    - PLAN IS EMPTY!`);
      }

      // Verify deduction plan
      expect(plan).toHaveLength(1);
      expect(plan[0].ingredientId).toEqual(ingredientA_Chicken._id);  // Branch A's chicken
      expect(plan[0].totalQuantity).toBe(1);  // 2 × 0.5kg
    });

    test('Should resolve to DIFFERENT ingredient when branch changes', async () => {
      console.log('\n🧪 TEST 2: Same recipe, different branch = different ingredient ID');

      // Create a MenuItem to reference this recipe
      const Category = require('../models/Category');
      const category = await Category.create({
        merchant: merchantId,
        name: { en: 'Test Category 2', am: 'ሙከራ ክፍል 2' },
      });

      const MenuItem = require('../src/modules/menu/model/MenuItem.model');
      const testMenuItem2 = await MenuItem.create({
        merchant: merchantId,
        branch: branchBId,
        recipe: recipeId,
        categoryId: category._id,
        name: { en: 'Test Item 2', am: 'ሙከራ ቁስ 2' },
        price: 100,
        type: 'food',
      });

      const orderItems = [
        {
          menuItemId: testMenuItem2._id,
          quantity: 1,
        },
      ];

      // Same order, but Branch B
      const planBranchB = await InventoryService.resolveDeductionPlan(
        orderItems,
        merchantId,
        branchBId
      );

      console.log(`  Same recipe, Branch B context`);
      console.log(`  Resolved ingredient ID: ${planBranchB[0].ingredientId}`);

      expect(planBranchB[0].ingredientId).toEqual(ingredientB_Chicken._id);  // Branch B's chicken
      expect(planBranchB[0].ingredientId).not.toEqual(ingredientA_Chicken._id);
    });

    test('Should throw error if ingredient name not found for branch', async () => {
      console.log('\n🧪 TEST 3: Error when ingredientName not found in branch');

      // Create a recipe with non-existent ingredient name
      const badMenuItemId = new mongoose.Types.ObjectId();
      
      // Expect the create to fail validation
      console.log(`  Trying to create recipe with non-existent ingredientName: "Unicorn Meat"`);

      try {
        await Recipe.create({
          merchant: merchantId,
          menuItem: badMenuItemId,
          name: 'Bad Recipe',
          items: [
            {
              ingredientName: 'Unicorn Meat',  // Doesn't exist
              quantity: 1,
              unit: 'kg',
            },
          ],
          isActive: true,
        });
        // Should not reach here
        throw new Error('Recipe.create() should have thrown validation error');
      } catch (err) {
        console.log(`  ✓ Correctly threw error: ${err.message}`);
        expect(err.message).toContain('not found for this merchant');
      }
    });
  });

  describe('Integration: Full stock deduction with atomic transactions', () => {
    test('Should deduct from correct branch when deductForOrder is called', async () => {
      console.log('\n🧪 TEST 4: Atomic deduction from correct branch');

      // Initial stocks
      let ingA = await Ingredient.findById(ingredientA_Chicken._id);
      let ingB = await Ingredient.findById(ingredientB_Chicken._id);
      console.log(`  Before deduction:`);
      console.log(`    - Branch A Chicken: ${ingA.currentStock} kg`);
      console.log(`    - Branch B Chicken: ${ingB.currentStock} kg`);

      expect(ingA.currentStock).toBe(100);
      expect(ingB.currentStock).toBe(50);

      // Create deduction plan (2 portions = 1kg)
      const plan = await InventoryService.resolveDeductionPlan(
        [{ menuItemId, quantity: 2 }],
        merchantId,
        branchAId
      );

      console.log(`  Deduction plan: ${plan[0].totalQuantity} kg from ingredient ${plan[0].ingredientId}`);

      // Execute atomic deduction
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await InventoryService.deductForOrder(
            {
              merchantId,
              branchId: branchAId,
              orderNumber: 'TEST-001',
              plan,
              performedBy: new mongoose.Types.ObjectId(),
            },
            session
          );
        });
      } finally {
        session.endSession();
      }

      // Verify stocks changed correctly
      ingA = await Ingredient.findById(ingredientA_Chicken._id);
      ingB = await Ingredient.findById(ingredientB_Chicken._id);

      console.log(`  After deduction:`);
      console.log(`    - Branch A Chicken: ${ingA.currentStock} kg (was 100, deducted 1)`);
      console.log(`    - Branch B Chicken: ${ingB.currentStock} kg (should be unchanged)`);

      // Branch A deducted by 1kg
      expect(ingA.currentStock).toBe(99);
      // Branch B unchanged
      expect(ingB.currentStock).toBe(50);
    });

    test('Should deduct from Branch B when deduction targets Branch B', async () => {
      console.log('\n🧪 TEST 5: Same recipe, different branch = different stock depleted');

      const plan = await InventoryService.resolveDeductionPlan(
        [{ menuItemId, quantity: 1 }],
        merchantId,
        branchBId
      );

      console.log(`  Branch B deduction plan: ${plan[0].totalQuantity} kg`);

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await InventoryService.deductForOrder(
            {
              merchantId,
              branchId: branchBId,
              orderNumber: 'TEST-002',
              plan,
              performedBy: new mongoose.Types.ObjectId(),
            },
            session
          );
        });
      } finally {
        session.endSession();
      }

      // Verify Branch B deducted, Branch A unchanged
      const ingA = await Ingredient.findById(ingredientA_Chicken._id);
      const ingB = await Ingredient.findById(ingredientB_Chicken._id);

      console.log(`  Stock after Branch B deduction:`);
      console.log(`    - Branch A: ${ingA.currentStock} kg (unchanged)`);
      console.log(`    - Branch B: ${ingB.currentStock} kg (deducted 0.5)`);

      expect(ingA.currentStock).toBe(100);  // Unchanged
      expect(ingB.currentStock).toBe(49.5);  // 50 - 0.5
    });

    test('Real OrderService.staffPlaceOrder() deducts stock correctly', async () => {
      console.log('\n🧪 TEST 6: REAL TEST — OrderService.staffPlaceOrder() → actual stock deduction');

      // Import OrderService
      const { OrderService } = require('../src/modules/order/service/OrderService');
      const Table = require('../models/tabelModel');
      const User = require('../models/userModel');
      const Role = require('../models/roleModel');
      const Task = require('../models/taskModel');  // Register Task model

      // Ensure models are registered
      mongoose.model('Role', require('../models/roleModel').schema || require('../models/roleModel'));
      mongoose.model('Task', require('../models/taskModel').schema || require('../models/taskModel'));

      // Create a role for the staff user
      const staffRole = await Role.create({
        name: 'Staff',
        description: 'Staff user',
        merchant: merchantId,
        isSystemRole: false,
        tasks: [],  // Empty tasks array
      });

      // Create a table for dine-in order
      const table = await Table.create({
        merchant: merchantId,
        branch: branchAId,
        tableNumber: 1,
        capacity: 4,
        status: 'available',
      });

      // Create a staff user (for performedBy)
      const staffUser = await User.create({
        merchant: merchantId,
        email: `staff-${Date.now()}@test.com`,
        firstName: 'Staff',
        lastName: 'Tester',
        phone: `+251911${String(Date.now()).slice(-6)}`,  // Unique phone per test
        password: 'TestPassword123!',
        passwordConfirm: 'TestPassword123!',
        role: staffRole._id,
        isActive: true,
      });

      // Create a Category first
      const Category = require('../models/Category');
      const category = await Category.create({
        merchant: merchantId,
        name: { en: 'Mains', am: 'ዋናዎች' },
        displayOrder: 1,
      });

      // Create a MenuItem to order
      const MenuItem = require('../src/modules/menu/model/MenuItem.model');
      const menuItem = await MenuItem.create({
        merchant: merchantId,
        branch: branchAId,
        recipe: recipeId,
        categoryId: category._id,
        name: { en: 'Doro Wat', am: 'ዶሮ ዋት' },
        description: { en: 'Spicy chicken stew', am: 'ሙቀትሙ ደግ የዶሮ ሥጋ' },
        price: 250,
        type: 'food',
        available: true,
      });

      // Reset stocks
      await Ingredient.findByIdAndUpdate(ingredientA_Chicken._id, { currentStock: 100 });
      await Ingredient.findByIdAndUpdate(ingredientB_Chicken._id, { currentStock: 50 });

      console.log(`  Initial stocks:`);
      console.log(`    - Branch A Chicken: 100 kg`);
      console.log(`    - Branch B Chicken: 50 kg`);
      console.log(`  Calling OrderService.staffPlaceOrder()...`);
      console.log(`    - Items: 1x Doro Wat (recipe: 0.5kg Chicken per portion)`);
      console.log(`    - Table: ${table.tableNumber}`);
      console.log(`    - Branch: ${branchAId}`);

      // Call the REAL OrderService.staffPlaceOrder()
      const order = await OrderService.staffPlaceOrder(
        {
          items: [
            {
              menuItemId: menuItem._id,
              quantity: 2,  // 2 portions = 1kg chicken
            },
          ],
          tableId: table._id,
          orderType: 'dine_in',
          customerName: 'Test Customer',
          branchId: branchAId,
          performedBy: staffUser._id,
          performedByName: staffUser.firstName,
          merchantId,
          source: 'waiter',
        },
        {}  // req object (not strictly needed for this test)
      );

      console.log(`  Order created: ${order.orderNumber}`);
      console.log(`  Reading stock after order placement...`);

      // Verify stocks actually changed
      const ingA_After = await Ingredient.findById(ingredientA_Chicken._id);
      const ingB_After = await Ingredient.findById(ingredientB_Chicken._id);

      console.log(`  After OrderService.staffPlaceOrder():`);
      console.log(`    - Branch A Chicken: ${ingA_After.currentStock} kg (expected 99)`);
      console.log(`    - Branch B Chicken: ${ingB_After.currentStock} kg (expected 50)`);

      // Assert stock deduction actually happened
      expect(ingA_After.currentStock).toBe(99);  // 100 - 1
      expect(ingB_After.currentStock).toBe(50);  // Unchanged

      console.log(`  ✓ Real order placement PASSED — inventory deducted correctly`);
    });
  });

  describe('Regression: Old bug would crash here', () => {
    test('getIngredientUsageForMenuItem no longer accesses undefined item.ingredient', async () => {
      console.log('\n🧪 TEST 7: REGRESSION — accessing item.ingredient._id would crash');

      // Create a MenuItem to reference this recipe
      const Category = require('../models/Category');
      const category = await Category.create({
        merchant: merchantId,
        name: { en: 'Test Category Reg', am: 'ሙከራ ክፍል ሬግ' },
      });

      const MenuItem = require('../src/modules/menu/model/MenuItem.model');
      const regMenuItem = await MenuItem.create({
        merchant: merchantId,
        branch: branchAId,
        recipe: recipeId,
        categoryId: category._id,
        name: { en: 'Regression Test Item', am: 'ሪግሬሽን ሙከራ ቁስ' },
        price: 100,
        type: 'food',
      });

      console.log(`  Calling getIngredientUsageForMenuItem...`);
      console.log(`  (Old code would crash: Cannot read property '_id' of undefined)`);

      // This should NOT throw
      const usage = await InventoryService.getIngredientUsageForMenuItem(
        regMenuItem._id,
        merchantId,
        branchAId
      );

      console.log(`  ✓ Successfully resolved without crash`);
      console.log(`  Result: ingredientId=${usage[0].ingredientId}, qty=${usage[0].quantity}`);

      expect(usage).toHaveLength(1);
      expect(usage[0].ingredientId).toEqual(ingredientA_Chicken._id);
      expect(usage[0].quantity).toBe(0.5);
    });
  });
});
