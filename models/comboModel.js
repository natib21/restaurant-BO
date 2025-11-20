// models/comboModel.js
const mongoose = require('mongoose');

const comboItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  // Fallback in case the menu item is deleted later
  nameFallback: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
});

const comboSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Combo must have a name'],
      trim: true,
      maxlength: 100,
    },

    slug: String,

    description: {
      type: String,
      trim: true,
      maxlength: 600,
    },

    // What is actually included in this combo
    items: {
      type: [comboItemSchema],
      validate: [v => v.length > 0, 'Combo must include at least one item'],
    },

    // Pricing
    originalPrice: {
      type: Number,
      min: 0,
    },
    comboPrice: {
      type: Number,
      required: [true, 'Combo price is required'],
      min: [0.01, 'Combo price must be greater than zero'],
    },

    savingsAmount: {
      type: Number,
      default: function () {
        return this.originalPrice ? this.originalPrice - this.comboPrice : 0;
      },
    },
    savingsText: {
      type: String,
      default: function () {
        if (this.savingsAmount > 0) {
          return `Save ${this.savingsAmount.toFixed(2)}!`;
        }
        return null;
      },
    },

    // Visuals
    image: { type: String },
    bannerImage: { type: String },

    // Scheduling & Availability
    isActive: {
      type: Boolean,
      default: true,
    },

    validFrom: { type: Date },
    validUntil: { type: Date },

    availableOnDays: [
      {
        type: String,
        enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      },
    ],

    timeSlots: [
      {
        start: String, // "11:00"
        end: String,   // "15:00"
      },
    ],

    // Limits & Tracking
    maxPerOrder: {
      type: Number,
      default: 10,
      min: 1,
    },
    totalSold: {
      type: Number,
      default: 0,
    },

    // Display priority (higher = shown first in specials section)
    priority: {
      type: Number,
      default: 0,
    },

    tags: [String], // e.g., ["ramadan", "family-deal", "lunch-special", "bogo"]

    createdAt: {
      type: Date,
      default: Date.now,
      select: false,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========================= INDEXES =========================
comboSchema.index({ merchant: 1, isActive: 1 });
comboSchema.index({ merchant: 1, priority: -1 });
comboSchema.index({ 'validUntil': 1 });
comboSchema.index({ tags: 1 });

// ========================= MIDDLEWARE =========================
comboSchema.pre('save', function (next) {
  // Auto generate slug
  if (this.isModified('name') || !this.slug) {
    this.slug = require('slugify')(this.name, { lower: true }) + '-' + Date.now().toString(36);
  }

  // Update timestamp
  this.updatedAt = Date.now();

  // Auto-fill nameFallback when saving
  next();
});

// Pre-populate menuItem details + fallback name
comboSchema.pre(/^find/, function (next) {
  this.populate('items.menuItem');
  next();
});

module.exports = mongoose.model('Combo', comboSchema);