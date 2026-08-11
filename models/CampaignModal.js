// models/Campaign.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const campaignSchema = new Schema(
  {
    merchant: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },

    name: { type: String, required: true, trim: true },

    // Only 'telegram' for now — Messenger/SMS/TikTok can be added as
    // separate values here later without changing anything else in this model.
    channel: { type: String, enum: ['telegram'], default: 'telegram', required: true },

    message: { type: String, required: true, trim: true, maxlength: 1000 },
    imageUrl: String, // optional — Telegram supports photo + caption in one message

    // Simple audience filter — leave a field empty/undefined to not filter on it
    audience: {
      tags: [String],
      loyaltyTier: [{ type: String, enum: ['bronze', 'silver', 'gold', 'platinum'] }],
      minTotalOrders: Number,
    },

    status: {
      type: String,
      enum: ['draft', 'sending', 'sent', 'failed'],
      default: 'draft',
      index: true,
    },

    stats: {
      audienceSize: { type: Number, default: 0 },
      sentCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentAt: Date,
  },
  { timestamps: true }
);

campaignSchema.index({ merchant: 1, createdAt: -1 });

module.exports = mongoose.model('Campaign', campaignSchema);