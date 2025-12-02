const mongoose = require('mongoose');
const { Schema } = mongoose;

// At top of customerSessionSchema file
const SESSION_DURATION_HOURS = process.env.SESSION_DURATION_HOURS || 4;
const SESSION_DURATION_MS = 1000 * 60 * 60 * SESSION_DURATION_HOURS;

const customerSessionSchema = new Schema(
  {
    // *** SECURITY CRITICAL FIELDS ***
    token: {
      type: String,
      required: true,
      unique: true, // Must be unique for quick and secure lookup
      index: true,
    },
   table: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
    // *** CONTEXT & EXPIRY ***
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    // Keep customer optional if anonymous ordering is allowed
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: false, // Set to false if not all customers log in
      index: true,
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
    },
    // Session is functionally expired after this time (2 hours recommended)
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + SESSION_DURATION_MS),
      // TTL index to automatically delete documents 1 day after expiresAt
      index: { expires: '1d' },
    },
    // Used to immediately revoke the token after the final order is placed
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookup by merchant and location
customerSessionSchema.index(
  { table: 1, merchant: 1, isActive: 1, expiresAt: 1 },
  { unique: true }
);
customerSessionSchema.index({ table: 1, isActive: true }, { unique: true, sparse: true });

customerSessionSchema.index({ tableId: 1, isActive: true }, { unique: true, sparse: true });


customerSessionSchema.virtual('tableDetails', {
  ref: 'Table',
  localField: 'table',
  foreignField: '_id',
  justOne: true,
});

customerSessionSchema.virtual('branchDetails', {
  ref: 'Branch',
  localField: 'branch',
  foreignField: '_id',
  justOne: true,
});

// ================= PRE-SAVE HOOK =================
// Auto-set branch from table if not provided
customerSessionSchema.pre('save', async function (next) {
  if (!this.branch && this.table) {
    const Table = mongoose.model('Table');
    const tableDoc = await Table.findById(this.table).select('branch merchant');

    if (!tableDoc) return next(new Error('Table not found'));
    this.branch = tableDoc.branch;
    this.merchant = tableDoc.merchant; // also set merchant automatically
  }

  // Ensure branch matches table branch
  if (this.table && this.branch) {
    const Table = mongoose.model('Table');
    const tableDoc = await Table.findById(this.table).select('branch');

    if (!tableDoc) return next(new Error('Table not found'));
    if (tableDoc.branch.toString() !== this.branch.toString()) {
      return next(new Error('Table does not belong to this branch'));
    }
  }

  next();
});


module.exports = mongoose.model('CustomerSession', customerSessionSchema);
