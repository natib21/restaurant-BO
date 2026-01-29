// models/StaffAssignment.js
const mongoose = require('mongoose');

const tableAssignmentSchema = new mongoose.Schema(
  {
    table: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Table',
      required: true,
    },
    tableNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
  },
  { _id: false }
);

const staffAssignmentSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },

    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    tables: {
      type: [tableAssignmentSchema],
      default: [],
    },

    section: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    shift: {
      type: String,
      enum: ['morning', 'lunch', 'evening', 'night', 'full-day', 'custom'],
      default: 'full-day',
    },

    shiftStart: { type: Date },
    shiftEnd: { type: Date },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    assignedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    endedAt: { type: Date },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500, // Increased slightly for real notes
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ====================== COMPOUND INDEXES ======================
staffAssignmentSchema.index({ merchant: 1, branch: 1, isActive: 1 });
staffAssignmentSchema.index({ branch: 1, isActive: 1, shiftStart: 1 });
staffAssignmentSchema.index({ staff: 1, isActive: 1 });
staffAssignmentSchema.index({ 'tables.table': 1, isActive: 1 });
staffAssignmentSchema.index({ section: 1, isActive: 1 });

// Prevent overlapping shifts (one active assignment per staff at a time)
staffAssignmentSchema.index(
  { staff: 1, isActive: 1 },
  {
    partialFilterExpression: { isActive: true },
    unique: true,
    name: 'unique_active_assignment_per_staff',
  }
);

// ====================== VALIDATIONS ======================
// Either tables or section must be provided
staffAssignmentSchema.pre('validate', function (next) {
  if (this.tables.length === 0 && !this.section) {
    this.invalidate('tables', 'Must assign either tables or a section');
    this.invalidate('section', 'Must assign either tables or a section');
  }
  next();
});

// Ensure shift times make sense
staffAssignmentSchema.pre('save', function (next) {
  if (this.shiftStart && this.shiftEnd && this.shiftStart >= this.shiftEnd) {
    return next(new Error('shiftEnd must be after shiftStart'));
  }
  next();
});

// ====================== VIRTUALS ======================
staffAssignmentSchema.virtual('staffDetails', {
  ref: 'User',
  localField: 'staff',
  foreignField: '_id',
  justOne: true,
});

staffAssignmentSchema.virtual('assignedByDetails', {
  ref: 'User',
  localField: 'assignedBy',
  foreignField: '_id',
  justOne: true,
});

// ====================== METHODS ======================

// End current assignment
staffAssignmentSchema.methods.endAssignment = async function () {
  if (!this.isActive) return { success: false, message: 'Already ended' };

  this.isActive = false;
  this.endedAt = new Date();
  await this.save();

  return { success: true };
};

// Transfer tables to another active staff member
staffAssignmentSchema.methods.transferTablesTo = async function (newStaffId) {
  if (!this.isActive) throw new Error('Cannot transfer from inactive assignment');

  const newAssignment = await this.constructor.findOne({
    staff: newStaffId,
    branch: this.branch,
    isActive: true,
  });

  if (!newAssignment) throw new Error('Target staff has no active assignment');

  // Transfer tables
  const transferredTables = [...this.tables];
  newAssignment.tables.push(...transferredTables);

  // End current assignment
  this.isActive = false;
  this.endedAt = new Date();

  await Promise.all([this.save(), newAssignment.save()]);

  return {
    success: true,
    transferred: transferredTables.length,
    toStaff: newStaffId,
  };
};

// ====================== STATIC METHODS ======================

// Get current active assignments for a branch
staffAssignmentSchema.statics.getActiveForBranch = async function (branchId) {
  return this.find({ branch: branchId, isActive: true })
    .populate('staffDetails', 'name email phone')
    .populate('assignedByDetails', 'name')
    .lean();
};

module.exports = mongoose.model('StaffAssignment', staffAssignmentSchema);
