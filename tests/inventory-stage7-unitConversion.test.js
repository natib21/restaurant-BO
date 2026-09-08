const mongoose = require('mongoose');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');

describe('Stage 7: Unit Conversion Validation', () => {
  let merchantId, branchId, ingredientId;
  let testCounter = 0;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test');
    }

    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 100000);
    const merchant = await Merchant.create({
      businessName: `Test Restaurant ${timestamp}`,
      slug: `test-restaurant-${timestamp}`,
      phone: `+251912345${randomSuffix.toString().slice(-3)}`, // Last 3 digits of random
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: `owner-${timestamp}@test.com`,
        phone: `+251987654${randomSuffix.toString().slice(-3)}`,
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
        formattedAddress: '123 Main St',
      },
      phone: `+251912111${randomSuffix.toString().slice(-3)}`,
      isActive: true,
    });
    branchId = branch._id;

    const ingredient = await Ingredient.create({
      merchant: merchantId,
      name: 'Test Flour',
      unit: 'kg',
      currentStock: 100,
      minStock: 20,
      alertStatus: 'OK',
    });
    ingredientId = ingredient._id;
  });

  // Helper to generate unique menuItem ID (just use ObjectId, don't create in DB)
  const getMenuItemId = () => {
    return new mongoose.Types.ObjectId();
  };

  afterAll(async () => {
    await Ingredient.deleteMany({ name: /Test/ });
    await Recipe.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({ businessName: /Test Restaurant/ });
    await mongoose.connection.close();
  });

  describe('Unit Validation - Matching Units', () => {
    test('should allow recipe when ingredient and recipe units match (kg)', async () => {
      const menuItemId = getMenuItemId();
      const recipe = await Recipe.create({
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with matching units',
        items: [
          {
            ingredient: ingredientId,
            quantity: 2,
            unit: 'kg', // Matches ingredient unit
          },
        ],
      });

      expect(recipe).toBeDefined();
      expect(recipe.items[0].unit).toBe('kg');
    });

    test('should allow recipe when multiple ingredients have matching units', async () => {
      const menuItemId = getMenuItemId();
      // Create another ingredient with same unit
      const flour = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Flour 2',
        unit: 'kg',
        currentStock: 50,
        minStock: 10,
      });

      const sugar = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Sugar',
        unit: 'kg',
        currentStock: 30,
        minStock: 10,
      });

      const recipe = await Recipe.create({
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with multiple ingredients',
        items: [
          {
            ingredient: flour._id,
            quantity: 2,
            unit: 'kg',
          },
          {
            ingredient: sugar._id,
            quantity: 1,
            unit: 'kg',
          },
        ],
      });

      expect(recipe.items.length).toBe(2);
      expect(recipe.items[0].unit).toBe('kg');
      expect(recipe.items[1].unit).toBe('kg');

      await Ingredient.findByIdAndDelete(flour._id);
      await Ingredient.findByIdAndDelete(sugar._id);
    });
  });

  describe('Unit Validation - Mismatched Units', () => {
    test('should reject recipe when ingredient unit is kg but recipe uses g', async () => {
      const menuItemId = getMenuItemId();
      const recipeData = {
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with unit mismatch',
        items: [
          {
            ingredient: ingredientId,
            quantity: 2000,
            unit: 'g', // Ingredient is kg
          },
        ],
      };

      await expect(Recipe.create(recipeData)).rejects.toThrow(/Unit mismatch/);
      await expect(Recipe.create(recipeData)).rejects.toThrow(/uses g but ingredient.*is stocked in kg/);
    });

    test('should reject recipe when ingredient unit is kg but recipe uses liter', async () => {
      const menuItemId = getMenuItemId();
      const recipeData = {
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with incompatible units',
        items: [
          {
            ingredient: ingredientId,
            quantity: 2,
            unit: 'liter', // Ingredient is kg (incompatible)
          },
        ],
      };

      await expect(Recipe.create(recipeData)).rejects.toThrow(/Unit mismatch/);
    });

    test('should reject recipe when ingredient unit is kg but recipe uses pieces', async () => {
      const menuItemId = getMenuItemId();
      const recipeData = {
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with pieces unit mismatch',
        items: [
          {
            ingredient: ingredientId,
            quantity: 10,
            unit: 'pieces', // Ingredient is kg
          },
        ],
      };

      await expect(Recipe.create(recipeData)).rejects.toThrow(/Unit mismatch/);
    });

    test('should include ingredient name in error message', async () => {
      const menuItemId = getMenuItemId();
      const recipeData = {
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with named error',
        items: [
          {
            ingredient: ingredientId,
            quantity: 1,
            unit: 'liter',
          },
        ],
      };

      await expect(Recipe.create(recipeData)).rejects.toThrow(/Test Flour/);
    });
  });

  describe('Unit Validation - Invalid Ingredient', () => {
    test('should reject recipe when ingredient does not exist', async () => {
      const menuItemId = getMenuItemId();
      const fakeId = new mongoose.Types.ObjectId();
      const recipeData = {
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with missing ingredient',
        items: [
          {
            ingredient: fakeId,
            quantity: 1,
            unit: 'kg',
          },
        ],
      };

      await expect(Recipe.create(recipeData)).rejects.toThrow(/Ingredient.*not found/);
    });
  });

  describe('Unit Validation - Mixed Validation (Multiple Items)', () => {
    test('should reject when one item has matching unit and one has mismatched unit', async () => {
      const menuItemId = getMenuItemId();
      const flour = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Flour 3',
        unit: 'kg',
        currentStock: 50,
        minStock: 10,
      });

      const eggs = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Eggs',
        unit: 'pieces',
        currentStock: 30,
        minStock: 10,
      });

      const recipeData = {
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with mixed validation',
        items: [
          {
            ingredient: flour._id,
            quantity: 2,
            unit: 'kg', // Matches
          },
          {
            ingredient: eggs._id,
            quantity: 12,
            unit: 'ml', // Mismatches (eggs are pieces)
          },
        ],
      };

      await expect(Recipe.create(recipeData)).rejects.toThrow(/Unit mismatch/);
      await expect(Recipe.create(recipeData)).rejects.toThrow(/Test Eggs/);

      await Ingredient.findByIdAndDelete(flour._id);
      await Ingredient.findByIdAndDelete(eggs._id);
    });
  });

  describe('Unit Validation - All Supported Units', () => {
    const supportedUnits = ['kg', 'g', 'liter', 'ml', 'pieces', 'boxes', 'cans'];

    test.each(supportedUnits)('should allow recipe with unit: %s', async (unit) => {
      const menuItemId = getMenuItemId();
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: `Test Ingredient ${unit}`,
        unit,
        currentStock: 100,
        minStock: 10,
      });

      const recipe = await Recipe.create({
        merchant: merchantId,
        menuItem: menuItemId,
        name: `Recipe with ${unit}`,
        items: [
          {
            ingredient: ingredient._id,
            quantity: 1,
            unit, // Matches ingredient unit
          },
        ],
      });

      expect(recipe.items[0].unit).toBe(unit);

      await Ingredient.findByIdAndDelete(ingredient._id);
    });
  });

  describe('Cost Calculation With Unit Validation', () => {
    test('should calculate total cost correctly when units match', async () => {
      const menuItemId = getMenuItemId();
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Ingredient for Cost',
        unit: 'kg',
        currentStock: 100,
        minStock: 10,
        costPerUnit: 10, // $10 per kg
      });

      const recipe = await Recipe.create({
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe with cost calculation',
        items: [
          {
            ingredient: ingredient._id,
            quantity: 2, // 2kg
            unit: 'kg',
          },
        ],
        yield: 1,
      });

      // Cost should be 2 * 10 = 20, then divide by yield (1) = 20
      expect(recipe.totalCost).toBe(20);

      await Ingredient.findByIdAndDelete(ingredient._id);
    });

    test('should reject recipe with mismatched units before calculating cost', async () => {
      const menuItemId = getMenuItemId();
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Ingredient for Cost Mismatch',
        unit: 'kg',
        currentStock: 100,
        minStock: 10,
        costPerUnit: 10,
      });

      const recipeData = {
        merchant: merchantId,
        menuItem: menuItemId,
        name: 'Recipe that fails unit check',
        items: [
          {
            ingredient: ingredient._id,
            quantity: 2,
            unit: 'g', // Mismatch
          },
        ],
        yield: 1,
      };

      // Should fail at unit validation, never reach cost calculation
      await expect(Recipe.create(recipeData)).rejects.toThrow(/Unit mismatch/);

      await Ingredient.findByIdAndDelete(ingredient._id);
    });
  });
});
