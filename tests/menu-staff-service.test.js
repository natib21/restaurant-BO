/**
 * @file tests/menu-staff-service.test.js
 * @description Unit tests for MenuGroupService.getStaffMenu() method
 * 
 * Tests cover:
 * - Basic staff menu retrieval
 * - Authentication requirements
 * - Scheduling logic (time slots, active days)
 * - Merchant association
 * - Soft-deleted items exclusion
 * - Unavailable items exclusion
 * - Item deduplication
 * - Response structure
 */

const mongoose = require('mongoose');
const { connectDatabase } = require('../src/common/database/connection');
const MenuGroupService = require('../src/modules/menu/service/MenuGroup.service');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const MenuGroup = require('../src/modules/menu/model/MenuGroup.model');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Category = require('../src/modules/menu/model/Category.model');

describe('MenuGroupService.getStaffMenu() - Service Unit Tests', () => {
  let merchant, branch, category;
  let menuItem1, menuItem2, deletedItem;
  let alwaysVisibleGroup, scheduledGroup, hiddenGroup;
  let mockUser;

  beforeAll(async () => {
    await connectDatabase();

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Staff Test Restaurant',
      email: 'staff@restaurant.com',
      phone: '+251911234568',
      slug: 'staff-test-restaurant-' + Date.now(),
      owner: {
        fullName: 'Staff Owner',
        gender: 'Male',
        email: 'owner-staff-menu@test' + Date.now() + '.com',
        phone: '+251911234568'
      },
      isActive: true,
    });

    // Create branch
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Staff Branch',
      branchName: 'Staff Branch',
      location: {
        city: 'Addis Ababa',
        coordinates: [9.03, 38.74],
      },
      isActive: true,
    });

    // Create category
    category = await Category.create({
      merchant: merchant._id,
      name: { en: 'Staff Menu', am: 'የሰራተኞች ምናሌ' },
      isActive: true,
    });

    // Create active menu items
    menuItem1 = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Staff Burger', am: 'የሰራተኞች በርገር' },
      description: { en: 'Burger for staff', am: 'ለሰራተኞች በርገር' },
      type: 'food',
      variants: [{ name: 'Regular', price: 100, isDefault: true }],
      available: true,
      inStock: true,
      publishStatus: 'published',
      isVeg: false,
      isSpicy: false,
      prepTime: '10 min',
      ratingAverage: 4.5,
    });

    menuItem2 = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Staff Pizza', am: 'የሰራተኞች ፒዛ' },
      description: { en: 'Pizza for staff', am: 'ለሰራተኞች ፒዛ' },
      type: 'food',
      variants: [{ name: 'Medium', price: 150, isDefault: true }],
      available: true,
      inStock: true,
      publishStatus: 'published',
      isVeg: false,
      isSpicy: false,
      prepTime: '15 min',
      ratingAverage: 4.7,
    });
    
    // Create item specifically for scheduled group testing
    const menuItem3 = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Scheduled Special', am: 'በጊዜ ልዩ' },
      description: { en: 'Only on weekdays', am: 'በሳምንት ቀናት ብቻ' },
      type: 'food',
      variants: [{ name: 'Regular', price: 120, isDefault: true }],
      available: true,
      inStock: true,
      publishStatus: 'published',
      isVeg: false,
      isSpicy: false,
      prepTime: '12 min',
      ratingAverage: 4.6,
    });

    // Create deleted item
    deletedItem = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Deleted Staff Item', am: 'የተሰረዘ' },
      type: 'food',
      variants: [{ name: 'Regular', price: 80, isDefault: true }],
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
      name: { en: 'Staff Always Available', am: 'ሁልጊዜ ይገኛል' },
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
      name: { en: 'Staff Scheduled', am: 'በጊዜ ይገኛል' },
      visibility: 'scheduled',
      priority: 5,
      activeDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      timeSlots: [{ start: '00:00', end: '23:59' }], // All day for testing
      items: [{ menu: menuItem3._id, sortOrder: 1 }], // Use unique item
    });

    hiddenGroup = await MenuGroup.create({
      merchant: merchant._id,
      branches: [branch._id],
      name: { en: 'Staff Hidden', am: 'የተደበቀ' },
      visibility: 'hidden',
      priority: 1,
      items: [{ menu: menuItem2._id, sortOrder: 1 }],
    });

    // Mock authenticated user
    mockUser = {
      _id: new mongoose.Types.ObjectId(),
      merchant: merchant._id,
      role: 'manager',
    };
  });

  afterAll(async () => {
    await MenuItem.deleteMany({});
    await MenuGroup.deleteMany({});
    await Category.deleteMany({});
    await Branch.deleteMany({});
    await Merchant.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Basic Functionality', () => {
    test('should return staff menu with always-visible items', async () => {
      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      expect(result).toHaveProperty('role', 'manager');
      expect(result).toHaveProperty('restaurant', 'Staff Test Restaurant');
      expect(result).toHaveProperty('totalItems');
      expect(result).toHaveProperty('menu');
      expect(Array.isArray(result.menu)).toBe(true);
      expect(result.menu.length).toBeGreaterThanOrEqual(2);
    });

    test('should throw error if user has no merchant', async () => {
      const req = {
        user: { _id: new mongoose.Types.ObjectId(), role: 'staff' },
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      await expect(MenuGroupService.getStaffMenu(req)).rejects.toThrow(
        'You are not associated with any restaurant.'
      );
    });

    test('should enforce multi-tenant isolation', async () => {
      // Create second merchant with unique owner email and slug
      const merchant2 = await Merchant.create({
        businessName: 'Competitor Staff Restaurant',
        email: 'competitor-staff@restaurant.com',
        phone: '+251933333333',
        slug: 'competitor-staff-restaurant-' + Date.now(),
        owner: {
          fullName: 'Competitor Staff Owner',
          gender: 'Female',
          email: 'owner-competitor-staff@test' + Date.now() + '.com',
          phone: '+251933333333'
        },
        isActive: true,
      });

      const branch2 = await Branch.create({
        merchant: merchant2._id,
        name: 'Competitor Staff Branch',
        branchName: 'Competitor Staff Branch',
        location: {
          city: 'Addis Ababa',
          coordinates: [9.05, 38.76],
        },
        isActive: true,
      });

      const category2 = await Category.create({
        merchant: merchant2._id,
        name: { en: 'Competitor Staff Dishes', am: 'የተፎካካሪ የሰራተኞች ምግቦች' },
        isActive: true,
      });

      const competitorItem = await MenuItem.create({
        merchant: merchant2._id,
        categoryId: category2._id,
        name: { en: 'Competitor Staff Pizza', am: 'የተፎካካሪ የሰራተኞች ፒዛ' },
        type: 'food',
        variants: [{ name: 'Large', price: 350, isDefault: true }],
        available: true,
        inStock: true,
        publishStatus: 'published',
      });

      const competitorGroup = await MenuGroup.create({
        merchant: merchant2._id,
        branches: [branch2._id],
        name: { en: 'Competitor Staff Menu', am: 'የተፎካካሪ የሰራተኞች ምናሌ' },
        visibility: 'always',
        priority: 100,
        items: [{ menu: competitorItem._id, sortOrder: 1 }],
      });

      // Staff from merchant 1 should NOT see merchant 2's items
      const req = {
        user: { ...mockUser, merchant: merchant._id },
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      const itemNames = result.menu.map(item => item.name);
      expect(itemNames).not.toContain('Competitor Staff Pizza');
      expect(result.restaurant).toBe('Staff Test Restaurant');
      expect(result.restaurant).not.toBe('Competitor Staff Restaurant');

      // Cleanup
      await MenuItem.deleteOne({ _id: competitorItem._id });
      await MenuGroup.deleteOne({ _id: competitorGroup._id });
      await Category.deleteOne({ _id: category2._id });
      await Branch.deleteOne({ _id: branch2._id });
      await Merchant.deleteOne({ _id: merchant2._id });
    });

    test('should throw error if merchant is inactive', async () => {
      const inactiveMerchant = await Merchant.create({
        businessName: 'Inactive Staff Restaurant',
        email: 'inactive-staff@test.com',
        phone: '+251911234570',
        slug: 'inactive-staff-restaurant-' + Date.now(),
        owner: {
          fullName: 'Inactive Staff Owner',
          gender: 'Female',
          email: 'owner-inactive-staff@test' + Date.now() + '.com',
          phone: '+251911234570'
        },
        isActive: false,
      });

      const req = {
        user: {
          _id: new mongoose.Types.ObjectId(),
          merchant: inactiveMerchant._id,
          role: 'manager',
        },
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      await expect(MenuGroupService.getStaffMenu(req)).rejects.toThrow(
        'Restaurant not found or closed.'
      );

      await Merchant.deleteOne({ _id: inactiveMerchant._id });
    });
  });

  describe('Visibility and Scheduling', () => {
    test('should NOT include hidden groups', async () => {
      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      const categories = result.menu.map(item => item.category);
      expect(categories).not.toContain('Staff Hidden');
    });

    test('should include scheduled group if within time slot and active day', async () => {
      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      // Check if today is a weekday
      const now = new Date();
      const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
      const isWeekday = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(
        dayName
      );

      // Get unique categories
      const categories = [...new Set(result.menu.map(item => item.category))];

      if (isWeekday) {
        // On weekdays, scheduled group should be included
        expect(categories).toContain('Staff Scheduled');
      } else {
        // On weekends, scheduled group should not be included
        expect(categories).not.toContain('Staff Scheduled');
      }
    });
  });

  describe('Soft Delete Handling', () => {
    test('should NOT include soft-deleted items', async () => {
      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      const itemNames = result.menu.map(item => item.name);
      expect(itemNames).not.toContain('Deleted Staff Item');
    });

    test('should NOT include unavailable items', async () => {
      const unavailableItem = await MenuItem.create({
        merchant: merchant._id,
        categoryId: category._id,
        name: { en: 'Unavailable Staff Item', am: 'የማይገኝ' },
        type: 'food',
        variants: [{ name: 'Regular', price: 90, isDefault: true }],
        available: false,
        inStock: true,
        publishStatus: 'published',
      });

      await MenuGroup.findByIdAndUpdate(alwaysVisibleGroup._id, {
        $push: { items: { menu: unavailableItem._id, sortOrder: 5 } },
      });

      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      const itemNames = result.menu.map(item => item.name);
      expect(itemNames).not.toContain('Unavailable Staff Item');

      await MenuItem.deleteOne({ _id: unavailableItem._id });
    });
  });

  describe('Item Deduplication', () => {
    test('should deduplicate items appearing in multiple groups', async () => {
      // Add menuItem1 to scheduledGroup as well (to test deduplication)
      await MenuGroup.findByIdAndUpdate(scheduledGroup._id, {
        $push: { items: { menu: menuItem1._id, sortOrder: 2 } },
      });

      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      // menuItem1 is now in both alwaysVisibleGroup and scheduledGroup
      const burgerItems = result.menu.filter(item => item.name === 'Staff Burger');
      expect(burgerItems.length).toBe(1);
    });

    test('should use highest priority group data when item appears in multiple groups', async () => {
      // Create a new item that will appear in two groups with different customizations
      const sharedStaffItem = await MenuItem.create({
        merchant: merchant._id,
        categoryId: category._id,
        name: { en: 'Shared Staff Item', am: 'የተጋራ የሰራተኞች' },
        description: { en: 'Base staff description', am: 'መሰረታዊ መግለጫ' },
        type: 'food',
        variants: [{ name: 'Regular', price: 110, isDefault: true }],
        available: true,
        inStock: true,
        publishStatus: 'published',
      });

      // Create high priority group (priority 25) with custom name and override price
      const highPriorityStaffGroup = await MenuGroup.create({
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Premium Staff Selection', am: 'ልዩ የሰራተኞች ምርጫ' },
        visibility: 'always',
        priority: 25, // Highest priority
        items: [{
          menu: sharedStaffItem._id,
          sortOrder: 1,
          customName: 'Premium Staff Item',
          overridePrice: 160,
        }],
      });

      // Create low priority group (priority 3) with different customizations
      const lowPriorityStaffGroup = await MenuGroup.create({
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Budget Staff Selection', am: 'ኢኮኖሚያዊ የሰራተኞች ምርጫ' },
        visibility: 'always',
        priority: 3, // Lower priority
        items: [{
          menu: sharedStaffItem._id,
          sortOrder: 1,
          customName: 'Budget Staff Item',
          overridePrice: 70,
        }],
      });

      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      // Find the shared item in results
      const sharedItems = result.menu.filter(item =>
        item.name === 'Premium Staff Item' || item.name === 'Budget Staff Item'
      );

      // DEDUPLICATION RULE: Groups are sorted by priority DESC (highest first).
      // When the same MenuItem appears in multiple groups, the FIRST occurrence wins.
      // First = highest priority group's customizations (customName, overridePrice, category).
      expect(sharedItems.length).toBe(1); // Only one instance
      expect(sharedItems[0].name).toBe('Premium Staff Item'); // High priority group's customName
      expect(sharedItems[0].price).toBe(160); // High priority group's overridePrice
      expect(sharedItems[0].category).toBe('Premium Staff Selection'); // High priority group name

      // Cleanup
      await MenuItem.deleteOne({ _id: sharedStaffItem._id });
      await MenuGroup.deleteOne({ _id: highPriorityStaffGroup._id });
      await MenuGroup.deleteOne({ _id: lowPriorityStaffGroup._id });
    });

    test('should use deterministic tie-breaking when groups have same priority', async () => {
      // Create a new item that will appear in two groups with SAME priority
      const tieStaffItem = await MenuItem.create({
        merchant: merchant._id,
        categoryId: category._id,
        name: { en: 'Staff Tie Item', am: 'የሰራተኞች እኩል' },
        description: { en: 'Staff item with tie', am: 'እኩል' },
        type: 'food',
        variants: [{ name: 'Regular', price: 110, isDefault: true }],
        available: true,
        inStock: true,
        publishStatus: 'published',
      });

      // Create first group (priority: 10)
      const staffGroup1 = await MenuGroup.create({
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Staff First Group', am: 'የሰራተኞች የመጀመሪያ' },
        visibility: 'always',
        priority: 10,
        items: [{
          menu: tieStaffItem._id,
          sortOrder: 1,
          customName: 'Staff First Custom',
          overridePrice: 130,
        }],
      });

      // Create second group (priority: 10 - SAME as staffGroup1)
      const staffGroup2 = await MenuGroup.create({
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Staff Second Group', am: 'የሰራተኞች ሁለተኛ' },
        visibility: 'always',
        priority: 10, // SAME priority
        items: [{
          menu: tieStaffItem._id,
          sortOrder: 1,
          customName: 'Staff Second Custom',
          overridePrice: 150,
        }],
      });

      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      // Run multiple times to verify determinism
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await MenuGroupService.getStaffMenu(req);
        const tieItems = result.menu.filter(item =>
          item.name === 'Staff First Custom' || item.name === 'Staff Second Custom'
        );
        results.push(tieItems[0].name);
      }

      // TIE-BREAKING RULE: When two groups have the same priority, sort by _id ASC.
      // Lower _id (created first) wins. Since staffGroup1 was created first, it has lower _id.
      expect(results.length).toBe(3);
      expect(results[0]).toBe(results[1]); // Consistent across runs
      expect(results[1]).toBe(results[2]); // Deterministic
      expect(results[0]).toBe('Staff First Custom'); // staffGroup1 has lower _id (created first)

      // Cleanup
      await MenuItem.deleteOne({ _id: tieStaffItem._id });
      await MenuGroup.deleteOne({ _id: staffGroup1._id });
      await MenuGroup.deleteOne({ _id: staffGroup2._id });
    });
  });

  describe('Response Structure', () => {
    test('should return correct response structure', async () => {
      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('restaurant');
      expect(result).toHaveProperty('totalItems');
      expect(result).toHaveProperty('menu');

      expect(typeof result.role).toBe('string');
      expect(typeof result.restaurant).toBe('string');
      expect(typeof result.totalItems).toBe('number');
      expect(Array.isArray(result.menu)).toBe(true);

      if (result.menu.length > 0) {
        const firstItem = result.menu[0];
        expect(firstItem).toHaveProperty('id');
        expect(firstItem).toHaveProperty('name');
        expect(firstItem).toHaveProperty('description');
        expect(firstItem).toHaveProperty('price');
        expect(firstItem).toHaveProperty('variants');
        expect(firstItem).toHaveProperty('type');
        expect(firstItem).toHaveProperty('isVeg');
        expect(firstItem).toHaveProperty('isSpicy');
        expect(firstItem).toHaveProperty('prepTime');
        expect(firstItem).toHaveProperty('rating');
        expect(firstItem).toHaveProperty('category');
      }
    });

    test('should NOT include special offers section (unlike public menu)', async () => {
      const req = {
        user: mockUser,
        protocol: 'http',
        get: () => 'localhost:3000',
      };

      const result = await MenuGroupService.getStaffMenu(req);

      expect(result).not.toHaveProperty('specialOffers');
      expect(result).not.toHaveProperty('tableNumber');
    });
  });
});
