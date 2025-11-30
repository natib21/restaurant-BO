// models/Order.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/* -----------------------------------------------------
   Order Item Sub-schema (snapshot of menu at order time)
------------------------------------------------------ */
const orderItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

/* -----------------------------------------------------
   Main Order Schema
------------------------------------------------------ */
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

    customerName: { type: String, required: true },
    customerPhone: { type: String },

    // For dine-in orders
    table: {
      type: Schema.Types.ObjectId,
      ref: 'Table',
      index: true,
      required: function () {
        return this.orderType === 'dine_in';
      },
    },

    // Useful for fast lookup without population
    tableNumber: { type: String, trim: true },

    // Example: #T5-467, #DEL-893, #TAKE-105
    orderNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    orderType: {
      type: String,
      enum: ['dine_in', 'takeaway', 'delivery'],
      default: 'dine_in',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'canceled'],
      default: 'pending',
      index: true,
    },
    items: { type: [orderItemSchema], required: true },

    subtotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
    },

    placedAt: { type: Date, default: Date.now, immutable: true },
    acceptedAt: Date,
    readyAt: Date,
    servedAt: Date,
    completedAt: Date,

    // Users assigned by merchant (dynamic roles)
    assignedWaiter: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assignedKitchenStaff: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* -----------------------------------------------------
   Auto-generate Professional Order Number
   Format examples:
   - #T5-467      (dine-in with table T5)
   - #TAKE-120    (takeaway)
   - #DEL-980     (delivery)
------------------------------------------------------ */
orderSchema.pre('save', async function (next) {
  if (!this.isNew || this.orderNumber) return next();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Determine prefix
    let prefix = 'POS';

    if (this.orderType === 'dine_in' && this.tableNumber) {
      prefix = this.tableNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
    } else if (this.orderType === 'delivery') {
      prefix = 'DEL';
    } else if (this.orderType === 'takeaway') {
      prefix = 'TAKE';
    }

    // Get last order today matching prefix
    const lastOrder = await this.constructor
      .findOne(
        {
          merchant: this.merchant,
          orderNumber: { $regex: `^#${prefix}-\\d+$` },
          placedAt: { $gte: today },
        },
        { orderNumber: 1 }
      )
      .sort({ orderNumber: -1 })
      .lean();

    let nextSeq = 1;

    if (lastOrder?.orderNumber) {
      const match = lastOrder.orderNumber.match(/-(\d+)$/);
      if (match) nextSeq = parseInt(match[1]) + 1;
    }

    // Generate final order number
    this.orderNumber = `#${prefix}-${nextSeq}`;

    next();
  } catch (err) {
    next(err);
  }
});

/* -----------------------------------------------------
   Indexes — for real restaurant performance
------------------------------------------------------ */
orderSchema.index({ merchant: 1, status: 1, placedAt: -1 });
orderSchema.index({ merchant: 1, status: 1, readyAt: -1 });
orderSchema.index({ merchant: 1, table: 1 });
orderSchema.index({ merchant: 1, orderNumber: 1 });
orderSchema.index({ customer: 1, placedAt: -1 });
orderSchema.index({ assignedWaiter: 1 });
orderSchema.index({ placedAt: -1 });

/* -----------------------------------------------------
   Virtual — clean populate for frontend
------------------------------------------------------ */
orderSchema.virtual('tableDetails', {
  ref: 'Table',
  localField: 'table',
  foreignField: '_id',
  justOne: true,
});

module.exports = mongoose.model('Order', orderSchema);
