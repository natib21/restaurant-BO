const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const Menu = require('../models/menuModel');
const Merchant = require('../models/merchantModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Category = require('../models/Category');
const Branch = require('../models/branchModel');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const { AuthService } = require('../src/modules/auth/auth.service');

describe('Menu Localization Tests', () => {
  let app;
  let merchantId;
  let token;
  let categoryId;
  let branchId;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up
    await Menu.deleteMany({});
    await Category.deleteMany({});
    await User.deleteMany({});
    await Merchant.deleteMany({});
    await Role.deleteMany({});
    await Branch.deleteMany({});

    // Create role
    const merchantAdminRole = await Role.create({
      name: 'SUPER-ADMIN',
      code: 'SUPER_ADMIN',
      level: 100,
      description: 'Super Administrator for Testing',
      merchant: null,
      tasks: [],
      capabilities: ['ALL'],
      isSystemRole: true,
      isActive: true,
    });

    // Create merchant
    const merchant = await Merchant.create({
      businessName: 'Test Restaurant Loc',
      slug: 'test-restaurant-loc',
      phone: '+251912345679',
      status: 'approved',
      isActive: true,
      mode: 'Test',
      isSubscriptionActive: true,
      subscriptionPlan: 'pro',
      owner: {
        email: 'john2@test.com',
        fullName: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+251912345679',
        gender: 'Male',
      },
    });

    merchantId = merchant._id;

    // Create branch
    const branch = await Branch.create({
      merchant: merchantId,
      name: 'Main Branch',
      phone: '+251912345679',
      isMain: true,
      isActive: true,
      branchCode: 'BR-LOC-002',
      location: {
        type: 'Point',
        coordinates: [38.7578, 9.025],
        city: 'Addis Ababa',
      },
    });

    branchId = branch._id;

    // Create user
    const user = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'testuser2@test.com',
      phone: '+251987654322',
      password: 'Test@1234',
      passwordConfirm: 'Test@1234',
      merchant: merchantId,
      branch: [branchId],
      role: merchantAdminRole._id,
      isActive: true,
    });

    token = AuthService.signToken(user._id);

    // Create category
    const category = await Category.create({
      merchant: merchantId,
      name: {
        en: 'Main Courses',
        am: 'ዋና ምግብ',
      },
      displayOrder: 1,
      createdBy: user._id,
    });

    categoryId = category._id;
  });

  describe('POST /api/v1/menu - Create with Localized Name', () => {
    it('should create menu with both English and Amharic names', async () => {
      const response = await request(app)
        .post('/api/v1/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: {
            en: 'Margherita Pizza',
            am: 'ማርጋሪታ ፒዛ',
          },
          description: {
            en: 'Classic Italian pizza',
            am: 'የጣሊያን ፒዛ',
          },
          type: 'food',
          categoryId: categoryId.toString(),
          variants: [
            {
              name: 'Regular',
              price: 250,
              isDefault: true,
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.menu.name.en).toBe('Margherita Pizza');
      expect(response.body.data.menu.name.am).toBe('ማርጋሪታ ፒዛ');
    });
  });
});
