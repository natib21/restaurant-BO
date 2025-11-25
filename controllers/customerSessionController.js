// controllers/customerAuthController.js
const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Table = require('../models/tabelModel')
const Merchant = require('../models/merchantModel');
const CustomerSession = require('../models/customerSessionModule');

/* ====================== 1. QR SCAN → START TABLE SESSION (Anonymous) ====================== */
exports.startTableSession = catchAsync(async (req, res, next) => {
  const { data, s: signature } = req.body;
  if (!data || !signature) return next(new AppError('Invalid QR code', 400));

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return next(new AppError('Corrupted QR code', 400));
  }

  const { m: merchantId, t: tableId } = payload;
  if (!merchantId || !tableId) return next(new AppError('QR missing data', 400));

  const merchant = await Merchant.findById(merchantId).select('+qr_secret_key');
  if (!merchant || !merchant.qr_secret_key) return next(new AppError('Invalid merchant', 404));

  const expectedSig = crypto
    .createHmac('sha256', merchant.qr_secret_key)
    .update(Buffer.from(data, 'base64url').toString('utf8'))
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
    return next(new AppError('Fake QR code', 403));
  }

  const table = await Table.findOne({ _id: tableId, merchant: merchantId });
  if (!table) return next(new AppError('Table not found', 404));

  // Block if table already in use
  const active = await CustomerSession.findOne({
    tableId: table._id,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });
  if (active) {
    return next(new AppError('Table is in use. Please wait or ask staff.', 409));
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  await CustomerSession.create({
    customer: null,
    merchant: merchantId,
    tableId: table._id,
    token: sessionToken,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
    isActive: true,
  });

  table.status = 'occupied';
  await table.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    data: {
      sessionToken,
      tableId: table._id,
      tableNumber: table.tableNumber,
      message: 'Welcome!',
    },
  });
});

/* ====================== 2. PROTECT TABLE SESSION (All Menu/Order Routes) ====================== */
exports.protectTableSession = catchAsync(async (req, res, next) => {
  let token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(new AppError('Session token required', 401));

  const session = await CustomerSession.findOne({
    token,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });

  if (!session) return next(new AppError('Invalid or expired session', 401));

  req.tableSession = session;
  req.merchantId = session.merchant;
  req.tableId = session.tableId;
  req.customer = session.customer; // null or real customer ID

  next();
});

/* ====================== 3. FREE TABLE (Staff Only) ====================== */
exports.freeTable = catchAsync(async (req, res, next) => {
  const { tableId } = req.params;
  const merchantId = req.user.merchant._id;

  const table = await Table.findOne({ _id: tableId, merchant: merchantId });
  if (!table) return next(new AppError('Table not found', 404));

  await CustomerSession.updateOne(
    { tableId: table._id, isActive: true },
    { isActive: false, expiresAt: new Date() }
  );

  table.status = 'available';
  await table.save();

  res.status(200).json({
    status: 'success',
    message: 'Table freed',
    data: { tableNumber: table.tableNumber },
  });
});

/* ====================== 4. LINK ACCOUNT (After loginOrCreate) ====================== */
exports.linkAccount = catchAsync(async (req, res, next) => {
  const { sessionToken } = req.body;
  const customer = req.customer; // from your JWT protect middleware

  const session = await CustomerSession.findOne({
    token: sessionToken,
    customer: null,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });

  if (!session) return next(new AppError('No active table session', 404));

  session.customer = customer._id;
  await session.save();

  res.status(200).json({
    status: 'success',
    message: 'Account linked! Welcome back.',
    data: { fullName: customer.fullName },
  });
});

// ===================== GET ALL ACTIVE TABLE SESSIONS (Admin) =====================
exports.getAllSessions = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const sessions = await CustomerSession.find({
    merchant: merchantId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  })
    .populate('tableId', 'tableNumber status')
    .populate('customer', 'fullName phone');

  res.status(200).json({
    status: 'success',
    results: sessions.length,
    data: sessions,
  });
});


// ===================== GET SESSION BY TABLE =====================
exports.getSessionByTable = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { tableId } = req.params;

  const session = await CustomerSession.findOne({
    tableId,
    merchant: merchantId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  })
    .populate('customer', 'fullName phone')
    .populate('tableId', 'tableNumber status');

  if (!session) {
    return next(new AppError('No active session for this table.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: session,
  });
});
