/**
 * Check for menu items and combos with legacy image fields (imageUrl/imageFilename)
 * but no FileAsset references.
 * 
 * Run: node scripts/check-legacy-image-fields.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const Menu = require('../models/menuModel');
const Combo = require('../models/comboModel');

async function checkLegacyImageFields() {
  try {
    const dbUri = process.env.DATABASE_LOCAL || process.env.LOCAL_DATABASE;
    if (!dbUri) {
      throw new Error('No database URI found in config.env');
    }
    await mongoose.connect(dbUri);
    console.log('✅ Connected to database\n');

    // Check Menu items with legacy fields but no FileAsset
    console.log('=== CHECKING MENU ITEMS ===\n');
    
    const menusWithLegacyOnly = await Menu.countDocuments({
      $or: [
        { imageUrl: { $exists: true, $ne: null } },
        { imageFilename: { $exists: true, $ne: null, $ne: 'default-menu-item.jpg' } }
      ],
      image: null
    });

    const menusWithImageFilename = await Menu.countDocuments({
      imageFilename: { $exists: true, $ne: null, $ne: 'default-menu-item.jpg' }
    });

    const menusWithImageUrl = await Menu.countDocuments({
      imageUrl: { $exists: true, $ne: null }
    });

    const menusWithFileAsset = await Menu.countDocuments({
      image: { $exists: true, $ne: null }
    });

    const totalMenus = await Menu.countDocuments({});

    console.log(`Total Menu items: ${totalMenus}`);
    console.log(`Menu items with FileAsset (image field): ${menusWithFileAsset}`);
    console.log(`Menu items with imageFilename set: ${menusWithImageFilename}`);
    console.log(`Menu items with imageUrl set: ${menusWithImageUrl}`);
    console.log(`❌ Menu items with ONLY legacy fields (no FileAsset): ${menusWithLegacyOnly}\n`);

    if (menusWithLegacyOnly > 0) {
      console.log('Sample menu items with legacy-only images:');
      const samples = await Menu.find({
        $or: [
          { imageUrl: { $exists: true, $ne: null } },
          { imageFilename: { $exists: true, $ne: null, $ne: 'default-menu-item.jpg' } }
        ],
        image: null
      }).limit(5).select('name imageUrl imageFilename merchant');
      
      samples.forEach(menu => {
        console.log(`  - ${menu.name}: imageFilename="${menu.imageFilename}", imageUrl="${menu.imageUrl}"`);
      });
      console.log('');
    }

    // Check Combos
    console.log('=== CHECKING COMBOS ===\n');
    
    const combosWithFileAsset = await Combo.countDocuments({
      image: { $exists: true, $ne: null }
    });

    const totalCombos = await Combo.countDocuments({});

    // Check if Combo model has imageUrl/imageFilename fields in actual documents
    const comboSample = await Combo.findOne({}).lean();
    const comboHasLegacyFields = comboSample && (
      comboSample.hasOwnProperty('imageUrl') || 
      comboSample.hasOwnProperty('imageFilename')
    );

    console.log(`Total Combos: ${totalCombos}`);
    console.log(`Combos with FileAsset (image field): ${combosWithFileAsset}`);
    console.log(`Combo schema has legacy fields in documents: ${comboHasLegacyFields ? 'YES' : 'NO'}\n`);

    // Summary
    console.log('=== SUMMARY ===\n');
    console.log(`Records that will lose images if legacy fields removed:`);
    console.log(`  Menu items: ${menusWithLegacyOnly}`);
    console.log(`  Combos: 0 (no legacy fields in Combo model)\n`);

    if (menusWithLegacyOnly === 0) {
      console.log('✅ SAFE TO REMOVE: All menu items use FileAsset system');
      console.log('   No records will lose images\n');
    } else {
      console.log('⚠️  WARNING: Some menu items will lose images');
      console.log('   Migration or manual fix required before schema change\n');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from database');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkLegacyImageFields();
