/**
 * Test: Customer QR Order - Feature Guard Fix
 * 
 * Verifies that customer orders via QR work after fixing the feature guard
 * to properly recognize merchant object from protectTableSession guard.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app/create-app');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Merchant = require('../models/merchantModel');
const CustomerSession = require('../models/customerSessionModule');
const Branch = require('../models/branchModel');
const Table = require('../models/tabelModel');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');

describe('Customer QR Order - Feature Guard Fix', () => {
  let app, merchant, branch, table, menuItem, sessionToken;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Create merchant with active subscription and orders feature enabled
    merchant = await Merchant.create({
      businessName: 'Test QR Restaurant',
      slug: `qr-test-${Date.now()}`,
      email: `qr-test-${Date.now()}@test.com`,
      phone: '+251911223344',
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true, // ✅ Active subscription
      features: {
        core: {
          menu: { enabled: true },
        },
        optional: {
          orders: { enabled: true }, // ✅ Orders is in optional, not core!
        },
      },
    });

    // Create branch
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch',
      isActive: true,
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7469, 9.0320], // [longitude, latitude]
      },
    });

    // Create table
    table = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      tableNumber: 'T-QR-01',
      capacity: 4,
      isActive: true,
    });

    // Create category
    const Category = require('../models/Category');
    const category = await Category.create({
      merchant: merchant._id,
      name: { en: 'Test Category', am: 'ተስት ምድብ' },
      description: { en: 'Test', am: 'ተስት' },
      isActive: true,
    });

    // Create menu item
    menuItem = await MenuItem.create({
      merchant: merchant._id,
      branches: [branch._id],
      categoryId: category._id,
      name: { en: 'QR Test Burger', am: 'ተስት በርገር' },
      description: { en: 'Test item', am: 'ተስት' },
      price: 150,
      type: 'food',
      available: true,
      inStock: true,
      publishStatus: 'published',
    });

    // Create customer session
    const session = await CustomerSession.create({
      merchant: merchant._id,
      branch: branch._id,
      table: table._id,
      token: `qr-test-token-${Date.now()}`,
      isActive: true,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
    });

    sessionToken = session.token;
  });

  afterEach(async () => {
    // Clean up in reverse order of creation
    await CustomerSession.deleteMany({ merchant: merchant?._id });
    await MenuItem.deleteMany({ merchant: merchant?._id });
    await Table.deleteMany({ merchant: merchant?._id });
    await Branch.deleteMany({ merchant: merchant?._id });
    const Category = require('../models/Category');
    await Category.deleteMany({ merchant: merchant?._id });
    await Merchant.deleteMany({ _id: merchant?._id });
  });

  test('should allow customer order request to pass feature guard with valid QR session', async () => {
    // Debug: Check merchant features before test
    const merchantCheck = await Merchant.findById(merchant._id).select('features isSubscriptionActive status isActive');
    console.log('Merchant check:', {
      id: merchantCheck._id,
      isActive: merchantCheck.isActive,
      status: merchantCheck.status,
      isSubscriptionActive: merchantCheck.isSubscriptionActive,
      hasActiveAccess: merchantCheck.hasActiveAccess,
      hasOrdersFeature: merchantCheck.hasFeature('orders'),
    });

    const orderPayload = {
      items: [
        {
          menuItemId: menuItem._id.toString(),
          name: 'QR Test Burger',
          quantity: 2,
          price: 150,
          subtotal: 300,
        },
      ],
      branchId: branch._id.toString(),
      table: 'T-QR-01',
      customerName: 'QR Guest',
      customerPhone: null,
      customer: null,
      subtotal: 300,
      totalAmount: 300,
      notes: '',
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(orderPayload);

    console.log('Response:', response.status, response.body);

    // ✅ SUCCESS: Feature guard no longer blocks with 403 "subscription not active" or "orders not enabled"
    // The request passes the guard (might still fail later in order logic, but guard is fixed)
    expect(response.status).not.toBe(403);
    if (response.body.message) {
      expect(response.body.message).not.toContain('subscription is not active');
      expect(response.body.message).not.toContain('orders is not enabled');
    }
  });

  test('should reject order if merchant subscription is inactive', async () => {
    // Disable subscription
    await Merchant.findByIdAndUpdate(merchant._id, {
      isSubscriptionActive: false,
    });

    const orderPayload = {
      items: [
        {
          menuItemId: menuItem._id.toString(),
          name: 'QR Test Burger',
          quantity: 1,
          price: 150,
          subtotal: 150,
        },
      ],
      branchId: branch._id.toString(),
      table: 'T-QR-01',
      customerName: 'QR Guest',
      subtotal: 150,
      totalAmount: 150,
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(orderPayload);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('subscription is not active');
  });

  test('should reject order if merchant is inactive', async () => {
    // Deactivate merchant
    await Merchant.findByIdAndUpdate(merchant._id, {
      isActive: false,
    });

    const orderPayload = {
      items: [
        {
          menuItemId: menuItem._id.toString(),
          name: 'QR Test Burger',
          quantity: 1,
          price: 150,
          subtotal: 150,
        },
      ],
      branchId: branch._id.toString(),
      table: 'T-QR-01',
      customerName: 'QR Guest',
      subtotal: 150,
      totalAmount: 150,
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(orderPayload);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('not available');
  });

  test('should reject order if orders feature is disabled', async () => {
    // Disable orders feature
    await Merchant.findByIdAndUpdate(merchant._id, {
      'features.optional.orders.enabled': false, // ✅ Correct path
    });

    const orderPayload = {
      items: [
        {
          menuItemId: menuItem._id.toString(),
          name: 'QR Test Burger',
          quantity: 1,
          price: 150,
          subtotal: 150,
        },
      ],
      branchId: branch._id.toString(),
      table: 'T-QR-01',
      customerName: 'QR Guest',
      subtotal: 150,
      totalAmount: 150,
    };

    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send(orderPayload);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('orders is not enabled');
  });
});
