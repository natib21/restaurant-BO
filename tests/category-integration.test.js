/**
 * Category Management Integration Tests
 * 
 * Tests cover CRUD operations, multi-tenant isolation, and validation
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Category = require('../models/Category');
const MenuItem = require('../models/menuModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const { AuthService } = require('../src/modules/auth/auth.service');

let app;
let merchant1Id, merchant2Id;
let branch1Id;
let user1, user2;
let token1, token2;

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // Create Merchant 1
  const merchant1 = await Merchant.create({
    businessName: 'Test Restaurant 1',
    slug: 'test-restaurant-cat-1',
    email: 'restaurant1-cat@test.com',
    phone: '+251911111111',
    status: 'approved',
    isActive: true,
    mode: 'Test',
    owner: {
      email: 'owner1-cat@test.com',
      fullName: 'Owner One',
      firstName: 'Owner',
      lastName: 'One',
      phone: '+251911111111',
      gender: 'Male',
    },
  });
  merchant1Id = merchant1._id;

  const branch1 = await Branch.create({
    merchant: merchant1Id,
    name: 'Branch 1',
    phone: '+251911111111',
    isMain: true,
    isActive: true,
    branchCode: 'BR-CAT-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
    },
  });
  branch1Id = branch1._id;

  // Create Merchant 2
  const merchant2 = await Merchant.create({
    businessName: 'Test Restaurant 2',
    slug: 'test-restaurant-cat-2',
    email: 'restaurant2-cat@test.com',
    phone: '+251922222222',
    status: 'approved',
    isActive: true,
    mode: 'Test',
    owner: {
      email: 'owner2-cat@test.com',
      fullName: 'Owner Two',
      firstName: 'Owner',
      lastName: 'Two',
      phone: '+251922222222',
      gender: 'Male',
    },
  });
  merchant2Id = merchant2._id;

  // Create role for users - use ALL capability to bypass specific task requirements
  const Role = require('../models/roleModel');
  
  const adminRole = await Role.create({
    name: 'Super-Admin',
    description: 'Super admin role for testing',
    merchant: merchant1Id,
    tasks: [],
    capabilities: ['ALL'],  // Grant all capabilities
    isActive: true,
  });

  // Create test users
  user1 = await User.create({
    firstName: 'Test',
    lastName: 'User1',
    email: 'user1-cat@test.com',
    phone: '+251911333333',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant1Id,
    branch: [branch1Id],
    role: adminRole._id,
    isActive: true
  });

  user2 = await User.create({
    firstName: 'Test',
    lastName: 'User2',
    email: 'user2-cat@test.com',
    phone: '+251922333333',
    password: 'password123',
    passwordConfirm: 'password123',
    merchant: merchant2Id,
    role: adminRole._id,
    isActive: true
  });

  // Generate tokens
  token1 = AuthService.signToken(user1);
  token2 = AuthService.signToken(user2);
});

afterAll(async () => {
  await Category.deleteMany({});
  await MenuItem.deleteMany({});
  await User.deleteMany({});
  const Role = require('../models/roleModel');
  await Role.deleteMany({});
  await Branch.deleteMany({});
  await Merchant.deleteMany({});
  await disconnectDatabase();
});

beforeEach(async () => {
  await Category.deleteMany({});
  await MenuItem.deleteMany({});
});

describe('Category Management Integration Tests', () => {
  describe('POST /api/v1/categories', () => {
    it('should create a new category with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          name: {
            en: 'Coffee',
            am: 'ቡና'
          },
          description: {
            en: 'Hot coffee drinks',
            am: 'ሙቅ ቡና'
          },
          displayOrder: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.category.name.en).toBe('Coffee');
      expect(response.body.data.category.merchant).toBe(merchant1Id.toString());
    });

    it('should create category with only English name', async () => {
      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          name: { en: 'Desserts' }
        });

      expect(response.status).toBe(201);
      expect(response.body.data.category.name.en).toBe('Desserts');
    });

    it('should fail without English name', async () => {
      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          name: { am: 'ቡና' }
        });

      expect(response.status).toBe(400);
    });

    it('should fail with duplicate name for same merchant', async () => {
      await Category.create({
        name: { en: 'Coffee', am: '' },
        merchant: merchant1Id
      });

      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          name: { en: 'Coffee' }
        });

      expect(response.status).toBe(409);
    });

    it('should allow duplicate names across different merchants', async () => {
      await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token1}`)
        .send({ name: { en: 'Coffee' } });

      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token2}`)
        .send({ name: { en: 'Coffee' } });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /api/v1/categories', () => {
    beforeEach(async () => {
      await Category.create([
        { name: { en: 'Coffee', am: '' }, merchant: merchant1Id, displayOrder: 1 },
        { name: { en: 'Tea', am: '' }, merchant: merchant1Id, displayOrder: 2 },
        { name: { en: 'Beer', am: '' }, merchant: merchant2Id }
      ]);
    });

    it('should return all categories for merchant (tenant isolation)', async () => {
      const response = await request(app)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      expect(response.body.data.categories).toHaveLength(2);
      expect(response.body.results).toBe(2);
    });

    it('should support search by name', async () => {
      const response = await request(app)
        .get('/api/v1/categories?search=Coffee')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      expect(response.body.data.categories).toHaveLength(1);
      expect(response.body.data.categories[0].name.en).toBe('Coffee');
    });
  });

  describe('GET /api/v1/categories/:id', () => {
    it('should return a single category by ID', async () => {
      const category = await Category.create({
        name: { en: 'Coffee', am: '' },
        merchant: merchant1Id
      });

      const response = await request(app)
        .get(`/api/v1/categories/${category._id}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      expect(response.body.data.category.name.en).toBe('Coffee');
    });

    it('should enforce tenant isolation on GET', async () => {
      const category = await Category.create({
        name: { en: 'Coffee', am: '' },
        merchant: merchant2Id
      });

      const response = await request(app)
        .get(`/api/v1/categories/${category._id}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/categories/:id', () => {
    it('should update category successfully', async () => {
      const category = await Category.create({
        name: { en: 'Coffee', am: '' },
        merchant: merchant1Id
      });

      const response = await request(app)
        .patch(`/api/v1/categories/${category._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          name: { en: 'Espresso', am: 'ኤስፕረሶ' },
          displayOrder: 5
        });

      expect(response.status).toBe(200);
      expect(response.body.data.category.name.en).toBe('Espresso');
    });
  });

  describe('DELETE /api/v1/categories/:id', () => {
    it('should soft delete category', async () => {
      const category = await Category.create({
        name: { en: 'Coffee', am: '' },
        merchant: merchant1Id
      });

      const response = await request(app)
        .delete(`/api/v1/categories/${category._id}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(204);

      const deletedCategory = await Category.findById(category._id);
      expect(deletedCategory.isActive).toBe(false);
    });

    it('should prevent deletion if category is used by menu items', async () => {
      const category = await Category.create({
        name: { en: 'Coffee', am: '' },
        merchant: merchant1Id
      });

      await MenuItem.create({
        name: 'Espresso',
        type: 'drink',
        category: 'Coffee',
        categoryId: category._id,
        merchant: merchant1Id,
        price: 5
      });

      const response = await request(app)
        .delete(`/api/v1/categories/${category._id}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(409);
    });
  });
});
