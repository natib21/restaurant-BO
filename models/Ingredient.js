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
    reservedStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    reorderQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    alertStatus: {
      type: String,
      enum: ['OK', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'],
      default: 'OK',
    },
    dailyUsageRate: {
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

/**
 * Helper function to compute alertStatus from current stock levels
 * Used by hooks to keep alertStatus field in sync
 */
function computeAlertStatus(currentStock, minStock) {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock < minStock * 0.5) return 'CRITICAL';
  if (currentStock <= minStock) return 'LOW';
  return 'OK';
}

// Hooks to auto-update alertStatus when stock changes

// Hook 1: pre('save') - for new documents and direct .save() calls
ingredientSchema.pre('save', function (next) {
  if (this.isModified('currentStock') || this.isModified('minStock') || this.isNew) {
    this.alertStatus = computeAlertStatus(this.currentStock, this.minStock);
  }
  next();
});

// Hook 2: post('findOneAndUpdate') - for atomic updates via findOneAndUpdate
ingredientSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) {
    const updatedStatus = computeAlertStatus(doc.currentStock, doc.minStock);
    if (doc.alertStatus !== updatedStatus) {
      doc.alertStatus = updatedStatus;
      await doc.save();
    }
  }
});

// Hook 3: post('save') - runs after save completes (for logging/events if needed)
ingredientSchema.post('save', function (doc) {
  // Reserved for future use (e.g., triggering events)
  // Current implementation: no-op, but hook is in place per V3 spec
});

// Virtual for stock status - maps from alertStatus + independent over_stock check
ingredientSchema.virtual('stockStatus').get(function () {
  // Check over_stock independently (not in alertStatus enum)
  if (this.maxStock > 0 && this.currentStock >= this.maxStock) {
    return 'over_stock';
  }
  
  // Map alertStatus to legacy stockStatus values
  switch (this.alertStatus) {
    case 'OUT_OF_STOCK':
      return 'out_of_stock';
    case 'CRITICAL':
    case 'LOW':
      return 'low_stock';
    case 'OK':
    default:
      return 'in_stock';
  }
});

// Instance method to check if low stock - reads from alertStatus
ingredientSchema.methods.isLowStock = function () {
  return this.alertStatus === 'LOW' || 
         this.alertStatus === 'CRITICAL' || 
         this.alertStatus === 'OUT_OF_STOCK';
};

// Static method to get low stock items - queries alertStatus field
ingredientSchema.statics.getLowStockItems = function (merchantId) {
  return this.find({
    merchant: merchantId,
    isActive: true,
    alertStatus: { $in: ['LOW', 'CRITICAL', 'OUT_OF_STOCK'] },
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
    'reservedStock',
    'reorderQuantity',
    'alertStatus',
    'dailyUsageRate',
    'costPerUnit',
    'supplier',
    'isActive',
    'lastRestocked',
    'expiryDate',
  ],
});

module.exports = mongoose.model('Ingredient', ingredientSchema);
