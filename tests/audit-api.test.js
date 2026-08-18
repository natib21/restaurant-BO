// tests/audit-api.test.js
// ✅ PHASE 2 - STEP 2: Audit Log Query API Tests
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const AuditLog = require('../models/auditLogModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const { generateToken } = require('../utils/jwt');

let app;
let merchantA;
let merchantB;
let branchA;
let adminUserA;
let adminUserB;
let adminRoleA;
let tokenA;
let tokenB;

beforeAll(async () => {
  app = await createApp();

  // Create test merchants
  merchantA = await Merchant.create({
    businessName: 'Restaurant A',
    slug: 'restaurant-a-audit',
    email: 'merchantA@test.com',
    phone: '+251911111111',
    status: 'approved',
    owner: {
      fullName: 'Owner A',
      gender: 'Male',
      email: 'ownerA@test.com',
      phone: '+251911222333',
    },
  });

  merchantB = await Merchant.create({
    businessName: 'Restaurant B',
    slug: 'restaurant-b-audit',
    email: 'merchantB@test.com',
    phone: '+251922222222',
    status: 'approved',
    owner: {
      fullName: 'Owner B',
      gender: 'Female',
      email: 'ownerB@test.com',
      phone: '+251922333444',
    },
  });

  // Create branch for Merchant A
  branchA = await Branch.create({
    name: 'Downtown',
    merchant: merchantA._id,
    branchCode: 'DT001',
  });

  // Create admin role with audit tasks
  const auditTasks = [
    'audit.logs.list',
    'audit.logs.view',
    'audit.logs.resource-history',
    'audit.logs.correlation',
    'audit.logs.export',
    'audit.logs.stats',
  ];

  const Task = require('../models/taskModel');
  const taskDocs = await Task.find({ name: { $in: auditTasks } });

  adminRoleA = await Role.create({
    name: 'Admin',
    merchant: merchantA._id,
    tasks: taskDocs.map(t => t._id),
  });

  // Create admin users
  adminUserA = await User.create({
    name: 'Admin A',
    email: 'adminA@test.com',
    password: 'password123',
    merchant: merchantA._id,
    branch: branchA._id,
    role: adminRoleA._id,
    isActive: true,
  });

  adminUserB = await User.create({
    name: 'Admin B',
    email: 'adminB@test.com',
    password: 'password123',
    merchant: merchantB._id,
    role: adminRoleA._id, // Reuse role for simplicity
    isActive: true,
  });

  // Generate tokens
  tokenA = generateToken(adminUserA._id, merchantA._id);
  tokenB = generateToken(adminUserB._id, merchantB._id);
});

afterAll(async () => {
  await AuditLog.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
  await Branch.deleteMany({});
  await Merchant.deleteMany({});
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
});

describe('Audit Log Query API', () => {
  describe('GET /api/v1/audit-logs', () => {
    it('should return audit logs for authenticated merchant', async () => {
      // Create test logs
      await AuditLog.create([
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          branch: branchA._id,
          action: 'CREATE',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order',
          statusCode: 201,
          severity: 'low',
        },
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'ORDER_STATUS_CHANGE',
          resource: 'Order',
          method: 'PATCH',
          endpoint: '/api/v1/order/123/status',
          statusCode: 200,
          severity: 'medium',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.logs).toHaveLength(2);
      expect(res.body.data.pagination).toMatchObject({
        page: 1,
        total: 2,
        pages: 1,
      });
    });

    it('should enforce tenant isolation', async () => {
      // Create logs for both merchants
      await AuditLog.create([
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'CREATE',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order',
          statusCode: 201,
        },
        {
          user: adminUserB._id,
          merchant: merchantB._id,
          action: 'CREATE',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order',
          statusCode: 201,
        },
      ]);

      // Merchant A should only see their logs
      const resA = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(resA.body.data.logs).toHaveLength(1);
      expect(resA.body.data.logs[0].merchant._id.toString()).toBe(merchantA._id.toString());

      // Merchant B should only see their logs
      const resB = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(resB.body.data.logs).toHaveLength(1);
      expect(resB.body.data.logs[0].merchant._id.toString()).toBe(merchantB._id.toString());
    });

    it('should filter by severity', async () => {
      await AuditLog.create([
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'CREATE',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order',
          statusCode: 201,
          severity: 'low',
        },
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'PAYMENT_RECEIVED',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order/123/pay',
          statusCode: 200,
          severity: 'critical',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/audit-logs?severity=critical')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.logs).toHaveLength(1);
      expect(res.body.data.logs[0].severity).toBe('critical');
    });

    it('should paginate results', async () => {
      // Create 10 logs
      const logs = Array.from({ length: 10 }, (_, i) => ({
        user: adminUserA._id,
        merchant: merchantA._id,
        action: 'CREATE',
        resource: 'Order',
        method: 'POST',
        endpoint: '/api/v1/order',
        statusCode: 201,
      }));
      await AuditLog.create(logs);

      const res = await request(app)
        .get('/api/v1/audit-logs?page=1&limit=5')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.logs).toHaveLength(5);
      expect(res.body.data.pagination).toMatchObject({
        page: 1,
        limit: 5,
        total: 10,
        pages: 2,
      });
    });
  });

  describe('GET /api/v1/audit-logs/:id', () => {
    it('should return single audit log', async () => {
      const log = await AuditLog.create({
        user: adminUserA._id,
        merchant: merchantA._id,
        action: 'CREATE',
        resource: 'Order',
        resourceId: new mongoose.Types.ObjectId(),
        method: 'POST',
        endpoint: '/api/v1/order',
        statusCode: 201,
        changes: [{ field: 'status', oldValue: null, newValue: 'pending' }],
      });

      const res = await request(app)
        .get(`/api/v1/audit-logs/${log._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.log._id).toBe(log._id.toString());
      expect(res.body.data.log.changes).toHaveLength(1);
    });

    it('should enforce tenant isolation on single log', async () => {
      const log = await AuditLog.create({
        user: adminUserB._id,
        merchant: merchantB._id,
        action: 'CREATE',
        resource: 'Order',
        method: 'POST',
        endpoint: '/api/v1/order',
        statusCode: 201,
      });

      // Merchant A should not see Merchant B's log
      await request(app)
        .get(`/api/v1/audit-logs/${log._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/audit-logs/resource/:resource/:id', () => {
    it('should return resource history', async () => {
      const orderId = new mongoose.Types.ObjectId();

      await AuditLog.create([
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'CREATE',
          resource: 'Order',
          resourceId: orderId,
          method: 'POST',
          endpoint: '/api/v1/order',
          statusCode: 201,
        },
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'ORDER_STATUS_CHANGE',
          resource: 'Order',
          resourceId: orderId,
          method: 'PATCH',
          endpoint: '/api/v1/order/123/status',
          statusCode: 200,
        },
      ]);

      const res = await request(app)
        .get(`/api/v1/audit-logs/resource/Order/${orderId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.logs).toHaveLength(2);
      expect(res.body.data.logs[0].resourceId.toString()).toBe(orderId.toString());
    });
  });

  describe('GET /api/v1/audit-logs/correlation/:correlationId', () => {
    it('should return correlated logs', async () => {
      const correlationId = 'order-abc-123';

      await AuditLog.create([
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'CREATE',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order',
          statusCode: 201,
          correlationId,
        },
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'PAYMENT_RECEIVED',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order/123/pay',
          statusCode: 200,
          correlationId,
        },
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'TICKET_CREATED',
          resource: 'KitchenTicket',
          method: 'POST',
          endpoint: '/api/v1/kitchen/tickets',
          statusCode: 201,
          correlationId,
        },
      ]);

      const res = await request(app)
        .get(`/api/v1/audit-logs/correlation/${correlationId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.logs).toHaveLength(3);
      expect(res.body.data.logs[0].correlationId).toBe(correlationId);
    });
  });

  describe('GET /api/v1/audit-logs/stats', () => {
    it('should return aggregated statistics', async () => {
      await AuditLog.create([
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'CREATE',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order',
          statusCode: 201,
          severity: 'low',
          outcome: 'success',
        },
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'PAYMENT_RECEIVED',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order/123/pay',
          statusCode: 200,
          severity: 'critical',
          outcome: 'success',
        },
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'ORDER_CANCEL',
          resource: 'Order',
          method: 'PATCH',
          endpoint: '/api/v1/order/123/cancel',
          statusCode: 200,
          severity: 'high',
          outcome: 'failure',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/audit-logs/stats')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.stats).toMatchObject({
        totalLogs: 3,
        bySeverity: {
          low: 1,
          critical: 1,
          high: 1,
        },
        byOutcome: {
          success: 2,
          failure: 1,
        },
      });
      expect(res.body.data.stats.byAction).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/audit-logs/export', () => {
    it('should export logs as CSV', async () => {
      await AuditLog.create([
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'CREATE',
          resource: 'Order',
          method: 'POST',
          endpoint: '/api/v1/order',
          statusCode: 201,
          severity: 'low',
        },
        {
          user: adminUserA._id,
          merchant: merchantA._id,
          action: 'UPDATE',
          resource: 'Order',
          method: 'PATCH',
          endpoint: '/api/v1/order/123',
          statusCode: 200,
          severity: 'medium',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/audit-logs/export')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('audit-logs-');

      // Verify CSV format
      const csv = res.text;
      const lines = csv.split('\n');
      expect(lines[0]).toContain('Timestamp');
      expect(lines[0]).toContain('Action');
      expect(lines[0]).toContain('Resource');
      expect(lines.length).toBeGreaterThan(2); // Header + 2 data rows
    });
  });
});
