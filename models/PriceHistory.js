// models/PriceHistory.js
// ✅ Audit trail for menu item price changes
// Stores immutable record of every price modification with user context

const mongoose = require('mongoose');
const { Schema } = mongoose;

const priceHistorySchema = new Schema(
  {
    menuItem: {
      type: Schema.Types.ObjectId,
      ref: 'Menu',
      required: true,
      index: true,
    },
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    oldPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    newPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Composite indexes for efficient queries
priceHistorySchema.index({ merchant: 1, menuItem: 1, changedAt: -1 });
priceHistorySchema.index({ merchant: 1, changedAt: -1 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
