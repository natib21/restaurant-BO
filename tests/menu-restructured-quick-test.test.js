/**
 * @file tests/menu-restructured-quick-test.test.js
 * @description Quick test to verify restructured menu module works
 * Tests core functionality without full app initialization
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Import new structured models directly
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const MenuGroup = require('../src/modules/menu/model/MenuGroup.model');
const Combo = require('../src/modules/menu/model/Combo.model');
const Category = require('../src/modules/menu/model/Category.model');

// Import new services
const MenuItemService = require('../src/modules/menu/service/MenuItem.service');
const MenuGroupService = require('../src/modules/menu/service/MenuGroup.service');
const ComboService = require('../src/modules/menu/service/Combo.service');
const CategoryService = require('../src/modules/menu/service/Category.service');

describe('Menu Module Restructured - Quick Test', () => {
  let connection;
  const testMerchantId = new mongoose.Types.ObjectId();
  const testUserId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    connection = await mongoose.connect(process.env.DATABASE_URL);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up
    await MenuItem.deleteMany({});
    await MenuGroup.deleteMany({});
    await Combo.deleteMany({});
    await Category.deleteMany({});
  });

  describe('Model Imports', () => {
    test('should import all new models correctly', () => {
      expect(MenuItem).toBeDefined();
      expect(MenuGroup).toBeDefined();
      expect(Combo).toBeDefined();
      expect(Category).toBeDefined();
      
      expect(MenuItem.modelName).toBe('MenuItem');
      expect(MenuGroup.modelName).toBe('MenuGroup');
      expect(Combo.modelName).toBe('Combo');
      expect(Category.modelName).toBe('Category');
    });
  });

  describe('Service Imports', () => {
    test('should import all new services correctly', () => {
      expect(MenuItemService).toBeDefined();
      expect(MenuGroupService).toBeDefined();
      expect(ComboService).toBeDefined();
      expect(CategoryService).toBeDefined();
      
      expect(typeof MenuItemService.create).toBe('function');
      expect(typeof MenuGroupService.create).toBe('function');
      expect(typeof ComboService.create).toBe('function');
      expect(typeof CategoryService.create).toBe('function');
    });
  });

  describe('Category Operations', () => {
    test('should create a category', async () => {
      const category = await Category.create({
        name: { en: 'Test Category', am: 'የሙከራ ምድብ' },
        merchant: testMerchantId,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      expect(category).toBeDefined();
      expect(category._id).toBeDefined();
      expect(category.name.en).toBe('Test Category');
      expect(category.merchant.toString()).toBe(testMerchantId.toString());
    });

    test('should find categories by merchant', async () => {
      await Category.create({
        name: { en: 'Category 1', am: 'ምድብ 1' },
        merchant: testMerchantId,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      await Category.create({
        name: { en: 'Category 2', am: 'ምድብ 2' },
        merchant: testMerchantId,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      const categories = await Category.find({ merchant: testMerchantId });
      expect(categories).toHaveLength(2);
    });

    test('should soft delete a category', async () => {
      const category = await Category.create({
        name: { en: 'Delete Me', am: 'ሰርዝኝ' },
        merchant: testMerchantId,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      category.deletedAt = new Date();
      category.deletedBy = testUserId;
      await category.save();

      const found = await Category.findById(category._id);
      expect(found.deletedAt).toBeDefined();
      expect(found.deletedBy.toString()).toBe(testUserId.toString());
    });
  });

  describe('MenuItem Operations', () => {
    let testCategory;

    beforeEach(async () => {
      testCategory = await Category.create({
        name: { en: 'Test Category', am: 'የሙከራ ምድብ' },
        merchant: testMerchantId,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });
    });

    test('should create a menu item', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Pizza', am: 'ፒዛ' },
        description: { en: 'Delicious pizza', am: 'ጣፋጭ ፒዛ' },
        categoryId: testCategory._id,
        merchant: testMerchantId,
        price: 15.99,
        available: true,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      expect(menuItem).toBeDefined();
      expect(menuItem._id).toBeDefined();
      expect(menuItem.name.en).toBe('Pizza');
      expect(menuItem.categoryId.toString()).toBe(testCategory._id.toString());
      expect(menuItem.price).toBe(15.99);
    });

    test('should create menu item with variants', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Coffee', am: 'ቡና' },
        categoryId: testCategory._id,
        merchant: testMerchantId,
        price: 3.99,
        variants: [
          { name: 'Small', price: 2.99, isDefault: false, available: true },
          { name: 'Medium', price: 3.99, isDefault: true, available: true },
          { name: 'Large', price: 4.99, isDefault: false, available: true }
        ],
        available: true,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      expect(menuItem.variants).toHaveLength(3);
      expect(menuItem.variants[1].isDefault).toBe(true);
      expect(menuItem.variants[0].price).toBe(2.99);
    });

    test('should query menu items by category', async () => {
      await MenuItem.create({
        name: { en: 'Item 1', am: 'ዕቃ 1' },
        categoryId: testCategory._id,
        merchant: testMerchantId,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      await MenuItem.create({
        name: { en: 'Item 2', am: 'ዕቃ 2' },
        categoryId: testCategory._id,
        merchant: testMerchantId,
        price: 12.00,
        available: true,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      const items = await MenuItem.find({
        categoryId: testCategory._id,
        merchant: testMerchantId,
        deletedAt: null
      });

      expect(items).toHaveLength(2);
    });
  });

  describe('MenuGroup Operations', () => {
    let testMenuItem;

    beforeEach(async () => {
      const testCategory = await Category.create({
        name: { en: 'Test', am: 'ሙከራ' },
        merchant: testMerchantId,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      testMenuItem = await MenuItem.create({
        name: { en: 'Test Item', am: 'የሙከራ ዕቃ' },
        categoryId: testCategory._id,
        merchant: testMerchantId,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });
    });

    test('should create a menu group', async () => {
      const branchId = new mongoose.Types.ObjectId();
      
      const menuGroup = await MenuGroup.create({
        name: { en: 'Lunch Menu', am: 'የምሳ ምናሌ' },
        description: { en: 'Daily lunch', am: 'የእለት ምሳ' },
        merchant: testMerchantId,
        branches: [branchId],
        items: [
          {
            menu: testMenuItem._id,
            sortOrder: 1,
            isHidden: false
          }
        ],
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      expect(menuGroup).toBeDefined();
      expect(menuGroup.name.en).toBe('Lunch Menu');
      expect(menuGroup.items).toHaveLength(1);
      expect(menuGroup.items[0].menu.toString()).toBe(testMenuItem._id.toString());
    });

    test('should populate menu items in group', async () => {
      const branchId = new mongoose.Types.ObjectId();
      
      const menuGroup = await MenuGroup.create({
        name: { en: 'Test Group', am: 'የሙከራ ቡድን' },
        merchant: testMerchantId,
        branches: [branchId],
        items: [{ menu: testMenuItem._id, sortOrder: 1 }],
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      const populated = await MenuGroup.findById(menuGroup._id)
        .populate('items.menu');

      expect(populated.items[0].menu.name.en).toBe('Test Item');
    });
  });

  describe('Combo Operations', () => {
    let testMenuItem1, testMenuItem2;

    beforeEach(async () => {
      const testCategory = await Category.create({
        name: { en: 'Test', am: 'ሙከራ' },
        merchant: testMerchantId,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      testMenuItem1 = await MenuItem.create({
        name: { en: 'Burger', am: 'በርገር' },
        categoryId: testCategory._id,
        merchant: testMerchantId,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      testMenuItem2 = await MenuItem.create({
        name: { en: 'Fries', am: 'ድንች' },
        categoryId: testCategory._id,
        merchant: testMerchantId,
        price: 3.00,
        available: true,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });
    });

    test('should create a combo', async () => {
      const combo = await Combo.create({
        name: { en: 'Meal Deal', am: 'የምግብ ስምምነት' },
        description: { en: 'Burger and fries', am: 'በርገር እና ድንች' },
        merchant: testMerchantId,
        items: [
          { menuItem: testMenuItem1._id, quantity: 1, nameFallback: 'Burger' },
          { menuItem: testMenuItem2._id, quantity: 1, nameFallback: 'Fries' }
        ],
        comboPrice: 11.00,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      expect(combo).toBeDefined();
      expect(combo.name.en).toBe('Meal Deal');
      expect(combo.items).toHaveLength(2);
      expect(combo.comboPrice).toBe(11.00);
    });

    test('should query active combos', async () => {
      await Combo.create({
        name: { en: 'Active Combo', am: 'ንቁ ኮምቦ' },
        merchant: testMerchantId,
        items: [{ menuItem: testMenuItem1._id, quantity: 1, nameFallback: 'Burger' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      await Combo.create({
        name: { en: 'Inactive Combo', am: 'ንቁ ያልሆነ ኮምቦ' },
        merchant: testMerchantId,
        items: [{ menuItem: testMenuItem1._id, quantity: 1, nameFallback: 'Burger' }],
        comboPrice: 8.00,
        isActive: false,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      const activeCombos = await Combo.find({
        merchant: testMerchantId,
        isActive: true,
        deletedAt: null
      });

      expect(activeCombos).toHaveLength(1);
      expect(activeCombos[0].name.en).toBe('Active Combo');
    });
  });

  describe('Multi-Tenant Isolation', () => {
    test('should isolate data by merchant', async () => {
      const merchant1 = new mongoose.Types.ObjectId();
      const merchant2 = new mongoose.Types.ObjectId();

      await Category.create({
        name: { en: 'Merchant 1 Category', am: 'ነጋዴ 1 ምድብ' },
        merchant: merchant1,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      await Category.create({
        name: { en: 'Merchant 2 Category', am: 'ነጋዴ 2 ምድብ' },
        merchant: merchant2,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      const merchant1Categories = await Category.find({ merchant: merchant1 });
      const merchant2Categories = await Category.find({ merchant: merchant2 });

      expect(merchant1Categories).toHaveLength(1);
      expect(merchant2Categories).toHaveLength(1);
      expect(merchant1Categories[0].name.en).toBe('Merchant 1 Category');
      expect(merchant2Categories[0].name.en).toBe('Merchant 2 Category');
    });
  });

  describe('Soft Delete Behavior', () => {
    test('should exclude soft-deleted items from queries', async () => {
      const category = await Category.create({
        name: { en: 'Active', am: 'ንቁ' },
        merchant: testMerchantId,
        isActive: true,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      const deletedCategory = await Category.create({
        name: { en: 'Deleted', am: 'ተሰርዟል' },
        merchant: testMerchantId,
        isActive: true,
        deletedAt: new Date(),
        deletedBy: testUserId,
        createdBy: testUserId,
        updatedBy: testUserId
      });

      const activeOnly = await Category.find({
        merchant: testMerchantId,
        deletedAt: null
      });

      expect(activeOnly).toHaveLength(1);
      expect(activeOnly[0].name.en).toBe('Active');
    });
  });
});
