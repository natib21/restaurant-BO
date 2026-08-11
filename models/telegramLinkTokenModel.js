// models/TelegramLinkToken.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const telegramLinkTokenSchema = new Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    merchant: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    table: { type: String, default: null }, // set if generated from a table QR before an order exists
    used: { type: Boolean, default: false },
    usedAt: Date,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// auto-cleanup expired tokens (MongoDB TTL index)
telegramLinkTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TelegramLinkToken', telegramLinkTokenSchema);