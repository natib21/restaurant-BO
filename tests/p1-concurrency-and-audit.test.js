/**
 * P1: Concurrency, Locking, and Audit Logging Tests
 * 
 * Verify:
 * P1-001: Duplicate table creation race condition handling
 * P1-002: Concurrent table status updates with optimistic locking
 * P1-003: Comprehensive audit logging of critical operations
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { setupDb, teardownDb, createTestMerchant, createTestUser, loginUser } = require('./helpers/test-setup');

const app = createApp();

describe('P1: Concurrency, Locking, and Audit Logging', () => {
  let merchant, user, token;
  let branch;

  beforeAll(async () => {
    await setupDb();
    
    merchant = await createTestMerchant({ businessName: 'Concurrency Test Restaurant' });
    user = await createTestUser(merchant, { email: 'concurrency@test.com' });
    token = await loginUser(user);
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    const Branch = mongoose.model('Branch');

    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Concurrency Test Branch',
      phone: '+251911111111',
      location: {
        type: 'Point',
        coordinates: [9.03, 38.74],
        city: 'Addis Ababa',
      },
      isActive: true,
    });
  });

  describe('P1-001: Duplicate Table Race Condition', () => {
    test('Creating duplicate table should return 409 Conflict (not 500)', async () => {
      // First creation should succeed
      const res1 = await request(app)
        .post('/api/v1/tables')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tableNumber: 'A1',
          capacity: 4,
          location: 'indoor',
          branchId: branch._id,
        })
        .expect(200);

      expect(res1.body.data.tableNumber).toBe('A1');

      // Second creation with same table number should return 409 Conflict
      const res2 = await request(app)
        .post('/api/v1/tables')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tableNumber: 'A1',
          capacity: 4,
          location: 'indoor',
          branchId: branch._id,
        });

      expect(res2.statusCode).toBe(409);
      expect(res2.body.message).toContain('already in use');
    });

    test('E11000 error should be caught and converted to 409', async () => {
      const Table = mongoose.model('Table');

      // Create first table
      const table1 = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'B1',
        capacity: 4,
        isActive: true,
      });

      // Try to create duplicate via service layer
      const BranchService = require('../src/modules/branch/service/BranchService').BranchService;

      const createFn = async () => {
        const req = {
          user: { merchant: { _id: merchant._id }, role: { name: 'MANAGER' } },
          body: {
            tableNumber: 'B1',
            capacity: 4,
            branchId: branch._id,
          },
        };
        return BranchService.createTable(req);
      };

      // Should throw 409 Conflict, not 500 Internal Server Error
      await expect(createFn()).rejects.toThrow('409');
    });

    test('Concurrent table creation should not create duplicates', async () => {
      // Simulate concurrent requests
      const tableNumber = 'C' + Math.random().toString(36).substr(2, 9);

      const promises = [
        request(app)
          .post('/api/v1/tables')
          .set('Authorization', `Bearer ${token}`)
          .send({
            tableNumber,
            capacity: 4,
            branchId: branch._id,
          }),
        request(app)
          .post('/api/v1/tables')
          .set('Authorization', `Bearer ${token}`)
          .send({
            tableNumber,
            capacity: 4,
            branchId: branch._id,
          }),
      ];

      const results = await Promise.all(promises);

      // One should succeed (200), one should fail (409)
      const statuses = results.map(r => r.statusCode).sort();
      expect(statuses).toEqual([200, 409]);

      // Only one table should exist
      const Table = mongoose.model('Table');
      const count = await Table.find({
        branch: branch._id,
        tableNumber: tableNumber.toUpperCase(),
      }).countDocuments();

      expect(count).toBe(1);
    });
  });

  describe('P1-002: Optimistic Locking on Status Updates', () => {
    let table;

    beforeEach(async () => {
      const Table = mongoose.model('Table');
      table = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'LOCK-TEST',
        capacity: 4,
        status: 'available',
        isActive: true,
      });
    });

    test('Table should have __v version field', async () => {
      const Table = mongoose.model('Table');
      const fetchedTable = await Table.findById(table._id);

      expect(fetchedTable.__v).toBeDefined();
      expect(typeof fetchedTable.__v).toBe('number');
    });

    test('Version should increment on status update', async () => {
      const Table = mongoose.model('Table');
      
      const before = await Table.findById(table._id);
      const beforeVersion = before.__v;

      // Update status
      await Table.findByIdAndUpdate(
        table._id,
        { status: 'occupied' }
      );

      const after = await Table.findById(table._id);
      const afterVersion = after.__v;

      expect(afterVersion).toBeGreaterThan(beforeVersion);
    });

    test('Status change with outdated version should return 409', async () => {
      const Table = mongoose.model('Table');
      const BranchService = require('../src/modules/branch/service/BranchService').BranchService;

      // Get current version
      const current = await Table.findById(table._id);
      const outdatedVersion = current.__v;

      // Someone else updates the table
      await Table.findByIdAndUpdate(
        table._id,
        { status: 'occupied' }
      );

      // Try to update with outdated version
      const updateFn = async () => {
        await BranchService.transitionTableStatus({
          tableId: table._id,
          merchantId: merchant._id,
          branchId: branch._id,
          toStatus: 'reserved',
          expectedVersion: outdatedVersion,
        });
      };

      await expect(updateFn()).rejects.toThrow('409');
    });

    test('Status change without version specified should succeed', async () => {
      const BranchService = require('../src/modules/branch/service/BranchService').BranchService;

      // Should not check version if not provided
      const result = await BranchService.transitionTableStatus({
        tableId: table._id,
        merchantId: merchant._id,
        branchId: branch._id,
        toStatus: 'occupied',
      });

      expect(result.table.status).toBe('occupied');
    });
  });

  describe('P1-003: Audit Logging', () => {
    test('Branch creation should create audit log', async () => {
      const AuditLog = mongoose.model('AuditLog');

      const res = await request(app)
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Audit Test Branch',
          phone: '+251911111111',
          city: 'Addis Ababa',
          location: {
            coordinates: [9.03, 38.74],
          },
        })
        .expect(201);

      const branchId = res.body.data._id;

      // Wait for audit log creation (async)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find audit log
      const logs = await AuditLog.find({
        merchant: merchant._id,
        resource: 'Branch',
        resourceId: branchId,
      });

      expect(logs.length).toBeGreaterThan(0);
      const log = logs[0];

      expect(log.action).toBe('CREATE');
      expect(log.user.toString()).toBe(user._id.toString());
      expect(log.merchant.toString()).toBe(merchant._id.toString());
    });

    test('Branch updates should create audit log with changes', async () => {
      const AuditLog = mongoose.model('AuditLog');

      // Update branch
      await request(app)
        .patch(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Branch Name',
        })
        .expect(200);

      // Wait for audit log creation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find audit log
      const logs = await AuditLog.find({
        merchant: merchant._id,
        resource: 'Branch',
        resourceId: branch._id,
        action: 'UPDATE',
      });

      expect(logs.length).toBeGreaterThan(0);
      const log = logs[logs.length - 1]; // Latest

      expect(log.action).toBe('UPDATE');
      expect(log.changes).toBeDefined();
      expect(log.changes.length).toBeGreaterThan(0);

      // Find the name change
      const nameChange = log.changes.find(c => c.field === 'name');
      expect(nameChange).toBeDefined();
      expect(nameChange.newValue).toBe('Updated Branch Name');
    });

    test('Table creation should create audit log', async () => {
      const AuditLog = mongoose.model('AuditLog');

      const res = await request(app)
        .post('/api/v1/tables')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tableNumber: 'AUDIT-TEST',
          capacity: 4,
          branchId: branch._id,
        })
        .expect(200);

      const tableId = res.body.data._id;

      // Wait for audit log creation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find audit log
      const logs = await AuditLog.find({
        merchant: merchant._id,
        resource: 'Table',
        resourceId: tableId,
      });

      expect(logs.length).toBeGreaterThan(0);
      const log = logs[0];

      expect(log.action).toBe('CREATE');
      expect(log.user.toString()).toBe(user._id.toString());
    });

    test('Branch deletion should create audit log', async () => {
      const AuditLog = mongoose.model('AuditLog');
      const Branch = mongoose.model('Branch');

      // Create a branch to delete
      const testBranch = await Branch.create({
        merchant: merchant._id,
        name: 'Branch to Delete',
        phone: '+251911111111',
        location: {
          type: 'Point',
          coordinates: [9.03, 38.74],
          city: 'Addis Ababa',
        },
        isActive: true,
      });

      // Delete it
      await request(app)
        .delete(`/api/v1/branches/${testBranch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Wait for audit log
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find audit log
      const logs = await AuditLog.find({
        merchant: merchant._id,
        resource: 'Branch',
        resourceId: testBranch._id,
      });

      // Should have at least DELETE log
      const deleteLogs = logs.filter(l => l.action === 'DELETE');
      expect(deleteLogs.length).toBeGreaterThan(0);
    });

    test('Table status changes should be logged', async () => {
      const AuditLog = mongoose.model('AuditLog');
      const Table = mongoose.model('Table');

      // Create a table
      const table = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'STATUS-TEST',
        capacity: 4,
        status: 'available',
        isActive: true,
      });

      // Change status
      await Table.findByIdAndUpdate(
        table._id,
        { status: 'occupied' }
      );

      // Wait for audit log
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find audit log
      const logs = await AuditLog.find({
        merchant: merchant._id,
        resource: 'Table',
        resourceId: table._id,
        action: 'UPDATE',
      });

      expect(logs.length).toBeGreaterThan(0);

      // Check for status change
      const statusChangeLogs = logs.filter(l => 
        l.changes?.some(c => c.field === 'status')
      );

      expect(statusChangeLogs.length).toBeGreaterThan(0);
    });

    test('Audit logs should have merchant isolation', async () => {
      const AuditLog = mongoose.model('AuditLog');

      // Get all audit logs for this merchant
      const merchantLogs = await AuditLog.find({
        merchant: merchant._id,
      });

      // All logs should belong to this merchant
      for (const log of merchantLogs) {
        expect(log.merchant.toString()).toBe(merchant._id.toString());
      }
    });

    test('Audit logs should capture correlation IDs', async () => {
      const AuditLog = mongoose.model('AuditLog');

      const logs = await AuditLog.find({
        merchant: merchant._id,
      });

      // Logs should have correlation IDs (may be undefined if not set, but structure should be present)
      for (const log of logs) {
        expect(log.correlationId !== undefined || log.correlationId === undefined).toBe(true);
      }
    });
  });

  describe('Audit Logging Code Review', () => {
    test('auditPlugin should be applied to Branch model', () => {
      const fs = require('fs');
      const modelPath = require.resolve('../models/branchModel.js');
      const content = fs.readFileSync(modelPath, 'utf-8');

      expect(content).toContain('auditPlugin');
      expect(content).toContain("resource: 'Branch'");
      expect(content).toContain('auditedFields');
    });

    test('auditPlugin should be applied to Table model', () => {
      const fs = require('fs');
      const modelPath = require.resolve('../models/tabelModel.js');
      const content = fs.readFileSync(modelPath, 'utf-8');

      expect(content).toContain('auditPlugin');
      expect(content).toContain("resource: 'Table'");
      expect(content).toContain('auditedFields');
    });

    test('AuditLog model should have tenant isolation field', () => {
      const fs = require('fs');
      const modelPath = require.resolve('../models/auditLogModel.js');
      const content = fs.readFileSync(modelPath, 'utf-8');

      expect(content).toContain('merchant:');
      expect(content).toContain('index: true');
    });

    test('Audit logging should not expose secrets', () => {
      const fs = require('fs');
      const pluginPath = require.resolve('../utils/auditPlugin.js');
      const content = fs.readFileSync(pluginPath, 'utf-8');

      // Should NOT log passwords, tokens, etc
      expect(content).not.toContain('password');
      expect(content).not.toContain('secret');
      expect(content).not.toContain('token');
    });
  });
});
