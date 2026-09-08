/**
 * Check if merchant is ready for QR customer orders
 * Run: node scripts/check-merchant-qr-readiness.js <merchantId>
 */

const mongoose = require('mongoose');
const Merchant = require('../models/merchantModel');

async function checkMerchantQRReadiness(merchantId) {
  try {
    await mongoose.connect(process.env.DATABASE_URI || 'mongodb://localhost:27017/MesobDb');
    console.log('✓ Connected to database\n');

    const merchant = await Merchant.findById(merchantId).select(
      'businessName isActive status isSubscriptionActive features'
    );

    if (!merchant) {
      console.error('❌ Merchant not found!');
      process.exit(1);
    }

    console.log('========================================');
    console.log('MERCHANT QR ORDER READINESS CHECK');
    console.log('========================================\n');

    console.log('Basic Info:');
    console.log(`  Name: ${merchant.businessName}`);
    console.log(`  ID: ${merchantId}\n`);

    console.log('Required Checks:');
    
    // Check 1: Merchant is active
    const isActive = merchant.isActive === true;
    console.log(`  ${isActive ? '✅' : '❌'} isActive: ${merchant.isActive}`);
    
    // Check 2: Merchant is approved
    const isApproved = merchant.status === 'approved';
    console.log(`  ${isApproved ? '✅' : '❌'} status: ${merchant.status}`);
    
    // Check 3: Subscription is active
    const hasSubscription = merchant.isSubscriptionActive === true;
    console.log(`  ${hasSubscription ? '✅' : '❌'} isSubscriptionActive: ${merchant.isSubscriptionActive}`);
    
    // Check 4: Orders feature enabled
    const hasOrdersFeature = merchant.features?.optional?.orders?.enabled === true;
    console.log(`  ${hasOrdersFeature ? '✅' : '❌'} features.optional.orders.enabled: ${merchant.features?.optional?.orders?.enabled}`);

    console.log('\nVirtual Properties:');
    console.log(`  hasActiveAccess: ${merchant.hasActiveAccess}`);
    console.log(`  hasFeature('orders'): ${merchant.hasFeature('orders')}`);

    console.log('\n========================================');
    
    const allChecks = isActive && isApproved && hasSubscription && hasOrdersFeature;
    
    if (allChecks) {
      console.log('✅ RESULT: Merchant is ready for QR orders!');
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.log('❌ RESULT: Merchant NOT ready for QR orders');
      console.log('========================================\n');
      
      console.log('Fix Commands:\n');
      
      if (!isActive) {
        console.log(`db.merchants.updateOne({ _id: ObjectId("${merchantId}") }, { $set: { isActive: true } })`);
      }
      if (!isApproved) {
        console.log(`db.merchants.updateOne({ _id: ObjectId("${merchantId}") }, { $set: { status: "approved" } })`);
      }
      if (!hasSubscription) {
        console.log(`db.merchants.updateOne({ _id: ObjectId("${merchantId}") }, { $set: { isSubscriptionActive: true } })`);
      }
      if (!hasOrdersFeature) {
        console.log(`db.merchants.updateOne({ _id: ObjectId("${merchantId}") }, { $set: { "features.optional.orders.enabled": true } })`);
      }
      
      console.log('\nOr run all at once:');
      console.log(`db.merchants.updateOne(
  { _id: ObjectId("${merchantId}") },
  { $set: {
      isActive: true,
      status: "approved",
      isSubscriptionActive: true,
      "features.optional.orders.enabled": true
    }
  }
)`);
      
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Get merchant ID from command line
const merchantId = process.argv[2];

if (!merchantId) {
  console.error('Usage: node scripts/check-merchant-qr-readiness.js <merchantId>');
  process.exit(1);
}

checkMerchantQRReadiness(merchantId);
