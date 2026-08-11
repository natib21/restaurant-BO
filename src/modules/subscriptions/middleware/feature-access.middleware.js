const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { SubscriptionService } = require('../services/subscription.service');

function requireFeature(feature) {
  return catchAsync(async (req, res, next) => {
    if (!feature || typeof feature !== 'string') {
      return next(new AppError('Feature is required for access control', 400));
    }

    const merchantId = getMerchantId(req);
    if (!merchantId) {
      return next(new AppError('Merchant context is required for feature gating', 401));
    }

    const result = await SubscriptionService.checkFeatureAccess(merchantId, feature);
    if (!result.hasAccess) {
      return next(new AppError(result.reason || 'Feature access denied', 403));
    }

    next();
  });
}

module.exports = { requireFeature };