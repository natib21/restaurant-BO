/**
 * Test: Customer QR Order Retrieval (GET /:id)
 * 
 * Verifies that QR customers can retrieve their orders.
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
const Order = require('../models/orderModel');

describe('Customer QR Order Retrieval', () => {
  let app, merchant, branch, table, menuItem, sessionToken, createdOrder;

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Test QR Restaurant',
      slug: `qr-test-${Date.now()}`,
      email: `qr-test-${Date.now()}@test.com`,
      phone: '+251911223344',
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true,
      features: {
        core: { menu: { enabled: true } },
        optional: { orders: { enabled: true } },
      },
    });

    // Create branch
    branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch',
      isActive: true,
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7469, 9.0320],
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
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    });

    sessionToken = session.token;

    // Create an order for this session
    createdOrder = await Order.create({
      merchant: merchant._id,
      branch: branch._id,
      table: table._id,
      orderNumber: `QR-${Date.now()}`,
      orderType: 'dine-in',
      items: [
        {
          menu: menuItem._id,
          quantity: 2,
          price: 150,
          subtotal: 300,
        },
      ],
      subtotal: 300,
      totalAmount: 300,
      status: 'pending',
      source: 'qr-menu',
    });
  });

  afterEach(async () => {
    await Order.deleteMany({ merchant: merchant?._id });
    await CustomerSession.deleteMany({ merchant: merchant?._id });
    await MenuItem.deleteMany({ merchant: merchant?._id });
    await Table.deleteMany({ merchant: merchant?._id });
    await Branch.deleteMany({ merchant: merchant?._id });
    const Category = require('../models/Category');
    await Category.deleteMany({ merchant: merchant?._id });
    await Merchant.deleteMany({ _id: merchant?._id });
  });

  test('should allow QR customer to retrieve their order', async () => {
    const response = await request(app)
      .get(`/api/v1/orders/${createdOrder._id.toString()}`)
      .set('Authorization', `Bearer ${sessionToken}`);

    console.log('GET Order Response:', response.status, response.body?.success);

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(response.body.success).toBe(true);
    expect(response.body.data.order._id).toBe(createdOrder._id.toString());
  });

  test('should reject if customer tries to access another table\'s order', async () => {
    // Create another table and order
    const otherTable = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      tableNumber: 'T-OTHER',
      capacity: 4,
      isActive: true,
    });

    const otherOrder = await Order.create({
      merchant: merchant._id,
      branch: branch._id,
      table: otherTable._id,
      orderNumber: `QR-OTHER-${Date.now()}`,
      orderType: 'dine-in',
      items: [],
      subtotal: 0,
      totalAmount: 0,
      status: 'pending',
      source: 'qr-menu',
    });

    const response = await request(app)
      .get(`/api/v1/orders/${otherOrder._id.toString()}`)
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    await otherTable.deleteOne();
    await otherOrder.deleteOne();
  });
});
