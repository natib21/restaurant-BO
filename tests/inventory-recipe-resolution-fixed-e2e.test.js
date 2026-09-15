/**
 * @file tests/inventory-recipe-resolution-fixed-e2e.test.js
 * @description REAL end-to-end test: OrderService.staffPlaceOrder() with branch-scoped inventory deduction
 * 
 * Tests 1 & 2: resolveDeductionPlan() with production OrderItem shape (from buildOrderItems())
 * Test 3: Real full-stack order placement with stock verification
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

describe('E2E: Inventory Resolution with Branch Scoping', () => {
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

    // Create merchant WITH inventory enabled
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
          inventory: { enabled: true },
          orders: { enabled: true },
        },
      },
    });
    merchantId = merchant._id;

    // Create branches
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

    // Create same ingredient name, different stocks per branch
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

    console.log('\n📋 Setup: 2 branches, same ingredient name, different stocks');
  });

  test('resolveDeductionPlan() with production OrderItem shape (from buildOrderItems)', async () => {
    console.log('\n🧪 TEST 1: resolveDeductionPlan() expects orderItem.menuItem (production shape)');
    console.log('   NOTE: resolveDeductionPlan() receives ONLY processed OrderItems from buildOrderItems()');
    console.log('   Shape: { menuItem: ObjectId, quantity, name, unitPrice, ... } (NOT menuItemId)');

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
      categoryId: category._id,
      name: { en: 'Test Item 1', am: 'ሙከራ 1' },
      price: 100,
      type: 'food',
    });

    // Create recipe
    const recipe = await Recipe.create({
      merchant: merchantId,
      menuItem: menuItem._id,
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

    // Update MenuItem to link recipe
    await MenuItem.findByIdAndUpdate(menuItem._id, { recipe: recipe._id });

    // Simulate buildOrderItems() output shape
    const orderItems = [
      {
        menuItem: menuItem._id,  // ✅ menuItem (ObjectId), NOT menuItemId
        quantity: 2,
        name: 'Test Item 1',
        unitPrice: 100,
        unitCost: 0,
        totalPrice: 200,
        notes: '',
        requiresKitchen: true,
      },
    ];

    console.log(`  Production OrderItem shape:`);
    console.log(`    - menuItem: ${orderItems[0].menuItem}`);
    console.log(`    - quantity: ${orderItems[0].quantity}`);

    const plan = await InventoryService.resolveDeductionPlan(
      orderItems,
      merchantId,
      branchAId
    );

    console.log(`  Resolved:`);
    console.log(`    - Ingredient ID: ${plan[0].ingredientId}`);
    console.log(`    - Quantity to deduct: ${plan[0].totalQuantity} kg`);

    expect(plan).toHaveLength(1);
    expect(plan[0].ingredientId.toString()).toEqual(ingredientA_Chicken._id.toString());
    expect(plan[0].totalQuantity).toBe(1);  // 2 × 0.5

    console.log(`  ✅ Correctly resolved with production OrderItem.menuItem shape`);
  });

  test('resolveDeductionPlan() with different branchId resolves to different ingredient', async () => {
    console.log('\n🧪 TEST 2: branchId parameter isolates ingredient lookup');

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
      categoryId: category._id,
      name: { en: 'Test Item 2', am: 'ሙከራ 2' },
      price: 100,
      type: 'food',
    });

    // Create recipe (same ingredient name as Test 1)
    const recipe = await Recipe.create({
      merchant: merchantId,
      menuItem: menuItem._id,
      name: 'Test Recipe 2',
      items: [
        {
          ingredientName: 'Chicken',  // Same name as Test 1
          quantity: 0.5,
          unit: 'kg',
        },
      ],
      isActive: true,
    });

    await MenuItem.findByIdAndUpdate(menuItem._id, { recipe: recipe._id });

    // Same MenuItem/recipe as Test 1, but different branchId passed to resolveDeductionPlan
    const orderItems = [
      {
        menuItem: menuItem._id,
        quantity: 1,
        name: 'Test Item 2',
        unitPrice: 100,
        unitCost: 0,
        totalPrice: 100,
        notes: '',
        requiresKitchen: true,
      },
    ];

    console.log(`  Same recipe, but calling resolveDeductionPlan() with branchBId`);

    const planBranchB = await InventoryService.resolveDeductionPlan(
      orderItems,
      merchantId,
      branchBId  // ← Different branch context
    );

    console.log(`  Resolved:`);
    console.log(`    - Ingredient ID: ${planBranchB[0].ingredientId}`);
    console.log(`    - Expected (Branch B): ${ingredientB_Chicken._id}`);

    // Should resolve to Branch B's ingredient, NOT Branch A's
    expect(planBranchB[0].ingredientId.toString()).toEqual(ingredientB_Chicken._id.toString());
    expect(planBranchB[0].ingredientId.toString()).not.toEqual(ingredientA_Chicken._id.toString());

    console.log(`  ✅ branchId parameter correctly isolated ingredient lookup to Branch B`);
  });

  test('⭐ Real OrderService.staffPlaceOrder() end-to-end stock deduction', async () => {
    console.log('\n🧪 TEST 3: ⭐ REAL — OrderService.staffPlaceOrder() → actual stock deduction');

    // Register models for User pre-save hook
    const Task = require('../models/taskModel');
    mongoose.model('Task', require('../models/taskModel').schema || require('../models/taskModel'));

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

    // Create role and user
    const staffRole = await Role.create({
      name: 'Staff',
      description: 'Staff user role',
      merchant: merchantId,
      isSystemRole: false,
      tasks: [],
    });

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
      menuItem: new mongoose.Types.ObjectId(),
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

    // Call real OrderService.staffPlaceOrder()
    console.log(`  Placing order: 2x Doro Wat on Branch A (0.5kg Chicken each = 1kg total)`);

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
      {}
    );

    console.log(`  Order created: ${order.orderNumber}`);

    // Verify stock changes
    const ingA_After = await Ingredient.findById(ingredientA_Chicken._id);
    const ingB_After = await Ingredient.findById(ingredientB_Chicken._id);

    console.log(`  AFTER ORDER:`);
    console.log(`    - Branch A Chicken: ${ingA_After.currentStock} kg (deducted 1kg) ✅`);
    console.log(`    - Branch B Chicken: ${ingB_After.currentStock} kg (unchanged) ✅`);

    expect(ingA_After.currentStock).toBe(99);  // 100 - 1
    expect(ingB_After.currentStock).toBe(50);  // Unchanged

    console.log(`  ✅ Real order placement correctly deducted stock from Branch A only`);
  });
});
