// models/Table.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const auditPlugin = require('../utils/auditPlugin');

const tableSchema = new mongoose.Schema(
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

    tableNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 1,
      maxlength: 10,
    },

    capacity: {
      type: Number,
      required: true,
      min: [1, 'Capacity must be at least 1'],
      max: [50, 'Capacity too high'],
    },

    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved', 'needs-cleaning', 'disabled'],
      default: 'available',
      index: true,
    },

    location: {
      type: String,
      enum: [
        'indoor',
        'outdoor',
        'rooftop',
        'terrace',
        'vip',
        'bar',
        'window',
        'balcony',
        'garden',
      ],
      default: 'indoor',
    },

    section: {
      type: String,
      trim: true,
      default: 'Main',
      index: true,
    },

    // === SECURE REUSABLE QR SYSTEM ===
    qrSecret: {
      type: String,
      default: () => crypto.randomBytes(32).toString('hex'),
      select: false, // never expose
    },
    qrUrl: { type: String },
    qrCode: { type: String }, // base64 PNG
    qrGeneratedAt: { type: Date },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ====================== INDEXES (Lightning Fast) ======================
// ✅ BRANCH-SPECIFIC: Table numbers unique per merchant + branch (not globally)
tableSchema.index({ merchant: 1, branch: 1, tableNumber: 1 }, { unique: true });
tableSchema.index({ branch: 1, status: 1 });
tableSchema.index({ branch: 1, section: 1 });
tableSchema.index({ branch: 1, isActive: 1 });
tableSchema.index({ merchant: 1, branch: 1, status: 1 });

// ====================== VIRTUALS ======================
tableSchema.virtual('currentOrder', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'table',
  justOne: true,
  match: { status: { $in: ['pending', 'accepted', 'preparing', 'ready'] } },
});

tableSchema.virtual('activeSession', {
  ref: 'DiningSession',  // ✅ Updated to use new model name
  localField: '_id',
  foreignField: 'table',
  justOne: true,
  match: { status: 'active' },  // ✅ Updated to use status field instead of isActive
});

// ====================== METHODS ======================

// Generate signed QR payload: { t: tableId, b: branchId, exp: timestamp }
tableSchema.methods.generateQRData = function () {
  const payload = {
    t: this._id.toString(),
    b: this.branch.toString(),
    m: this.merchant.toString(),
    exp: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
  };

  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', this.qrSecret).update(data).digest('hex');

  return { data, signature };
};

// Get full QR URL (for printing)
tableSchema.methods.getQRUrl = function () {
  const { data, signature } = this.generateQRData();
  return `${process.env.APP_URL}/qr?t=${data}&s=${signature}`;
};

// Regenerate QR (call when secret compromised or design change)
tableSchema.methods.regenerateQR = async function () {
  this.qrSecret = crypto.randomBytes(32).toString('hex');
  this.qrGeneratedAt = new Date();
  await this.save();
  return this.getQRUrl();
};

// Move table + transfer session & orders
tableSchema.methods.moveTo = async function (newTableId) {
  const session = await mongoose.model('DiningSession').findOne({  // ✅ Updated
    table: this._id,
    status: 'active',  // ✅ Updated to use status
  });

  const newTable = await this.constructor.findById(newTableId);
  if (!newTable) throw new Error('Target table not found');
  if (newTable.merchant.toString() !== this.merchant.toString())
    throw new Error('Tables must be in same restaurant');

  // Transfer active session
  if (session) {
    session.table = newTableId;
    await session.save();
  }

  // Transfer active orders
  await mongoose.model('Order').updateMany(
    {
      table: this._id,
      status: { $nin: ['completed', 'canceled'] },
    },
    { table: newTableId }
  );

  // Update statuses
  this.status = 'needs-cleaning';
  newTable.status = session ? 'occupied' : 'available';

  await this.save({ validateBeforeSave: false });
  await newTable.save({ validateBeforeSave: false });

  return { success: true, newTable: newTable.tableNumber };
};

// Apply audit plugin BEFORE model creation
tableSchema.plugin(auditPlugin, {
  resource: 'Table',
  auditedFields: [
    'tableNumber',
    'capacity',
    'status',
    'location',
    'section',
    'isActive',
  ],
});

module.exports = mongoose.model('Table', tableSchema);
