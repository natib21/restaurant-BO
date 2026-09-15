/**
 * @file tests/inventory-http-branch-isolation.test.js
 * @description HTTP-level tests for branch isolation on ingredient endpoints
 * 
 * Tests actual API responses when Branch A staff tries to modify Branch B ingredients
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const { createApp } = require('../src/app/create-app');

// Models
const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Ingredient = require('../models/Ingredient');
const User = require('../models/userModel');

let app;

describe('HTTP-Level Branch Isolation Tests', () => {
  let merchant, branchA, branchB;
  let ingredientA, ingredientB;
  let userA, userB;
  let tokenA, tokenB;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean slate
    await Promise.all([
      Merchant.deleteMany({}),
      Branch.deleteMany({}),
      Ingredient.deleteMany({}),
      User.deleteMany({}),
    ]);

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'HTTP Test Restaurant',
      slug: 'http-test-restaurant',
      email: 'test@http.com',
      phone: '+251911234567',
    });

    // Create TWO branches
    branchA = await Branch.create({
      merchant: merchant._id,
      name: 'Branch A',
      city: 'Addis Ababa',
      location: {
        type: 'Point',
        coordinates: [9.0320, 38.7469],
        city: 'Addis Ababa',
      },
    });

    branchB = await Branch.create({
      merchant: merchant._id,
      name: 'Branch B',
      city: 'Dire Dawa',
      location: {
        type: 'Point',
        coordinates: [9.6412, 41.8722],
        city: 'Dire Dawa',
      },
    });

    // Create ingredients
    ingredientA = await Ingredient.create({
      merchant: merchant._id,
      branch: branchA._id,
      name: 'Chicken A',
      unit: 'kg',
      currentStock: 50,
      category: 'meat',
    });

    ingredientB = await Ingredient.create({
      merchant: merchant._id,
      branch: branchB._id,
      name: 'Chicken B',
      unit: 'kg',
      currentStock: 100,
      category: 'meat',
    });

    // Create users for each branch
    userA = await User.create({
      firstName: 'Staff',
      lastName: 'A',
      email: 'staffa@test.com',
      password: 'password123',
      phoneNumber: '+251911111111',
      merchantId: merchant._id,
      role: 'staff',
    });

    userB = await User.create({
      firstName: 'Staff',
      lastName: 'B',
      email: 'staffb@test.com',
      password: 'password123',
      phoneNumber: '+251922222222',
      merchantId: merchant._id,
      role: 'staff',
    });
  });

  describe('PATCH /api/v1/ingredients/:id - Cross-Branch Update', () => {
    test('Branch A staff gets 404 when trying to update Branch B ingredient', async () => {
      console.log('\n🔐 HTTP TEST: PATCH /ingredients/:id cross-branch');
      console.log(`  User A (Branch A) → Ingredient B (Branch B)`);
      console.log(`  Ingredient B ID: ${ingredientB._id}`);

      // Simulate authenticated request from Branch A staff
      const response = await request(app)
        .patch(`/api/v1/ingredients/${ingredientB._id}`)
        .query({ branchId: branchA._id })  // Wrong branch!
        .send({ currentStock: 200 })
        .set('x-merchant-id', merchant._id.toString())
        .set('x-user-id', userA._id.toString());

      console.log(`  Response Status: ${response.status}`);
      console.log(`  Response Body: ${JSON.stringify(response.body)}`);

      // Should get 404 (ingredient not found for this branch)
      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found/i);

      // Verify ingredient was NOT modified
      const unchangedIngredient = await Ingredient.findById(ingredientB._id);
      expect(unchangedIngredient.currentStock).toBe(100);

      console.log(`  ✓ Request rejected with 404`);
      console.log(`  ✓ Ingredient stock unchanged: ${unchangedIngredient.currentStock} kg`);
    });

    test('Branch A staff CAN update their own Branch A ingredient', async () => {
      console.log('\n✅ HTTP TEST: PATCH /ingredients/:id same-branch');
      console.log(`  User A (Branch A) → Ingredient A (Branch A)`);

      const response = await request(app)
        .patch(`/api/v1/ingredients/${ingredientA._id}`)
        .query({ branchId: branchA._id })  // Correct branch
        .send({ minStock: 10 })
        .set('x-merchant-id', merchant._id.toString())
        .set('x-user-id', userA._id.toString());

      console.log(`  Response Status: ${response.status}`);

      // Should succeed
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');

      const updatedIngredient = await Ingredient.findById(ingredientA._id);
      expect(updatedIngredient.minStock).toBe(10);

      console.log(`  ✓ Request succeeded`);
      console.log(`  ✓ Ingredient updated: minStock=${updatedIngredient.minStock}`);
    });
  });

  describe('DELETE /api/v1/ingredients/:id - Cross-Branch Delete', () => {
    test('Branch A staff gets 404 when trying to delete Branch B ingredient', async () => {
      console.log('\n🔐 HTTP TEST: DELETE /ingredients/:id cross-branch');
      console.log(`  User A (Branch A) → Ingredient B (Branch B)`);

      const response = await request(app)
        .delete(`/api/v1/ingredients/${ingredientB._id}`)
        .query({ branchId: branchA._id })  // Wrong branch!
        .set('x-merchant-id', merchant._id.toString())
        .set('x-user-id', userA._id.toString());

      console.log(`  Response Status: ${response.status}`);
      console.log(`  Response Body: ${JSON.stringify(response.body)}`);

      // Should get 404
      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found/i);

      // Verify ingredient was NOT deleted
      const unchangedIngredient = await Ingredient.findById(ingredientB._id);
      expect(unchangedIngredient).toBeDefined();
      expect(unchangedIngredient.isActive).toBe(true);

      console.log(`  ✓ Request rejected with 404`);
      console.log(`  ✓ Ingredient still active: ${unchangedIngredient.isActive}`);
    });
  });

  describe('POST /api/v1/inventory/adjust - Cross-Branch Adjust', () => {
    test('Branch A staff cannot adjust Branch B ingredient stock', async () => {
      console.log('\n🔐 HTTP TEST: POST /inventory/adjust cross-branch');
      console.log(`  User A (Branch A) → Ingredient B (Branch B)`);

      const response = await request(app)
        .post('/api/v1/inventory/adjust')
        .send({
          ingredientId: ingredientB._id,
          branchId: branchB._id,  // Ingredient is in Branch B
          quantity: 10,
          type: 'out',
          reason: 'Test adjustment',
        })
        .set('x-merchant-id', merchant._id.toString())
        .set('x-user-id', userA._id.toString());

      console.log(`  Response Status: ${response.status}`);
      console.log(`  Response Body: ${JSON.stringify(response.body)}`);

      // Should fail (either 404 or 403 depending on authorization)
      expect(response.status).toBeGreaterThanOrEqual(400);

      // Verify ingredient was NOT adjusted
      const unchangedIngredient = await Ingredient.findById(ingredientB._id);
      expect(unchangedIngredient.currentStock).toBe(100);

      console.log(`  ✓ Request rejected`);
      console.log(`  ✓ Ingredient stock unchanged: ${unchangedIngredient.currentStock} kg`);
    });

    test('Branch A staff CAN adjust their own ingredient', async () => {
      console.log('\n✅ HTTP TEST: POST /inventory/adjust same-branch');
      console.log(`  User A (Branch A) → Ingredient A (Branch A)`);

      const response = await request(app)
        .post('/api/v1/inventory/adjust')
        .send({
          ingredientId: ingredientA._id,
          branchId: branchA._id,  // Correct branch
          quantity: 5,
          type: 'out',
          reason: 'Test adjustment',
        })
        .set('x-merchant-id', merchant._id.toString())
        .set('x-user-id', userA._id.toString());

      console.log(`  Response Status: ${response.status}`);

      // Should succeed
      expect(response.status).toBe(200);

      const updatedIngredient = await Ingredient.findById(ingredientA._id);
      expect(updatedIngredient.currentStock).toBe(45); // 50 - 5

      console.log(`  ✓ Request succeeded`);
      console.log(`  ✓ Stock adjusted: ${updatedIngredient.currentStock} kg`);
    });
  });
});
