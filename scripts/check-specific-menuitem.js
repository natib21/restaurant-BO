/**
 * Check specific menu item that's causing the error
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkMenuItem() {
  try {
    const dbUri = process.env.DATABASE_URI || process.env.DB_URI || 'mongodb://localhost:27017/MesobDb';
    await mongoose.connect(dbUri);
    console.log('Connected to database\n');

    const menuItemId = '6a95cc3bfc813f65b9a9b700';
    
    // Query directly from MongoDB without Mongoose model to see raw data
    const db = mongoose.connection.db;
    const menusCollection = db.collection('menus');
    
    const menuItem = await menusCollection.findOne({ _id: new mongoose.Types.ObjectId(menuItemId) });
    
    if (!menuItem) {
      console.log('Menu item not found');
      return;
    }

    console.log('Menu Item ID:', menuItem._id);
    console.log('Name:', menuItem.name);
    console.log('\nRecipe field:');
    console.log('  Type:', typeof menuItem.recipe);
    console.log('  Value:', menuItem.recipe);
    console.log('  Is ObjectId?:', menuItem.recipe instanceof mongoose.Types.ObjectId);
    
    if (menuItem.recipe && typeof menuItem.recipe === 'object') {
      console.log('\nRecipe structure:');
      console.log(JSON.stringify(menuItem.recipe, null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
  }
}

checkMenuItem();
