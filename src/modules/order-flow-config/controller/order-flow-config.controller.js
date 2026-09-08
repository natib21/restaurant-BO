const OrderFlowConfigService = require('../service/order-flow-config.service');
const catchAsync = require('../../../../utils/catchAsync');
const { sendResponse } = require('../../../../utils/sendResponse');
const { getMerchantId } = require('../../../common/utils/tenant-scope');

/**
 * GET /api/v1/order-flow-config
 * Get current merchant's order flow configuration
 * 
 * Guard: protect (JWT required)
 * Response: { success, data: { config: {...} } }
 */
exports.getConfig = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);

  const config = await OrderFlowConfigService.getConfig(merchantId);

  sendResponse(res, 200, 'config', config);
});

/**
 * PUT /api/v1/order-flow-config
 * Update current merchant's order flow configuration
 * 
 * Guard: protect (JWT required)
 * Body: { channels: { [channelName]: { requiresReview, reviewerRole } } }
 * Response: { success, data: { config: {...} } }
 */
exports.updateConfig = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  const { channels } = req.validatedBody || req.body;

  const config = await OrderFlowConfigService.updateConfig(merchantId, channels);

  sendResponse(res, 200, 'config', config, {
    message: 'Order flow configuration updated successfully',
  });
});
