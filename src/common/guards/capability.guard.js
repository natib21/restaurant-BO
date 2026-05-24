const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');
const { userHasCapability } = require('../capabilities/capabilities');

/**
 * Optional capability enforcement (additive).
 * When CAPABILITY_ENFORCEMENT is not 'true', always passes (task RBAC still applies via restrictTo).
 */
function requireCapability(...requiredCapabilities) {
  return catchAsync(async (req, res, next) => {
    if (process.env.CAPABILITY_ENFORCEMENT !== 'true') {
      return next();
    }

    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const allowed = requiredCapabilities.some(cap => userHasCapability(req.user, cap));
    if (!allowed) {
      return next(new AppError('Insufficient capabilities for this action', 403));
    }

    next();
  });
}

module.exports = { requireCapability };
