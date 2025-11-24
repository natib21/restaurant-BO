// controllers/tableController.js
const StaffAssignment = require('../models/staffAssignTabelModel');
const ApiFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Table = require('../models/tabelModel');
const QRCode = require('qrcode');

// CREATE TABLE — with validation + auto QR
exports.createTable = catchAsync(async (req, res, next) => {
  // 1. Required fields check
  const { tableNumber, capacity } = req.body;

  if (!tableNumber || !capacity) {
    return next(new AppError('Table number and capacity are required', 400));
  }

  if (isNaN(capacity) || capacity < 1) {
    return next(new AppError('Capacity must be a number greater than 0', 400));
  }

  // 2. Build data (merchant from logged-in user)
  const data = {
    tableNumber: tableNumber.trim().toUpperCase(),
    capacity: Number(capacity),
    location: req.body.location || 'indoor',
    section: req.body.section || null,
    status: req.body.status || 'available',
    merchant: req.user.merchant._id,
  };

  // 3. Create table
  const table = await Table.create(data);

  // 4. Generate QR Code
  const tableUrl = `${process.env.FRONTEND_URL || 'http://localhost:7000'}/api/v1/menu/MID=${table.merchant}/public?tableId=${table._id}`;

  try {
    table.qrCode = await QRCode.toDataURL(tableUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    return next(new AppError('Failed to generate QR code', 500));
  }

  await table.save({ validateBeforeSave: false });

  res.status(201).json({
    status: 'success',
    data: { table },
  });
});

// GET ALL TABLES (for this merchant only)
exports.getAllTables = catchAsync(async (req, res, next) => {
  const features = new ApiFeatures(
    Table.find({
      merchant: req.user.merchant._id,
      isActive: true,
    }),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const tables = await features.query.populate({
    path: 'currentStaff',
    select: 'staff section shift',
    populate: { path: 'staff', select: 'name phone avatar' },
  });

  res.status(200).json({
    status: 'success',
    requestedAt: req.requestTime,
    results: tables.length,
    data: { tables },
  });
});

// GET SINGLE TABLE
exports.getTable = catchAsync(async (req, res, next) => {
  const table = await Table.findOne({
    _id: req.params.id,
    merchant: req.user.merchant._id,
  }).populate({
    path: 'currentStaff',
    populate: { path: 'staff', select: 'name phone' },
  });

  if (!table) {
    return next(new AppError('No table found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { table },
  });
});

// UPDATE TABLE — safe fields only
exports.updateTable = catchAsync(async (req, res, next) => {
  const allowedFields = ['tableNumber', 'capacity', 'status', 'location', 'section'];

  const updates = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] =
        field === 'tableNumber' ? req.body[field].trim().toUpperCase() : req.body[field];
    }
  });

  // Extra validation
  if (updates.capacity && (isNaN(updates.capacity) || updates.capacity < 1)) {
    return next(new AppError('Capacity must be a number ≥ 1', 400));
  }

  const table = await Table.findOneAndUpdate(
    { _id: req.params.id, merchant: req.user.merchant._id },
    updates,
    { new: true, runValidators: true }
  );

  if (!table) {
    return next(new AppError('No table found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { table },
  });
});

// DELETE TABLE (soft delete)
exports.deleteTable = catchAsync(async (req, res, next) => {
  const table = await Table.findOneAndUpdate(
    { _id: req.params.id, merchant: req.user.merchant._id },
    { isActive: false },
    { new: true }
  );

  if (!table) {
    return next(new AppError('No table found with that ID', 404));
  }

  // End any active staff assignments for this table
  await StaffAssignment.updateMany(
    { 'tables.table': req.params.id, isActive: true },
    { isActive: false, endedAt: new Date() }
  );

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// CHANGE TABLE — transfer orders to new table
exports.changeTable = catchAsync(async (req, res, next) => {
  const { currentTableId, newTableId } = req.body;

  if (!currentTableId || !newTableId) {
    return next(new AppError('Current and new table IDs are required', 400));
  }

  if (currentTableId === newTableId) {
    return next(new AppError('Current and new table must be different', 400));
  }

  const currentTable = await Table.findOne({
    _id: currentTableId,
    merchant: req.user.merchant._id,
  });

  if (!currentTable) {
    return next(new AppError('Current table not found or not authorized', 404));
  }

  // Call the model method to handle the change
  const result = await currentTable.changeTable(newTableId);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});
