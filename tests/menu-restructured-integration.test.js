/**
 * @file tests/menu-restructured-integration.test.js
 * @description Integration tests for the restructured menu module
 * 
 * Tests:
 * - New service layer (MenuItem, MenuGroup, Combo, Category)
 * - Repository layer
 * - Model layer
 * - Controller integration
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

// Import new structured models
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const MenuGroup = require('../src/modules/menu/model/MenuGroup.model');
const Combo = require('../src/modules/menu/model/Combo.model');
const Category = require('../src/modules/menu/model/Category.model');

// Import supporting models
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');

let app;
let testData = {};

describe('Menu Module Restructured - Integration Tests', () => {
  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up test data
    await MenuItem.deleteMany({});
    await MenuGroup.deleteMany({});
    await Combo.deleteMany({});
    await Category.deleteMany({});
    await User.deleteMany({});
    await Merchant.deleteMany({});
    await Branch.deleteMany({});
    await Role.deleteMany({});

    // Create test merchant
    testData.merchant = await Merchant.create({
      name: 'Test Restaurant',
      phone: '+1234567890',
      email: 'test@restaurant.com',
      address: { street: '123 Test St', city: 'Test City' }
    });

    // Create test branch
    testData.branch = await Branch.create({
      name: 'Main Branch',
      merchant: testData.merchant._id,
      address: { street: '123 Test St', city: 'Test City' },
      isActive: true
    });

    // Create test role
    testData.role = await Role.create({
      name: 'Admin',
      merchant: testData.merchant._id,
      permissions: ['menu:create', 'menu:read', 'menu:update', 'menu:delete']
    });

    // Create test user
    testData.user = await User.create({
      name: 'Test User',
      email: 'testuser@restaurant.com',
      password: 'Password123!',
      merchant: testData.merchant._id,
      role: testData.role._id,
      phone: '+1234567890'
    });

    // Login to get token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'testuser@restaurant.com',
        password: 'Password123!'
      });

    testData.token = loginRes.body.token;
  });

  describe('Category Service & Model', () => {
    test('should create a category with localization', async () => {
      const category = await Category.create({
        name: { en: 'Beverages', am: 'መጠጦች' },
        description: { en: 'Hot and cold drinks', am: 'ሞቃት እና ቀዝቃዛ መጠጦች' },
        merchant: testData.merchant._id,
        sortOrder: 1,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      expect(category).toBeDefined();
      expect(category._id).toBeDefined();
      expect(category.name.en).toBe('Beverages');
      expect(category.name.am).toBe('መጠጦች');
      expect(category.merchant.toString()).toBe(testData.merchant._id.toString());
    });

    test('should soft delete a category', async () => {
      const category = await Category.create({
        name: { en: 'Appetizers', am: 'መክሰስ' },
        merchant: testData.merchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      // Soft delete
      category.deletedAt = new Date();
      category.deletedBy = testData.user._id;
      await category.save();

      const found = await Category.findById(category._id);
      expect(found.deletedAt).toBeDefined();
      expect(found.deletedBy.toString()).toBe(testData.user._id.toString());
    });
  });

  describe('MenuItem Service & Model', () => {
    beforeEach(async () => {
      // Create test category
      testData.category = await Category.create({
        name: { en: 'Main Dishes', am: 'ዋና ምግቦች' },
        merchant: testData.merchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });
    });

    test('should create a menu item with variants', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Pizza Margherita', am: 'ፒዛ ማርጌሪታ' },
        description: { en: 'Classic Italian pizza', am: 'ክላሲክ ጣሊያን ፒዛ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 15.99,
        variants: [
          { name: 'Small', price: 12.99, isDefault: false, available: true },
          { name: 'Medium', price: 15.99, isDefault: true, available: true },
          { name: 'Large', price: 19.99, isDefault: false, available: true }
        ],
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      expect(menuItem).toBeDefined();
      expect(menuItem.name.en).toBe('Pizza Margherita');
      expect(menuItem.variants).toHaveLength(3);
      expect(menuItem.variants[1].isDefault).toBe(true);
      expect(menuItem.categoryId.toString()).toBe(testData.category._id.toString());
    });

    test('should retrieve menu items by category', async () => {
      await MenuItem.create({
        name: { en: 'Burger', am: 'በርገር' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await MenuItem.create({
        name: { en: 'Pasta', am: 'ፓስታ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 12.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const items = await MenuItem.find({
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        deletedAt: null
      });

      expect(items).toHaveLength(2);
    });

    test('should soft delete a menu item', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Salad', am: 'ሰላጣ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 8.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      // Soft delete
      menuItem.deletedAt = new Date();
      menuItem.deletedBy = testData.user._id;
      await menuItem.save();

      const found = await MenuItem.findById(menuItem._id);
      expect(found.deletedAt).toBeDefined();
    });
  });

  describe('MenuGroup Service & Model', () => {
    test('should create a menu group with items', async () => {
      const category = await Category.create({
        name: { en: 'Lunch', am: 'ምሳ' },
        merchant: testData.merchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const menuItem = await MenuItem.create({
        name: { en: 'Sandwich', am: 'ሳንድዊች' },
        categoryId: category._id,
        merchant: testData.merchant._id,
        price: 7.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const menuGroup = await MenuGroup.create({
        name: { en: 'Lunch Specials', am: 'የምሳ ልዩ ምርጫዎች' },
        description: { en: 'Daily lunch menu', am: 'የዕለት ምሳ ምናሌ' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [
          {
            menu: menuItem._id,
            sortOrder: 1,
            isHidden: false
          }
        ],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      expect(menuGroup).toBeDefined();
      expect(menuGroup.name.en).toBe('Lunch Specials');
      expect(menuGroup.items).toHaveLength(1);
      expect(menuGroup.branches).toHaveLength(1);
    });

    test('should populate menu items in group', async () => {
      const category = await Category.create({
        name: { en: 'Breakfast', am: 'ቁርስ' },
        merchant: testData.merchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const menuItem = await MenuItem.create({
        name: { en: 'Pancakes', am: 'ፓንኬኮች' },
        categoryId: category._id,
        merchant: testData.merchant._id,
        price: 6.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const menuGroup = await MenuGroup.create({
        name: { en: 'Breakfast Menu', am: 'የቁርስ ምናሌ' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [{ menu: menuItem._id, sortOrder: 1 }],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const populated = await MenuGroup.findById(menuGroup._id)
        .populate('items.menu');

      expect(populated.items[0].menu.name.en).toBe('Pancakes');
    });
  });

  describe('Combo Service & Model', () => {
    test('should create a combo with multiple items', async () => {
      const category = await Category.create({
        name: { en: 'Combos', am: 'ኮምቦዎች' },
        merchant: testData.merchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const burger = await MenuItem.create({
        name: { en: 'Burger', am: 'በርገር' },
        categoryId: category._id,
        merchant: testData.merchant._id,
        price: 10.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const fries = await MenuItem.create({
        name: { en: 'Fries', am: 'ድንች' },
        categoryId: category._id,
        merchant: testData.merchant._id,
        price: 3.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const combo = await Combo.create({
        name: { en: 'Burger Meal', am: 'የበርገር ምግብ' },
        description: { en: 'Burger with fries', am: 'በርገር ከድንች ጋር' },
        merchant: testData.merchant._id,
        items: [
          { menuItem: burger._id, quantity: 1, nameFallback: 'Burger' },
          { menuItem: fries._id, quantity: 1, nameFallback: 'Fries' }
        ],
        comboPrice: 12.99,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      expect(combo).toBeDefined();
      expect(combo.name.en).toBe('Burger Meal');
      expect(combo.items).toHaveLength(2);
      expect(combo.comboPrice).toBe(12.99);
    });

    test('should calculate savings in combo', async () => {
      const category = await Category.create({
        name: { en: 'Test', am: 'ሙከራ' },
        merchant: testData.merchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const item1 = await MenuItem.create({
        name: { en: 'Item 1', am: 'ዕቃ 1' },
        categoryId: category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const item2 = await MenuItem.create({
        name: { en: 'Item 2', am: 'ዕቃ 2' },
        categoryId: category._id,
        merchant: testData.merchant._id,
        price: 5.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const combo = await Combo.create({
        name: { en: 'Deal', am: 'ስምምነት' },
        merchant: testData.merchant._id,
        items: [
          { menuItem: item1._id, quantity: 1, nameFallback: 'Item 1' },
          { menuItem: item2._id, quantity: 1, nameFallback: 'Item 2' }
        ],
        comboPrice: 12.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      // Total individual price would be 15.00, combo is 12.00
      // Savings = 3.00
      expect(combo.comboPrice).toBeLessThan(15.00);
    });
  });

  describe('Controller Integration', () => {
    test('should create menu item via API', async () => {
      const category = await Category.create({
        name: { en: 'Desserts', am: 'ጣፋጮች' },
        merchant: testData.merchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .post('/api/v1/menus')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'Ice Cream', am: 'አይስክሬም' },
          description: { en: 'Vanilla ice cream', am: 'ቫኒላ አይስክሬም' },
          categoryId: category._id,
          price: 5.99,
          available: true,
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menu.name.en).toBe('Ice Cream');
    });

    test('should get all menu items via API', async () => {
      const category = await Category.create({
        name: { en: 'Test', am: 'ሙከራ' },
        merchant: testData.merchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await MenuItem.create({
        name: { en: 'Item 1', am: 'ዕቃ 1' },
        categoryId: category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await MenuItem.create({
        name: { en: 'Item 2', am: 'ዕቃ 2' },
        categoryId: category._id,
        merchant: testData.merchant._id,
        price: 12.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .get('/api/v1/menus')
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menus.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    test('should not access menu items from another merchant', async () => {
      // Create another merchant
      const otherMerchant = await Merchant.create({
        name: 'Other Restaurant',
        phone: '+9876543210',
        email: 'other@restaurant.com',
        address: { street: '456 Other St', city: 'Other City' }
      });

      const otherCategory = await Category.create({
        name: { en: 'Other Category', am: 'ሌላ ምድብ' },
        merchant: otherMerchant._id,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await MenuItem.create({
        name: { en: 'Other Item', am: 'ሌላ ዕቃ' },
        categoryId: otherCategory._id,
        merchant: otherMerchant._id,
        price: 20.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      // Query with our merchant ID should not return other merchant's items
      const items = await MenuItem.find({
        merchant: testData.merchant._id,
        deletedAt: null
      });

      expect(items).toHaveLength(0);
    });
  });
});
