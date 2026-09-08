const mongoose = require('mongoose');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');
const BranchMenu = require('../models/branchMenuModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Menu = require('../models/branchMenuModel');
const validateOrderStock = require('../src/modules/order/middleware/stockValidation');

describe('Stage 6: validateOrderStock Middleware', () => {
  let merchantId, branchId, menuItemId, ingredientId;
  let mockReq, mockRes, nextCalled, nextError;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test');
    }

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
        formattedAddress: '123 Main St',
      },
      phone: '+251912345678',
      isActive: true,
    });
    branchId = branch._id;

    const ingredient = await Ingredient.create({
      merchant: merchantId,
      name: 'Test Flour',
      unit: 'kg',
      currentStock: 50,
      minStock: 20,
      alertStatus: 'OK',
    });
    ingredientId = ingredient._id;

    const menu = await Menu.create({
      branch: branchId,
      name: 'Bread',
      category: 'bakery',
    });
    menuItemId = menu._id;

    await Recipe.create({
      merchant: merchantId,
      menuItem: menuItemId,
      name: 'Bread Recipe',
      items: [
        {
          ingredient: ingredientId,
          quantity: 2,
          unit: 'kg',
        },
      ],
    });

    await BranchMenu.create({
      branch: branchId,
      menuItem: menuItemId,
      name: 'Bread',
      category: 'bakery',
    });
  });

  afterAll(async () => {
    await Ingredient.deleteMany({ name: /Test/ });
    await Recipe.deleteMany({});
    await BranchMenu.deleteMany({});
    await Menu.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({ businessName: /Test Restaurant/ });
    await mongoose.connection.close();
  });

  function resetMocks() {
    nextCalled = false;
    nextError = null;
    mockReq = {
      user: { branch: branchId },
      body: { items: [], branch: branchId },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  }

  describe('Sufficient Stock', () => {
    beforeEach(() => resetMocks());

    test('should call next() when order has sufficient stock', async () => {
      mockReq.body.items = [
        {
          menuItem: menuItemId,
          menuItemName: 'Bread',
          quantity: 10, // 10 * 2 = 20kg needed, have 50kg
        },
      ];

      await validateOrderStock(mockReq, mockRes, (err) => {
        nextError = err;
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(nextError).toBeUndefined();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('CRITICAL Status', () => {
    beforeEach(async () => {
      resetMocks();
      const ing = await Ingredient.findById(ingredientId);
      ing.currentStock = 5;
      await ing.save();
      
      // Verify it was set to CRITICAL
      const check = await Ingredient.findById(ingredientId);
      console.log('After save, ingredient alertStatus:', check.alertStatus, 'currentStock:', check.currentStock);
    });

    test('should reject when ingredient is CRITICAL', async () => {
      mockReq.body.items = [
        {
          menuItem: menuItemId,
          menuItemName: 'Bread',
          quantity: 3, // 3 * 2 = 6kg needed, have 5kg (insufficient + CRITICAL)
        },
      ];

      await validateOrderStock(mockReq, mockRes, (err) => {
        nextError = err;
        nextCalled = true;
      });

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.unavailableItems.length).toBeGreaterThan(0);
      expect(response.unavailableItems[0].alertStatus).toBe('CRITICAL');
    });
  });

  describe('LOW Stock Without Override', () => {
    beforeEach(async () => {
      resetMocks();
      const ing = await Ingredient.findById(ingredientId);
      ing.currentStock = 15; // 10 <= 15 <= 20, so LOW
      await ing.save();
    });

    test('should reject when LOW stock and no override exists', async () => {
      mockReq.body.items = [
        {
          menuItem: menuItemId,
          menuItemName: 'Bread',
          quantity: 8, // 8 * 2 = 16kg needed, have 15kg (LOW)
        },
      ];

      await validateOrderStock(mockReq, mockRes, (err) => {
        nextError = err;
        nextCalled = true;
      });

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.unavailableItems.length).toBeGreaterThan(0);
      expect(response.unavailableItems[0].reason).toContain('requires manager override');
    });
  });

  describe('LOW Stock With Valid Override', () => {
    beforeEach(async () => {
      resetMocks();
      const ing = await Ingredient.findById(ingredientId);
      ing.currentStock = 15;
      await ing.save();

      await BranchMenu.findOneAndUpdate(
        { branch: branchId, menuItem: menuItemId },
        {
          $set: {
            availability: {
              manualOverride: {
                enabled: true,
                reason: 'Manager authorized',
                setAt: new Date(),
                expiresAt: new Date(Date.now() + 3600000),
              },
            },
          },
        },
        { new: true }
      );
    });

    test('should allow LOW stock with valid override', async () => {
      mockReq.body.items = [
        {
          menuItem: menuItemId,
          menuItemName: 'Bread',
          quantity: 8, // Insufficient but overridden
        },
      ];

      await validateOrderStock(mockReq, mockRes, (err) => {
        nextError = err;
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(nextError).toBeUndefined();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should attach stockWarnings to request for overridden items', async () => {
      mockReq.body.items = [
        {
          menuItem: menuItemId,
          menuItemName: 'Bread',
          quantity: 8,
        },
      ];

      await validateOrderStock(mockReq, mockRes, (err) => {
        nextError = err;
        nextCalled = true;
      });

      expect(mockReq.stockWarnings).toBeDefined();
      expect(mockReq.stockWarnings.length).toBe(1);
      expect(mockReq.stockWarnings[0].message).toContain('Using manual override');
      expect(mockReq.stockWarnings[0].overrideReason).toBe('Manager authorized');
    });
  });

  describe('LOW Stock With Expired Override', () => {
    beforeEach(async () => {
      resetMocks();
      const ing = await Ingredient.findById(ingredientId);
      ing.currentStock = 15;
      await ing.save();

      await BranchMenu.findOneAndUpdate(
        { branch: branchId, menuItem: menuItemId },
        {
          $set: {
            availability: {
              manualOverride: {
                enabled: true,
                reason: 'Old authorization',
                setAt: new Date(Date.now() - 7200000),
                expiresAt: new Date(Date.now() - 3600000), // Expired
              },
            },
          },
        },
        { new: true }
      );
    });

    test('should reject when override is expired', async () => {
      mockReq.body.items = [
        {
          menuItem: menuItemId,
          menuItemName: 'Bread',
          quantity: 8,
        },
      ];

      await validateOrderStock(mockReq, mockRes, (err) => {
        nextError = err;
        nextCalled = true;
      });

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.unavailableItems[0].reason).toContain('requires manager override');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => resetMocks());

    test('should handle empty items array gracefully', async () => {
      mockReq.body.items = [];

      await validateOrderStock(mockReq, mockRes, (err) => {
        nextError = err;
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(nextError).toBeUndefined();
    });

    test('should handle missing items field gracefully', async () => {
      delete mockReq.body.items;

      await validateOrderStock(mockReq, mockRes, (err) => {
        nextError = err;
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(nextError).toBeUndefined();
    });
  });
});
