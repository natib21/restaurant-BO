// models/Branch.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
    },

    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    isMain: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

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
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
      wereda: String,
      city: { type: String, required: true },
      subCity: String,
      specificArea: String,
      building: String,
      formattedAddress: String,
    },

    // ─────── BRANCH IDENTIFIERS & SECRETS ───────
    qrSecretKey: {
      type: String,
      required: true,
      select: false,
      default: () => crypto.randomBytes(64).toString('hex'),
    },

    branchCode: {
      type: String,
      trim: true,
      uppercase: true,
    },

    shortCode: {
      type: String,
      length: 6,
      uppercase: true,
      unique: true,
      sparse: true,
      default: () => crypto.randomBytes(3).toString('hex').toUpperCase(),
    },

    // ─────── SETTINGS (overrides merchant defaults) ───────
    settings: {
      onlineOrderingEnabled: { type: Boolean, default: true },
      deliveryEnabled:       { type: Boolean, default: false },
      pickupEnabled:         { type: Boolean, default: true },
      isActive:              { type: Boolean, default: true }, // duplicate but kept for override clarity
      autoAcceptOrders:      { type: Boolean, default: false },
      requireWaiterConfirmation: { type: Boolean, default: false },
      prepTimeMinutes: {
        type: Number,
        default: 15,
        min: [5, 'Prep time must be at least 5 minutes'],
        max: [180, 'Prep time cannot exceed 3 hours'],
      },
    },

    // ─────── REFERENCES ───────
    menu: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Menu',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─────── INDEXES ───────
branchSchema.index({ location: '2dsphere' });
branchSchema.index({ merchant: 1, isMain: 1 });
branchSchema.index({ merchant: 1, branchCode: 1 }, { unique: true });
branchSchema.index({ shortCode: 1 }, { unique: true, sparse: true });
branchSchema.index({ isActive: 1 });
branchSchema.index({ 'settings.isActive': 1 });

// ─────── VIRTUALS ───────

// Best customer-facing URL: short, clean, fast
branchSchema.virtual('publicUrl').get(function () {
  if (this.shortCode) {
    return `https://menuroom.et/b/${this.shortCode}`;
  }
  // Fallback (should rarely happen)
  return `https://menuroom.et/branch/${this._id}`;
});

// Get the menu to use (branch-specific → merchant default)
branchSchema.virtual('effectiveMenu').get(function () {
  return this.menu || (this.populated('merchant') ? this.merchant.menu : null);
});

// Optional: async version if you need full population
branchSchema.methods.getEffectiveMenu = async function () {
  await this.populate('merchant menu');
  return this.menu || this.merchant?.menu || null;
};

// ─────── MIDDLEWARE ───────

branchSchema.pre('save', async function (next) {
  // 1. Ensure only one main branch per merchant
  if (this.isMain && this.isModified('isMain')) {
    await this.constructor.updateMany(
      { merchant: this.merchant, _id: { $ne: this._id } },
      { $set: { isMain: false } }
    );
  }

  // 2. Auto-generate branchCode safely (BR-001, BR-002, ...)
  if (!this.branchCode) {
    const lastBranch = await this.constructor
      .findOne({ merchant: this.merchant })
      .sort({ createdAt: -1 })
      .select('branchCode');

    let nextNum = 1;
    if (lastBranch?.branchCode) {
      const match = lastBranch.branchCode.match(/^BR-(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }
    this.branchCode = `BR-${String(nextNum).padStart(3, '0')}`;
  }

  next();
});

// Optional: Ensure shortCode is always uppercase
branchSchema.pre('save', function (next) {
  if (this.shortCode) {
    this.shortCode = this.shortCode.toUpperCase();
  }
  next();
});

const Branch = mongoose.model('Branch', branchSchema);
module.exports = Branch;