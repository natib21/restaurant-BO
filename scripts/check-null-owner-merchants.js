const mongoose = require('mongoose');
const Merchant = require('../models/merchantModel');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

async function checkNullOwnerMerchants() {
  try {
    await connectDatabase();
    
    const count = await Merchant.countDocuments({ 'owner.email': null });
    console.log(`\nMerchants with null owner.email: ${count}`);
    
    if (count > 0) {
      const merchants = await Merchant.find({ 'owner.email': null }).select('businessName email slug createdAt');
      console.log('\nDetails:');
      merchants.forEach(m => {
        console.log(`  - ${m.businessName} (slug: ${m.slug}, created: ${m.createdAt})`);
      });
    }
    
    await disconnectDatabase();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkNullOwnerMerchants();
