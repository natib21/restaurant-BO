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
      enum: ['basic', 'pro', 'enterprise', 'feature', 'trial'],
      default: 'feature',
    },
    features: {
      type: [
        {
          type: String,
          enum: [
            'orders',
            'inventory',
            'multiBranch',
            'telegram',
            'sales',
            'reports',
            'customerManagement',
            'deliveryManagement',
            'paymentIntegration',
            'restaurantWebsite',
          ],
        },
      ],
      default: [],
    },
    isTrial: {
      type: Boolean,
      default: false,
    },
    trialStartDate: { type: Date },
    trialEndDate: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'active', 'past_due', 'canceled', 'expired'],
      default: 'pending',
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'ETB' },

    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },

    paymentProvider: {
      type: String,
      default: 'manual',
    },
    // FIX: was `unique: true` without `sparse: true`. Mongo's unique index
    // treats a missing field as null, so the second subscription created
    // without a transactionReference (e.g. manual/trial signups) would throw
    // a duplicate-key error on save.
    transactionReference: { type: String, unique: true, sparse: true },
    orderId: { type: String },

    gatewayResponse: { type: Object },
    verifiedAt: { type: Date },
    webhookEventId: { type: String },
    webhookReceivedAt: { type: Date },

    invoiceUrl: String,
  },
  { timestamps: true }
);

subscriptionSchema.index({ merchant: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
