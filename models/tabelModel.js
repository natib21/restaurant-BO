// models/tableModel.js
const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    tableNumber: {
      type: String,
      required: [true, 'Table number is required'],
      trim: true,
      uppercase: true,
    },

    capacity: {
      type: Number,
      required: true,
      min: [1, 'Capacity must be at least 1'],
    },

    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved', 'needs-cleaning', 'disabled'],
      default: 'available',
    },

    location: {
      type: String,
      enum: ['indoor', 'outdoor', 'rooftop', 'terrace', 'vip', 'bar', 'window', 'balcony'],
      default: 'indoor',
    },

    section: {
      type: String,
      trim: true,
      default: null,
      // Example: "Main Hall", "Terrace A", "VIP Lounge"
    },

    qrCode: {
      type: String,
      unique: true,
      sparse: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: Get current assigned staff (real-time view without storing on Table)
tableSchema.virtual('currentStaff', {
  ref: 'StaffAssignment',
  localField: '_id',
  foreignField: 'tables.table',
  justOne: false,
  match: { isActive: true },
});

// Indexes
tableSchema.index({ merchant: 1, tableNumber: 1 }, { unique: true });
tableSchema.index({ merchant: 1, status: 1 });
tableSchema.index({ merchant: 1, section: 1 });
tableSchema.index({ merchant: 1, isActive: 1 });

module.exports = mongoose.model('Table', tableSchema);