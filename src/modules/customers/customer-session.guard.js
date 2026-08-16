const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../common/errors');
const CustomerSession = require('../../../models/customerSessionModule');

const SESSION_EXTENSION_MS = () => {
  const hours = Number(process.env.SESSION_DURATION_HOURS) || 4;
  return hours * 60 * 60 * 1000;
};

/**
 * Validates table QR session token and populates unified request context.
 */
const protectTableSession = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please scan the QR code again.', 401));
  }

  const session = await CustomerSession.findOne({
    token,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    return next(new AppError('Session expired or invalid. Please scan the QR code again.', 401));
  }

  session.expiresAt = new Date(Date.now() + SESSION_EXTENSION_MS());
  await session.save();

  req.tableSession = session;
  req.merchantId = session.merchant;
  req.branchId = session.branch;
  req.tableId = session.table;
  req.customerId = session.customer;
  req.isAnonymous = !session.customer;

  if (!req.ctx)
    req.ctx = { requestId: req.requestId, requestTime: req.requestTime, actorType: 'anonymous' };
  req.ctx.merchantId = session.merchant;
  req.ctx.branchId = session.branch;
  req.ctx.tableId = session.table;
  req.ctx.customerId = session.customer;
  req.ctx.sessionToken = token;
  req.ctx.actorType = session.customer ? 'customer' : 'anonymous';
  if (session.customer) req.ctx.actorId = session.customer;

  next();
});

module.exports = { protectTableSession };
