/**
 * @file tests/auth-signup.test.js
 * @description Test to verify CRITICAL production bug fix: MERCHANT_ADMIN → SUPER-MERCHANT-ADMIN
 * 
 * Bug: auth.service.js line 279 was querying for 'MERCHANT_ADMIN' role instead of 'SUPER-MERCHANT-ADMIN'
 * Impact: All new user signups were failing with "System role not found" error
 * Fix: Changed Role.findOne({ name: 'MERCHANT_ADMIN' }) to Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' })
 * 
 * This test verifies the full signup flow works end-to-end after the fix.
 */

const mongoose = require('mongoose');
const { AuthService } = require('../src/modules/auth/auth.service');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const User = require('../models/userModel');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');
const MenuGroup = require('../models/menuGroupModel');
const Subscription = require('../models/subscriptionModel');

describe('Auth Signup - CRITICAL Bug Fix Verification', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up test data
    await Promise.all([
      User.deleteMany({ email: 'signuptest@test.com' }),
      Merchant.deleteMany({ businessName: 'Signup Test Restaurant' }),
      Branch.deleteMany({ name: /Signup Test/ }),
      MenuGroup.deleteMany({ name: /Signup Test/ })
    ]);
  });

  describe('AuthService.signup', () => {
    it('should successfully create new user with SUPER-MERCHANT-ADMIN role (CRITICAL BUG FIX)', async () => {
      // Verify SUPER-MERCHANT-ADMIN role exists in database
      const superMerchantAdminRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });
      expect(superMerchantAdminRole).toBeTruthy();
      expect(superMerchantAdminRole.name).toBe('SUPER-MERCHANT-ADMIN');
      console.log('✓ SUPER-MERCHANT-ADMIN role exists in database');

      // Prepare signup data
      const signupData = {
        firstName: 'Test',
        lastName: 'Owner',
        phone: '+251999888777',
        email: 'signuptest@test.com',
        business: 'Signup Test Restaurant',
        password: 'Test1234!',
        passwordConfirm: 'Test1234!'
      };

      // Execute signup (this is where the bug was - would fail with "System role not found")
      const newUser = await AuthService.signup(signupData);

      // Verify user was created successfully
      expect(newUser).toBeTruthy();
      expect(newUser._id).toBeTruthy();
      expect(newUser.firstName).toBe('Test');
      expect(newUser.lastName).toBe('Owner');
      expect(newUser.email).toBe('signuptest@test.com');
      expect(newUser.phone).toBe('+251999888777');
      console.log('✓ User created successfully with ID:', newUser._id.toString());

      // CRITICAL: Verify user has SUPER-MERCHANT-ADMIN role (not MERCHANT_ADMIN)
      expect(newUser.role).toBeTruthy();
      expect(newUser.role.name).toBe('SUPER-MERCHANT-ADMIN');
      console.log('✓ User assigned correct role: SUPER-MERCHANT-ADMIN');

      // Verify merchant was created
      expect(newUser.merchant).toBeTruthy();
      expect(newUser.merchant.businessName).toBe('Signup Test Restaurant');
      expect(newUser.merchant.slug).toBe('signup-test-restaurant');
      expect(newUser.merchant.subscriptionPlan).toBe('trial');
      expect(newUser.merchant.isSubscriptionActive).toBe(true);
      console.log('✓ Merchant created with trial subscription:', newUser.merchant.businessName);

      // Verify branch was created
      expect(newUser.branch).toBeTruthy();
      expect(Array.isArray(newUser.branch)).toBe(true);
      expect(newUser.branch.length).toBeGreaterThan(0);
      expect(newUser.branch[0].name).toContain('Main Branch');
      expect(newUser.branch[0].isMain).toBe(true);
      console.log('✓ Main branch created:', newUser.branch[0].name);

      // Verify default menu group was created
      const menuGroup = await MenuGroup.findOne({
        merchant: newUser.merchant._id,
        isSystemDefault: true
      });
      expect(menuGroup).toBeTruthy();
      expect(menuGroup.name).toBe('All Items (System Default)');
      console.log('✓ System default menu group created');

      // Verify role has tasks assigned (RBAC working)
      expect(newUser.role.tasks).toBeTruthy();
      expect(Array.isArray(newUser.role.tasks)).toBe(true);
      expect(newUser.role.tasks.length).toBeGreaterThan(0);
      console.log('✓ Role has', newUser.role.tasks.length, 'tasks assigned (RBAC active)');

      console.log('\n=== SIGNUP BUG FIX VERIFIED ===');
      console.log('The fix from MERCHANT_ADMIN → SUPER-MERCHANT-ADMIN is working correctly.');
      console.log('User signup completed successfully end-to-end.');
      console.log('================================\n');
    }, 30000);

    it('should reject duplicate email signup', async () => {
      const signupData = {
        firstName: 'Test',
        lastName: 'Owner',
        phone: '+251999888777',
        email: 'signuptest@test.com',
        business: 'Signup Test Restaurant',
        password: 'Test1234!',
        passwordConfirm: 'Test1234!'
      };

      // First signup should succeed
      await AuthService.signup(signupData);

      // Second signup with same email should fail
      await expect(AuthService.signup({
        ...signupData,
        business: 'Different Business',
        phone: '+251999888778'
      })).rejects.toThrow('Phone or email already in use');

      console.log('✓ Duplicate email rejection working correctly');
    }, 30000);

    it('should reject duplicate business name signup', async () => {
      const signupData = {
        firstName: 'Test',
        lastName: 'Owner',
        phone: '+251999888777',
        email: 'signuptest@test.com',
        business: 'Signup Test Restaurant',
        password: 'Test1234!',
        passwordConfirm: 'Test1234!'
      };

      // First signup should succeed
      await AuthService.signup(signupData);

      // Second signup with same business name should fail
      await expect(AuthService.signup({
        ...signupData,
        email: 'different@test.com',
        phone: '+251999888778'
      })).rejects.toThrow('Business name or phone already exists');

      console.log('✓ Duplicate business name rejection working correctly');
    }, 30000);
  });
});
