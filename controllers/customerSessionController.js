// controllers/customerAuthController.js
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const crypto = require('crypto');
const Customer = require('../models/customerModule');
const CustomerSession = require('../models/customerSessionModule');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/**
 * Generate JWT for Customer
 */
const signToken = (customerId, merchantId) => {
  return jwt.sign({ id: customerId, merchant: merchantId.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE_IN || '7d',
  });
};

const createSendToken = (customer, statusCode, res) => {
  const token = signToken(customer._id, customer.merchant);

  const cookieOptions = {
    expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRES_IN || 7) * 24 * 60 * 60 * 1000),
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  };

  res.cookie('jwt', token, cookieOptions);

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      customer: {
        _id: customer._id,
        fullName: customer.fullName,
        phone: customer.phone,
        currentTable: customer.currentTable || null,
        profileImage: customer.profileImage,
        source: customer.source,
        merchant: customer.merchant,
      },
    },
  });
};

// ────────────────────────── CUSTOMER AUTH ──────────────────────────

// 1. Create Session + Issue JWT
exports.createSession = catchAsync(async (req, res, next) => {
  const { customerId } = req.body;
  if (!customerId || !mongoose.Types.ObjectId.isValid(customerId))
    return next(new AppError('Valid customerId is required', 400));

  const customer = await Customer.findById(customerId).select(
    'merchant fullName phone currentTable profileImage source lastSeen'
  );

  if (!customer) return next(new AppError('Customer not found', 404));

  const sessionToken = crypto.randomBytes(32).toString('hex');
  await CustomerSession.create({
    customer: customer._id,
    token: sessionToken,
    deviceInfo: {
      userAgent: req.get('User-Agent') || 'Unknown',
      ip: req.ip || req.connection?.remoteAddress || 'Unknown',
    },
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  customer.lastSeen = new Date();
  await customer.save({ validateBeforeSave: false });

  createSendToken(customer, 200, res);
});

// 2. Protect Customer Routes
exports.protectCustomer = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) return next(new AppError('You are not logged in', 401));

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const customer = await Customer.findById(decoded.id);
  if (!customer) return next(new AppError('Customer no longer exists', 401));

  if (req.merchantId && decoded.merchant !== req.merchantId)
    return next(new AppError('Invalid merchant context', 403));

  req.customer = customer;
  next();
});

// 3. Customer: Logout (Current Device)
exports.logout = catchAsync(async (req, res, next) => {
  const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
  if (token) {
    await CustomerSession.updateOne({ token }, { isActive: false, expiresAt: new Date() });
  }

  res.clearCookie('jwt', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

// 4. Customer: Logout All Devices
exports.logoutAll = catchAsync(async (req, res, next) => {
  await CustomerSession.updateMany(
    { customer: req.customer._id },
    { isActive: false, expiresAt: new Date() }
  );

  res.clearCookie('jwt', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.status(200).json({ status: 'success', message: 'Logged out from all devices' });
});

// 5. Customer: Get My Active Sessions
exports.getMySessions = catchAsync(async (req, res, next) => {
  const sessions = await CustomerSession.find({
    customer: req.customer._id,
    isActive: true,
    expiresAt: { $gt: new Date() },
  })
    .select('deviceInfo.userAgent deviceInfo.ip createdAt expiresAt')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: sessions.length,
    data: { sessions },
  });
});

// ────────────────────────── ADMIN / MERCHANT FEATURES ──────────────────────────

// 6. Admin: Get All Active Sessions in This Merchant
exports.getAllActiveSessions = catchAsync(async (req, res, next) => {
  const merchantId = req.merchant._id; // from admin protect middleware

  const sessions = await CustomerSession.find({
    isActive: true,
    expiresAt: { $gt: new Date() },
  })
    .populate({
      path: 'customer',
      match: { merchant: merchantId },
      select: 'fullName phone currentTable source profileImage lastSeen',
    })
    .select('deviceInfo createdAt expiresAt')
    .sort('-createdAt');

  const validSessions = sessions
    .filter(s => s.customer) // only sessions belonging to this merchant
    .map(s => ({
      sessionId: s._id,
      customer: {
        _id: s.customer._id,
        fullName: s.customer.fullName,
        phone: s.customer.phone,
        table: s.customer.currentTable,
        source: s.customer.source,
        profileImage: s.customer.profileImage,
      },
      device: s.deviceInfo,
      loggedInAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));

  res.status(200).json({
    status: 'success',
    activeDiners: validSessions.length,
    data: { sessions: validSessions },
  });
});

// 7. Admin: Force Kill One Session
exports.forceKillSession = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;

  const session = await CustomerSession.findById(sessionId).populate({
    path: 'customer',
    match: { merchant: req.merchant._id },
  });

  if (!session || !session.customer) {
    return next(new AppError('Session not found or access denied', 404));
  }

  await CustomerSession.findByIdAndUpdate(sessionId, {
    isActive: false,
    expiresAt: new Date(),
  });

  res.status(200).json({
    status: 'success',
    message: 'Session terminated',
    data: { terminatedSession: sessionId },
  });
});

// 8. Admin: Force Logout Entire Customer
exports.forceLogoutCustomer = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;

  const customer = await Customer.findOne({ _id: customerId, merchant: req.merchant._id });
  if (!customer) return next(new AppError('Customer not found', 404));

  await CustomerSession.updateMany(
    { customer: customerId },
    { isActive: false, expiresAt: new Date() }
  );

  res.status(200).json({
    status: 'success',
    message: `All sessions for ${customer.fullName} terminated`,
  });
});

// 9. Admin: Real-time Active Diners Count (Dashboard Widget)
exports.getActiveDinersCount = catchAsync(async (req, res, next) => {
  const merchantId = req.merchant._id;

  const result = await CustomerSession.aggregate([
    { $match: { isActive: true, expiresAt: { $gt: new Date() } } },
    {
      $lookup: {
        from: 'customers',
        localField: 'customer',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: '$customer' },
    { $match: { 'customer.merchant': merchantId } },
    { $count: 'total' },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      activeDiners: result[0]?.total || 0,
      timestamp: new Date(),
    },
  });
});
