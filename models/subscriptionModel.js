const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
    },
    plan: {
      type: String,
      enum: ['basic', 'pro', 'enterprise'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending','active', 'past_due', 'canceled', 'expired'],
      default: 'pending',
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'ETB' },

    // Dates
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true }, // When the month ends

    // Payment Gateway Info
    paymentProvider: { 
      type: String, 
      enum: ['chapa', 'telebirr', 'manual', 'kispay'],
      default: 'kispay' 
    },
    transactionReference: { type: String, unique: true }, 
    orderId: { type: String }, 
    
    // For Audit/Professional tracking
    gatewayResponse: { type: Object }, 
    verifiedAt: { type: Date },

    invoiceUrl: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
