/**
 * Menu Data Seeder
 * 
 * Seeds:
 * - Creates merchant via signup endpoint (or uses existing)
 * - 5 Categories
 * - 20 Menu Items (with full EN/AM translations)
 * - 3 Menu Groups
 * - 4 Combos
 * 
 * Usage: node scripts/seed-menu-data.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const Category = require('../models/Category');
const MenuItem = require('../src/modules/menu/model/MenuItem.model');
const MenuGroup = require('../src/modules/menu/model/MenuGroup.model');
const Combo = require('../src/modules/menu/model/Combo.model');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const KitchenStation = require('../models/KitchenStation');
const AppError = require('../src/common/errors');

// Configuration
const SIGNUP_CREDENTIALS = {
  firstName: 'Nathnael',
  lastName: 'Zelalem',
  email: 'nathnaelzelalem@gmail.com',
  password: 'Nathnael@9921',
  passwordConfirm: 'Nathnael@9921',
  business: 'Nathnael Restaurant',
  phone: '+251911234567',
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/MesobDb');
    console.log('✓ MongoDB connected');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Ensure required role exists
const ensureRoleExists = async () => {
  let role = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });
  
  if (!role) {
    console.log('� Creating SUPER-MERCHANT-ADMIN role...');
    role = await Role.create({
      name: 'SUPER-MERCHANT-ADMIN',
      description: 'Super admin role for merchant owners',
      tasks: [], // Add task permissions as needed
    });
    console.log('✓ Role created');
  } else {
    console.log('✓ Role exists:', role.name);
  }
  
  return role;
};

// Create merchant, user, branch, and default menu group (exact signup flow)
const createMerchantViaSignupFlow = async () => {
  const {
    firstName,
    lastName,
    phone,
    email,
    business: businessName,
    password,
    passwordConfirm,
  } = SIGNUP_CREDENTIALS;

  // Ensure role exists first
  await ensureRoleExists();

  const session = await mongoose.startSession();

  try {
    let newUserId, merchantId, branchId;

    await session.withTransaction(async () => {
      console.log('🔐 Starting signup transaction...');

      // 1. Uniqueness checks
      const [existingUser, existingMerchant] = await Promise.all([
        User.findOne({ $or: [{ phone }, { email }] }).session(session),
        Merchant.findOne({ $or: [{ businessName }, { phone }] }).session(session),
      ]);

      if (existingUser) {
        console.log('⚠️  User already exists');
        // Return existing data
        const user = await User.findOne({ email }).session(session).populate('merchant branch');
        merchantId = user.merchant._id;
        branchId = user.branch[0]._id;
        newUserId = user._id;
        console.log('✓ Using existing user, merchant, and branch\n');
        return; // Skip creation, use existing
      }
      if (existingMerchant) {
        console.log('⚠️  Merchant already exists');
        const existingBranch = await Branch.findOne({ merchant: existingMerchant._id }).session(session);
        const existingUser = await User.findOne({ merchant: existingMerchant._id }).session(session);
        merchantId = existingMerchant._id;
        branchId = existingBranch._id;
        newUserId = existingUser?._id;
        console.log('✓ Using existing merchant and branch\n');
        return; // Skip creation, use existing
      }

      // 2. Create merchant
      const [merchant] = await Merchant.create(
        [
          {
            businessName,
            slug: businessName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, ''),
            phone,
            email,
            status: 'approved', // Approved for immediate use
            mode: 'Trial',
            branchCounter: 1,
            owner: {
              fullName: `${firstName} ${lastName}`,
              email,
              phone,
              gender: 'Male',
            },
          },
        ],
        { session }
      );
      merchantId = merchant._id;
      console.log('✓ Created merchant:', businessName);

      // 3. Create main branch
      const [mainBranch] = await Branch.create(
        [
          {
            merchant: merchant._id,
            name: `${businessName} - Main Branch`,
            phone,
            isMain: true,
            isActive: true,
            branchCode: 'BR-001',
            location: {
              type: 'Point',
              coordinates: [38.7578, 9.0054],
              city: 'Addis Ababa',
              formattedAddress: `${businessName} - Main Branch, Addis Ababa, Ethiopia`,
            },
          },
        ],
        { session }
      );
      branchId = mainBranch._id;
      console.log('✓ Created main branch');

      // 4. Get role
      const superRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' }).session(session);
      if (!superRole) throw new AppError('System role not found.', 500);

      // 5. Create user
      const [newUser] = await User.create(
        [
          {
            firstName,
            lastName,
            phone,
            email: email.toLowerCase(),
            password,
            passwordConfirm,
            merchant: merchant._id,
            branch: [mainBranch._id],
            role: superRole._id,
            emailConfirmed: false,
          },
        ],
        { session }
      );
      newUserId = newUser._id;
      console.log('✓ Created user');

      // 6. Create system default menu group
      await MenuGroup.create(
        [
          {
            merchant: merchant._id,
            branches: [mainBranch._id],
            name: {
              en: 'All Items (System Default)',
              am: 'ሁሉም ምግቦች (ነባሪ)',
            },
            description: {
              en: 'Hidden system group for all menu items.',
              am: 'ለሁሉም የምግብ ዝርዝር እቃዎች የተደበቀ የስርዓት ቡድን።',
            },
            visibility: 'always',
            priority: -100,
            isSystemDefault: true,
            isAlcoholMenu: false,
            items: [],
          },
        ],
        { session }
      );
      console.log('✓ Created system default menu group');

      console.log('✓ Signup transaction completed successfully\n');
    });

    return {
      merchantId,
      branchId,
      userId: newUserId,
      method: merchantId ? (newUserId ? 'existing' : 'partial-existing') : 'signup-transaction',
    };
  } catch (error) {
    throw error;
  } finally {
    session.endSession();
  }
};

// Main seeder function
const seedMenuData = async () => {
  try {
    console.log('\n🌱 Starting menu data seeding...\n');

    // 1. Create merchant via signup transaction flow (merchant + user + branch + default menu group)
    const { merchantId, branchId, userId, method } = await createMerchantViaSignupFlow();
    
    // Get full documents
    const [merchant, branch] = await Promise.all([
      Merchant.findById(merchantId),
      Branch.findById(branchId),
    ]);

    if (!merchant || !branch) {
      throw new Error('Merchant or branch not found after creation');
    }

    console.log(`✓ Working with merchant: ${merchant.businessName} (ID: ${merchant._id})`);
    console.log(`✓ Branch: ${branch.name}`);
    console.log(`  Setup method: ${method}\n`);

    // 2. Clear existing menu data (except system default menu group)
    const systemMenuGroup = await MenuGroup.findOne({ 
      merchant: merchant._id, 
      isSystemDefault: true 
    });
    
    await Category.deleteMany({ merchant: merchant._id });
    await MenuItem.deleteMany({ merchant: merchant._id });
    await MenuGroup.deleteMany({ 
      merchant: merchant._id, 
      isSystemDefault: { $ne: true } // Keep system default
    });
    await Combo.deleteMany({ merchant: merchant._id });
    console.log('✓ Cleared existing menu data (kept system default menu group)\n');

    // 3. Create Categories
    console.log('📁 Creating categories...');
    const categories = await Category.create([
      {
        merchant: merchant._id,
        name: { en: 'Appetizers', am: 'መክሰስ' },
        description: { en: 'Start your meal with our delicious appetizers', am: 'ምግብዎን በጣፋጭ መክሰሳችን ይጀምሩ' },
        displayOrder: 1,
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: { en: 'Main Courses', am: 'ዋና ምግቦች' },
        description: { en: 'Hearty main dishes to satisfy your hunger', am: 'ረሃብዎን የሚያረኩ ጠንካራ ዋና ምግቦች' },
        displayOrder: 2,
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: { en: 'Beverages', am: 'መጠጦች' },
        description: { en: 'Refreshing drinks for every taste', am: 'ለእያንዳንዱ ጣዕም አዘውትር መጠጦች' },
        displayOrder: 3,
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: { en: 'Desserts', am: 'ጣፋጭ ምግቦች' },
        description: { en: 'Sweet treats to end your meal perfectly', am: 'ምግብዎን በትክክል ለማጠናቀቅ ጣፋጭ ምግቦች' },
        displayOrder: 4,
        isActive: true,
      },
      {
        merchant: merchant._id,
        name: { en: 'Traditional Ethiopian', am: 'ባህላዊ የኢትዮጵያ ምግብ' },
        description: { en: 'Authentic Ethiopian cuisine', am: 'ትክክለኛ የኢትዮጵያ ምግብ' },
        displayOrder: 5,
        isActive: true,
      },
    ]);
    console.log(`✓ Created ${categories.length} categories\n`);

    const [appetizersCategory, mainCategory, beveragesCategory, dessertsCategory, ethiopianCategory] = categories;

    // 4. Get or create kitchen station for menu items
    let kitchenStationId = null;
    const kitchenStation = await KitchenStation.findOne({ 
      merchant: merchant._id,
      isActive: true 
    }).sort({ createdAt: 1 });
    
    if (kitchenStation) {
      kitchenStationId = kitchenStation._id;
      console.log(`✓ Found kitchen station: ${kitchenStation.name} (${kitchenStationId})\n`);
    } else {
      console.log('⚠️  No kitchen station found. Items will not create KDS tickets until station is assigned.\n');
    }

    // 5. Create Menu Items (20 items)
    console.log('🍽️  Creating menu items...');
    const menuItems = await MenuItem.create([
      // Appetizers (4 items)
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: appetizersCategory._id,
        name: { en: 'Spring Rolls', am: 'የስፕሪንግ ሮል' },
        description: { en: 'Crispy vegetable spring rolls served with sweet chili sauce', am: 'ከጣፋጭ ቺሊ ጨው ጋር የሚቀርብ ጥራጥሬ የአትክልት ሮል' },
        type: 'food',
        price: 85,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 15,
        isSpicy: true,
        spicyLevel: 2,
        allergens: ['soy', 'wheat'],
        nutritionalInfo: { calories: 220, protein: 8, carbs: 35, fat: 12 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: appetizersCategory._id,
        name: { en: 'Chicken Wings', am: 'የዶሮ ክንፍ' },
        description: { en: 'Spicy buffalo wings with blue cheese dip', am: 'ከሰማያዊ አይብ ጨው ጋር የቡፋሎ ክንፍ' },
        type: 'food',
        price: 120,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 20,
        isSpicy: true,
        spicyLevel: 3,
        allergens: ['dairy'],
        nutritionalInfo: { calories: 450, protein: 35, carbs: 15, fat: 28 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: appetizersCategory._id,
        name: { en: 'Caesar Salad', am: 'ቄሳር ሰላጣ' },
        description: { en: 'Fresh romaine lettuce with parmesan cheese and croutons', am: 'ከፓርሜሳን አይብ እና ክሮቶን ጋር ትኩስ የሮሜን ሰላጣ' },
        type: 'food',
        price: 95,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 10,
        isVegetarian: true,
        allergens: ['dairy', 'wheat', 'eggs'],
        nutritionalInfo: { calories: 320, protein: 12, carbs: 18, fat: 22 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: appetizersCategory._id,
        name: { en: 'Bruschetta', am: 'ብሩሼታ' },
        description: { en: 'Toasted bread topped with fresh tomatoes, basil, and olive oil', am: 'ከትኩስ ቲማቲም፣ ባስል እና የወይራ ዘይት ጋር የተጠበሰ ዳቦ' },
        type: 'food',
        price: 75,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 12,
        isVegan: true,
        allergens: ['wheat'],
        nutritionalInfo: { calories: 180, protein: 6, carbs: 28, fat: 8 },
      },

      // Main Courses (8 items)
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: mainCategory._id,
        name: { en: 'Grilled Chicken Breast', am: 'የተጠበሰ የዶሮ ጡት' },
        description: { en: 'Juicy grilled chicken breast with roasted vegetables and mashed potatoes', am: 'ከተጠበሱ አትክልቶች እና የተፈጨ ድንች ጋር ጣፋጭ የተጠበሰ የዶሮ ጡት' },
        type: 'food',
        price: 245,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 30,
        isGlutenFree: true,
        allergens: ['dairy'],
        nutritionalInfo: { calories: 520, protein: 48, carbs: 42, fat: 18 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: mainCategory._id,
        name: { en: 'Beef Steak', am: 'የበሬ ስቴክ' },
        description: { en: '300g premium ribeye steak cooked to your preference', am: '300 ግራም ፕሪሚየም የበሬ ስቴክ እንደፈለጉት የተበሰለ' },
        type: 'food',
        price: 450,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 35,
        isGlutenFree: true,
        nutritionalInfo: { calories: 680, protein: 62, carbs: 8, fat: 45 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: mainCategory._id,
        name: { en: 'Pasta Carbonara', am: 'ፓስታ ካርቦናራ' },
        description: { en: 'Classic Italian pasta with bacon, eggs, and parmesan cheese', am: 'ከቤከን፣ እንቁላል እና ፓርሜሳን አይብ ጋር ክላሲክ የጣሊያን ፓስታ' },
        type: 'food',
        price: 185,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 25,
        allergens: ['wheat', 'dairy', 'eggs'],
        nutritionalInfo: { calories: 580, protein: 28, carbs: 65, fat: 24 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: mainCategory._id,
        name: { en: 'Margherita Pizza', am: 'ማርጌሪታ ፒዛ' },
        description: { en: 'Traditional Italian pizza with fresh mozzarella, tomatoes, and basil', am: 'ከትኩስ ሞዛሬላ፣ ቲማቲም እና ባስል ጋር ባህላዊ የጣሊያን ፒዛ' },
        type: 'food',
        price: 220,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 20,
        isVegetarian: true,
        allergens: ['wheat', 'dairy'],
        nutritionalInfo: { calories: 720, protein: 32, carbs: 88, fat: 28 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: mainCategory._id,
        name: { en: 'Salmon Fillet', am: 'የሳልሞን ስጋ' },
        description: { en: 'Pan-seared salmon with lemon butter sauce and asparagus', am: 'ከሎሚ ቅቤ ጨው እና አስፓራጉስ ጋር በምጣድ ላይ የተጠበሰ ሳልሞን' },
        type: 'food',
        price: 380,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 28,
        isGlutenFree: true,
        allergens: ['fish', 'dairy'],
        nutritionalInfo: { calories: 480, protein: 42, carbs: 12, fat: 32 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: mainCategory._id,
        name: { en: 'Vegetable Stir Fry', am: 'የአትክልት ጥብስ' },
        description: { en: 'Mixed vegetables stir-fried with garlic and ginger sauce', am: 'ከነጭ ሸንኩርት እና ዝንጅብል ጨው ጋር የተጠበሱ የተቀላቀሉ አትክልቶች' },
        type: 'food',
        price: 145,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 18,
        isVegan: true,
        isGlutenFree: true,
        allergens: ['soy'],
        nutritionalInfo: { calories: 280, protein: 12, carbs: 45, fat: 8 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: mainCategory._id,
        name: { en: 'Lamb Chops', am: 'የበግ ጥብስ' },
        description: { en: 'Grilled lamb chops with rosemary and garlic', am: 'ከሮዝሜሪ እና ነጭ ሸንኩርት ጋር የተጠበሰ የበግ ጥብስ' },
        type: 'food',
        price: 420,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 32,
        isGlutenFree: true,
        nutritionalInfo: { calories: 620, protein: 52, carbs: 6, fat: 44 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: mainCategory._id,
        name: { en: 'Shrimp Pasta', am: 'የሽሪምፕ ፓስታ' },
        description: { en: 'Linguine pasta with jumbo shrimp in creamy garlic sauce', am: 'በክሬም የነጭ ሸንኩርት ጨው ውስጥ ከትልቅ ሽሪምፕ ጋር ሊንጉይን ፓስታ' },
        type: 'food',
        price: 295,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 24,
        allergens: ['shellfish', 'wheat', 'dairy'],
        nutritionalInfo: { calories: 540, protein: 38, carbs: 58, fat: 18 },
      },

      // Traditional Ethiopian (4 items)
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: ethiopianCategory._id,
        name: { en: 'Doro Wot', am: 'ዶሮ ወጥ' },
        description: { en: 'Traditional Ethiopian chicken stew with hard-boiled egg, served with injera', am: 'ከቆላ እንቁላል ጋር ባህላዊ የዶሮ ወጥ፣ ከእንጀራ ጋር የሚቀርብ' },
        type: 'food',
        price: 180,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 45,
        isSpicy: true,
        spicyLevel: 3,
        nutritionalInfo: { calories: 480, protein: 38, carbs: 52, fat: 16 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: ethiopianCategory._id,
        name: { en: 'Kitfo', am: 'ክትፎ' },
        description: { en: 'Minced raw beef marinated in mitmita and spiced butter', am: 'በምጥሚጣ እና በቅቤ የተቀመመ የተፈጨ ጥሬ የበሬ ስጋ' },
        type: 'food',
        price: 210,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 20,
        isSpicy: true,
        spicyLevel: 4,
        nutritionalInfo: { calories: 420, protein: 35, carbs: 8, fat: 28 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: ethiopianCategory._id,
        name: { en: 'Tibs', am: 'ጥብስ' },
        description: { en: 'Sautéed beef or lamb with onions, peppers, and Ethiopian spices', am: 'ከሽንኩርት፣ በርበሬ እና የኢትዮጵያ ቅመማቅመሞች ጋር የተጠበሰ የበሬ ወይም የበግ ስጋ' },
        type: 'food',
        price: 195,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 25,
        isSpicy: true,
        spicyLevel: 2,
        nutritionalInfo: { calories: 380, protein: 32, carbs: 15, fat: 22 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: ethiopianCategory._id,
        name: { en: 'Beyaynetu (Veggie Combo)', am: 'በያይነቱ' },
        description: { en: 'Assorted vegetarian dishes including lentils, split peas, cabbage, and greens', am: 'ምስር፣ ክክ፣ ጎመን እና ቆስጣን ጨምሮ የተለያዩ የጾም ምግቦች' },
        type: 'food',
        price: 135,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 30,
        isVegan: true,
        isGlutenFree: true,
        nutritionalInfo: { calories: 420, protein: 24, carbs: 68, fat: 8 },
      },

      // Beverages (2 items)
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: beveragesCategory._id,
        name: { en: 'Fresh Mango Juice', am: 'ትኩስ የማንጎ ጁስ' },
        description: { en: 'Freshly squeezed mango juice, no added sugar', am: 'አዲስ የተጨመቀ የማንጎ ጁስ፣ ተጨማሪ ስኳር የለውም' },
        type: 'drink',
        price: 65,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 5,
        requiresKitchen: false,
        isVegan: true,
        isGlutenFree: true,
        nutritionalInfo: { calories: 120, protein: 1, carbs: 28, fat: 0 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: beveragesCategory._id,
        name: { en: 'Ethiopian Coffee', am: 'የኢትዮጵያ ቡና' },
        description: { en: 'Traditional Ethiopian coffee ceremony style coffee', am: 'ባህላዊ የኢትዮጵያ የቡና ስነ ስርዓት ቡና' },
        type: 'drink',
        price: 45,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 15,
        requiresKitchen: false,
        isVegan: true,
        isGlutenFree: true,
        nutritionalInfo: { calories: 5, protein: 0, carbs: 0, fat: 0 },
      },

      // Desserts (2 items)
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: dessertsCategory._id,
        name: { en: 'Tiramisu', am: 'ቲራሚሱ' },
        description: { en: 'Classic Italian dessert with coffee-soaked ladyfingers and mascarpone cream', am: 'በቡና የተነከረ እና በማስካርፖን ክሬም ክላሲክ የጣሊያን ጣፋጭ' },
        type: 'food',
        price: 95,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 10,
        isVegetarian: true,
        allergens: ['dairy', 'eggs', 'wheat'],
        nutritionalInfo: { calories: 380, protein: 8, carbs: 42, fat: 20 },
      },
      {
        merchant: merchant._id,
        branch: branch._id,
        categoryId: dessertsCategory._id,
        name: { en: 'Chocolate Lava Cake', am: 'የቸኮሌት ላቫ ኬክ' },
        description: { en: 'Warm chocolate cake with molten center, served with vanilla ice cream', am: 'ሞቅ ያለ የቸኮሌት ኬክ ከቫኒላ አይስክሬም ጋር' },
        type: 'food',
        price: 110,
        available: true,
        inStock: true,
        publishStatus: 'published',
        preparationTime: 12,
        isVegetarian: true,
        allergens: ['dairy', 'eggs', 'wheat'],
        nutritionalInfo: { calories: 520, protein: 8, carbs: 58, fat: 28 },
      },
    ]);
    console.log(`✓ Created ${menuItems.length} menu items`);

    // Update all menu items to assign kitchen station
    if (kitchenStationId) {
      await MenuItem.updateMany(
        { 
          merchant: merchant._id,
          type: { $ne: 'drink' } // Only assign stations to food items
        },
        { 
          $set: { kitchenStation: kitchenStationId }
        }
      );
      console.log(`✓ Assigned kitchen station to food items\n`);
    } else {
      console.log(`⚠️  Kitchen station not assigned - tickets will not be created\n`);
    }

    // 5. Create Menu Groups (3 groups)
    console.log('📋 Creating menu groups...');
    const menuGroups = await MenuGroup.create([
      {
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Lunch Specials', am: 'የምሳ ልዩነቶች' },
        description: { en: 'Special lunch menu available from 12 PM to 3 PM', am: 'ከቀን 12 ሰዓት እስከ 3 ሰዓት የሚገኝ ልዩ የምሳ ምናሌ' },
        isActive: true,
        displayOrder: 1,
        availability: {
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          startTime: '12:00',
          endTime: '15:00',
        },
        items: [
          { menu: menuItems[4]._id, displayOrder: 1 }, // Grilled Chicken
          { menu: menuItems[6]._id, displayOrder: 2 }, // Pasta Carbonara
          { menu: menuItems[9]._id, displayOrder: 3 }, // Vegetable Stir Fry
          { menu: menuItems[14]._id, displayOrder: 4 }, // Mango Juice
        ],
      },
      {
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Weekend Brunch', am: 'የሳምንት መጨረሻ ቁርስ' },
        description: { en: 'Exclusive brunch menu available on weekends', am: 'በሳምንት መጨረሻ የሚገኝ ልዩ የቁርስ ምናሌ' },
        isActive: true,
        displayOrder: 2,
        availability: {
          days: ['saturday', 'sunday'],
          startTime: '09:00',
          endTime: '14:00',
        },
        items: [
          { menu: menuItems[2]._id, displayOrder: 1 }, // Caesar Salad
          { menu: menuItems[3]._id, displayOrder: 2 }, // Bruschetta
          { menu: menuItems[7]._id, displayOrder: 3 }, // Pizza
          { menu: menuItems[16]._id, displayOrder: 4 }, // Tiramisu
          { menu: menuItems[15]._id, displayOrder: 5 }, // Ethiopian Coffee
        ],
      },
      {
        merchant: merchant._id,
        branches: [branch._id],
        name: { en: 'Ethiopian Traditional Feast', am: 'የኢትዮጵያ ባህላዊ ግብዣ' },
        description: { en: 'Authentic Ethiopian dishes for the traditional food lover', am: 'ለባህላዊ ምግብ ወዳጅ ትክክለኛ የኢትዮጵያ ምግቦች' },
        isActive: true,
        displayOrder: 3,
        availability: {
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
          startTime: '11:00',
          endTime: '23:00',
        },
        items: [
          { menu: menuItems[10]._id, displayOrder: 1 }, // Doro Wot
          { menu: menuItems[11]._id, displayOrder: 2 }, // Kitfo
          { menu: menuItems[12]._id, displayOrder: 3 }, // Tibs
          { menu: menuItems[13]._id, displayOrder: 4 }, // Beyaynetu
          { menu: menuItems[15]._id, displayOrder: 5 }, // Ethiopian Coffee
        ],
      },
    ]);
    console.log(`✓ Created ${menuGroups.length} menu groups\n`);

    // 6. Create Combos (4 combos)
    console.log('🎁 Creating combos...');
    const combos = await Combo.create([
      {
        merchant: merchant._id,
        name: { en: 'Family Feast', am: 'የቤተሰብ ግብዣ' },
        description: { en: 'Perfect combo for the whole family - includes main courses, sides, and drinks', am: 'ለሙሉ ቤተሰብ ፍጹም ኮምቦ - ዋና ምግቦችን፣ ጎንዮሽ እና መጠጦችን ያካትታል' },
        comboPrice: 850,
        originalPrice: 1050,
        isActive: true,
        publishStatus: 'published',
        preparationTime: 40,
        items: [
          { menuItem: menuItems[5]._id, quantity: 2, nameFallback: 'Beef Steak' }, // Beef Steak
          { menuItem: menuItems[4]._id, quantity: 2, nameFallback: 'Grilled Chicken Breast' }, // Grilled Chicken
          { menuItem: menuItems[2]._id, quantity: 2, nameFallback: 'Caesar Salad' }, // Caesar Salad
          { menuItem: menuItems[14]._id, quantity: 4, nameFallback: 'Fresh Mango Juice' }, // Mango Juice
        ],
      },
      {
        merchant: merchant._id,
        name: { en: 'Date Night Special', am: 'የፍቅረኛ ምሽት ልዩ' },
        description: { en: 'Romantic dinner for two with appetizers, mains, and desserts', am: 'ለሁለት ሰው የፍቅር እራት ከመክሰስ፣ ዋና ምግብ እና ጣፋጭ ምግብ ጋር' },
        comboPrice: 680,
        originalPrice: 820,
        isActive: true,
        publishStatus: 'published',
        preparationTime: 50,
        items: [
          { menuItem: menuItems[1]._id, quantity: 1, nameFallback: 'Chicken Wings' }, // Chicken Wings
          { menuItem: menuItems[8]._id, quantity: 2, nameFallback: 'Salmon Fillet' }, // Salmon Fillet
          { menuItem: menuItems[16]._id, quantity: 2, nameFallback: 'Tiramisu' }, // Tiramisu
          { menuItem: menuItems[15]._id, quantity: 2, nameFallback: 'Ethiopian Coffee' }, // Ethiopian Coffee
        ],
      },
      {
        merchant: merchant._id,
        name: { en: 'Ethiopian Sampler', am: 'የኢትዮጵያ ናሙና' },
        description: { en: 'Try the best of Ethiopian cuisine - Doro Wot, Tibs, and Beyaynetu', am: 'የኢትዮጵያ ምግብን ምርጥ ይሞክሩ - ዶሮ ወጥ፣ ጥብስ እና በያይነቱ' },
        comboPrice: 420,
        originalPrice: 510,
        isActive: true,
        publishStatus: 'published',
        preparationTime: 45,
        items: [
          { menuItem: menuItems[10]._id, quantity: 1, nameFallback: 'Doro Wot' }, // Doro Wot
          { menuItem: menuItems[12]._id, quantity: 1, nameFallback: 'Tibs' }, // Tibs
          { menuItem: menuItems[13]._id, quantity: 1, nameFallback: 'Beyaynetu' }, // Beyaynetu
          { menuItem: menuItems[15]._id, quantity: 2, nameFallback: 'Ethiopian Coffee' }, // Ethiopian Coffee
        ],
      },
      {
        merchant: merchant._id,
        name: { en: 'Pizza Party Pack', am: 'የፒዛ ፓርቲ ፓኬጅ' },
        description: { en: 'Three pizzas with wings and salad - perfect for parties', am: 'ሦስት ፒዛዎች ከክንፍ እና ሰላጣ ጋር - ለድግስ ፍጹም' },
        comboPrice: 620,
        originalPrice: 770,
        isActive: true,
        publishStatus: 'published',
        preparationTime: 35,
        items: [
          { menuItem: menuItems[7]._id, quantity: 3, nameFallback: 'Margherita Pizza' }, // Pizza
          { menuItem: menuItems[1]._id, quantity: 2, nameFallback: 'Chicken Wings' }, // Chicken Wings
          { menuItem: menuItems[2]._id, quantity: 2, nameFallback: 'Caesar Salad' }, // Caesar Salad
        ],
      },
    ]);
    console.log(`✓ Created ${combos.length} combos\n`);

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SEEDING COMPLETE!\n');
    console.log(`📊 Summary:`);
    console.log(`   - Merchant: ${merchant.businessName}`);
    console.log(`   - Branch: ${branch.name}`);
    console.log(`   - Categories: ${categories.length}`);
    console.log(`   - Menu Items: ${menuItems.length}`);
    console.log(`   - Menu Groups: ${menuGroups.length}`);
    console.log(`   - Combos: ${combos.length}`);
    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding data:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

// Run the seeder
connectDB().then(() => seedMenuData());
