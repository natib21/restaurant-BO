// models/PurchaseOrder.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const purchaseOrderItemSchema = new Schema(
  {
    ingredient: {
      type: Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unitPrice: {
      type: Number,
      min: 0,
    },
    totalPrice: {
      type: Number,
      min: 0,
    },
  },
  { _id: false }
);

const purchaseOrderSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    supplier: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
    },
    poNumber: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'],
      default: 'draft',
    },
    items: [purchaseOrderItemSchema],
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    expectedDeliveryDate: Date,
    actualDeliveryDate: Date,
    notes: String,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
purchaseOrderSchema.index({ merchant: 1, status: 1 });
purchaseOrderSchema.index({ merchant: 1, supplier: 1 });
purchaseOrderSchema.index({ poNumber: 1 });

// Pre-save: Generate PO number
purchaseOrderSchema.pre('save', async function (next) {
  if (!this.poNumber && this.isNew) {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const count = await this.constructor.countDocuments({
      merchant: this.merchant,
      createdAt: { $gte: new Date().setHours(0, 0, 0, 0) },
    });
    this.poNumber = `PO-${today}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

// Pre-save: Calculate totals
purchaseOrderSchema.pre('save', function (next) {
  this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
  this.totalAmount = this.subtotal + this.taxAmount;
  next();
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
