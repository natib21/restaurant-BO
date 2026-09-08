/**
 * Test: File upload with invalid entityId handling
 * 
 * Verifies that file upload endpoint handles:
 * - Valid ObjectId entityId
 * - Invalid string entityId (e.g., "manual-order")
 * - Missing entityId
 */

const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const app = require('../src/app/create-app')();
const FileAsset = require('../models/FileAsset');
const Merchant = require('../models/Merchant');
const User = require('../models/User');
const { generateToken } = require('../src/middlewares/auth');

describe('File Upload - EntityId Validation', () => {
  let authToken;
  let merchantId;
  let userId;
  let validOrderId;

  beforeAll(async () => {
    // Create test merchant
    const merchant = await Merchant.create({
      name: 'Test Merchant',
      slug: 'test-upload-merchant',
      isActive: true,
    });
    merchantId = merchant._id;

    // Create test user
    const user = await User.create({
      name: 'Test User',
      email: 'uploadtest@example.com',
      password: 'Password123!',
      role: 'admin',
      isActive: true,
      merchant: merchantId,
    });
    userId = user._id;

    authToken = generateToken(userId);
    validOrderId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await FileAsset.deleteMany({ merchant: merchantId });
    await User.deleteMany({ merchant: merchantId });
    await Merchant.deleteMany({ _id: merchantId });
  });

  describe('POST /api/v1/files/upload', () => {
    it('should accept valid ObjectId for entityId', async () => {
      const response = await request(app)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('entityType', 'order_payment')
        .field('entityId', validOrderId.toString())
        .field('purpose', 'receipt')
        .attach('file', Buffer.from('test-image-data'), {
          filename: 'receipt.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.file._id).toBeDefined();
      expect(response.body.data.file.entityId).toBe(validOrderId.toString());
      expect(response.body.data.file.entityType).toBe('order_payment');
    });

    it('should accept invalid string entityId and convert to null', async () => {
      const response = await request(app)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('entityType', 'order_payment')
        .field('entityId', 'manual-order') // ← Invalid ObjectId string
        .field('purpose', 'receipt')
        .attach('file', Buffer.from('test-image-data'), {
          filename: 'receipt.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.file._id).toBeDefined();
      expect(response.body.data.file.entityId).toBeNull(); // ← Converted to null
      expect(response.body.data.file.entityType).toBe('order_payment');
    });

    it('should accept missing entityId', async () => {
      const response = await request(app)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('entityType', 'order_payment')
        // No entityId field
        .field('purpose', 'receipt')
        .attach('file', Buffer.from('test-image-data'), {
          filename: 'receipt.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.file._id).toBeDefined();
      expect(response.body.data.file.entityId).toBeNull();
      expect(response.body.data.file.entityType).toBe('order_payment');
    });

    it('should reject missing entityType', async () => {
      const response = await request(app)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        // No entityType field
        .field('entityId', validOrderId.toString())
        .field('purpose', 'receipt')
        .attach('file', Buffer.from('test-image-data'), {
          filename: 'receipt.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('entityType is required');
    });

    it('should reject non-image files', async () => {
      const response = await request(app)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('entityType', 'order_payment')
        .field('entityId', validOrderId.toString())
        .field('purpose', 'receipt')
        .attach('file', Buffer.from('not an image'), {
          filename: 'document.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Only image uploads are supported');
    });

    it('should reject files larger than 8MB', async () => {
      const largeBuffer = Buffer.alloc(9 * 1024 * 1024); // 9MB

      const response = await request(app)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('entityType', 'order_payment')
        .field('entityId', validOrderId.toString())
        .field('purpose', 'receipt')
        .attach('file', largeBuffer, {
          filename: 'large.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Database Storage', () => {
    it('should store file metadata correctly with null entityId', async () => {
      const response = await request(app)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('entityType', 'order_payment')
        .field('entityId', 'invalid-id-123')
        .field('purpose', 'receipt')
        .attach('file', Buffer.from('test-data'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(201);

      const fileId = response.body.data.file._id;
      const fileDoc = await FileAsset.findById(fileId);

      expect(fileDoc).toBeDefined();
      expect(fileDoc.merchant.toString()).toBe(merchantId.toString());
      expect(fileDoc.entityType).toBe('order_payment');
      expect(fileDoc.entityId).toBeNull(); // ← Stored as null
      expect(fileDoc.purpose).toBe('receipt');
      expect(fileDoc.originalName).toBe('test.jpg');
      expect(fileDoc.mimeType).toBe('image/jpeg');
      expect(fileDoc.sizeBytes).toBeGreaterThan(0);
      expect(fileDoc.storageKey).toBeDefined();
      expect(fileDoc.uploadedBy.toString()).toBe(userId.toString());
    });
  });
});
