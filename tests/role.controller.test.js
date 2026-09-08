/**
 * @file tests/role.controller.test.js
 * @description Regression tests for role.controller.js validation
 * 
 * Tests cover the RBAC validation gap fix:
 * - Non-system roles MUST have at least one task
 * - System roles CAN have zero tasks (SUPER-ADMIN bypass)
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const { createApp } = require('../src/app/create-app');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');
const User = require('../models/userModel');
const Merchant = require('../models/merchantModel');

let app;
let superAdminToken;
let superAdminUserId;
let superAdminRoleId;
let testTaskId;

// Helper to create JWT token
function createToken(user) {
  const payload = {
    id: user._id.toString(),
    email: user.email,
    merchant: user.merchant?.toString() || null,
    branch: null, // SUPER-ADMIN doesn't need branch
    role: user.role.name
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

beforeAll(async () => {
  await connectDatabase();
  app = createApp();

  // Clean up any leftover test data first
  await Role.deleteMany({ name: { $in: ['TEST-SUPER-ADMIN', 'TEST-NON-SYSTEM-ROLE', 'TEST-SYSTEM-ROLE', 'BROKEN-ROLE'] } });
  await User.deleteMany({ email: 'test-superadmin@test.com' });
  await Task.deleteMany({ name: 'Test Task' });

  // Create TEST-SUPER-ADMIN role (system role with zero tasks - allowed)
  const superAdminRole = await Role.create({
    name: 'TEST-SUPER-ADMIN',
    description: 'Test System Administrator',
    isSystemRole: true,
    tasks: [] // System roles can have zero tasks
  });
  superAdminRoleId = superAdminRole._id;

  // Create TEST-SUPER-ADMIN user
  const superAdmin = await User.create({
    firstName: 'Super',
    lastName: 'Admin',
    email: 'test-superadmin@test.com',
    phone: '+251900000001',
    password: 'password123',
    passwordConfirm: 'password123',
    role: superAdminRoleId,
    isActive: true
  });
  superAdminUserId = superAdmin._id;

  const superAdminWithRole = await User.findById(superAdminUserId).populate('role');
  superAdminToken = 'Bearer ' + createToken(superAdminWithRole);

  // Create a test task for validation
  const testTask = await Task.create({
    name: 'Test Task',
    endpoint: '/api/v1/test',
    method: 'GET',
    description: 'Test task for role validation',
    isMerchant: true
  });
  testTaskId = testTask._id;

}, 30000);

afterAll(async () => {
  await User.deleteMany({ _id: superAdminUserId });
  await Role.deleteMany({ _id: superAdminRoleId });
  await Task.deleteMany({ _id: testTaskId });
  // Clean up any test roles created during tests
  await Role.deleteMany({ name: { $in: ['TEST-NON-SYSTEM-ROLE', 'TEST-SYSTEM-ROLE', 'BROKEN-ROLE'] } });
  await disconnectDatabase();
}, 30000);

describe('Role Controller - RBAC Validation Regression Tests', () => {

  describe('POST /api/v1/roles - Create Role Validation', () => {

    it('should reject non-system role with empty tasks array', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'BROKEN-ROLE',
          description: 'A role with no permissions',
          tasks: [],
          isSystemRole: false
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Non-system roles must have at least one task assigned');
    });

    it('should reject non-system role without tasks field', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'BROKEN-ROLE',
          description: 'A role with no permissions',
          // tasks field omitted
          isSystemRole: false
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Non-system roles must have at least one task assigned');
    });

    it('should reject non-system role when isSystemRole is explicitly false', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'BROKEN-ROLE',
          description: 'Explicitly non-system role with no tasks',
          tasks: [],
          isSystemRole: false
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Non-system roles must have at least one task assigned');
    });

    it('should reject non-system role when isSystemRole is undefined (default false)', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'BROKEN-ROLE',
          description: 'Role with undefined isSystemRole and no tasks',
          tasks: []
          // isSystemRole not provided, defaults to false
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Non-system roles must have at least one task assigned');
    });

    it('should allow system role with empty tasks array (SUPER-ADMIN pattern)', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'TEST-SYSTEM-ROLE',
          description: 'System role that bypasses task-based RBAC',
          tasks: [],
          isSystemRole: true
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.role.name).toBe('TEST-SYSTEM-ROLE');
      expect(response.body.data.role.isSystemRole).toBe(true);
      expect(response.body.data.role.tasks).toHaveLength(0);

      // Clean up
      await Role.deleteMany({ name: 'TEST-SYSTEM-ROLE' });
    });

    it('should allow system role without tasks field when isSystemRole is true', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'TEST-SYSTEM-ROLE',
          description: 'System role without tasks field',
          isSystemRole: true
          // tasks field omitted
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.role.isSystemRole).toBe(true);

      // Clean up
      await Role.deleteMany({ name: 'TEST-SYSTEM-ROLE' });
    });

    it('should allow non-system role with at least one valid task', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'TEST-NON-SYSTEM-ROLE',
          description: 'Non-system role with valid permissions',
          tasks: [testTaskId],
          isSystemRole: false
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.role.name).toBe('TEST-NON-SYSTEM-ROLE');
      expect(response.body.data.role.isSystemRole).toBe(false);
      expect(response.body.data.role.tasks).toHaveLength(1);

      // Clean up
      await Role.deleteMany({ name: 'TEST-NON-SYSTEM-ROLE' });
    });

    it('should still validate task IDs exist when tasks are provided', async () => {
      const fakeTaskId = '507f1f77bcf86cd799439011'; // Valid ObjectId but doesn't exist

      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'TEST-NON-SYSTEM-ROLE',
          description: 'Role with invalid task ID',
          tasks: [fakeTaskId],
          isSystemRole: false
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('One or more task IDs are invalid');
    });

  });

  describe('Validation Order - Tasks check happens before other validations', () => {

    it('should check task requirement before checking task ID validity', async () => {
      const response = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', superAdminToken)
        .send({
          name: 'BROKEN-ROLE',
          description: 'Role with no tasks',
          tasks: [],
          isSystemRole: false
        });

      // Should fail at "must have at least one task" check
      // NOT at "task IDs are invalid" check
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Non-system roles must have at least one task assigned');
      expect(response.body.message).not.toContain('invalid');
    });

  });

});
