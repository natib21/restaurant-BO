/**
 * Minimal test: QR Customer Order Works
 */

const request = require('supertest');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Merchant = require('../models/merchantModel');
const CustomerSession = require('../models/customerSessionModule');
const Branch = require('../models/branchModel');
const Table = require('../models/tabelModel');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const Category = require('../models/Category');

describe('QR Order - Minimal Test', () => {
  let app, merchant, branch, table, menuItem, sessionToken;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Create merchant with active subscription
    merchant = await Merchant.create({
      businessName: 'Test Restaurant',
      slug: `test-${Date.now()}`,
      email: `test-${Date.now()}@test.com`,
      phone: '+251911223344',
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true,
      features: {
        core: { menu: { enabled: true } },
        optional: { orders: { enabled: true } },
      },
    });

    // Create branch with location
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main',
      isActive: true,
      location: { city: 'Addis Ababa', coordinates: [38.7469, 9.0320] },
    });

    // Create table
    table = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      tableNumber: 'T-01',
      capacity: 4,
      isActive: true,
    });

    // Create category
    const category = await Category.create({
      merchant: merchant._id,
      name: { en: 'Food', am: 'ምግብ' },
      description: { en: 'Test', am: 'ተስት' },
      isActive: true,
    });

    // Create menu item
    menuItem = await MenuItem.create({
      merchant: merchant._id,
      branches: [branch._id],
      categoryId: category._id,
      name: { en: 'Burger', am: 'በርገር' },
      description: { en: 'Test', am: 'ተስት' },
      price: 150,
      type: 'food',
      available: true,
      inStock: true,
      publishStatus: 'published',
    });

    // Create session
    const session = await CustomerSession.create({
      merchant: merchant._id,
      branch: branch._id,
      table: table._id,
      token: `token-${Date.now()}`,
      isActive: true,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    });

    sessionToken = session.token;
  });

  afterEach(async () => {
    await CustomerSession.deleteMany({ merchant: merchant?._id });
    await MenuItem.deleteMany({ merchant: merchant?._id });
    await Table.deleteMany({ merchant: merchant?._id });
    await Branch.deleteMany({ merchant: merchant?._id });
    await Category.deleteMany({ merchant: merchant?._id });
    await Merchant.deleteMany({ _id: merchant?._id });
  });

  test('QR order should NOT be blocked by feature guard', async () => {
    const payload = {
      items: [{ menuItemId: menuItem._id.toString(), name: 'Burger', quantity: 1, price: 150 }],
      branchId: branch._id.toString(),
      table: 'T-01',
      customerName: 'Guest',
      subtotal: 150,
      totalAmount: 150,
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(payload);

    console.log('Status:', response.status);
    console.log('Message:', response.body.message);

    // ✅ Should NOT be 403 (feature guard blocking)
    expect(response.status).not.toBe(403);
    
    // ✅ Should NOT complain about subscription
    if (response.body.message) {
      expect(response.body.message).not.toContain('subscription');
      expect(response.body.message).not.toContain('not enabled');
    }

    // ✅ Request passes guard (even if it fails later for other reasons)
    expect(response.status).toBeGreaterThanOrEqual(200);
  });
});
