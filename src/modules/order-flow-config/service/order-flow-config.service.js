const OrderFlowConfigRepository = require('../repository/order-flow-config.repository');
const AppError = require('../../../../utils/appError');

/**
 * OrderFlowConfig Service
 * 
 * Business logic for order flow configuration management.
 */
class OrderFlowConfigService {
  /**
   * Get merchant's order flow configuration.
   * Lazy-creates with defaults if not exists.
   * 
   * @param {import('mongoose').Types.ObjectId} merchantId 
   * @returns {Promise<Object>}
   */
  static async getConfig(merchantId) {
    const config = await OrderFlowConfigRepository.findByMerchant(merchantId);
    
    return {
      merchantId: config.merchant,
      channels: config.channels,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Update merchant's order flow configuration.
   * 
   * @param {import('mongoose').Types.ObjectId} merchantId 
   * @param {Object} channelsUpdate - Partial channels update
   * @returns {Promise<Object>}
   */
  static async updateConfig(merchantId, channelsUpdate) {
    const config = await OrderFlowConfigRepository.updateChannels(
      merchantId,
      channelsUpdate
    );

    return {
      merchantId: config.merchant,
      channels: config.channels,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Get configuration for a specific channel.
   * 
   * @param {import('mongoose').Types.ObjectId} merchantId 
   * @param {string} channel - Channel name
   * @returns {Promise<{requiresReview: boolean, reviewerRole: string|null}>}
   */
  static async getChannelConfig(merchantId, channel) {
    return await OrderFlowConfigRepository.getChannelConfig(merchantId, channel);
  }
}

module.exports = OrderFlowConfigService;
