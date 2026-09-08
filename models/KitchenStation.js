// models/KitchenStation.js
// ✅ PHASE 0: Kitchen Display System - Station model
const mongoose = require('mongoose');
const { Schema } = mongoose;
const auditPlugin = require('../utils/auditPlugin');

const kitchenStationSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
      // Examples: GRILL, SALAD, BAR, FRY
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique station code per branch
kitchenStationSchema.index({ branch: 1, code: 1 }, { unique: true });

// For listing active stations in a branch
kitchenStationSchema.index({ branch: 1, isActive: 1, displayOrder: 1 });

// Apply audit plugin BEFORE model creation
kitchenStationSchema.plugin(auditPlugin, {
  resource: 'KitchenStation',
  auditedFields: ['name', 'code', 'description', 'isActive', 'displayOrder'],
});

module.exports = mongoose.model('KitchenStation', kitchenStationSchema);
