const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true, // Links payment to the specific order
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true, // Multi-tenant SaaS: link payment to restaurant
  },
  amount: {
    type: Number,
    required: true, // Total payment amount
  },
  currency: {
    type: String,
    default: 'ETB', // Ethiopian Birr by default
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending', // Payment workflow: pending → paid → refunded
    required: true,
  },
  method: {
  type: String,
  enum: ['card', 'mobile', 'cash'], // allow cash too
  required: true,
},
  transactionId: {
    type: String,
    required: true, // Unique ID from payment gateway
  },
  paymentDate: {
    type: Date,
    required: true, // When payment was successfully made
  },
  notes: {
    type: String, // Optional for manual adjustments, partial payments, discounts
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date,
});

// Auto-update `updatedAt`
paymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
