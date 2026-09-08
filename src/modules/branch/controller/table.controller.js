const catchAsync = require('../../../../utils/catchAsync');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { BranchService } = require('../service/BranchService');

exports.createTable = catchAsync(async (req, res) => {
  const table = await BranchService.createTable(req);
  res.status(201).json({
    status: 'success',
    message: 'Table created successfully',
    data: { table },
  });
});

exports.getAllTables = catchAsync(async (req, res) => {
  const tables = await BranchService.getAllTables(req);
  res.status(200).json({
    status: 'success',
    results: tables.length,
    data: { tables },
  });
});

exports.getTable = catchAsync(async (req, res) => {
  const table = await BranchService.getTable(req);
  res.status(200).json({ status: 'success', data: { table } });
});

exports.updateTable = catchAsync(async (req, res) => {
  const { table, qrFailed } = await BranchService.updateTable(req);

  if (qrFailed) {
    return res.status(200).json({
      status: 'partial_success',
      message: 'Table updated, but QR regeneration failed',
      data: { table },
    });
  }

  res.status(200).json({
    status: 'success',
    message: 'Table updated and QR code refreshed',
    data: { table },
  });
});

exports.deleteTable = catchAsync(async (req, res) => {
  await BranchService.deleteTable(req);
  res.status(204).json({ status: 'success', data: null });
});

exports.changeTable = catchAsync(async (req, res) => {
  const result = await BranchService.changeTable(req);
  res.status(200).json({ status: 'success', data: result });
});

exports.regenerateQR = catchAsync(async (req, res) => {
  const table = await BranchService.regenerateTableQr(req);
  res.status(200).json({
    status: 'success',
    message: 'QR code regenerated successfully',
    data: { table, qrPreview: table.qrUrl },
  });
});

exports.getTablesByBranch = catchAsync(async (req, res) => {
  const tables = await BranchService.getTablesByBranch(req);
  res.status(200).json({
    status: 'success',
    results: tables.length,
    data: { tables },
  });
});

exports.regenerateQr = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const result = await BranchService.generateSignedTableQr(req.params.id, merchantId);
  res.status(200).json({
    status: 'success',
    data: {
      tableId: result.table._id,
      qrUrl: result.url,
      data: result.data,
      signature: result.signature,
    },
  });
});

exports.transitionStatus = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { status, branchId } = req.body;
  const result = await BranchService.transitionTableStatus({
    tableId: req.params.id,
    merchantId,
    branchId,
    toStatus: status,
  });
  res.status(200).json({ status: 'success', data: result });
});

exports.closeTable = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { force } = req.query;
  const { SessionService } = require('../../sessions/service/SessionService');
  const DiningSession = require('../../../../models/DiningSession');
  const Table = require('../../../../models/tabelModel');
  
  // Get table to find active session
  const table = await Table.findOne({
    _id: req.params.id,
    merchant: merchantId
  });
  
  if (!table) {
    return res.status(404).json({
      status: 'fail',
      message: 'Table not found'
    });
  }
  
  // Find active session for this table
  const activeSession = await SessionService.getActiveSession(table._id);
  
  if (!activeSession) {
    return res.status(400).json({
      status: 'fail',
      message: 'No active session found for this table',
      data: {
        tableId: table._id,
        tableNumber: table.tableNumber,
        currentStatus: table.status
      }
    });
  }
  
  // Close the session
  const closedSession = await SessionService.endSession({
    sessionId: activeSession._id,
    closedBy: req.user._id,
    force: force === 'true'
  });
  
  // Get session summary
  const summary = await SessionService.getSessionSummary(closedSession._id);
  
  res.status(200).json({
    status: 'success',
    message: 'Table closed successfully',
    data: {
      table: {
        _id: table._id,
        tableNumber: table.tableNumber,
        status: 'needs-cleaning'
      },
      session: {
        _id: closedSession._id,
        status: closedSession.status,
        startedAt: closedSession.startedAt,
        endedAt: closedSession.endedAt,
        duration: closedSession.getDurationFormatted()
      },
      summary
    }
  });
});
