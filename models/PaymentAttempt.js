const mongoose = require('mongoose');
const { Schema } = mongoose;

const PaymentAttemptSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    paymentVerification: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentVerification',
      default: null,
      index: true,
    },
    provider: {
      type: String,
      enum: ['telebirr', 'cbe', 'cbebirr'],
      required: true,
      index: true,
    },
    originalReference: {
      type: String,
      trim: true,
      required: true,
    },
    normalizedReference: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    submissionMethod: {
      type: String,
      enum: ['manual_reference', 'qr_scan', 'pdf_download', 'manual_review'],
      default: 'manual_reference',
    },
    status: {
      type: String,
      enum: ['submitted', 'processing', 'pending_review', 'verified', 'rejected', 'failed', 'needs_review'],
      default: 'submitted',
      index: true,
    },
    submittedByType: {
      type: String,
      enum: ['customer', 'waiter', 'staff', 'admin', 'system'],
      default: 'staff',
    },
    submittedByUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    failureCode: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

PaymentAttemptSchema.index({ merchant: 1, order: 1, normalizedReference: 1 }, { unique: false });
PaymentAttemptSchema.index({ merchant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentAttempt', PaymentAttemptSchema);
