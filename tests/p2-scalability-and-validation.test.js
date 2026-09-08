/**
 * P2: Scalability and Validation Tests
 * 
 * Verify:
 * P2-001: Pagination limits on list endpoints
 * P2-002: Input validation on complex fields
 * P2-003: Branch dependency handling on deletion
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { setupDb, teardownDb, createTestMerchant, createTestUser, loginUser } = require('./helpers/test-setup');

const app = createApp();

describe('P2: Scalability and Validation', () => {
  let merchant, user, token;
  let branch;

  beforeAll(async () => {
    await setupDb();
    
    merchant = await createTestMerchant({ businessName: 'P2 Test Restaurant' });
    user = await createTestUser(merchant, { email: 'p2@test.com' });
    token = await loginUser(user);
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    const Branch = mongoose.model('Branch');

    branch = await Branch.create({
      merchant: merchant._id,
      name: 'P2 Test Branch',
      phone: '+251911111111',
      location: {
        type: 'Point',
        coordinates: [9.03, 38.74],
        city: 'Addis Ababa',
      },
      isActive: true,
    });
  });

  describe('P2-001: Pagination Limits', () => {
    test('GET /api/v1/branches should apply pagination limit cap', async () => {
      const res = await request(app)
        .get('/api/v1/branches?limit=1000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Response should have data array
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      // Should be capped at max limit (100 by default)
      // This is enforced by ApiFeatures.paginate()
      expect(res.body.data.length).toBeLessThanOrEqual(100);
    });

    test('GET /api/v1/tables should apply pagination limit cap', async () => {
      // Create multiple tables
      const Table = mongoose.model('Table');
      for (let i = 0; i < 50; i++) {
        await Table.create({
          merchant: merchant._id,
          branch: branch._id,
          tableNumber: `T${i}`,
          capacity: 4,
          isActive: true,
        });
      }

      const res = await request(app)
        .get('/api/v1/tables?limit=1000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBeLessThanOrEqual(100);
    });

    test('Default pagination should work when limit not specified', async () => {
      const res = await request(app)
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBeLessThanOrEqual(100);
    });

    test('Page parameter should work correctly', async () => {
      // Create multiple branches
      const Branch = mongoose.model('Branch');
      for (let i = 0; i < 5; i++) {
        await Branch.create({
          merchant: merchant._id,
          name: `Branch ${i}`,
          phone: '+251911111111',
          location: {
            type: 'Point',
            coordinates: [9.03, 38.74],
            city: 'Addis Ababa',
          },
          isActive: true,
        });
      }

      // Get page 1
      const page1 = await request(app)
        .get('/api/v1/branches?page=1&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page1.body.data.length).toBeLessThanOrEqual(2);

      // Get page 2
      const page2 = await request(app)
        .get('/api/v1/branches?page=2&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Pages should have different data
      if (page1.body.data.length > 0 && page2.body.data.length > 0) {
        expect(page1.body.data[0]._id).not.toBe(page2.body.data[0]._id);
      }
    });
  });

  describe('P2-002: Input Validation', () => {
    describe('Branch Creation Validation', () => {
      test('Should reject branch with empty name', async () => {
        const res = await request(app)
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: '',
            city: 'Addis Ababa',
            location: {
              coordinates: [9.03, 38.74],
            },
          })
          .expect(400);

        expect(res.body.message).toContain('name');
      });

      test('Should reject branch with missing city', async () => {
        const res = await request(app)
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Valid Branch',
            location: {
              coordinates: [9.03, 38.74],
            },
          })
          .expect(400);

        expect(res.body.message).toContain('city');
      });

      test('Should reject branch with invalid coordinates', async () => {
        const res = await request(app)
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Valid Branch',
            city: 'Addis Ababa',
            location: {
              coordinates: [200, 50],  // Longitude out of range
            },
          })
          .expect(400);

        expect(res.body.message).toContain('Longitude');
      });

      test('Should reject branch with invalid latitude', async () => {
        const res = await request(app)
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Valid Branch',
            city: 'Addis Ababa',
            location: {
              coordinates: [9.03, 100],  // Latitude out of range
            },
          })
          .expect(400);

        expect(res.body.message).toContain('Latitude');
      });

      test('Should reject invalid phone format', async () => {
        const res = await request(app)
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Valid Branch',
            city: 'Addis Ababa',
            phone: '1234567890',  // Invalid format
            location: {
              coordinates: [9.03, 38.74],
            },
          })
          .expect(400);

        expect(res.body.message).toContain('phone');
      });

      test('Should accept valid Ethiopian phone', async () => {
        const res = await request(app)
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Valid Branch',
            city: 'Addis Ababa',
            phone: '+251911111111',
            location: {
              coordinates: [9.03, 38.74],
            },
          })
          .expect(201);

        expect(res.body.data.phone).toBe('+251911111111');
      });

      test('Should accept phone without plus', async () => {
        const res = await request(app)
          .post('/api/v1/branches')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Valid Branch 2',
            city: 'Addis Ababa',
            phone: '251911111111',
            location: {
              coordinates: [9.03, 38.74],
            },
          })
          .expect(201);

        expect(res.body.data).toBeDefined();
      });
    });

    describe('Table Creation Validation', () => {
      test('Should reject table with empty table number', async () => {
        const res = await request(app)
          .post('/api/v1/tables')
          .set('Authorization', `Bearer ${token}`)
          .send({
            tableNumber: '',
            capacity: 4,
            branchId: branch._id,
          })
          .expect(400);

        expect(res.body.message).toContain('table number');
      });

      test('Should reject table with capacity < 1', async () => {
        const res = await request(app)
          .post('/api/v1/tables')
          .set('Authorization', `Bearer ${token}`)
          .send({
            tableNumber: 'T1',
            capacity: 0,
            branchId: branch._id,
          })
          .expect(400);

        expect(res.body.message).toContain('capacity');
      });

      test('Should reject table with capacity > 50', async () => {
        const res = await request(app)
          .post('/api/v1/tables')
          .set('Authorization', `Bearer ${token}`)
          .send({
            tableNumber: 'T1',
            capacity: 100,
            branchId: branch._id,
          })
          .expect(400);

        expect(res.body.message).toContain('capacity');
      });

      test('Should reject table with invalid location', async () => {
        const res = await request(app)
          .post('/api/v1/tables')
          .set('Authorization', `Bearer ${token}`)
          .send({
            tableNumber: 'T1',
            capacity: 4,
            location: 'invalid-location',
            branchId: branch._id,
          })
          .expect(400);

        expect(res.body.message).toContain('location');
      });

      test('Should reject table with invalid status', async () => {
        const res = await request(app)
          .post('/api/v1/tables')
          .set('Authorization', `Bearer ${token}`)
          .send({
            tableNumber: 'T1',
            capacity: 4,
            status: 'invalid-status',
            branchId: branch._id,
          })
          .expect(400);

        expect(res.body.message).toContain('status');
      });

      test('Should accept valid table number', async () => {
        const res = await request(app)
          .post('/api/v1/tables')
          .set('Authorization', `Bearer ${token}`)
          .send({
            tableNumber: 'VIP-01',
            capacity: 10,
            location: 'vip',
            branchId: branch._id,
          })
          .expect(200);

        expect(res.body.data.tableNumber).toBe('VIP-01');
        expect(res.body.data.capacity).toBe(10);
        expect(res.body.data.location).toBe('vip');
      });

      test('Should accept all valid locations', async () => {
        const locations = ['indoor', 'outdoor', 'rooftop', 'terrace', 'vip', 'bar', 'window', 'balcony', 'garden'];

        for (let i = 0; i < locations.length; i++) {
          const res = await request(app)
            .post('/api/v1/tables')
            .set('Authorization', `Bearer ${token}`)
            .send({
              tableNumber: `T${i}`,
              capacity: 4,
              location: locations[i],
              branchId: branch._id,
            })
            .expect(200);

          expect(res.body.data.location).toBe(locations[i]);
        }
      });

      test('Should accept all valid statuses', async () => {
        const statuses = ['available', 'occupied', 'reserved', 'needs-cleaning', 'disabled'];

        for (let i = 0; i < statuses.length; i++) {
          const res = await request(app)
            .post('/api/v1/tables')
            .set('Authorization', `Bearer ${token}`)
            .send({
              tableNumber: `TS${i}`,
              capacity: 4,
              status: statuses[i],
              branchId: branch._id,
            })
            .expect(200);

          expect(res.body.data.status).toBe(statuses[i]);
        }
      });
    });
  });

  describe('P2-003: Branch Dependency Handling', () => {
    test('Deleting branch should deactivate all tables', async () => {
      const Table = mongoose.model('Table');

      // Create multiple tables
      for (let i = 0; i < 3; i++) {
        await Table.create({
          merchant: merchant._id,
          branch: branch._id,
          tableNumber: `T${i}`,
          capacity: 4,
          isActive: true,
        });
      }

      const tablesBeforeDelete = await Table.find({
        branch: branch._id,
        isActive: true,
      }).countDocuments();

      expect(tablesBeforeDelete).toBe(3);

      // Delete branch
      await request(app)
        .delete(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // All tables should be inactive
      const activeTablesAfter = await Table.find({
        branch: branch._id,
        isActive: true,
      }).countDocuments();

      expect(activeTablesAfter).toBe(0);

      // All tables should still exist
      const allTables = await Table.find({
        branch: branch._id,
      }).countDocuments();

      expect(allTables).toBe(3);
    });

    test('Deleting branch should close active sessions', async () => {
      const Table = mongoose.model('Table');
      const DiningSession = mongoose.model('DiningSession');

      // Create a table
      const table = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'SESSION-TEST',
        capacity: 4,
        isActive: true,
      });

      // Create an active session
      const session = await DiningSession.create({
        merchant: merchant._id,
        branch: branch._id,
        table: table._id,
        status: 'active',
      });

      // Delete branch
      await request(app)
        .delete(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Session should be closed
      const closedSession = await DiningSession.findById(session._id);
      expect(closedSession.status).toBe('closed');
    });

    test('Deleting branch should end staff assignments', async () => {
      const StaffAssignment = mongoose.model('StaffAssignment');
      const Table = mongoose.model('Table');

      // Create a table
      const table = await Table.create({
        merchant: merchant._id,
        branch: branch._id,
        tableNumber: 'STAFF-TEST',
        capacity: 4,
        isActive: true,
      });

      // Create staff assignment
      const assignment = await StaffAssignment.create({
        merchant: merchant._id,
        branch: branch._id,
        staff: user._id,
        tables: [{ table: table._id, tableNumber: table.tableNumber }],
        isActive: true,
      });

      // Delete branch
      await request(app)
        .delete(`/api/v1/branches/${branch._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Assignment should be ended
      const endedAssignment = await StaffAssignment.findById(assignment._id);
      expect(endedAssignment.isActive).toBe(false);
      expect(endedAssignment.endedAt).toBeDefined();
    });
  });

  describe('ApiFeatures Configuration Review', () => {
    test('ApiFeatures should have pagination limits', () => {
      const fs = require('fs');
      const featuresPath = require.resolve('../utils/apiFeatures.js');
      const content = fs.readFileSync(featuresPath, 'utf-8');

      // Should define MAX_LIMIT
      expect(content).toContain('MAX_LIMIT');
      
      // Should have Math.min to cap limit
      expect(content).toContain('Math.min');
    });
  });
});
