/**
 * @file scripts/verify-counter-indexes.js
 * @description Verify Counter model indexes support branch-scoped order numbering by type
 * 
 * This script verifies that the Counter collection has the correct indexes
 * to support:
 * - Branch-scoped numbering (each branch has independent sequences)
 * - Order type-specific sequences (DI, TA, DL prefixes)
 * - Atomic counter increments (unique constraint prevents duplicates)
 */

const mongoose = require('mongoose');
const Counter = require('../models/CounterModel.js.js');

async function verifyCounterIndexes() {
  try {
    console.log('🔍 Verifying Counter model indexes...\n');

    // Connect to database
    const dbUri = process.env.DATABASE_URI || 'mongodb://localhost:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('✅ Connected to database\n');

    // Get existing indexes
    const indexes = await Counter.collection.getIndexes();
    
    console.log('📋 Current indexes on Counter collection:');
    console.log(JSON.stringify(indexes, null, 2));
    console.log('');

    // Verify continuous counter index
    const continuousCounterIndex = indexes['continuous_counter'];
    if (continuousCounterIndex) {
      console.log('✅ Continuous counter index exists');
      console.log('   - Keys:', JSON.stringify(continuousCounterIndex.key));
      console.log('   - Unique:', continuousCounterIndex.unique);
      console.log('   - Sparse:', continuousCounterIndex.sparse);
      console.log('   - Partial Filter:', JSON.stringify(continuousCounterIndex.partialFilterExpression));
    } else {
      console.log('❌ Continuous counter index NOT found');
    }
    console.log('');

    // Verify daily counter index (legacy/backward compatibility)
    const dailyCounterIndex = indexes['daily_counter'];
    if (dailyCounterIndex) {
      console.log('✅ Daily counter index exists (legacy support)');
      console.log('   - Keys:', JSON.stringify(dailyCounterIndex.key));
      console.log('   - Unique:', dailyCounterIndex.unique);
      console.log('   - Sparse:', dailyCounterIndex.sparse);
      console.log('   - Partial Filter:', JSON.stringify(dailyCounterIndex.partialFilterExpression));
    } else {
      console.log('⚠️  Daily counter index NOT found (legacy support)');
    }
    console.log('');

    // Check if indexes support our use case
    console.log('🔍 Verifying index support for order type prefixes...\n');

    if (continuousCounterIndex) {
      const hasCorrectKeys = 
        continuousCounterIndex.key.merchantId === 1 &&
        continuousCounterIndex.key.branchId === 1 &&
        continuousCounterIndex.key.prefix === 1;
      
      const isUnique = continuousCounterIndex.unique === true;
      const hasPartialFilter = continuousCounterIndex.partialFilterExpression?.date === null;

      if (hasCorrectKeys && isUnique && hasPartialFilter) {
        console.log('✅ Index correctly configured for branch + order type scoped numbering');
        console.log('   - Ensures uniqueness per (merchantId, branchId, prefix)');
        console.log('   - Prefix "DI", "TA", "DL" creates separate sequences');
        console.log('   - Each branch has independent sequences for each order type');
      } else {
        console.log('❌ Index configuration issues detected:');
        if (!hasCorrectKeys) console.log('   - Missing required keys (merchantId, branchId, prefix)');
        if (!isUnique) console.log('   - Not marked as unique');
        if (!hasPartialFilter) console.log('   - Missing partial filter for continuous numbering');
      }
    }
    console.log('');

    // Sample data check
    const sampleCounters = await Counter.find({ date: null }).limit(10).lean();
    if (sampleCounters.length > 0) {
      console.log('📊 Sample counter documents:');
      sampleCounters.forEach(c => {
        console.log(`   - Merchant: ${c.merchantId}, Branch: ${c.branchId}, Prefix: ${c.prefix}, Seq: ${c.seq}`);
      });
    } else {
      console.log('ℹ️  No counter documents found (new installation)');
    }
    console.log('');

    // Summary
    console.log('📝 Summary:');
    console.log('   Order Type → Prefix Mapping:');
    console.log('   - dine_in  → DI');
    console.log('   - takeaway → TA');
    console.log('   - delivery → DL');
    console.log('');
    console.log('   Index ensures:');
    console.log('   - No duplicate order numbers within same (merchant, branch, orderType)');
    console.log('   - Different branches can have identical order numbers');
    console.log('   - Different merchants can have identical order numbers');
    console.log('   - Each order type has independent sequence');
    console.log('');

    console.log('✅ Verification complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run verification
if (require.main === module) {
  verifyCounterIndexes()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { verifyCounterIndexes };
