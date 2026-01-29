const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Merchant' },
  branchId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Branch' }, // Added Branch
  date: { type: String, required: true },
  prefix: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

// The unique index now includes branchId
counterSchema.index({ merchantId: 1, branchId: 1, date: 1, prefix: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);
