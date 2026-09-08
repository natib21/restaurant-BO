/**
 * @file scripts/migrate-counter-indexes.js
 * @description Create/update Counter collection indexes for order type-based numbering
 * 
 * This migration ensures the Counter collection has the correct indexes to support:
 * - Branch-scoped order numbering by type (DI, TA, DL)
 * - Atomic counter increments with no duplicates
 * - Backward compatibility with daily counters
 */

const mongoose = require('mongoose');

async function migrateCounterIndexes() {
  try {
    console.log('🔄 Migrating Counter collection indexes...\n');

    // Connect to database
    const dbUri = process.env.DATABASE_URI || 'mongodb://localhost:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('✅ Connected to database\n');

    const db = mongoose.connection.db;
    const countersCollection = db.collection('counters');

    // Get existing indexes
    console.log('📋 Checking existing indexes...');
    const existingIndexes = await countersCollection.indexes();
    console.log(`   Found ${existingIndexes.length} existing indexes\n`);

    // Drop old indexes if they exist (except _id_)
    console.log('🗑️  Cleaning up old indexes...');
    for (const index of existingIndexes) {
      if (index.name !== '_id_' && 
          index.name !== 'continuous_counter' && 
          index.name !== 'daily_counter') {
        console.log(`   Dropping: ${index.name}`);
        try {
          await countersCollection.dropIndex(index.name);
        } catch (err) {
          console.log(`   ⚠️  Could not drop ${index.name}: ${err.message}`);
        }
      }
    }
    console.log('');

    // Create continuous counter index
    console.log('📝 Creating continuous_counter index...');
    console.log('   Purpose: Branch-scoped order numbering by type');
    console.log('   Keys: { merchantId: 1, branchId: 1, prefix: 1 }');
    console.log('   Unique: true');
    console.log('   Partial Filter: { date: null }');
    
    try {
      await countersCollection.createIndex(
        { merchantId: 1, branchId: 1, prefix: 1 },
        {
          name: 'continuous_counter',
          unique: true,
          partialFilterExpression: { date: null },
        }
      );
      console.log('   ✅ continuous_counter index created\n');
    } catch (err) {
      if (err.code === 85) {
        console.log('   ℹ️  Index already exists\n');
      } else {
        throw err;
      }
    }

    // Create daily counter index (backward compatibility)
    console.log('📝 Creating daily_counter index (legacy support)...');
    console.log('   Purpose: Daily reset counters (if needed)');
    console.log('   Keys: { merchantId: 1, branchId: 1, date: 1, prefix: 1 }');
    console.log('   Unique: true');
    console.log('   Partial Filter: { date: { $exists: true, $type: "string" } }');
    
    try {
      await countersCollection.createIndex(
        { merchantId: 1, branchId: 1, date: 1, prefix: 1 },
        {
          name: 'daily_counter',
          unique: true,
          partialFilterExpression: { date: { $exists: true, $type: 'string' } },
        }
      );
      console.log('   ✅ daily_counter index created\n');
    } catch (err) {
      if (err.code === 85) {
        console.log('   ℹ️  Index already exists\n');
      } else {
        throw err;
      }
    }

    // Verify final state
    console.log('🔍 Verifying final index configuration...');
    const finalIndexes = await countersCollection.indexes();
    console.log(`   Total indexes: ${finalIndexes.length}`);
    
    const hasContinuous = finalIndexes.some(idx => idx.name === 'continuous_counter');
    const hasDaily = finalIndexes.some(idx => idx.name === 'daily_counter');
    
    if (hasContinuous) {
      console.log('   ✅ continuous_counter exists');
    } else {
      console.log('   ❌ continuous_counter missing');
    }
    
    if (hasDaily) {
      console.log('   ✅ daily_counter exists');
    } else {
      console.log('   ⚠️  daily_counter missing');
    }
    console.log('');

    // Summary
    console.log('📊 Migration Summary:');
    console.log('');
    console.log('   The Counter collection now supports:');
    console.log('   ✅ Branch-scoped order numbering');
    console.log('   ✅ Order type-specific sequences (DI, TA, DL)');
    console.log('   ✅ Atomic counter increments (no duplicates)');
    console.log('   ✅ Multi-tenant isolation (by merchantId)');
    console.log('   ✅ Independent branch sequences');
    console.log('');
    console.log('   Example counter documents:');
    console.log('   { merchantId: "...", branchId: "...", prefix: "DI", seq: 1, date: null }');
    console.log('   { merchantId: "...", branchId: "...", prefix: "TA", seq: 1, date: null }');
    console.log('   { merchantId: "...", branchId: "...", prefix: "DL", seq: 1, date: null }');
    console.log('');
    console.log('   Each (merchantId, branchId, prefix) combination is unique');
    console.log('   Result: #DI-000001, #TA-000001, #DL-000001 per branch');
    console.log('');

    console.log('✅ Migration complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run migration
if (require.main === module) {
  migrateCounterIndexes()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrateCounterIndexes };
