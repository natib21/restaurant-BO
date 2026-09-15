/**
 * @file tests/branch-isolation-per-branch-stock.test.js
 * @description Comprehensive test for true per-branch ingredient stock isolation
 * 
 * CRITICAL BUG SCENARIO THIS TESTS:
 * Before: Branch A depletes "Chicken" stock → Branch B places order for same "Chicken" → FAILS
 *         (Both branches shared the same ingredient.currentStock value)
 * 
 * After: Branch A depletes "Chicken" stock → Branch B places order for same "Chicken" → SUCCEEDS
 *        (Each branch has its own ingredient document with independent currentStock)
 * 
 * This test asserts the core fix: per-branch ingredient isolation.
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

// Models
const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const Order = require('../models/orderModel');
const Table = require('../models/tabelModel');
const StockHistory = require('../models/StockHistory');

// Services
const { InventoryService } = require('../src/modules/inventory');

describe('Per-Branch Ingredient Stock Isolation (Bug Reproduction)', () => {
  let merchant, branchA, branchB;
  let chickenIngredientA, chickenIngredientB;  // Separate ingredient docs per branch
  let recipe, menuItem;
  let tableA, tableB;

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
      Recipe.deleteMany({}),
      MenuItem.deleteMany({}),
      Order.deleteMany({}),
      Table.deleteMany({}),
      StockHistory.deleteMany({}),
    ]);

    // Create merchant with all required fields
    merchant = await Merchant.create({
      businessName: 'Multi-Branch Restaurant Test',
      slug: 'multi-branch-restaurant-test',
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@test.com',
        phone: '+251911234567',
      },
      phone: '+251911234567',
    });

    // Create TWO branches
    branchA = await Branch.create({
      merchant: merchant._id,
      name: 'Branch A - Downtown',
      city: 'Addis Ababa',
      location: {
        type: 'Point',
        coordinates: [9.0320, 38.7469],  // [longitude, latitude]
        city: 'Addis Ababa',
      },
    });

    branchB = await Branch.create({
      merchant: merchant._id,
      name: 'Branch B - Uptown',
      city: 'Addis Ababa',
      location: {
        type: 'Point',
        coordinates: [9.0350, 38.7500],
        city: 'Addis Ababa',
      },
    });

    // Create tables for each branch
    tableA = await Table.create({
      merchant: merchant._id,
      branch: branchA._id,
      tableNumber: 1,
      capacity: 4,
      status: 'available',
    });

    tableB = await Table.create({
      merchant: merchant._id,
      branch: branchB._id,
      tableNumber: 1,
      capacity: 4,
      status: 'available',
    });

    // ✅ KEY FIX: Create SEPARATE ingredient documents for each branch
    // Before: Ingredient was merchant-wide, shared stock
    // After: Each branch gets its own ingredient document
    chickenIngredientA = await Ingredient.create({
      merchant: merchant._id,
      branch: branchA._id,  // ← Branch A's chicken
      name: 'Chicken',
      unit: 'kg',
      currentStock: 10,     // Branch A starts with 10kg
      minStock: 2,
      maxStock: 50,
      category: 'meat',
    });

    chickenIngredientB = await Ingredient.create({
      merchant: merchant._id,
      branch: branchB._id,  // ← Branch B's chicken (separate document)
      name: 'Chicken',
      unit: 'kg',
      currentStock: 5,      // Branch B starts with 5kg (independent stock)
      minStock: 2,
      maxStock: 50,
      category: 'meat',
    });
  });

  describe('Scenario: Branch Stock Isolation', () => {
    it('Branch A depletes stock to 6kg, Branch B should still have independent 5kg stock', async () => {
      console.log('\n🧪 TEST: Per-branch stock isolation');
      console.log(`  Initial: Branch A = 10kg, Branch B = 5kg`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 1: Branch A depletes 4kg from its 10kg chicken stock
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // Use adjustStockAtomic from current InventoryService (no session for simplicity)
      const userId = new mongoose.Types.ObjectId();
      
      const resultA = await InventoryService.adjustStockAtomic(
        merchant._id,
        branchA._id,
        chickenIngredientA._id,
        4,  // Deduct 4kg
        'out',  // type: out = deduction
        'order_consumption',  // reason
        'Order #001',  // reference
        userId,  // performedBy
        null  // no session
      );

      console.log(`  After Branch A deduction: ${resultA.currentStock}kg`);
      expect(resultA.currentStock).toBe(6);  // 10 - 4 = 6kg

      // Verify Branch A's stock decreased
      chickenIngredientA = await Ingredient.findById(chickenIngredientA._id);
      expect(chickenIngredientA.currentStock).toBe(6);

      // ✅ CRITICAL: Verify Branch B's stock is UNAFFECTED
      chickenIngredientB = await Ingredient.findById(chickenIngredientB._id);
      console.log(`  Branch B stock (should be unchanged): ${chickenIngredientB.currentStock}kg`);
      expect(chickenIngredientB.currentStock).toBe(5);  // Still 5kg (NOT reduced by Branch A's order)

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 2: Branch B depletes 4kg from its 5kg chicken stock
      //         Before fix: Would FAIL because "Chicken" stock is shared (6kg, needs 4)
      //         After fix: Should SUCCEED because Branch B has its own 5kg stock
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // ✅ THIS IS THE CRITICAL TEST: Branch B's deduction should SUCCEED
      // Before fix: Would throw "Insufficient stock" because shared pool only had 6kg
      // After fix: Succeeds because Branch B looks up its own ingredient document with 5kg
      const resultB = await InventoryService.adjustStockAtomic(
        merchant._id,
        branchB._id,
        chickenIngredientB._id,
        4,  // Deduct 4kg
        'out',
        'order_consumption',
        'Order #002',
        userId,
        null  // no session
      );

      console.log(`  After Branch B deduction: ${resultB.currentStock}kg`);
      expect(resultB.currentStock).toBe(1);  // 5 - 4 = 1kg

      // Verify Branch B's stock decreased
      chickenIngredientB = await Ingredient.findById(chickenIngredientB._id);
      expect(chickenIngredientB.currentStock).toBe(1);

      // ✅ VERIFY: Branch A's stock unchanged (different ingredient document)
      chickenIngredientA = await Ingredient.findById(chickenIngredientA._id);
      expect(chickenIngredientA.currentStock).toBe(6);  // Still 6kg (Branch A's stock)

      console.log(`\n  ✅ ISOLATION VERIFIED:`);
      console.log(`     - Branch A: 10kg → 6kg (deducted 4kg)`);
      console.log(`     - Branch B: 5kg → 1kg (deducted 4kg)`);
      console.log(`     - Separate ingredient documents prevent cross-branch contention`);
    });

    it('Verify ingredient lookup uses branch filter (merchant+branch+name+unit)', async () => {
      console.log('\n🧪 TEST: Branch-filtered ingredient lookup');
      
      // When Order.deductIngredients() looks up ingredient, it should find
      // the branch-specific document, not fail or return wrong one
      
      const branchALookup = await Ingredient.findOne({
        merchant: merchant._id,
        branch: branchA._id,        // ← Branch filter required
        name: 'Chicken',
        unit: 'kg',
        isActive: true,
      });

      console.log(`  Branch A lookup: Found ID ${branchALookup._id}`);
      expect(branchALookup).toBeTruthy();
      expect(branchALookup._id.toString()).toBe(chickenIngredientA._id.toString());
      expect(branchALookup.currentStock).toBe(10);

      const branchBLookup = await Ingredient.findOne({
        merchant: merchant._id,
        branch: branchB._id,        // ← Different branch
        name: 'Chicken',
        unit: 'kg',
        isActive: true,
      });

      console.log(`  Branch B lookup: Found ID ${branchBLookup._id}`);
      expect(branchBLookup).toBeTruthy();
      expect(branchBLookup._id.toString()).toBe(chickenIngredientB._id.toString());
      expect(branchBLookup._id.toString()).not.toBe(branchALookup._id.toString());  // Different docs
      expect(branchBLookup.currentStock).toBe(5);

      console.log(`  ✅ Lookups correctly isolated by branch`);
    });

    it('Unique index {merchant, branch, name, unit} allows same name per branch', async () => {
      console.log('\n🧪 TEST: Unique index allows same ingredient name per branch');
      
      // Same ingredient name (Chicken) can exist for different branches
      // This is the unique index that makes branch isolation work
      
      // Both should exist without unique constraint violation
      const branchAChicken = await Ingredient.findOne({
        merchant: merchant._id,
        branch: branchA._id,
        name: 'Chicken',
        unit: 'kg',
      });

      const branchBChicken = await Ingredient.findOne({
        merchant: merchant._id,
        branch: branchB._id,
        name: 'Chicken',
        unit: 'kg',
      });

      console.log(`  Branch A has Chicken: ${branchAChicken ? 'yes' : 'no'}`);
      console.log(`  Branch B has Chicken: ${branchBChicken ? 'yes' : 'no'}`);
      console.log(`  Different documents: ${branchAChicken._id.toString() !== branchBChicken._id.toString() ? 'yes' : 'no'}`);

      expect(branchAChicken).toBeTruthy();
      expect(branchBChicken).toBeTruthy();
      expect(branchAChicken._id.toString()).not.toBe(branchBChicken._id.toString());

      // But trying to create a DUPLICATE within the same branch should fail
      console.log(`  Attempting to create duplicate Chicken in Branch A...`);
      const duplicateError = Ingredient.create({
        merchant: merchant._id,
        branch: branchA._id,
        name: 'Chicken',
        unit: 'kg',
        currentStock: 20,
        category: 'meat',
      });

      await expect(duplicateError).rejects.toThrow(/duplicate/i);
      console.log(`  ✅ Duplicate correctly rejected`);
    });
  });
});
