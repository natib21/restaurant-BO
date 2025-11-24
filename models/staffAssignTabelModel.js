// models/staffAssignmentModel.js
const mongoose = require('mongoose');

const staffAssignmentSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // or 'Staff' if you have a separate model
      required: true,
    },

    tables: [
      {
        table: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Table',
          required: true,
        },
        tableNumber: {
          type: String,
          required: true,
        },
      },
    ],

    section: {
      type: String,
      trim: true,
    },

    shift: {
      type: String,
      enum: ['morning', 'lunch', 'evening', 'night', 'full-day', 'custom'],
      default: 'full-day',
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
staffAssignmentSchema.index({ merchant: 1, isActive: 1 });
staffAssignmentSchema.index({ merchant: 1, staff: 1, isActive: 1 });
staffAssignmentSchema.index({ merchant: 1, 'tables.table': 1, isActive: 1 });
staffAssignmentSchema.index({ assignedAt: -1 });

module.exports = mongoose.model('StaffAssignment', staffAssignmentSchema);
