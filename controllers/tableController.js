
const Table = require('../models/tabelModel');
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const QRCode = require('qrcode');

// Create a new table and generate QR code
exports.createNewTable = catchAsync(async (req, res, next) => {
  const newTable = await Table.create(req.body);

  // Generate QR code pointing to table URL
  const tableUrl = `http://localhost:3000/?tableId=${newTable._id}&restaurantId=${newTable.restaurant}`;
  newTable.qr = await QRCode.toDataURL(tableUrl);

  await newTable.save();

  res.status(201).json({
    status: 'success',
    table: newTable,
  });
});

// Get all tables with optional filtering, pagination, etc.
exports.getAllTables = catchAsync(async (req, res, next) => {
  const features = new ApiFeatures(Table.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const tables = await features.query;

  res.status(200).json({
    status: 'success',
    requestedAt: req.requestTime,
    results: tables.length,
    tables,
  });
});

// Get a single table by ID
exports.getTable = catchAsync(async (req, res, next) => {
  const table = await Table.findById(req.params.id);

  if (!table) {
    return next(new AppError('No table found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    table,
  });
});

// Update a table
exports.updateTable = catchAsync(async (req, res, next) => {
  const table = await Table.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!table) {
    return next(new AppError('No table found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    table,
  });
});

// Delete a table
exports.deleteTable = catchAsync(async (req, res, next) => {
  const table = await Table.findByIdAndDelete(req.params.id);

  if (!table) {
    return next(new AppError('No table found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    table: null,
  });
});
