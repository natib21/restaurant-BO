const mongoose = require('mongoose');
const validator = require('validator');

const guest = new mongoose.Schema(
  {
    // 1. Core Associations (The "Where")
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'Guest session must belong to a merchant'],
    },
    tableNumber: {
      type: String,
      trim: true,
      required: false,
    },

    fullName: {
      type: String,
      required: false,
      trim: true,
    },
    phone: {
      type: String,
      required: false,
      trim: true,

      validate: {
        validator: function (v) {
          if (!v) return true; // Allows null/undefined when not provided
          return /^\+?251[79]\d{8}$/.test(v.replace(/\s+/g, ''));
        },
        message: 'Please provide a valid Ethiopian phone number',
      },
    },

    isExpired: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,

      expires: '2h',
    },
  },
  {
    timestamps: true,
  }
);

// TTL Index for automatic cleanup of guest sessions
guestSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });

const GuestSession = mongoose.model('Guest', guest);

module.exports = GuestSession;
