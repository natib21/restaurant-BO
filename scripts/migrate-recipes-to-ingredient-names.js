/**
 * @file scripts/migrate-recipes-to-ingredient-names.js
 * @description Migration script to convert Recipe.items[].ingredient (ObjectId) to ingredientName (String)
 * 
 * This handles the transition from:
 *   OLD: items: [{ ingredient: ObjectId, quantity, unit }]
 *   NEW: items: [{ ingredientName: String, quantity, unit }]
 * 
 * Execution:
 *   node scripts/migrate-recipes-to-ingredient-names.js [--dry-run] [--merchant-id=<id>]
 */

const mongoose = require('mongoose');
const Recipe = require('../models/Recipe');
const Ingredient = require('../models/Ingredient');

async function migrateRecipes() {
  // Parse command-line args
  const isDryRun = process.argv.includes('--dry-run');
  const merchantIdArg = process.argv.find(arg => arg.startsWith('--merchant-id='));
  const merchantId = merchantIdArg ? merchantIdArg.split('=')[1] : null;

  console.log('🔄 Recipe Migration: ObjectId → ingredientName\n');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE UPDATE'}`);
  if (merchantId) console.log(`Target merchant: ${merchantId}`);
  console.log('');

  try {
    // Connect
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant-bo');
    console.log('✅ Connected to MongoDB\n');

    // Find recipes with old format
    const query = {};
    if (merchantId) {
      query.merchant = new mongoose.Types.ObjectId(merchantId);
    }

    const recipes = await Recipe.find(query).lean();
    console.log(`📊 Found ${recipes.length} recipes to check\n`);

    let processedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const recipe of recipes) {
      try {
        // Check if recipe items already use ingredientName (migration already done)
        const hasNewFormat = recipe.items.some(item => item.ingredientName && !item.ingredient);
        const hasOldFormat = recipe.items.some(item => item.ingredient && !item.ingredientName);

        if (hasNewFormat && !hasOldFormat) {
          // Already migrated
          skippedCount++;
          continue;
        }

        if (!hasOldFormat) {
          // Mixed or no items
          skippedCount++;
          continue;
        }

        // Migrate this recipe
        const updatedItems = [];

        for (const item of recipe.items) {
          if (item.ingredientName) {
            // Already has ingredientName, keep as is
            updatedItems.push(item);
            continue;
          }

          if (!item.ingredient) {
            console.warn(`⚠️  Recipe ${recipe._id}: item has neither ingredient nor ingredientName`);
            updatedItems.push(item);
            continue;
          }

          // Look up ingredient to get its name
          const ingredient = await Ingredient.findById(item.ingredient).lean();

          if (!ingredient) {
            console.error(
              `❌ Recipe ${recipe._id}: ingredient ${item.ingredient} not found (orphaned reference)`
            );
            failedCount++;
            continue;
          }

          // Convert to new format
          updatedItems.push({
            ingredientName: ingredient.name,
            quantity: item.quantity,
            unit: item.unit,
            // Remove old 'ingredient' field in new format
          });
        }

        if (!isDryRun) {
          // Save updated recipe
          await Recipe.updateOne(
            { _id: recipe._id },
            { $set: { items: updatedItems } }
          );
        }

        console.log(`✓ Recipe "${recipe.name}" (${recipe._id}): ${updatedItems.length} items converted`);
        processedCount++;
      } catch (error) {
        console.error(`❌ Error processing recipe ${recipe._id}:`, error.message);
        failedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Processed (migrated):  ${processedCount}`);
    console.log(`Skipped (already new): ${skippedCount}`);
    console.log(`Failed:                ${failedCount}`);
    console.log(`Total:                 ${recipes.length}`);
    console.log('='.repeat(60));

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN MODE: No changes were applied.\n');
      console.log('To apply migrations, run without --dry-run flag:');
      console.log('  node scripts/migrate-recipes-to-ingredient-names.js\n');
    } else {
      console.log('\n✅ Migration complete!\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

migrateRecipes();
