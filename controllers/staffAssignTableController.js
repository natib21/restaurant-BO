// controllers/staffAssignmentController.js
const Table = require('../models/tabelModel');
const ApiFeatures = require('../utils/apiFeatures');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const StaffAssignment = require('../models/staffAssignTabelModel');

// ====================================================================
// ASSIGN TABLES TO STAFF (Main function – used by manager)
// ====================================================================
// controllers/staffAssignmentController.js

// List of REQUIRED task names for serving tables
const REQUIRED_TASKS_FOR_TABLE_ASSIGNMENT = [
  'Accept Order',
  'View Order',
  'Serve Table',
  'Call Bill',
  // add more as needed
];

exports.assignTablesToStaff = catchAsync(async (req, res, next) => {
  const { staffId, tableIds, section, shift = 'full-day', notes } = req.body;

  // 1. Validation
  if (!staffId || !tableIds || !Array.isArray(tableIds) || tableIds.length === 0) {
    return next(new AppError('Please provide staffId and array of tableIds', 400));
  }

  // 2. Verify staff exists and belongs to merchant
  const staff = await User.findOne({
    _id: staffId,
    merchant: req.user.merchant._id,
    isActive: true,
    role: { $exists: true },
  }).populate('role');

  if (!staff) {
    return next(new AppError('Staff not found or not active', 404));
  }

  if (!staff.role) {
    return next(new AppError('Staff has no role assigned', 400));
  }

  // 3. CRITICAL: Check if staff role has required permissions
  const role = await Role.findById(staff.role).populate('tasks');

  if (!role || !role.isActive) {
    return next(new AppError('Staff role is invalid or inactive', 400));
  }

  const staffTaskNames = role.tasks.map(task => task.name?.toLowerCase()).filter(Boolean);

  const hasRequiredPermission = REQUIRED_TASKS_FOR_TABLE_ASSIGNMENT.some(required =>
    staffTaskNames.includes(required.toLowerCase())
  );

  if (!hasRequiredPermission) {
    return next(
      new AppError(
        `Staff "${staff.name}" does not have permission to serve tables. ` +
          `Required tasks: ${REQUIRED_TASKS_FOR_TABLE_ASSIGNMENT.join(', ')}`,
        403
      )
    );
  }

  // 4. Verify all tables exist and belong to merchant
  const tables = await Table.find({
    _id: { $in: tableIds },
    merchant: req.user.merchant._id,
    isActive: true,
  });

  if (tables.length !== tableIds.length) {
    return next(new AppError('One or more tables not found or not active', 400));
  }

  // 5. End previous active assignments for these tables
  await StaffAssignment.updateMany(
    {
      merchant: req.user.merchant._id,
      'tables.table': { $in: tableIds },
      isActive: true,
    },
    { isActive: false, endedAt: new Date() }
  );

  // 6. Create new assignment
  const assignment = await StaffAssignment.create({
    merchant: req.user.merchant._id,
    staff: staffId,
    tables: tables.map(t => ({
      table: t._id,
      tableNumber: t.tableNumber,
    })),
    section,
    shift,
    notes,
    assignedBy: req.user._id,
    assignedAt: new Date(),
    isActive: true,
  });

  await assignment.populate([
    { path: 'staff', select: 'name phone avatar' },
    { path: 'assignedBy', select: 'name' },
    { path: 'tables.table', select: 'tableNumber capacity status location' },
  ]);

  res.status(201).json({
    status: 'success',
    message: `Tables successfully assigned to ${staff.name}`,
    data: { assignment },
  });
});

// ====================================================================
// GET CURRENT ACTIVE ASSIGNMENTS (for floor plan / dashboard)
// ====================================================================
exports.getCurrentAssignments = catchAsync(async (req, res, next) => {
  const assignments = await StaffAssignment.find({
    merchant: req.user.merchant._id,
    isActive: true,
  })
    .populate('staff', 'name phone avatar')
    .populate('assignedBy', 'name')
    .populate('tables.table', 'tableNumber capacity status location')
    .sort('-assignedAt');

  res.status(200).json({
    status: 'success',
    results: assignments.length,
    data: { assignments },
  });
});

// ====================================================================
// GET ALL ASSIGNMENTS (with filtering – history, staff, date)
// ====================================================================
exports.getAllAssignments = catchAsync(async (req, res, next) => {
  const features = new ApiFeatures(
    StaffAssignment.find({ merchant: req.user.merchant._id }),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const assignments = await features.query
    .populate('staff', 'name phone')
    .populate('assignedBy', 'name')
    .populate('tables.table', 'tableNumber');

  res.status(200).json({
    status: 'success',
    results: assignments.length,
    data: { assignments },
  });
});

// ====================================================================
// END ASSIGNMENT (manually – e.g. staff finished shift)
// ====================================================================
exports.endAssignment = catchAsync(async (req, res, next) => {
  const assignment = await StaffAssignment.findOneAndUpdate(
    {
      _id: req.params.id,
      merchant: req.user.merchant._id,
      isActive: true,
    },
    { isActive: false, endedAt: new Date() },
    { new: true }
  );

  if (!assignment) {
    return next(new AppError('No active assignment found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { assignment },
  });
});
