/**
 * Menu Module Phase A + B Integration Tests
 * 
 * Focused on database-level validation of Phase A and Phase B fixes
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const Menu = require('../models/menuModel');
const Combo = require('../models/comboModel');
const MenuGroup = require('../models/menuGroupModel');
const FileAsset = require('../models/FileAsset');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');

let merchant1Id, merchant2Id;
let branch1Id, branch2Id;

beforeAll(async () => {
  await connectDatabase();

  // Create Merchant 1
  const merchant1 = await Merchant.create({
    businessName: 'Test Merchant 1',
    slug: 'test-merchant-1',
    email: 'merchant1@test.com',
    phone: '+251911111111',
    status: 'approved',
    isActive: true,
    mode: 'Test',
    owner: {
      email: 'owner1@test.com',
      fullName: 'Owner One',
      firstName: 'Owner',
      lastName: 'One',
      phone: '+251911111111',
      gender: 'Male',
    },
  });
  merchant1Id = merchant1._id;

  const branch1 = await Branch.create({
    merchant: merchant1Id,
    name: 'Branch 1',
    phone: '+251911111111',
    isMain: true,
    isActive: true,
    branchCode: 'BR-001',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
    },
  });
  branch1Id = branch1._id;

  // Create Merchant 2
  const merchant2 = await Merchant.create({
    businessName: 'Test Merchant 2',
    slug: 'test-merchant-2',
    email: 'merchant2@test.com',
    phone: '+251922222222',
    status: 'approved',
    isActive: true,
    mode: 'Test',
    owner: {
      email: 'owner2@test.com',
      fullName: 'Owner Two',
      firstName: 'Owner',
      lastName: 'Two',
      phone: '+251922222222',
      gender: 'Male',
    },
  });
  merchant2Id = merchant2._id;

  const branch2 = await Branch.create({
    merchant: merchant2Id,
    name: 'Branch 2',
    phone: '+251922222222',
    isMain: true,
    isActive: true,
    branchCode: 'BR-002',
    location: {
      type: 'Point',
      coordinates: [38.7578, 9.025],
      city: 'Addis Ababa',
    },
  });
  branch2Id = branch2._id;
});

afterAll(async () => {
  await Menu.deleteMany({});
  await Combo.deleteMany({});
  await MenuGroup.deleteMany({});
  await FileAsset.deleteMany({});
  await Branch.deleteMany({});
  await Merchant.deleteMany({});
  await disconnectDatabase();
});

afterEach(async () => {
  await Menu.deleteMany({});
  await Combo.deleteMany({});
  await MenuGroup.deleteMany({});
  await FileAsset.deleteMany({});
});

describe('Menu Phase A + B Integration Tests', () => {
  // ========================================================================
  // Phase A: Bug Fixes (Correctness, Security, Data Integrity)
  // ========================================================================

  describe('Phase A - Test 1: Multi-tenant Isolation', () => {
    it('should NOT return Merchant B combos in Merchant A query', async () => {
      // Create combo for Merchant 1
      const combo1 = await Combo.create({
        name: 'Merchant 1 Combo',
        merchant: merchant1Id,
        branches: [branch1Id],
        comboPrice: 100,
        items: [{ menuItem: new mongoose.Types.ObjectId(), nameFallback: 'Item 1', quantity: 1 }],
        isActive: true,
      });

      // Create combo for Merchant 2
      const combo2 = await Combo.create({
        name: 'Merchant 2 Combo',
        merchant: merchant2Id,
        branches: [branch2Id],
        comboPrice: 200,
        items: [{ menuItem: new mongoose.Types.ObjectId(), nameFallback: 'Item 2', quantity: 1 }],
        isActive: true,
      });

      // Query for Merchant 1 combos only
      const merchant1Combos = await Combo.find({ merchant: merchant1Id });

      expect(merchant1Combos).toHaveLength(1);
      expect(merchant1Combos[0].name).toBe('Merchant 1 Combo');
      expect(merchant1Combos[0].merchant.toString()).toBe(merchant1Id.toString());
      
      // Ensure Merchant 2's combo is NOT in the result
      const comboIds = merchant1Combos.map(c => c._id.toString());
      expect(comboIds).not.toContain(combo2._id.toString());
    });
  });

  describe('Phase A - Test 2: Active Menu Day/Time Filtering', () => {
    it('should store activeDays correctly', async () => {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      const group = await MenuGroup.create({
        name: 'Today Group',
        merchant: merchant1Id,
        branches: [branch1Id],
        activeDays: [today],
        items: [],
      });

      const retrieved = await MenuGroup.findById(group._id);
      expect(retrieved.activeDays).toContain(today);
    });

    it('should store blockedDays correctly', async () => {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      const group = await MenuGroup.create({
        name: 'Blocked Today Group',
        merchant: merchant1Id,
        branches: [branch1Id],
        blockedDays: [today],
        items: [],
      });

      const retrieved = await MenuGroup.findById(group._id);
      expect(retrieved.blockedDays).toContain(today);
    });
  });

  describe('Phase A - Test 3: Recipe Ingredients Persist Correctly', () => {
    it('should persist recipe.ingredients at correct schema path', async () => {
      const menuItem = await Menu.create({
        name: 'Pizza',
        merchant: merchant1Id,
        branches: [branch1Id],
        category: 'Main',
        price: 100,
        recipe: {
          ingredients: [
            { ingredient: new mongoose.Types.ObjectId(), quantity: 2, unit: 'kg' },
            { ingredient: new mongoose.Types.ObjectId(), quantity: 500, unit: 'g' },
          ],
        },
      });

      const retrieved = await Menu.findById(menuItem._id);
      expect(retrieved.recipe).toBeDefined();
      expect(retrieved.recipe.ingredients).toHaveLength(2);
      expect(retrieved.recipe.ingredients[0].quantity).toBe(2);
      expect(retrieved.recipe.ingredients[0].unit).toBe('kg');
      expect(retrieved.recipe.ingredients[1].quantity).toBe(500);
      expect(retrieved.recipe.ingredients[1].unit).toBe('g');
    });
  });

  describe('Phase A - Test 4: Variant Price Validation', () => {
    it('should reject menu item with variant missing price', async () => {
      const invalidMenuItem = {
        name: 'Burger with Invalid Variant',
        merchant: merchant1Id,
        branches: [branch1Id],
        category: 'Main',
        basePrice: 50,
        variants: [
          {
            name: 'Large',
            // Missing price field
          },
        ],
      };

      await expect(Menu.create(invalidMenuItem)).rejects.toThrow();
    });

    it('should reject menu item with negative variant price', async () => {
      const invalidMenuItem = {
        name: 'Burger with Negative Price',
        merchant: merchant1Id,
        branches: [branch1Id],
        category: 'Main',
        basePrice: 50,
        variants: [
          {
            name: 'Large',
            price: -10,
          },
        ],
      };

      await expect(Menu.create(invalidMenuItem)).rejects.toThrow();
    });
  });

  describe('Phase A - Test 5: PublishStatus Filtering', () => {
    it('should filter by publishStatus correctly', async () => {
      // Create published item
      const publishedItem = await Menu.create({
        name: 'Published Burger',
        merchant: merchant1Id,
        branches: [branch1Id],
        category: 'Main',
        price: 50,
        publishStatus: 'published',
        isAvailable: true,
      });

      // Create draft item
      const draftItem = await Menu.create({
        name: 'Draft Pizza',
        merchant: merchant1Id,
        branches: [branch1Id],
        category: 'Main',
        price: 100,
        publishStatus: 'draft',
        isAvailable: true,
      });

      // Query only published items
      const publishedItems = await Menu.find({ 
        merchant: merchant1Id, 
        publishStatus: 'published' 
      });

      expect(publishedItems).toHaveLength(1);
      expect(publishedItems[0].name).toBe('Published Burger');
      
      const itemNames = publishedItems.map(item => item.name);
      expect(itemNames).not.toContain('Draft Pizza');
    });
  });

  // ========================================================================
  // Phase B: File/Image Handling
  // ========================================================================

  describe('Phase B - Test 6: Orphaned FileAsset Cleanup Logic', () => {
    it('should support soft-delete workflow for FileAssets', async () => {
      const menuItem = await Menu.create({
        name: 'Burger',
        merchant: merchant1Id,
        branches: [branch1Id],
        category: 'Main',
        price: 50,
      });

      // Create first FileAsset
      const fileAsset1 = await FileAsset.create({
        merchant: merchant1Id,
        branch: branch1Id,
        originalName: 'burger1.jpg',
        storageKey: '/uploads/burger1-123.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        entityType: 'menu',
        entityId: menuItem._id,
        purpose: 'image',
        isDeleted: false,
      });

      menuItem.image = fileAsset1._id;
      await menuItem.save();

      // Create second FileAsset
      const fileAsset2 = await FileAsset.create({
        merchant: merchant1Id,
        branch: branch1Id,
        originalName: 'burger2.jpg',
        storageKey: '/uploads/burger2-456.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        entityType: 'menu',
        entityId: menuItem._id,
        purpose: 'image',
        isDeleted: false,
      });

      // Update menu with second image
      menuItem.image = fileAsset2._id;
      await menuItem.save();

      // Soft-delete first FileAsset (simulating cleanup in controller)
      await FileAsset.findByIdAndUpdate(fileAsset1._id, {
        isDeleted: true,
        deletedAt: new Date(),
      });

      // Verify first FileAsset is soft-deleted
      const deletedAsset = await FileAsset.findById(fileAsset1._id);
      expect(deletedAsset.isDeleted).toBe(true);
      expect(deletedAsset.deletedAt).toBeDefined();

      // Verify second FileAsset is still active
      const activeAsset = await FileAsset.findById(fileAsset2._id);
      expect(activeAsset.isDeleted).toBe(false);
    });
  });

  describe('Phase B - Test 7: Legacy Field Removal', () => {
    it('should NOT have imageUrl or imageFilename fields in new menu items', async () => {
      const menuItem = await Menu.create({
        name: 'New Burger',
        merchant: merchant1Id,
        branches: [branch1Id],
        category: 'Main',
        price: 50,
      });

      const retrieved = await Menu.findById(menuItem._id).lean();
      
      // Legacy fields should NOT exist
      expect(retrieved.imageUrl).toBeUndefined();
      expect(retrieved.imageFilename).toBeUndefined();
    });

    it('should support FileAsset reference in image field', async () => {
      const fileAsset = await FileAsset.create({
        merchant: merchant1Id,
        branch: branch1Id,
        originalName: 'burger.jpg',
        storageKey: '/uploads/burger-789.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        entityType: 'menu',
        purpose: 'image',
        isDeleted: false,
      });

      const menuItem = await Menu.create({
        name: 'Burger with FileAsset',
        merchant: merchant1Id,
        branches: [branch1Id],
        category: 'Main',
        price: 50,
        image: fileAsset._id,
      });

      const retrieved = await Menu.findById(menuItem._id);
      expect(retrieved.image).toBeDefined();
      expect(retrieved.image.toString()).toBe(fileAsset._id.toString());
    });
  });

  describe('Phase B - Test 8: Combo Image Virtual', () => {
    it('should return null imageData for combo with no image', async () => {
      const combo = await Combo.create({
        name: 'Combo No Image',
        merchant: merchant1Id,
        branches: [branch1Id],
        comboPrice: 100,
        items: [{ menuItem: new mongoose.Types.ObjectId(), nameFallback: 'Item 1', quantity: 1 }],
      });

      const retrieved = await Combo.findById(combo._id);
      
      // imageData virtual should return null when no image
      expect(retrieved.imageData === null || retrieved.imageData === undefined).toBe(true);
    });
  });
});
