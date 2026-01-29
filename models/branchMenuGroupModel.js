// models/BranchMenuGroup.js
const mongoose = require('mongoose');

const groupItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BranchMenu',
    required: true,
  },
  sortOrder: { type: Number, default: 0 },
  isHidden: { type: Boolean, default: false },
});

const branchMenuGroup = new mongoose.Schema(
  {
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    description: String,
    bannerImage: String,
    priority: { type: Number, default: 0 },
    isAlcoholMenu: { type: Boolean, default: false },
    items: [groupItemSchema],
  },
  { timestamps: true }
);

branchMenuGroup.index({ branch: 1, priority: -1 });

module.exports = mongoose.model('BranchMenuGroup', branchMenuGroup);
