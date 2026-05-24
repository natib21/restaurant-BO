const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Immutable published menu snapshot per branch (versioned).
 * Active orders reference live menu items; snapshots are for QR/public reads.
 */
const menuPublicationSchema = new Schema(
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
    menuGroup: {
      type: Schema.Types.ObjectId,
      ref: 'MenuGroup',
      required: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['published', 'archived'],
      default: 'published',
      index: true,
    },
    publishedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
    recipeValidation: {
      passed: { type: Boolean, default: true },
      missingRecipes: [{ menuItemId: Schema.Types.ObjectId, name: String }],
    },
  },
  { timestamps: true }
);

menuPublicationSchema.index({ merchant: 1, branch: 1, status: 1, version: -1 });
menuPublicationSchema.index(
  { merchant: 1, branch: 1, menuGroup: 1, version: 1 },
  { unique: true }
);

module.exports = mongoose.model('MenuPublication', menuPublicationSchema);
