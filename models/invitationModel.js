// models/Invitation.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const auditPlugin = require('../utils/auditPlugin');

const invitationSchema = new mongoose.Schema(
  {
    // ─────── EMAIL ONLY (Recommended) ───────
    email: {
      type: String,
      required: [true, 'Email is required for invitation'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
    },

    // ─────── ROLE & BRANCH ASSIGNMENT ───────
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },

    // ─────── WHO SENT IT ───────
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ─────── SECURITY ───────
    token: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomBytes(32).toString('hex'),
    },
    expiresAt: {
      type: Date,
      default: () => Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      index: { expires: '7d' },
    },

    // ─────── STATUS ───────
    used: { type: Boolean, default: false },
    usedAt: Date,
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Optional personal message
    message: { type: String, maxlength: 300 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
invitationSchema.index({ token: 1 });
invitationSchema.index({ email: 1 });
invitationSchema.index({ used: 1 });

// Virtual invite link
invitationSchema.virtual('inviteLink').get(function () {
  return `${process.env.FRONTEND_URL}/invite/${this.token}`;
});

invitationSchema.methods.markAsUsed = function (userId) {
  this.used = true;
  this.usedAt = new Date();
  this.usedBy = userId;
  return this.save();
};

// Apply audit plugin BEFORE model creation
invitationSchema.plugin(auditPlugin, {
  resource: 'Invitation',
  auditedFields: [
    'used',
    'usedAt',
    'usedBy',
    'role',
    'branch',
    'email',
    'invitedBy',
    'expiresAt',
  ],
});

module.exports = mongoose.model('Invitation', invitationSchema);
