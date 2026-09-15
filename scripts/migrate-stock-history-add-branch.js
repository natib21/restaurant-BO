/**
 * @file scripts/migrate-stock-history-add-branch.js
 * @description Migration to backfill branch context on existing StockHistory records
 * 
 * For existing stock movements without branch field, this script:
 * 1. Tries to infer branch from related Order (if stockMovement.reference is an Order ID)
 * 2. Falls back to merchant default branch (if only one exists)
 * 3. Leaves branch null if ambiguous (manual review needed)
 * 
 * Execution:
 *   node scripts/migrate-stock-history-add-branch.js [--dry-run]
 */

const mongoose = require('mongoose');
const StockHistory = require('../models/StockHistory');
const Order = require('../models/orderModel');
const Branch = require('../models/Branch');

async function migrateStockHistory() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('🔄 StockHistory Migration: Add branch context\n');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE UPDATE'}`);
  console.log('');

  try {
    // Connect
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant-bo');
    console.log('✅ Connected to MongoDB\n');

    // Find stock history records without branch
    const recordsWithoutBranch = await StockHistory.find({ branch: { $exists: false } }).lean();
    console.log(`📊 Found ${recordsWithoutBranch.length} StockHistory records without branch\n`);

    let updatedCount = 0;
    let ambiguousCount = 0;

    for (const record of recordsWithoutBranch) {
      let branchId = null;

      // Strategy 1: Try to infer from reference (if it's an Order ID)
      if (record.reference) {
        try {
          // Check if reference is a valid ObjectId
          if (mongoose.Types.ObjectId.isValid(record.reference)) {
            // Try to find an order with this ID
            const order = await Order.findById(record.reference).lean();
            if (order && order.branch) {
              branchId = order.branch;
              console.log(`  ✓ Inferred branch from Order ${record.reference}`);
            }
          }
        } catch (e) {
          // Reference is not an ObjectId, skip
        }
      }

      // Strategy 2: If no branch found, try default branch for merchant
      if (!branchId) {
        const branches = await Branch.find({ merchant: record.merchant }).lean();
        if (branches.length === 1) {
          branchId = branches[0]._id;
          console.log(`  ✓ Using default (only) branch for merchant`);
        } else if (branches.length > 1) {
          console.warn(
            `  ⚠️  StockHistory ${record._id}: ${branches.length} branches found, ambiguous. Leaving blank.`
          );
          ambiguousCount++;
          continue;
        } else {
          console.warn(`  ⚠️  StockHistory ${record._id}: No branches found for merchant`);
          ambiguousCount++;
          continue;
        }
      }

      // Apply update
      if (!isDryRun && branchId) {
        await StockHistory.updateOne(
          { _id: record._id },
          { $set: { branch: branchId } }
        );
      }

      updatedCount++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Updated:               ${updatedCount}`);
    console.log(`Ambiguous (no change): ${ambiguousCount}`);
    console.log(`Total:                 ${recordsWithoutBranch.length}`);
    console.log('='.repeat(60));

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN MODE: No changes were applied.\n');
      console.log('To apply migrations, run without --dry-run flag:');
      console.log('  node scripts/migrate-stock-history-add-branch.js\n');
    } else {
      console.log('\n✅ Migration complete!\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

migrateStockHistory();
