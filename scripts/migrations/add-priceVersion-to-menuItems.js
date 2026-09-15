/**
 * @file scripts/migrations/add-priceVersion-to-menuItems.js
 * @description Migration script to backfill priceVersion field on existing menu items
 * 
 * Context:
 * - The priceVersion field was added to MenuItem schema for optimistic locking on price updates
 * - Existing documents in the database won't have this field (schema defaults only apply to new documents)
 * - This migration sets priceVersion: 0 on all menu items that don't have it
 * - This ensures the first price edit on pre-existing items behaves identically to new items
 * 
 * Usage:
 *   DRY RUN (count only):  node scripts/migrations/add-priceVersion-to-menuItems.js --dry-run
 *   ACTUAL UPDATE:         node scripts/migrations/add-priceVersion-to-menuItems.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Import MenuItem model
const MenuItem = require('../../src/modules/menu/model/MenuItem.model');

const isDryRun = process.argv.includes('--dry-run');

async function runMigration() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant-bo';
    console.log(`📡 Connecting to MongoDB: ${mongoUri}`);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB\n');

    // Count documents missing priceVersion field
    const missingVersionCount = await MenuItem.countDocuments({
      priceVersion: { $exists: false }
    });

    console.log(`📊 Migration Analysis:`);
    console.log(`   Total menu items missing priceVersion: ${missingVersionCount}`);

    if (missingVersionCount === 0) {
      console.log('\n✨ No migration needed - all menu items already have priceVersion field');
      await mongoose.connection.close();
      process.exit(0);
    }

    if (isDryRun) {
      console.log(`\n📋 DRY RUN MODE - No changes will be applied`);
      console.log(`   Would update: ${missingVersionCount} documents`);
      console.log(`   Setting: priceVersion = 0 on all items where field is missing\n`);
      
      // Show sample of documents that would be updated
      const samples = await MenuItem.find(
        { priceVersion: { $exists: false } }
      ).limit(3).select('_id merchant name price').lean();
      
      if (samples.length > 0) {
        console.log(`📌 Sample documents that would be updated:`);
        samples.forEach((item, idx) => {
          console.log(`   ${idx + 1}. ID: ${item._id}, Merchant: ${item.merchant}, Price: ${item.price}`);
        });
      }

      await mongoose.connection.close();
      process.exit(0);
    }

    // ✅ ACTUAL UPDATE
    console.log(`\n🔄 Updating ${missingVersionCount} documents...`);
    
    const result = await MenuItem.updateMany(
      { priceVersion: { $exists: false } },
      { $set: { priceVersion: 0 } },
      { multi: true }
    );

    console.log(`\n✅ Migration Complete:`);
    console.log(`   Documents matched: ${result.matchedCount}`);
    console.log(`   Documents modified: ${result.modifiedCount}`);
    
    if (result.modifiedCount === missingVersionCount) {
      console.log(`\n🎉 Success! All ${missingVersionCount} menu items now have priceVersion: 0`);
    } else {
      console.warn(`\n⚠️  Warning: Expected ${missingVersionCount} modifications, but got ${result.modifiedCount}`);
    }

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

runMigration();
