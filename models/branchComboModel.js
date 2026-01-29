// models/BranchCombo.js
const mongoose = require('mongoose');

const comboItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'BranchMenu', required: true },
  nameFallback: String,
  quantity: { type: Number, required: true, min: 1, default: 1 },
});

const branchComboSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true },
    description: String,
    items: [comboItemSchema],
    comboPrice: { type: Number, required: true },
    originalPrice: Number,
    image: String,
    isActive: { type: Boolean, default: true },
    validFrom: Date,
    validUntil: Date,
    priority: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BranchCombo', branchComboSchema);
