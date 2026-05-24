// controllers/customerAuthController.js
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const CustomerSession = require('../models/customerSessionModule');
const { BranchService } = require('../src/modules/branch');

/* ====================== 1. QR SCAN → START TABLE SESSION (Anonymous) ====================== */
exports.startTableSession = catchAsync(async (req, res) => {
  const data = await BranchService.startTableSessionFromQr(req.query);

  res.status(200).json({
    status: 'success',
    data,
  });
});

/** @deprecated Use src/modules/customers/customer-session.guard */
exports.protectTableSession = require('../src/modules/customers').protectTableSession;

/* ====================== 3. FREE TABLE (Staff Only) ====================== */
exports.freeTable = catchAsync(async (req, res, next) => {
  const { tableId } = req.params;
  const merchantId = req.user.merchant._id;
  const branchId = req.user.branch._id;

  const data = await BranchService.freeTable({ tableId, merchantId, branchId });

  res.status(200).json({
    status: 'success',
    message: 'Table freed',
    data,
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
