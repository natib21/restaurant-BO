/**
 * Quick test: Can QR customer GET their order?
 */

const mongoose = require('mongoose');
const Merchant = require('./models/merchantModel');
const CustomerSession = require('./models/customerSessionModule');
const Branch = require('./models/branchModel');
const Table = require('./models/tabelModel');
const Order = require('./models/orderModel');
const MenuItem = require('./src/modules/menu/model/MenuItem.model');

async function test() {
  try {
    // Connect to DB
    const dbUri = process.env.DATABASE_URI || 'mongodb://localhost:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB');

    // Create merchant with unique email
    const uniqueId = Date.now() + Math.random();
    const merchant = await Merchant.create({
      businessName: 'Test QR Restaurant',
      slug: `qr-test-${uniqueId}`,
      email: `qr-test-${uniqueId}@test.com`,
      phone: '+251911223344',
      status: 'approved',
      isActive: true,
      isSubscriptionActive: true,
      features: {
        core: { menu: { enabled: true } },
        optional: { orders: { enabled: true } },
      },
    });
    console.log('✅ Created merchant:', merchant._id);

    // Create branch
    const branch = await Branch.create({
      merchant: merchant._id,
      name: 'Main Branch',
      isActive: true,
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7469, 9.0320],
      },
    });
    console.log('✅ Created branch:', branch._id);

    // Create table
    const table = await Table.create({
      merchant: merchant._id,
      branch: branch._id,
      tableNumber: 'T-QR-TEST-01',
      capacity: 4,
      isActive: true,
    });
    console.log('✅ Created table:', table._id);

    // Create session
    const session = await CustomerSession.create({
      merchant: merchant._id,
      branch: branch._id,
      table: table._id,
      token: `test-token-${Date.now()}`,
      isActive: true,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    });
    console.log('✅ Created session:', session.token);

    // Create order
    const order = await Order.create({
      merchant: merchant._id,
      branch: branch._id,
      table: table._id,
      orderNumber: `TEST-${Date.now()}`,
      orderType: 'dine-in',
      items: [],
      subtotal: 0,
      totalAmount: 0,
      status: 'pending',
      source: 'qr-menu',
    });
    console.log('✅ Created order:', order._id);

    // Test API calls
    const fetch = require('node-fetch');
    
    // Test 1: GET order with session token (Bearer token)
    console.log('\n--- Test 1: GET order with session token ---');
    const response1 = await fetch(`http://localhost:8000/api/v1/orders/${order._id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    });
    console.log('Status:', response1.status);
    const body1 = await response1.json();
    console.log('Response:', JSON.stringify(body1, null, 2).substring(0, 500));

    if (response1.status === 200) {
      console.log('✅ SUCCESS: Customer can retrieve their order!');
    } else {
      console.log('❌ FAILED:', body1.message);
    }

    // Cleanup
    await Order.deleteMany({ merchant: merchant._id });
    await CustomerSession.deleteMany({ merchant: merchant._id });
    await Table.deleteMany({ merchant: merchant._id });
    await Branch.deleteMany({ merchant: merchant._id });
    await Merchant.deleteMany({ _id: merchant._id });
    console.log('\n✅ Cleanup complete');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

test();
