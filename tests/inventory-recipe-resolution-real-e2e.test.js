/**
 * @file tests/inventory-recipe-resolution-real-e2e.test.js
 * @description REAL end-to-end test: OrderService.staffPlaceOrder() with branch-scoped inventory deduction
 * 
 * This is THE critical test that proves the fix works:
 * MenuItem → Recipe (ingredientName) → Branch-scoped Ingredient → Order placement → Stock deduction
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
const { OrderService } = require('../src/modules/order/service/OrderService');
const { InventoryService } = require('../src/modules/inventory');

describe('REAL E2E: OrderService.staffPlaceOrder() with Branch-Scoped Inventory', () => {
  let merchant, branchA, branchB;
  let ingredientA_Chicken, ingredientB_Chicken;
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
      businessName: 'E2E Test Merchant',
      slug: 'e2e-test-' + Date.now(),
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@e2e.com',
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
    console.log(`✅ Merchant.hasFeature('inventory'): ${hasInventory}`);
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
      costPerUnit: 10,
    });

    ingredientB_Chicken = await Ingredient.create({
      merchant: merchantId,
      branch: branchBId,
      name: 'Chicken',
      unit: 'kg',
      currentStock: 50,
      category: 'meat',
      costPerUnit: 10,
    });

    console.log('\n📋 TEST SETUP:');
    console.log(`  Merchant: ${merchantId}`);
    console.log(`  Branch A stock: 100 kg`);
    console.log(`  Branch B stock: 50 kg`);
  });

  test('resolveDeductionPlan() resolves ingredientName → correct branch ID', async () => {
    console.log('\n🧪 TEST 1: resolveDeductionPlan() resolves ingredientName to correct branch ingredient');

    // Create recipe
    const recipe = await Recipe.create({
      merchant: merchantId,
      menuItem: new mongoose.Types.ObjectId(),
      name: 'Test Recipe 1',
      items: [
        {
          ingredientName: 'Chicken',
          quantity: 0.5,
          unit: 'kg',
        },
      ],
      isActive: true,
    });

    // Create MenuItem
    const Category = require('../models/Category');
    const MenuItem = require('../src/modules/menu/model/MenuItem.model');
    
    const category = await Category.create({
      merchant: merchantId,
      name: { en: 'Test Cat 1', am: 'ሙከራ 1' },
    });

    const menuItem = await MenuItem.create({
      merchant: merchantId,
      branch: branchAId,
      recipe: recipe._id,
      categoryId: category._id,
      name: { en: 'Test Item 1', am: 'ሙከራ 1' },
      price: 100,
      type: 'food',
    });

    // Update recipe to link to MenuItem
    await Recipe.findByIdAndUpdate(recipe._id, { menuItem: menuItem._id });

    // Build order items (what OrderService.buildOrderItems returns)
    const orderItems = [
      {
        menuItem: menuItem._id,  // ← Use 'menuItem' not 'menuItemId'
        quantity: 2,  // 2 portions = 1kg
      },
    ];

    console.log(`  Created MenuItem: ${menuItem._id}`);
    console.log(`  Created Recipe with ingredient: Chicken (0.5kg per portion)`);

    // Call resolveDeductionPlan with Branch A context
    const plan = await InventoryService.resolveDeductionPlan(
      orderItems,
      merchantId,
      branchAId
    );

    console.log(`  Resolved plan:`);
    console.log(`    - Ingredient ID: ${plan[0].ingredientId}`);
    console.log(`    - Total quantity: ${plan[0].totalQuantity} kg`);
    console.log(`    - Expected ingredient ID: ${ingredientA_Chicken._id}`);

    // Verify: resolved to Branch A's ingredient
    expect(plan).toHaveLength(1);
    expect(plan[0].ingredientId.toString()).toEqual(ingredientA_Chicken._id.toString());
    expect(plan[0].totalQuantity).toBe(1);  // 2 × 0.5

    console.log(`  ✅ Correctly resolved to Branch A's ingredient`);
  });

  test('resolveDeductionPlan() resolves to DIFFERENT ingredient when branch changes', async () => {
    console.log('\n🧪 TEST 2: Same recipe, different branch → different ingredient ID');

    // Create recipe
    const recipe = await Recipe.create({
      merchant: merchantId,
      menuItem: new mongoose.Types.ObjectId(),
      name: 'Test Recipe 2',
      items: [
        {
          ingredientName: 'Chicken',
          quantity: 0.5,
          unit: 'kg',
        },
      ],
      isActive: true,
    });

    // Create MenuItem for Branch B
    const Category = require('../models/Category');
    const MenuItem = require('../src/modules/menu/model/MenuItem.model');
    
    const category = await Category.create({
      merchant: merchantId,
      name: { en: 'Test Cat 2', am: 'ሙከራ 2' },
    });

    const menuItem = await MenuItem.create({
      merchant: merchantId,
      branch: branchBId,
      recipe: recipe._id,
      categoryId: category._id,
      name: { en: 'Test Item 2', am: 'ሙከራ 2' },
      price: 100,
      type: 'food',
    });

    // Update recipe to link to MenuItem
    await Recipe.findByIdAndUpdate(recipe._id, { menuItem: menuItem._id });

    // Order items
    const orderItems = [
      {
        menuItem: menuItem._id,  // ← Use 'menuItem' not 'menuItemId'
        quantity: 1,  // 1 portion = 0.5kg
      },
    ];

    console.log(`  Created MenuItem for Branch B`);

    // Call resolveDeductionPlan with Branch B context
    const planBranchB = await InventoryService.resolveDeductionPlan(
      orderItems,
      merchantId,
      branchBId
    );

    console.log(`  Resolved for Branch B:`);
    console.log(`    - Ingredient ID: ${planBranchB[0].ingredientId}`);
    console.log(`    - Expected ingredient ID: ${ingredientB_Chicken._id}`);

    // Verify: resolved to Branch B's ingredient (NOT Branch A's)
    expect(planBranchB[0].ingredientId.toString()).toEqual(ingredientB_Chicken._id.toString());
    expect(planBranchB[0].ingredientId.toString()).not.toEqual(ingredientA_Chicken._id.toString());

    console.log(`  ✅ Correctly resolved to Branch B's ingredient (different from Branch A)`);
  });

  test('⭐ OrderService.staffPlaceOrder() actually deducts stock from correct branch', async () => {
    console.log('\n🧪 TEST 3: ⭐ REAL TEST — OrderService.staffPlaceOrder() → actual stock deduction');

    // Register Task model for User pre-save hook
    const Task = require('../models/taskModel');
    mongoose.model('Task', require('../models/taskModel').schema || require('../models/taskModel'));

    // Create all necessary entities
    const Table = require('../models/tabelModel');
    const User = require('../models/userModel');
    const Role = require('../models/roleModel');
    const Category = require('../models/Category');
    const MenuItem = require('../src/modules/menu/model/MenuItem.model');

    // Create table
    const table = await Table.create({
      merchant: merchantId,
      branch: branchAId,
      tableNumber: 1,
      capacity: 4,
      status: 'available',
    });

    // Create role
    const staffRole = await Role.create({
      name: 'Staff',
      description: 'Staff user',
      merchant: merchantId,
      isSystemRole: false,
      tasks: [],
    });

    // Create staff user
    const staffUser = await User.create({
      merchant: merchantId,
      email: `staff-${Date.now()}@e2e.com`,
      firstName: 'Staff',
      lastName: 'Tester',
      phone: `+251911${String(Date.now()).slice(-6)}`,
      password: 'TestPassword123!',
      passwordConfirm: 'TestPassword123!',
      role: staffRole._id,
      isActive: true,
    });

    // Create category
    const category = await Category.create({
      merchant: merchantId,
      name: { en: 'Mains', am: 'ዋናዎች' },
    });

    // Create recipe with ingredientName format
    const recipe = await Recipe.create({
      merchant: merchantId,
      menuItem: new mongoose.Types.ObjectId(),  // Will update this
      name: 'Doro Wat Recipe',
      items: [
        {
          ingredientName: 'Chicken',
          quantity: 0.5,  // 500g per portion
          unit: 'kg',
        },
      ],
      isActive: true,
    });

    // Create MenuItem linked to recipe
    const menuItem = await MenuItem.create({
      merchant: merchantId,
      branch: branchAId,
      recipe: recipe._id,
      categoryId: category._id,
      name: { en: 'Doro Wat', am: 'ዶሮ ዋት' },
      description: { en: 'Chicken stew', am: 'የዶሮ ሥጋ ዩርዓ' },
      price: 250,
      type: 'food',
    });

    // Update recipe to link to MenuItem
    await Recipe.findByIdAndUpdate(recipe._id, { menuItem: menuItem._id });

    // Reset stocks
    await Ingredient.findByIdAndUpdate(ingredientA_Chicken._id, { currentStock: 100 });
    await Ingredient.findByIdAndUpdate(ingredientB_Chicken._id, { currentStock: 50 });

    console.log(`  BEFORE ORDER:`);
    console.log(`    - Branch A Chicken: 100 kg`);
    console.log(`    - Branch B Chicken: 50 kg`);

    // ⭐ Call the REAL OrderService.staffPlaceOrder()
    console.log(`\n  Calling OrderService.staffPlaceOrder()...`);
    console.log(`    - Branch: ${branchAId}`);
    console.log(`    - Items: 2x Doro Wat (0.5kg Chicken each = 1kg total)`);

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
      {}  // req object
    );

    console.log(`  Order created: ${order.orderNumber}`);

    // Verify stocks changed correctly
    const ingA_After = await Ingredient.findById(ingredientA_Chicken._id);
    const ingB_After = await Ingredient.findById(ingredientB_Chicken._id);

    console.log(`\n  AFTER ORDER:`);
    console.log(`    - Branch A Chicken: ${ingA_After.currentStock} kg (was 100, expected 99)`);
    console.log(`    - Branch B Chicken: ${ingB_After.currentStock} kg (was 50, expected 50)`);

    // ✅ ASSERTION: Stock actually deducted from correct branch
    expect(ingA_After.currentStock).toBe(99);  // 100 - 1kg deducted
    expect(ingB_After.currentStock).toBe(50);  // Unchanged

    console.log(`\n✅ TEST PASSED — Real order placement correctly deducted stock from Branch A only`);
  });
});

