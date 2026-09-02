// models/Branch.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const auditPlugin = require('../utils/auditPlugin');
const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    isMain: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },

    phone: {
      type: String,
      trim: true,
      validate: {
        validator: v => !v || /^\+?251[79]\d{8}$/.test(v.replace(/\s+/g, '')),
        message: 'Invalid Ethiopian phone number',
      },
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
      wereda: String,
      city: { type: String, required: true },
      subCity: String,
      specificArea: String,
      building: String,
      formattedAddress: String,
    },

    // IDENTIFIERS & SECRETS
    qrSecretKey: {
      type: String,
      required: true,
      select: false,
      default: () => crypto.randomBytes(64).toString('hex'),
    },
    qrVersion: { type: Number, default: 1 }, // bump to invalidate all QRs

    branchCode: { type: String, uppercase: true, trim: true }, // e.g. BR-001
    shortCode: { type: String, length: 6, uppercase: true, unique: true, sparse: true },
    // Partial override of merchant settings
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    
    // ✅ Branch-specific configuration
    config: {
      orderNumberStart: {
        type: Number,
        default: 1,
        min: 1,
        comment: 'Starting number for order sequence in this branch (default: 1)'
      }
      // Future: Add more config options (table number format, receipt settings, etc.)
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
branchSchema.index({ location: '2dsphere' });
branchSchema.index({ merchant: 1, isMain: 1 });
branchSchema.index({ merchant: 1, branchCode: 1 }, { unique: true });
branchSchema.index({ shortCode: 1 }, { unique: true, sparse: true });
branchSchema.index({ isActive: 1 });

// Virtual: Clean public URL
branchSchema.virtual('publicUrl').get(function () {
  return this.shortCode
    ? `https://menuroom.et/b/${this.shortCode}`
    : `https://menuroom.et/branch/${this._id}`;
});

// Effective settings (deep merge: merchant defaults ← branch overrides)
branchSchema.methods.getEffectiveSettings = async function () {
  const merchant = this.merchant || (await this.populate('merchant').execPopulate());
  return {
    ...(merchant?.settings || {}),
    ...(this.settings || {}),
    isActive: this.isActive,
  };
};

// Pre-save: Enforce one main branch
branchSchema.pre('save', async function (next) {
  if (this.isMain) {
    await this.constructor.updateMany(
      { merchant: this.merchant, _id: { $ne: this._id } },
      { $set: { isMain: false } }
    );
  }
  next();
});

// Pre-save: Generate branchCode using atomic counter
branchSchema.pre('save', async function (next) {
  if (!this.branchCode && this.merchant) {
    const merchant = await mongoose
      .model('Merchant')
      .findByIdAndUpdate(
        this.merchant,
        { $inc: { branchCounter: 1 } },
        { new: true, select: 'branchCounter' }
      );

    if (!merchant) return next(new Error('Merchant not found'));
    this.branchCode = `BR-${String(merchant.branchCounter).padStart(3, '0')}`;
  }
  next();
});

// Pre-save: Generate unique shortCode safely
branchSchema.pre('save', async function (next) {
  if (!this.shortCode) {
    let attempts = 0;
    while (attempts < 10) {
      const candidate = crypto.randomBytes(3).toString('hex').toUpperCase();
      const exists = await this.constructor.exists({
        shortCode: candidate,
        _id: { $ne: this._id },
      });
      if (!exists) {
        this.shortCode = candidate;
        break;
      }
      attempts++;
    }
    if (!this.shortCode) {
      return next(new Error('Unable to generate unique shortCode after 10 attempts'));
    }
  } else {
    this.shortCode = this.shortCode.toUpperCase();
  }
  next();
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 2 - STEP 3: Apply Audit Plugin
// ══════════════════════════════════════════════════════════════════════════


branchSchema.plugin(auditPlugin, {
  resource: 'Branch',
  auditedFields: ['name', 'phone', 'isActive', 'isMain', 'location', 'settings'],
});

const Branch = mongoose.model('Branch', branchSchema);
module.exports = Branch;
