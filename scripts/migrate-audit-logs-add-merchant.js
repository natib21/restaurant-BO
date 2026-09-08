/**
 * Migrate Audit Logs - Add Merchant Field
 * 
 * Backfills the `merchant` field in existing audit logs for tenant isolation.
 * This is a one-time migration for Phase 2.
 * 
 * Usage: node scripts/migrate-audit-logs-add-merchant.js
 */

const mongoose = require('mongoose');
const AuditLog = require('../models/auditLogModel');
const User = require('../models/userModel');
const Order = require('../models/orderModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Menu = require('../models/menuModel');
const logger = require('../utils/logger');
require('dotenv').config({ path: './config.env' });

const DB = process.env.DATABASE.replace('<PASSWORD>', process.env.DATABASE_PASSWORD);

async function migrateAuditLogs() {
  try {
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Database connected successfully');
    console.log('🚀 Starting audit log migration...\n');

    // Find logs without merchant field
    const logsWithoutMerchant = await AuditLog.find({
      $or: [
        { merchant: null },
        { merchant: { $exists: false } }
      ]
    });

    console.log(`📊 Found ${logsWithoutMerchant.length} logs without merchant field\n`);

    if (logsWithoutMerchant.length === 0) {
      console.log('✅ No logs need migration. All logs have merchant field.');
      process.exit(0);
    }

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const log of logsWithoutMerchant) {
      try {
        let merchantId = null;

        // Strategy 1: Get from user
        if (log.user) {
          const user = await User.findById(log.user).select('merchant').lean();
          merchantId = user?.merchant;
        }

        // Strategy 2: Get from resource (if resource supports merchant lookup)
        if (!merchantId && log.resourceId && log.resource) {
          try {
            let resourceDoc = null;

            switch (log.resource) {
              case 'Order':
                resourceDoc = await Order.findById(log.resourceId).select('merchant').lean();
                break;

              case 'Merchant':
                // Resource IS the merchant
                merchantId = log.resourceId;
                break;

              case 'Branch':
                resourceDoc = await Branch.findById(log.resourceId).select('merchant').lean();
                break;

              case 'Menu':
                resourceDoc = await Menu.findById(log.resourceId).select('merchant').lean();
                break;

              // Add other resource types as needed
            }

            if (resourceDoc?.merchant) {
              merchantId = resourceDoc.merchant;
            }
          } catch (resourceError) {
            // Resource might have been deleted - skip
          }
        }

        // Strategy 3: Skip system-level operations
        if (!merchantId && ['LOGIN', 'LOGOUT', 'HEALTH_CHECK'].includes(log.action)) {
          console.log(`⊘ Skipping system operation log ${log._id} (action: ${log.action})`);
          skipped++;
          continue;
        }

        if (merchantId) {
          await AuditLog.updateOne(
            { _id: log._id },
            { $set: { merchant: merchantId } }
          );
          updated++;

          if (updated % 100 === 0) {
            console.log(`  ✓ Processed ${updated} logs...`);
          }
        } else {
          console.warn(`⚠ Could not determine merchant for log ${log._id} (action: ${log.action}, resource: ${log.resource})`);
          failed++;
        }
      } catch (error) {
        console.error(`❌ Error processing log ${log._id}:`, error.message);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   Total logs found:  ${logsWithoutMerchant.length}`);
    console.log(`   ✅ Updated:         ${updated}`);
    console.log(`   ⚠  Failed:          ${failed}`);
    console.log(`   ⊘  Skipped:         ${skipped}`);
    console.log('='.repeat(60));

    if (failed > 0) {
      console.log('\n⚠️  Some logs could not be migrated.');
      console.log('Review the logs above and consider manual intervention if needed.');
    }

    console.log('\n✅ Audit log migration completed!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    logger.error('audit-migration.failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  migrateAuditLogs();
}

module.exports = { migrateAuditLogs };
