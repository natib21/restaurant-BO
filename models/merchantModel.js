const mongoose = require('mongoose');

const officialRepresentativeSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  email: {
    type: String,
    required: [true, 'Owner email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address'],
  },
  phone: {
    type: String,
    required: true,
    validate: {
      validator: v => /^\+?251[79]\d{8}$/.test(v.replace(/\s+/g, '')),
      message: 'Invalid Ethiopian phone number',
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
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]+$/i, 'Slug can only contain letters, numbers, and hyphens'],
    },
    customDomain: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      validate: {
        validator: v =>
          !v || /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(v),
        message: 'Invalid domain format',
      },
    },
    customDomainVerified: { type: Boolean, default: false },

    owner: officialRepresentativeSchema,

    sector: {
      type: String,
      enum: ['Cafe', 'Restaurant', 'Hotel', 'Food Truck', 'Ghost Kitchen', 'Bakery', 'Other'],
      default: 'Restaurant',
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: v => !v || /^\+?251[79]\d{8}$/.test(v.replace(/\s+/g, '')),
        message: 'Invalid phone number',
      },
    },
    tinId: { type: String, trim: true, uppercase: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'suspended', 'inactive'],
      default: 'pending',
    },
    cuisineType: { type: [String], default: [] },

    // BRANDING
    brandColor: {
      type: String,
      default: '#1A1A2E',
      match: [/^#[0-9A-Fa-f]{6}$/i, 'Invalid hex color'],
      uppercase: true,
    },
    logo: { url: String, public_id: String },
    coverImage: { url: String, public_id: String },

    // DEFAULT MENU (used by branches if not overridden)
    masterMenu: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Menu',
      default: null,
    },

    // COUNTER FOR BRANCH CODES
    branchCounter: { type: Number, default: 0 },
    location: {
      address: { type: String, trim: true }, // Physical address string
      city: { type: String, default: 'Addis Ababa' },
      subcity: String,
      woreda: String,
      // GeoJSON for Map integration

      coordinates: {
        type: [Number],
        default: [38.7578, 9.0192],
      },
    },
    // LEGAL & KYC
    tinId: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: v => !v || /^\d{10}$/.test(v), // Ethiopian TINs are usually 10 digits
        message: 'TIN number must be exactly 10 digits',
      },
    },
    tradeLicense: {
      licenseNumber: { type: String, trim: true },
      url: { type: String },
      public_id: { type: String },
      verified: { type: Boolean, default: false }, // Useful for admin approval
    },
    // SETTINGS (merchant-wide defaults)
    settings: {
      showTableNumberOnQR: { type: Boolean, default: true },
      qrStyle: { type: String, enum: ['classic', 'modern', 'rounded', 'dots'], default: 'modern' },
      qrLogoEnabled: { type: Boolean, default: true },
      qrForegroundColor: { type: String, default: '#000000', match: [/^#[0-9A-Fa-f]{6}$/i] },
      qrBackgroundColor: { type: String, default: '#FFFFFF', match: [/^#[0-9A-Fa-f]{6}$/i] },

      tipsEnabled: { type: Boolean, default: true },
      tipOptions: {
        type: [Number],
        default: [10, 15, 20],
        validate: [arr => arr.every(n => n > 0 && n <= 100), 'Tips must be 1–100%'],
      },
      allowCustomTip: { type: Boolean, default: true },

      language: { type: String, enum: ['en', 'am', 'both'], default: 'both' },
      defaultLanguage: { type: String, enum: ['en', 'am'], default: 'am' },

      notifications: {
        orderSoundEnabled: { type: Boolean, default: true },
        newOrderSound: { type: String, default: 'default' },
        smsNotifications: { type: Boolean, default: false },
        emailNotifications: { type: Boolean, default: true },
      },

      currency: { type: String, enum: ['ETB', 'USD'], default: 'ETB' },
      taxRate: { type: Number, default: 15, min: 0, max: 100 },
      serviceCharge: { type: Number, default: 0, min: 0, max: 100 },

      onlineOrderingEnabled: { type: Boolean, default: true },
      deliveryEnabled: { type: Boolean, default: false },
      pickupEnabled: { type: Boolean, default: true },
      autoAcceptOrders: { type: Boolean, default: false },
      requireWaiterConfirmation: { type: Boolean, default: false },
      prepTimeMinutes: { type: Number, default: 15, min: 5, max: 180 },
    },

    trialStartedAt: {
      type: Date,
      default: Date.now,
    },
    trialExpiresAt: {
      type: Date,
      default: function () {
        // Automatically set to 14 days from the moment of creation
        return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      },
    },
    isSubscriptionActive: {
      type: Boolean,
      default: false,
    },
    // Add this inside merchantSchema
    currentSubscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
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

    facebookPageId: String,
    facebookPageToken: String,
    telegramBotToken: String,
    telegramChannel: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

merchantSchema.virtual('trialDaysLeft').get(function () {
  if (!this.trialExpiresAt) return 0;
  const now = new Date();
  const diff = this.trialExpiresAt - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});
merchantSchema.virtual('hasActiveAccess').get(function () {
  const now = new Date();
  const isTrialValid = now <= this.trialExpiresAt;
  return this.status === 'approved' && this.isActive && (isTrialValid || this.isSubscriptionActive);
});
merchantSchema.virtual('publicWebsite').get(function () {
  if (this.customDomain && this.customDomainVerified) {
    return `https://${this.customDomain}`;
  }
  return `https://${this.slug}.menuroom.et`;
});

merchantSchema.virtual('subscriptionHistory', {
  ref: 'Subscription',
  localField: '_id',
  foreignField: 'merchant',
});
merchantSchema.virtual('branches', {
  ref: 'Branch',
  localField: '_id',
  foreignField: 'merchant',
});

merchantSchema.virtual('users', { ref: 'User', localField: '_id', foreignField: 'merchant' });
merchantSchema.virtual('orderCount', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'merchant',
  count: true,
});

// Methods
merchantSchema.methods.canAcceptOrders = function () {
  return this.hasActiveAccess;
};

merchantSchema.methods.getDisplayName = function () {
  return this.businessName || 'Unnamed Merchant';
};

merchantSchema.methods.getMainBranch = async function () {
  return await mongoose.model('Branch').findOne({ merchant: this._id, isMain: true });
};

const Merchant = mongoose.model('Merchant', merchantSchema);
module.exports = Merchant;
