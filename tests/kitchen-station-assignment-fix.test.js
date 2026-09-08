/**
 * Test: Kitchen Station Assignment - Recipe Field Fix
 * 
 * Verifies that menu items can be assigned to kitchen stations
 * after fixing the recipe field schema mismatch.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const KitchenStation = require('../models/KitchenStation');
const Category = require('../models/Category');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const jwt = require('jsonwebtoken');

describe('Kitchen Station Assignment - Recipe Field Fix', () => {
  let app, merchant, branch, menuItem, station, token;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Test Kitchen Restaurant',
      slug: `kitchen-test-${Date.now()}`,
      email: `kitchen-test-${Date.now()}@test.com`,
      phone: '+251911223344',
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true,
      features: {
        core: { menu: { enabled: true } },
        optional: { orders: { enabled: true } },
      },
    });

    // Create branch
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Kitchen Test Branch',
      isActive: true,
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7469, 9.0320],
      },
    });

    // Create role
    const role = await Role.create({
      name: 'KITCHEN-TEST',
      description: 'Test kitchen role',
      permissions: ['kitchen:manage'],
      isSystemRole: false,
    });

    // Create user
    const user = await User.create({
      firstName: 'Kitchen',
      lastName: 'Tester',
      email: `kitchen-user-${Date.now()}@test.com`,
      password: 'password123',
      merchant: merchant._id,
      branch: [branch._id],
      role: role._id,
      isActive: true,
    });

    // Generate JWT token
    token = jwt.sign(
      { id: user._id, merchant: merchant._id, role: role.name },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' }
    );

    // Create category
    const category = await Category.create({
      merchant: merchant._id,
      name: { en: 'Test Category', am: 'ተስት' },
      description: { en: 'Test', am: 'ተስት' },
      isActive: true,
    });

    // Create menu item (with recipe as ObjectId, like in the database)
    menuItem = await MenuItem.create({
      merchant: merchant._id,
      categoryId: category._id,
      name: { en: 'Test Dish', am: 'ተስት' },
      description: { en: 'Test', am: 'ተስት' },
      price: 150,
      type: 'food',
      recipe: null, // Can be null or ObjectId
      available: true,
      inStock: true,
      publishStatus: 'published',
    });

    // Create kitchen station
    station = await KitchenStation.create({
      merchant: merchant._id,
      branch: branch._id,
      name: 'Main Station',
      code: 'MAIN',
      displayOrder: 1,
      isActive: true,
    });
  });

  afterEach(async () => {
    await KitchenStation.deleteMany({ merchant: merchant?._id });
    await MenuItem.deleteMany({ merchant: merchant?._id });
    const Category = require('../models/Category');
    await Category.deleteMany({ merchant: merchant?._id });
    await User.deleteMany({ merchant: merchant?._id });
    await Role.deleteMany({ isSystemRole: false });
    await Branch.deleteMany({ merchant: merchant?._id });
    await Merchant.deleteMany({ _id: merchant?._id });
  });

  test('should assign kitchen station to menu item', async () => {
    const response = await request(app)
      .patch(`/api/v1/kitchen/menu-items/${menuItem._id}/station`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stationId: station._id.toString() });

    console.log('Response:', response.status, response.body);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.menuItem.kitchenStation).toBe(station._id.toString());

    // Verify in database
    const updated = await MenuItem.findById(menuItem._id);
    expect(updated.kitchenStation.toString()).toBe(station._id.toString());
  });

  test('should remove kitchen station from menu item', async () => {
    // First assign
    await MenuItem.findByIdAndUpdate(menuItem._id, { kitchenStation: station._id });

    // Then remove
    const response = await request(app)
      .patch(`/api/v1/kitchen/menu-items/${menuItem._id}/station`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stationId: null });

    console.log('Response:', response.status, response.body);

    expect(response.status).toBe(200);
    expect(response.body.data.menuItem.kitchenStation).toBeNull();

    // Verify in database
    const updated = await MenuItem.findById(menuItem._id);
    expect(updated.kitchenStation).toBeNull();
  });

  test('should handle menu items with recipe as ObjectId', async () => {
    // Create menu item with recipe as ObjectId (simulating old data)
    const itemWithRecipe = await MenuItem.create({
      merchant: merchant._id,
      categoryId: (await Category.findOne({ merchant: merchant._id }))._id,
      name: { en: 'Dish with Recipe', am: 'ተስት' },
      price: 200,
      type: 'food',
      recipe: new mongoose.Types.ObjectId(), // Recipe as ObjectId
      available: true,
      inStock: true,
      publishStatus: 'published',
    });

    // Should still allow station assignment
    const response = await request(app)
      .patch(`/api/v1/kitchen/menu-items/${itemWithRecipe._id}/station`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stationId: station._id.toString() });

    console.log('Response for item with recipe:', response.status);

    // ✅ Should NOT get "Cannot create field 'ingredients'" error
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
  });
});
