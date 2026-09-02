/**
 * Debug script to find recipe field structure conflicts
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const dbUri = process.env.DATABASE_URI || 'mongodb://localhost:27017/MesobDb';
console.log('Connecting to:', dbUri);

const MenuItem = require('./src/modules/menu/model/MenuItem.model');

async function debugRecipeStructure() {
  try {
    await mongoose.connect(dbUri);
    console.log('Connected to MongoDB\n');

    // Find all menu items and check their recipe field structure
    const items = await MenuItem.find({}).lean().limit(10);

    console.log('Sample menu items with their recipe structure:\n');
    
    for (const item of items) {
      console.log(`MenuItem: ${item._id}`);
      console.log(`  Name: ${item.name?.en || item.name || 'N/A'}`);
      console.log(`  Recipe type: ${typeof item.recipe}`);
      console.log(`  Recipe value: ${JSON.stringify(item.recipe)}`);
      console.log();
    }

    // Check for documents with recipe as ObjectId
    console.log('='.repeat(80));
    console.log('Checking for problematic recipe structures...\n');

    const recipeAsId = await MenuItem.find({
      recipe: { $type: 'objectId' }
    }).lean();

    console.log(`Documents with recipe as ObjectId: ${recipeAsId.length}`);
    if (recipeAsId.length > 0) {
      console.log('Examples:');
      recipeAsId.slice(0, 3).forEach(item => {
        console.log(`  - ${item._id}: recipe = ${item.recipe}`);
      });
    }

    const recipeAsObject = await MenuItem.find({
      recipe: { $type: 'object' }
    }).lean();

    console.log(`\nDocuments with recipe as object: ${recipeAsObject.length}`);
    if (recipeAsObject.length > 0) {
      console.log('Examples:');
      recipeAsObject.slice(0, 3).forEach(item => {
        console.log(`  - ${item._id}: recipe = ${JSON.stringify(item.recipe)}`);
      });
    }

    // Find the item causing the error
    const errorItemId = '6a96b06d1f523c349fe71e4e';
    const errorItem = await MenuItem.findById(errorItemId).lean();
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Menu item from error: ${errorItemId}\n`);
    console.log(JSON.stringify(errorItem, null, 2));

    await mongoose.connection.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

debugRecipeStructure();
