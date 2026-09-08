/**
 * Exact customer QR GET order test - matching user's real request
 */

const mongoose = require('mongoose');
const fetch = require('node-fetch');

const Merchant = require('./models/merchantModel');
const CustomerSession = require('./models/customerSessionModule');
const Branch = require('./models/branchModel');
const Table = require('./models/tabelModel');
const Order = require('./models/orderModel');

async function test() {
  try {
    // Connect to DB
    await mongoose.connect(process.env.DATABASE_URI || 'mongodb://localhost:27017/MesobDb');
    console.log('✅ Connected to MongoDB\n');

    // Create merchant
    const uniqueId = Date.now().toString().slice(-6);
    const merchant = await Merchant.create({
      businessName: 'QR Test Restaurant',
      slug: `qr-${uniqueId}`,
      email: `qr-${uniqueId}@test.com`,
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
      tableNumber: 'T-02',
      capacity: 4,
      isActive: true,
    });
    console.log('✅ Created table:', table._id);

    // Create session
    const session = await CustomerSession.create({
      merchant: merchant._id,
      branch: branch._id,
      table: table._id,
      token: `qr-token-${uniqueId}`,
      isActive: true,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    });
    console.log('✅ Created session:', session.token);

    // Create order
    const order = await Order.create({
      merchant: merchant._id,
      branch: branch._id,
      table: table._id,
      orderNumber: `QR-${uniqueId}`,
      orderType: 'dine-in',
      items: [],
      subtotal: 300,
      totalAmount: 300,
      status: 'pending',
      source: 'qr-menu',
    });
    console.log('✅ Created order:', order._id);

    // Wait 2 seconds for server to be ready
    console.log('\n⏳ Waiting for server to be ready...');
    await new Promise(r => setTimeout(r, 2000));

    // Make the exact customer GET request
    console.log('\n📤 Making GET request...');
    console.log(`GET http://localhost:8000/api/v1/orders/${order._id}`);
    console.log(`Authorization: Bearer ${session.token}\n`);

    const response = await fetch(`http://localhost:8000/api/v1/orders/${order._id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
    });

    const body = await response.json();

    console.log(`📥 Response Status: ${response.status}\n`);
    console.log('📥 Response Body:');
    console.log(JSON.stringify(body, null, 2));

    if (response.status === 200 && body.success) {
      console.log('\n✅ SUCCESS! Customer can GET their order!');
      console.log('✅ dualAuth middleware is working correctly!');
    } else {
      console.log('\n❌ FAILED');
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
    process.exit(1);
  }
}

test();
