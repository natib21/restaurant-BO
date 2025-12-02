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

    role: {
      type: String,
      enum: ['waiter', 'barista', 'host', 'manager', 'cleaner', 'kitchen'],
      required: true,
    },

    tables: {
      type: [tableAssignmentSchema],
      default: [],
      validate: [
        {
          validator: v => v.length > 0 || this.section,
          message: 'Must assign either tables or a section',
        },
      ],
    },

    section: {
      type: String,
      trim: true,
      default: null,
      index: true,
      // e.g. "Terrace", "VIP Lounge", "Bar Area"
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

    endedAt: { type: Date, default: null },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    notes: { type: String, trim: true, maxlength: 300 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ====================== INDEXES (Blazing Fast) ======================
staffAssignmentSchema.index({ merchant: true });
staffAssignmentSchema.index({ branch: 1, isActive: 1 });
staffAssignmentSchema.index({ staff: 1, isActive: 1 });
staffAssignmentSchema.index({ 'tables.table': 1, isActive: 1 });
staffAssignmentSchema.index({ section: 1, isActive: 1 });
staffAssignmentSchema.index({ shiftStart: 1, shiftEnd: 1 });

// Prevent overlapping active assignments for same staff
staffAssignmentSchema.index(
  { staff: 1, isActive: 1 },
  {
    partialFilterExpression: { isActive: true },
    unique: true,
    name: 'one_active_assignment_per_staff',
  }
);

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

// End current assignment (e.g. shift over)
staffAssignmentSchema.methods.endAssignment = async function () {
  this.isActive = false;
  this.endedAt = new Date();
  await this.save();
};

// Reassign tables to another staff
staffAssignmentSchema.methods.transferTablesTo = async function (newStaffId) {
  const newAssignment = await this.constructor.findOne({
    staff: newStaffId,
    branch: this.branch,
    isActive: true,
  });

  if (!newAssignment) throw new Error('Target staff not active');

  // Transfer all tables
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: { isActive: false, endedAt: new Date() },
    }
  );

  newAssignment.tables.push(...this.tables);
  await newAssignment.save();

  return { success: true, transferred: this.tables.length };
};

module.exports = mongoose.model('StaffAssignment', staffAssignmentSchema);