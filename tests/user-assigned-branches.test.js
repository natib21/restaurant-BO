/**
 * @file tests/user-assigned-branches.test.js
 * @description Test the GET /api/v1/branch/me/assigned endpoint
 * 
 * Verifies that:
 * 1. Users can retrieve their assigned branches
 * 2. Only branches in user.branch array are returned
 * 3. Inactive branches are excluded
 * 4. Returns empty array if user has no branches
 */

const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const User = require('../models/userModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Role = require('../models/roleModel');

// Suppress console logs during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

describe('GET /api/v1/branch/me/assigned', () => {
  let app;
  let merchant;
  let managerRole;
  let branch1, branch2, branch3, branch4;
  let userWithMultipleBranches;
  let userWithOneBranch;
  let userWithNoBranches;
  let tokenMultipleBranches;
  let tokenOneBranch;
  let tokenNoBranches;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'User Branch Test Restaurant',
      phone: '+251955111222',
      slug: 'user-branch-test',
      status: 'approved',
      mode: 'Live',
    });

    // Create manager role
    managerRole = await Role.create({
      name: 'MANAGER',
      merchant: merchant._id,
      isSystemRole: false,
      description: 'Manager role for testing',
      tasks: [],
    });

    // Create 4 branches
    branch1 = await Branch.create({
      name: 'Downtown Branch',
      merchant: merchant._id,
      branchCode: 'BR-TEST-001',
      isMain: true,
      isActive: true,
      phone: '+251955111201',
      location: {
        type: 'Point',
        coordinates: [38.7578, 9.025],
        city: 'Addis Ababa',
        formattedAddress: 'Downtown',
      },
    });

    branch2 = await Branch.create({
      name: 'Uptown Branch',
      merchant: merchant._id,
      branchCode: 'BR-TEST-002',
      isMain: false,
      isActive: true,
      phone: '+251955111202',
      location: {
        type: 'Point',
        coordinates: [38.7678, 9.035],
        city: 'Addis Ababa',
        formattedAddress: 'Uptown',
      },
    });

    branch3 = await Branch.create({
      name: 'Airport Branch',
      merchant: merchant._id,
      branchCode: 'BR-TEST-003',
      isMain: false,
      isActive: true,
      phone: '+251955111203',
      location: {
        type: 'Point',
        coordinates: [38.6778, 8.925],
        city: 'Addis Ababa',
        formattedAddress: 'Airport',
      },
    });

    // Branch 4 is inactive — should be excluded even if in user.branch array
    branch4 = await Branch.create({
      name: 'Inactive Branch',
      merchant: merchant._id,
      branchCode: 'BR-TEST-004',
      isMain: false,
      isActive: false,
      phone: '+251955111204',
      location: {
        type: 'Point',
        coordinates: [38.6878, 8.935],
        city: 'Addis Ababa',
        formattedAddress: 'Inactive',
      },
    });

    // User with multiple branches
    userWithMultipleBranches = await User.create({
      firstName: 'Alice',
      lastName: 'MultiManager',
      phone: '+251955333444',
      email: 'alice@multibranch.test',
      password: 'Test@1234',
      passwordConfirm: 'Test@1234',
      merchant: merchant._id,
      role: managerRole._id,
      branch: [branch1._id, branch2._id, branch3._id, branch4._id], // Includes inactive
      isActive: true,
    });

    // User with one branch
    userWithOneBranch = await User.create({
      firstName: 'Bob',
      lastName: 'SingleManager',
      phone: '+251955333555',
      email: 'bob@singlebranch.test',
      password: 'Test@1234',
      passwordConfirm: 'Test@1234',
      merchant: merchant._id,
      role: managerRole._id,
      branch: [branch2._id],
      isActive: true,
    });

    // User with no branches
    userWithNoBranches = await User.create({
      firstName: 'Charlie',
      lastName: 'NoBranch',
      phone: '+251955333666',
      email: 'charlie@nobranch.test',
      password: 'Test@1234',
      passwordConfirm: 'Test@1234',
      merchant: merchant._id,
      role: managerRole._id,
      branch: [], // Empty array
      isActive: true,
    });

    // Login users to get tokens
    const loginMulti = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@multibranch.test', password: 'Test@1234' });
    tokenMultipleBranches = loginMulti.body.token;

    const loginSingle = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bob@singlebranch.test', password: 'Test@1234' });
    tokenOneBranch = loginSingle.body.token;

    const loginNone = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'charlie@nobranch.test', password: 'Test@1234' });
    tokenNoBranches = loginNone.body.token;
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({ phone: { $regex: /^\+25195533/ } }),
      Branch.deleteMany({ merchant: merchant._id }),
      Role.deleteMany({ merchant: merchant._id }),
      Merchant.deleteMany({ _id: merchant._id }),
    ]);
    await disconnectDatabase();
  });

  test('User with multiple branches gets all active assigned branches', async () => {
    const response = await request(app)
      .get('/api/v1/branch/me/assigned')
      .set('Authorization', `Bearer ${tokenMultipleBranches}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.branches).toBeDefined();
    expect(Array.isArray(response.body.data.branches)).toBe(true);

    // Should return 3 active branches (branch4 is inactive, excluded)
    expect(response.body.data.branches.length).toBe(3);
    expect(response.body.results).toBe(3);

    const branchNames = response.body.data.branches.map(b => b.name);
    expect(branchNames).toContain('Downtown Branch');
    expect(branchNames).toContain('Uptown Branch');
    expect(branchNames).toContain('Airport Branch');
    expect(branchNames).not.toContain('Inactive Branch'); // Excluded

    // Main branch should be first
    expect(response.body.data.branches[0].isMain).toBe(true);
    expect(response.body.data.branches[0].name).toBe('Downtown Branch');
  });

  test('User with one branch gets only that branch', async () => {
    const response = await request(app)
      .get('/api/v1/branch/me/assigned')
      .set('Authorization', `Bearer ${tokenOneBranch}`);

    expect(response.status).toBe(200);
    expect(response.body.data.branches.length).toBe(1);
    expect(response.body.results).toBe(1);
    expect(response.body.data.branches[0].name).toBe('Uptown Branch');
    expect(response.body.data.branches[0]._id).toBe(branch2._id.toString());
  });

  test('User with no branches gets empty array', async () => {
    const response = await request(app)
      .get('/api/v1/branch/me/assigned')
      .set('Authorization', `Bearer ${tokenNoBranches}`);

    expect(response.status).toBe(200);
    expect(response.body.data.branches).toEqual([]);
    expect(response.body.results).toBe(0);
  });

  test('Unauthenticated request returns 401', async () => {
    const response = await request(app).get('/api/v1/branch/me/assigned');

    expect(response.status).toBe(401);
  });

  test('Response includes merchant details (populated)', async () => {
    const response = await request(app)
      .get('/api/v1/branch/me/assigned')
      .set('Authorization', `Bearer ${tokenOneBranch}`);

    expect(response.status).toBe(200);
    expect(response.body.data.branches[0].merchant).toBeDefined();
    expect(response.body.data.branches[0].merchant.businessName).toBe(
      'User Branch Test Restaurant'
    );
  });

  test('Response excludes qrSecretKey for security', async () => {
    const response = await request(app)
      .get('/api/v1/branch/me/assigned')
      .set('Authorization', `Bearer ${tokenMultipleBranches}`);

    expect(response.status).toBe(200);
    response.body.data.branches.forEach(branch => {
      expect(branch.qrSecretKey).toBeUndefined();
    });
  });
});
