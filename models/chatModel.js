// models/Chat.js
const chatSchema = new mongoose.Schema(
  {
    merchant: { type: mongoose.ObjectId, ref: 'Merchant' },
    customer: { type: mongoose.ObjectId, ref: 'Customer' },
    message: String,
    direction: { type: String, enum: ['in', 'out'] },
    platform: String,
  },
  { timestamps: true }
);
module.exports = mongoose.model('Chat', chatSchema);
