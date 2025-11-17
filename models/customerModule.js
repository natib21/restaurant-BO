// models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'Customer must belong to a merchant'],
      index: true,
    },

    // Core info – always required
    fullName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      minlength: [2, 'Name too short'],
      maxlength: [50, 'Name too long'],
    },

    phone: {
      type: String,
      trim: true,
      sparse: true, // allows multiple nulls
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^\+?251[79]\d{8}$/.test(v.replace(/\s/g, ''));
        },
        message: 'Invalid Ethiopian phone number',
      },
    },

    // Social connections (optional)
    facebook: {
      id: { type: String, sparse: true },
      username: String,
      profilePic: String, // URL to profile picture
    },
    tiktok: {
      id: { type: String, sparse: true },
      username: String,
      profilePic: String,
    },
    telegram: {
      id: { type: String, sparse: true }, // Telegram user ID (numeric string)
      username: String, // @username or null
      firstName: String, // Telegram first name
      profilePic: String, // Telegram file_id or URL
    },

    // Where did this customer come from?
    source: {
      type: String,
      enum: ['guest', 'facebook', 'tiktok', 'telegram'],
      default: 'guest',
      required: true,
    },

    // Optional session info
    tableNumber: { type: String, trim: true },

    // Timestamps
    lastSeen: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ────── Compound Indexes for Fast Lookups (Multi-Tenant Safe) ──────
customerSchema.index({ merchant: 1, 'facebook.id': 1 }, { unique: true, sparse: true });
customerSchema.index({ merchant: 1, 'tiktok.id': 1 }, { unique: true, sparse: true });
customerSchema.index({ merchant: 1, 'telegram.id': 1 }, { unique: true, sparse: true });
customerSchema.index({ merchant: 1, source: 1, fullName: 1 }); // For guest deduplication

// ────── Auto-delete guest sessions after 2 hours ──────
customerSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 7200, // 2 hours
    partialFilterExpression: { source: 'guest' },
  }
);

// ────── Virtual: Easy way to get profile picture ──────
customerSchema.virtual('profileImage').get(function () {
  return (
    this.facebook?.profilePic ||
    this.tiktok?.profilePic ||
    this.telegram?.profilePic ||
    '/default-avatar.png' // fallback
  );
});

module.exports = mongoose.model('Customer', customerSchema);
