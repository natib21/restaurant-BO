// tests/inventory-stage2-hooks.test.js
const mongoose = require('mongoose');
const Ingredient = require('../models/Ingredient');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');

describe('Stage 2: alertStatus Hooks and Legacy Methods', () => {
  let merchantId, branchId;

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
  });

  afterAll(async () => {
    await Ingredient.deleteMany({ merchant: merchantId });
    await Branch.deleteMany({ merchant: merchantId });
    await Merchant.deleteMany({ _id: merchantId });
    await mongoose.connection.close();
  });

  describe('Hook 1: pre(save) - Auto-update alertStatus', () => {
    test('should set alertStatus to OUT_OF_STOCK when currentStock <= 0', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Tomatoes',
        unit: 'kg',
        currentStock: 0,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('OUT_OF_STOCK');
    });

    test('should set alertStatus to CRITICAL when currentStock < minStock * 0.5', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Onions',
        unit: 'kg',
        currentStock: 9,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('CRITICAL');
    });

    test('should set alertStatus to LOW when currentStock <= minStock (boundary test)', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Garlic',
        unit: 'kg',
        currentStock: 20,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('LOW');
    });

    test('should set alertStatus to LOW when currentStock is between minStock * 0.5 and minStock', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Peppers',
        unit: 'kg',
        currentStock: 15,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('LOW');
    });

    test('should set alertStatus to CRITICAL when currentStock === minStock * 0.5 exactly', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Carrots',
        unit: 'kg',
        currentStock: 10,
        minStock: 20,
      });

      // CRITICAL uses < (not <=), so exactly at half should be LOW
      expect(ingredient.alertStatus).toBe('LOW');
    });

    test('should set alertStatus to OK when currentStock > minStock', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Potatoes',
        unit: 'kg',
        currentStock: 100,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('OK');
    });

    test('should update alertStatus when currentStock changes via .save()', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Lettuce',
        unit: 'kg',
        currentStock: 50,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('OK');

      // Reduce stock to trigger LOW
      ingredient.currentStock = 15;
      await ingredient.save();

      expect(ingredient.alertStatus).toBe('LOW');
    });

    test('should update alertStatus when minStock changes via .save()', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Spinach',
        unit: 'kg',
        currentStock: 30,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('OK');

      // Increase minStock threshold
      ingredient.minStock = 50;
      await ingredient.save();

      expect(ingredient.alertStatus).toBe('LOW');
    });
  });

  describe('Hook 2: post(findOneAndUpdate) - Auto-update after atomic updates', () => {
    test('should update alertStatus after atomic currentStock update', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Cucumber',
        unit: 'kg',
        currentStock: 50,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('OK');

      // Atomic update reducing stock
      const updated = await Ingredient.findOneAndUpdate(
        { _id: ingredient._id },
        { $inc: { currentStock: -35 } },
        { new: true }
      );

      // Fetch again to confirm alertStatus was updated by hook
      const refreshed = await Ingredient.findById(ingredient._id);
      expect(refreshed.currentStock).toBe(15);
      expect(refreshed.alertStatus).toBe('LOW');
    });

    test('should update alertStatus to CRITICAL after large deduction', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Cabbage',
        unit: 'kg',
        currentStock: 50,
        minStock: 20,
      });

      await Ingredient.findOneAndUpdate(
        { _id: ingredient._id },
        { $inc: { currentStock: -42 } },
        { new: true }
      );

      const refreshed = await Ingredient.findById(ingredient._id);
      expect(refreshed.currentStock).toBe(8);
      expect(refreshed.alertStatus).toBe('CRITICAL');
    });

    test('should update alertStatus to OUT_OF_STOCK after deduction to zero', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Broccoli',
        unit: 'kg',
        currentStock: 10,
        minStock: 20,
      });

      await Ingredient.findOneAndUpdate(
        { _id: ingredient._id },
        { $set: { currentStock: 0 } },
        { new: true }
      );

      const refreshed = await Ingredient.findById(ingredient._id);
      expect(refreshed.alertStatus).toBe('OUT_OF_STOCK');
    });
  });

  describe('Virtual: stockStatus - Maps from alertStatus with over_stock check', () => {
    test('should return "out_of_stock" when alertStatus is OUT_OF_STOCK', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Ginger',
        unit: 'kg',
        currentStock: 0,
        minStock: 10,
      });

      expect(ingredient.stockStatus).toBe('out_of_stock');
    });

    test('should return "low_stock" when alertStatus is LOW', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Cilantro',
        unit: 'kg',
        currentStock: 10,
        minStock: 10,
      });

      expect(ingredient.stockStatus).toBe('low_stock');
    });

    test('should return "low_stock" when alertStatus is CRITICAL', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Parsley',
        unit: 'kg',
        currentStock: 3,
        minStock: 10,
      });

      expect(ingredient.stockStatus).toBe('low_stock');
    });

    test('should return "in_stock" when alertStatus is OK', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Basil',
        unit: 'kg',
        currentStock: 50,
        minStock: 10,
      });

      expect(ingredient.stockStatus).toBe('in_stock');
    });

    test('should return "over_stock" when currentStock >= maxStock (independent check)', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Oregano',
        unit: 'kg',
        currentStock: 200,
        minStock: 20,
        maxStock: 200,
      });

      // alertStatus should be OK, but stockStatus checks over_stock first
      expect(ingredient.alertStatus).toBe('OK');
      expect(ingredient.stockStatus).toBe('over_stock');
    });

    test('should return "over_stock" even when currentStock > maxStock', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Thyme',
        unit: 'kg',
        currentStock: 250,
        minStock: 20,
        maxStock: 200,
      });

      expect(ingredient.stockStatus).toBe('over_stock');
    });
  });

  describe('Method: isLowStock() - Reads from alertStatus', () => {
    test('should return true when alertStatus is LOW', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Rosemary',
        unit: 'kg',
        currentStock: 15,
        minStock: 20,
      });

      expect(ingredient.isLowStock()).toBe(true);
    });

    test('should return true when alertStatus is CRITICAL', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Sage',
        unit: 'kg',
        currentStock: 5,
        minStock: 20,
      });

      expect(ingredient.isLowStock()).toBe(true);
    });

    test('should return true when alertStatus is OUT_OF_STOCK', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Mint',
        unit: 'kg',
        currentStock: 0,
        minStock: 20,
      });

      expect(ingredient.isLowStock()).toBe(true);
    });

    test('should return false when alertStatus is OK', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Dill',
        unit: 'kg',
        currentStock: 100,
        minStock: 20,
      });

      expect(ingredient.isLowStock()).toBe(false);
    });

    test('should return true when currentStock === minStock (boundary test)', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Chives',
        unit: 'kg',
        currentStock: 20,
        minStock: 20,
      });

      // Should be LOW due to <= boundary
      expect(ingredient.alertStatus).toBe('LOW');
      expect(ingredient.isLowStock()).toBe(true);
    });
  });

  describe('Static: getLowStockItems() - Queries alertStatus field', () => {
    beforeAll(async () => {
      // Clean up for this test suite
      await Ingredient.deleteMany({ 
        merchant: merchantId,
        name: { $regex: /^GetLowStock/ }
      });

      // Create test ingredients with various statuses
      await Ingredient.create([
        { merchant: merchantId, name: 'GetLowStock OK 1', unit: 'kg', currentStock: 100, minStock: 20 },
        { merchant: merchantId, name: 'GetLowStock LOW 1', unit: 'kg', currentStock: 20, minStock: 20 },
        { merchant: merchantId, name: 'GetLowStock LOW 2', unit: 'kg', currentStock: 15, minStock: 20 },
        { merchant: merchantId, name: 'GetLowStock CRITICAL 1', unit: 'kg', currentStock: 5, minStock: 20 },
        { merchant: merchantId, name: 'GetLowStock OUT 1', unit: 'kg', currentStock: 0, minStock: 20 },
        { merchant: merchantId, name: 'GetLowStock OK 2', unit: 'kg', currentStock: 50, minStock: 20 },
      ]);
    });

    test('should return only LOW, CRITICAL, and OUT_OF_STOCK items', async () => {
      const lowStockItems = await Ingredient.getLowStockItems(merchantId);
      
      const testItems = lowStockItems.filter(item => item.name.startsWith('GetLowStock'));
      
      expect(testItems.length).toBe(4); // LOW 1, LOW 2, CRITICAL 1, OUT 1
      
      const statuses = testItems.map(item => item.alertStatus);
      expect(statuses).toContain('LOW');
      expect(statuses).toContain('CRITICAL');
      expect(statuses).toContain('OUT_OF_STOCK');
      expect(statuses).not.toContain('OK');
    });

    test('should include item exactly at minStock threshold', async () => {
      const lowStockItems = await Ingredient.getLowStockItems(merchantId);
      
      const atThreshold = lowStockItems.find(item => 
        item.name === 'GetLowStock LOW 1' && 
        item.currentStock === 20 &&
        item.minStock === 20
      );
      
      expect(atThreshold).toBeDefined();
      expect(atThreshold.alertStatus).toBe('LOW');
    });

    test('should not include OK items', async () => {
      const lowStockItems = await Ingredient.getLowStockItems(merchantId);
      
      const okItems = lowStockItems.filter(item => 
        item.name.startsWith('GetLowStock') && 
        item.alertStatus === 'OK'
      );
      
      expect(okItems.length).toBe(0);
    });
  });

  describe('Boundary Tests - Conservative <= for LOW', () => {
    test('currentStock === minStock should be LOW (not OK)', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Boundary Test 1',
        unit: 'kg',
        currentStock: 20,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('LOW');
      expect(ingredient.isLowStock()).toBe(true);
    });

    test('currentStock === minStock + 1 should be OK', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Boundary Test 2',
        unit: 'kg',
        currentStock: 21,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('OK');
      expect(ingredient.isLowStock()).toBe(false);
    });

    test('currentStock === minStock * 0.5 should be LOW (CRITICAL uses <, not <=)', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Boundary Test 3',
        unit: 'kg',
        currentStock: 10,
        minStock: 20,
      });

      // Exactly at half (10/20) should be LOW because CRITICAL is < not <=
      expect(ingredient.alertStatus).toBe('LOW');
    });

    test('currentStock < minStock * 0.5 should be CRITICAL', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Boundary Test 4',
        unit: 'kg',
        currentStock: 9,
        minStock: 20,
      });

      expect(ingredient.alertStatus).toBe('CRITICAL');
    });
  });
});
