// Check if menu items now have kitchen stations
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const MenuItem = require('./src/modules/menu/model/MenuItem.model');

async function checkMenuStations() {
  try {
    await mongoose.connect(process.env.LOCAL_DATABASE);
    console.log('✅ Connected\n');

    const menuItems = await MenuItem.find({ deletedAt: null })
      .select('name kitchenStation requiresKitchen')
      .lean();

    console.log(`Found ${menuItems.length} active menu items\n`);
    console.log('='.repeat(70));

    let withStation = 0;
    let withoutStation = 0;

    menuItems.forEach(item => {
      const name = item.name?.en || item.name || 'Unnamed';
      const station = item.kitchenStation || 'NONE';
      const requires = item.requiresKitchen !== false; // default true
      
      if (item.kitchenStation) withStation++;
      else withoutStation++;

      const icon = item.kitchenStation ? '✅' : '❌';
      console.log(`${icon} ${name}`);
      console.log(`   Station: ${station}`);
      console.log(`   Requires Kitchen: ${requires}`);
      console.log('');
    });

    console.log('='.repeat(70));
    console.log('\nSUMMARY:');
    console.log(`  Menu items with stations: ${withStation}`);
    console.log(`  Menu items without stations: ${withoutStation}`);
    
    if (withoutStation > 0) {
      console.log('\n⚠️  WARNING: Some items need kitchen but have no station');
      console.log('   These items will NOT create KDS tickets');
      console.log('   Solution: Assign kitchenStation in seed-menu-data.js');
    } else {
      console.log('\n✅ All menu items have kitchen stations assigned!');
      console.log('   New orders should create tickets properly');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkMenuStations();
