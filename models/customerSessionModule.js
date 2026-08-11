const mongoose = require('mongoose');
const { Schema } = mongoose;

const SESSION_DURATION_HOURS = process.env.SESSION_DURATION_HOURS || 4;
const SESSION_DURATION_MS = 1000 * 60 * 60 * SESSION_DURATION_HOURS;

const customerSessionSchema = new Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    table: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: false,
      index: true,
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + SESSION_DURATION_MS),
      index: { expires: '1d' },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// FIX: the old compound unique index (table + merchant + isActive + expiresAt)
// didn't actually prevent two simultaneous active sessions on the same table,
// since expiresAt is essentially never identical between two sessions. There
// was also a second index referencing a field called `tableId`, which doesn't
// exist on this schema (the real field is `table`) — it silently indexed
// nothing and enforced nothing.
//
// This partial unique index does what was intended: at most one *active*
// session per table at a time. Creating a new session for an occupied table
// must first set the old session's isActive to false.
customerSessionSchema.index(
  { table: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

customerSessionSchema.index({ merchant: 1, branch: 1 });

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

customerSessionSchema.pre('save', async function (next) {
  if (!this.branch && this.table) {
    const Table = mongoose.model('Table');
    const tableDoc = await Table.findById(this.table).select('branch merchant');

    if (!tableDoc) return next(new Error('Table not found'));
    this.branch = tableDoc.branch;
    this.merchant = tableDoc.merchant;
  }

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