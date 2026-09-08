const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');
const { userHasCapability } = require('../capabilities/capabilities');

/**
 * ✅ P0-002: Mandatory capability enforcement (non-optional).
 * 
 * Capability checks are ALWAYS enforced — cannot be disabled via environment variable.
 * This provides a critical additional layer of authorization beyond task-based RBAC.
 * 
 * If capability enforcement is not properly configured in production, startup should fail.
 * @see src/server.js for NODE_ENV=production validation
 */
function requireCapability(...requiredCapabilities) {
  return catchAsync(async (req, res, next) => {
    // ✅ REMOVED: Optional bypass via CAPABILITY_ENFORCEMENT env var
    // ❌ OLD CODE (deleted):
    // if (process.env.CAPABILITY_ENFORCEMENT !== 'true') {
    //   return next();  // SECURITY ISSUE: Silently bypassed all capability checks
    // }

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
