// models/Customer.js
const mongoose = require('mongoose');
const { Schema } = mongoose;   // ← THIS LINE WAS MISSING! NOW FIXED

const customerSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      validate: {
        validator: v => !v || /^\+?251[79]\d{8}$/.test(v.replace(/\s/g, '')),
        message: 'Invalid Ethiopian phone number',
      },
    },

    // Social logins
    facebook: { id: String, username: String, profilePic: String },
    tiktok: { id: String, username: String, profilePic: String },
    telegram: {
      id: String,
      username: String,
      firstName: String,
      profilePic: String,
    },

    source: {
      type: String,
      enum: ['guest', 'facebook', 'tiktok', 'telegram'],
      default: 'guest',
      required: true,
    },

    currentTable: { type: String, trim: true },
    lastSeen: { type: Date, default: Date.now },

    // ────── CRM & LOYALTY SYSTEM ──────
    loyalty: {
      points: { type: Number, default: 0 },
      totalPointsEarned: { type: Number, default: 0 },
      totalPointsSpent: { type: Number, default: 0 },
      tier: {
        type: String,
        enum: ['bronze', 'silver', 'gold', 'platinum'],
        default: 'bronze',
      },
      joinedAt: { type: Date, default: Date.now },
      gifts: [
        {
          name: String,
          type: { type: String, enum: ['free_item', 'discount', 'cash_value'] },
          value: Number,
          menuItem: { type: Schema.Types.ObjectId, ref: 'Menu' },
          claimed: { type: Boolean, default: false },
          claimedAt: Date,
          expiresAt: Date,
          givenBy: { type: Schema.Types.ObjectId, ref: 'User' },
          givenAt: { type: Date, default: Date.now },
          reason: String,
        },
      ],
    },

    // Staff notes & tags
    tags: [
      {
        value: String,
        addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    notes: [
      {
        text: String,
        addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: Profile image fallback
customerSchema.virtual('profileImage').get(function () {
  return (
    this.facebook?.profilePic ||
    this.tiktok?.profilePic ||
    this.telegram?.profilePic ||
    '/images/default-avatar.png'
  );
});

// Indexes
customerSchema.index({ merchant: 1, 'facebook.id': 1 }, { unique: true, sparse: true });
customerSchema.index({ merchant: 1, 'tiktok.id': 1 }, { unique: true, sparse: true });
customerSchema.index({ merchant: 1, 'telegram.id': 1 }, { unique: true, sparse: true });
customerSchema.index({ merchant: 1, phone: 1 }, { unique: true, sparse: true });
customerSchema.index({ merchant: 1, lastSeen: -1 });
customerSchema.index({ 'loyalty.tier': 1, merchant: 1 });

// Auto-clean old inactive guests after 90 days
customerSchema.index(
  { lastSeen: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90, partialFilterExpression: { source: 'guest' } }
);

module.exports = mongoose.model('Customer', customerSchema);