const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Ingredient = require('../models/Ingredient');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');

let app;
let merchantId;
let branchId;
let authToken;
let testIngredientId;
let testSupplierId;

beforeAll(async () => {
  // Connect to test database
  await connectDatabase();
  
  app = createApp();

  // Seed test data
  const merchant = await Merchant.create({
    businessName: 'Test Restaurant',
    slug: 'test-restaurant-inv',
    name: 'Test Restaurant',
    email: 'test@restaurant.com',
    phone: '+251911111111',
    status: 'approved',
    isActive: true
  });
  merchantId = merchant._id;

  const branch = await Branch.create({
    merchant: merchantId,
    name: 'Test Branch',
    phone: '+251911111111',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
      formattedAddress: 'Test Branch, Addis Ababa, Ethiopia'
    }
  });
  branchId = branch._id;

  const supplier = await Supplier.create({
    merchant: merchantId,
    name: 'Test Supplier',
    phone: '+251911222222',
  });
  testSupplierId = supplier._id;

  const ingredient = await Ingredient.create({
    merchant: merchantId,
    name: 'Test Flour',
    unit: 'kg',
    currentStock: 10,
    minStock: 5,
    costPerUnit: 50,
    supplier: testSupplierId,
  });
  testIngredientId = ingredient._id;

  // Mock auth token
  authToken = 'Bearer mock-jwt-token';
});

afterAll(async () => {
  // Cleanup
  await Ingredient.deleteMany({ merchant: merchantId });
  await Supplier.deleteMany({ merchant: merchantId });
  await PurchaseOrder.deleteMany({ merchant: merchantId });
  await Branch.deleteOne({ _id: branchId });
  await Merchant.deleteOne({ _id: merchantId });
  await disconnectDatabase();
});

describe('Inventory Module - Integration Tests', () => {
  describe('Ingredients CRUD', () => {
    it('should get all ingredients', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/ingredients')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data.ingredients)).toBe(true);
    });

    it('should create an ingredient', async () => {
      const response = await request(app)
        .post('/api/v1/inventory/ingredients')
        .set('Authorization', authToken)
        .send({
          name: 'Test Sugar',
          unit: 'kg',
          currentStock: 20,
          minStock: 10,
          costPerUnit: 30,
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
    });
  });

  describe('Suppliers CRUD', () => {
    it('should get all suppliers', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/suppliers')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should create a supplier', async () => {
      const response = await request(app)
        .post('/api/v1/inventory/suppliers')
        .set('Authorization', authToken)
        .send({
          name: 'Test Supplier 2',
          phone: '+251911333333',
        });

      expect(response.status).toBe(201);
    });
  });

  describe('Inventory Dashboard', () => {
    it('should get inventory valuation', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/valuation')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.inventory.totalValue).toBeDefined();
    });

    it('should get low stock items', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/low-stock')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });
});
