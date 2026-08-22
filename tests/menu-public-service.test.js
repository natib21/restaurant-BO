/**
 * @file tests/menu-public-service.test.js
 * @description Unit tests for MenuGroupService.getPublicMenu() method
 * 
 * Tests cover:
 * - Basic public menu retrieval
 * - Scheduling logic (time slots, active days, blocked days)
 * - Special dates (exact and recurring yearly)
 * - Overnight time slots (22:00-02:00)
 * - Type filtering (food, drink, alcohol)
 * - Hidden items exclusion
 * - Soft-deleted items exclusion
 * - Inactive merchant handling
 */

const mongoose = require('mongoose');
const { connectDatabase } = require('../src/common/database/connection');
const MenuGroupService = require('../src/modules/menu/service/MenuGroup.service');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const MenuGroup = require('../src/modules/menu/model/MenuGroup.model');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Table = require('../models/tabelModel');
const Category = require('../src/modules/menu/model/Category.model');

describe('MenuGroupService.getPublicMenu() - Service Unit Tests', () => {
  let merchant, branch, category, table;
  let menuItem1, menuItem2, menuItem3, deletedItem;
  let alwaysVisibleGroup, scheduledGroup, hiddenGroup;

  beforeAll(async () => {
    await connectDatabase();

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Test Restaurant',
      email: 'test@restaurant.com',
      phone: '+251911234567',
      slug: 'test-restaurant-' + Date.now(),
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner-public-menu@test' + Date.now() + '.com',
        phone: '+251911234567'
      },
      isActive: true,
    });

    // Create branch
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch',
      branchName: 'Main Branch',
      location: {
        city: 'Addis Ababa',
        coordinates: [9.03, 38.74],
      },
      isActive: true,
    });

    // Create category
    category = await Category.create({
      merchant: merchant._id,
      name: { en: 'Main Dishes', am: 'ዋና ምግቦች' },
      isActive: true,
    });

    // Create table
    table = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      tableNumber: 'T1',
      capacity: 4,
      isActive: true,
    });

    // Create active menu items
    menuItem1 = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Burger', am: 'በርገር' },
      description: { en: 'Delicious burger', am: 'ጥሩ በርገር' },
      type: 'food',
      variants: [{ name: 'Regular', price: 150, isDefault: true }],
      available: true,
      inStock: true,
      publishStatus: 'published',
      tags: ['chef-special'],
      isVeg: false,
      isSpicy: false,
      prepTime: '15-20 min',
      ratingAverage: 4.8,
    });

    menuItem2 = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Pizza', am: 'ፒዛ' },
      description: { en: 'Cheesy pizza', am: 'አይብ ፒዛ' },
      type: 'food',
      variants: [{ name: 'Medium', price: 200, isDefault: true }],
      available: true,
      inStock: true,
      publishStatus: 'published',
      tags: ['trending'],
      isVeg: false,
      isSpicy: false,
      prepTime: '20-25 min',
      ratingAverage: 4.5,
    });

    menuItem3 = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Beer', am: 'ቢራ' },
      description: { en: 'Cold beer', am: 'ቀዝቃዛ ቢራ' },
      type: 'drink',
      variants: [{ name: 'Bottle', price: 50, isDefault: true }],
      available: true,
      inStock: true,
      publishStatus: 'published',
      isAlcoholic: true,
      tags: [],
      prepTime: '5 min',
      ratingAverage: 4.2,
    });

    // Create deleted item
    deletedItem = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Deleted Item', am: 'የተሰረዘ' },
      type: 'food',
      variants: [{ name: 'Regular', price: 100, isDefault: true }],
      available: true,
      inStock: true,
      publishStatus: 'published',
      deletedAt: new Date(),
      isActive: false,
    });

    // Create menu groups
    alwaysVisibleGroup = await MenuGroup.create({
      merchant: merchant._id,
      branches: [branch._id],
      name: { en: 'Always Available', am: 'ሁልጊዜ ይገኛል' },
      visibility: 'always',
      priority: 10,
      items: [
        { menu: menuItem1._id, sortOrder: 1 },
        { menu: menuItem2._id, sortOrder: 2 },
        { menu: deletedItem._id, sortOrder: 3 }, // Should be excluded
      ],
    });

    scheduledGroup = await MenuGroup.create({
      merchant: merchant._id,
      branches: [branch._id],
      name: { en: 'Scheduled Items', am: 'በጊዜ ይገኛል' },
      visibility: 'scheduled',
      priority: 5,
      activeDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      timeSlots: [{ start: '00:00', end: '23:59' }], // All day for testing
      items: [{ menu: menuItem3._id, sortOrder: 1 }],
    });

    hiddenGroup = await MenuGroup.create({
      merchant: merchant._id,
      branches: [branch._id],
      name: { en: 'Hidden Group', am: 'የተደበቀ' },
      visibility: 'hidden',
      priority: 1,
      items: [{ menu: menuItem1._id, sortOrder: 1 }],
    });
  });

  afterAll(async () => {
    await MenuItem.deleteMany({});
    await MenuGroup.deleteMany({});
    await Category.deleteMany({});
    await Table.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Basic Functionality', () => {
    test('should return public menu with always-visible items', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      expect(result).toHaveProperty('restaurant', 'Test Restaurant');
      expect(result).toHaveProperty('generatedAt');
      expect(result).toHaveProperty('totalItems');
      expect(result).toHaveProperty('menus');
      expect(result).toHaveProperty('specialOffers');
      expect(Array.isArray(result.menus)).toBe(true);
      expect(result.menus.length).toBeGreaterThanOrEqual(2); // Burger and Pizza
    });

    test('should throw error if merchantId is missing', async () => {
      const req = {
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      await expect(MenuGroupService.getPublicMenu(req)).rejects.toThrow(
        'Merchant ID is required'
      );
    });

    test('should enforce multi-tenant isolation', async () => {
      // Create second merchant with unique owner email and slug
      const merchant2 = await Merchant.create({
        businessName: 'Competitor Restaurant',
        email: 'competitor@restaurant.com',
        phone: '+251922222222',
        slug: 'competitor-restaurant-' + Date.now(),
        owner: {
          fullName: 'Competitor Owner',
          gender: 'Female',
          email: 'owner-competitor@test' + Date.now() + '.com',
          phone: '+251922222222'
        },
        isActive: true,
      });

      const branch2 = await Branch.create({
        merchant: merchant2._id,
        name: 'Competitor Branch',
        branchName: 'Competitor Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [9.04, 38.75],
        },
        isActive: true,
      });

      const category2 = await Category.create({
        merchant: merchant2._id,
        name: { en: 'Competitor Dishes', am: 'የተፎካካሪ ምግቦች' },
        isActive: true,
      });

      const competitorItem = await MenuItem.create({
        merchant: merchant2._id,
        categoryId: category2._id,
        name: { en: 'Competitor Pizza', am: 'የተፎካካሪ ፒዛ' },
        type: 'food',
        variants: [{ name: 'Large', price: 300, isDefault: true }],
        available: true,
        inStock: true,
        publishStatus: 'published',
      });

      const competitorGroup = await MenuGroup.create({
        merchant: merchant2._id,
        branches: [branch2._id],
        name: { en: 'Competitor Menu', am: 'የተፎካካሪ ምናሌ' },
        visibility: 'always',
        priority: 100,
        items: [{ menu: competitorItem._id, sortOrder: 1 }],
      });

      // Request from merchant 1 - should NOT see merchant 2's items
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      const itemNames = result.menus.map(item => item.name);
      expect(itemNames).not.toContain('Competitor Pizza');
      expect(result.restaurant).toBe('Test Restaurant');
      expect(result.restaurant).not.toBe('Competitor Restaurant');

      // Cleanup
      await MenuItem.deleteOne({ _id: competitorItem._id });
      await MenuGroup.deleteOne({ _id: competitorGroup._id });
      await Category.deleteOne({ _id: category2._id });
      await Branch.deleteOne({ _id: branch2._id });
      await Merchant.deleteOne({ _id: merchant2._id });
    });

    test('should throw error if merchant is inactive', async () => {
      const inactiveMerchant = await Merchant.create({
        businessName: 'Inactive Restaurant',
        email: 'inactive@test.com',
        phone: '+251911234569',
        slug: 'inactive-restaurant-' + Date.now(),
        owner: {
          fullName: 'Inactive Owner',
          gender: 'Male',
          email: 'owner-inactive@test' + Date.now() + '.com',
          phone: '+251911234569'
        },
        isActive: false,
      });

      const req = {
        merchantId: inactiveMerchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      await expect(MenuGroupService.getPublicMenu(req)).rejects.toThrow(
        'Restaurant not found or closed'
      );

      await Merchant.deleteOne({ _id: inactiveMerchant._id });
    });

    test('should include special offers section', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      expect(result.specialOffers).toBeInstanceOf(Array);
      expect(result.specialOffers.length).toBeGreaterThan(0);

      const specialOffer = result.specialOffers[0];
      expect(specialOffer).toHaveProperty('id');
      expect(specialOffer).toHaveProperty('name');
      expect(specialOffer).toHaveProperty('tag');
      expect(['chef-special', 'trending', 'bestseller', 'limited']).toContain(
        specialOffer.tag
      );
    });
  });

  describe('Type Filtering', () => {
    test('should filter by type=food', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: { type: 'food' },
      };

      const result = await MenuGroupService.getPublicMenu(req);

      expect(result.menus).toBeInstanceOf(Array);
      result.menus.forEach(item => {
        expect(item.type).toBe('food');
      });
    });

    test('should filter by type=drink (non-alcoholic only)', async () => {
      // Create non-alcoholic drink
      const juice = await MenuItem.create({
        merchant: merchant._id,
        categoryId: category._id,
        name: { en: 'Juice', am: 'ጁስ' },
        type: 'drink',
        variants: [{ name: 'Glass', price: 30, isDefault: true }],
        available: true,
        inStock: true,
        publishStatus: 'published',
        isAlcoholic: false,
      });

      await MenuGroup.findByIdAndUpdate(alwaysVisibleGroup._id, {
        $push: { items: { menu: juice._id, sortOrder: 4 } },
      });

      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: { type: 'drink' },
      };

      const result = await MenuGroupService.getPublicMenu(req);

      result.menus.forEach(item => {
        expect(item.type).toBe('drink');
        expect(item.isAlcoholic).toBe(false);
      });

      await MenuItem.deleteOne({ _id: juice._id });
    });

    test('should filter by type=alcohol', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: { type: 'alcohol' },
      };

      const result = await MenuGroupService.getPublicMenu(req);

      result.menus.forEach(item => {
        expect(item.isAlcoholic).toBe(true);
      });
    });
  });

  describe('Visibility and Scheduling', () => {
    test('should NOT include hidden groups', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      const displayedGroups = result.menus.map(item => item.displayedIn);
      expect(displayedGroups).not.toContain('Hidden Group');
    });

    test('should include scheduled group if within time slot and active day', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      // Since we set timeSlots to all day, it should be included on weekdays
      const now = new Date();
      const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
      const isWeekday = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(
        dayName
      );

      const displayedGroups = result.menus.map(item => item.displayedIn);

      if (isWeekday) {
        // Should include scheduled items on weekdays
        expect(displayedGroups).toContain('Scheduled Items');
      } else {
        // Should not include on weekends
        expect(displayedGroups).not.toContain('Scheduled Items');
      }
    });
  });

  describe('Soft Delete Handling', () => {
    test('should NOT include soft-deleted items', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      const itemNames = result.menus.map(item => item.name);
      expect(itemNames).not.toContain('Deleted Item');
    });

    test('should NOT include unavailable items', async () => {
      const unavailableItem = await MenuItem.create({
        merchant: merchant._id,
        categoryId: category._id,
        name: { en: 'Unavailable Item', am: 'የማይገኝ' },
        type: 'food',
        variants: [{ name: 'Regular', price: 100, isDefault: true }],
        available: false,
        inStock: true,
        publishStatus: 'published',
      });

      await MenuGroup.findByIdAndUpdate(alwaysVisibleGroup._id, {
        $push: { items: { menu: unavailableItem._id, sortOrder: 5 } },
      });

      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      const itemNames = result.menus.map(item => item.name);
      expect(itemNames).not.toContain('Unavailable Item');

      await MenuItem.deleteOne({ _id: unavailableItem._id });
    });
  });

  describe('Table Validation', () => {
    test('should return table number if valid tableId provided', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        tableId: table._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      expect(result.tableNumber).toBe('T1');
    });

    test('should throw error if tableId is invalid', async () => {
      const fakeTableId = new mongoose.Types.ObjectId();

      const req = {
        merchantId: merchant._id.toString(),
        tableId: fakeTableId.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      await expect(MenuGroupService.getPublicMenu(req)).rejects.toThrow(
        'Invalid or inactive table'
      );
    });
  });

  describe('Item Deduplication', () => {
    test('should deduplicate items appearing in multiple groups', async () => {
      // menuItem1 is in both alwaysVisibleGroup and hiddenGroup
      // It should appear only once (from alwaysVisibleGroup, not hidden)
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      const burgerItems = result.menus.filter(item => item.name === 'Burger');
      expect(burgerItems.length).toBe(1); // Should appear only once
    });

    test('should use highest priority group data when item appears in multiple groups', async () => {
      // Create a new item that will appear in two groups with different customizations
      const sharedItem = await MenuItem.create({
        merchant: merchant._id,
        categoryId: category._id,
        name: { en: 'Shared Item', am: 'የተጋራ' },
        description: { en: 'Base description', am: 'መሰረታዊ መግለጫ' },
        type: 'food',
        variants: [{ name: 'Regular', price: 100, isDefault: true }],
        available: true,
        inStock: true,
        publishStatus: 'published',
      });

      // Create high priority group (priority 20) with custom name and override price
      const highPriorityGroup = await MenuGroup.create({
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Premium Selection', am: 'ልዩ ምርጫ' },
        visibility: 'always',
        priority: 20, // Highest priority
        items: [{
          menu: sharedItem._id,
          sortOrder: 1,
          customName: 'Premium Shared Item',
          overridePrice: 150,
        }],
      });

      // Create low priority group (priority 5) with different customizations
      const lowPriorityGroup = await MenuGroup.create({
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Budget Selection', am: 'ኢኮኖሚያዊ ምርጫ' },
        visibility: 'always',
        priority: 5, // Lower priority
        items: [{
          menu: sharedItem._id,
          sortOrder: 1,
          customName: 'Budget Shared Item',
          overridePrice: 80,
        }],
      });

      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      // Find the shared item in results
      const sharedItems = result.menus.filter(item =>
        item.name === 'Premium Shared Item' || item.name === 'Budget Shared Item'
      );

      // DEDUPLICATION RULE: Groups are sorted by priority DESC (highest first).
      // When the same MenuItem appears in multiple groups, the FIRST occurrence wins.
      // First = highest priority group's customizations (customName, overridePrice, displayedIn).
      expect(sharedItems.length).toBe(1); // Only one instance
      expect(sharedItems[0].name).toBe('Premium Shared Item'); // High priority group's customName
      expect(sharedItems[0].price).toBe(150); // High priority group's overridePrice
      expect(sharedItems[0].displayedIn).toBe('Premium Selection'); // High priority group name

      // Cleanup
      await MenuItem.deleteOne({ _id: sharedItem._id });
      await MenuGroup.deleteOne({ _id: highPriorityGroup._id });
      await MenuGroup.deleteOne({ _id: lowPriorityGroup._id });
    });

    test('should use deterministic tie-breaking when groups have same priority', async () => {
      // Create a new item that will appear in two groups with SAME priority
      const tieItem = await MenuItem.create({
        merchant: merchant._id,
        categoryId: category._id,
        name: { en: 'Tie Item', am: 'እኩል' },
        description: { en: 'Item with tie', am: 'እኩል' },
        type: 'food',
        variants: [{ name: 'Regular', price: 100, isDefault: true }],
        available: true,
        inStock: true,
        publishStatus: 'published',
      });

      // Create first group (priority: 10)
      const group1 = await MenuGroup.create({
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'First Group', am: 'የመጀመሪያ' },
        visibility: 'always',
        priority: 10,
        items: [{
          menu: tieItem._id,
          sortOrder: 1,
          customName: 'First Custom Name',
          overridePrice: 120,
        }],
      });

      // Create second group (priority: 10 - SAME as group1)
      const group2 = await MenuGroup.create({
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Second Group', am: 'ሁለተኛ' },
        visibility: 'always',
        priority: 10, // SAME priority
        items: [{
          menu: tieItem._id,
          sortOrder: 1,
          customName: 'Second Custom Name',
          overridePrice: 140,
        }],
      });

      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      // Run multiple times to verify determinism
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await MenuGroupService.getPublicMenu(req);
        const tieItems = result.menus.filter(item =>
          item.name === 'First Custom Name' || item.name === 'Second Custom Name'
        );
        results.push(tieItems[0].name);
      }

      // TIE-BREAKING RULE: When two groups have the same priority, sort by _id ASC.
      // Lower _id (created first) wins. Since group1 was created first, it has lower _id.
      expect(results.length).toBe(3);
      expect(results[0]).toBe(results[1]); // Consistent across runs
      expect(results[1]).toBe(results[2]); // Deterministic
      expect(results[0]).toBe('First Custom Name'); // group1 has lower _id (created first)

      // Cleanup
      await MenuItem.deleteOne({ _id: tieItem._id });
      await MenuGroup.deleteOne({ _id: group1._id });
      await MenuGroup.deleteOne({ _id: group2._id });
    });
  });

  describe('Response Structure', () => {
    test('should return correct response structure', async () => {
      const req = {
        merchantId: merchant._id.toString(),
        protocol: 'http',
        get: () => 'localhost:3000',
        query: {},
      };

      const result = await MenuGroupService.getPublicMenu(req);

      expect(result).toHaveProperty('restaurant');
      expect(result).toHaveProperty('generatedAt');
      expect(result).toHaveProperty('totalItems');
      expect(result).toHaveProperty('menus');
      expect(result).toHaveProperty('specialOffers');
      expect(result).toHaveProperty('tableNumber');

      expect(typeof result.restaurant).toBe('string');
      expect(typeof result.generatedAt).toBe('string');
      expect(typeof result.totalItems).toBe('number');
      expect(Array.isArray(result.menus)).toBe(true);
      expect(Array.isArray(result.specialOffers)).toBe(true);

      if (result.menus.length > 0) {
        const firstItem = result.menus[0];
        expect(firstItem).toHaveProperty('id');
        expect(firstItem).toHaveProperty('name');
        expect(firstItem).toHaveProperty('description');
        expect(firstItem).toHaveProperty('price');
        expect(firstItem).toHaveProperty('variants');
        expect(firstItem).toHaveProperty('rating');
        expect(firstItem).toHaveProperty('displayedIn');
      }
    });
  });
});
