// models/merchantModel.js
const mongoose = require('mongoose');
const validator = require('validator');
const crypto = require('crypto');

const officialRepresentativeSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Representative full name is required'],
    trim: true,
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: [true, 'Representative gender is required'],
  },
  phone: {
    type: String,
    required: [true, 'Representative phone number is required'],
    trim: true,
    validate: {
      validator: function (v) {
        return /^\+?251[79]\d{8}$/.test(v.replace(/\s+/g, ''));
      },
      message: 'Please provide a valid Ethiopian representative phone number',
    },
  },
});

const merchantSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      unique: true,
      maxlength: [100, 'Business name cannot exceed 100 characters'],
    },
slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]+$/i, 'Slug can only contain letters, numbers and hyphens'],
    },

    customDomain: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      validate: {
        validator: v => !v || /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(v),
        message: 'Invalid custom domain',
      },
    },
    customDomainVerified: { type: Boolean, default: false },
    ownerName: {
      type: officialRepresentativeSchema,
      required: false,
    },

    sector: {
      type: String,
      enum: ['Food & Beverage', 'Retail', 'Service', 'Technology', 'Other'],
      trim: true,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      validate: {
        validator: function (v) {
          return v ? /^\+?251[79]\d{8}$/.test(v.replace(/\s+/g, '')) : true;
        },
        message: 'Please provide a valid Ethiopian phone number',
      },
    },

    tinId: {
      type: String,
      trim: true,
      uppercase: true,
    },

    status: {
      type: String,
      enum: ['pending', 'approved', 'suspended', 'inactive'],
      default: 'pending',
    },

    cuisineType: {
      type: [String],
      default: [],
    },

    // ──────────────────────── BRANDING ────────────────────────
    brandColor: {
      type: String,
      default: '#1A1A2E',
      match: [/^#[0-9A-Fa-f]{6}$/i, 'Invalid hex color'],
      uppercase: true,
      trim: true,
    },

    logo: {
      url: { type: String, validate: [validator.isURL, 'Invalid logo URL'] },
      public_id: String,
    },

    coverImage: {
      url: { type: String, validate: [validator.isURL, 'Invalid cover image URL'] },
      public_id: String,
    },

    // ──────────────────────── SETTINGS (THE ONE YOU WANTED) ────────────────────────
    settings: {
      // QR & Table Experience
      showTableNumberOnQR: { type: Boolean, default: true },
      qrStyle: {
        type: String,
        enum: ['classic', 'modern', 'rounded', 'dots'],
        default: 'modern',
      },
      qrLogoEnabled: { type: Boolean, default: true },
      qrForegroundColor: {
        type: String,
        default: '#000000',
        match: [/^#[0-9A-Fa-f]{6}$/i, 'Invalid hex color'],
      },
      qrBackgroundColor: {
        type: String,
        default: '#FFFFFF',
        match: [/^#[0-9A-Fa-f]{6}$/i, 'Invalid hex color'],
      },
      // Tips & Payments
      tipsEnabled: { type: Boolean, default: true },
      tipOptions: {
        type: [Number],
        default: [10, 15, 20],
        validate: {
          validator: arr => arr.every(n => n > 0 && n <= 100),
          message: 'Tip percentages must be between 1 and 100',
        },
      },
      allowCustomTip: { type: Boolean, default: true },

      // Language
      language: {
        type: String,
        enum: ['en', 'am', 'both'],
        default: 'both',
      },
      defaultLanguage: {
        type: String,
        enum: ['en', 'am'],
        default: 'am',
      },

      // Notifications
      notifications: {
        orderSoundEnabled: { type: Boolean, default: true },
        newOrderSound: { type: String, default: 'default' },
        smsNotifications: { type: Boolean, default: false },
        emailNotifications: { type: Boolean, default: true },
      },

      // Currency & Tax
      currency: {
        type: String,
        enum: ['ETB', 'USD'],
        default: 'ETB',
      },
      taxRate: { type: Number, default: 15, min: 0, max: 100 },
      serviceCharge: { type: Number, default: 0, min: 0, max: 100 },
    },

    subscriptionPlan: {
      type: String,
      enum: ['free', 'basic', 'pro', 'enterprise'],
      default: 'free',
    },

    isActive: { type: Boolean, default: true },
    mode: { type: String, default: 'Test' },

    apiKey: { type: String, select: false },
    

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  

    // Social
    facebookPageId: String,
    facebookPageToken: String,
    telegramBotToken: String,
    telegramChannel: String,
  },
  {
    timestamps: true, // ← This gives you createdAt & updatedAt automatically
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);
merchantSchema.virtual('publicWebsite').get(function () {
  if (this.customDomain && this.customDomainVerified) {
    return `https://${this.customDomain}`;
  }
  return `https://${this.slug}.menuroom.et`; // Change to your domain
});

// ─────── VIRTUAL: Branches ───────
merchantSchema.virtual('branches', {
  ref: 'Branch',
  localField: '_id',
  foreignField: 'merchant',
});
// Indexes
merchantSchema.index({ location: '2dsphere' });
merchantSchema.index({ status: 1, isActive: 1 });
merchantSchema.index({ subscriptionPlan: 1 });
merchantSchema.index({ 'location.city': 1, 'location.subCity': 1 });

// Virtuals
merchantSchema.virtual('users', {
  ref: 'User',
  localField: '_id',
  foreignField: 'merchant',
});

merchantSchema.virtual('orderCount', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'merchant',
  count: true,
});

// Methods
merchantSchema.methods.canAcceptOrders = function () {
  return this.status === 'approved' && this.isActive === true;
};

merchantSchema.methods.getDisplayName = function () {
  return this.businessName || 'Unnamed Merchant';
};

// Ensure qr_secret_key is always set
merchantSchema.pre('save', function (next) {
  if (!this.qr_secret_key) {
    this.qr_secret_key = crypto.randomBytes(64).toString('hex');
  }
  next();
});

const Merchant = mongoose.model('Merchant', merchantSchema);
module.exports = Merchant;
