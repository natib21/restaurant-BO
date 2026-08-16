// models/Order.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const Counter = require('./CounterModel.js');
/* -----------------------------------------------------
   Order Item Sub-schema (snapshot of menu at order time)
------------------------------------------------------ */
const orderItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'Menu', required: true },
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
      required: false,
      sparse: true,
      index: true,
    },

    customerName: { type: String, required: true, trim: true },
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
      required: true,
      index: true,
    },

    orderType: {
      type: String,
      enum: ['dine_in', 'takeaway', 'delivery'],
      default: 'dine_in',
      required: true,
    },
    source: {
      type: String,
      enum: ['web', 'telegram', 'admin', 'waiter'],
      default: 'web',
      required: true,
      index: true,
    },
    deliveryNotes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
   status: {
  type: String,
  enum: [
    'pending', 'accepted', 'preparing', 'ready', 'served',
    'out_for_delivery', 'delivered',
    'completed', 'canceled',
  ],
  default: 'pending',
  index: true,
},
    statusHistory: [
      {
        fromStatus: { type: String, required: true },
        toStatus: { type: String, required: true },
        changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        changedAt: { type: Date, default: Date.now },
        reason: { type: String, trim: true },
      },
    ],
    canceledAt: Date,
    canceledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    canceledReason: { type: String, trim: true },
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
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: function () {
          return this.orderType === 'delivery';
        },
        validate: {
          validator: function (arr) {
            // Skip check if not delivery (extra safety layer)
            if (this.orderType !== 'delivery') return true;
            return Array.isArray(arr) && arr.length === 2;
          },
          message: 'Delivery orders require coordinates as [longitude, latitude]',
        },
      },

      city: {
        type: String,
        required: function () {
          return this.orderType === 'delivery';
        },
        trim: true, // ← add this (auto-trim input)
        validate: {
          validator: function (val) {
            if (this.orderType !== 'delivery') return true;
            return typeof val === 'string' && val.trim().length > 0;
          },
          message: 'Delivery orders require a non-empty city name',
        },
      },
      wereda: { type: String, trim: true },
      subCity: { type: String, trim: true },
      specificArea: { type: String, trim: true },
      building: { type: String, trim: true },
      formattedAddress: { type: String, trim: true },
    },
    paymentDetails: {
      method: {
        type: String,
        enum: ['cash', 'mobile_banking', 'card', 'unspecified'],
        default: 'unspecified',
      },
      bankName: {
        type: String,
        trim: true,
      },
      receiptImage: {
        type: String,
      },
      transactionId: {
        type: String,
        trim: true,
      },
      paidAt: {
        type: Date,
      },
    },
    placedAt: { type: Date, default: Date.now, immutable: true },
    placedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: Date,
    readyAt: Date,
    servedAt: Date,
    completedAt: Date,
    outForDeliveryAt: Date,
deliveredAt: Date,

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
/* -----------------------------------------------------
   Auto-generate Professional Order Number
------------------------------------------------------ */
// CHANGE 'save' TO 'validate'
orderSchema.pre('validate', async function (next) {
  if (!this.isNew || this.orderNumber) return next();
  if (!this.merchant || !this.branch) return next();

  try {
    const today = new Date().toISOString().split('T')[0];
    let prefix = 'POS';

    if (this.orderType === 'dine_in' && this.tableNumber) {
      prefix = this.tableNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'POS';
    } else if (this.orderType === 'delivery') prefix = 'DEL';
    else if (this.orderType === 'takeaway') prefix = 'TAKE';
    

    const counter = await Counter.findOneAndUpdate(
      { merchantId: this.merchant, branchId: this.branch, date: today, prefix },
      { $inc: { seq: 1 }, $setOnInsert: { prefix } },

      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Append milliseconds to ensure uniqueness if race conditions occur
    const millis = Date.now() % 1000;
    this.orderNumber = `#${prefix}-${counter.seq}-${millis}`;
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
