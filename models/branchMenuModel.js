// models/BranchMenuItem.js
const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  size: String,
  volume: String,
  price: Number,
  calories: Number,
  available: { type: Boolean, default: true },
});

const branchMenu = new mongoose.Schema(
  {
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },

    // Link to master item (null = branch-only custom item)
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Menu',
      default: null,
      sparse: true,
    },

    // === For branch-only items (no master) ===
    name: { type: String },
    description: String,
    category: String,
    image: String,
    variants: [variantSchema],

    // === Override fields (only used if masterItem exists) ===
    overridePrice: Number,
    overrideName: String,
    overrideVariants: [variantSchema],
    overrideImage: String,
    isHidden: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

branchMenu.index({ branch: 1, menuItem: 1 }, { unique: true, sparse: true });
branchMenu.index({ branch: 1 });

module.exports = mongoose.model('BranchMenu', branchMenu);
