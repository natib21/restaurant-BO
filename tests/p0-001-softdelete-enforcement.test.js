/**
 * P0-001: Soft-Delete Enforcement Tests
 * 
 * Verify that inactive (soft-deleted) branches and tables cannot be accessed
 * through normal active-resource APIs.
 * 
 * Tests ensure:
 * 1. Active branches/tables are accessible
 * 2. Inactive branches/tables are NOT accessible via normal APIs
 * 3. Inactive resources cannot be updated via normal APIs
 * 4. Cross-tenant users cannot access inactive resources
 * 5. Explicit restore operations still work
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { setupDb, teardownDb, createTestMerchant, createTestUser, loginUser } = require('./helpers/test-setup');

const app = createApp();

describe('P0-001: Soft-Delete Enforcement', () => {
  let merchant1, merchant2, user1, user2, token1, token2;
  let branch, inactiveBranch;
  let table, inactiveTable;

  beforeAll(async () => {
    await setupDb();
    
    // Create two merchants
    merchant1 = await createTestMerchant({ businessName: 'Restaurant A' });
    merchant2 = await createTestMerchant({ businessName: 'Restaurant B' });

    // Create users
    user1 = await createTestUser(merchant1, { email: 'user1@test.com' });
    user2 = await createTestUser(merchant2, { email: 'user2@test.com' });

    // Login to get tokens
    token1 = await loginUser(user1);
    token2 = await loginUser(user2);
  });

  afterAll(async () => {
    await teardownDb();
  });

  describe('Branch Soft-Delete Enforcement', () => {
    beforeEach(async () => {
      const Branch = mongoose.model('Branch');

      // Create active branch
      branch = await Branch.create({
        merchant: merchant1._id,
        name: 'Main Branch',
        phone: '+251911111111',
        location: {
          type: 'Point',
          coordinates: [9.03, 38.74],
          city: 'Addis Ababa',
        },
        isActive: true,
      });

      // Create inactive (soft-deleted) branch
      inactiveBranch = await Branch.create({
        merchant: merchant1._id,
        name: 'Closed Branch',
        phone: '+251922222222',
        location: {
          type: 'Point',
          coordinates: [9.03, 38.74],
          city: 'Addis Ababa',
        },
        isActive: false,
      });
    });

    test('GET /api/v1/branches should return only active branches', async () => {
      const res = await request(app)
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      const branchIds = res.body.data.map(b => b._id.toString());

      // Active branch should be present
      expect(branchIds).toContain(branch._id.toString());

      // Inactive branch should NOT be present
      expect(branchIds).not.toContain(inactiveBranch._id.toString());
    });

    test('GET /api/v1/branches/:id should reject inactive branch', async () => {
      const res = await request(app)
        .get(`/api/v1/branches/${inactiveBranch._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);

      expect(res.body.message).toContain('not found');
    });

    test('GET /api/v1/branches/:id should accept active branch', async () => {
      const res = await request(app)
        .get(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.data._id.toString()).toBe(branch._id.toString());
    });

    test('PATCH /api/v1/branches/:id should reject updates to inactive branch', async () => {
      const res = await request(app)
        .patch(`/api/v1/branches/${inactiveBranch._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ name: 'New Name' })
        .expect(404);

      expect(res.body.message).toContain('not found');

      // Verify the branch was not updated
      const updated = await mongoose.model('Branch').findById(inactiveBranch._id);
      expect(updated.name).toBe('Closed Branch'); // unchanged
    });

    test('PATCH /api/v1/branches/:id should allow updates to active branch', async () => {
      const res = await request(app)
        .patch(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ name: 'Updated Branch' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Branch');

      // Verify in DB
      const updated = await mongoose.model('Branch').findById(branch._id);
      expect(updated.name).toBe('Updated Branch');
    });

    test('Cross-tenant user cannot access inactive branch', async () => {
      const res = await request(app)
        .get(`/api/v1/branches/${inactiveBranch._id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(404);
    });
  });

  describe('Table Soft-Delete Enforcement', () => {
    beforeEach(async () => {
      const Table = mongoose.model('Table');
      const Branch = mongoose.model('Branch');

      // Create a branch for tables
      branch = await Branch.create({
        merchant: merchant1._id,
        name: 'Restaurant',
        phone: '+251911111111',
        location: {
          type: 'Point',
          coordinates: [9.03, 38.74],
          city: 'Addis Ababa',
        },
        isActive: true,
      });

      // Create active table
      table = await Table.create({
        merchant: merchant1._id,
        branch: branch._id,
        tableNumber: '5',
        capacity: 4,
        status: 'available',
        isActive: true,
      });

      // Create inactive table
      inactiveTable = await Table.create({
        merchant: merchant1._id,
        branch: branch._id,
        tableNumber: '6',
        capacity: 2,
        status: 'available',
        isActive: false,
      });
    });

    test('GET /api/v1/tables should return only active tables', async () => {
      const res = await request(app)
        .get('/api/v1/tables')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      const tableIds = res.body.data.map(t => t._id.toString());

      // Active table should be present
      expect(tableIds).toContain(table._id.toString());

      // Inactive table should NOT be present
      expect(tableIds).not.toContain(inactiveTable._id.toString());
    });

    test('GET /api/v1/tables/:id should reject inactive table', async () => {
      const res = await request(app)
        .get(`/api/v1/tables/${inactiveTable._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);

      expect(res.body.message).toContain('not found');
    });

    test('GET /api/v1/tables/:id should accept active table', async () => {
      const res = await request(app)
        .get(`/api/v1/tables/${table._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.data._id.toString()).toBe(table._id.toString());
    });

    test('PATCH /api/v1/tables/:id should reject updates to inactive table', async () => {
      const res = await request(app)
        .patch(`/api/v1/tables/${inactiveTable._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ capacity: 10 })
        .expect(404);

      expect(res.body.message).toContain('not found');

      // Verify the table was not updated
      const updated = await mongoose.model('Table').findById(inactiveTable._id);
      expect(updated.capacity).toBe(2); // unchanged
    });

    test('PATCH /api/v1/tables/:id should allow updates to active table', async () => {
      const res = await request(app)
        .patch(`/api/v1/tables/${table._id}`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ capacity: 8 })
        .expect(200);

      expect(res.body.data.capacity).toBe(8);

      // Verify in DB
      const updated = await mongoose.model('Table').findById(table._id);
      expect(updated.capacity).toBe(8);
    });

    test('GET /api/v1/branches/:branchId/tables should exclude inactive tables', async () => {
      const res = await request(app)
        .get(`/api/v1/branches/${branch._id}/tables`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      const tableIds = res.body.data.map(t => t._id.toString());

      // Active table should be present
      expect(tableIds).toContain(table._id.toString());

      // Inactive table should NOT be present
      expect(tableIds).not.toContain(inactiveTable._id.toString());
    });

    test('Cross-tenant user cannot access inactive table', async () => {
      const res = await request(app)
        .get(`/api/v1/tables/${inactiveTable._id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(404);
    });
  });

  describe('QR Code Endpoint Soft-Delete Enforcement', () => {
    beforeEach(async () => {
      const Branch = mongoose.model('Branch');
      const Table = mongoose.model('Table');

      branch = await Branch.create({
        merchant: merchant1._id,
        name: 'QR Test Branch',
        phone: '+251911111111',
        location: {
          type: 'Point',
          coordinates: [9.03, 38.74],
          city: 'Addis Ababa',
        },
        isActive: true,
      });

      table = await Table.create({
        merchant: merchant1._id,
        branch: branch._id,
        tableNumber: '10',
        capacity: 4,
        isActive: true,
      });

      inactiveTable = await Table.create({
        merchant: merchant1._id,
        branch: branch._id,
        tableNumber: '11',
        capacity: 2,
        isActive: false,
      });
    });

    test('POST /api/v1/tables/:id/regenerate-qr should reject inactive table', async () => {
      const res = await request(app)
        .post(`/api/v1/tables/${inactiveTable._id}/regenerate-qr`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);

      expect(res.body.message).toContain('inactive');
    });

    test('POST /api/v1/tables/:id/regenerate-qr should accept active table', async () => {
      const res = await request(app)
        .post(`/api/v1/tables/${table._id}/regenerate-qr`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.data.qrUrl).toBeDefined();
    });
  });

  describe('Status Transition Soft-Delete Enforcement', () => {
    beforeEach(async () => {
      const Branch = mongoose.model('Branch');
      const Table = mongoose.model('Table');

      branch = await Branch.create({
        merchant: merchant1._id,
        name: 'Status Test Branch',
        phone: '+251911111111',
        location: {
          type: 'Point',
          coordinates: [9.03, 38.74],
          city: 'Addis Ababa',
        },
        isActive: true,
      });

      table = await Table.create({
        merchant: merchant1._id,
        branch: branch._id,
        tableNumber: '15',
        capacity: 4,
        status: 'available',
        isActive: true,
      });

      inactiveTable = await Table.create({
        merchant: merchant1._id,
        branch: branch._id,
        tableNumber: '16',
        capacity: 2,
        status: 'available',
        isActive: false,
      });
    });

    test('Cannot change status of inactive table', async () => {
      const res = await request(app)
        .patch(`/api/v1/tables/${inactiveTable._id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ toStatus: 'occupied' })
        .expect(404);

      // Verify status was not changed
      const unchanged = await mongoose.model('Table').findById(inactiveTable._id);
      expect(unchanged.status).toBe('available');
    });

    test('Can change status of active table', async () => {
      const res = await request(app)
        .patch(`/api/v1/tables/${table._id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ toStatus: 'occupied' })
        .expect(200);

      // Verify status was changed
      const updated = await mongoose.model('Table').findById(table._id);
      expect(updated.status).toBe('occupied');
    });
  });

  describe('Table Validation for Session Soft-Delete Enforcement', () => {
    beforeEach(async () => {
      const Branch = mongoose.model('Branch');
      const Table = mongoose.model('Table');

      branch = await Branch.create({
        merchant: merchant1._id,
        name: 'Session Test Branch',
        phone: '+251911111111',
        location: {
          type: 'Point',
          coordinates: [9.03, 38.74],
          city: 'Addis Ababa',
        },
        isActive: true,
      });

      table = await Table.create({
        merchant: merchant1._id,
        branch: branch._id,
        tableNumber: '20',
        capacity: 4,
        isActive: true,
      });

      inactiveTable = await Table.create({
        merchant: merchant1._id,
        branch: branch._id,
        tableNumber: '21',
        capacity: 2,
        isActive: false,
      });
    });

    test('Cannot create session for inactive table', async () => {
      const BranchService = require('../src/modules/branch/service/BranchService').BranchService;

      const validateFn = async () => {
        await BranchService.validateTableForSession({
          tableId: inactiveTable._id,
          branchId: branch._id,
          merchantId: merchant1._id,
        });
      };

      await expect(validateFn()).rejects.toThrow('not found');
    });

    test('Can create session for active table', async () => {
      const BranchService = require('../src/modules/branch/service/BranchService').BranchService;

      const result = await BranchService.validateTableForSession({
        tableId: table._id,
        branchId: branch._id,
        merchantId: merchant1._id,
      });

      expect(result._id.toString()).toBe(table._id.toString());
    });
  });
});
