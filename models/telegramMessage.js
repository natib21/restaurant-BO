// models/TelegramMessage.js
// REQUIRED PATCH: telegramService.sendMessage() now writes `status` and
// `error` on every outbound message so failed sends (e.g. bot blocked) are
// visible in the CRM inbox instead of silently disappearing. Add these two
// fields to your existing schema:

const mongoose = require('mongoose');
const { Schema } = mongoose;

const telegramMessageSchema = new Schema(
  {
    merchant: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    text: { type: String, required: true },
    telegramMessageId: { type: String }, // Telegram's own message_id, for dedup/troubleshooting
    readAt: { type: Date, default: null }, // set when merchant views it in the dashboard

    // ── NEW FIELDS ──
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent',
    },
    error: { type: String, default: null }, // Telegram's error description when status: 'failed'
  },
  { timestamps: true }
);

telegramMessageSchema.index({ merchant: 1, customer: 1, createdAt: 1 });

module.exports = mongoose.model('TelegramMessage', telegramMessageSchema);
