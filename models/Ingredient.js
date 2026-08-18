// models/Ingredient.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const auditPlugin = require('../utils/auditPlugin');

const ingredientSchema = new Schema(
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
    category: {
      type: String,
      enum: ['vegetables', 'meat', 'dairy', 'grains', 'spices', 'beverages', 'other'],
      default: 'other',
    },
    unit: {
      type: String,
      enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'boxes', 'cans'],
      required: true,
    },
    currentStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    minStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    costPerUnit: {
      type: Number,
      min: 0,
    },
    supplier: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastRestocked: Date,
    expiryDate: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes
ingredientSchema.index({ merchant: 1, name: 1 });
ingredientSchema.index({ merchant: 1, category: 1 });
ingredientSchema.index({ merchant: 1, currentStock: 1 });

// Virtual for stock status
ingredientSchema.virtual('stockStatus').get(function () {
  if (this.currentStock <= 0) return 'out_of_stock';
  if (this.currentStock <= this.minStock) return 'low_stock';
  if (this.currentStock >= this.maxStock) return 'over_stock';
  return 'in_stock';
});

// Instance method to check if low stock
ingredientSchema.methods.isLowStock = function () {
  return this.currentStock <= this.minStock;
};

// Static method to get low stock items
ingredientSchema.statics.getLowStockItems = function (merchantId) {
  return this.find({
    merchant: merchantId,
    isActive: true,
    $expr: { $lte: ['$currentStock', '$minStock'] },
  });
};

// Apply audit plugin BEFORE model creation
ingredientSchema.plugin(auditPlugin, {
  resource: 'Ingredient',
  auditedFields: [
    'name',
    'category',
    'unit',
    'currentStock',
    'minStock',
    'maxStock',
    'costPerUnit',
    'supplier',
    'isActive',
    'lastRestocked',
    'expiryDate',
  ],
});

module.exports = mongoose.model('Ingredient', ingredientSchema);
