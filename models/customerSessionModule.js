const mongoose = require('mongoose');
const { Schema } = mongoose;

const customerSessionSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
      // unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
      index: { expires: '1d' }, // auto-delete after expiry
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookup
customerSessionSchema.index({ token: 1 });
customerSessionSchema.index({ customer: 1, isActive: 1 });

module.exports = mongoose.model('CustomerSession', customerSessionSchema);
