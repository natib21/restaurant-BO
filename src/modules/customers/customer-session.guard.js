const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../common/errors');
const CustomerSession = require('../../../models/customerSessionModule'); // Alias to DiningSession
const DiningSession = require('../../../models/DiningSession');
const Merchant = require('../../../models/merchantModel');
const logger = require('../../../utils/logger');

const SESSION_EXTENSION_MS = () => {
  const hours = Number(process.env.SESSION_DURATION_HOURS) || 4;
  return hours * 60 * 60 * 1000;
};

/**
 * Validates table QR session token and populates unified request context.
 * Populates full merchant object for feature guard compatibility.
 * 
 * ✅ UPDATED: Now fetches DiningSession and populates req.diningSession
 */
const protectTableSession = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    logger.debug('protectTableSession.no_token', { path: req.path });
    return next(new AppError('You are not logged in. Please scan the QR code again.', 401));
  }

  logger.debug('protectTableSession.validating_token', { path: req.path, tokenLength: token.length });

  // ✅ Use DiningSession directly (CustomerSession is now an alias)
  const session = await DiningSession.findOne({
    token,
    status: 'active',  // ✅ Updated to use status field
  });

  if (!session) {
    logger.warn('protectTableSession.session_not_found_or_expired', {
      path: req.path,
      tokenLength: token.length,
    });
    return next(new AppError('Session expired or invalid. Please scan the QR code again.', 401));
  }

  logger.debug('protectTableSession.session_found', {
    path: req.path,
    sessionId: session._id.toString().slice(-6),
    merchantId: session.merchant.toString().slice(-6),
  });

  // ✅ Extend session expiration
  session.expiresAt = new Date(Date.now() + SESSION_EXTENSION_MS());
  await session.save();

  // ✅ Populate full merchant object for feature guard
  const merchant = await Merchant.findById(session.merchant).select(
    'businessName isActive status isSubscriptionActive features subscription'
  );

  if (!merchant || !merchant.isActive) {
    logger.warn('protectTableSession.merchant_not_active', {
      path: req.path,
      merchantExists: !!merchant,
      merchantActive: merchant?.isActive,
    });
    return next(new AppError('Restaurant is not available at this time.', 403));
  }

  // ✅ Populate request context
  req.tableSession = session;  // Backward compatibility
  req.diningSession = session;  // ✅ NEW: Explicit dining session reference
  req.merchantId = session.merchant;
  req.merchant = merchant;
  req.branchId = session.branch;
  req.tableId = session.table;
  req.customerId = session.customer || null;  // May be null for QR sessions
  req.isAnonymous = !session.customer;

  if (!req.ctx)
    req.ctx = { requestId: req.requestId, requestTime: req.requestTime, actorType: 'anonymous' };
  req.ctx.merchantId = session.merchant;
  req.ctx.branchId = session.branch;
  req.ctx.tableId = session.table;
  req.ctx.customerId = session.customer;
  req.ctx.sessionId = session._id;  // ✅ NEW: Session ID for order creation
  req.ctx.sessionToken = token;
  req.ctx.actorType = session.customer ? 'customer' : 'anonymous';
  if (session.customer) req.ctx.actorId = session.customer;

  logger.debug('protectTableSession.success', {
    path: req.path,
    sessionId: session._id.toString().slice(-6),
    tableId: req.tableId.toString().slice(-6),
  });

  next();
});

module.exports = { protectTableSession };
