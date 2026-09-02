/**
 * @file tests/menu-endpoints-complete.test.js
 * @description Complete endpoint testing for restructured menu module
 * 
 * Tests ALL endpoints:
 * - Menu Items (MenuItem)
 * - Menu Groups
 * - Combos
 * - Categories
 * - Branch Menu Groups
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
const Task = require('../models/taskModel');
const Table = require('../models/tabelModel');
const CustomerSession = require('../models/customerSessionModule');

let app;
let testData = {};

describe('Menu Module - Complete Endpoint Tests', () => {
  beforeAll(async () => {
    await connectDatabase();
    app = createApp();

    // Clean up all test data ONCE
    await MenuItem.deleteMany({});
    await MenuGroup.deleteMany({});
    await Combo.deleteMany({});
    await Category.deleteMany({});
    await User.deleteMany({});
    await Merchant.deleteMany({});
    await Branch.deleteMany({});
    await Role.deleteMany({});
    await Task.deleteMany({});
    await Table.deleteMany({});
    await CustomerSession.deleteMany({});

    // ========================================
    // MERCHANT 1 SETUP (Primary Test Merchant)
    // ========================================
    testData.merchant = await Merchant.create({
      businessName: 'Test Restaurant Business',
      slug: 'test-restaurant-' + Date.now(),
      phone: '+251911111111',
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner1@test' + Date.now() + '.com',
        phone: '+251911111111'
      },
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true
    });

    testData.branch = await Branch.create({
      name: 'Main Branch',
      merchant: testData.merchant._id,
      address: { street: '123 Test St', city: 'Addis Ababa' },
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7578, 9.0320]
      },
      isActive: true
    });

    // ========================================
    // MERCHANT 2 SETUP (For Multi-Tenant Tests)
    // ========================================
    testData.merchant2 = await Merchant.create({
      businessName: 'Competitor Restaurant Business',
      slug: 'competitor-restaurant-' + Date.now(),
      phone: '+251922222222',
      owner: {
        fullName: 'Competitor Owner',
        gender: 'Female',
        email: 'owner2@test' + Date.now() + '.com',
        phone: '+251922222222'
      },
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true
    });

    testData.branch2 = await Branch.create({
      name: 'Competitor Branch',
      merchant: testData.merchant2._id,
      address: { street: '456 Other St', city: 'Addis Ababa' },
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7600, 9.0350]
      },
      isActive: true
    });

    // Create tasks for RBAC - comprehensive list for all menu endpoints
    const tasks = await Task.create([
      // Menu Items
      { name: 'menu:create', description: 'Create menu items', method: 'POST', endpoint: '/api/v1/menu' },
      { name: 'menu:list', description: 'List menu items', method: 'GET', endpoint: '/api/v1/menu' },
      { name: 'menu:read', description: 'Read single menu item', method: 'GET', endpoint: '/api/v1/menu/:id' },
      { name: 'menu:update', description: 'Update menu items', method: 'PATCH', endpoint: '/api/v1/menu/:id' },
      { name: 'menu:delete', description: 'Delete menu items', method: 'DELETE', endpoint: '/api/v1/menu/:id' },
      { name: 'menu:toggle', description: 'Toggle availability', method: 'PATCH', endpoint: '/api/v1/menu/:id/toggle-availability' },
      
      // Menu Groups
      { name: 'menu-group:create', description: 'Create menu group', method: 'POST', endpoint: '/api/v1/menu-group' },
      { name: 'menu-group:list', description: 'List menu groups', method: 'GET', endpoint: '/api/v1/menu-group' },
      { name: 'menu-group:light', description: 'List menu groups light', method: 'GET', endpoint: '/api/v1/menu-group/light' },
      { name: 'menu-group:read', description: 'Read single menu group', method: 'GET', endpoint: '/api/v1/menu-group/:id' },
      { name: 'menu-group:update', description: 'Update menu group', method: 'PATCH', endpoint: '/api/v1/menu-group/:id' },
      { name: 'menu-group:delete', description: 'Delete menu group', method: 'DELETE', endpoint: '/api/v1/menu-group/:id' },
      { name: 'menu-group:add-item', description: 'Add item to group', method: 'PATCH', endpoint: '/api/v1/menu-group/:id/add-item' },
      
      // Combos
      { name: 'combo:create', description: 'Create combo', method: 'POST', endpoint: '/api/v1/combo' },
      { name: 'combo:list', description: 'List combos', method: 'GET', endpoint: '/api/v1/combo' },
      { name: 'combo:read', description: 'Read single combo', method: 'GET', endpoint: '/api/v1/combo/:id' },
      { name: 'combo:update', description: 'Update combo', method: 'PATCH', endpoint: '/api/v1/combo/:id' },
      { name: 'combo:delete', description: 'Delete combo', method: 'DELETE', endpoint: '/api/v1/combo/:id' },
      { name: 'combo:toggle', description: 'Toggle combo active', method: 'PATCH', endpoint: '/api/v1/combo/:id/toggle-active' },
    ]);

    // Role for merchant 1 (full permissions)
    testData.role = await Role.create({
      name: 'ADMIN',
      description: 'Administrator role with full permissions',
      merchant: testData.merchant._id,
      tasks: tasks.map(t => t._id)
    });

    // Role for merchant 2 (full permissions for their merchant)
    testData.role2 = await Role.create({
      name: 'ADMIN-2',
      description: 'Administrator role for merchant 2',
      merchant: testData.merchant2._id,
      tasks: tasks.map(t => t._id)
    });

    // Role with NO permissions (for negative tests)
    testData.roleNoPerms = await Role.create({
      name: 'NO-PERMS',
      description: 'Role with no permissions',
      merchant: testData.merchant._id,
      tasks: [] // No tasks assigned
    });

    // User for merchant 1
    testData.user = await User.create({
      name: 'Test User',
      firstName: 'Test',
      email: 'testuser@restaurant.com',
      password: 'Password123!',
      passwordConfirm: 'Password123!',
      merchant: testData.merchant._id,
      role: testData.role._id,
      phone: '+251911111111'
    });

    // User for merchant 2 (competitor)
    testData.user2 = await User.create({
      name: 'Competitor User',
      firstName: 'Competitor',
      email: 'competitor@restaurant.com',
      password: 'Password123!',
      passwordConfirm: 'Password123!',
      merchant: testData.merchant2._id,
      role: testData.role2._id,
      phone: '+251922222222'
    });

    // User with no permissions
    testData.userNoPerms = await User.create({
      name: 'No Perms User',
      firstName: 'NoPerms',
      email: 'noperms@restaurant.com',
      password: 'Password123!',
      passwordConfirm: 'Password123!',
      merchant: testData.merchant._id,
      role: testData.roleNoPerms._id,
      phone: '+251933333333'
    });

    // Login to get tokens
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'testuser@restaurant.com',
        password: 'Password123!'
      });
    testData.token = loginRes.body.token;

    const loginRes2 = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'competitor@restaurant.com',
        password: 'Password123!'
      });
    testData.token2 = loginRes2.body.token;

    const loginResNoPerms = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'noperms@restaurant.com',
        password: 'Password123!'
      });
    testData.tokenNoPerms = loginResNoPerms.body.token;

    // Create test category for merchant 1
    testData.category = await Category.create({
      name: { en: 'Main Dishes', am: 'ዋና ምግቦች' },
      description: { en: 'Main course items', am: 'ዋና ምግብ ዕቃዎች' },
      merchant: testData.merchant._id,
      sortOrder: 1,
      isActive: true,
      createdBy: testData.user._id,
      updatedBy: testData.user._id
    });

    // Create test category for merchant 2
    testData.category2 = await Category.create({
      name: { en: 'Competitor Dishes', am: 'ተፎካካሪ ምግቦች' },
      description: { en: 'Competitor items', am: 'ተፎካካሪ ዕቃዎች' },
      merchant: testData.merchant2._id,
      sortOrder: 1,
      isActive: true,
      createdBy: testData.user2._id,
      updatedBy: testData.user2._id
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up only test data that changes between tests
    await MenuItem.deleteMany({});
    await MenuGroup.deleteMany({});
    await Combo.deleteMany({});
  });

  // ========================================
  // MENU ITEMS ENDPOINTS
  // ========================================
  describe('Menu Items Endpoints (MenuItem)', () => {
    test('POST /api/v1/menu - Create menu item', async () => {
      const res = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'Pizza', am: 'ፒዛ' },
          description: { en: 'Delicious pizza', am: 'ጣፋጭ ፒዛ' },
          categoryId: testData.category._id,
          price: 15.99,
          available: true,
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menu).toBeDefined();
      expect(res.body.data.menu.name.en).toBe('Pizza');
    });

    test('GET /api/v1/menu - List all menu items', async () => {
      // Create test items
      await MenuItem.create([
        {
          name: { en: 'Burger', am: 'በርገር' },
          categoryId: testData.category._id,
          merchant: testData.merchant._id,
          price: 10.99,
          available: true,
          isActive: true,
          createdBy: testData.user._id,
          updatedBy: testData.user._id
        },
        {
          name: { en: 'Pasta', am: 'ፓስታ' },
          categoryId: testData.category._id,
          merchant: testData.merchant._id,
          price: 12.99,
          available: true,
          isActive: true,
          createdBy: testData.user._id,
          updatedBy: testData.user._id
        }
      ]);

      const res = await request(app)
        .get('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menus).toBeDefined();
      expect(res.body.data.menus.length).toBeGreaterThanOrEqual(2);
    });

    test('GET /api/v1/menu/:id - Get single menu item', async () => {
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

      const res = await request(app)
        .get(`/api/v1/menu/${menuItem._id}`)
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menu.name.en).toBe('Salad');
    });

    test('PATCH /api/v1/menu/:id - Update menu item', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Sandwich', am: 'ሳንድዊች' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 7.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/menu/${menuItem._id}`)
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          price: 9.99,
          available: false
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menu.price).toBe(9.99);
      expect(res.body.data.menu.available).toBe(false);
    });

    test('DELETE /api/v1/menu/:id - Soft delete menu item', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Soup', am: 'ሾርባ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 5.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .delete(`/api/v1/menu/${menuItem._id}`)
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(204);

      // Verify soft delete
      const deleted = await MenuItem.findById(menuItem._id);
      expect(deleted.deletedAt).toBeDefined();
    });

    test('PATCH /api/v1/menu/:id/toggle-availability - Toggle availability', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Dessert', am: 'ጣፋጭ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 6.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/menu/${menuItem._id}/toggle-availability`)
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menu.available).toBe(false);
    });
  });

  // ========================================
  // MENU GROUPS ENDPOINTS
  // ========================================
  describe('Menu Groups Endpoints', () => {
    test('POST /api/v1/menu-group - Create menu group', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Item 1', am: 'ዕቃ 1' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .post('/api/v1/menu-group')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'Lunch Menu', am: 'የምሳ ምናሌ' },
          description: { en: 'Daily lunch specials', am: 'የእለት ምሳ ልዩ' },
          branches: [testData.branch._id],
          items: [
            {
              menu: menuItem._id,
              sortOrder: 1
            }
          ],
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menuGroup).toBeDefined();
      expect(res.body.data.menuGroup.name.en).toBe('Lunch Menu');
    });

    test('GET /api/v1/menu-group - List all menu groups', async () => {
      await MenuGroup.create({
        name: { en: 'Breakfast', am: 'ቁርስ' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .get('/api/v1/menu-group')
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menuGroups).toBeDefined();
      expect(res.body.data.menuGroups.length).toBeGreaterThanOrEqual(1);
    });

    test('GET /api/v1/menu-group/light - List light menu groups', async () => {
      await MenuGroup.create({
        name: { en: 'Dinner', am: 'እራት' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .get('/api/v1/menu-group/light')
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    test('GET /api/v1/menu-group/:id - Get single menu group', async () => {
      const group = await MenuGroup.create({
        name: { en: 'Drinks', am: 'መጠጦች' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .get(`/api/v1/menu-group/${group._id}`)
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menuGroup.name.en).toBe('Drinks');
    });

    test('PATCH /api/v1/menu-group/:id - Update menu group', async () => {
      const group = await MenuGroup.create({
        name: { en: 'Appetizers', am: 'መክሰስ' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/menu-group/${group._id}`)
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'Starters', am: 'መክሰስ' },
          isActive: false
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.menuGroup.name.en).toBe('Starters');
    });

    test('DELETE /api/v1/menu-group/:id - Delete menu group', async () => {
      const group = await MenuGroup.create({
        name: { en: 'Test Group', am: 'የሙከራ ቡድን' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .delete(`/api/v1/menu-group/${group._id}`)
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(204);
    });

    test('PATCH /api/v1/menu-group/:id/add-item - Add item to group', async () => {
      const menuItem = await MenuItem.create({
        name: { en: 'Item to Add', am: 'ለመጨመር ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const group = await MenuGroup.create({
        name: { en: 'Test Group', am: 'የሙከራ ቡድን' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/menu-group/${group._id}/add-item`)
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          menuItemId: menuItem._id,
          sortOrder: 1
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // ========================================
  // COMBOS ENDPOINTS
  // ========================================
  describe('Combos Endpoints', () => {
    test('POST /api/v1/combo - Create combo', async () => {
      const item1 = await MenuItem.create({
        name: { en: 'Burger', am: 'በርገር' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const item2 = await MenuItem.create({
        name: { en: 'Fries', am: 'ድንች' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 3.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .post('/api/v1/combo')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'Meal Deal', am: 'የምግብ ስምምነት' },
          description: { en: 'Burger and fries combo', am: 'በርገር እና ድንች ኮምቦ' },
          items: [
            { menuItem: item1._id, quantity: 1, nameFallback: 'Burger' },
            { menuItem: item2._id, quantity: 1, nameFallback: 'Fries' }
          ],
          comboPrice: 11.00,
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.combo.name.en).toBe('Meal Deal');
    });

    test('GET /api/v1/combo - List all combos', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await Combo.create({
        name: { en: 'Test Combo', am: 'የሙከራ ኮምቦ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .get('/api/v1/combo')
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.combos).toBeDefined();
    });

    test('GET /api/v1/combo/active - Get active combos (table session)', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await Combo.create({
        name: { en: 'Active Combo', am: 'ንቁ ኮምቦ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      // Build a table session for testData.merchant (same pattern as getPublicMenu).
      // protectTableSession reads the session from DB by token — create it directly.
      const table = await Table.create({
        merchant: testData.merchant._id,
        branch: testData.branch._id,
        tableNumber: ('A' + Date.now()).slice(-10),
        capacity: 4,
        isActive: true,
      });

      const sessionToken = 'test-session-token-combos-' + Date.now();
      await CustomerSession.create({
        token: sessionToken,
        table: table._id,
        merchant: testData.merchant._id,
        branch: testData.branch._id,
        isActive: true,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
      });

      const res = await request(app)
        .get('/api/v1/combo/active')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Clean up
      await Table.deleteOne({ _id: table._id });
      await CustomerSession.deleteOne({ token: sessionToken });
    });

    test('GET /api/v1/combo/:id - Get single combo', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const combo = await Combo.create({
        name: { en: 'Single Combo', am: 'ነጠላ ኮምቦ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .get(`/api/v1/combo/${combo._id}`)
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.combo.name.en).toBe('Single Combo');
    });

    test('PATCH /api/v1/combo/:id - Update combo', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const combo = await Combo.create({
        name: { en: 'Update Me', am: 'አዘምን' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/combo/${combo._id}`)
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          comboPrice: 8.50,
          isActive: false
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.combo.comboPrice).toBe(8.50);
    });

    test('DELETE /api/v1/combo/:id - Delete combo', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const combo = await Combo.create({
        name: { en: 'Delete Me', am: 'ሰርዝ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .delete(`/api/v1/combo/${combo._id}`)
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(204);
    });

    test('PATCH /api/v1/combo/:id/toggle-active - Toggle combo active status', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const combo = await Combo.create({
        name: { en: 'Toggle Me', am: 'ቀይር' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/combo/${combo._id}/toggle-active`)
        .set('Authorization', `Bearer ${testData.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.combo.isActive).toBe(false);
    });
  });

  // ========================================
  // MULTI-TENANT ISOLATION TESTS (CRITICAL)
  // ========================================
  describe('Multi-Tenant Security - Menu Items', () => {
    test('User from merchant2 CANNOT read MenuItem belonging to merchant1', async () => {
      // Create menu item for merchant1
      const merchant1Item = await MenuItem.create({
        name: { en: 'Merchant1 Item', am: 'ነጋዴ1 ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      // Try to read with merchant2's token
      const res = await request(app)
        .get(`/api/v1/menu/${merchant1Item._id}`)
        .set('Authorization', `Bearer ${testData.token2}`);

      // Should return 404 (not 200), as merchant2 cannot see merchant1's data
      expect(res.status).toBe(404);
    });

    test('User from merchant2 CANNOT update MenuItem belonging to merchant1', async () => {
      const merchant1Item = await MenuItem.create({
        name: { en: 'Merchant1 Item', am: 'ነጋዴ1 ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/menu/${merchant1Item._id}`)
        .set('Authorization', `Bearer ${testData.token2}`)
        .send({ price: 99.99 });

      expect(res.status).toBe(404);

      // Verify original item unchanged
      const unchanged = await MenuItem.findById(merchant1Item._id);
      expect(unchanged.price).toBe(10.99);
    });

    test('User from merchant2 CANNOT delete MenuItem belonging to merchant1', async () => {
      const merchant1Item = await MenuItem.create({
        name: { en: 'Merchant1 Item', am: 'ነጋዴ1 ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .delete(`/api/v1/menu/${merchant1Item._id}`)
        .set('Authorization', `Bearer ${testData.token2}`);

      expect(res.status).toBe(404);

      // Verify item still exists and not deleted
      const stillExists = await MenuItem.findById(merchant1Item._id);
      expect(stillExists).toBeTruthy();
      expect(stillExists.deletedAt).toBeFalsy();
    });

    test('GET /api/v1/menu with merchant2 token does NOT return merchant1 items', async () => {
      // Create items for both merchants
      await MenuItem.create({
        name: { en: 'Merchant1 Pizza', am: 'ነጋዴ1 ፒዛ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 15.99,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await MenuItem.create({
        name: { en: 'Merchant2 Pizza', am: 'ነጋዴ2 ፒዛ' },
        categoryId: testData.category2._id,
        merchant: testData.merchant2._id,
        price: 12.99,
        available: true,
        isActive: true,
        createdBy: testData.user2._id,
        updatedBy: testData.user2._id
      });

      // Query as merchant2
      const res = await request(app)
        .get('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.token2}`);

      expect(res.status).toBe(200);
      expect(res.body.data.menus).toBeDefined();
      
      // All returned items must belong to merchant2
      res.body.data.menus.forEach(item => {
        expect(item.merchant.toString()).toBe(testData.merchant2._id.toString());
        expect(item.name.en).toContain('Merchant2');
      });
    });
  });

  describe('Multi-Tenant Security - Menu Groups', () => {
    test('User from merchant2 CANNOT read MenuGroup belonging to merchant1', async () => {
      const merchant1Group = await MenuGroup.create({
        name: { en: 'Merchant1 Group', am: 'ነጋዴ1 ቡድን' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .get(`/api/v1/menu-group/${merchant1Group._id}`)
        .set('Authorization', `Bearer ${testData.token2}`);

      expect(res.status).toBe(404);
    });

    test('User from merchant2 CANNOT update MenuGroup belonging to merchant1', async () => {
      const merchant1Group = await MenuGroup.create({
        name: { en: 'Merchant1 Group', am: 'ነጋዴ1 ቡድን' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/menu-group/${merchant1Group._id}`)
        .set('Authorization', `Bearer ${testData.token2}`)
        .send({ isActive: false });

      expect(res.status).toBe(404);
    });

    test('User from merchant2 CANNOT delete MenuGroup belonging to merchant1', async () => {
      const merchant1Group = await MenuGroup.create({
        name: { en: 'Merchant1 Group', am: 'ነጋዴ1 ቡድን' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .delete(`/api/v1/menu-group/${merchant1Group._id}`)
        .set('Authorization', `Bearer ${testData.token2}`);

      expect(res.status).toBe(404);
    });

    test('GET /api/v1/menu-group with merchant2 token does NOT return merchant1 groups', async () => {
      await MenuGroup.create({
        name: { en: 'Merchant1 Lunch', am: 'ነጋዴ1 ምሳ' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await MenuGroup.create({
        name: { en: 'Merchant2 Lunch', am: 'ነጋዴ2 ምሳ' },
        merchant: testData.merchant2._id,
        branches: [testData.branch2._id],
        items: [],
        isActive: true,
        createdBy: testData.user2._id,
        updatedBy: testData.user2._id
      });

      const res = await request(app)
        .get('/api/v1/menu-group')
        .set('Authorization', `Bearer ${testData.token2}`);

      expect(res.status).toBe(200);
      res.body.data.menuGroups.forEach(group => {
        expect(group.merchant.toString()).toBe(testData.merchant2._id.toString());
      });
    });
  });

  describe('Multi-Tenant Security - Combos', () => {
    test('User from merchant2 CANNOT read Combo belonging to merchant1', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const merchant1Combo = await Combo.create({
        name: { en: 'Merchant1 Combo', am: 'ነጋዴ1 ኮምቦ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .get(`/api/v1/combo/${merchant1Combo._id}`)
        .set('Authorization', `Bearer ${testData.token2}`);

      expect(res.status).toBe(404);
    });

    test('User from merchant2 CANNOT update Combo belonging to merchant1', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const merchant1Combo = await Combo.create({
        name: { en: 'Merchant1 Combo', am: 'ነጋዴ1 ኮምቦ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/combo/${merchant1Combo._id}`)
        .set('Authorization', `Bearer ${testData.token2}`)
        .send({ comboPrice: 99.00 });

      expect(res.status).toBe(404);
    });

    test('User from merchant2 CANNOT delete Combo belonging to merchant1', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const merchant1Combo = await Combo.create({
        name: { en: 'Merchant1 Combo', am: 'ነጋዴ1 ኮምቦ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .delete(`/api/v1/combo/${merchant1Combo._id}`)
        .set('Authorization', `Bearer ${testData.token2}`);

      expect(res.status).toBe(404);
    });

    test('GET /api/v1/combo with merchant2 token does NOT return merchant1 combos', async () => {
      const item1 = await MenuItem.create({
        name: { en: 'Item1', am: 'ዕቃ1' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const item2 = await MenuItem.create({
        name: { en: 'Item2', am: 'ዕቃ2' },
        categoryId: testData.category2._id,
        merchant: testData.merchant2._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user2._id,
        updatedBy: testData.user2._id
      });

      await Combo.create({
        name: { en: 'Merchant1 Combo', am: 'ነጋዴ1 ኮምቦ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item1._id, quantity: 1, nameFallback: 'Item1' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await Combo.create({
        name: { en: 'Merchant2 Combo', am: 'ነጋዴ2 ኮምቦ' },
        merchant: testData.merchant2._id,
        items: [{ menuItem: item2._id, quantity: 1, nameFallback: 'Item2' }],
        comboPrice: 8.00,
        isActive: true,
        createdBy: testData.user2._id,
        updatedBy: testData.user2._id
      });

      const res = await request(app)
        .get('/api/v1/combo')
        .set('Authorization', `Bearer ${testData.token2}`);

      expect(res.status).toBe(200);
      res.body.data.combos.forEach(combo => {
        expect(combo.merchant.toString()).toBe(testData.merchant2._id.toString());
      });
    });
  });

  // ========================================
  // NEGATIVE AUTH TESTS
  // ========================================
  describe('Authentication Tests - No Token', () => {
    test('GET /api/v1/menu without Authorization header returns 401', async () => {
      const res = await request(app).get('/api/v1/menu');
      expect(res.status).toBe(401);
    });

    test('POST /api/v1/menu-group without Authorization header returns 401', async () => {
      const res = await request(app)
        .post('/api/v1/menu-group')
        .send({ name: { en: 'Test' } });
      expect(res.status).toBe(401);
    });

    test('PATCH /api/v1/combo/:id without Authorization header returns 401', async () => {
      const res = await request(app)
        .patch('/api/v1/combo/507f1f77bcf86cd799439011')
        .send({ comboPrice: 10 });
      expect(res.status).toBe(401);
    });
  });

  describe('Authentication Tests - Invalid Token', () => {
    test('GET /api/v1/menu with invalid token returns 401', async () => {
      const res = await request(app)
        .get('/api/v1/menu')
        .set('Authorization', 'Bearer invalidtoken12345');
      expect(res.status).toBe(401);
    });

    test('POST /api/v1/combo with garbage token returns 401', async () => {
      const res = await request(app)
        .post('/api/v1/combo')
        .set('Authorization', 'Bearer xyz.abc.123')
        .send({ name: { en: 'Test' } });
      expect(res.status).toBe(401);
    });
  });

  describe('Authorization Tests - No Permissions', () => {
    test('User with no tasks/permissions CANNOT create menu item (403)', async () => {
      const res = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.tokenNoPerms}`)
        .send({
          name: { en: 'Should Fail', am: 'መሽመድ አለበት' },
          categoryId: testData.category._id,
          price: 10.00,
          available: true,
          isActive: true
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/denied|permission|no permission/i);
    });

    test('User with no tasks/permissions CANNOT list menu items (403)', async () => {
      const res = await request(app)
        .get('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.tokenNoPerms}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/denied|permission|no permission/i);
    });

    test('User with no tasks/permissions CANNOT update menu group (403)', async () => {
      const group = await MenuGroup.create({
        name: { en: 'Test Group', am: 'የሙከራ ቡድን' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .patch(`/api/v1/menu-group/${group._id}`)
        .set('Authorization', `Bearer ${testData.tokenNoPerms}`)
        .send({ isActive: false });

      expect(res.status).toBe(403);
    });

    test('User with no tasks/permissions CANNOT delete combo (403)', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const combo = await Combo.create({
        name: { en: 'Test Combo', am: 'የሙከራ ኮምቦ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .delete(`/api/v1/combo/${combo._id}`)
        .set('Authorization', `Bearer ${testData.tokenNoPerms}`);

      expect(res.status).toBe(403);
    });
  });

  // ========================================
  // INPUT VALIDATION TESTS
  // ========================================
  describe('Input Validation - Menu Items', () => {
    test('POST /api/v1/menu with missing name returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          categoryId: testData.category._id,
          price: 10.00,
          available: true,
          isActive: true
        });

      expect(res.status).toBe(400);
    });

    test('POST /api/v1/menu with negative price returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'Bad Price', am: 'መጥፎ ዋጋ' },
          categoryId: testData.category._id,
          price: -5.00,
          available: true,
          isActive: true
        });

      expect(res.status).toBe(400);
    });

    test('POST /api/v1/menu with missing categoryId returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'No Category', am: 'ምድብ የለም' },
          price: 10.00,
          available: true,
          isActive: true
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Input Validation - Menu Groups', () => {
    test('POST /api/v1/menu-group with missing name returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/menu-group')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          branches: [testData.branch._id],
          items: [],
          isActive: true
        });

      expect(res.status).toBe(400);
    });

    test('POST /api/v1/menu-group with missing branches returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/menu-group')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'No Branches', am: 'ቅርንጫፎች የሉም' },
          items: [],
          isActive: true
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/branch/i);
    });
  });

  describe('Input Validation - Combos', () => {
    test('POST /api/v1/combo with missing name returns 400', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .post('/api/v1/combo')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
          comboPrice: 9.00,
          isActive: true
        });

      expect(res.status).toBe(400);
    });

    test('POST /api/v1/combo with missing items returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/combo')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'No Items', am: 'ዕቃዎች የሉም' },
          comboPrice: 9.00,
          isActive: true
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/item/i);
    });

    test('POST /api/v1/combo with zero price returns 400', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const res = await request(app)
        .post('/api/v1/combo')
        .set('Authorization', `Bearer ${testData.token}`)
        .send({
          name: { en: 'Zero Price', am: 'ዜሮ ዋጋ' },
          items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
          comboPrice: 0,
          isActive: true
        });

      expect(res.status).toBe(400);
    });
  });

  // ========================================
  // SOFT DELETE VERIFICATION TESTS
  // ========================================
  describe('Soft Delete Verification', () => {
    test('Soft-deleted menu item does NOT appear in GET list', async () => {
      // Create menu item
      const menuItem = await MenuItem.create({
        name: { en: 'To Delete', am: 'ለመሰረዝ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      // Soft delete it
      await request(app)
        .delete(`/api/v1/menu/${menuItem._id}`)
        .set('Authorization', `Bearer ${testData.token}`)
        .expect(204);

      // Verify it has deletedAt set
      const deletedItem = await MenuItem.findById(menuItem._id);
      expect(deletedItem.deletedAt).toBeDefined();

      // Verify it does NOT appear in list
      const res = await request(app)
        .get('/api/v1/menu')
        .set('Authorization', `Bearer ${testData.token}`)
        .expect(200);

      const ids = res.body.data.menus.map(m => m._id.toString());
      expect(ids).not.toContain(menuItem._id.toString());
    });

    test('Soft-deleted menu group does NOT appear in GET list', async () => {
      const group = await MenuGroup.create({
        name: { en: 'To Delete', am: 'ለመሰረዝ' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [],
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await request(app)
        .delete(`/api/v1/menu-group/${group._id}`)
        .set('Authorization', `Bearer ${testData.token}`)
        .expect(204);

      const res = await request(app)
        .get('/api/v1/menu-group')
        .set('Authorization', `Bearer ${testData.token}`)
        .expect(200);

      const ids = res.body.data.menuGroups.map(g => g._id.toString());
      expect(ids).not.toContain(group._id.toString());
    });

    test('Soft-deleted combo does NOT appear in GET list', async () => {
      const item = await MenuItem.create({
        name: { en: 'Item', am: 'ዕቃ' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const combo = await Combo.create({
        name: { en: 'To Delete', am: 'ለመሰረዝ' },
        merchant: testData.merchant._id,
        items: [{ menuItem: item._id, quantity: 1, nameFallback: 'Item' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await request(app)
        .delete(`/api/v1/combo/${combo._id}`)
        .set('Authorization', `Bearer ${testData.token}`)
        .expect(204);

      const res = await request(app)
        .get('/api/v1/combo')
        .set('Authorization', `Bearer ${testData.token}`)
        .expect(200);

      const ids = res.body.data.combos.map(c => c._id.toString());
      expect(ids).not.toContain(combo._id.toString());
    });
  });

  // ========================================
  // PUBLIC ENDPOINT EDGE CASES
  // ========================================
  describe('Public Combo Endpoint Security', () => {
    test('GET /api/v1/combo/active without a valid table session returns 401', async () => {
      // No Authorization header → protectTableSession rejects with 401.
      // Previously returned 400 "merchant context required" when the endpoint
      // had no auth guard and relied on a query param for merchantId (Fix 2).
      const res = await request(app).get('/api/v1/combo/active');
      expect(res.status).toBe(401);
    });

    test('GET /api/v1/combo/active: ?merchantId query param is ignored — session merchant wins', async () => {
      // Regression test for the vulnerability fixed in Fix 2:
      // A customer must not be able to fetch another merchant's combos by
      // passing ?merchantId=<other> in the query string.
      //
      // Setup: create one combo for merchant1 and one for merchant2.
      // Use a session scoped to merchant1.
      // Pass ?merchantId=<merchant2._id> in the query string.
      // Assert: only merchant1's combo is returned — the query param has no effect.

      const item1 = await MenuItem.create({
        name: { en: 'Item1', am: 'ዕቃ1' },
        categoryId: testData.category._id,
        merchant: testData.merchant._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      const item2 = await MenuItem.create({
        name: { en: 'Item2', am: 'ዕቃ2' },
        categoryId: testData.category2._id,
        merchant: testData.merchant2._id,
        price: 10.00,
        available: true,
        isActive: true,
        createdBy: testData.user2._id,
        updatedBy: testData.user2._id
      });

      await Combo.create({
        name: { en: 'Merchant1 Combo', am: 'ነጋዴ1 ኮምቦ' },
        merchant: testData.merchant._id,
        branches: [testData.branch._id],
        items: [{ menuItem: item1._id, quantity: 1, nameFallback: 'Item1' }],
        comboPrice: 9.00,
        isActive: true,
        createdBy: testData.user._id,
        updatedBy: testData.user._id
      });

      await Combo.create({
        name: { en: 'Merchant2 Combo', am: 'ነጋዴ2 ኮምቦ' },
        merchant: testData.merchant2._id,
        branches: [testData.branch2._id],
        items: [{ menuItem: item2._id, quantity: 1, nameFallback: 'Item2' }],
        comboPrice: 8.00,
        isActive: true,
        createdBy: testData.user2._id,
        updatedBy: testData.user2._id
      });

      // Create a table session for merchant1
      const table = await Table.create({
        merchant: testData.merchant._id,
        branch: testData.branch._id,
        tableNumber: ('B' + Date.now()).slice(-10),
        capacity: 2,
        isActive: true,
      });

      const sessionToken = 'test-session-token-security-' + Date.now();
      await CustomerSession.create({
        token: sessionToken,
        table: table._id,
        merchant: testData.merchant._id,
        branch: testData.branch._id,
        isActive: true,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      });

      // Pass merchant2's ID as query param — must be completely ignored
      const res = await request(app)
        .get(`/api/v1/combo/active?merchantId=${testData.merchant2._id}`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      expect(res.body.data.combos).toBeDefined();
      const names = res.body.data.combos.map(c => c.name?.en);

      // merchant1's combo must be present
      expect(names).toContain('Merchant1 Combo');
      // merchant2's combo must NOT appear despite the query param
      expect(names).not.toContain('Merchant2 Combo');

      // Clean up
      await Table.deleteOne({ _id: table._id });
      await CustomerSession.deleteOne({ token: sessionToken });
    });
  });
});
