// controllers/tableController.js
const StaffAssignment = require('../models/staffAssignTabelModel');
const ApiFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Table = require('../models/tabelModel');

// Secure QR Helper (no nonce → reusable forever)
const { generateSecureQR } = require('../utils/secureQR');

/* ==================================================================
   CREATE TABLE + AUTO GENERATE REUSABLE SECURE QR CODE
   ================================================================== */
exports.createTable = catchAsync(async (req, res, next) => {
  const { tableNumber, capacity, location, section, status } = req.body;
  const merchantId = req.user.merchant._id;

  // ——— Validation ———
  if (!tableNumber || !capacity) {
    return next(new AppError('Table number and capacity are required', 400));
  }
  if (isNaN(capacity) || capacity < 1) {
    return next(new AppError('Capacity must be a number ≥ 1', 400));
  }

  // ——— Create the table document ———
  const table = await Table.create({
    tableNumber: tableNumber.trim().toUpperCase(),
    capacity: Number(capacity),
    location: location || 'indoor',
    section: section || null,
    status: status || 'available',
    merchant: merchantId,
  });

  // ——— Generate Secure, Reusable QR Code (no nonce) ———
  try {
    const { qrImage, data, signature, url } = await generateSecureQR(merchantId, table._id);

    // Save QR image + signed data to table
    table.qrCode = qrImage;           // base64 PNG → display directly in admin panel
    table.qrData = data;              // base64url payload (for regeneration if needed)
    table.qrSignature = signature;    // HMAC signature (for verification)
    table.qrGeneratedAt = new Date();

    // Debug: See the full deep link in console
    console.log('QR Deep Link →', url);

    await table.save({ validateBeforeSave: false });
  } catch (err) {
    console.error('Secure QR generation failed:', err);
    return next(new AppError('Failed to generate secure QR code', 500));
  }

  // ——— Success Response ———
  res.status(201).json({
    status: 'success',
    message: 'Table created with permanent secure QR code',
    data: { table },
  });
});

/* ==================================================================
   GET ALL TABLES (for current merchant only)
   ================================================================== */
exports.getAllTables = catchAsync(async (req, res, next) => {
  const features = new ApiFeatures(
    Table.find({ merchant: req.user.merchant._id, isActive: true }),
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
    results: tables.length,
    data: { tables },
  });
});

/* ==================================================================
   GET SINGLE TABLE
   ================================================================== */
exports.getTable = catchAsync(async (req, res, next) => {
  const table = await Table.findOne({
    _id: req.params.id,
    merchant: req.user.merchant._id,
  }).populate({
    path: 'currentStaff',
    populate: { path: 'staff', select: 'name phone' },
  });

  if (!table) return next(new AppError('Table not found', 404));

  res.status(200).json({
    status: 'success',
    data: { table },
  });
});

/* ==================================================================
   UPDATE TABLE (and regenerate QR automatically)
   ================================================================== */
exports.updateTable = catchAsync(async (req, res, next) => {
  const allowedFields = ['tableNumber', 'capacity', 'status', 'location', 'section'];
  const updates = {};

  // Only allow safe fields
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] =
        field === 'tableNumber' ? req.body[field].trim().toUpperCase() : req.body[field];
    }
  });

  // Validate capacity
  if (updates.capacity && (isNaN(updates.capacity) || updates.capacity < 1)) {
    return next(new AppError('Capacity must be ≥ 1', 400));
  }

  // Update the table
  const table = await Table.findOneAndUpdate(
    { _id: req.params.id, merchant: req.user.merchant._id },
    updates,
    { new: true, runValidators: true }
  );

  if (!table) return next(new AppError('Table not found', 404));

  // ——— Regenerate QR Code on every update (recommended) ———
  const { qrImage, data, signature } = await generateSecureQR(
    req.user.merchant._id,
    table._id
  );

  table.qrCode = qrImage;
  table.qrData = data;
  table.qrSignature = signature;
  table.qrGeneratedAt = new Date();

  await table.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Table updated + QR code refreshed',
    data: { table },
  });
});

/* ==================================================================
   SOFT DELETE TABLE
   ================================================================== */
exports.deleteTable = catchAsync(async (req, res, next) => {
  const table = await Table.findOneAndUpdate(
    { _id: req.params.id, merchant: req.user.merchant._id },
    { isActive: false },
    { new: true }
  );

  if (!table) return next(new AppError('Table not found', 404));

  // End any active staff assignments
  await StaffAssignment.updateMany(
    { 'tables.table': req.params.id, isActive: true },
    { isActive: false, endedAt: new Date() }
  );

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

/* ==================================================================
   CHANGE TABLE (transfer active orders to new table)
   ================================================================== */
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

  // This method is defined in your Table model
  const result = await currentTable.changeTable(newTableId);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});