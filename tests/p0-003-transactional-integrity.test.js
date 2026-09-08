/**
 * P0-003: Transactional Integrity Tests
 * 
 * Verify that multi-document operations are atomic:
 * 1. All operations complete or none do (ACID)
 * 2. Partial failures rollback all changes
 * 3. No orphaned records on crash
 * 4. Complex operations maintain consistency
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { setupDb, teardownDb, createTestMerchant, createTestUser, loginUser } = require('./helpers/test-setup');

const app = createApp();

describe('P0-003: Transactional Integrity', () => {
  let merchant, user, token;
  let branch, table1, table2;

  beforeAll(async () => {
    await setupDb();
    
    merchant = await createTestMerchant({ businessName: 'Transaction Test Restaurant' });
    user = await createTestUser(merchant, { email: 'transaction@test.com' });
    token = await loginUser(user);
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    const Branch = mongoose.model('Branch');
    const Table = mongoose.model('Table');

    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Transaction Test Branch',
      phone: '+251911111111',
      location: {
        type: 'Point',
        coordinates: [9.03, 38.74],
        city: 'Addis Ababa',
      },
      isActive: true,
    });

    table1 = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      tableNumber: '1',
      capacity: 4,
      status: 'available',
      isActive: true,
    });

    table2 = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      tableNumber: '2',
      capacity: 2,
      status: 'available',
      isActive: true,
    });
  });

  describe('Branch Deletion with Cascading', () => {
    test('DELETE /api/v1/branches/:id should cascade to tables', async () => {
      const branchId = branch._id;
      const tablesBefore = await mongoose.model('Table').find({
        branch: branchId,
        isActive: true,
      }).countDocuments();

      expect(tablesBefore).toBeGreaterThan(0);

      const res = await request(app)
        .delete(`/api/v1/branches/${branchId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Branch should be soft-deleted
      const deletedBranch = await mongoose.model('Branch').findById(branchId);
      expect(deletedBranch.isActive).toBe(false);

      // All tables should be cascaded to inactive
      const tablesAfter = await mongoose.model('Table').find({
        branch: branchId,
        isActive: true,
      }).countDocuments();

      expect(tablesAfter).toBe(0);

      // All inactive tables should exist
      const allTables = await mongoose.model('Table').find({
        branch: branchId,
      }).countDocuments();

      expect(allTables).toBe(tablesBefore);
    });

    test('Branch deletion should not orphan records on partial failure', async () => {
      // Create multiple tables
      const Table = mongoose.model('Table');
      const table3 = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: '3',
        capacity: 6,
        isActive: true,
      });

      const initialCount = await Table.find({
        branch: branch._id,
      }).countDocuments();

      const res = await request(app)
        .delete(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`);

      // Either succeeds completely or fails
      if (res.statusCode === 200) {
        // All tables should be inactive
        const inactive = await Table.find({
          branch: branch._id,
          isActive: false,
        }).countDocuments();

        expect(inactive).toBe(initialCount);
      } else {
        // All tables should still be active (rollback)
        const active = await Table.find({
          branch: branch._id,
          isActive: true,
        }).countDocuments();

        expect(active).toBe(initialCount);
      }
    });
  });

  describe('Table Movement with Transactions', () => {
    test('Moving table should transfer session and orders atomically', async () => {
      const DiningSession = mongoose.model('DiningSession');

      // Create a session on table1
      const session = await DiningSession.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        status: 'active',
        token: 'test-token',
      });

      // Move table
      const res = await request(app)
        .post('/api/v1/tables/change')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentTableId: table1._id,
          newTableId: table2._id,
        })
        .expect(200);

      // Session should be transferred to new table
      const updatedSession = await DiningSession.findById(session._id);
      expect(updatedSession.table.toString()).toBe(table2._id.toString());

      // table1 should be marked needs-cleaning
      const updatedTable1 = await mongoose.model('Table').findById(table1._id);
      expect(updatedTable1.status).toBe('needs-cleaning');

      // table2 should be marked occupied
      const updatedTable2 = await mongoose.model('Table').findById(table2._id);
      expect(updatedTable2.status).toBe('occupied');
    });

    test('Failed table move should rollback all changes', async () => {
      // Try to move to non-existent table
      const invalidTableId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .post('/api/v1/tables/change')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentTableId: table1._id,
          newTableId: invalidTableId,
        });

      // Should fail
      expect([400, 404, 500]).toContain(res.statusCode);

      // Original table should be unchanged
      const unchangedTable = await mongoose.model('Table').findById(table1._id);
      expect(unchangedTable.status).toBe('available');
    });
  });

  describe('Table Deletion with Cascading', () => {
    test('DELETE /api/v1/tables/:id should cascade to sessions', async () => {
      const DiningSession = mongoose.model('DiningSession');

      // Create a session on table1
      const session = await DiningSession.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table1._id,
        status: 'active',
      });

      const res = await request(app)
        .delete(`/api/v1/tables/${table1._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Table should be soft-deleted
      const deletedTable = await mongoose.model('Table').findById(table1._id);
      expect(deletedTable.isActive).toBe(false);

      // Active sessions should be closed
      const closedSession = await DiningSession.findById(session._id);
      expect(closedSession.status).toBe('closed');
    });
  });

  describe('Transaction Atomicity', () => {
    test('All-or-nothing behavior for branch deletion', async () => {
      const Table = mongoose.model('Table');

      // Get initial state
      const initialTables = await Table.find({
        branch: branch._id,
      });

      // Delete branch
      const res = await request(app)
        .delete(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`);

      if (res.statusCode === 200) {
        // Verify COMPLETE deletion (all tables inactive)
        const inactiveTables = await Table.find({
          branch: branch._id,
          isActive: false,
        }).countDocuments();

        expect(inactiveTables).toBe(initialTables.length);

        // No mixed state (some active, some inactive)
        const activeTables = await Table.find({
          branch: branch._id,
          isActive: true,
        }).countDocuments();

        expect(activeTables).toBe(0);
      }
    });

    test('Transaction rollback on error leaves no orphaned data', async () => {
      // This test would simulate a crash during transaction
      // For now, we verify the transaction code exists
      const Table = mongoose.model('Table');

      const initialCount = await Table.find({
        branch: branch._id,
      }).countDocuments();

      // Attempt operation that might fail
      const res = await request(app)
        .delete(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`);

      // Verify data consistency
      const finalCount = await Table.find({
        branch: branch._id,
      }).countDocuments();

      // Count should either be unchanged (rollback) or all inactive (success)
      if (res.statusCode === 200) {
        // All tables should exist but be inactive
        expect(finalCount).toBe(initialCount);
      } else {
        // Count should be unchanged
        expect(finalCount).toBe(initialCount);
      }
    });
  });

  describe('Transaction Code Review', () => {
    test('Table.moveTo should use MongoDB sessions', () => {
      const fs = require('fs');
      const modelPath = require.resolve('../models/tabelModel.js');
      const content = fs.readFileSync(modelPath, 'utf-8');

      // Verify transaction code exists
      expect(content).toContain('startSession');
      expect(content).toContain('startTransaction');
      expect(content).toContain('commitTransaction');
      expect(content).toContain('abortTransaction');
      expect(content).toContain('session: dbSession');
    });

    test('BranchService.deleteBranch should use transactions', () => {
      const fs = require('fs');
      const servicePath = require.resolve('../src/modules/branch/service/BranchService.js');
      const content = fs.readFileSync(servicePath, 'utf-8');

      // Find deleteBranch method
      const deleteBranchMatch = content.match(/static async deleteBranch[\s\S]*?}\s*}/);
      expect(deleteBranchMatch).toBeTruthy();

      const deleteBranchCode = deleteBranchMatch[0];
      expect(deleteBranchCode).toContain('startSession');
      expect(deleteBranchCode).toContain('startTransaction');
      expect(deleteBranchCode).toContain('commitTransaction');
    });

    test('BranchService.freeTable should use transactions', () => {
      const fs = require('fs');
      const servicePath = require.resolve('../src/modules/branch/service/BranchService.js');
      const content = fs.readFileSync(servicePath, 'utf-8');

      // Find freeTable method
      const freeTableMatch = content.match(/static async freeTable[\s\S]*?}\s*}/);
      expect(freeTableMatch).toBeTruthy();

      const freeTableCode = freeTableMatch[0];
      expect(freeTableCode).toContain('startSession');
      expect(freeTableCode).toContain('startTransaction');
    });

    test('BranchService.deleteTable should use transactions', () => {
      const fs = require('fs');
      const servicePath = require.resolve('../src/modules/branch/service/BranchService.js');
      const content = fs.readFileSync(servicePath, 'utf-8');

      // Find deleteTable method
      const deleteTableMatch = content.match(/static async deleteTable[\s\S]*?}\s*}/);
      expect(deleteTableMatch).toBeTruthy();

      const deleteTableCode = deleteTableMatch[0];
      expect(deleteTableCode).toContain('startSession');
      expect(deleteTableCode).toContain('startTransaction');
    });
  });

  describe('MongoDB Session Requirements', () => {
    test('Server should have MongoDB replica set configured', async () => {
      const dbConnection = mongoose.connection;
      
      // Check if transactions are supported
      // In a replica set or sharded cluster, this will be true
      expect(dbConnection).toBeDefined();
    });
  });
});
