/**
 * Seed Kitchen Stations
 * 
 * Creates/updates the MAIN kitchen station for each merchant/branch.
 * Idempotent - safe to run multiple times.
 * 
 * Usage: node scripts/seed-kitchen-stations.js
 */

const mongoose = require('mongoose');
const KitchenStation = require('../models/KitchenStation');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
require('dotenv').config({ path: './config.env' });

const DB = process.env.DATABASE.replace('<PASSWORD>', process.env.DATABASE_PASSWORD);

async function seedKitchenStations() {
  try {
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Database connected successfully');

    // Get all merchants
    const merchants = await Merchant.find({});
    console.log(`📊 Found ${merchants.length} merchant(s)`);

    if (merchants.length === 0) {
      console.log('⚠️  No merchants found. Please create merchants first.');
      process.exit(0);
    }

    let stationsCreated = 0;
    let stationsUpdated = 0;

    for (const merchant of merchants) {
      // Get all branches for this merchant
      const branches = await Branch.find({ merchant: merchant._id });
      console.log(`\n🏢 Merchant: ${merchant.name} - ${branches.length} branch(es)`);

      for (const branch of branches) {
        // Create or update MAIN station
        const result = await KitchenStation.findOneAndUpdate(
          {
            merchant: merchant._id,
            branch: branch._id,
            code: 'MAIN',
          },
          {
            merchant: merchant._id,
            branch: branch._id,
            code: 'MAIN',
            name: 'Main Kitchen',
            description: 'Main kitchen preparation area',
            isActive: true,
            displayOrder: 1,
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

        if (result.isNew === false && result.updatedAt) {
          console.log(`   ✓ Updated MAIN station for branch: ${branch.name}`);
          stationsUpdated++;
        } else {
          console.log(`   + Created MAIN station for branch: ${branch.name}`);
          stationsCreated++;
        }

        console.log(`     Station ID: ${result._id}`);
        console.log(`     Code: ${result.code}`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Created: ${stationsCreated} station(s)`);
    console.log(`   Updated: ${stationsUpdated} station(s)`);
    console.log(`   Total:   ${stationsCreated + stationsUpdated} station(s)`);
    console.log('='.repeat(50));
    console.log('\n✅ Kitchen station seeding completed successfully!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding kitchen stations:', error);
    process.exit(1);
  }
}

// Run the seeder
if (require.main === module) {
  seedKitchenStations();
}

module.exports = { seedKitchenStations };
