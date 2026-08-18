/**
 * Activate merchant subscription
 * 
 * Updates merchant to have active subscription access
 * Usage: node scripts/activate-merchant-subscription.js <merchantId>
 */

const mongoose = require('mongoose');
const Merchant = require('../models/merchantModel');

async function activateMerchantSubscription(merchantId) {
  try {
    // Connect to production database
    const dbUri = process.env.DATABASE || 'mongodb://127.0.0.1:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('✅ Connected to database:', mongoose.connection.name);

    if (!merchantId) {
      console.log('\n=== Listing all merchants ===');
      const merchants = await Merchant.find()
        .select('businessName status isActive isSubscriptionActive')
        .lean();
      
      if (merchants.length === 0) {
        console.log('No merchants found in database');
      } else {
        merchants.forEach(m => {
          console.log(`\nID: ${m._id}`);
          console.log(`  Business: ${m.businessName}`);
          console.log(`  Status: ${m.status}`);
          console.log(`  isActive: ${m.isActive}`);
          console.log(`  isSubscriptionActive: ${m.isSubscriptionActive}`);
        });
        
        console.log('\n\nTo activate a merchant, run:');
        console.log('node scripts/activate-merchant-subscription.js <merchantId>');
      }
      
      await mongoose.disconnect();
      return;
    }

    // Find merchant
    const merchant = await Merchant.findById(merchantId);
    
    if (!merchant) {
      console.error(`❌ Merchant with ID ${merchantId} not found`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`\n=== Current Status ===`);
    console.log(`Business Name: ${merchant.businessName}`);
    console.log(`Status: ${merchant.status}`);
    console.log(`isActive: ${merchant.isActive}`);
    console.log(`isSubscriptionActive: ${merchant.isSubscriptionActive}`);
    console.log(`hasActiveAccess: ${merchant.hasActiveAccess}`);

    // Update merchant - activate subscription and ALL features
    merchant.status = 'approved';
    merchant.isActive = true;
    merchant.isSubscriptionActive = true;
    
    // Enable all optional features
    if (!merchant.features) merchant.features = {};
    if (!merchant.features.optional) merchant.features.optional = {};
    
    merchant.features.optional.orders = { enabled: true };
    merchant.features.optional.inventory = { enabled: true };
    merchant.features.optional.multiBranch = { enabled: true };
    merchant.features.optional.telegram = { enabled: true };
    merchant.features.optional.sales = { enabled: true };
    merchant.features.optional.reports = { enabled: true };
    merchant.features.optional.customerManagement = { enabled: true };
    merchant.features.optional.deliveryManagement = { enabled: true };
    merchant.features.optional.paymentIntegration = { enabled: true };
    merchant.features.optional.restaurantWebsite = { enabled: true };
    
    await merchant.save();

    console.log(`\n=== Updated Status ===`);
    console.log(`Status: ${merchant.status}`);
    console.log(`isActive: ${merchant.isActive}`);
    console.log(`isSubscriptionActive: ${merchant.isSubscriptionActive}`);
    console.log(`hasActiveAccess: ${merchant.hasActiveAccess}`);
    
    console.log(`\n=== Enabled Features ===`);
    console.log(`Orders: ${merchant.features.optional.orders?.enabled}`);
    console.log(`Inventory: ${merchant.features.optional.inventory?.enabled}`);
    console.log(`Reports: ${merchant.features.optional.reports?.enabled}`);
    console.log(`Customer Management: ${merchant.features.optional.customerManagement?.enabled}`);
    console.log(`Multi-Branch: ${merchant.features.optional.multiBranch?.enabled}`);
    console.log(`Delivery: ${merchant.features.optional.deliveryManagement?.enabled}`);
    console.log(`Telegram: ${merchant.features.optional.telegram?.enabled}`);
    console.log(`Sales: ${merchant.features.optional.sales?.enabled}`);
    console.log(`Payment Integration: ${merchant.features.optional.paymentIntegration?.enabled}`);
    console.log(`Restaurant Website: ${merchant.features.optional.restaurantWebsite?.enabled}`);
    
    console.log(`\n✅ Merchant subscription and ALL features activated successfully!`);

    await mongoose.disconnect();
    console.log('✅ Disconnected');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Get merchantId from command line arguments
const merchantId = process.argv[2];

activateMerchantSubscription(merchantId);
