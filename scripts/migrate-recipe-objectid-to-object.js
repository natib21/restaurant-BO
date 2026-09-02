/**
 * Migrate MenuItem.recipe from ObjectId to object format
 * 
 * OLD: recipe: ObjectId("...")
 * NEW: recipe: { ingredients: [] }
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function migrateRecipeField() {
  try {
    const dbUri = process.env.DATABASE_URI || process.env.DB_URI || 'mongodb://localhost:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('Connected to database\n');

    const db = mongoose.connection.db;
    const menusCollection = db.collection('menus');

    // Find all menu items where recipe is an ObjectId
    const itemsWithObjectIdRecipe = await menusCollection.find({
      recipe: { $type: 'objectId' }
    }).toArray();

    console.log(`Found ${itemsWithObjectIdRecipe.length} menu items with ObjectId recipe\n`);

    if (itemsWithObjectIdRecipe.length === 0) {
      console.log('No migration needed!');
      return;
    }

    let migrated = 0;
    let failed = 0;

    for (const item of itemsWithObjectIdRecipe) {
      console.log(`Migrating: ${item.name?.en || item.name} (${item._id})`);
      console.log(`  Old recipe: ${item.recipe}`);

      try {
        // Update to new format: empty ingredients array
        const result = await menusCollection.updateOne(
          { _id: item._id },
          {
            $set: {
              recipe: {
                ingredients: []
              }
            }
          }
        );

        if (result.modifiedCount > 0) {
          console.log(`  ✅ Migrated successfully\n`);
          migrated++;
        } else {
          console.log(`  ⚠️  No changes made\n`);
        }
      } catch (error) {
        console.error(`  ❌ Failed: ${error.message}\n`);
        failed++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Migrated: ${migrated}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${itemsWithObjectIdRecipe.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
  }
}

migrateRecipeField();
