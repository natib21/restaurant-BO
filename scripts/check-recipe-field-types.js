/**
 * Script to check MenuItem.recipe field types
 * Identifies documents where recipe is an ObjectId vs an object
 */

const mongoose = require('mongoose');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
require('dotenv').config();

async function checkRecipeFieldTypes() {
  try {
    const dbUri = process.env.DATABASE_URI || process.env.DB_URI || 'mongodb://localhost:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('Connected to database');

    // Get all menu items
    const items = await MenuItem.find({}).select('_id name recipe').lean();

    console.log(`\nTotal menu items: ${items.length}\n`);

    let objectIdCount = 0;
    let objectCount = 0;
    let nullCount = 0;

    const objectIdItems = [];
    const objectItems = [];

    for (const item of items) {
      if (!item.recipe) {
        nullCount++;
      } else if (mongoose.Types.ObjectId.isValid(item.recipe) && typeof item.recipe === 'object' && item.recipe._bsontype === 'ObjectID') {
        // It's an ObjectId
        objectIdCount++;
        objectIdItems.push({
          _id: item._id,
          name: item.name,
          recipe: item.recipe,
        });
      } else if (typeof item.recipe === 'object') {
        // It's an object
        objectCount++;
        objectItems.push({
          _id: item._id,
          name: item.name,
          hasIngredients: !!item.recipe.ingredients,
        });
      }
    }

    console.log('Recipe field types:');
    console.log(`  ObjectId (old format): ${objectIdCount}`);
    console.log(`  Object (new format): ${objectCount}`);
    console.log(`  Null/undefined: ${nullCount}\n`);

    if (objectIdCount > 0) {
      console.log('\n⚠️ Menu items with ObjectId recipe (need migration):');
      objectIdItems.forEach(item => {
        console.log(`  - ${item.name?.en || item.name} (${item._id})`);
      });
    }

    if (objectCount > 0) {
      console.log(`\n✅ ${objectCount} menu items already have object recipe format`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

checkRecipeFieldTypes();
