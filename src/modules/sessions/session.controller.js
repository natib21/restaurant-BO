/**
 * @file src/modules/sessions/session.controller.js
 * @description QR table session management — no legacy dependency.
 */

const CustomerSession = require('../../../models/customerSessionModule');
const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');
const { getMerchantId, resolveStaffBranchId } = require('../../common/utils/tenant-scope');
const { BranchService } = require('../branch/service/BranchService');

// POST /api/v1/sessions/start  — QR scan → create anonymous table session
exports.startTableSession = catchAsync(async (req, res) => {
  const data = await BranchService.startTableSessionFromQr(req.query);
  res.status(200).json({ status: 'success', data });
});

// POST /api/v1/sessions/link  — link a customer account to an existing session
exports.linkAccount = catchAsync(async (req, res, next) => {
  const { sessionToken } = req.body;
  const customer = req.customer;

  const session = await CustomerSession.findOne({
    token: sessionToken,
    customer: null,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });

  if (!session) return next(new AppError('No active table session found', 404));

  session.customer = customer._id;
  await session.save();

  res
    .status(200)
    .json({ status: 'success', message: 'Account linked!', data: { fullName: customer.fullName } });
});

// PATCH /api/v1/sessions/:id/free  — staff frees a table
exports.freeTable = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context required', 403));

  const branchId = resolveStaffBranchId(req);
  const data = await BranchService.freeTable({ tableId: req.params.id, merchantId, branchId });

  res.status(200).json({ status: 'success', message: 'Table freed', data });
});

// GET /api/v1/sessions  — list all active sessions for branch
exports.getAllSessions = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context required', 403));

  const filter = { merchant: merchantId, isActive: true, expiresAt: { $gt: new Date() } };
  const branchId = resolveStaffBranchId(req);
  if (branchId) filter.branch = branchId;

  const sessions = await CustomerSession.find(filter)
    .populate('table', 'tableNumber status')
    .populate('branch', 'name')
    .populate('customer', 'fullName phone');

  res.status(200).json({ status: 'success', results: sessions.length, data: { sessions } });
});

// GET /api/v1/sessions/table/:tableId  — get active session for a specific table
exports.getSessionByTable = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context required', 403));

  const branchId = resolveStaffBranchId(req);
  const filter = {
    table: req.params.tableId,
    merchant: merchantId,
    isActive: true,
    expiresAt: { $gt: new Date() },
  };
  if (branchId) filter.branch = branchId;

  const session = await CustomerSession.findOne(filter)
    .populate('customer', 'fullName phone')
    .populate('table', 'tableNumber status')
    .populate('branch', 'name');

  if (!session) return next(new AppError('No active session for this table', 404));
  res.status(200).json({ status: 'success', data: { session } });
});
