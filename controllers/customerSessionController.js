// controllers/customerAuthController.js
const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Table = require('../models/tabelModel');
const Merchant = require('../models/merchantModel');
const CustomerSession = require('../models/customerSessionModule');
const Branch = require('../models/branchModel');
/* ====================== 1. QR SCAN → START TABLE SESSION (Anonymous) ====================== */
exports.startTableSession = catchAsync(async (req, res, next) => {
  const { data, s: signature } = req.query;
  if (!data || !signature) return next(new AppError('Invalid QR code', 400));

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    console.log('DECODED PAYLOAD:', payload);
  } catch {
    return next(new AppError('Corrupted QR code', 400));
  }

  const { m: merchantId, b: branchId, t: tableId } = payload;

  console.log('Merchant Id : ', merchantId + ' table Id ', tableId, 'Branch Id : ' + branchId);
  if (!merchantId || !tableId || !branchId) return next(new AppError('QR missing data', 400));

  const branch = await Branch.findById(branchId).select('+qrSecretKey');

  if (!branch || !branch.qrSecretKey)
    return next(new AppError('Branch QR secret key missing. Contact support.', 404));

  // Re-create the exact same payload string that was signed
  const payloadString = JSON.stringify({
    m: merchantId.toString(),
    b: branchId.toString(),
    t: tableId.toString(),
  });

  console.log('branch Secret Me :', branch.qrSecretKey);

  // Re-compute signature (hex)
  const expectedSignature = crypto
    .createHmac('sha256', branch.qrSecretKey)
    .update(payloadString)
    .digest('hex');

  console.log('Signature :' + signature, 'ExpectedSign : ' + expectedSignature);
  // Compare hex strings – safe & simple
  if (expectedSignature !== signature) {
    return next(new AppError('Fake QR code', 403));
  }

  const table = await Table.findOne({ _id: tableId, branch: branchId, merchant: merchantId });
  if (!table) return next(new AppError('Table not found', 404));

  // Block if table already in use
  const active = await CustomerSession.findOne({
    table: table._id,
    branch: branchId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });
  if (table.status !== 'available') {
    return next(new AppError('Table is in use. Please wait or ask staff.', 409));
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  await CustomerSession.create({
    customer: null,
    merchant: merchantId,
    table: table._id,
    branch: branchId,
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
      table: table._id,
      tableNumber: table.tableNumber,
      branchId: branch._id,
      merchantId: merchantId,
      message: 'Welcome!',
    },
  });
});

/** @deprecated Use src/modules/customers/customer-session.guard */
exports.protectTableSession = require('../src/modules/customers').protectTableSession;

/* ====================== 3. FREE TABLE (Staff Only) ====================== */
exports.freeTable = catchAsync(async (req, res, next) => {
  const { tableId } = req.params;
  const merchantId = req.user.merchant._id;
  const branchId = req.user.branch._id;
  const table = await Table.findOne({ _id: tableId, branch: branchId, merchant: merchantId });
  if (!table) return next(new AppError('Table not found', 404));

  await CustomerSession.updateOne(
    { table: table._id, branch: branchId, isActive: true },
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
  const customer = req.customer;

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
  const { getMerchantId, resolveStaffBranchId } = require('../src/common/utils/tenant-scope');

  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context is required', 403));

  const filter = {
    merchant: merchantId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  };

  const branchId = resolveStaffBranchId(req);
  if (branchId) {
    filter.branch = branchId;
  }

  const sessions = await CustomerSession.find(filter)
    .populate('table', 'tableNumber status')
    .populate('branch', 'name location')
    .populate('customer', 'fullName phone');

  res.status(200).json({
    status: 'success',
    results: sessions.length,
    data: sessions,
  });
});

// ===================== GET SESSION BY TABLE =====================
exports.getSessionByTable = catchAsync(async (req, res, next) => {
  const { getMerchantId, resolveStaffBranchId } = require('../src/common/utils/tenant-scope');

  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context is required', 403));

  const branchId = resolveStaffBranchId(req);
  const { tableId } = req.params;

  const sessionFilter = {
    table: tableId,
    merchant: merchantId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  };
  if (branchId) sessionFilter.branch = branchId;

  const session = await CustomerSession.findOne(sessionFilter)
    .populate('customer', 'fullName phone')
    .populate('table', 'tableNumber status')
    .populate('branch', 'name location');

  if (!session) return next(new AppError('No active session for this table.', 404));

  res.status(200).json({
    status: 'success',
    data: session,
  });
});
