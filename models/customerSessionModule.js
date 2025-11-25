const mongoose = require('mongoose');
const { Schema } = mongoose;

// At top of customerSessionSchema file
const SESSION_DURATION_HOURS = process.env.SESSION_DURATION_HOURS || 4;
const SESSION_DURATION_MS = 1000 * 60 * 60 * SESSION_DURATION_HOURS;

const customerSessionSchema = new Schema(
  {
    // *** SECURITY CRITICAL FIELDS ***
    token: {
      type: String,
      required: true,
      unique: true, // Must be unique for quick and secure lookup
      index: true,
    },
    tableId: {
      type: String, // Linking the session to the physical location
      required: true,
      index: true,
    },
    // *** CONTEXT & EXPIRY ***
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    // Keep customer optional if anonymous ordering is allowed
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: false, // Set to false if not all customers log in
      index: true,
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
    },
    // Session is functionally expired after this time (2 hours recommended)
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + SESSION_DURATION_MS),
      // TTL index to automatically delete documents 1 day after expiresAt
      index: { expires: '1d' },
    },
    // Used to immediately revoke the token after the final order is placed
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookup by merchant and location
customerSessionSchema.index(
  { tableId: 1, merchant: 1, isActive: 1, expiresAt: 1 },
  {
    unique: true,
  }
);

module.exports = mongoose.model('CustomerSession', customerSessionSchema);
