// models/tableModel.js
const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    /* ====================== CORE TABLE INFO ====================== */
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'Table must belong to a merchant'],
      index: true,
    },

    tableNumber: {
      type: String,
      required: [true, 'Table number is required'],
      trim: true,
      uppercase: true,
      unique: true, // Global unique (you already have compound index too)
    },

    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
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

    /* ====================== SECURE REUSABLE QR ====================== */
    qrCode: {
      type: String,
      // data:image/png;base64,... → ready to display in admin panel
    },
    qrData: {
      type: String,
      // base64url encoded payload: { m: "...", t: "..." }
    },
    qrSignature: {
      type: String,
      // HMAC-SHA256 hex signature
    },
    qrGeneratedAt: {
      type: Date,
      // When the current QR was created (useful for audit)
    },

    /* ====================== SOFT DELETE ====================== */
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

/* ====================== VIRTUALS ====================== */

// Real-time current staff assigned to this table
tableSchema.virtual('currentStaff', {
  ref: 'StaffAssignment',
  localField: '_id',
  foreignField: 'tables.table',
  justOne: false,
  match: { isActive: true },
});

// All orders linked to this table (past + present)
tableSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'table',
  justOne: false,
});

/* ====================== INDEXES (Performance + Constraints) ====================== */

// Ensure one merchant can't have duplicate table numbers
tableSchema.index({ merchant: 1, tableNumber: 1 }, { unique: true });

// Fast queries by status, section, etc.
tableSchema.index({ merchant: 1, status: 1 });
tableSchema.index({ merchant: 1, section: 1 });
tableSchema.index({ merchant: 1, isActive: 1 });

/* ====================== INSTANCE METHOD: CHANGE TABLE ====================== */
// Used by staff to move customers + orders to a different table
tableSchema.methods.changeTable = async function (newTableId) {
  const Order = mongoose.model('Order');

  const newTable = await this.constructor.findById(newTableId);
  if (!newTable) throw new Error('New table not found');
  if (newTable.status !== 'available') throw new Error('New table is not available');
  if (newTable.merchant.toString() !== this.merchant.toString())
    throw new Error('Tables must belong to the same restaurant');

  // Transfer active orders
  const result = await Order.updateMany(
    {
      table: this._id,
      status: { $in: ['pending', 'preparing', 'confirmed'] },
    },
    { $set: { table: newTableId } }
  );

  // Update table statuses
  this.status = 'needs-cleaning'; // or 'available' if no cleaning needed
  newTable.status = 'occupied';

  await this.save({ validateBeforeSave: false });
  await newTable.save({ validateBeforeSave: false });

  console.log(
    `Moved ${result.modifiedCount} orders from ${this.tableNumber} → ${newTable.tableNumber}`
  );

  return {
    message: 'Table changed successfully',
    transferredOrders: result.modifiedCount,
    oldTable: this.tableNumber,
    newTable: newTable.tableNumber,
  };
};

/* ====================== EXPORT ====================== */
module.exports = mongoose.model('Table', tableSchema);