const OrderFlowConfig = require('../../../../models/OrderFlowConfig');
const logger = require('../../../../utils/logger');

/**
 * OrderFlowConfig Repository
 * 
 * Handles database operations for order flow configuration.
 */
class OrderFlowConfigRepository {
  /**
   * Find config by merchant ID, lazy-creating with defaults if not exists.
   * 
   * @param {import('mongoose').Types.ObjectId} merchantId 
   * @returns {Promise<import('mongoose').Document>}
   */
  static async findByMerchant(merchantId) {
    let config = await OrderFlowConfig.findOne({ merchant: merchantId });

    if (!config) {
      // Lazy-create with defaults
      config = await OrderFlowConfig.create({
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

      logger.info('order-flow-config.lazy-created', {
        merchantId: merchantId.toString(),
        configId: config._id.toString(),
      });
    }

    return config;
  }

  /**
   * Update config channels for a merchant.
   * 
   * @param {import('mongoose').Types.ObjectId} merchantId 
   * @param {Object} channelsUpdate - Partial channels update
   * @returns {Promise<import('mongoose').Document>}
   */
  static async updateChannels(merchantId, channelsUpdate) {
    // Ensure config exists first (lazy-create if needed)
    const config = await OrderFlowConfigRepository.findByMerchant(merchantId);

    // Apply updates
    for (const [channel, channelConfig] of Object.entries(channelsUpdate)) {
      if (channelConfig.requiresReview !== undefined) {
        config.channels[channel].requiresReview = channelConfig.requiresReview;
      }
      if (channelConfig.reviewerRole !== undefined) {
        config.channels[channel].reviewerRole = channelConfig.reviewerRole;
      }
    }

    // Save with validation
    await config.save();

    logger.info('order-flow-config.updated', {
      merchantId: merchantId.toString(),
      channels: Object.keys(channelsUpdate),
    });

    return config;
  }

  /**
   * Get config for a specific channel.
   * 
   * @param {import('mongoose').Types.ObjectId} merchantId 
   * @param {string} channel - Channel name ('waiter' | 'web' | 'admin' | 'telegram')
   * @returns {Promise<{requiresReview: boolean, reviewerRole: string|null}>}
   */
  static async getChannelConfig(merchantId, channel) {
    const config = await OrderFlowConfigRepository.findByMerchant(merchantId);
    return config.channels[channel];
  }
}

module.exports = OrderFlowConfigRepository;
