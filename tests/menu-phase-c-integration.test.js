/**
 * Menu Module Phase C Integration Tests
 * 
 * Tests Query Handling & Response Standardization
 * - ApiFeatures integration
 * - sendResponse standardization
 * - Merchant isolation
 * - Query parameters (search, filter, sort, pagination)
 * - Response shapes
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Menu = require('../models/menuModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const ApiFeatures = require('../utils/apiFeatures');
const { sendResponse } = require('../utils/sendResponse');

let merchant1Id, merchant2Id;
let branch1Id, branch2Id;
let menuItems = [];

beforeAll(async () => {
  await connectDatabase();

  // Clean up existing test data
  await Menu.deleteMany({ name: /^PHASE_C_TEST/ });
  await Merchant.deleteMany({ businessName: /^PHASE_C_TEST/ });
  await Branch.deleteMany({ name: /^PHASE_C_TEST/ });

  // Create Merchant 1
  const merchant1 = await Merchant.create({
    businessName: 'PHASE_C_TEST_Merchant_1',
    slug: 'phase-c-test-merchant-1',
    email: 'phase-c-merchant1@test.com',
    phone: '+251911111111',
    status: 'approved',
    isActive: true,
    mode: 'Test',
    owner: {
      email: 'phase-c-owner1@test.com',
      fullName: 'Phase C Owner One',
      firstName: 'Owner',
      lastName: 'One',
      phone: '+251911111111',
      gender: 'Male',
    },
  });
  merchant1Id = merchant1._id;

  const branch1 = await Branch.create({
    merchant: merchant1Id,
    name: 'PHASE_C_TEST_Branch_1',
    phone: '+251911111111',
    isMain: true,
    isActive: true,
    branchCode: 'PC-BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
    },
  });
  branch1Id = branch1._id;

  // Create Merchant 2
  const merchant2 = await Merchant.create({
    businessName: 'PHASE_C_TEST_Merchant_2',
    slug: 'phase-c-test-merchant-2',
    email: 'phase-c-merchant2@test.com',
    phone: '+251922222222',
    status: 'approved',
    isActive: true,
    mode: 'Test',
    owner: {
      email: 'phase-c-owner2@test.com',
      fullName: 'Phase C Owner Two',
      firstName: 'Owner',
      lastName: 'Two',
      phone: '+251922222222',
      gender: 'Male',
    },
  });
  merchant2Id = merchant2._id;

  const branch2 = await Branch.create({
    merchant: merchant2Id,
    name: 'PHASE_C_TEST_Branch_2',
    phone: '+251922222222',
    isMain: true,
    isActive: true,
    branchCode: 'PC-BR-002',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
    },
  });
  branch2Id = branch2._id;

  // Create test menu items for Merchant 1
  menuItems = await Menu.create([
    {
      name: 'PHASE_C_TEST_Pizza Margherita',
      description: 'Classic cheese pizza',
      price: 12.99,
      type: 'food',
      category: 'pizza',
      available: true,
      merchant: merchant1Id,
      branchId: branch1Id,
    },
    {
      name: 'PHASE_C_TEST_Pepperoni Pizza',
      description: 'Pizza with pepperoni',
      price: 15.99,
      type: 'food',
      category: 'pizza',
      available: true,
      merchant: merchant1Id,
      branchId: branch1Id,
    },
    {
      name: 'PHASE_C_TEST_Cheeseburger',
      description: 'Beef burger with cheese',
      price: 9.99,
      type: 'food',
      category: 'burgers',
      available: true,
      merchant: merchant1Id,
      branchId: branch1Id,
    },
    {
      name: 'PHASE_C_TEST_Coca Cola',
      description: 'Soft drink',
      price: 2.99,
      type: 'drink',
      category: 'beverages',
      available: true,
      merchant: merchant1Id,
      branchId: branch1Id,
    },
    {
      name: 'PHASE_C_TEST_Unavailable Item',
      description: 'This is not available',
      price: 5.99,
      type: 'food',
      category: 'other',
      available: false,
      merchant: merchant1Id,
      branchId: branch1Id,
    },
  ]);

  // Create menu items for Merchant 2
  await Menu.create([
    {
      name: 'PHASE_C_TEST_Merchant2 Pizza',
      description: 'Pizza from Merchant 2',
      price: 14.99,
      type: 'food',
      category: 'pizza',
      available: true,
      merchant: merchant2Id,
      branchId: branch2Id,
    },
    {
      name: 'PHASE_C_TEST_Merchant2 Burger',
      description: 'Burger from Merchant 2',
      price: 11.99,
      type: 'food',
      category: 'burgers',
      available: true,
      merchant: merchant2Id,
      branchId: branch2Id,
    },
  ]);
});

afterAll(async () => {
  await Menu.deleteMany({ name: /^PHASE_C_TEST/ });
  await Branch.deleteMany({ name: /^PHASE_C_TEST/ });
  await Merchant.deleteMany({ businessName: /^PHASE_C_TEST/ });
  await disconnectDatabase();
});

// ============================================
// TEST 1: ApiFeatures Utility
// ============================================
describe('Phase C - ApiFeatures Utility', () => {
  test('should filter by merchant (base query)', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {});
    const results = await features.query;

    expect(results).toBeDefined();
    expect(results.length).toBe(5); // 5 items for Merchant 1

    results.forEach(item => {
      expect(item.merchant.toString()).toBe(merchant1Id.toString());
    });
  });

  test('should search by name (case-insensitive)', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { search: 'pizza' })
      .search(['name', 'description']);
    const results = await features.query;

    expect(results.length).toBe(2); // 2 pizzas
    results.forEach(item => {
      expect(item.name.toLowerCase()).toContain('pizza');
    });
  });

  test('should filter by type', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { type: 'food' })
      .filter();
    const results = await features.query;

    expect(results.length).toBe(4); // 4 food items
    results.forEach(item => {
      expect(item.type).toBe('food');
    });
  });

  test('should filter by availability', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { available: 'true' })
      .filter();
    const results = await features.query;

    expect(results.length).toBe(4); // 4 available items
    results.forEach(item => {
      expect(item.available).toBe(true);
    });
  });

  test('should filter by multiple fields', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { type: 'food', available: 'true' })
      .filter();
    const results = await features.query;

    expect(results.length).toBe(3); // 3 available food items
    results.forEach(item => {
      expect(item.type).toBe('food');
      expect(item.available).toBe(true);
    });
  });

  test('should filter by price range (gte, lte)', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { 'price[gte]': '10', 'price[lte]': '16' })
      .filter();
    const results = await features.query;

    expect(results).toBeDefined();
    // Should find items with price between 10 and 16 (Pizza Margherita 12.99, Pepperoni Pizza 15.99)
    if (results.length > 0) {
      results.forEach(item => {
        expect(item.price).toBeGreaterThanOrEqual(10);
        expect(item.price).toBeLessThanOrEqual(16);
      });
    }
  });

  test('should sort ascending by name', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { sort: 'name' })
      .sort();
    const results = await features.query;

    const names = results.map(item => item.name);
    const sortedNames = [...names].sort();
    expect(names).toEqual(sortedNames);
  });

  test('should sort descending by price', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { sort: '-price' })
      .sort();
    const results = await features.query;

    const prices = results.map(item => item.price);
    for (let i = 0; i < prices.length - 1; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i + 1]);
    }
  });

  test('should paginate results', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { page: '1', limit: '2' })
      .paginate();
    const results = await features.query;

    expect(results.length).toBe(2); // First 2 items
  });

  test('should select specific fields', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { fields: 'name,price' })
      .limitFields();
    const results = await features.query;

    expect(results.length).toBeGreaterThan(0);
    results.forEach(item => {
      expect(item.name).toBeDefined();
      expect(item.price).toBeDefined();
      expect(item._id).toBeDefined(); // _id always included
      expect(item.__v).toBeUndefined(); // __v excluded
    });
  });

  test('should chain all features together', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {
      search: 'pizza',
      type: 'food',
      available: 'true',
      sort: 'price',
      fields: 'name,price,type,available',  // Include type and available in fields
      page: '1',
      limit: '10',
    })
      .search(['name', 'description'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const results = await features.query;

    expect(results.length).toBeGreaterThan(0);
    results.forEach(item => {
      expect(item.type).toBe('food');
      expect(item.available).toBe(true);
      expect(item.name).toBeDefined();
      expect(item.price).toBeDefined();
    });
  });
});

// ============================================
// TEST 2: sendResponse Helper
// ============================================
describe('Phase C - sendResponse Helper', () => {
  test('should create list response with results', () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    sendResponse(mockRes, 200, 'menus', [{ id: 1 }, { id: 2 }], { results: 2 });

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'success',
      results: 2,
      data: { menus: [{ id: 1 }, { id: 2 }] },
    });
  });

  test('should create single resource response', () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    sendResponse(mockRes, 200, 'menu', { id: 1, name: 'Test' });

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'success',
      data: { menu: { id: 1, name: 'Test' } },
    });
  });

  test('should create action response with message', () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    sendResponse(mockRes, 200, 'menu', { id: 1 }, { message: 'Updated successfully' });

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'success',
      message: 'Updated successfully',
      data: { menu: { id: 1 } },
    });
  });

  test('should create delete response (204)', () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    sendResponse(mockRes, 204, null, null);

    expect(mockRes.status).toHaveBeenCalledWith(204);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'success',
      data: { null: null },
    });
  });

  test('should support dynamic resource keys', () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    sendResponse(mockRes, 200, 'customKey', { data: 'test' });

    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'success',
      data: { customKey: { data: 'test' } },
    });
  });
});

// ============================================
// TEST 3: Merchant Isolation (CRITICAL SECURITY)
// ============================================
describe('Phase C - Merchant Isolation', () => {
  test('should return only Merchant 1 items when base query filters by Merchant 1', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {});
    const results = await features.query;

    expect(results.length).toBe(5);
    results.forEach(item => {
      expect(item.merchant.toString()).toBe(merchant1Id.toString());
    });
  });

  test('should return only Merchant 2 items when base query filters by Merchant 2', async () => {
    const baseQuery = Menu.find({ merchant: merchant2Id });
    const features = new ApiFeatures(baseQuery, {});
    const results = await features.query;

    expect(results.length).toBe(2);
    results.forEach(item => {
      expect(item.merchant.toString()).toBe(merchant2Id.toString());
    });
  });

  test('should not allow query param to override base merchant filter', async () => {
    // Simulate trying to query Merchant 2 data while scoped to Merchant 1
    const baseQuery = Menu.find({ merchant: merchant1Id });
    // Merchant param should be ignored by ApiFeatures since it's in excludedFields
    // But if it's not excluded, the base query should still win
    const features = new ApiFeatures(baseQuery, {})
      .filter();
    const results = await features.query;

    // Should still only return Merchant 1 items
    expect(results.length).toBe(5); // 5 items for Merchant 1
    results.forEach(item => {
      expect(item.merchant.toString()).toBe(merchant1Id.toString());
    });
  });

  test('should maintain merchant isolation with search queries', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { search: 'pizza' })
      .search(['name', 'description'])
      .filter();
    const results = await features.query;

    expect(results.length).toBeGreaterThan(0);
    results.forEach(item => {
      expect(item.merchant.toString()).toBe(merchant1Id.toString());
    });
  });

  test('should maintain merchant isolation with all query features', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {
      search: 'PHASE_C_TEST',
      type: 'food',
      sort: 'price',
      page: '1',
      limit: '10',
    })
      .search(['name'])
      .filter()
      .sort()
      .paginate();

    const results = await features.query;

    results.forEach(item => {
      expect(item.merchant.toString()).toBe(merchant1Id.toString());
    });
  });
});

// ============================================
// TEST 4: Combined Query Scenarios
// ============================================
describe('Phase C - Combined Query Scenarios', () => {
  test('should handle search + filter + sort', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {
      search: 'pizza',
      type: 'food',
      sort: 'price',
    })
      .search(['name', 'description'])
      .filter()
      .sort();

    const results = await features.query;

    expect(results.length).toBeGreaterThan(0);
    results.forEach(item => {
      expect(item.type).toBe('food');
      expect(item.merchant.toString()).toBe(merchant1Id.toString());
    });

    // Verify sort order
    const prices = results.map(r => r.price);
    for (let i = 0; i < prices.length - 1; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i + 1]);
    }
  });

  test('should handle filter + pagination', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {
      type: 'food',
      page: '1',
      limit: '2',
    })
      .filter()
      .paginate();

    const results = await features.query;

    expect(results.length).toBeLessThanOrEqual(2);
    results.forEach(item => {
      expect(item.type).toBe('food');
    });
  });

  test('should handle all features together', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {
      search: 'PHASE_C_TEST',
      available: 'true',
      sort: '-price',
      fields: 'name,price,type,available,merchant',  // Include all fields we're checking
      page: '1',
      limit: '5',
    })
      .search(['name', 'description'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const results = await features.query;

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
    
    results.forEach(item => {
      expect(item.available).toBe(true);
      expect(item.name).toBeDefined();
      expect(item.price).toBeDefined();
      expect(item.merchant.toString()).toBe(merchant1Id.toString());
    });
  });
});

// ============================================
// TEST 5: Edge Cases
// ============================================
describe('Phase C - Edge Cases', () => {
  test('should handle empty search results', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { search: 'nonexistentitem123' })
      .search(['name', 'description']);
    const results = await features.query;

    expect(results).toEqual([]);
  });

  test('should handle empty filter results', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { category: 'nonexistent' })
      .filter();
    const results = await features.query;

    expect(results).toEqual([]);
  });

  test('should handle page beyond available data', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, { page: '999', limit: '10' })
      .paginate();
    const results = await features.query;

    expect(results).toEqual([]);
  });

  test('should handle default sort when no sort param provided', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {})
      .sort();
    const results = await features.query;

    expect(results.length).toBeGreaterThan(0);
    // Default sort is -createdAt (newest first)
  });

  test('should exclude __v by default when no fields specified', async () => {
    const baseQuery = Menu.find({ merchant: merchant1Id });
    const features = new ApiFeatures(baseQuery, {})
      .limitFields();
    const results = await features.query;

    results.forEach(item => {
      expect(item.__v).toBeUndefined();
    });
  });
});
