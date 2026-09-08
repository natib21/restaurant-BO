// common/guards/feature.guard.js
const AppError = require('../../../utils/appError'); // confirm this path matches your existing AppError import elsewhere

const requireFeature = featureName => (req, res, next) => {
  const merchant = req.merchant || req.user?.merchant;
  if (!merchant?.hasActiveAccess) {
    return next(new AppError('Your subscription is not active', 403));
  }
  if (!merchant.hasFeature(featureName)) {
    return next(new AppError(`${featureName} is not enabled for this merchant`, 403));
  }
  next();
};

module.exports = { requireFeature };
