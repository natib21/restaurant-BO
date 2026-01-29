// controllers/tableController.js
const StaffAssignment = require('../models/staffAssignTabelModel');
const ApiFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Table = require('../models/tabelModel');

// Secure QR Helper
const { generateSecureQR } = require('../utils/secureQR');

/* ==================================================================
   CREATE TABLE + AUTO GENERATE REUSABLE SECURE QR CODE
   ================================================================== */
exports.createTable = catchAsync(async (req, res, next) => {
  const { tableNumber, capacity, location, section, status, branchId } = req.body;
  const merchantId = req.user.merchant._id;

  // 1. Determine Branch ID based on Role
  // If Super Admin, use body. If Manager, use token.
  const isSuperAdmin = req.user.role?.name === 'SUPER-MERCHANT-ADMIN';
  const targetBranchId = isSuperAdmin ? branchId : req.user.branch._id;

  if (!targetBranchId) {
    return next(new AppError('No branch associated with this request', 400));
  }

  // ——— Validation ———
  if (!tableNumber || !capacity) {
    return next(new AppError('Table number and capacity are required', 400));
  }

  const trimmedTableNumber = tableNumber.trim().toUpperCase();

  // ——— Check for duplicate in the TARGET branch ———
  const existingTable = await Table.findOne({
    tableNumber: trimmedTableNumber,
    branch: targetBranchId,
    isActive: true,
  });

  if (existingTable) {
    return next(
      new AppError(`Table "${trimmedTableNumber}" already exists in the selected branch`, 400)
    );
  }

  let table;
  try {
    // 2. Initial Create
    table = await Table.create({
      tableNumber: trimmedTableNumber,
      capacity: Number(capacity),
      location: location || 'indoor',
      section: section?.trim() || null,
      status: status || 'available',
      branch: targetBranchId,
      merchant: merchantId,
    });

    // 3. Generate Final Secure QR
    const finalQR = await generateSecureQR(merchantId, targetBranchId, table._id);

    // 4. Update table with QR details
    table.qrCode = finalQR.qrImage;
    table.qrData = finalQR.data;
    table.qrSignature = finalQR.signature;
    table.qrUrl = finalQR.url;
    table.qrGeneratedAt = new Date();

    await table.save({ validateBeforeSave: false });

    res.status(201).json({
      status: 'success',
      message: 'Table created successfully',
      data: { table },
    });
  } catch (err) {
    // Rollback
    if (table && table._id) {
      await Table.deleteOne({ _id: table._id }).catch(console.error);
    }
    return next(new AppError('Failed to create table: ' + err.message, 500));
  }
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
    path: 'branch',
    select: 'name branchCode isActive',
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
    path: 'branch',
    select: 'name branchCode isActive',
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
  console.log(req.body);
  // Build safe updates
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] =
        field === 'tableNumber' ? req.body[field]?.trim().toUpperCase() : req.body[field];
    }
  });

  // Validate capacity if provided
  if (updates.capacity !== undefined) {
    if (isNaN(updates.capacity) || updates.capacity < 1) {
      return next(new AppError('Capacity must be a number ≥ 1', 400));
    }
    updates.capacity = Number(updates.capacity);
  }

  // If no valid fields to update
  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields provided to update', 400));
  }

  console.log('Applying updates:', updates); // Better logging

  // Find and update table
  const table = await Table.findOneAndUpdate(
    {
      _id: req.params.id,
      merchant: req.user.merchant._id,
    },
    updates,
    {
      new: true,
      runValidators: true,
    }
  ).populate('branch'); // ← Important: populate branch for name/logo if needed

  if (!table) {
    return next(new AppError('Table not found or not authorized', 404));
  }

  try {
    // Regenerate secure QR using correct IDs
    const qrResult = await generateSecureQR(
      req.user.merchant._id,
      table.branch, // Pass branch ID (string or populated object → .toString() handles both)
      table._id
    );

    // Update QR fields
    table.qrCode = qrResult.qrImage;
    table.qrData = qrResult.data;
    table.qrSignature = qrResult.signature;
    table.qrUrl = qrResult.url; // ← CRITICAL: Save the URL!
    table.qrGeneratedAt = new Date();

    await table.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: 'Table updated and QR code refreshed',
      data: { table },
    });
  } catch (qrError) {
    console.error('QR Regeneration failed:', qrError);
    // Still return updated table even if QR failed (non-critical)
    res.status(200).json({
      status: 'partial_success',
      message: 'Table updated, but QR regeneration failed',
      data: { table },
    });
  }
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

exports.regenerateQR = catchAsync(async (req, res, next) => {
  const tableId = req.params.id;
  const merchantId = req.user.merchant._id;

  const table = await Table.findOne({
    _id: tableId,
    merchant: merchantId,
    isActive: true, // Only allow regeneration for active tables
  });

  if (!table) {
    return next(new AppError('Table not found or inactive', 404));
  }

  // Generate new QR
  const { qrImage, data, signature, url } = await generateSecureQR(
    merchantId,
    table.branch._id,
    tableId
  );

  // Update table with new QR
  table.qrCode = qrImage;
  table.qrData = data;
  table.qrSignature = signature;
  table.qrGeneratedAt = new Date();
  table.qrUrl = url; // Assuming generateSecureQR returns url

  await table.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'QR code regenerated successfully',
    data: {
      table,
      qrPreview: table.qrUrl,
    },
  });
});

/* ==================================================================
   GET TABLES BY BRANCH ID
   ================================================================== */
exports.getTablesByBranch = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const merchantId = req.user.merchant._id;

  // 1. Validation
  if (!id) {
    return next(new AppError('Branch ID is required', 400));
  }

  // 2. Build Query
  // We filter by branchId AND merchantId to ensure data isolation (security)
  const features = new ApiFeatures(
    Table.find({
      branch: id,
      merchant: merchantId,
      isActive: true,
    }),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  // 3. Execute Query
  const tables = await features.query.populate({
    path: 'branch',
    select: 'name branchCode isActive',
  });

  // 4. Response
  res.status(200).json({
    status: 'success',
    results: tables.length,
    data: {
      tables,
    },
  });
});
