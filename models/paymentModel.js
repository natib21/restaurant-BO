const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true, // FIX: was missing — this is a primary lookup path
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true,
    index: true, // FIX: was missing — needed for merchant financial reporting
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'ETB',
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
    required: true,
  },
  method: {
    type: String,
    enum: ['card', 'mobile', 'cash'],
    required: true,
  },
  transactionId: {
    type: String,
    required: true,
  },
  paymentDate: {
    type: Date,
    required: true,
  },
  notes: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date,
});

// FIX: added — this is the query you'll run constantly for merchant
// dashboards ("this merchant's payments, most recent first, filtered by status")
paymentSchema.index({ restaurant: 1, status: 1, paymentDate: -1 });

paymentSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);