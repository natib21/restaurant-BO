/**
 * Verification Script: Order Collection Indexes
 * 
 * This script verifies that all required indexes for advanced reporting
 * have been created on the Order collection.
 * 
 * Usage:
 *   node scripts/verify-order-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const DB_URI = process.env.DATABASE.replace('<password>', process.env.DATABASE_PASSWORD);

async function verifyIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the Order collection
    const Order = mongoose.model('Order');
    const indexes = await Order.collection.getIndexes();

    console.log('\n📊 Current Indexes on Order Collection:\n');
    console.log(JSON.stringify(indexes, null, 2));

    // Check for required indexes
    const requiredIndexes = [
      { merchant: 1, paymentStatus: 1, placedAt: -1 },
      { merchant: 1, branch: 1, placedAt: -1 }
    ];

    console.log('\n🔍 Checking Required Indexes for Advanced Reporting:\n');

    let allIndexesPresent = true;

    for (const requiredIndex of requiredIndexes) {
      const indexKey = JSON.stringify(requiredIndex);
      const indexExists = Object.values(indexes).some(index => {
        return JSON.stringify(index.key) === indexKey;
      });

      if (indexExists) {
        console.log(`✅ Index found: ${indexKey}`);
      } else {
        console.log(`❌ Index MISSING: ${indexKey}`);
        allIndexesPresent = false;
      }
    }

    if (allIndexesPresent) {
      console.log('\n✅ All required indexes are present!');
    } else {
      console.log('\n⚠️  Some indexes are missing. They will be created on next app startup.');
      console.log('💡 To create indexes immediately, restart your application or run:');
      console.log('   Order.createIndexes()');
    }

    // Display index statistics
    console.log('\n📈 Index Statistics:\n');
    const stats = await Order.collection.stats();
    console.log(`Total documents: ${stats.count}`);
    console.log(`Total indexes: ${stats.nindexes}`);
    console.log(`Total index size: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run verification
verifyIndexes();
