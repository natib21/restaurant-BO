// models/Supplier.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const auditPlugin = require('../utils/auditPlugin');

const supplierSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    paymentTerms: {
      type: String,
      enum: ['cash', 'net_7', 'net_15', 'net_30', 'net_60'],
      default: 'net_30',
    },
    leadTime: {
      type: Number, // days
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
supplierSchema.index({ merchant: 1, name: 1 });
supplierSchema.index({ merchant: 1, isActive: 1 });

// Apply audit plugin BEFORE model creation
supplierSchema.plugin(auditPlugin, {
  resource: 'Supplier',
  auditedFields: [
    'name',
    'contactPerson',
    'phone',
    'email',
    'address',
    'paymentTerms',
    'leadTime',
    'isActive',
    'rating',
  ],
});

module.exports = mongoose.model('Supplier', supplierSchema);
