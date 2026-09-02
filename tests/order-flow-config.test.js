/**
 * Test: OrderFlowConfig Module (Step 2)
 * 
 * Tests merchant-configurable order routing rules:
 * - Lazy-creation with defaults
 * - Config persistence and retrieval
 * - Channel validation (matching Order.source enum)
 * - RequiresReview + reviewerRole validation
 * - Partial updates
 * - Merchant isolation
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');
const OrderFlowConfig = require('../models/OrderFlowConfig');
const OrderFlowConfigRepository = require('../src/modules/order-flow-config/repository/order-flow-config.repository');

describe('OrderFlowConfig Module', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await OrderFlowConfig.deleteMany({});
    await disconnectDatabase();
  });

  afterEach(async () => {
    await OrderFlowConfig.deleteMany({});
  });

  describe('Repository - Lazy Creation', () => {
    it('should lazy-create config with defaults when no config exists', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      const config = await OrderFlowConfigRepository.findByMerchant(merchantId);

      expect(config).toBeDefined();
      expect(config.merchant.toString()).toBe(merchantId.toString());

      // Verify defaults
      expect(config.channels.waiter.requiresReview).toBe(false);
      expect(config.channels.waiter.reviewerRole).toBe(null);

      expect(config.channels.web.requiresReview).toBe(true);
      expect(config.channels.web.reviewerRole).toBe('waiter');

      expect(config.channels.admin.requiresReview).toBe(true);
      expect(config.channels.admin.reviewerRole).toBe('support');

      expect(config.channels.telegram.requiresReview).toBe(true);
      expect(config.channels.telegram.reviewerRole).toBe('support');

      // Verify it's saved in database
      const savedConfig = await OrderFlowConfig.findOne({ merchant: merchantId });
      expect(savedConfig).toBeDefined();
      expect(savedConfig._id.toString()).toBe(config._id.toString());
    });

    it('should return existing config on subsequent calls without recreating', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // First call - creates
      const config1 = await OrderFlowConfigRepository.findByMerchant(merchantId);
      const configId1 = config1._id.toString();

      // Second call - retrieves existing
      const config2 = await OrderFlowConfigRepository.findByMerchant(merchantId);
      const configId2 = config2._id.toString();

      // Should be the same document
      expect(configId1).toBe(configId2);

      // Verify only one document exists
      const count = await OrderFlowConfig.countDocuments({ merchant: merchantId });
      expect(count).toBe(1);
    });
  });

  describe('Model - Channel Validation', () => {
    it('should enforce enum values for reviewerRole', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      await expect(
        OrderFlowConfig.create({
          merchant: merchantId,
          channels: {
            waiter: {
              requiresReview: true,
              reviewerRole: 'invalid_role', // Invalid
            },
          },
        })
      ).rejects.toThrow();
    });

    it('should reject requiresReview=true with reviewerRole=null', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      try {
        await OrderFlowConfig.create({
          merchant: merchantId,
          channels: {
            waiter: {
              requiresReview: true,
              reviewerRole: null, // Invalid combination
            },
          },
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Validation should throw an error
        expect(error).toBeDefined();
        expect(error.message).toMatch(/reviewerRole/);
      }
    });

    it('should allow requiresReview=false with reviewerRole=null', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      const config = await OrderFlowConfig.create({
        merchant: merchantId,
        channels: {
          waiter: {
            requiresReview: false,
            reviewerRole: null,
          },
          web: {
            requiresReview: true,
            reviewerRole: 'waiter',
          },
          admin: {
            requiresReview: true,
            reviewerRole: 'support',
          },
          telegram: {
            requiresReview: true,
            reviewerRole: 'support',
          },
        },
      });

      expect(config.channels.waiter.requiresReview).toBe(false);
      expect(config.channels.waiter.reviewerRole).toBe(null);
    });

    it('should allow requiresReview=false with reviewerRole="waiter"', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      const config = await OrderFlowConfig.create({
        merchant: merchantId,
        channels: {
          waiter: {
            requiresReview: false,
            reviewerRole: 'waiter', // Allowed (not enforced when requiresReview=false)
          },
          web: {
            requiresReview: true,
            reviewerRole: 'waiter',
          },
          admin: {
            requiresReview: true,
            reviewerRole: 'support',
          },
          telegram: {
            requiresReview: true,
            reviewerRole: 'support',
          },
        },
      });

      expect(config.channels.waiter.requiresReview).toBe(false);
      expect(config.channels.waiter.reviewerRole).toBe('waiter');
    });
  });

  describe('Repository - Partial Updates', () => {
    it('should update only specified channels without affecting others', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // Create initial config
      await OrderFlowConfigRepository.findByMerchant(merchantId);

      // Update only web channel
      const updated = await OrderFlowConfigRepository.updateChannels(merchantId, {
        web: {
          requiresReview: false,
          reviewerRole: null,
        },
      });

      // Web channel updated
      expect(updated.channels.web.requiresReview).toBe(false);
      expect(updated.channels.web.reviewerRole).toBe(null);

      // Other channels unchanged
      expect(updated.channels.waiter.requiresReview).toBe(false);
      expect(updated.channels.waiter.reviewerRole).toBe(null);

      expect(updated.channels.admin.requiresReview).toBe(true);
      expect(updated.channels.admin.reviewerRole).toBe('support');

      expect(updated.channels.telegram.requiresReview).toBe(true);
      expect(updated.channels.telegram.reviewerRole).toBe('support');
    });

    it('should update multiple channels in one call', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // Create initial config
      await OrderFlowConfigRepository.findByMerchant(merchantId);

      // Update web and telegram channels
      const updated = await OrderFlowConfigRepository.updateChannels(merchantId, {
        web: {
          requiresReview: false,
          reviewerRole: null,
        },
        telegram: {
          requiresReview: false,
          reviewerRole: null,
        },
      });

      // Both channels updated
      expect(updated.channels.web.requiresReview).toBe(false);
      expect(updated.channels.web.reviewerRole).toBe(null);

      expect(updated.channels.telegram.requiresReview).toBe(false);
      expect(updated.channels.telegram.reviewerRole).toBe(null);

      // Other channels unchanged
      expect(updated.channels.waiter.requiresReview).toBe(false);
      expect(updated.channels.admin.requiresReview).toBe(true);
    });

    it('should reject update with requiresReview=true and reviewerRole=null', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // Create initial config
      await OrderFlowConfigRepository.findByMerchant(merchantId);

      // Try invalid update
      await expect(
        OrderFlowConfigRepository.updateChannels(merchantId, {
          web: {
            requiresReview: true,
            reviewerRole: null, // Invalid
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Repository - getChannelConfig', () => {
    it('should retrieve specific channel configuration', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // Create config
      await OrderFlowConfigRepository.findByMerchant(merchantId);

      // Get web channel config
      const webConfig = await OrderFlowConfigRepository.getChannelConfig(merchantId, 'web');

      expect(webConfig.requiresReview).toBe(true);
      expect(webConfig.reviewerRole).toBe('waiter');
    });

    it('should return updated values after channel update', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // Create config
      await OrderFlowConfigRepository.findByMerchant(merchantId);

      // Update web channel
      await OrderFlowConfigRepository.updateChannels(merchantId, {
        web: {
          requiresReview: false,
          reviewerRole: null,
        },
      });

      // Get updated config
      const webConfig = await OrderFlowConfigRepository.getChannelConfig(merchantId, 'web');

      expect(webConfig.requiresReview).toBe(false);
      expect(webConfig.reviewerRole).toBe(null);
    });
  });

  describe('Merchant Isolation', () => {
    it('should maintain separate configs for different merchants', async () => {
      const merchant1 = new mongoose.Types.ObjectId();
      const merchant2 = new mongoose.Types.ObjectId();

      // Create config for merchant1
      const config1 = await OrderFlowConfigRepository.findByMerchant(merchant1);

      // Update merchant1's web channel
      await OrderFlowConfigRepository.updateChannels(merchant1, {
        web: {
          requiresReview: false,
          reviewerRole: null,
        },
      });

      // Create config for merchant2 (should have defaults)
      const config2 = await OrderFlowConfigRepository.findByMerchant(merchant2);

      // Verify merchant1's update
      const merchant1Config = await OrderFlowConfig.findOne({ merchant: merchant1 });
      expect(merchant1Config.channels.web.requiresReview).toBe(false);

      // Verify merchant2 has defaults (not affected by merchant1's update)
      expect(config2.channels.web.requiresReview).toBe(true);
      expect(config2.channels.web.reviewerRole).toBe('waiter');

      // Verify separate documents
      expect(config1._id.toString()).not.toBe(config2._id.toString());
    });

    it('should enforce unique merchant constraint', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      // Create first config
      await OrderFlowConfig.create({
        merchant: merchantId,
        channels: {
          waiter: { requiresReview: false, reviewerRole: null },
          web: { requiresReview: true, reviewerRole: 'waiter' },
          admin: { requiresReview: true, reviewerRole: 'support' },
          telegram: { requiresReview: true, reviewerRole: 'support' },
        },
      });

      // Try creating duplicate
      await expect(
        OrderFlowConfig.create({
          merchant: merchantId,
          channels: {
            waiter: { requiresReview: false, reviewerRole: null },
            web: { requiresReview: true, reviewerRole: 'waiter' },
            admin: { requiresReview: true, reviewerRole: 'support' },
            telegram: { requiresReview: true, reviewerRole: 'support' },
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Channel Keys - Match Order.source Enum', () => {
    it('should only have the four channel keys matching Order.source', async () => {
      const merchantId = new mongoose.Types.ObjectId();

      const config = await OrderFlowConfigRepository.findByMerchant(merchantId);

      const channelKeys = Object.keys(config.channels.toObject());
      
      expect(channelKeys).toHaveLength(4);
      expect(channelKeys).toContain('waiter');
      expect(channelKeys).toContain('web');
      expect(channelKeys).toContain('admin');
      expect(channelKeys).toContain('telegram');
    });
  });
});
