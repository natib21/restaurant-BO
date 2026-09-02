// tests/inventory-stage1-schema.test.js
const mongoose = require('mongoose');
const Ingredient = require('../models/Ingredient');
const StockHistory = require('../models/StockHistory');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');

describe('Stage 1: Schema Changes', () => {
  let merchantId, branchId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test');
    }
    
    // Create test merchant and branch
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
        coordinates: [38.7469, 9.0320], // [lng, lat] - Addis Ababa
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
    await StockHistory.deleteMany({ merchant: merchantId });
    await Branch.deleteMany({ merchant: merchantId });
    await Merchant.deleteMany({ _id: merchantId });
    await mongoose.connection.close();
  });

  describe('Ingredient Schema - New Fields', () => {
    test('should create ingredient with new fields (reservedStock, reorderQuantity, alertStatus, dailyUsageRate)', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Tomatoes',
        unit: 'kg',
        currentStock: 100,
        minStock: 20,
        maxStock: 200,
        reservedStock: 10,
        reorderQuantity: 50,
        alertStatus: 'OK',
        dailyUsageRate: 5,
      });

      expect(ingredient).toBeDefined();
      expect(ingredient.reservedStock).toBe(10);
      expect(ingredient.reorderQuantity).toBe(50);
      expect(ingredient.alertStatus).toBe('OK');
      expect(ingredient.dailyUsageRate).toBe(5);
    });

    test('should default new fields to 0 or OK when not provided', async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test Onions',
        unit: 'kg',
        currentStock: 50,
      });

      expect(ingredient.reservedStock).toBe(0);
      expect(ingredient.reorderQuantity).toBe(0);
      expect(ingredient.alertStatus).toBe('OK');
      expect(ingredient.dailyUsageRate).toBe(0);
    });

    test('should validate alertStatus enum values', async () => {
      const validStatuses = ['OK', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'];
      
      for (const status of validStatuses) {
        const ingredient = await Ingredient.create({
          merchant: merchantId,
          name: `Test Ingredient ${status}`,
          unit: 'kg',
          alertStatus: status,
        });
        expect(ingredient.alertStatus).toBe(status);
      }
    });

    test('should reject invalid alertStatus value', async () => {
      await expect(
        Ingredient.create({
          merchant: merchantId,
          name: 'Bad Status Test',
          unit: 'kg',
          alertStatus: 'INVALID_STATUS',
        })
      ).rejects.toThrow();
    });

    test('should enforce min: 0 on reservedStock', async () => {
      await expect(
        Ingredient.create({
          merchant: merchantId,
          name: 'Negative Reserved Test',
          unit: 'kg',
          reservedStock: -5,
        })
      ).rejects.toThrow();
    });

    test('should enforce min: 0 on reorderQuantity', async () => {
      await expect(
        Ingredient.create({
          merchant: merchantId,
          name: 'Negative Reorder Test',
          unit: 'kg',
          reorderQuantity: -10,
        })
      ).rejects.toThrow();
    });

    test('should enforce min: 0 on dailyUsageRate', async () => {
      await expect(
        Ingredient.create({
          merchant: merchantId,
          name: 'Negative Usage Test',
          unit: 'kg',
          dailyUsageRate: -2,
        })
      ).rejects.toThrow();
    });
  });

  describe('StockHistory Schema - Branch Required', () => {
    let ingredientId;

    beforeAll(async () => {
      const ingredient = await Ingredient.create({
        merchant: merchantId,
        name: 'Test History Ingredient',
        unit: 'kg',
      });
      ingredientId = ingredient._id;
    });

    test('should create StockHistory entry with all required fields including branch', async () => {
      const history = await StockHistory.create({
        ingredient: ingredientId,
        merchant: merchantId,
        branch: branchId,
        action: 'ADDED',
        quantity: 10,
        stockBefore: 0,
        stockAfter: 10,
        unit: 'kg',
      });

      expect(history).toBeDefined();
      expect(history.branch.toString()).toBe(branchId.toString());
      expect(history.action).toBe('ADDED');
      expect(history.quantity).toBe(10);
    });

    test('should reject StockHistory without branch (required field)', async () => {
      await expect(
        StockHistory.create({
          ingredient: ingredientId,
          merchant: merchantId,
          // branch missing
          action: 'ADDED',
          quantity: 10,
        })
      ).rejects.toThrow(/branch.*required/i);
    });

    test('should accept all new action enum values (RESERVED, RELEASED, CORRECTED)', async () => {
      const newActions = ['RESERVED', 'RELEASED', 'CORRECTED'];
      
      for (const action of newActions) {
        const history = await StockHistory.create({
          ingredient: ingredientId,
          merchant: merchantId,
          branch: branchId,
          action,
          quantity: 5,
        });
        expect(history.action).toBe(action);
      }
    });

    test('should accept legacy action values (ADDED, USED, ADJUSTED, WASTE)', async () => {
      const legacyActions = ['ADDED', 'USED', 'ADJUSTED', 'WASTE'];
      
      for (const action of legacyActions) {
        const history = await StockHistory.create({
          ingredient: ingredientId,
          merchant: merchantId,
          branch: branchId,
          action,
          quantity: 3,
        });
        expect(history.action).toBe(action);
      }
    });

    test('should reject invalid action value', async () => {
      await expect(
        StockHistory.create({
          ingredient: ingredientId,
          merchant: merchantId,
          branch: branchId,
          action: 'INVALID_ACTION',
          quantity: 5,
        })
      ).rejects.toThrow();
    });

    test('should store optional context fields (orderId, reason, costPrice)', async () => {
      const orderId = new mongoose.Types.ObjectId();
      
      const history = await StockHistory.create({
        ingredient: ingredientId,
        merchant: merchantId,
        branch: branchId,
        action: 'RESERVED',
        quantity: 8,
        orderId,
        reason: 'Customer order pending',
        costPrice: 15.5,
      });

      expect(history.orderId.toString()).toBe(orderId.toString());
      expect(history.reason).toBe('Customer order pending');
      expect(history.costPrice).toBe(15.5);
    });

    test('should auto-populate recordedAt timestamp', async () => {
      const before = Date.now();
      
      const history = await StockHistory.create({
        ingredient: ingredientId,
        merchant: merchantId,
        branch: branchId,
        action: 'USED',
        quantity: 2,
      });

      const after = Date.now();
      
      expect(history.recordedAt).toBeDefined();
      expect(history.recordedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(history.recordedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('Schema Indexes', () => {
    test('Ingredient should have index on merchant + name', async () => {
      const indexes = Ingredient.schema.indexes();
      const hasIndex = indexes.some(idx => 
        idx[0].merchant === 1 && idx[0].name === 1
      );
      expect(hasIndex).toBe(true);
    });

    test('StockHistory should have index on ingredient + recordedAt', async () => {
      const indexes = StockHistory.schema.indexes();
      const hasIndex = indexes.some(idx => 
        idx[0].ingredient === 1 && idx[0].recordedAt === -1
      );
      expect(hasIndex).toBe(true);
    });

    test('StockHistory should have index on merchant + branch + action', async () => {
      const indexes = StockHistory.schema.indexes();
      const hasIndex = indexes.some(idx => 
        idx[0].merchant === 1 && idx[0].branch === 1 && idx[0].action === 1
      );
      expect(hasIndex).toBe(true);
    });

    test('StockHistory should have index on orderId', async () => {
      const indexes = StockHistory.schema.indexes();
      const hasIndex = indexes.some(idx => 
        idx[0].orderId === 1
      );
      expect(hasIndex).toBe(true);
    });
  });
});
