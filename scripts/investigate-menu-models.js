/**
 * PHASE 0: Menu Model Investigation Script
 * 
 * Purpose: Determine facts about Menu vs MenuItem collections before migration
 * 
 * This script answers:
 * 1. Are Menu and MenuItem separate MongoDB collections?
 * 2. How many documents exist in each?
 * 3. What fields exist on Menu but not on MenuItem?
 * 4. Is there overlapping/duplicate data?
 */

const mongoose = require('mongoose');
const { connectDatabase } = require('../src/common/database/connection');

// Import both models
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
let Menu;
try {
  Menu = require('../models/menuModel.js.old'); // Try old model
} catch (e) {
  console.log('⚠️  Legacy Menu model not found at models/menuModel.js.old');
}

async function investigateModels() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PHASE 0: Menu Model Investigation');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    await connectDatabase();
    console.log('✅ Connected to database\n');

    // 1. Check collection names
    console.log('───────────────────────────────────────────────────────────');
    console.log('1. COLLECTION NAMES');
    console.log('───────────────────────────────────────────────────────────');
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log('All collections in database:');
    collectionNames.forEach(name => console.log(`  - ${name}`));
    console.log();

    const hasMenus = collectionNames.includes('menus');
    const hasMenuItems = collectionNames.includes('menuitems');
    
    console.log('Menu-related collections:');
    console.log(`  - menus collection exists: ${hasMenus ? '✅ YES' : '❌ NO'}`);
    console.log(`  - menuitems collection exists: ${hasMenuItems ? '✅ YES' : '❌ NO'}`);
    console.log();

    // 2. Document counts
    console.log('───────────────────────────────────────────────────────────');
    console.log('2. DOCUMENT COUNTS');
    console.log('───────────────────────────────────────────────────────────');
    
    let menuCount = 0;
    let menuItemCount = 0;
    
    if (hasMenus) {
      menuCount = await mongoose.connection.db.collection('menus').countDocuments();
      console.log(`menus collection: ${menuCount} documents`);
    }
    
    if (hasMenuItems) {
      menuItemCount = await mongoose.connection.db.collection('menuitems').countDocuments();
      console.log(`menuitems collection: ${menuItemCount} documents`);
    }
    console.log();

    // 3. Sample documents to compare schemas
    console.log('───────────────────────────────────────────────────────────');
    console.log('3. SCHEMA COMPARISON');
    console.log('───────────────────────────────────────────────────────────');
    
    let menuSample = null;
    let menuItemSample = null;
    
    if (hasMenus && menuCount > 0) {
      menuSample = await mongoose.connection.db.collection('menus').findOne();
      console.log('Sample Menu document fields:');
      console.log(JSON.stringify(Object.keys(menuSample), null, 2));
      console.log();
    } else {
      console.log('No Menu documents to sample\n');
    }
    
    if (hasMenuItems && menuItemCount > 0) {
      menuItemSample = await mongoose.connection.db.collection('menuitems').findOne();
      console.log('Sample MenuItem document fields:');
      console.log(JSON.stringify(Object.keys(menuItemSample), null, 2));
      console.log();
    } else {
      console.log('No MenuItem documents to sample\n');
    }

    // 4. Fields that exist in Menu but not in MenuItem
    console.log('───────────────────────────────────────────────────────────');
    console.log('4. FIELDS UNIQUE TO EACH MODEL');
    console.log('───────────────────────────────────────────────────────────');
    
    if (menuSample && menuItemSample) {
      const menuFields = Object.keys(menuSample);
      const menuItemFields = Object.keys(menuItemSample);
      
      const onlyInMenu = menuFields.filter(f => !menuItemFields.includes(f));
      const onlyInMenuItem = menuItemFields.filter(f => !menuFields.includes(f));
      
      console.log('Fields ONLY in Menu (menus collection):');
      if (onlyInMenu.length > 0) {
        onlyInMenu.forEach(field => {
          console.log(`  - ${field}: ${typeof menuSample[field]} ${Array.isArray(menuSample[field]) ? '(array)' : ''}`);
        });
      } else {
        console.log('  (none)');
      }
      console.log();
      
      console.log('Fields ONLY in MenuItem (menuitems collection):');
      if (onlyInMenuItem.length > 0) {
        onlyInMenuItem.forEach(field => {
          console.log(`  - ${field}: ${typeof menuItemSample[field]} ${Array.isArray(menuItemSample[field]) ? '(array)' : ''}`);
        });
      } else {
        console.log('  (none)');
      }
      console.log();
    } else if (menuSample) {
      console.log('Only Menu documents exist. Key fields:');
      Object.keys(menuSample).forEach(field => {
        console.log(`  - ${field}: ${typeof menuSample[field]}`);
      });
      console.log();
    } else if (menuItemSample) {
      console.log('Only MenuItem documents exist. Key fields:');
      Object.keys(menuItemSample).forEach(field => {
        console.log(`  - ${field}: ${typeof menuItemSample[field]}`);
      });
      console.log();
    }

    // 5. Check for overlapping data
    console.log('───────────────────────────────────────────────────────────');
    console.log('5. DATA OVERLAP ANALYSIS');
    console.log('───────────────────────────────────────────────────────────');
    
    if (hasMenus && hasMenuItems && menuCount > 0 && menuItemCount > 0) {
      // Check if same IDs exist in both collections
      const menuIds = await mongoose.connection.db.collection('menus')
        .find({}, { projection: { _id: 1 } })
        .limit(100)
        .toArray();
      
      const menuItemIds = await mongoose.connection.db.collection('menuitems')
        .find({}, { projection: { _id: 1 } })
        .limit(100)
        .toArray();
      
      const menuIdSet = new Set(menuIds.map(d => d._id.toString()));
      const menuItemIdSet = new Set(menuItemIds.map(d => d._id.toString()));
      
      const overlap = [...menuIdSet].filter(id => menuItemIdSet.has(id));
      
      console.log(`Checked first 100 IDs from each collection:`);
      console.log(`  - Overlapping IDs found: ${overlap.length}`);
      
      if (overlap.length > 0) {
        console.log('  ⚠️  WARNING: Same _id exists in both collections');
        console.log('  This could indicate duplicate/conflicting data');
      } else {
        console.log('  ✅ No overlapping IDs (clean separation)');
      }
      console.log();
      
      // Check names for similarity
      if (menuSample && menuSample.name && menuItemSample && menuItemSample.name) {
        const menuNames = await mongoose.connection.db.collection('menus')
          .find({}, { projection: { name: 1 } })
          .limit(10)
          .toArray();
        
        const menuItemNames = await mongoose.connection.db.collection('menuitems')
          .find({}, { projection: { name: 1 } })
          .limit(10)
          .toArray();
        
        console.log('Sample Menu names:');
        menuNames.slice(0, 5).forEach(doc => {
          const name = typeof doc.name === 'object' ? doc.name.en : doc.name;
          console.log(`  - ${name}`);
        });
        console.log();
        
        console.log('Sample MenuItem names:');
        menuItemNames.slice(0, 5).forEach(doc => {
          const name = typeof doc.name === 'object' ? doc.name.en : doc.name;
          console.log(`  - ${name}`);
        });
        console.log();
      }
    } else {
      console.log('Cannot check overlap - one or both collections are empty\n');
    }

    // 6. Check merchants for each
    console.log('───────────────────────────────────────────────────────────');
    console.log('6. MERCHANT DISTRIBUTION');
    console.log('───────────────────────────────────────────────────────────');
    
    if (hasMenus && menuCount > 0) {
      const menuMerchants = await mongoose.connection.db.collection('menus')
        .aggregate([
          { $group: { _id: '$merchant', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray();
      
      console.log('Top merchants in menus collection:');
      menuMerchants.forEach(m => {
        console.log(`  - Merchant ${m._id}: ${m.count} items`);
      });
      console.log();
    }
    
    if (hasMenuItems && menuItemCount > 0) {
      const menuItemMerchants = await mongoose.connection.db.collection('menuitems')
        .aggregate([
          { $group: { _id: '$merchant', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray();
      
      console.log('Top merchants in menuitems collection:');
      menuItemMerchants.forEach(m => {
        console.log(`  - Merchant ${m._id}: ${m.count} items`);
      });
      console.log();
    }

    // 7. Summary and recommendations
    console.log('═══════════════════════════════════════════════════════════');
    console.log('SUMMARY & RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('Collection Status:');
    console.log(`  - menus: ${hasMenus ? 'EXISTS' : 'DOES NOT EXIST'} (${menuCount} docs)`);
    console.log(`  - menuitems: ${hasMenuItems ? 'EXISTS' : 'DOES NOT EXIST'} (${menuItemCount} docs)`);
    console.log();
    
    if (!hasMenus || menuCount === 0) {
      console.log('✅ SIMPLE SCENARIO: Legacy Menu collection is empty or absent');
      console.log('   Recommendation: No data migration needed');
      console.log('   Action: Proceed to migrate legacy code to use MenuItem model');
    } else if (!hasMenuItems || menuItemCount === 0) {
      console.log('⚠️  COMPLEX SCENARIO: Only legacy Menu collection has data');
      console.log('   Recommendation: Data migration required');
      console.log('   Action: Create migration script to convert Menu → MenuItem');
    } else {
      console.log('🔴 CRITICAL SCENARIO: Both collections have data');
      console.log('   Recommendation: Careful analysis required');
      console.log('   Action: Determine which is source of truth, merge or consolidate');
    }
    console.log();

  } catch (error) {
    console.error('❌ Error during investigation:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Investigation complete, database connection closed');
  }
}

// Run investigation
investigateModels().catch(console.error);
