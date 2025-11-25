// models/Order.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: Schema.Types.ObjectId,
      ref: 'Menu',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    customer: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
    }, // snapshot
    customerPhone: {
      type: String,
    }, // snapshot

    // THIS IS WHERE THE TABLE BELONGS
    table: {
      type: Schema.Types.ObjectId,
      ref: 'Table',
      index: true,
    },
    tableNumber: {
      type: String,
      trim: true,
    }, // e.g. "T5" – denormalized for speed

    orderType: {
      type: String,
      enum: ['dine_in', 'takeaway', 'delivery'],
      default: 'dine_in',
    },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'canceled'],
      default: 'pending',
    },

    items: {
      type: [orderItemSchema],
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
    },

    placedAt: {
      type: Date,
      default: Date.now,
    },
    acceptedAt: Date,
    readyAt: Date,
    servedAt: Date,
    completedAt: Date,
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

// Virtuals
orderSchema.virtual('tableDetails', {
  ref: 'Table',
  localField: 'table',
  foreignField: '_id',
  justOne: true,
});

// Critical indexes for real-time dashboards
orderSchema.index({ merchant: 1, status: 1, placedAt: -1 });
orderSchema.index({ merchant: 1, table: 1 });
orderSchema.index({ tableNumber: 1, status: 1 });
orderSchema.index({ customer: 1, placedAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
