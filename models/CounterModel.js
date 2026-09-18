const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Merchant', index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Branch', index: true },
  // ✅ Optional date field for backward compatibility (daily counters)
  date: { type: String, required: false },
  prefix: { type: String, required: true },
  seq: { type: Number, default: 0 },
  // ✅ Track when sequence started
  startedAt: { type: Date, default: Date.now },
  // ✅ Allow configurable starting number (default: 1)
  startingNumber: { type: Number, default: 1 },
}, {
  timestamps: true // createdAt, updatedAt
});

// ✅ Continuous numbering index (no date field) - for order numbers
counterSchema.index(
  { merchantId: 1, branchId: 1, prefix: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { date: null },
    name: 'continuous_counter'
  }
);

// ✅ Daily numbering index (with date field) - for legacy/backward compatibility
counterSchema.index(
  { merchantId: 1, branchId: 1, date: 1, prefix: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { date: { $exists: true, $type: 'string' } },
    name: 'daily_counter'
  }
);

module.exports = mongoose.model('Counter', counterSchema);
