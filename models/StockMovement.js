// models/StockMovement.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const stockMovementSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    ingredient: {
      type: Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['in', 'out', 'adjustment', 'waste', 'return'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    previousStock: {
      type: Number,
      required: true,
    },
    newStock: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      enum: [
        'purchase',
        'order_consumption',
        'manual_adjustment',
        'spoilage',
        'theft',
        'return_to_supplier',
        'other',
      ],
      default: 'other',
    },
    reference: {
      type: String,
      trim: true,
    }, // e.g., order number, PO number
    cost: {
      type: Number,
      min: 0,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false, // ✅ Allow null for customer/system actions (QR orders, automated processes)
      default: null,
    },
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
stockMovementSchema.index({ merchant: 1, ingredient: 1, createdAt: -1 });
stockMovementSchema.index({ merchant: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
