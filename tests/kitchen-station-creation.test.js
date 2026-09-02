/**
 * Test Kitchen Station Creation Bug Fix
 * 
 * Tests that kitchen stations can be created when req.user.branch is an array
 * (as it is for staff users who can be assigned to multiple branches)
 */

const mongoose = require('mongoose');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const KitchenStation = require('../models/KitchenStation');
const KitchenTicketService = require('../src/modules/kitchen/service/KitchenTicketService');
const { resolveStaffBranchId, getMerchantId } = require('../src/common/utils/tenant-scope');

describe('Kitchen Station Creation Bug Fix', () => {
  let testMerchant;
  let testBranch;
  let testRole;
  let testUser;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/restaurant-test', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    // Clean up
    await KitchenStation.deleteMany({});
    await User.deleteMany({ email: 'kitchen-test@example.com' });
    await Branch.deleteMany({ name: 'Kitchen Test Branch' });
    await Merchant.deleteMany({ businessName: 'Kitchen Test Merchant' });
    await Role.deleteMany({ name: 'KITCHEN-TEST-STAFF' });

    // Create test role
    testRole = await Role.create({
      name: 'KITCHEN-TEST-STAFF',
      description: 'Test role for kitchen station creation',
      permissions: ['kitchen:manage'],
      isSystemRole: false,
    });

    // Create test merchant
    testMerchant = await Merchant.create({
      businessName: 'Kitchen Test Merchant',
      slug: 'kitchen-test-merchant',
      email: 'merchant@kitchentest.com',
      phone: '+251911111111',
      subscriptionTier: 'premium',
    });

    // Create test branch
    testBranch = await Branch.create({
      merchant: testMerchant._id,
      name: 'Kitchen Test Branch',
      address: {
        street: '123 Test St',
        city: 'Addis Ababa',
        country: 'Ethiopia',
      },
      location: {
        city: 'Addis Ababa',
        coordinates: [38.7578, 9.0320], // [longitude, latitude] for Addis Ababa
      },
      phone: '+251922222222',
      isActive: true,
    });

    // Create test user with branch as ARRAY (simulating staff with multiple branch access)
    testUser = await User.create({
      name: 'Kitchen Test Staff',
      email: 'kitchen-test@example.com',
      password: 'Test1234!',
      passwordConfirm: 'Test1234!',
      role: testRole._id,
      merchant: testMerchant._id,
      branch: [testBranch._id], // ← ARRAY, not single value
      phone: '+251933333333',
    });
  });

  afterAll(async () => {
    // Clean up
    await KitchenStation.deleteMany({});
    await User.deleteMany({ email: 'kitchen-test@example.com' });
    await Branch.deleteMany({ name: 'Kitchen Test Branch' });
    await Merchant.deleteMany({ businessName: 'Kitchen Test Merchant' });
    await Role.deleteMany({ name: 'KITCHEN-TEST-STAFF' });
    
    await mongoose.connection.close();
  });

  describe('KitchenStation Creation with Array Branch', () => {
    it('should resolve branchId correctly when user.branch is an array', () => {
      // Simulate req object with populated array branch
      const mockReq = {
        user: {
          _id: testUser._id,
          merchant: testMerchant._id,
          branch: [testBranch._id], // ARRAY
        },
      };

      const branchId = resolveStaffBranchId(mockReq);

      expect(branchId).toBeDefined();
      expect(typeof branchId).toBe('string');
      expect(branchId).toBe(testBranch._id.toString());
    });

    it('should resolve branchId correctly when user.branch is populated array', () => {
      // Simulate req object with fully populated branch documents
      const mockReq = {
        user: {
          _id: testUser._id,
          merchant: testMerchant._id,
          branch: [
            { 
              _id: testBranch._id, 
              name: 'Kitchen Test Branch',
              merchant: testMerchant._id 
            }
          ], // POPULATED ARRAY
        },
      };

      const branchId = resolveStaffBranchId(mockReq);

      expect(branchId).toBeDefined();
      expect(typeof branchId).toBe('string');
      expect(branchId).toBe(testBranch._id.toString());
    });

    it('should create a kitchen station with correctly extracted branchId', async () => {
      // Simulate req object
      const mockReq = {
        user: {
          _id: testUser._id,
          merchant: testMerchant._id,
          branch: [testBranch._id], // ARRAY (the bug scenario)
        },
      };

      const branchId = resolveStaffBranchId(mockReq);
      const merchantId = getMerchantId(mockReq);

      const stationData = {
        name: 'Grill Station',
        code: 'GRILL',
        description: 'Hot grill for meat and vegetables',
        displayOrder: 1,
      };

      // This would previously fail with "Cast to ObjectId failed for value [Array]"
      const station = await KitchenTicketService.createStation(
        stationData,
        merchantId,
        branchId
      );

      expect(station).toBeDefined();
      expect(station.name).toBe('Grill Station');
      expect(station.code).toBe('GRILL');
      expect(station.branch).toBeDefined();
      
      // ✅ KEY ASSERTION: branch should be stored as ObjectId, not an array
      expect(station.branch.toString()).toBe(testBranch._id.toString());
      expect(station.merchant.toString()).toBe(testMerchant._id.toString());

      // Verify it was actually saved correctly in the database
      const savedStation = await KitchenStation.findById(station._id);
      expect(savedStation).toBeDefined();
      expect(savedStation.branch.toString()).toBe(testBranch._id.toString());
    });

    it('should create multiple stations without conflict', async () => {
      const mockReq = {
        user: {
          merchant: testMerchant._id,
          branch: [testBranch._id],
        },
      };

      const branchId = resolveStaffBranchId(mockReq);
      const merchantId = getMerchantId(mockReq);

      const station1 = await KitchenTicketService.createStation(
        { name: 'Fry Station', code: 'FRY', description: 'Deep fryer', displayOrder: 2 },
        merchantId,
        branchId
      );

      expect(station1.code).toBe('FRY');
      expect(station1.branch.toString()).toBe(testBranch._id.toString());

      const station2 = await KitchenTicketService.createStation(
        { name: 'Cold Station', code: 'COLD', description: 'Salads', displayOrder: 3 },
        merchantId,
        branchId
      );

      expect(station2.code).toBe('COLD');
      expect(station2.branch.toString()).toBe(testBranch._id.toString());
    });

    it('should prevent duplicate station codes in same branch', async () => {
      const mockReq = {
        user: {
          merchant: testMerchant._id,
          branch: [testBranch._id],
        },
      };

      const branchId = resolveStaffBranchId(mockReq);
      const merchantId = getMerchantId(mockReq);

      await expect(
        KitchenTicketService.createStation(
          { name: 'Another Grill', code: 'GRILL', description: 'Duplicate', displayOrder: 4 },
          merchantId,
          branchId
        )
      ).rejects.toThrow('already exists');
    });

    it('should retrieve all stations for the branch', async () => {
      const mockReq = {
        user: {
          branch: [testBranch._id],
        },
      };

      const branchId = resolveStaffBranchId(mockReq);
      const stations = await KitchenTicketService.getAllStations(branchId, {});

      expect(stations).toBeDefined();
      expect(stations.length).toBeGreaterThan(0);
      
      // Verify branch IDs are consistent
      stations.forEach(station => {
        expect(station.branch.toString()).toBe(testBranch._id.toString());
      });
    });

    it('should update a station with correctly extracted branchId', async () => {
      const mockReq = {
        user: {
          merchant: testMerchant._id,
          branch: [testBranch._id],
        },
      };

      const branchId = resolveStaffBranchId(mockReq);
      const merchantId = getMerchantId(mockReq);

      // Create station
      const station = await KitchenTicketService.createStation(
        { name: 'Pizza Oven', code: 'PIZZA', description: 'Wood-fired', displayOrder: 5 },
        merchantId,
        branchId
      );

      // Update it
      const updated = await KitchenTicketService.updateStation(
        station._id,
        { description: 'Electric pizza oven - UPDATED', displayOrder: 10 },
        branchId
      );

      expect(updated.description).toBe('Electric pizza oven - UPDATED');
      expect(updated.displayOrder).toBe(10);
      expect(updated.branch.toString()).toBe(testBranch._id.toString());
    });
  });
});
