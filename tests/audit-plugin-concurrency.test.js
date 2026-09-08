// tests/audit-plugin-concurrency.test.js
// ✅ Test Query Instance Isolation Under Concurrent findOneAndUpdate Operations
const mongoose = require('mongoose');
const auditPlugin = require('../utils/auditPlugin');
const AuditLog = require('../models/auditLogModel');
const { setRequestContext } = require('../utils/request-context');

// Test model
const testSchema = new mongoose.Schema({
  name: String,
  value: Number,
  merchant: { type: mongoose.Schema.ObjectId, ref: 'Merchant' },
});

testSchema.plugin(auditPlugin, {
  resource: 'TestModel',
  auditedFields: ['name', 'value'],
});

const TestModel = mongoose.model('TestModel_Concurrency', testSchema);

beforeAll(async () => {
  // Clean up
  await AuditLog.deleteMany({});
  await TestModel.deleteMany({});
});

afterAll(async () => {
  await AuditLog.deleteMany({});
  await TestModel.deleteMany({});
});

describe('Audit Plugin - Query Instance Concurrency Safety', () => {
  it('should NOT cross-contaminate old values between concurrent findOneAndUpdate calls', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    // Create mock request context
    const mockReq = {
      originalUrl: '/test/concurrent-update',
      ip: '127.0.0.1',
      get: () => 'test-agent',
    };

    const mockUser = {
      _id: userId,
      merchant: merchantId,
    };

    setRequestContext({
      req: mockReq,
      user: mockUser,
      correlationId: 'test-concurrent',
    });

    // Create two test documents with different initial values
    const doc1 = await TestModel.create({
      name: 'Document 1',
      value: 100,
      merchant: merchantId,
    });

    const doc2 = await TestModel.create({
      name: 'Document 2',
      value: 200,
      merchant: merchantId,
    });

    // Clear audit logs from creation
    await AuditLog.deleteMany({});

    // Fire two concurrent findOneAndUpdate operations
    const [result1, result2] = await Promise.all([
      TestModel.findOneAndUpdate(
        { _id: doc1._id },
        { $set: { value: 111 } },
        { new: true }
      ),
      TestModel.findOneAndUpdate(
        { _id: doc2._id },
        { $set: { value: 222 } },
        { new: true }
      ),
    ]);

    // Give audit logs time to be created (setImmediate)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Fetch audit logs
    const logs = await AuditLog.find({
      resource: 'TestModel',
      action: 'UPDATE',
    })
      .sort('createdAt')
      .lean();

    // Verify we have 2 audit logs
    expect(logs).toHaveLength(2);

    // CRITICAL TEST: Verify each log has the correct old value for its document
    const log1 = logs.find(
      log => log.resourceId.toString() === doc1._id.toString()
    );
    const log2 = logs.find(
      log => log.resourceId.toString() === doc2._id.toString()
    );

    expect(log1).toBeDefined();
    expect(log2).toBeDefined();

    // Log 1 should show old value 100 → new value 111
    expect(log1.oldValues.value).toBe(100);
    expect(log1.newValues.value).toBe(111);

    // Log 2 should show old value 200 → new value 222
    expect(log2.oldValues.value).toBe(200);
    expect(log2.newValues.value).toBe(222);

    // FAILURE CASE: If Query instances were NOT isolated, we might see:
    // - log1.oldValues.value = 200 (wrong! contaminated from doc2)
    // - log2.oldValues.value = 100 (wrong! contaminated from doc1)
  });

  it('should correctly track CREATE vs UPDATE with wasNew flag', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const mockReq = {
      originalUrl: '/test/create-update',
      ip: '127.0.0.1',
      get: () => 'test-agent',
    };

    const mockUser = {
      _id: userId,
      merchant: merchantId,
    };

    setRequestContext({
      req: mockReq,
      user: mockUser,
      correlationId: 'test-create-update',
    });

    // Clear previous logs
    await AuditLog.deleteMany({});

    // CREATE: Use .save() to test pre/post('save') hooks
    const newDoc = new TestModel({
      name: 'New Document',
      value: 300,
      merchant: merchantId,
    });

    await newDoc.save();

    // UPDATE: Fetch and save again
    const fetchedDoc = await TestModel.findById(newDoc._id);
    fetchedDoc.value = 400;
    await fetchedDoc.save();

    // Give audit logs time to be created
    await new Promise(resolve => setTimeout(resolve, 100));

    // Fetch audit logs
    const logs = await AuditLog.find({
      resource: 'TestModel',
      resourceId: newDoc._id,
    })
      .sort('createdAt')
      .lean();

    // Should have 2 logs: CREATE then UPDATE
    expect(logs).toHaveLength(2);

    // First log should be CREATE
    expect(logs[0].action).toBe('CREATE');
    expect(logs[0].method).toBe('POST');
    expect(logs[0].metadata.wasNew).toBe(true);

    // Second log should be UPDATE
    expect(logs[1].action).toBe('UPDATE');
    expect(logs[1].method).toBe('PATCH');
    expect(logs[1].metadata.wasNew).toBe(false);
    expect(logs[1].oldValues.value).toBe(300);
    expect(logs[1].newValues.value).toBe(400);
  });

  it('should handle 10 concurrent updates without cross-contamination', async () => {
    const merchantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const mockReq = {
      originalUrl: '/test/stress',
      ip: '127.0.0.1',
      get: () => 'test-agent',
    };

    const mockUser = {
      _id: userId,
      merchant: merchantId,
    };

    setRequestContext({
      req: mockReq,
      user: mockUser,
      correlationId: 'test-stress',
    });

    // Create 10 documents
    const docs = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        TestModel.create({
          name: `Doc ${i}`,
          value: i * 100,
          merchant: merchantId,
        })
      )
    );

    // Clear creation logs
    await AuditLog.deleteMany({});

    // Fire 10 concurrent updates
    await Promise.all(
      docs.map((doc, i) =>
        TestModel.findOneAndUpdate(
          { _id: doc._id },
          { $set: { value: i * 100 + 50 } },
          { new: true }
        )
      )
    );

    // Give audit logs time to be created
    await new Promise(resolve => setTimeout(resolve, 200));

    // Fetch all audit logs
    const logs = await AuditLog.find({
      resource: 'TestModel',
      action: 'UPDATE',
    }).lean();

    expect(logs).toHaveLength(10);

    // Verify each log has correct old → new values
    for (let i = 0; i < 10; i++) {
      const doc = docs[i];
      const log = logs.find(
        l => l.resourceId.toString() === doc._id.toString()
      );

      expect(log).toBeDefined();
      expect(log.oldValues.value).toBe(i * 100); // Original value
      expect(log.newValues.value).toBe(i * 100 + 50); // Updated value

      // If cross-contamination occurred, these would be wrong
    }
  });
});
