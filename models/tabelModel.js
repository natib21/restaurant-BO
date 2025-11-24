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
      unique: true,
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

// Virtual: Get orders associated with this table (reverse reference via ObjectId)
tableSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'table',
  justOne: false,
});

// Indexes
tableSchema.index({ merchant: 1, tableNumber: 1 }, { unique: true });
tableSchema.index({ merchant: 1, status: 1 });
tableSchema.index({ merchant: 1, section: 1 });
tableSchema.index({ merchant: 1, isActive: 1 });

tableSchema.methods.changeTable = async function (newTableId) {
  const Order = mongoose.model('Order'); // Your 'Order' model with table as ObjectId ref

  // Find the new table
  const newTable = await this.constructor.findById(newTableId);
  if (!newTable) {
    throw new Error('New table not found');
  }
  if (newTable.status !== 'available') {
    throw new Error('New table is not available');
  }
  if (newTable.merchant.toString() !== this.merchant.toString()) {
    throw new Error('New table must belong to the same merchant');
  }

  // Transfer active orders (pending or preparing) from current table to new table
  const updatedOrders = await Order.updateMany(
    { table: this._id, status: { $in: ['pending', 'preparing'] } }, // Adjusted to match your Order status enum for active orders
    { $set: { table: newTableId } }
  );

  // Update statuses of old and new tables
  this.status = 'needs-cleaning'; // Or set to 'available' if no cleaning is needed
  newTable.status = 'occupied';

  await this.save();
  await newTable.save();

  // Optional: Log the change or notify staff (can be expanded based on needs)
  console.log(
    `Transferred ${updatedOrders.modifiedCount} orders from table ${this.tableNumber} to ${newTable.tableNumber}`
  );

  return {
    message: 'Table changed successfully',
    transferredOrders: updatedOrders.modifiedCount,
    oldTable: this,
    newTable,
  };
};

module.exports = mongoose.model('Table', tableSchema);
