// models/Feedback.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const feedbackSchema = new Schema(
  {
    merchant: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },

    // FIX: branch is now required. Feedback is inherently about a specific
    // location, even when there's no order behind it (e.g. general QR
    // feedback) — every branch-having flow (Order, CustomerSession) already
    // requires branch, this was the one inconsistent spot.
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true, default: null },

    // Stays optional — not all feedback traces back to a specific order
    // (general branch feedback, walk-in comments before checkout, etc).
    order: { type: Schema.Types.ObjectId, ref: 'Order', index: true, default: null },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },

    categories: [
      {
        type: String,
        enum: [
          'food_quality',
          'service',
          'cleanliness',
          'ambiance',
          'delivery_time',
          'value_for_money',
          'other',
        ],
      },
    ],

    channel: {
      type: String,
      enum: ['app', 'qr_table', 'telegram', 'facebook', 'google', 'walk_in', 'other'],
      default: 'app',
    },

    images: [{ type: String }],

    status: {
      type: String,
      enum: ['pending', 'reviewed', 'responded', 'resolved', 'flagged'],
      default: 'pending',
      index: true,
    },

    response: {
      text: String,
      respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      respondedAt: Date,
    },

    isPublic: { type: Boolean, default: true },
    isAnonymous: { type: Boolean, default: false },

    flaggedReason: String,
  },
  { timestamps: true }
);

feedbackSchema.index({ merchant: 1, branch: 1, createdAt: -1 });
feedbackSchema.index({ merchant: 1, status: 1 });
feedbackSchema.index({ merchant: 1, rating: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
