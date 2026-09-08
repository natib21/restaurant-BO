/**
 * Ingredients, Suppliers & Recipes Seeder
 * 
 * PROPER ARCHITECTURE:
 * 1. Create Suppliers
 * 2. Create Ingredients (linked to Suppliers)
 * 3. Create Recipe documents (standalone collection, linked to Ingredients)
 * 4. Link Recipes to MenuItems (update MenuItem.recipe field)
 * 
 * Usage: node scripts/seed-ingredients-recipes.js
 * NOTE: Run seed-menu-data.js FIRST
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const Ingredient = require('../models/Ingredient');
const Supplier = require('../models/Supplier');
const Recipe = require('../models/Recipe');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/MesobDb');
    console.log('✓ MongoDB connected');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const seedIngredientsAndRecipes = async () => {
  try {
    console.log('\n🌱 Starting ingredients, suppliers & recipes seeding...\n');

    // Find merchant
    const merchant = await Merchant.findOne().sort({ createdAt: -1 });
    if (!merchant) {
      console.error('✗ No merchant found. Run seed-menu-data.js first.');
      process.exit(1);
    }

    const branch = await Branch.findOne({ merchant: merchant._id, isMain: true });
    if (!branch) {
      console.error('✗ No branch found.');
      process.exit(1);
    }

    console.log(`✓ Merchant: ${merchant.businessName}`);
    console.log(`✓ Branch: ${branch.name}\n`);

    // Clear existing data
    await Ingredient.deleteMany({ merchant: merchant._id });
    await Supplier.deleteMany({ merchant: merchant._id });
    await Recipe.deleteMany({ merchant: merchant._id });
    console.log('✓ Cleared existing data\n');

    // ========== CREATE SUPPLIERS ==========
    console.log('🏭 Creating suppliers...');
    const suppliers = await Supplier.create([
      {
        merchant: merchant._id,
        name: 'Fresh Farms Ltd',
        contactPerson: 'Abebe Kebede',
        phone: '+251911111111',
        email: 'contact@freshfarms.et',
        address: { street: 'Bole Road', city: 'Addis Ababa', country: 'Ethiopia' },
        productsSupplied: ['Vegetables', 'Fruits'],
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: 'Prime Meats',
        contactPerson: 'Mulugeta Tesfaye',
        phone: '+251922222222',
        email: 'sales@primemeats.et',
        address: { street: 'Megenagna', city: 'Addis Ababa', country: 'Ethiopia' },
        productsSupplied: ['Beef', 'Chicken', 'Lamb'],
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: 'Ocean Fresh',
        contactPerson: 'Dawit Alemayehu',
        phone: '+251933333333',
        email: 'info@oceanfresh.et',
        address: { street: 'Mexico Square', city: 'Addis Ababa', country: 'Ethiopia' },
        productsSupplied: ['Seafood'],
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: 'Golden Grain',
        contactPerson: 'Tigist Worku',
        phone: '+251944444444',
        email: 'orders@goldengrain.et',
        address: { street: 'Piazza', city: 'Addis Ababa', country: 'Ethiopia' },
        productsSupplied: ['Pasta', 'Rice', 'Bread'],
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: 'Dairy Delight',
        contactPerson: 'Hanna Bekele',
        phone: '+251955555555',
        email: 'supply@dairydelight.et',
        address: { street: 'Kazanchis', city: 'Addis Ababa', country: 'Ethiopia' },
        productsSupplied: ['Cheese', 'Milk', 'Butter'],
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: 'Spice Kingdom',
        contactPerson: 'Yohannes Tadesse',
        phone: '+251966666666',
        email: 'sales@spicekingdom.et',
        address: { street: 'Merkato', city: 'Addis Ababa', country: 'Ethiopia' },
        productsSupplied: ['Spices', 'Ethiopian Spices'],
        isActive: true,
      },
    ]);
    console.log(`✓ Created ${suppliers.length} suppliers\n`);

    const [freshFarms, primeMeats, oceanFresh, goldenGrain, dairyDelight, spiceKingdom] = suppliers;

    // ========== CREATE INGREDIENTS ==========
    console.log('🥕 Creating ingredients...');
    const ingredients = await Ingredient.create([
      // Vegetables
      { merchant: merchant._id, name: 'Romaine Lettuce', category: 'vegetables', unit: 'kg', costPerUnit: 45, currentStock: 25, minStock: 5, maxStock: 50, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Tomatoes', category: 'vegetables', unit: 'kg', costPerUnit: 30, currentStock: 40, minStock: 10, maxStock: 60, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Onions', category: 'vegetables', unit: 'kg', costPerUnit: 25, currentStock: 35, minStock: 10, maxStock: 50, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Bell Peppers', category: 'vegetables', unit: 'kg', costPerUnit: 60, currentStock: 15, minStock: 5, maxStock: 30, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Carrots', category: 'vegetables', unit: 'kg', costPerUnit: 28, currentStock: 20, minStock: 5, maxStock: 40, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Cabbage', category: 'vegetables', unit: 'kg', costPerUnit: 22, currentStock: 30, minStock: 10, maxStock: 50, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Spinach', category: 'vegetables', unit: 'kg', costPerUnit: 35, currentStock: 18, minStock: 5, maxStock: 30, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Asparagus', category: 'vegetables', unit: 'kg', costPerUnit: 180, currentStock: 8, minStock: 3, maxStock: 15, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Basil Fresh', category: 'vegetables', unit: 'g', costPerUnit: 1, currentStock: 500, minStock: 100, maxStock: 1000, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Garlic', category: 'vegetables', unit: 'kg', costPerUnit: 80, currentStock: 12, minStock: 3, maxStock: 20, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Ginger', category: 'vegetables', unit: 'kg', costPerUnit: 90, currentStock: 10, minStock: 3, maxStock: 15, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Potatoes', category: 'vegetables', unit: 'kg', costPerUnit: 20, currentStock: 45, minStock: 15, maxStock: 70, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Mangoes', category: 'other', unit: 'kg', costPerUnit: 55, currentStock: 25, minStock: 10, maxStock: 40, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Lemons', category: 'other', unit: 'kg', costPerUnit: 40, currentStock: 15, minStock: 5, maxStock: 25, supplier: freshFarms._id, isActive: true },
      
      // Meats
      { merchant: merchant._id, name: 'Chicken Breast', category: 'meat', unit: 'kg', costPerUnit: 180, currentStock: 35, minStock: 10, maxStock: 60, supplier: primeMeats._id, isActive: true },
      { merchant: merchant._id, name: 'Chicken Wings', category: 'meat', unit: 'kg', costPerUnit: 150, currentStock: 28, minStock: 8, maxStock: 50, supplier: primeMeats._id, isActive: true },
      { merchant: merchant._id, name: 'Whole Chicken', category: 'meat', unit: 'kg', costPerUnit: 160, currentStock: 20, minStock: 5, maxStock: 40, supplier: primeMeats._id, isActive: true },
      { merchant: merchant._id, name: 'Beef Ribeye', category: 'meat', unit: 'kg', costPerUnit: 650, currentStock: 18, minStock: 5, maxStock: 30, supplier: primeMeats._id, isActive: true },
      { merchant: merchant._id, name: 'Ground Beef', category: 'meat', unit: 'kg', costPerUnit: 380, currentStock: 25, minStock: 8, maxStock: 40, supplier: primeMeats._id, isActive: true },
      { merchant: merchant._id, name: 'Lamb Chops', category: 'meat', unit: 'kg', costPerUnit: 720, currentStock: 12, minStock: 4, maxStock: 20, supplier: primeMeats._id, isActive: true },
      { merchant: merchant._id, name: 'Lamb Cubed', category: 'meat', unit: 'kg', costPerUnit: 580, currentStock: 15, minStock: 5, maxStock: 25, supplier: primeMeats._id, isActive: true },
      { merchant: merchant._id, name: 'Bacon', category: 'meat', unit: 'kg', costPerUnit: 420, currentStock: 10, minStock: 3, maxStock: 20, supplier: primeMeats._id, isActive: true },
      { merchant: merchant._id, name: 'Salmon Fillet', category: 'meat', unit: 'kg', costPerUnit: 850, currentStock: 12, minStock: 4, maxStock: 20, supplier: oceanFresh._id, isActive: true },
      { merchant: merchant._id, name: 'Jumbo Shrimp', category: 'meat', unit: 'kg', costPerUnit: 680, currentStock: 10, minStock: 3, maxStock: 18, supplier: oceanFresh._id, isActive: true },
      
      // Grains
      { merchant: merchant._id, name: 'Linguine Pasta', category: 'grains', unit: 'kg', costPerUnit: 85, currentStock: 30, minStock: 10, maxStock: 50, supplier: goldenGrain._id, isActive: true },
      { merchant: merchant._id, name: 'Pizza Dough', category: 'grains', unit: 'kg', costPerUnit: 45, currentStock: 25, minStock: 10, maxStock: 40, supplier: goldenGrain._id, isActive: true },
      { merchant: merchant._id, name: 'Italian Bread', category: 'grains', unit: 'pieces', costPerUnit: 35, currentStock: 20, minStock: 5, maxStock: 30, supplier: goldenGrain._id, isActive: true },
      { merchant: merchant._id, name: 'Spring Roll Wrappers', category: 'grains', unit: 'pieces', costPerUnit: 2, currentStock: 200, minStock: 50, maxStock: 300, supplier: goldenGrain._id, isActive: true },
      { merchant: merchant._id, name: 'Injera', category: 'grains', unit: 'pieces', costPerUnit: 8, currentStock: 100, minStock: 30, maxStock: 150, supplier: goldenGrain._id, isActive: true },
      { merchant: merchant._id, name: 'Croutons', category: 'grains', unit: 'g', costPerUnit: 0.1, currentStock: 2000, minStock: 500, maxStock: 3000, supplier: goldenGrain._id, isActive: true },
      { merchant: merchant._id, name: 'Red Lentils', category: 'grains', unit: 'kg', costPerUnit: 55, currentStock: 30, minStock: 10, maxStock: 50, supplier: goldenGrain._id, isActive: true },
      { merchant: merchant._id, name: 'Yellow Split Peas', category: 'grains', unit: 'kg', costPerUnit: 48, currentStock: 25, minStock: 10, maxStock: 45, supplier: goldenGrain._id, isActive: true },
      
      // Dairy
      { merchant: merchant._id, name: 'Parmesan Cheese', category: 'dairy', unit: 'kg', costPerUnit: 480, currentStock: 8, minStock: 2, maxStock: 15, supplier: dairyDelight._id, isActive: true },
      { merchant: merchant._id, name: 'Mozzarella Cheese', category: 'dairy', unit: 'kg', costPerUnit: 380, currentStock: 12, minStock: 4, maxStock: 20, supplier: dairyDelight._id, isActive: true },
      { merchant: merchant._id, name: 'Blue Cheese', category: 'dairy', unit: 'kg', costPerUnit: 520, currentStock: 5, minStock: 2, maxStock: 10, supplier: dairyDelight._id, isActive: true },
      { merchant: merchant._id, name: 'Heavy Cream', category: 'dairy', unit: 'liter', costPerUnit: 120, currentStock: 15, minStock: 5, maxStock: 25, supplier: dairyDelight._id, isActive: true },
      { merchant: merchant._id, name: 'Butter', category: 'dairy', unit: 'kg', costPerUnit: 280, currentStock: 18, minStock: 5, maxStock: 30, supplier: dairyDelight._id, isActive: true },
      { merchant: merchant._id, name: 'Mascarpone', category: 'dairy', unit: 'kg', costPerUnit: 580, currentStock: 6, minStock: 2, maxStock: 12, supplier: dairyDelight._id, isActive: true },
      { merchant: merchant._id, name: 'Eggs', category: 'dairy', unit: 'pieces', costPerUnit: 4, currentStock: 480, minStock: 180, maxStock: 720, supplier: dairyDelight._id, isActive: true },
      { merchant: merchant._id, name: 'Spiced Butter Qibe', category: 'dairy', unit: 'kg', costPerUnit: 320, currentStock: 12, minStock: 4, maxStock: 20, supplier: dairyDelight._id, isActive: true },
      
      // Spices & Other
      { merchant: merchant._id, name: 'Berbere', category: 'spices', unit: 'kg', costPerUnit: 220, currentStock: 10, minStock: 3, maxStock: 18, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Mitmita', category: 'spices', unit: 'kg', costPerUnit: 180, currentStock: 8, minStock: 2, maxStock: 15, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Black Pepper', category: 'spices', unit: 'kg', costPerUnit: 320, currentStock: 6, minStock: 2, maxStock: 12, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Salt', category: 'spices', unit: 'kg', costPerUnit: 15, currentStock: 50, minStock: 15, maxStock: 80, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Chili Flakes', category: 'spices', unit: 'kg', costPerUnit: 150, currentStock: 8, minStock: 3, maxStock: 15, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Rosemary Dried', category: 'spices', unit: 'g', costPerUnit: 0.3, currentStock: 1000, minStock: 200, maxStock: 2000, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Coffee Beans Ethiopian', category: 'beverages', unit: 'kg', costPerUnit: 380, currentStock: 20, minStock: 8, maxStock: 35, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Olive Oil', category: 'other', unit: 'liter', costPerUnit: 380, currentStock: 20, minStock: 5, maxStock: 35, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Soy Sauce', category: 'other', unit: 'ml', costPerUnit: 0.12, currentStock: 5000, minStock: 1000, maxStock: 8000, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Sweet Chili Sauce', category: 'other', unit: 'ml', costPerUnit: 0.1, currentStock: 4000, minStock: 1000, maxStock: 6000, supplier: spiceKingdom._id, isActive: true },
      { merchant: merchant._id, name: 'Tomato Sauce', category: 'other', unit: 'ml', costPerUnit: 0.07, currentStock: 8000, minStock: 2000, maxStock: 12000, supplier: freshFarms._id, isActive: true },
      { merchant: merchant._id, name: 'Vanilla Ice Cream', category: 'dairy', unit: 'liter', costPerUnit: 180, currentStock: 12, minStock: 5, maxStock: 20, supplier: dairyDelight._id, isActive: true },
      { merchant: merchant._id, name: 'Dark Chocolate', category: 'other', unit: 'kg', costPerUnit: 420, currentStock: 10, minStock: 3, maxStock: 18, supplier: goldenGrain._id, isActive: true },
      { merchant: merchant._id, name: 'Ladyfinger Biscuits', category: 'other', unit: 'g', costPerUnit: 0.5, currentStock: 3000, minStock: 500, maxStock: 5000, supplier: goldenGrain._id, isActive: true },
    ]);
    console.log(`✓ Created ${ingredients.length} ingredients\n`);

    // Create ingredient map
    const ing = {};
    ingredients.forEach(i => { ing[i.name] = i._id; });

    // ========== GET MENU ITEMS ==========
    const menuItems = await MenuItem.find({ merchant: merchant._id }).sort({ createdAt: 1 });
    if (menuItems.length === 0) {
      console.error('✗ No menu items. Run seed-menu-data.js first.');
      process.exit(1);
    }

    // Create menu item map
    const menu = {};
    menuItems.forEach(m => { menu[m.name.en] = m._id; });

    // ========== CREATE RECIPES ==========
    console.log('📖 Creating recipes...');
    
    const recipes = [];
    
    // Recipe definitions (20 total)
    const recipeData = [
      { menu: 'Spring Rolls', name: 'Spring Rolls Recipe', items: [[ing['Spring Roll Wrappers'], 10, 'pieces'], [ing['Carrots'], 0.05, 'kg'], [ing['Cabbage'], 0.04, 'kg'], [ing['Onions'], 0.02, 'kg'], [ing['Soy Sauce'], 10, 'ml'], [ing['Sweet Chili Sauce'], 30, 'ml']], yield: 1 },
      { menu: 'Chicken Wings', name: 'Chicken Wings Recipe', items: [[ing['Chicken Wings'], 0.3, 'kg'], [ing['Butter'], 0.05, 'kg'], [ing['Chili Flakes'], 0.01, 'kg'], [ing['Blue Cheese'], 0.05, 'kg'], [ing['Heavy Cream'], 0.02, 'liter']], yield: 1 },
      { menu: 'Caesar Salad', name: 'Caesar Salad Recipe', items: [[ing['Romaine Lettuce'], 0.15, 'kg'], [ing['Parmesan Cheese'], 0.03, 'kg'], [ing['Croutons'], 30, 'g'], [ing['Eggs'], 1, 'pieces'], [ing['Garlic'], 0.005, 'kg'], [ing['Olive Oil'], 0.02, 'liter']], yield: 1 },
      { menu: 'Bruschetta', name: 'Bruschetta Recipe', items: [[ing['Italian Bread'], 2, 'pieces'], [ing['Tomatoes'], 0.12, 'kg'], [ing['Basil Fresh'], 10, 'g'], [ing['Garlic'], 0.01, 'kg'], [ing['Olive Oil'], 0.02, 'liter']], yield: 1 },
      { menu: 'Grilled Chicken Breast', name: 'Grilled Chicken Recipe', items: [[ing['Chicken Breast'], 0.25, 'kg'], [ing['Carrots'], 0.08, 'kg'], [ing['Bell Peppers'], 0.06, 'kg'], [ing['Potatoes'], 0.15, 'kg'], [ing['Butter'], 0.03, 'kg'], [ing['Olive Oil'], 0.01, 'liter']], yield: 1 },
      { menu: 'Beef Steak', name: 'Beef Steak Recipe', items: [[ing['Beef Ribeye'], 0.3, 'kg'], [ing['Butter'], 0.02, 'kg'], [ing['Garlic'], 0.01, 'kg'], [ing['Rosemary Dried'], 2, 'g'], [ing['Black Pepper'], 0.002, 'kg'], [ing['Salt'], 0.002, 'kg']], yield: 1 },
      { menu: 'Pasta Carbonara', name: 'Pasta Carbonara Recipe', items: [[ing['Linguine Pasta'], 0.15, 'kg'], [ing['Bacon'], 0.08, 'kg'], [ing['Eggs'], 2, 'pieces'], [ing['Parmesan Cheese'], 0.05, 'kg'], [ing['Black Pepper'], 0.002, 'kg']], yield: 1 },
      { menu: 'Margherita Pizza', name: 'Margherita Pizza Recipe', items: [[ing['Pizza Dough'], 0.25, 'kg'], [ing['Tomato Sauce'], 80, 'ml'], [ing['Mozzarella Cheese'], 0.12, 'kg'], [ing['Basil Fresh'], 10, 'g'], [ing['Olive Oil'], 0.01, 'liter']], yield: 1 },
      { menu: 'Salmon Fillet', name: 'Salmon Fillet Recipe', items: [[ing['Salmon Fillet'], 0.22, 'kg'], [ing['Butter'], 0.03, 'kg'], [ing['Lemons'], 0.05, 'kg'], [ing['Asparagus'], 0.1, 'kg'], [ing['Garlic'], 0.005, 'kg']], yield: 1 },
      { menu: 'Vegetable Stir Fry', name: 'Vegetable Stir Fry Recipe', items: [[ing['Carrots'], 0.08, 'kg'], [ing['Bell Peppers'], 0.08, 'kg'], [ing['Cabbage'], 0.06, 'kg'], [ing['Onions'], 0.05, 'kg'], [ing['Garlic'], 0.01, 'kg'], [ing['Ginger'], 0.008, 'kg'], [ing['Soy Sauce'], 20, 'ml']], yield: 1 },
      { menu: 'Lamb Chops', name: 'Lamb Chops Recipe', items: [[ing['Lamb Chops'], 0.28, 'kg'], [ing['Rosemary Dried'], 3, 'g'], [ing['Garlic'], 0.01, 'kg'], [ing['Olive Oil'], 0.02, 'liter'], [ing['Black Pepper'], 0.002, 'kg'], [ing['Salt'], 0.002, 'kg']], yield: 1 },
      { menu: 'Shrimp Pasta', name: 'Shrimp Pasta Recipe', items: [[ing['Linguine Pasta'], 0.15, 'kg'], [ing['Jumbo Shrimp'], 0.18, 'kg'], [ing['Heavy Cream'], 0.1, 'liter'], [ing['Garlic'], 0.01, 'kg'], [ing['Parmesan Cheese'], 0.03, 'kg'], [ing['Butter'], 0.02, 'kg']], yield: 1 },
      { menu: 'Doro Wot', name: 'Doro Wot Recipe', items: [[ing['Whole Chicken'], 0.35, 'kg'], [ing['Eggs'], 2, 'pieces'], [ing['Onions'], 0.15, 'kg'], [ing['Berbere'], 0.03, 'kg'], [ing['Spiced Butter Qibe'], 0.05, 'kg'], [ing['Garlic'], 0.01, 'kg'], [ing['Ginger'], 0.008, 'kg'], [ing['Injera'], 2, 'pieces']], yield: 1 },
      { menu: 'Kitfo', name: 'Kitfo Recipe', items: [[ing['Ground Beef'], 0.22, 'kg'], [ing['Mitmita'], 0.015, 'kg'], [ing['Spiced Butter Qibe'], 0.04, 'kg'], [ing['Injera'], 2, 'pieces']], yield: 1 },
      { menu: 'Tibs', name: 'Tibs Recipe', items: [[ing['Lamb Cubed'], 0.25, 'kg'], [ing['Onions'], 0.1, 'kg'], [ing['Bell Peppers'], 0.08, 'kg'], [ing['Tomatoes'], 0.06, 'kg'], [ing['Berbere'], 0.01, 'kg'], [ing['Garlic'], 0.008, 'kg'], [ing['Butter'], 0.03, 'kg'], [ing['Injera'], 2, 'pieces']], yield: 1 },
      { menu: 'Beyaynetu (Veggie Combo)', name: 'Beyaynetu Recipe', items: [[ing['Red Lentils'], 0.08, 'kg'], [ing['Yellow Split Peas'], 0.08, 'kg'], [ing['Cabbage'], 0.1, 'kg'], [ing['Spinach'], 0.08, 'kg'], [ing['Carrots'], 0.06, 'kg'], [ing['Potatoes'], 0.1, 'kg'], [ing['Onions'], 0.08, 'kg'], [ing['Garlic'], 0.008, 'kg'], [ing['Berbere'], 0.015, 'kg'], [ing['Olive Oil'], 0.03, 'liter'], [ing['Injera'], 3, 'pieces']], yield: 1 },
      { menu: 'Fresh Mango Juice', name: 'Fresh Mango Juice Recipe', items: [[ing['Mangoes'], 0.3, 'kg']], yield: 1 },
      { menu: 'Ethiopian Coffee', name: 'Ethiopian Coffee Recipe', items: [[ing['Coffee Beans Ethiopian'], 0.025, 'kg']], yield: 1 },
      { menu: 'Tiramisu', name: 'Tiramisu Recipe', items: [[ing['Ladyfinger Biscuits'], 150, 'g'], [ing['Mascarpone'], 0.12, 'kg'], [ing['Eggs'], 2, 'pieces'], [ing['Coffee Beans Ethiopian'], 0.02, 'kg'], [ing['Dark Chocolate'], 0.02, 'kg']], yield: 1 },
      { menu: 'Chocolate Lava Cake', name: 'Chocolate Lava Cake Recipe', items: [[ing['Dark Chocolate'], 0.08, 'kg'], [ing['Butter'], 0.05, 'kg'], [ing['Eggs'], 2, 'pieces'], [ing['Vanilla Ice Cream'], 0.08, 'liter']], yield: 1 },
    ];

    // Create all recipes
    for (const recipe of recipeData) {
      if (!menu[recipe.menu]) {
        console.log(`⚠️  Menu item not found: ${recipe.menu}`);
        continue;
      }

      const recipeDoc = await Recipe.create({
        merchant: merchant._id,
        menuItem: menu[recipe.menu],
        name: recipe.name,
        items: recipe.items.map(([ingredient, quantity, unit]) => ({ ingredient, quantity, unit })),
        yield: recipe.yield,
        isActive: true,
      });

      recipes.push(recipeDoc);

      // Link recipe to menu item
      await MenuItem.findByIdAndUpdate(menu[recipe.menu], { recipe: recipeDoc._id });
    }

    console.log(`✓ Created ${recipes.length} recipes\n`);
    console.log(`✓ Linked recipes to menu items\n`);

    console.log('✅ Seeding completed!\n');
    console.log('Summary:');
    console.log(`  - ${suppliers.length} suppliers`);
    console.log(`  - ${ingredients.length} ingredients`);
    console.log(`  - ${recipes.length} recipes`);
    console.log(`  - Recipes linked to menu items\n`);

  } catch (error) {
    console.error('✗ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✓ Database connection closed');
  }
};

connectDB().then(seedIngredientsAndRecipes);
