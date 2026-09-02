// models/Order.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const Counter = require('./CounterModel.js');
const auditPlugin = require('../utils/auditPlugin');
/* -----------------------------------------------------
   Order Item Sub-schema (snapshot of menu at order time)
------------------------------------------------------ */
const orderItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'Menu', required: true },
    name: { type: String, trim: true }, // snapshot of menu item name (primary locale) at order time
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0, default: null }, // COGS per unit — null if no recipe/inventory tracking
    totalPrice: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    
    // ✅ Item-level workflow fields (snapshotted from MenuItem at order creation)
    requiresKitchen: { 
      type: Boolean, 
      default: true,
      comment: 'Snapshotted from MenuItem.requiresKitchen - determines if item generates kitchen tickets'
    },
    
    // ✅ Item status tracking
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'ready', 'served', 'void'],
      default: 'pending',
      index: true,
      comment: 'Item-level status independent of order status'
    },
    
    // ✅ Served tracking
    servedAt: { type: Date, default: null },
    servedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    servedVia: {
      type: String,
      enum: ['auto', 'manual'],
      default: null,
      comment: 'auto = system auto-served (e.g., non-cooked dine-in items), manual = staff explicitly served'
    },
    
    // ✅ Void tracking
    voidedAt: { type: Date, default: null },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason: { type: String, trim: true, default: null },
    
    // ✅ Replacement tracking
    replacementItemId: { 
      type: Schema.Types.ObjectId, 
      default: null,
      comment: 'If this item was voided and replaced, points to the replacement item'
    },
    replacedItemId: { 
      type: Schema.Types.ObjectId, 
      default: null,
      comment: 'If this item is a replacement, points to the original voided item'
    },
  },
  { _id: true } // ✅ PHASE 0: Enable _id for KDS ticket item tracking
);
const deliverySchema = new Schema(
  {
    location: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    addressNote: { type: String, trim: true, maxlength: 500 },
    // Contact number for whoever's delivering — may differ from
    // customerPhone already on the order.
    phone: { type: String, trim: true },
    fee: { type: Number, default: 0, min: 0 },
    // Free-text, no account — "Abebe (branch motorbike)". Matches the
    // no-rider-account model you described.
    handledBy: { type: String, trim: true, maxlength: 100 },
    // Written by OrderStateMachineService.applyDeliveryStatusTimestamps —
    // already implemented, just needs these fields to exist on the schema.
    dispatchedAt: Date,
    deliveredAt: Date,
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
 delivery: {
   type: deliverySchema,
   required: function () {
   return this.orderType === 'delivery';
  },
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
      enum: ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'served', 'completed', 'canceled'],
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

/* ✅ FIXED: Order number generation moved to OrderTransactionService
   (lines in transaction context). This prevents race condition where
   order number could be generated twice (once pre-validate, once in transaction).
   
   Format examples:
   - #T5-467      (dine-in with table T5)
   - #TAKE-120    (takeaway)
   - #DEL-980     (delivery)
------------------------------------------------------ */

orderSchema.pre('validate', function (next) {
     if (this.orderType === 'delivery') {
       if (!this.delivery?.location?.lat || !this.delivery?.location?.lng) {
         return next(new Error('delivery.location is required for delivery orders'));
       }
       if (!this.delivery?.phone) {
         return next(new Error('delivery.phone is required for delivery orders'));
       }
    }
      next();
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

// Advanced Reporting indexes (Requirement 18.1)
orderSchema.index({ merchant: 1, paymentStatus: 1, placedAt: -1 }); // For sales reports filtering by payment status
orderSchema.index({ merchant: 1, branch: 1, placedAt: -1 }); // For branch-specific report queries

/* -----------------------------------------------------
   Virtual — clean populate for frontend
------------------------------------------------------ */
orderSchema.virtual('tableDetails', {
  ref: 'Table',
  localField: 'table',
  foreignField: '_id',
  justOne: true,
});

// ✅ PHASE 2 - STEP 4: Apply audit plugin for Order model
// Track business-critical fields (financial, status, payment)
orderSchema.plugin(auditPlugin, {
  resource: 'Order',
  auditedFields: [
    'status',
    'orderType',
    'totalAmount',
    'subtotal',
    'taxAmount',
    'discountAmount',
    'paymentStatus',
    'paymentDetails',
    'canceledAt',
    'canceledBy',
    'canceledReason',
    'assignedWaiter',
    'assignedKitchenStaff',
  ],
});

module.exports = mongoose.model('Order', orderSchema);
